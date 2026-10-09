import { TAU, clamp, closestOnSegment, segmentDistanceSq } from "./geom";
import { createRng, type Rng } from "./rng";
import type { Fighter, FighterDef, Hazard, Phase, SimEvent, WallHit } from "./types";

/** Arena is a square of ARENA x ARENA world units. */
export const ARENA = 720;
/** Fixed physics step. Frames are rendered at ~60 fps, so ~4 steps per frame. */
export const STEP = 1 / 240;

const INTRO_TIME = 1.6;
const KO_TIME = 0.5;
const KO_TIME_SCALE = 0.3;
/** Matches that last this long are decided on remaining HP. */
export const MATCH_LIMIT = 60;
/** After this many seconds damage ramps up so matches cannot stall. */
const ENRAGE_START = 14;
const MAX_SPEED = 1900;
/** Default rate (1/second) at which speed relaxes back to a fighter's cruising speed. */
export const DEFAULT_RELAX = 2.2;
const HURT_FLASH = 0.18;
const CLASH_COOLDOWN = 0.2;
const MAX_STEPS_PER_ADVANCE = 96;

/**
 * The whole match state. Pure simulation: no DOM, no Math.random, no clock.
 * Same seed + same fighters => same match.
 */
export class World {
  readonly size = ARENA;
  readonly seed: number;
  readonly rng: Rng;
  readonly fighters: Fighter[] = [];
  readonly damageDealt: number[];
  hazards: Hazard[] = [];
  /** Consumers (renderer) drain this each frame. */
  events: SimEvent[] = [];
  /** Seconds of fight clock (excludes intro and hit-stop). */
  time = 0;
  stepCount = 0;
  phase: Phase = "intro";
  /** Seconds spent in the current phase. */
  phaseTime = 0;
  /** Index of the winning fighter, or -1 while undecided. */
  winner = -1;
  /** 1 = normal speed; the KO moment slows time. */
  timeScale = 1;
  private freeze = 0;
  private acc = 0;
  private clashCooldown = 0;

  constructor(seed: number, defs: readonly FighterDef[]) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.damageDealt = defs.map(() => 0);

    const count = defs.length;
    const rotation = this.rng.range(0, TAU);
    const orbit = ARENA * 0.28;
    defs.forEach((def, i) => {
      const a = rotation + (i / count) * TAU;
      this.fighters.push({
        index: i,
        side: (i % 2) as 0 | 1,
        def,
        x: ARENA / 2 + Math.cos(a) * orbit,
        y: ARENA / 2 + Math.sin(a) * orbit,
        vx: 0,
        vy: 0,
        radius: def.radius,
        hp: def.hp,
        maxHp: def.hp,
        alive: true,
        angle: this.rng.range(0, TAU),
        spinDir: this.rng.sign(),
        hurt: 0,
        hitLock: defs.map(() => 0),
        ability: def.createAbility ? def.createAbility() : null,
        speedMul: 1,
        spinMul: 1,
        relax: DEFAULT_RELAX,
        noClash: false,
        trail: false,
      });
    });
  }

  emit(event: SimEvent): void {
    this.events.push(event);
  }

  removeHazard(hazard: Hazard): void {
    const i = this.hazards.indexOf(hazard);
    if (i >= 0) this.hazards.splice(i, 1);
  }

  /** Nearest living fighter on another team, or null. */
  nearestEnemy(of: Fighter): Fighter | null {
    let best: Fighter | null = null;
    let bestD = Infinity;
    for (const f of this.fighters) {
      if (!f.alive || f.side === of.side) continue;
      const d = (f.x - of.x) ** 2 + (f.y - of.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Damage multiplier that grows once a match drags on. */
  get enrage(): number {
    return 1 + Math.max(0, this.time - ENRAGE_START) * 0.1;
  }

  /**
   * The one place damage is applied: HP, flash, knockback, hit-stop and the event.
   * Returns the damage actually dealt (0 outside the fight phase).
   */
  dealDamage(
    attacker: Fighter,
    target: Fighter,
    amount: number,
    x: number,
    y: number,
    knockback = 0,
  ): number {
    if (this.phase !== "fight" || !target.alive) return 0;
    const dmg = Math.max(1, Math.round(amount * this.enrage));
    target.hp -= dmg;
    target.hurt = HURT_FLASH;
    this.damageDealt[attacker.index] = (this.damageDealt[attacker.index] ?? 0) + dmg;
    this.emit({ type: "hit", attacker: attacker.index, target: target.index, damage: dmg, x, y });

    if (knockback > 0) {
      let dx = target.x - attacker.x;
      let dy = target.y - attacker.y;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      target.vx += dx * knockback;
      target.vy += dy * knockback;
      attacker.vx -= dx * knockback * 0.2;
      attacker.vy -= dy * knockback * 0.2;
      limitSpeed(target);
      limitSpeed(attacker);
    }

    this.freeze = Math.max(this.freeze, clamp(0.016 + dmg * 0.003, 0.02, 0.1));
    return dmg;
  }

  /** Advance by real time. Runs as many fixed steps as fit. */
  advance(dt: number): void {
    this.acc += dt * this.timeScale;
    let guard = 0;
    while (this.acc >= STEP && guard < MAX_STEPS_PER_ADVANCE) {
      this.acc -= STEP;
      this.step();
      guard++;
    }
    if (guard === MAX_STEPS_PER_ADVANCE) this.acc = 0;
  }

  /** Cheap fingerprint of the current state, for determinism checks. */
  hash(): string {
    let h = 0x811c9dc5;
    const mix = (n: number) => {
      const v = Math.round(n * 1000) | 0;
      for (let shift = 0; shift < 32; shift += 8) {
        h = Math.imul(h ^ ((v >>> shift) & 0xff), 16777619);
      }
    };
    mix(this.stepCount);
    mix(this.winner);
    for (const f of this.fighters) {
      mix(f.x);
      mix(f.y);
      mix(f.vx);
      mix(f.vy);
      mix(f.hp);
      mix(f.angle);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  private step(): void {
    this.stepCount++;
    if (this.freeze > 0) {
      this.freeze -= STEP;
      return;
    }
    const dt = STEP;
    this.phaseTime += dt;

    if (this.phase === "intro") {
      for (const f of this.fighters) f.angle += f.def.spin * f.spinDir * dt;
      if (this.phaseTime >= INTRO_TIME) this.startFight();
      return;
    }

    if (this.phase === "fight") this.time += dt;

    for (const f of this.fighters) {
      if (f.alive && f.ability?.onTick) f.ability.onTick(this, f, dt);
    }
    for (const f of this.fighters) if (f.alive) this.move(f, dt);
    for (const f of this.fighters) if (f.alive) this.bounceWalls(f);
    this.collideBodies();
    if (this.phase === "fight") this.weapons();

    this.clashCooldown = Math.max(0, this.clashCooldown - dt);
    for (const f of this.fighters) {
      f.hurt = Math.max(0, f.hurt - dt);
      for (let i = 0; i < f.hitLock.length; i++) {
        f.hitLock[i] = Math.max(0, (f.hitLock[i] ?? 0) - dt);
      }
    }

    if (this.phase === "fight") this.checkEnd();
    else if (this.phase === "ko" && this.phaseTime >= KO_TIME) {
      this.phase = "over";
      this.phaseTime = 0;
      this.timeScale = 1;
    }
  }

  private startFight(): void {
    this.phase = "fight";
    this.phaseTime = 0;
    for (const f of this.fighters) {
      const enemy = this.nearestEnemy(f);
      const aim = enemy ? Math.atan2(enemy.y - f.y, enemy.x - f.x) : this.rng.range(0, TAU);
      const heading = aim + this.rng.range(-1.1, 1.1);
      f.vx = Math.cos(heading) * f.def.baseSpeed;
      f.vy = Math.sin(heading) * f.def.baseSpeed;
    }
    this.emit({ type: "fight" });
  }

  private move(f: Fighter, dt: number): void {
    const speed = Math.hypot(f.vx, f.vy);
    const target = f.def.baseSpeed * f.speedMul;
    const next = speed + (target - speed) * Math.min(1, f.relax * dt);
    if (speed < 1e-3) {
      f.vx = Math.cos(f.angle) * next;
      f.vy = Math.sin(f.angle) * next;
    } else {
      const k = next / speed;
      f.vx *= k;
      f.vy *= k;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.angle += f.def.spin * f.spinDir * f.spinMul * dt;
  }

  private bounceWalls(f: Fighter): void {
    let hit: WallHit | null = null;
    if (f.x - f.radius < 0) {
      f.x = f.radius;
      if (f.vx < 0) {
        f.vx = -f.vx;
        hit = { x: 0, y: f.y, nx: 1, ny: 0 };
      }
    } else if (f.x + f.radius > ARENA) {
      f.x = ARENA - f.radius;
      if (f.vx > 0) {
        f.vx = -f.vx;
        hit = { x: ARENA, y: f.y, nx: -1, ny: 0 };
      }
    }
    if (f.y - f.radius < 0) {
      f.y = f.radius;
      if (f.vy < 0) {
        f.vy = -f.vy;
        hit ??= { x: f.x, y: 0, nx: 0, ny: 1 };
      }
    } else if (f.y + f.radius > ARENA) {
      f.y = ARENA - f.radius;
      if (f.vy > 0) {
        f.vy = -f.vy;
        hit ??= { x: f.x, y: ARENA, nx: 0, ny: -1 };
      }
    }
    if (hit) {
      this.emit({ type: "wall", fighter: f.index, x: hit.x, y: hit.y });
      f.ability?.onWallHit?.(this, f, hit);
    }
  }

  /** Bodies bounce off each other like billiard balls. No damage from this. */
  private collideBodies(): void {
    const fs = this.fighters;
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!a || !a.alive) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!b || !b.alive) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        dx /= d;
        dy /= d;

        const invA = 1 / a.def.mass;
        const invB = 1 / b.def.mass;
        const overlap = min - d;
        a.x -= dx * overlap * (invA / (invA + invB));
        a.y -= dy * overlap * (invA / (invA + invB));
        b.x += dx * overlap * (invB / (invA + invB));
        b.y += dy * overlap * (invB / (invA + invB));

        const closing = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
        if (closing < 0) {
          const impulse = (-2 * closing) / (invA + invB);
          a.vx -= impulse * invA * dx;
          a.vy -= impulse * invA * dy;
          b.vx += impulse * invB * dx;
          b.vy += impulse * invB * dy;
          limitSpeed(a);
          limitSpeed(b);
          if (-closing > 200) {
            this.emit({
              type: "bump",
              x: a.x + dx * a.radius,
              y: a.y + dy * a.radius,
              strength: -closing,
            });
          }
        }
      }
    }
  }

  /** Weapon vs weapon (clash) first, then weapon vs body (damage). */
  private weapons(): void {
    const fs = this.fighters;
    const clashed = new Set<number>();

    if (this.clashCooldown <= 0) {
      for (let i = 0; i < fs.length && this.clashCooldown <= 0; i++) {
        const a = fs[i];
        if (!a || !a.alive || a.noClash) continue;
        for (let j = i + 1; j < fs.length; j++) {
          const b = fs[j];
          if (!b || !b.alive || b.noClash || a.side === b.side) continue;
          const sa = weaponSegment(a);
          const sb = weaponSegment(b);
          const reach = (a.def.thickness + b.def.thickness) / 2;
          if (
            segmentDistanceSq(sa.x0, sa.y0, sa.x1, sa.y1, sb.x0, sb.y0, sb.x1, sb.y1) >
            reach ** 2
          )
            continue;
          a.spinDir = (a.spinDir * -1) as 1 | -1;
          b.spinDir = (b.spinDir * -1) as 1 | -1;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
          a.vx -= dx * 140;
          a.vy -= dy * 140;
          b.vx += dx * 140;
          b.vy += dy * 140;
          this.clashCooldown = CLASH_COOLDOWN;
          this.freeze = Math.max(this.freeze, 0.03);
          clashed.add(i * 64 + j);
          this.emit({
            type: "clash",
            x: (sa.x1 + sb.x1) / 2,
            y: (sa.y1 + sb.y1) / 2,
          });
          break;
        }
      }
    }

    for (const a of fs) {
      if (!a.alive) continue;
      for (const t of fs) {
        if (!t.alive || a.side === t.side || (a.hitLock[t.index] ?? 0) > 0) continue;
        if (clashed.has(Math.min(a.index, t.index) * 64 + Math.max(a.index, t.index))) continue;
        const seg = weaponSegment(a);
        const cp = closestOnSegment(t.x, t.y, seg.x0, seg.y0, seg.x1, seg.y1);
        const reach = t.radius + a.def.thickness / 2;
        if (cp.d2 > reach * reach) continue;

        const dist = Math.sqrt(cp.d2) || 1;
        const px = t.x + ((cp.x - t.x) / dist) * Math.min(dist, t.radius);
        const py = t.y + ((cp.y - t.y) / dist) * Math.min(dist, t.radius);
        const ab = a.ability;
        const dmg = a.def.damage * (ab?.damageMultiplier?.(a) ?? 1);
        const kb = a.def.knockback * (ab?.knockbackMultiplier?.(a) ?? 1);
        const dealt = this.dealDamage(a, t, dmg, px, py, kb);
        a.hitLock[t.index] = a.def.hitInterval;
        if (dealt > 0) ab?.onHitDealt?.(this, a, t, dealt);
      }
    }
  }

  private checkEnd(): void {
    for (const f of this.fighters) {
      if (f.alive && f.hp <= 0) {
        f.alive = false;
        f.trail = false;
        // Whatever the loser had in play (hooks, pylons, arcs) disappears with them.
        this.hazards = this.hazards.filter((h) => h.owner !== f.index);
        this.emit({ type: "ko", fighter: f.index, x: f.x, y: f.y });
      }
    }

    const sidesAlive = new Set<number>();
    for (const f of this.fighters) if (f.alive) sidesAlive.add(f.side);

    if (sidesAlive.size <= 1) {
      this.finish(this.pickWinner());
    } else if (this.time >= MATCH_LIMIT) {
      this.emit({ type: "timeUp" });
      this.finish(this.pickWinner());
    }
  }

  /** Last one standing; otherwise the healthiest (ties broken by the seeded rng). */
  private pickWinner(): number {
    let best = -1;
    let bestScore = -Infinity;
    for (const f of this.fighters) {
      const score = (f.alive ? 1000 : 0) + f.hp / f.maxHp;
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = f.index;
      } else if (Math.abs(score - bestScore) <= 1e-9 && this.rng.next() < 0.5) {
        best = f.index;
      }
    }
    return best;
  }

  private finish(winner: number): void {
    this.winner = winner;
    this.phase = "ko";
    this.phaseTime = 0;
    this.timeScale = KO_TIME_SCALE;
  }
}

function weaponSegment(f: Fighter): { x0: number; y0: number; x1: number; y1: number } {
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  return {
    x0: f.x + c * f.radius,
    y0: f.y + s * f.radius,
    x1: f.x + c * (f.radius + f.def.reach),
    y1: f.y + s * (f.radius + f.def.reach),
  };
}

function limitSpeed(f: Fighter): void {
  const speed = Math.hypot(f.vx, f.vy);
  if (speed > MAX_SPEED) {
    f.vx = (f.vx / speed) * MAX_SPEED;
    f.vy = (f.vy / speed) * MAX_SPEED;
  }
}

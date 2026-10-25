import { TAU, clamp, closestOnSegment, segmentDistanceSq } from "./geom";
import { createRng, type Rng } from "./rng";
import type { Boost, Fighter, FighterDef, Hazard, Phase, SimEvent, WallHit } from "./types";
import { updateUnits } from "./units";

/** Arena is a square of ARENA x ARENA world units. */
export const ARENA = 720;
/** Fixed physics step. Frames are rendered at ~60 fps, so ~4 steps per frame. */
export const STEP = 1 / 240;

const INTRO_TIME = 0.8;
/**
 * History mode: longer intro for the "who wins?" card and the "pick your side!"
 * countdown. Nothing random happens during the intro, so fights play out the same.
 */
export const HISTORY_INTRO_TIME = 0.25;
/** Domain Expansion timeline (fight seconds) and the clash length. */
/** Domain Expansion is switched off for now: the shorts read better without it. */
export const DOMAINS_ON = false;
export const DOMAIN_FIRST_AT = 15;
export const DOMAIN_SECOND_AT = 16.5;
export const DOMAIN_CLASH_TIME = 2.5;
/** The guaranteed hit a winning domain lands on the enemy. */
const DOMAIN_HIT = 45;

export type DomainPhase = "none" | "expanding" | "clash" | "owned";

export interface DomainState {
  phase: DomainPhase;
  /** Fighter who opened first / answered (-1 when none). */
  first: number;
  second: number;
  /** Winner once owned. */
  owner: number;
  /** Seconds in the current phase. */
  t: number;
  /** Clash: damage dealt by first and second since the clash began. */
  clashDealt: [number, number];
  /** -1..1: who is winning the clash (+ = first). */
  push: number;
  /** Clash divider: direction from first to second at the start, and the midpoint. */
  axisX: number;
  axisY: number;
  midX: number;
  midY: number;
  cracked: boolean;
  shattered: boolean;
}

export const NO_BOOST: Readonly<Boost> = { damage: 1, guard: 1, speed: 1, skillRate: 1 };

/** Night attack: seconds of darkness, and how long it takes to fade in and out. */
export const NIGHT_TIME = 2.7;
export const NIGHT_FADE_IN = 0.25;
export const NIGHT_FADE_OUT = 0.3;

/** How dark a night attack makes the arena (0..1) with `left` seconds of it remaining. */
export function nightStrength(left: number): number {
  if (left <= 0) return 0;
  return clamp(left / NIGHT_FADE_OUT, 0, 1) * clamp((NIGHT_TIME - left) / NIGHT_FADE_IN, 0, 1);
}

/** Intro seconds at which the pick-your-side countdown says 3, 2, 1. */
export const COUNTDOWN_AT = [1.4, 1.8, 2.2] as const;
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
/** Seconds between poison damage ticks. */
const POISON_TICK = 0.25;
/** Ultimate intro: the world runs at ULT_TIME_SCALE for ULT_CINEMATIC sim-seconds. */
export const ULT_CINEMATIC = 0.2;
const ULT_TIME_SCALE = 0.2;
/** Fraction of max HP at which a leader's ultimate fires. */
export const ULT_HP = 0.3;
/** Close calls: two bodies rush past within NEAR_GAP of each other without touching. */
const NEAR_GAP = 19;
/** ...while closing in on each other at least this fast (units/second). */
const NEAR_SPEED = 380;
/** The gap has to open up past this again before the next close call can count. */
const FAR_GAP = 60;
const CLOSE_CALL_COOLDOWN = 0.8;
/** A close call slows time briefly so the viewer sees it. */
const CLOSE_CALL_SLOWMO = 0.09;
const CLOSE_CALL_TIME_SCALE = 0.35;
/** Close calls needed to trigger a frenzy. */
export const CLOSE_CALLS_FOR_FRENZY = 3;
/** Frenzy: the arena shrinks to FRENZY_SIZE of its width and everyone speeds up. */
export const FRENZY_TIME = 4;
const FRENZY_SIZE = 0.75;
const FRENZY_RAMP = 0.4;
const FRENZY_SPEED = 1.25;
/** Stunned fighters cruise at this fraction of their speed. */
const STUN_SLOW = 0.3;
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
  /** History mode only: close calls count up to a frenzy. */
  readonly closeCallsEnabled: boolean;
  /** Any leader here has a Domain Expansion. */
  readonly domainsEnabled: boolean;
  /** Seconds before the fight starts. */
  readonly introTime: number;
  closeCalls = 0;
  /** Seconds of frenzy left (0 = none). */
  frenzy = 0;
  /** Renderer hint: seconds left of a "night attack" (the arena goes dark). */
  darkness = 0;
  /** Current walls: the arena spans lo..hi on both axes (shrinks during a frenzy). */
  lo = 0;
  hi = ARENA;
  private closeCallCooldown = 0;
  private gapTouched = false;
  private prevGap = Infinity;
  /** Closest gap during the current approach and how fast they were closing then. */
  private approachMin = Infinity;
  private approachSpeed = 0;
  private approachX = 0;
  private approachY = 0;
  /** Sim-seconds of close-call slow motion left. */
  private slowmo = 0;
  /** An ultimate's (or a domain's) slow-motion intro in progress (history mode). */
  cinematic: {
    fighter: number;
    name: string;
    t: number;
    cast: () => void;
    kind: "ultimate" | "domain";
  } | null = null;
  /** Domain Expansion progress (history mode). */
  domain: DomainState = {
    phase: "none",
    first: -1,
    second: -1,
    owner: -1,
    t: 0,
    clashDealt: [0, 0],
    push: 0,
    axisX: 1,
    axisY: 0,
    midX: ARENA / 2,
    midY: ARENA / 2,
    cracked: false,
    shattered: false,
  };
  private clashStart: number[] = [];
  private freeze = 0;
  private acc = 0;
  private clashCooldown = 0;

  constructor(seed: number, defs: readonly FighterDef[]) {
    this.seed = seed;
    this.rng = createRng(seed);
    this.damageDealt = defs.map(() => 0);
    this.closeCallsEnabled = defs.some((d) => d.growth);
    this.domainsEnabled = DOMAINS_ON && defs.some((d) => d.domain);
    this.introTime = this.closeCallsEnabled ? HISTORY_INTRO_TIME : INTRO_TIME;

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
        damageTakenMul: 1,
        damageMul: 1,
        boost: { ...NO_BOOST },
        whirl: 0,
        shielded: false,
        stun: 0,
        poison: 0,
        poisonDps: 0,
        poisonBy: -1,
        poisonAcc: 0,
        reflectUntil: 0,
        slam: 0,
        slamBy: -1,
        slamDamage: 0,
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

  /** Restores HP (never above max) and reports it. Returns the amount healed. */
  heal(f: Fighter, amount: number): number {
    if (this.phase !== "fight" || !f.alive) return 0;
    const healed = Math.min(Math.round(amount), Math.floor(f.maxHp - f.hp));
    if (healed <= 0) return 0;
    f.hp += healed;
    this.emit({ type: "heal", fighter: f.index, amount: healed });
    return healed;
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

  /** Multiplier on everything `f` deals: its own growth if it has one, else enrage. */
  power(f: Fighter): number {
    const g = f.def.growth;
    return g ? 1 + g.perSecond * Math.floor(this.time) : this.enrage;
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
    opts: DamageOptions = {},
  ): number {
    if (this.phase !== "fight" || !target.alive) return 0;
    // Shields lower damage; piercing hits ignore part of that reduction.
    const pierce = clamp(opts.pierce ?? 0, 0, 1);
    const taken = target.damageTakenMul + (1 - target.damageTakenMul) * pierce;
    const dmg = Math.max(
      1,
      Math.round(
        amount *
          this.power(attacker) *
          attacker.damageMul *
          attacker.boost.damage *
          taken *
          target.boost.guard,
      ),
    );
    target.hp -= dmg;
    target.hurt = HURT_FLASH;
    this.damageDealt[attacker.index] = (this.damageDealt[attacker.index] ?? 0) + dmg;
    this.emit({
      type: "hit",
      attacker: attacker.index,
      target: target.index,
      damage: dmg,
      x,
      y,
      ...(opts.dot ? { dot: true } : {}),
    });
    target.ability?.onDamaged?.(this, target, attacker, dmg);
    if (opts.dot) return dmg;

    if (knockback > 0) {
      let dx = target.x - (opts.fromX ?? attacker.x);
      let dy = target.y - (opts.fromY ?? attacker.y);
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

  /**
   * Starts an ultimate: slow motion while the name is shown, then `cast` runs.
   * Returns false when another ultimate is already playing.
   */
  beginUltimate(f: Fighter, name: string, cast: () => void): boolean {
    if (this.cinematic || this.phase !== "fight") return false;
    this.cinematic = { fighter: f.index, name, t: 0, cast, kind: "ultimate" };
    this.timeScale = ULT_TIME_SCALE;
    this.emit({ type: "ultimate", fighter: f.index, name });
    return true;
  }

  /**
   * Counts a close call at (x, y). Five of them start a frenzy. Ignored outside the
   * fight, during a frenzy, or right after the previous one.
   */
  closeCall(x: number, y: number): void {
    if (!this.closeCallsEnabled || this.phase !== "fight" || this.frenzy > 0) return;
    if (this.closeCallCooldown > 0) return;
    this.closeCallCooldown = CLOSE_CALL_COOLDOWN;
    this.closeCalls++;
    this.emit({ type: "nearMiss", x, y, count: this.closeCalls });
    if (!this.cinematic) {
      this.slowmo = CLOSE_CALL_SLOWMO;
      this.timeScale = CLOSE_CALL_TIME_SCALE;
    }
    if (this.closeCalls >= CLOSE_CALLS_FOR_FRENZY) {
      this.closeCalls = 0;
      this.frenzy = FRENZY_TIME;
      this.emit({ type: "frenzy", on: true });
    }
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
      if (this.introTime > INTRO_TIME) {
        COUNTDOWN_AT.forEach((at, i) => {
          if (this.phaseTime >= at && this.phaseTime - dt < at) {
            this.emit({ type: "countdown", n: COUNTDOWN_AT.length - i });
          }
        });
      }
      if (this.phaseTime >= this.introTime) this.startFight();
      return;
    }

    if (this.phase === "fight") this.time += dt;
    this.updateFrenzy(dt);
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      if (this.slowmo === 0 && !this.cinematic && this.phase === "fight") this.timeScale = 1;
    }

    for (const f of this.fighters) {
      if (f.alive) this.statusEffects(f, dt);
      // A stunned fighter's ability is frozen in place.
      if (f.alive && this.phase === "fight") f.ability?.passive?.(this, f, dt);
      if (f.alive && f.stun <= 0 && f.ability?.onTick) f.ability.onTick(this, f, dt);
    }
    for (const f of this.fighters) if (f.alive) this.move(f, dt);
    for (const f of this.fighters) if (f.alive) this.bounceWalls(f);
    this.collideBodies();
    if (this.phase === "fight") this.weapons();
    updateUnits(this, dt);
    // Body and soldier pushes come after the wall bounce; keep every fighter inside.
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.x = clamp(f.x, this.lo + f.radius, this.hi - f.radius);
      f.y = clamp(f.y, this.lo + f.radius, this.hi - f.radius);
    }
    if (this.closeCallsEnabled) this.watchCloseCalls(dt);
    if (this.phase === "fight" && this.domainsEnabled) this.updateDomain(dt);

    this.clashCooldown = Math.max(0, this.clashCooldown - dt);
    for (const f of this.fighters) {
      f.hurt = Math.max(0, f.hurt - dt);
      for (let i = 0; i < f.hitLock.length; i++) {
        f.hitLock[i] = Math.max(0, (f.hitLock[i] ?? 0) - dt);
      }
    }

    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      if (c.t >= ULT_CINEMATIC || this.phase !== "fight") {
        this.cinematic = null;
        if (this.phase === "fight") {
          this.timeScale = 1;
          const caster = this.fighters[c.fighter];
          if (caster?.alive) {
            c.cast();
            if (c.kind === "ultimate") {
              this.emit({ type: "ultimateCast", fighter: c.fighter, name: c.name });
            }
          }
        }
      }
    }

    if (this.phase === "fight") this.checkEnd();
    else if (this.phase === "ko" && this.phaseTime >= KO_TIME) {
      this.phase = "over";
      this.phaseTime = 0;
      this.timeScale = 1;
    }
  }

  /** Domain Expansion: who opens when, the clash, and the winner's lasting rule. */
  private updateDomain(dt: number): void {
    const d = this.domain;
    // Someone fell this step: let checkEnd finish the match before any domain moves.
    if (this.fighters.some((f) => f.alive && f.hp <= 0)) return;
    d.t += dt;
    const holders = this.fighters.filter((f) => f.alive && f.def.domain);
    if (d.phase === "none") {
      if (this.time < DOMAIN_FIRST_AT || this.cinematic || holders.length === 0) return;
      // Whoever is behind on HP opens first.
      let first = holders[0];
      for (const f of holders.slice(1)) {
        if (!first) break;
        const a = f.hp / f.maxHp;
        const b = first.hp / first.maxHp;
        if (a < b - 1e-9 || (Math.abs(a - b) <= 1e-9 && this.rng.next() < 0.5)) first = f;
      }
      if (!first) return;
      const opener = first;
      this.openDomain(opener, () => {
        d.phase = "expanding";
        d.first = opener.index;
        d.t = 0;
        d.cracked = true;
        this.emit({ type: "cracks" });
      });
      return;
    }
    if (d.phase === "expanding") {
      if (this.time < DOMAIN_SECOND_AT || this.cinematic) return;
      const first = this.fighters[d.first];
      if (!first?.alive) return;
      const second = holders.find((f) => f.index !== d.first);
      if (!second) {
        this.winDomain(first);
        return;
      }
      this.openDomain(second, () => {
        d.phase = "clash";
        d.second = second.index;
        d.t = 0;
        this.clashStart = [...this.damageDealt];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const len = Math.hypot(dx, dy) || 1;
        d.axisX = dx / len;
        d.axisY = dy / len;
        d.midX = clamp((first.x + second.x) / 2, ARENA * 0.25, ARENA * 0.75);
        d.midY = clamp((first.y + second.y) / 2, ARENA * 0.25, ARENA * 0.75);
        this.emit({ type: "domainClash" });
      });
      return;
    }
    if (d.phase === "clash") {
      const a = d.first;
      const b = d.second;
      const da = (this.damageDealt[a] ?? 0) - (this.clashStart[a] ?? 0);
      const db = (this.damageDealt[b] ?? 0) - (this.clashStart[b] ?? 0);
      d.clashDealt = [da, db];
      d.push = clamp((da - db) / (da + db + 60), -1, 1);
      if (d.t < DOMAIN_CLASH_TIME || this.cinematic) return;
      const fa = this.fighters[a];
      const fb = this.fighters[b];
      if (!fa || !fb) return;
      let winner = da > db ? fa : fb;
      if (da === db) {
        const ra = fa.hp / fa.maxHp;
        const rb = fb.hp / fb.maxHp;
        winner = ra > rb ? fa : rb > ra ? fb : this.rng.next() < 0.5 ? fa : fb;
      }
      if (!winner.alive) winner = winner === fa ? fb : fa;
      this.winDomain(winner);
      return;
    }
    // Owned: the winner's domain rule runs until the end.
    const owner = this.fighters[d.owner];
    if (owner?.alive) owner.def.domain?.tick?.(this, owner, dt, d.t);
  }

  private openDomain(f: Fighter, onOpen: () => void): void {
    const name = f.def.domain?.name ?? "";
    this.cinematic = {
      fighter: f.index,
      name,
      t: 0,
      kind: "domain",
      cast: () => {
        onOpen();
        this.emit({ type: "domainOpen", fighter: f.index, name });
      },
    };
    this.timeScale = ULT_TIME_SCALE;
    this.emit({ type: "domainCast", fighter: f.index, name });
  }

  private winDomain(f: Fighter): void {
    const d = this.domain;
    const spec = f.def.domain;
    d.phase = "owned";
    d.owner = f.index;
    d.t = 0;
    d.cracked = true;
    d.shattered = true;
    this.emit({ type: "wallsShatter" });
    this.emit({ type: "domainWon", fighter: f.index, name: spec?.name ?? "" });
    if (!spec) return;
    Object.assign(f.boost, spec.buff ?? {});
    const enemy = this.nearestEnemy(f);
    if (enemy) {
      Object.assign(enemy.boost, spec.curse ?? {});
      // Sure hit: the domain's first blow always lands.
      this.dealDamage(f, enemy, DOMAIN_HIT, enemy.x, enemy.y, 380, { fromX: f.x, fromY: f.y });
      this.emit({
        type: "domainHit",
        fighter: f.index,
        target: enemy.index,
        x: enemy.x,
        y: enemy.y,
      });
    }
    spec.onWin?.(this, f);
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

  private statusEffects(f: Fighter, dt: number): void {
    if (f.stun > 0) f.stun = Math.max(0, f.stun - dt);
    if (f.slam > 0) f.slam = Math.max(0, f.slam - dt);
    if (f.poison <= 0) return;
    f.poison = Math.max(0, f.poison - dt);
    // Poison builds up and is dealt in whole points about four times a second.
    f.poisonAcc += f.poisonDps * dt;
    if (f.poisonAcc >= Math.max(1, f.poisonDps * POISON_TICK)) {
      const amount = Math.floor(f.poisonAcc);
      f.poisonAcc -= amount;
      const by = this.fighters[f.poisonBy];
      if (by) this.dealDamage(by, f, amount, f.x, f.y, 0, { dot: true });
    }
    if (f.poison === 0) f.poisonAcc = 0;
  }

  private updateFrenzy(dt: number): void {
    if (this.darkness > 0) this.darkness = Math.max(0, this.darkness - dt);
    if (this.frenzy > 0 && this.phase === "fight") {
      this.frenzy = Math.max(0, this.frenzy - dt);
      if (this.frenzy === 0) this.emit({ type: "frenzy", on: false });
    } else if (this.phase !== "fight") {
      this.frenzy = 0;
    }
    // Walls slide in over FRENZY_RAMP seconds, hold, then slide back out.
    const elapsed = FRENZY_TIME - this.frenzy;
    const k = this.frenzy <= 0 ? 0 : Math.min(1, elapsed / FRENZY_RAMP, this.frenzy / FRENZY_RAMP);
    const inset = ((1 - FRENZY_SIZE) / 2) * ARENA * k * k * (3 - 2 * k);
    this.lo = inset;
    this.hi = ARENA - inset;
  }

  /**
   * A close call: the two leaders rush at each other and miss by a hair. Measured at
   * the closest point of each approach: tiny gap, high closing speed, no touch, and
   * neither of them stunned (drifting side by side does not count).
   */
  private watchCloseCalls(dt: number): void {
    this.closeCallCooldown = Math.max(0, this.closeCallCooldown - dt);
    const [a, b] = this.fighters;
    if (!a || !b || !a.alive || !b.alive || a.side === b.side) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const gap = d - a.radius - b.radius;
    if (gap <= 0) this.gapTouched = true;
    if (gap < this.approachMin) {
      this.approachMin = gap;
      // Closing speed: how fast they are moving toward each other right now.
      this.approachSpeed = Math.hypot(b.vx - a.vx, b.vy - a.vy);
      const k = a.radius / (a.radius + b.radius);
      this.approachX = a.x + dx * k;
      this.approachY = a.y + dy * k;
    }
    // Just passed the closest point of this approach.
    if (gap > this.prevGap && this.prevGap === this.approachMin) {
      const free = a.stun <= 0 && b.stun <= 0 && !this.cinematic;
      if (
        free &&
        !this.gapTouched &&
        this.approachMin > 0 &&
        this.approachMin < NEAR_GAP &&
        this.approachSpeed > NEAR_SPEED
      ) {
        this.closeCall(this.approachX, this.approachY);
      }
    }
    if (gap > FAR_GAP) {
      this.gapTouched = false;
      this.approachMin = Infinity;
    }
    this.prevGap = gap;
  }

  private move(f: Fighter, dt: number): void {
    const speed = Math.hypot(f.vx, f.vy);
    const boost = this.frenzy > 0 ? FRENZY_SPEED : 1;
    const target =
      f.def.baseSpeed * f.speedMul * f.boost.speed * boost * (f.stun > 0 ? STUN_SLOW : 1);
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
    if (f.x - f.radius < this.lo) {
      f.x = this.lo + f.radius;
      if (f.vx < 0) {
        f.vx = -f.vx;
        hit = { x: this.lo, y: f.y, nx: 1, ny: 0 };
      }
    } else if (f.x + f.radius > this.hi) {
      f.x = this.hi - f.radius;
      if (f.vx > 0) {
        f.vx = -f.vx;
        hit = { x: this.hi, y: f.y, nx: -1, ny: 0 };
      }
    }
    if (f.y - f.radius < this.lo) {
      f.y = this.lo + f.radius;
      if (f.vy < 0) {
        f.vy = -f.vy;
        hit ??= { x: f.x, y: this.lo, nx: 0, ny: 1 };
      }
    } else if (f.y + f.radius > this.hi) {
      f.y = this.hi - f.radius;
      if (f.vy > 0) {
        f.vy = -f.vy;
        hit ??= { x: f.x, y: this.hi, nx: 0, ny: -1 };
      }
    }
    if (hit) {
      this.emit({ type: "wall", fighter: f.index, x: hit.x, y: hit.y });
      const by = this.fighters[f.slamBy];
      if (f.slam > 0 && by) {
        f.slam = 0;
        this.dealDamage(by, f, f.slamDamage, hit.x, hit.y);
        f.stun = Math.max(f.stun, 1);
        this.emit({ type: "slam", fighter: f.index, x: hit.x, y: hit.y });
        this.emit({ type: "stun", fighter: f.index });
      }
      f.ability?.onWallHit?.(this, f, hit);
    }
  }

  /** Bodies bounce off each other like billiard balls; weaponless fighters hurt on contact. */
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

        if (this.phase === "fight" && a.side !== b.side) {
          const cx = a.x + dx * a.radius;
          const cy = a.y + dy * a.radius;
          this.touch(a, b, cx, cy);
          this.touch(b, a, cx, cy);
        }

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

  /** Contact damage from `a` to `b`, if `a` has any and is not on cooldown. */
  private touch(a: Fighter, b: Fighter, x: number, y: number): void {
    const base = a.def.contactDamage;
    if (!base || !a.alive || (a.hitLock[b.index] ?? 0) > 0) return;
    const ab = a.ability;
    const dmg = base * (ab?.damageMultiplier?.(a) ?? 1);
    const kb = a.def.knockback * (ab?.knockbackMultiplier?.(a) ?? 1);
    const pierce = ab?.shieldPierce?.(a) ?? 0;
    const dealt = this.dealDamage(a, b, dmg, x, y, kb, pierce > 0 ? { pierce } : {});
    a.hitLock[b.index] = a.def.contactInterval ?? 0.5;
    if (dealt > 0) ab?.onHitDealt?.(this, a, b, dealt);
  }

  /** Weapon vs weapon (clash) first, then weapon vs body (damage). */
  private weapons(): void {
    const fs = this.fighters;
    // At most one clash can happen per step, so two indices are enough.
    let clashA = -1;
    let clashB = -1;

    if (this.clashCooldown <= 0) {
      for (let i = 0; i < fs.length && this.clashCooldown <= 0; i++) {
        const a = fs[i];
        if (!a || !a.alive || a.noClash || a.def.reach <= 0) continue;
        for (let j = i + 1; j < fs.length; j++) {
          const b = fs[j];
          if (!b || !b.alive || b.noClash || b.def.reach <= 0 || a.side === b.side) continue;
          // Cheap rejection: weapons can only touch when the fighters are close enough.
          const near = a.radius + a.def.reach + b.radius + b.def.reach + 40;
          if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 > near * near) continue;
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
          clashA = i;
          clashB = j;
          a.ability?.onClash?.(this, a, b);
          b.ability?.onClash?.(this, b, a);
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
      if (!a.alive || a.def.reach <= 0) continue;
      for (const t of fs) {
        if (!t.alive || a.side === t.side || (a.hitLock[t.index] ?? 0) > 0) continue;
        if (Math.min(a.index, t.index) === clashA && Math.max(a.index, t.index) === clashB)
          continue;
        const near = a.radius + a.def.reach + t.radius + a.def.thickness;
        if ((t.x - a.x) ** 2 + (t.y - a.y) ** 2 > near * near) continue;
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
    // A night attack fades out over the K.O. instead of hiding it.
    // Start the fade-out from however dark it is on screen right now (no jump).
    this.darkness = Math.min(this.darkness, NIGHT_FADE_OUT * nightStrength(this.darkness));
    for (const f of this.fighters) f.whirl = 0;
    this.phase = "ko";
    this.phaseTime = 0;
    this.timeScale = KO_TIME_SCALE;
  }
}

export interface DamageOptions {
  /** Knockback pushes away from this point instead of from the attacker. */
  fromX?: number;
  fromY?: number;
  /** Damage over time: no knockback, no hit-stop. */
  dot?: boolean;
  /** 0..1 of the target's shield reduction to ignore. */
  pierce?: number;
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

export function limitSpeed(f: { vx: number; vy: number }): void {
  const speed = Math.hypot(f.vx, f.vy);
  if (speed > MAX_SPEED) {
    f.vx = (f.vx / speed) * MAX_SPEED;
    f.vy = (f.vy / speed) * MAX_SPEED;
  }
}

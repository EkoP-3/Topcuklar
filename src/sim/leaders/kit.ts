import type { Ability, Fighter } from "../types";
import { ULT_HP, type World } from "../world";

export type SkillPhase = "cooldown" | "windup" | "active";

/** Fight seconds at which every leader's move levels up (to level 2, then 3). */
export const LEVEL_TIMES = [15, 30] as const;

/** Seconds of wind-up between two back-to-back charges (see `charges`). */
const RECHARGE_WINDUP = 0.3;

/**
 * A signature move on a timer: wait `cooldown`, optionally wind up, cast, optionally
 * stay active for a while. The move levels up at LEVEL_TIMES; `level` (1..3) is passed
 * to the hooks so each leader decides what a level means (more shots, longer shield…).
 */
export interface SkillSpec {
  /** Name shown on screen, e.g. "HORSE ARCHERS". */
  label: string;
  /** Small cast callout (for moves used every second or two). */
  quiet?: boolean;
  /** Seconds into the fight of the first cast. */
  firstAt: number;
  cooldown: number;
  /** Seconds of wind-up before the cast (default 0). */
  windup?: number;
  /** Seconds the effect lasts after the cast (default 0). */
  active?: number | ((level: number) => number);
  /** Back-to-back uses per cooldown (default 1). */
  charges?(level: number): number;
  onWindup?(world: World, self: Fighter): void;
  whileWindup?(world: World, self: Fighter, dt: number): void;
  cast(world: World, self: Fighter, level: number): void;
  whileActive?(world: World, self: Fighter, dt: number): void;
  onEnd?(world: World, self: Fighter): void;
  damageMultiplier?(phase: SkillPhase): number;
  knockbackMultiplier?(phase: SkillPhase): number;
  /** 0..1 of the target's shield reduction this fighter's hits ignore. */
  shieldPierce?(phase: SkillPhase): number;
  /** Contact hit landed (outside the ultimate). */
  onHit?(world: World, self: Fighter, target: Fighter, phase: SkillPhase): void;
  onDamaged?: Ability["onDamaged"];
  /** Runs every fight step, whatever the move is doing, even while stunned (always-on traits). */
  passive?(world: World, self: Fighter, dt: number): void;
  /** Once-per-match super move, fired when HP drops to ULT_HP of max. */
  ultimate?: UltimateSpec;
}

export interface UltimateSpec {
  /** Shown huge on screen, e.g. "SHIPS OVER LAND". */
  name: string;
  /** Seconds the ultimate keeps going after the cast (default 0). */
  active?: number;
  cast(world: World, self: Fighter): void;
  /** `t` = seconds since the cast, for timed steps (see `ticks`). */
  whileActive?(world: World, self: Fighter, dt: number, t: number): void;
  /** Contact hit landed while the ultimate is active. */
  onHit?(world: World, self: Fighter, target: Fighter): void;
  onEnd?(world: World, self: Fighter): void;
  damageMultiplier?: number;
  knockbackMultiplier?: number;
}

export function skill(spec: SkillSpec): () => Ability {
  return () => {
    let phase: SkillPhase = "cooldown";
    let timer = spec.firstAt;
    let span = spec.firstAt;
    let level = 1;
    let chargesLeft = 0;
    const ult = spec.ultimate;
    let ultUsed = false;
    let ultActive = 0;
    let ultTime = 0;

    const ability: Ability = {
      onTick(world, self, dt) {
        if (world.phase !== "fight") return;
        if (ult && !ultUsed && self.hp <= self.maxHp * ULT_HP) {
          ultUsed = world.beginUltimate(self, ult.name, () => {
            ult.cast(world, self);
            ultActive = ult.active ?? 0;
            ultTime = 0;
          });
        }
        if (ultActive > 0) {
          // The regular move waits while the ultimate plays out.
          ultActive -= dt;
          ultTime += dt;
          ult?.whileActive?.(world, self, dt, ultTime);
          if (ultActive <= 0) ult?.onEnd?.(world, self);
          return;
        }
        if (world.cinematic) return;
        const reached = 1 + LEVEL_TIMES.filter((t) => world.time >= t).length;
        if (reached > level) {
          level = reached;
          world.emit({ type: "levelUp", fighter: self.index, level });
        }

        // A domain can speed up the move's cooldown.
        timer -= phase === "cooldown" ? dt * self.boost.skillRate : dt;
        if (phase === "cooldown") {
          if (timer > 0) return;
          chargesLeft = (spec.charges?.(level) ?? 1) - 1;
          world.emit({ type: "skill", fighter: self.index, name: spec.label, small: !!spec.quiet });
          startWindup(world, self, spec.windup ?? 0);
          return;
        }
        if (phase === "windup") {
          spec.whileWindup?.(world, self, dt);
          if (timer <= 0) fire(world, self);
          return;
        }
        spec.whileActive?.(world, self, dt);
        if (timer <= 0) end(world, self);
      },
      hud: () =>
        phase === "cooldown"
          ? `${spec.label} ${Math.max(0, timer).toFixed(1)}s`
          : phase === "windup"
            ? `${spec.label}...`
            : `${spec.label}!`,
      skillState: () => ({
        progress: phase === "cooldown" ? 1 - Math.max(0, timer) / span : 1,
        ready: phase !== "cooldown",
        remaining: phase === "cooldown" ? Math.max(0, timer) : 0,
        level,
        ult: ult ? (ultActive > 0 ? "active" : ultUsed ? "used" : "ready") : null,
        ultName: ult?.name ?? "",
      }),
      damageMultiplier: () =>
        (spec.damageMultiplier?.(phase) ?? 1) * (ultActive > 0 ? (ult?.damageMultiplier ?? 1) : 1),
      knockbackMultiplier: () =>
        (spec.knockbackMultiplier?.(phase) ?? 1) *
        (ultActive > 0 ? (ult?.knockbackMultiplier ?? 1) : 1),
      onHitDealt: (world, self, target) => {
        if (ultActive > 0) ult?.onHit?.(world, self, target);
        else spec.onHit?.(world, self, target, phase);
      },
    };
    if (spec.shieldPierce) {
      const f = spec.shieldPierce;
      ability.shieldPierce = () => f(phase);
    }
    if (spec.onDamaged) ability.onDamaged = spec.onDamaged;
    if (spec.passive) ability.passive = spec.passive;

    function startWindup(world: World, self: Fighter, seconds: number): void {
      if (seconds <= 0) {
        fire(world, self);
        return;
      }
      phase = "windup";
      timer = seconds;
      spec.onWindup?.(world, self);
    }

    function fire(world: World, self: Fighter): void {
      spec.cast(world, self, level);
      const active = typeof spec.active === "function" ? spec.active(level) : (spec.active ?? 0);
      if (active > 0) {
        phase = "active";
        timer = active;
      } else {
        end(world, self);
      }
    }

    function end(world: World, self: Fighter): void {
      if (phase === "active") spec.onEnd?.(world, self);
      if (chargesLeft > 0) {
        chargesLeft--;
        startWindup(world, self, RECHARGE_WINDUP);
        return;
      }
      phase = "cooldown";
      timer = spec.cooldown;
      span = spec.cooldown;
    }

    return ability;
  };
}

/** How many multiples of `interval` (after `start`) were passed in the step that ended at `t`. */
export function ticks(t: number, dt: number, interval: number, start = 0): number {
  const a = Math.floor((t - dt - start) / interval);
  const b = Math.floor((t - start) / interval);
  return t - start < 0 ? 0 : Math.max(0, b - Math.max(a, -1));
}

/** Evenly spread angles around `center`, `gap` radians apart. */
export function fan(center: number, count: number, gap: number): number[] {
  return Array.from({ length: count }, (_, i) => center + (i - (count - 1) / 2) * gap);
}

/** Turns the fighter's velocity toward the nearest enemy by a fraction `k` (0..1). */
export function steerToward(world: World, self: Fighter, k: number): void {
  const a = aim(world, self);
  const speed = Math.hypot(self.vx, self.vy);
  self.vx += (Math.cos(a) * speed - self.vx) * Math.min(1, k);
  self.vy += (Math.sin(a) * speed - self.vy) * Math.min(1, k);
}

/** Angle toward the nearest enemy (or the current heading when there is none). */
export function aim(world: World, self: Fighter): number {
  const e = world.nearestEnemy(self);
  return e ? Math.atan2(e.y - self.y, e.x - self.x) : Math.atan2(self.vy, self.vx);
}

/** Turns the fighter's velocity toward a point by a fraction `k` (0..1). */
export function steerToPoint(self: Fighter, x: number, y: number, k: number): void {
  const a = Math.atan2(y - self.y, x - self.x);
  const speed = Math.hypot(self.vx, self.vy);
  self.vx += (Math.cos(a) * speed - self.vx) * Math.min(1, k);
  self.vy += (Math.sin(a) * speed - self.vy) * Math.min(1, k);
}

/** Damages every enemy fighter whose body is within `reach` of (x, y). */
export function hitAround(
  world: World,
  self: Fighter,
  x: number,
  y: number,
  reach: number,
  damage: number,
  knockback: number,
): number {
  let hits = 0;
  for (const f of world.fighters) {
    if (!f.alive || f.side === self.side) continue;
    if (Math.hypot(f.x - x, f.y - y) > reach + f.radius) continue;
    world.dealDamage(self, f, damage, f.x, f.y, knockback, { fromX: x, fromY: y });
    hits++;
  }
  return hits;
}

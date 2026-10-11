import type { Ability, Fighter } from "../types";
import type { World } from "../world";

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
  onDamaged?: Ability["onDamaged"];
}

export function skill(spec: SkillSpec): () => Ability {
  return () => {
    let phase: SkillPhase = "cooldown";
    let timer = spec.firstAt;
    let span = spec.firstAt;
    let level = 1;
    let chargesLeft = 0;

    const ability: Ability = {
      onTick(world, self, dt) {
        if (world.phase !== "fight") return;
        const reached = 1 + LEVEL_TIMES.filter((t) => world.time >= t).length;
        if (reached > level) {
          level = reached;
          world.emit({ type: "levelUp", fighter: self.index, level });
        }

        timer -= dt;
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
        level,
      }),
    };
    if (spec.damageMultiplier) {
      const f = spec.damageMultiplier;
      ability.damageMultiplier = () => f(phase);
    }
    if (spec.knockbackMultiplier) {
      const f = spec.knockbackMultiplier;
      ability.knockbackMultiplier = () => f(phase);
    }
    if (spec.onDamaged) ability.onDamaged = spec.onDamaged;

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
        startWindup(world, self, spec.windup ? RECHARGE_WINDUP : 0);
        return;
      }
      phase = "cooldown";
      timer = spec.cooldown;
      span = spec.cooldown;
    }

    return ability;
  };
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

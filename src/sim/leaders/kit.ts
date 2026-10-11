import type { Ability, Fighter } from "../types";
import type { World } from "../world";

export type SkillPhase = "cooldown" | "windup" | "active";

/**
 * A signature move on a timer: wait `cooldown`, optionally wind up, cast, optionally
 * stay active for a while. Covers every leader with a few lines of data.
 */
export interface SkillSpec {
  /** Name shown in the bottom panel, e.g. "HORSE ARCHERS". */
  label: string;
  /** Seconds into the fight of the first cast. */
  firstAt: number;
  cooldown: number;
  /** Seconds of wind-up before the cast (default 0). */
  windup?: number;
  /** Seconds the effect lasts after the cast (default 0). */
  active?: number;
  onWindup?(world: World, self: Fighter): void;
  whileWindup?(world: World, self: Fighter, dt: number): void;
  cast(world: World, self: Fighter): void;
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

    const ability: Ability = {
      onTick(world, self, dt) {
        if (world.phase !== "fight") return;
        timer -= dt;
        if (phase === "cooldown") {
          if (timer > 0) return;
          if (spec.windup) {
            phase = "windup";
            timer = spec.windup;
            spec.onWindup?.(world, self);
            return;
          }
          fire(world, self);
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

    function fire(world: World, self: Fighter): void {
      spec.cast(world, self);
      if (spec.active) {
        phase = "active";
        timer = spec.active;
      } else {
        end(world, self);
      }
    }

    function end(world: World, self: Fighter): void {
      if (phase === "active") spec.onEnd?.(world, self);
      phase = "cooldown";
      timer = spec.cooldown;
    }

    return ability;
  };
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

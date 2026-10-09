import { clamp, wrapAngle } from "../geom";
import { DEFAULT_RELAX } from "../world";
import type { Ability, FighterDef } from "../types";

const COOLDOWN = 2.3;
const CHARGE_TIME = 0.65;
const DASH_TIME = 0.4;
const DASH_SPEED = 1700;
/** Radians/second the lance can turn toward the enemy while charging. */
const AIM_TURN = 14;

export const lance: FighterDef = {
  id: "lance",
  name: "LANCE",
  description:
    "Bekleme süresi dolunca durup şarj olur, rakibe nişan alır ve ışık hızında saplanır. Hamle sırasında çok sert vurur.",
  hp: 100,
  radius: 44,
  mass: 1,
  baseSpeed: 470,
  spin: 5.5,
  reach: 125,
  thickness: 16,
  damage: 5.6,
  knockback: 260,
  hitInterval: 0.45,
  createAbility: () => {
    let phase: "cooldown" | "charge" | "dash" = "cooldown";
    let timer = 1.6;

    const ability: Ability = {
      onTick(world, self, dt) {
        timer -= dt;

        if (phase === "cooldown") {
          if (timer > 0) return;
          phase = "charge";
          timer = CHARGE_TIME;
          self.speedMul = 0.25;
          self.spinMul = 0;
          self.relax = 6;
          world.emit({ type: "charge", fighter: self.index });
          return;
        }

        if (phase === "charge") {
          const enemy = world.nearestEnemy(self);
          if (enemy) {
            const want = Math.atan2(enemy.y - self.y, enemy.x - self.x);
            self.angle += clamp(wrapAngle(want - self.angle), -AIM_TURN * dt, AIM_TURN * dt);
          }
          if (timer > 0) return;
          phase = "dash";
          timer = DASH_TIME;
          self.speedMul = DASH_SPEED / self.def.baseSpeed;
          self.relax = 20;
          self.noClash = true;
          self.trail = true;
          self.vx = Math.cos(self.angle) * DASH_SPEED;
          self.vy = Math.sin(self.angle) * DASH_SPEED;
          world.emit({ type: "dash", fighter: self.index });
          return;
        }

        // dash: keep pointing where we are going
        self.angle = Math.atan2(self.vy, self.vx);
        if (timer > 0) return;
        phase = "cooldown";
        timer = COOLDOWN;
        self.speedMul = 1;
        self.spinMul = 1;
        self.relax = DEFAULT_RELAX;
        self.noClash = false;
        self.trail = false;
      },
      damageMultiplier: () => (phase === "dash" ? 2.4 : 1),
      knockbackMultiplier: () => (phase === "dash" ? 2.2 : 1),
      hud: () =>
        phase === "cooldown"
          ? `[CD ${Math.max(0, timer).toFixed(1)}s]`
          : phase === "charge"
            ? "[CHARGING]"
            : "[DASH!]",
    };
    return ability;
  },
};

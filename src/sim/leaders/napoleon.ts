import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { skill } from "./kit";

const BALL_SPEED = 900;

export const napoleon: FighterDef = {
  id: "napoleon",
  name: "NAPOLEON",
  description:
    "Napolyon. Küçük ve çevik; belli aralıklarla rakibe ağır bir top güllesi atar. Gülle bir kez duvardan seker.",
  era: "1769–1821",
  fact: "An artillery officer who crowned himself Emperor of the French in 1804.",
  hp: 90,
  radius: 38,
  mass: 0.85,
  baseSpeed: 470,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 120,
  hitInterval: 0.5,
  contactDamage: 3,
  contactInterval: 0.5,
  createAbility: skill({
    label: "GRAND BATTERY",
    firstAt: 1.4,
    cooldown: 2.4,
    cast(world, self) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      fireProjectile(world, self, leadAngle(self, enemy, BALL_SPEED), {
        style: "ball",
        speed: BALL_SPEED,
        radius: 13,
        damage: 10.5,
        knockback: 420,
        blast: 0,
        poison: 0,
        poisonDps: 0,
        bounces: 1,
        ttl: 3,
      });
      world.emit({ type: "shoot", fighter: self.index, style: "ball" });
    },
  }),
};

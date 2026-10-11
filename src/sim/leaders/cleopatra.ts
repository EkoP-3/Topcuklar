import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { skill } from "./kit";

const ASP_SPEED = 700;

export const cleopatra: FighterDef = {
  id: "cleopatra",
  name: "CLEOPATRA",
  description:
    "Kleopatra. Belli aralıklarla rakibe bir engerek fırlatır; ısırılan rakip birkaç saniye zehirlenip can kaybeder.",
  era: "69–30 BC",
  fact: "The last active ruler of Ptolemaic Egypt.",
  hp: 100,
  radius: 44,
  mass: 1,
  baseSpeed: 460,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 130,
  hitInterval: 0.5,
  contactDamage: 3.5,
  contactInterval: 0.5,
  createAbility: skill({
    label: "ASP",
    firstAt: 1.3,
    cooldown: 2.8,
    cast(world, self) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      fireProjectile(world, self, leadAngle(self, enemy, ASP_SPEED), {
        style: "asp",
        speed: ASP_SPEED,
        radius: 12,
        damage: 3,
        knockback: 80,
        blast: 0,
        poison: 4,
        poisonDps: 3,
        bounces: 1,
        ttl: 3,
      });
      world.emit({ type: "shoot", fighter: self.index, style: "asp" });
    },
  }),
};

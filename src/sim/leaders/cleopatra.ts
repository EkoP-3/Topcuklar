import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { fan, skill } from "./kit";

const ASP_SPEED = 700;
const ABILITY = { name: "ASP", text: "Throws asps that poison" };

export const cleopatra: FighterDef = {
  id: "cleopatra",
  name: "CLEOPATRA",
  description:
    "Kleopatra. Belli aralıklarla rakibe engerek fırlatır; ısırılan rakip birkaç saniye zehirlenip can kaybeder. Önce 1, 15. saniyede 2, 30. saniyede 3 engerek.",
  era: "69–30 BC",
  fact: "The last active ruler of Ptolemaic Egypt.",
  flag: "egypt",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "POISON/S", base: 27 },
  hp: 1000,
  radius: 55,
  mass: 1,
  baseSpeed: 460,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 130,
  hitInterval: 0.5,
  contactDamage: 22,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    firstAt: 1.3,
    cooldown: 2.8,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      for (const a of fan(leadAngle(self, enemy, ASP_SPEED), level, 0.45)) {
        fireProjectile(world, self, a, {
          style: "asp",
          speed: ASP_SPEED,
          radius: 15,
          damage: 19,
          knockback: 80,
          blast: 0,
          poison: 4,
          poisonDps: 27,
          bounces: 1,
          ttl: 3,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "asp" });
    },
  }),
};

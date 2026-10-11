import type { FighterDef } from "../types";
import { skill, steerToward } from "./kit";

const SHIELD_TIME = [2.2, 3, 4];
const ABILITY = { name: "HOLD THE LINE", text: "Shield up: -60% damage, hard bash" };

export const leonidas: FighterDef = {
  id: "leonidas",
  name: "LEONIDAS",
  description:
    "Leonidas. Dayanıklıdır; belli aralıklarla kalkanını kaldırıp rakibe yürür: aldığı hasar %60 azalır, kalkanla sert vurur. Kalkan önce 2,2 sn, 15. saniyede 3 sn, 30. saniyede 4 sn sürer.",
  era: "c. 540–480 BC",
  fact: "Led the 300 Spartans at Thermopylae in 480 BC.",
  flag: "greece",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "BASH DMG", base: 89 },
  hp: 1200,
  radius: 60,
  mass: 1.4,
  baseSpeed: 420,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 41,
  contactInterval: 0.45,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2,
    cooldown: 3.8,
    active: (level) => SHIELD_TIME[level - 1] ?? 2.2,
    cast(world, self) {
      self.damageTakenMul = 0.4;
      self.shielded = true;
      self.speedMul = 1.25;
      world.emit({ type: "shield", fighter: self.index });
    },
    whileActive(world, self, dt) {
      steerToward(world, self, 2.5 * dt);
    },
    onEnd(_world, self) {
      self.damageTakenMul = 1;
      self.shielded = false;
      self.speedMul = 1;
    },
    damageMultiplier: (p) => (p === "active" ? 2.2 : 1),
    knockbackMultiplier: (p) => (p === "active" ? 2.5 : 1),
  }),
};

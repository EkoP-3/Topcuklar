import type { FighterDef } from "../types";
import { steerToward, skill } from "./kit";

export const leonidas: FighterDef = {
  id: "leonidas",
  name: "LEONIDAS",
  description:
    "Leonidas. Dayanıklıdır; belli aralıklarla kalkanını kaldırır: aldığı hasar %60 azalır, kalkanla çarptığında sert vurur.",
  era: "c. 540–480 BC",
  fact: "Led the 300 Spartans at Thermopylae in 480 BC.",
  hp: 120,
  radius: 48,
  mass: 1.4,
  baseSpeed: 420,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 5.5,
  contactInterval: 0.45,
  createAbility: skill({
    label: "HOLD THE LINE",
    firstAt: 2,
    cooldown: 3.8,
    active: 2.2,
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

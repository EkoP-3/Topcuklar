import type { FighterDef } from "../types";
import { countUnits, spawnUnit } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "WAR ELEPHANT", text: "Elephants trample and stun" };

export const hannibal: FighterDef = {
  id: "hannibal",
  name: "HANNIBAL",
  description:
    "Hannibal. Belli aralıklarla savaş fili salar; fil ağırdır, rakibi savurur ve kısa süre sersemletir. Önce 1, 15. saniyede 2, 30. saniyede 3 fil.",
  era: "247–c. 183 BC",
  fact: "Crossed the Alps with war elephants to invade Italy in 218 BC.",
  flag: "tunisia",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "TRAMPLE DMG", base: 42 },
  hp: 1000,
  radius: 58,
  mass: 1.1,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 25,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2,
    cooldown: 6,
    cast(world, self, level) {
      const count = Math.min(level, level + 1 - countUnits(world, self, "elephant"));
      for (const a of fan(aim(world, self), count, 0.9)) {
        spawnUnit(
          world,
          self,
          {
            style: "elephant",
            radius: 44,
            mass: 2.4,
            speed: 300,
            hp: 180,
            damage: 42,
            knockback: 520,
            stun: 0.6,
            hitInterval: 0.9,
            ttl: 7,
          },
          a,
        );
      }
    },
  }),
};

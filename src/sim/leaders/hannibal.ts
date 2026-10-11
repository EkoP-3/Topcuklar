import type { FighterDef } from "../types";
import { countUnits, spawnUnit } from "../units";
import { aim, skill } from "./kit";

export const hannibal: FighterDef = {
  id: "hannibal",
  name: "HANNIBAL",
  description:
    "Hannibal. Belli aralıklarla bir savaş fili salar; fil ağırdır, rakibi savurur ve kısa süre sersemletir.",
  era: "247–c. 183 BC",
  fact: "Crossed the Alps with war elephants to invade Italy in 218 BC.",
  hp: 100,
  radius: 46,
  mass: 1.1,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 4,
  contactInterval: 0.5,
  createAbility: skill({
    label: "WAR ELEPHANT",
    firstAt: 2,
    cooldown: 5.5,
    cast(world, self) {
      if (countUnits(world, self, "elephant") >= 2) return;
      spawnUnit(
        world,
        self,
        {
          style: "elephant",
          radius: 36,
          mass: 2.4,
          speed: 300,
          hp: 24,
          damage: 8,
          knockback: 520,
          stun: 0.6,
          hitInterval: 0.9,
          ttl: 7,
        },
        aim(world, self),
      );
    },
  }),
};

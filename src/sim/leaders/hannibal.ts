import type { FighterDef } from "../types";
import { countUnits, spawnSweep, spawnUnit } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "WAR ELEPHANT", text: "Elephants trample and stun" };

export const hannibal: FighterDef = {
  id: "hannibal",
  name: "HANNIBAL",
  description:
    "Hannibal. Belli aralıklarla savaş fili salar; fil ağırdır, rakibi savurur ve kısa süre sersemletir. Önce 1, 15. saniyede 2, 30. saniyede 3 fil.",
  era: "247–c. 183 BC",
  fact: "Crossed the Alps with war elephants to invade Italy in 218 BC.",
  title: "General of Carthage",
  flag: "tunisia",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "TRAMPLE DMG", base: 40 },
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
  contactDamage: 23,
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
            damage: 40,
            knockback: 520,
            stun: 0.6,
            hitInterval: 0.9,
            ttl: 7,
          },
          a,
        );
      }
    },
    ultimate: {
      name: "CROSSING THE ALPS",
      cast(world, self) {
        spawnSweep(world, self, {
          style: "elephant",
          speed: 460,
          depth: 100,
          count: 4,
          itemHalf: 50,
          damage: 161,
          knockback: 800,
          stun: 1.2,
        });
      },
    },
  }),
};

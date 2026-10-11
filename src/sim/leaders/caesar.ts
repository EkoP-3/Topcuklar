import type { FighterDef } from "../types";
import { countUnits, spawnUnit } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "LEGIONS", text: "Summons legionaries that chase" };

export const caesar: FighterDef = {
  id: "caesar",
  name: "CAESAR",
  description:
    "Jül Sezar. Belli aralıklarla lejyoner çağırır; lejyonerler rakibi kovalar ve temas ettikçe hasar verir. Önce 2, 15. saniyede 3, 30. saniyede 4 lejyoner.",
  era: "100–44 BC",
  fact: "Crossed the Rubicon in 49 BC and started a civil war.",
  flag: "spqr",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "LEGION DMG", base: 28 },
  hp: 1000,
  radius: 58,
  mass: 1,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 26,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.5,
    cooldown: 4.5,
    cast(world, self, level) {
      const wave = level + 1;
      const room = wave * 2 - countUnits(world, self, "legion");
      const count = Math.min(wave, room);
      for (const a of fan(aim(world, self), count, 1.8 / Math.max(1, count - 1))) {
        spawnUnit(
          world,
          self,
          {
            style: "legion",
            radius: 27,
            mass: 0.35,
            speed: 340,
            hp: 95,
            damage: 28,
            knockback: 90,
            stun: 0,
            hitInterval: 0.6,
            ttl: 8,
          },
          a,
        );
      }
    },
  }),
};

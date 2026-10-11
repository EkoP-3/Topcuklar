import type { FighterDef } from "../types";
import { countUnits, spawnUnit } from "../units";
import { aim, skill } from "./kit";

const MAX_LEGIONS = 4;

export const caesar: FighterDef = {
  id: "caesar",
  name: "CAESAR",
  description:
    "Jül Sezar. Belli aralıklarla iki lejyoner çağırır; lejyonerler rakibi kovalar ve temas ettikçe hasar verir.",
  era: "100–44 BC",
  fact: "Crossed the Rubicon in 49 BC and started a civil war.",
  hp: 100,
  radius: 46,
  mass: 1,
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
    label: "LEGIONS",
    firstAt: 1.5,
    cooldown: 4.5,
    cast(world, self) {
      const room = MAX_LEGIONS - countUnits(world, self, "legion");
      const a = aim(world, self);
      for (let i = 0; i < Math.min(2, room); i++) {
        spawnUnit(
          world,
          self,
          {
            style: "legion",
            radius: 22,
            mass: 0.35,
            speed: 340,
            hp: 13,
            damage: 4.5,
            knockback: 90,
            stun: 0,
            hitInterval: 0.6,
            ttl: 8,
          },
          a + (i === 0 ? -0.9 : 0.9),
        );
      }
    },
  }),
};

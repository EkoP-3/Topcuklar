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
  title: "Dictator of Rome",
  flag: "spqr",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "LEGION DMG", base: 26 },
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
  contactDamage: 24,
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
            damage: 26,
            knockback: 90,
            stun: 0,
            hitInterval: 0.6,
            ttl: 8,
          },
          a,
        );
      }
    },
    ultimate: {
      name: "VENI, VIDI, VICI",
      cast(world, self) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          spawnUnit(
            world,
            self,
            {
              style: "legion",
              radius: 27,
              mass: 0.5,
              speed: 380,
              hp: 140,
              damage: 48,
              knockback: 120,
              stun: 0,
              hitInterval: 0.5,
              ttl: 7,
            },
            a + Math.PI,
            { x: enemy.x + Math.cos(a) * 190, y: enemy.y + Math.sin(a) * 190 },
          );
        }
      },
    },
  }),
};

import type { FighterDef } from "../types";
import { spawnSweep, spawnUnit, countUnits } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "WAR ELEPHANT", text: "Elephants trample, stun and drag" };

export const hannibal: FighterDef = {
  id: "hannibal",
  name: "HANNIBAL",
  description:
    "Hannibal. Belli aralıklarla savaş fili salar; fil ağırdır, rakibi savurur, sürükler ve kısa süre sersemletir; filler mermileri gövdesiyle durdurur. Önce 1, 15. saniyede 2, 30. saniyede 3 fil.",
  era: "247–c. 183 BC",
  fact: "Crossed the Alps with war elephants to invade Italy in 218 BC.",
  fullName: "Hannibal Barca",
  sources: ["https://en.wikipedia.org/wiki/Hannibal"],
  musicMode: "phrygian",
  title: "General of Carthage",
  flag: "tunisia",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "TRAMPLE DMG", base: 45 },
  hp: 970,
  radius: 58,
  mass: 1.1,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 28,
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
            damage: 45,
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
        // Elephants charge in from all four sides at once.
        for (const dir of [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ]) {
          spawnSweep(world, self, {
            style: "elephant",
            speed: 400,
            depth: 90,
            count: 3,
            itemHalf: 46,
            damage: 40,
            knockback: 600,
            stun: 0.25,
            dir,
          });
        }
      },
    },
  }),
};

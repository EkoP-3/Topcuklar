import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnSweep } from "../units";
import { fan, skill } from "./kit";

const ARROW_SPEED = 1050;
const ARROWS = [3, 5, 7];
const ABILITY = { name: "HORSE ARCHERS", text: "Fast rider, fires arrow volleys" };

export const genghis: FighterDef = {
  id: "genghis",
  name: "GENGHIS KHAN",
  description:
    "Cengiz Han. Hızlı hareket eder ve sık sık atlı okçu gibi oklu yaylım atar: önce 3, 15. saniyede 5, 30. saniyede 7 ok.",
  era: "c. 1162–1227",
  fact: "Founded the Mongol Empire, later the largest land empire in history.",
  title: "Great Khan of the Mongols",
  flag: "mongolia",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "ARROW DMG", base: 27 },
  hp: 950,
  radius: 52,
  mass: 0.9,
  baseSpeed: 540,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 120,
  hitInterval: 0.5,
  contactDamage: 19,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    firstAt: 1.2,
    cooldown: 1.9,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      const count = ARROWS[level - 1] ?? 3;
      for (const a of fan(leadAngle(self, enemy, ARROW_SPEED), count, 0.4 / Math.sqrt(count))) {
        fireProjectile(world, self, a, {
          style: "arrow",
          speed: ARROW_SPEED,
          radius: 9,
          damage: 27,
          knockback: 60,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 0,
          ttl: 2,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "arrow" });
    },
    ultimate: {
      name: "MONGOL HORDE",
      cast(world, self) {
        spawnSweep(world, self, {
          style: "rider",
          speed: 760,
          depth: 70,
          count: 7,
          itemHalf: 42,
          damage: 152,
          knockback: 700,
        });
      },
    },
  }),
};

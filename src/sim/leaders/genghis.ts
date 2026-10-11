import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { skill } from "./kit";

const ARROW_SPEED = 1050;
const SPREAD = 0.2;

export const genghis: FighterDef = {
  id: "genghis",
  name: "GENGHIS KHAN",
  description: "Cengiz Han. Hızlı hareket eder ve sık sık atlı okçu gibi üç oklu yaylım atar.",
  era: "c. 1162–1227",
  fact: "Founded the Mongol Empire, later the largest land empire in history.",
  hp: 95,
  radius: 42,
  mass: 0.9,
  baseSpeed: 540,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 120,
  hitInterval: 0.5,
  contactDamage: 3,
  contactInterval: 0.5,
  createAbility: skill({
    label: "HORSE ARCHERS",
    firstAt: 1.2,
    cooldown: 1.9,
    cast(world, self) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      const a = leadAngle(self, enemy, ARROW_SPEED);
      for (const off of [-SPREAD, 0, SPREAD]) {
        fireProjectile(world, self, a + off, {
          style: "arrow",
          speed: ARROW_SPEED,
          radius: 7,
          damage: 3.5,
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
  }),
};

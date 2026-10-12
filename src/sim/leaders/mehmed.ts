import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnSweep } from "../units";
import { aim, fan, skill } from "./kit";

const BALL_SPEED = 760;
const ABILITY = { name: "GREAT BOMBARD", text: "Giant cannonball that explodes" };

export const mehmed: FighterDef = {
  id: "mehmed",
  name: "MEHMED II",
  description:
    "Fatih Sultan Mehmed. Belli aralıklarla durup Şahi topunu doldurur ve dev gülle atar; gülle çarptığı yerde patlar. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle.",
  era: "1432–1481",
  fact: "Took Constantinople in 1453 with the help of giant bombards.",
  title: "Ottoman Sultan",
  flag: "turkey",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "BOMBARD DMG", base: 93 },
  hp: 1050,
  radius: 59,
  mass: 1.2,
  baseSpeed: 420,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 22,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2.2,
    cooldown: 3.4,
    windup: 0.8,
    onWindup(world, self) {
      self.speedMul = 0.25;
      self.relax = 6;
      world.emit({ type: "charge", fighter: self.index });
    },
    whileWindup(world, self) {
      self.angle = aim(world, self);
    },
    cast(world, self, level) {
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
      const enemy = world.nearestEnemy(self);
      const a = enemy ? leadAngle(self, enemy, BALL_SPEED) : self.angle;
      for (const angle of fan(a, level, 0.38)) {
        fireProjectile(world, self, angle, {
          style: "bombard",
          speed: BALL_SPEED,
          radius: 27,
          damage: 93,
          knockback: 600,
          blast: 130,
          poison: 0,
          poisonDps: 0,
          bounces: 0,
          ttl: 3,
        });
      }
      // Recoil.
      self.vx -= Math.cos(a) * 500;
      self.vy -= Math.sin(a) * 500;
      world.emit({ type: "shoot", fighter: self.index, style: "bombard" });
    },
    ultimate: {
      name: "SHIPS OVER LAND",
      cast(world, self) {
        spawnSweep(world, self, {
          style: "ship",
          speed: 520,
          depth: 110,
          count: 3,
          itemHalf: 120,
          damage: 178,
          knockback: 900,
        });
      },
    },
  }),
};

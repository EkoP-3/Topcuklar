import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnStrike } from "../units";
import { aim, fan, skill, ticks } from "./kit";

const BALL_SPEED = 760;
const ABILITY = { name: "GREAT BOMBARD", text: "Giant shell that leaves a burning crater" };

export const mehmed: FighterDef = {
  id: "mehmed",
  name: "MEHMED II",
  description:
    "Fatih Sultan Mehmed. Belli aralıklarla durup Şahi topunu doldurur ve dev gülle atar; gülle çarptığı yerde patlar ve 2 sn yanan bir krater bırakır. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle.",
  era: "1432–1481",
  fact: "Took Constantinople in 1453 with the help of giant bombards.",
  fullName: "Mehmed II (the Conqueror)",
  sources: ["https://en.wikipedia.org/wiki/Mehmed_II"],
  musicMode: "hijaz",
  title: "Ottoman Sultan",
  flag: "turkey",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "BOMBARD DMG", base: 101 },
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
  contactDamage: 23,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2.2,
    cooldown: 3.4,
    windup: 0.65,
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
          damage: 101,
          knockback: 600,
          blast: 130,
          poison: 0,
          poisonDps: 0,
          bounces: 0,
          leaves: "fire",
          ttl: 3,
        });
      }
      // Recoil.
      self.vx -= Math.cos(a) * 500;
      self.vy -= Math.sin(a) * 500;
      world.emit({ type: "shoot", fighter: self.index, style: "bombard" });
    },
    ultimate: {
      name: "THE GREAT BOMBARDMENT",
      active: 1.8,
      cast() {},
      whileActive(world, self, dt, t) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // Six marked shells around where the enemy is heading...
        for (let i = ticks(t, dt, 0.22, 0.1); i > 0 && t < 1.5; i--) {
          spawnStrike(world, self, {
            style: "shell",
            x: enemy.x + enemy.vx * 0.7 + world.rng.range(-70, 70),
            y: enemy.y + enemy.vy * 0.7 + world.rng.range(-70, 70),
            radius: 95,
            delay: 0.8,
            damage: 75,
            knockback: 450,
          });
        }
        // ...then the giant Şahi ball right on them.
        if (ticks(t, dt, 99, 1.6) > 0) {
          spawnStrike(world, self, {
            style: "shell",
            x: enemy.x,
            y: enemy.y,
            radius: 160,
            delay: 1,
            damage: 152,
            knockback: 900,
          });
        }
      },
    },
  }),
};

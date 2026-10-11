import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { aim, skill } from "./kit";

const BALL_SPEED = 760;

export const mehmed: FighterDef = {
  id: "mehmed",
  name: "MEHMED II",
  description:
    "Fatih Sultan Mehmed. Belli aralıklarla durup Şahi topunu doldurur ve dev bir gülle atar; gülle çarptığı yerde patlar.",
  era: "1432–1481",
  fact: "Took Constantinople in 1453 with the help of giant bombards.",
  hp: 105,
  radius: 47,
  mass: 1.2,
  baseSpeed: 420,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 3.5,
  contactInterval: 0.5,
  createAbility: skill({
    label: "GREAT BOMBARD",
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
    cast(world, self) {
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
      const enemy = world.nearestEnemy(self);
      const a = enemy ? leadAngle(self, enemy, BALL_SPEED) : self.angle;
      fireProjectile(world, self, a, {
        style: "bombard",
        speed: BALL_SPEED,
        radius: 22,
        damage: 17,
        knockback: 600,
        blast: 110,
        poison: 0,
        poisonDps: 0,
        bounces: 0,
        ttl: 3,
      });
      // Recoil.
      self.vx -= Math.cos(a) * 500;
      self.vy -= Math.sin(a) * 500;
      world.emit({ type: "shoot", fighter: self.index, style: "bombard" });
    },
  }),
};

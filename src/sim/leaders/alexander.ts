import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { aim, skill } from "./kit";

const DASH_SPEED = 1500;

export const alexander: FighterDef = {
  id: "alexander",
  name: "ALEXANDER",
  description:
    "Büyük İskender. Belli aralıklarla durup nişan alır ve Hetairoi süvarisi gibi rakibe hücum eder; hücumda çok sert vurur.",
  era: "356–323 BC",
  fact: "Never lost a battle; his empire reached from Greece to India.",
  hp: 100,
  radius: 46,
  mass: 1.1,
  baseSpeed: 440,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 4.7,
  contactInterval: 0.45,
  createAbility: skill({
    label: "COMPANION CHARGE",
    firstAt: 1.8,
    cooldown: 2.5,
    windup: 0.5,
    active: 0.45,
    onWindup(world, self) {
      self.speedMul = 0.2;
      self.relax = 6;
      world.emit({ type: "charge", fighter: self.index });
    },
    whileWindup(world, self) {
      self.angle = aim(world, self);
    },
    cast(world, self) {
      self.speedMul = DASH_SPEED / self.def.baseSpeed;
      self.relax = 20;
      self.trail = true;
      self.damageTakenMul = 0.6;
      self.vx = Math.cos(self.angle) * DASH_SPEED;
      self.vy = Math.sin(self.angle) * DASH_SPEED;
      world.emit({ type: "dash", fighter: self.index });
    },
    onEnd(_world, self) {
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
      self.trail = false;
      self.damageTakenMul = 1;
    },
    damageMultiplier: (p) => (p === "active" ? 3.2 : 1),
    knockbackMultiplier: (p) => (p === "active" ? 3 : 1),
  }),
};

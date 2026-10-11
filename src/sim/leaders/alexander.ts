import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { aim, skill } from "./kit";

const DASH_SPEED = 1500;
const ABILITY = { name: "COMPANION CHARGE", text: "Aims, then charges at full gallop" };

export const alexander: FighterDef = {
  id: "alexander",
  name: "ALEXANDER",
  description:
    "Büyük İskender. Belli aralıklarla durup nişan alır ve Hetairoi süvarisi gibi rakibe hücum eder; hücumda çok sert vurur. 15. saniyede art arda 2, 30. saniyede 3 hücum yapar.",
  era: "356–323 BC",
  fact: "Never lost a battle; his empire reached from Greece to India.",
  flag: "vergina",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "CHARGE DMG", base: 104 },
  hp: 1000,
  radius: 58,
  mass: 1.1,
  baseSpeed: 440,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 33,
  contactInterval: 0.45,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.8,
    cooldown: 2.5,
    windup: 0.5,
    active: 0.45,
    charges: (level) => level,
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

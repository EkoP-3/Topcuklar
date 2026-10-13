import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { skill, steerToward } from "./kit";

const SHIELD_TIME = [2.2, 3, 4];
const ABILITY = { name: "HOLD THE LINE", text: "Shield up: -60% damage, hard bash" };

export const leonidas: FighterDef = {
  id: "leonidas",
  name: "LEONIDAS",
  description:
    "Leonidas. Dayanıklıdır; belli aralıklarla kalkanını kaldırıp rakibe yürür: aldığı hasar %60 azalır, kalkanla sert vurur. Kalkan önce 2,2 sn, 15. saniyede 3 sn, 30. saniyede 4 sn sürer.",
  era: "c. 540–480 BC",
  fact: "Led the 300 Spartans at Thermopylae in 480 BC.",
  fullName: "Leonidas I of Sparta",
  sources: ["https://en.wikipedia.org/wiki/Leonidas_I"],
  musicMode: "dorian",
  title: "King of Sparta",
  flag: "greece",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "BASH DMG", base: 72 },
  hp: 1200,
  radius: 60,
  mass: 1.4,
  baseSpeed: 420,
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
    firstAt: 2,
    cooldown: 3.8,
    active: (level) => SHIELD_TIME[level - 1] ?? 2.2,
    cast(world, self) {
      self.damageTakenMul = 0.4;
      self.shielded = true;
      self.speedMul = 1.25;
      world.emit({ type: "shield", fighter: self.index });
    },
    whileActive(world, self, dt) {
      steerToward(world, self, 2.5 * dt);
    },
    onEnd(_world, self) {
      self.damageTakenMul = 1;
      self.shielded = false;
      self.speedMul = 1;
    },
    damageMultiplier: (p) => (p === "active" ? 2.2 : 1),
    knockbackMultiplier: (p) => (p === "active" ? 2.5 : 1),
    ultimate: {
      name: "THIS IS SPARTA!",
      active: 1.4,
      cast(_world, self) {
        self.speedMul = 3.2;
        self.relax = 12;
        self.trail = true;
        self.shielded = true;
      },
      whileActive(world, self, dt) {
        // Homes in until the kick lands (trail is on only during the run-up).
        if (self.trail) steerToward(world, self, 14 * dt);
      },
      onHit(_world, self, target) {
        if (!self.trail) return;
        self.trail = false;
        self.speedMul = 1;
        // The kick: the victim flies and gets hurt again on the wall.
        target.slam = 1.5;
        target.slamBy = self.index;
        target.slamDamage = 110;
      },
      onEnd(_world, self) {
        self.speedMul = 1;
        self.relax = DEFAULT_RELAX;
        self.trail = false;
        self.shielded = false;
      },
      damageMultiplier: 1.8,
      knockbackMultiplier: 10,
    },
  }),
};

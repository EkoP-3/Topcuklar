import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { spawnMark } from "../units";
import { perFighter, signature, skill, steerToward } from "./kit";

const SHIELD_TIME = [2.2, 3, 4];
/**
 * Last stand (the 300 at the pass): the first blow that would kill Leonidas leaves him
 * standing instead; he rallies some HP and for a few seconds shrugs off most damage and
 * hits harder.
 */
const LAST_STAND = { time: 2.5, heal: 0.05, guard: 0.6, damage: 1.3 };
const lastStand = perFighter(() => ({ used: false, until: 0 }));

const ABILITY = {
  name: "HOLD THE LINE",
  text: "Shield up: -60% damage, parries shots back; survives one killing blow",
};

export const leonidas: FighterDef = {
  id: "leonidas",
  name: "LEONIDAS",
  description:
    "Leonidas. Dayanıklıdır; belli aralıklarla kalkanını kaldırıp rakibe yürür: aldığı hasar %60 azalır, kalkanla sert vurur; kalkanı kaldırdığı ilk saniyede gelen mermileri sahibine geri sektirir. Kalkan önce 2,2 sn, 15. saniyede 3 sn, 30. saniyede 4 sn sürer. Son direniş: onu öldürecek ilk darbede ayakta kalır, biraz can toplar ve 3 sn boyunca çok az hasar alıp daha sert vurur.",
  era: "c. 540–480 BC",
  fact: "Led the 300 Spartans at Thermopylae in 480 BC.",
  fullName: "Leonidas I of Sparta",
  sources: ["https://en.wikipedia.org/wiki/Leonidas_I"],
  musicMode: "dorian",
  title: "King of Sparta",
  flag: "greece",
  ability: ABILITY,
  domain: {
    name: "THERMOPYLAE",
    rule: "The narrow pass: Leonidas takes less damage",
    buff: { guard: 0.9 },
  },
  growth: { perSecond: 0.015, stat: "BASH DMG", base: 80 },
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
  contactDamage: 35,
  contactInterval: 0.45,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 2,
    cooldown: 3.8,
    active: (level) => SHIELD_TIME[level - 1] ?? 2.2,
    cast(world, self) {
      self.damageTakenMul = 0.4;
      self.shielded = true;
      // Raising the shield parries: shots bounce back for the first second.
      self.reflectUntil = world.time + 1;
      self.speedMul = 1.25;
      world.emit({ type: "shield", fighter: self.index });
    },
    whileActive(world, self, dt) {
      steerToward(world, self, 2.5 * dt);
    },
    onEnd(_world, self) {
      self.damageTakenMul = 1;
      self.shielded = false;
      self.reflectUntil = 0;
      self.speedMul = 1;
    },
    onDamaged(world, self) {
      const s = lastStand(self);
      if (s.used || self.hp > 0 || world.phase !== "fight") return;
      s.used = true;
      s.until = world.time + LAST_STAND.time;
      self.hp = 0;
      world.heal(self, self.maxHp * LAST_STAND.heal);
      self.boost.guard *= LAST_STAND.guard;
      self.boost.damage *= LAST_STAND.damage;
      spawnMark(world, self, {
        style: "laststand",
        x: self.x,
        y: self.y,
        nx: 0,
        ny: 0,
        fighter: self.index,
        ttl: LAST_STAND.time,
      });
      signature(world, self, self.x, self.y, "#c8202a", "MOLON LABE!");
    },
    passive(world, self) {
      const s = lastStand(self);
      if (s.until <= 0 || world.time < s.until) return;
      s.until = 0;
      self.boost.guard /= LAST_STAND.guard;
      self.boost.damage /= LAST_STAND.damage;
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

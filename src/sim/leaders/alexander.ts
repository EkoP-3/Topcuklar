import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { spawnMark } from "../units";
import { aim, perFighter, signature, skill, steerToward, ticks } from "./kit";

const DASH_SPEED = 1500;
const ABILITY = {
  name: "COMPANION CHARGE",
  text: "Charges through shields; an enemy charged into a wall is crushed on the phalanx",
};

/**
 * Hammer and anvil (Issus, Gaugamela): the Companions' charge is the hammer, the
 * phalanx the anvil. An enemy thrown by the charge into a wall within `window` seconds
 * smashes into a wall of shields: hurt and stunned.
 */
const ANVIL = { window: 0.9, damage: 40, stun: 0.8 };
const anvil = perFighter(() => ({ until: 0, target: -1 }));

export const alexander: FighterDef = {
  id: "alexander",
  name: "ALEXANDER",
  description:
    "Büyük İskender. Belli aralıklarla durup nişan alır ve Hetairoi süvarisi gibi rakibe hücum eder; hücumda çok sert vurur, kalkanın yarısını deler ve çarptığı yerde şok dalgası yapar; hücum zehrin yarısını da temizler; hücumla duvara savrulan rakip falanksa çarpar: hasar alır ve sersemler. 15. saniyede art arda 2, 30. saniyede 3 hücum yapar.",
  era: "356–323 BC",
  fact: "Never lost a battle; his empire reached from Greece to India.",
  fullName: "Alexander the Great",
  sources: ["https://en.wikipedia.org/wiki/Alexander_the_Great"],
  musicMode: "dorian",
  title: "King of Macedon",
  flag: "vergina",
  ability: ABILITY,
  domain: {
    name: "GAUGAMELA",
    rule: "Open plain: Alexander charges more often",
    buff: { skillRate: 1.5 },
  },
  growth: { perSecond: 0.015, stat: "CHARGE DMG", base: 127 },
  hp: 900,
  radius: 58,
  mass: 1.1,
  baseSpeed: 440,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 36,
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
      // Nothing slows the Companions: the charge shakes off half the poison.
      self.poison *= 0.5;
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
    shieldPierce: (p) => (p === "active" ? 0.85 : 0),
    passive(world, self) {
      const s = anvil(self);
      if (world.time > s.until) return;
      const t = world.fighters[s.target];
      if (!t?.alive) return;
      // Pressed against a wall?
      const gap = 3;
      let nx = 0;
      let ny = 0;
      if (t.x - t.radius <= world.lo + gap) nx = 1;
      else if (t.x + t.radius >= world.hi - gap) nx = -1;
      else if (t.y - t.radius <= world.lo + gap) ny = 1;
      else if (t.y + t.radius >= world.hi - gap) ny = -1;
      else return;
      s.until = 0;
      const x = t.x - nx * t.radius;
      const y = t.y - ny * t.radius;
      world.dealDamage(self, t, ANVIL.damage, x, y, 260, {
        fromX: x - nx * 10,
        fromY: y - ny * 10,
      });
      t.stun = Math.max(t.stun, ANVIL.stun);
      world.emit({ type: "stun", fighter: t.index });
      spawnMark(world, self, { style: "anvil", x, y, nx, ny, ttl: 0.9 });
      signature(world, self, x, y, "#ffd45e", "HAMMER & ANVIL!");
    },
    onHit(world, self, target, p) {
      if (p !== "active") return;
      const s = anvil(self);
      s.until = world.time + ANVIL.window;
      s.target = target.index;
      // The charge lands with a shockwave that throws the enemy back.
      world.emit({ type: "stomp", fighter: self.index, x: target.x, y: target.y, radius: 150 });
    },
    damageMultiplier: (p) => (p === "active" ? 2.8 : 1),
    knockbackMultiplier: (p) => (p === "active" ? 3 : 1),
    ultimate: {
      name: "BUCEPHALUS",
      active: 3,
      cast(_world, self) {
        // Alexander mounts his legendary horse: huge, fast and stomping.
        self.radius = self.def.radius * 1.6;
        self.speedMul = 2.2;
        self.relax = 8;
        self.trail = true;
        self.damageTakenMul = 0.7;
      },
      whileActive(world, self, dt, t) {
        steerToward(world, self, 4 * dt);
        if (ticks(t, dt, 0.5, 0.25) === 0) return;
        const reach = self.radius * 2.2;
        world.emit({ type: "stomp", fighter: self.index, x: self.x, y: self.y, radius: reach });
        for (const f of world.fighters) {
          if (!f.alive || f.side === self.side) continue;
          if (Math.hypot(f.x - self.x, f.y - self.y) > reach) continue;
          world.dealDamage(self, f, 40, f.x, f.y, 500);
        }
      },
      onEnd(_world, self) {
        self.radius = self.def.radius;
        self.speedMul = 1;
        self.relax = DEFAULT_RELAX;
        self.trail = false;
        self.damageTakenMul = 1;
      },
      damageMultiplier: 2,
      knockbackMultiplier: 2,
    },
  }),
};

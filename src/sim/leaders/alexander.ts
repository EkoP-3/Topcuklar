import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { aim, skill, steerToward, ticks } from "./kit";

const DASH_SPEED = 1500;
const ABILITY = {
  name: "COMPANION CHARGE",
  text: "Charges through shields with a shockwave",
};

export const alexander: FighterDef = {
  id: "alexander",
  name: "ALEXANDER",
  description:
    "Büyük İskender. Belli aralıklarla durup nişan alır ve Hetairoi süvarisi gibi rakibe hücum eder; hücumda çok sert vurur, kalkanın yarısını deler ve çarptığı yerde şok dalgası yapar; hücum zehri de temizler. 15. saniyede art arda 2, 30. saniyede 3 hücum yapar.",
  era: "356–323 BC",
  fact: "Never lost a battle; his empire reached from Greece to India.",
  fullName: "Alexander the Great",
  sources: ["https://en.wikipedia.org/wiki/Alexander_the_Great"],
  musicMode: "dorian",
  title: "King of Macedon",
  flag: "vergina",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "CHARGE DMG", base: 115 },
  hp: 950,
  radius: 58,
  mass: 1.1,
  baseSpeed: 440,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 160,
  hitInterval: 0.5,
  contactDamage: 34,
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
      // Nothing slows the Companions: the charge shakes off poison.
      self.poison = 0;
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
    onHit(world, self, target, p) {
      if (p !== "active") return;
      // The charge lands with a shockwave that throws the enemy back.
      world.emit({ type: "stomp", fighter: self.index, x: target.x, y: target.y, radius: 150 });
    },
    damageMultiplier: (p) => (p === "active" ? 3.2 : 1),
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

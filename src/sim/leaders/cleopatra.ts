import type { Fighter, FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnMark } from "../units";
import type { World } from "../world";
import { fan, perFighter, signature, skill, steerToPoint, ticks } from "./kit";
import { drain } from "./domains";

const ASP_SPEED = 700;
const ABILITY = {
  name: "ASP",
  text: "Poison asps; misses become snake traps; her touch charms the enemy",
};

/**
 * Charm (she won over Caesar and Mark Antony): when Cleopatra touches the enemy they
 * fall for her for a while: they hit at half strength and wander off dreamily toward
 * her waiting snakes (or just away from her).
 */
const CHARM = { time: 1.6, cooldown: 6, damage: 0.8, skillRate: 0.5, pull: 5 };
const charm = perFighter(() => ({ ready: 1, left: 0, target: -1 }));

function charmOn(world: World, self: Fighter, target: Fighter): void {
  const s = charm(self);
  if (s.ready > 0 || s.left > 0 || !target.alive || world.phase !== "fight") return;
  s.ready = CHARM.cooldown;
  s.left = CHARM.time;
  s.target = target.index;
  target.boost.damage *= CHARM.damage;
  // Lovestruck: their signature move's cooldown stands still.
  target.boost.skillRate *= CHARM.skillRate;
  spawnMark(world, self, {
    style: "charm",
    x: target.x,
    y: target.y,
    nx: 0,
    ny: 0,
    fighter: target.index,
    ttl: CHARM.time,
  });
  signature(world, self, target.x, target.y - target.radius, "#ff6fa8", "CHARMED!");
}

function endCharm(world: World, self: Fighter): void {
  const s = charm(self);
  const t = world.fighters[s.target];
  if (t) {
    t.boost.damage /= CHARM.damage;
    t.boost.skillRate /= CHARM.skillRate;
  }
  s.left = 0;
  s.target = -1;
}

/** HP per second the enemy loses. */
const NILE = { damage: 5 };

export const cleopatra: FighterDef = {
  id: "cleopatra",
  name: "CLEOPATRA",
  description:
    "Kleopatra. Belli aralıklarla rakibe engerek fırlatır; ısırılan rakip birkaç saniye zehirlenip can kaybeder; ıskalayan engerek yerde 3 sn bekleyen bir yılan tuzağına dönüşür. Önce 1, 15. saniyede 2, 30. saniyede 3 engerek. Cazibe: rakibe dokununca onu büyüler; ona dokunan da büyülenir. Büyülenen rakip 1,6 sn daha zayıf vurur, özel hamlesi yavaşlar ve yılan tuzaklarına doğru sürüklenir.",
  era: "69–30 BC",
  fact: "The last active ruler of Ptolemaic Egypt.",
  fullName: "Cleopatra VII",
  sources: ["https://en.wikipedia.org/wiki/Cleopatra"],
  musicMode: "doubleHarmonic",
  title: "Queen of Egypt",
  flag: "egypt",
  ability: ABILITY,
  domain: {
    name: "THE NILE",
    rule: "Asps of the Nile: the enemy keeps losing HP",
    tick(world, self, dt, t) {
      drain(world, self, dt, t, NILE.damage);
    },
  },
  growth: { perSecond: 0.015, stat: "POISON/S", base: 30 },
  hp: 970,
  radius: 55,
  mass: 1,
  baseSpeed: 460,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 130,
  hitInterval: 0.5,
  contactDamage: 27,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    onHit(world, self, target) {
      charmOn(world, self, target);
    },
    onDamaged(world, self, attacker) {
      // Whoever lays a hand on her falls for her too.
      const gap = Math.hypot(attacker.x - self.x, attacker.y - self.y) - attacker.radius;
      if (attacker !== self && gap < self.radius + attacker.def.reach + 10) {
        charmOn(world, self, attacker);
      }
    },
    passive(world, self, dt) {
      const s = charm(self);
      s.ready = Math.max(0, s.ready - dt);
      if (s.left <= 0) return;
      s.left -= dt;
      const t = world.fighters[s.target];
      if (!t?.alive || s.left <= 0) {
        endCharm(world, self);
        return;
      }
      // Drift toward the nearest snake trap, else away from the queen.
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const h of world.hazards) {
        if (h.kind !== "zone" || h.style !== "snake" || h.owner !== self.index) continue;
        const d = Math.hypot(h.x - t.x, h.y - t.y);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      const goal = best ?? {
        x: Math.min(world.hi, Math.max(world.lo, t.x * 2 - self.x)),
        y: Math.min(world.hi, Math.max(world.lo, t.y * 2 - self.y)),
      };
      steerToPoint(t, goal.x, goal.y, CHARM.pull * dt);
    },
    firstAt: 1.3,
    cooldown: 2.8,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      for (const a of fan(leadAngle(self, enemy, ASP_SPEED), level, 0.45)) {
        fireProjectile(world, self, a, {
          style: "asp",
          speed: ASP_SPEED,
          radius: 15,
          damage: 22,
          knockback: 80,
          blast: 0,
          poison: 4,
          poisonDps: 30,
          bounces: 1,
          leaves: "snake",
          ttl: 3,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "asp" });
    },
    ultimate: {
      name: "SPIRAL OF ASPS",
      active: 1.5,
      cast() {},
      whileActive(world, self, dt, t) {
        // Two arms of asps spiral out of the queen.
        for (let i = ticks(t, dt, 0.09); i > 0; i--) {
          for (const arm of [0, Math.PI]) {
            fireProjectile(world, self, t * 6 + arm, {
              style: "asp",
              speed: 560,
              radius: 15,
              damage: 27,
              knockback: 60,
              blast: 0,
              poison: 4,
              poisonDps: 48,
              bounces: 0,
              ttl: 1.6,
            });
          }
        }
      },
    },
  }),
};

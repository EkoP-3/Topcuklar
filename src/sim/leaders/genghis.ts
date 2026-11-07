import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnStrike } from "../units";
import { fan, perFighter, signature, skill, ticks } from "./kit";

const ARROW_SPEED = 1050;
const ARROWS = [3, 5, 7];
/**
 * Feigned retreat (the Mongols' favourite trick): after a beating up close Genghis gallops
 * away, then turns in the saddle and looses a dense volley at whoever chased him.
 */
const RETREAT = {
  /** Damage taken within `window` seconds that sets it off. */
  trigger: 90,
  window: 0.8,
  cooldown: 7,
  /** Seconds of the flight, and its speed. */
  run: 0.55,
  speed: 1250,
  arrows: 5,
  damage: 22,
};
const retreat = perFighter(() => ({ taken: 0, since: 0, ready: RETREAT.cooldown, run: 0 }));

const ABILITY = {
  name: "HORSE ARCHERS",
  text: "Fast rider; arrow volleys pierce soldiers; feigned retreat when hurt",
};

export const genghis: FighterDef = {
  id: "genghis",
  name: "GENGHIS KHAN",
  description:
    "Cengiz Han. Hızlı hareket eder ve sık sık atlı okçu gibi oklu yaylım atar (oklar askerlerin içinden geçer; 30. saniyeden sonra art arda iki yaylım): önce 3, 15. saniyede 5, 30. saniyede 7 ok. Sahte geri çekilme: yakın dövüşte kısa sürede çok hasar alınca hızla kaçar, sonra dönüp sık bir ok yaylımı atar.",
  era: "c. 1162–1227",
  fact: "Founded the Mongol Empire, later the largest contiguous land empire in history.",
  fullName: "Genghis Khan",
  sources: ["https://en.wikipedia.org/wiki/Genghis_Khan"],
  musicMode: "pentatonic",
  title: "Great Khan of the Mongols",
  flag: "mongolia",
  ability: ABILITY,
  domain: {
    name: "THE STEPPE",
    rule: "Endless steppe: a faster rider and quicker volleys",
    buff: { speed: 1.15, skillRate: 1.4 },
  },
  growth: { perSecond: 0.015, stat: "ARROW DMG", base: 29 },
  hp: 1010,
  radius: 52,
  mass: 0.9,
  baseSpeed: 540,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 120,
  hitInterval: 0.5,
  contactDamage: 23,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    onDamaged(world, self, attacker, damage) {
      const s = retreat(self);
      if (s.run > 0 || s.ready > 0 || self.ability?.ultActive?.()) return;
      // Only a beating in close combat: lure the pursuer in.
      const gap =
        Math.hypot(attacker.x - self.x, attacker.y - self.y) - self.radius - attacker.radius;
      if (attacker === self || gap > attacker.def.reach + 30) return;
      if (world.time - s.since > RETREAT.window) {
        s.since = world.time;
        s.taken = 0;
      }
      s.taken += damage;
      if (s.taken < RETREAT.trigger) return;
      // Flee straight away from the attacker.
      s.run = RETREAT.run;
      s.ready = RETREAT.cooldown;
      const a = Math.atan2(self.y - attacker.y, self.x - attacker.x);
      self.vx = Math.cos(a) * RETREAT.speed;
      self.vy = Math.sin(a) * RETREAT.speed;
      self.speedMul = RETREAT.speed / self.def.baseSpeed;
      self.relax = 1;
      self.trail = true;
      world.emit({ type: "dash", fighter: self.index });
    },
    passive(world, self, dt) {
      const s = retreat(self);
      s.ready = Math.max(0, s.ready - dt);
      if (s.run <= 0) return;
      s.run -= dt;
      if (s.run > 0) return;
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
      self.trail = false;
      // Turn in the saddle and shoot.
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      const aimAt = leadAngle(self, enemy, ARROW_SPEED);
      for (const a of fan(aimAt, RETREAT.arrows, 0.07)) {
        fireProjectile(world, self, a, {
          style: "arrow",
          speed: ARROW_SPEED,
          radius: 9,
          damage: RETREAT.damage,
          knockback: 90,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 0,
          ttl: 2,
        });
      }
      self.vx = Math.cos(aimAt) * self.def.baseSpeed * 0.4;
      self.vy = Math.sin(aimAt) * self.def.baseSpeed * 0.4;
      world.emit({ type: "shoot", fighter: self.index, style: "arrow" });
      signature(world, self, self.x, self.y, "#ffd45e", "TURN AND FIRE!");
    },
    firstAt: 1.2,
    cooldown: 1.9,
    charges: (level) => (level >= 3 ? 2 : 1),
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      const count = ARROWS[level - 1] ?? 3;
      for (const a of fan(leadAngle(self, enemy, ARROW_SPEED), count, 0.4 / Math.sqrt(count))) {
        fireProjectile(world, self, a, {
          style: "arrow",
          speed: ARROW_SPEED,
          radius: 9,
          damage: 29,
          knockback: 60,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 0,
          ttl: 2,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "arrow" });
    },
    ultimate: {
      name: "ARROW STORM",
      active: 2.2,
      cast(_world, self) {
        self.speedMul = 1.6;
      },
      whileActive(world, self, dt) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // The sky fills with arrows falling around the enemy.
        for (let i = ticks(world.time, dt, 0.07); i > 0; i--) {
          const a = world.rng.range(0, Math.PI * 2);
          const d = Math.sqrt(world.rng.next()) * 120;
          spawnStrike(world, self, {
            style: "arrow",
            x: enemy.x + enemy.vx * 0.35 + Math.cos(a) * d,
            y: enemy.y + enemy.vy * 0.35 + Math.sin(a) * d,
            radius: 26,
            delay: 0.35,
            damage: 24,
            knockback: 40,
          });
        }
      },
      onEnd(_world, self) {
        self.speedMul = 1;
      },
    },
  }),
};

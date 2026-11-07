import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, marksOf, spawnMark, spawnStrike } from "../units";
import { aim, fan, perFighter, signature, skill, ticks } from "./kit";
import { every, shellAtEnemy } from "./domains";

const BALL_SPEED = 760;
const ABILITY = {
  name: "GREAT BOMBARD",
  text: "Giant shell that leaves a burning crater; breaches the walls it hits",
};

/**
 * Siege (the walls of Constantinople): a bombard blast that reaches a wall breaches it.
 * An enemy who bounces off the wall at a breach is hit by the rubble and stunned.
 */
const BREACH = { reach: 1, max: 3, half: 100, damage: 26, stun: 0.45, lock: 1.5 };
const breachLock = perFighter(() => ({ ready: 0 }));

const CONSTANTINOPLE = { radius: 120, delay: 1, damage: 74, knockback: 600 };

export const mehmed: FighterDef = {
  id: "mehmed",
  name: "MEHMED II",
  description:
    "Fatih Sultan Mehmed. Belli aralıklarla durup Şahi topunu doldurur ve dev gülle atar; gülle çarptığı yerde patlar ve 2 sn yanan bir krater bırakır. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle. Kuşatma: duvara çarpan gülle orada gedik açar; gedikten seken rakip moloz altında kalır, hasar alır ve sersemler.",
  era: "1432–1481",
  fact: "Took Constantinople in 1453 with the help of giant bombards.",
  fullName: "Mehmed II (the Conqueror)",
  sources: ["https://en.wikipedia.org/wiki/Mehmed_II"],
  musicMode: "hijaz",
  title: "Ottoman Sultan",
  flag: "turkey",
  ability: ABILITY,
  domain: {
    name: "CONSTANTINOPLE",
    rule: "The walls fall: giant shells rain down",
    tick(world, self, dt, t) {
      if (every(t, dt, 1.7)) shellAtEnemy(world, self, CONSTANTINOPLE);
    },
  },
  growth: { perSecond: 0.015, stat: "BOMBARD DMG", base: 110 },
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
  contactDamage: 24,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    onBlast(world, self, shot) {
      if (shot.style !== "bombard" || world.phase !== "fight") return;
      // The blast reaches the nearest wall?
      const walls = [
        { d: shot.x - world.lo, nx: 1, ny: 0 },
        { d: world.hi - shot.x, nx: -1, ny: 0 },
        { d: shot.y - world.lo, nx: 0, ny: 1 },
        { d: world.hi - shot.y, nx: 0, ny: -1 },
      ].sort((a, b) => a.d - b.d);
      const w = walls[0];
      if (!w || w.d > shot.blast * BREACH.reach) return;
      const hit = {
        x: w.nx > 0 ? world.lo : w.nx < 0 ? world.hi : shot.x,
        y: w.ny > 0 ? world.lo : w.ny < 0 ? world.hi : shot.y,
        nx: w.nx,
        ny: w.ny,
      };
      const old = marksOf(world, self, "breach");
      for (let i = 0; i <= old.length - BREACH.max; i++) {
        const o = old[i];
        if (o) o.ttl = Math.min(o.ttl, 0.3);
      }
      spawnMark(world, self, { style: "breach", ...hit, ttl: Infinity });
    },
    passive(world, self, dt) {
      const lock = breachLock(self);
      lock.ready = Math.max(0, lock.ready - dt);
      if (lock.ready > 0) return;
      for (const b of marksOf(world, self, "breach")) {
        if (b.ttl < 0.3) continue;
        for (const f of world.fighters) {
          if (!f.alive || f.side === self.side) continue;
          // Touching the breached wall (which may have slid in during a frenzy)?
          const wall = b.nx > 0 || b.ny > 0 ? world.lo : world.hi;
          const edge = b.nx !== 0 ? f.x - b.nx * f.radius : f.y - b.ny * f.radius;
          if (Math.abs(edge - wall) > 3) continue;
          const along = b.nx !== 0 ? f.y - b.y : f.x - b.x;
          if (Math.abs(along) > BREACH.half) continue;
          lock.ready = BREACH.lock;
          const x = b.nx !== 0 ? wall : f.x;
          const y = b.nx !== 0 ? f.y : wall;
          world.dealDamage(self, f, BREACH.damage, x, y, 240, {
            fromX: x - b.nx * 10,
            fromY: y - b.ny * 10,
          });
          f.stun = Math.max(f.stun, BREACH.stun);
          world.emit({ type: "stun", fighter: f.index });
          world.emit({ type: "blast", x, y, radius: 70 });
          signature(world, self, x, y, "#c9a27a", "BREACH!");
          return;
        }
      }
    },
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
          damage: 110,
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
            damage: 83,
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
            damage: 166,
            knockback: 900,
          });
        }
      },
    },
  }),
};

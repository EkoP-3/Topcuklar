import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, marksOf, spawnMark, spawnUnit, unitsOf } from "../units";
import { fan, perFighter, signature, skill, ticks } from "./kit";
import { every, shellAtEnemy } from "./domains";

const BALL_SPEED = 900;
const ABILITY = {
  name: "GRAND BATTERY",
  text: "Cannonballs that bounce twice; wall bounces build a grand battery",
};

/**
 * The grand battery: every BATTERY.every-th time Napoleon bounces off a wall he leaves a
 * cannon there; once BATTERY.guns stand, they all fire at the enemy at once.
 */
const BATTERY = { every: 2, guns: 3, damage: 40, knockback: 360 };
const bounces = perFighter(() => ({ n: 0, last: -1 }));

const AUSTERLITZ = { radius: 90, delay: 0.8, damage: 34, knockback: 320 };

export const napoleon: FighterDef = {
  id: "napoleon",
  name: "NAPOLEON",
  description:
    "Napolyon. Küçük ve çevik; belli aralıklarla ağır top güllesi atar, gülle iki kez duvardan seker. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle. Büyük batarya: duvardan her iki sekişinde oraya bir top kurar; üç top olunca hepsi birden rakibe ateş eder.",
  era: "1769–1821",
  fact: "An artillery officer who crowned himself Emperor of the French in 1804.",
  fullName: "Napoleon Bonaparte",
  sources: ["https://en.wikipedia.org/wiki/Napoleon"],
  musicMode: "harmonicMinor",
  title: "Emperor of the French",
  flag: "france",
  ability: ABILITY,
  domain: {
    name: "AUSTERLITZ",
    rule: "The Grand Battery: shells rain on the enemy",
    tick(world, self, dt, t) {
      if (every(t, dt, 0.9)) shellAtEnemy(world, self, AUSTERLITZ);
    },
  },
  growth: { perSecond: 0.015, stat: "CANNON DMG", base: 74 },
  hp: 860,
  radius: 48,
  mass: 0.85,
  baseSpeed: 470,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 120,
  hitInterval: 0.5,
  contactDamage: 20,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    quiet: true,
    onWallHit(world, self, hit) {
      const s = bounces(self);
      // Only real bounces count, not grinding along a wall.
      if (world.phase !== "fight" || world.time - s.last < 0.3) return;
      s.last = world.time;
      if (++s.n % BATTERY.every !== 0) return;
      spawnMark(world, self, { style: "cannon", ...hit, ttl: Infinity });
      world.emit({ type: "summon", fighter: self.index, style: "guard", x: hit.x, y: hit.y });
      // Guns that already fired are on their way out.
      const guns = marksOf(world, self, "cannon").filter((g) => g.ttl === Infinity);
      if (guns.length < BATTERY.guns) return;
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      for (const g of guns) {
        const from = { x: g.x + g.nx * 20, y: g.y + g.ny * 20 };
        fireProjectile(
          world,
          self,
          Math.atan2(enemy.y - from.y, enemy.x - from.x),
          {
            style: "ball",
            speed: BALL_SPEED,
            radius: 16,
            damage: BATTERY.damage,
            knockback: BATTERY.knockback,
            blast: 0,
            poison: 0,
            poisonDps: 0,
            bounces: 0,
            ttl: 2,
          },
          from,
        );
        signature(world, self, from.x, from.y, "#ffb15c");
        g.ttl = 0.35;
      }
      signature(world, self, self.x, self.y, "#ffb15c", "FIRE!");
      world.emit({ type: "shoot", fighter: self.index, style: "ball" });
    },
    firstAt: 1.4,
    cooldown: 2.4,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      for (const a of fan(leadAngle(self, enemy, BALL_SPEED), level, 0.32)) {
        fireProjectile(world, self, a, {
          style: "ball",
          speed: BALL_SPEED,
          radius: 16,
          damage: 74,
          knockback: 420,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 2,
          ttl: 3,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "ball" });
    },
    ultimate: {
      name: "IMPERIAL GUARD",
      active: 2.6,
      cast(world, self) {
        // Five grenadiers form a firing line beside the Emperor.
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        const a = Math.atan2(enemy.y - self.y, enemy.x - self.x);
        const px = -Math.sin(a);
        const py = Math.cos(a);
        for (let i = -2; i <= 2; i++) {
          spawnUnit(
            world,
            self,
            {
              style: "guard",
              radius: 26,
              mass: 1.5,
              speed: 0,
              hp: 160,
              damage: 35,
              knockback: 200,
              stun: 0,
              hitInterval: 0.6,
              ttl: 5,
            },
            a,
            {
              x: self.x + Math.cos(a) * 80 + px * i * 62,
              y: self.y + Math.sin(a) * 80 + py * i * 62,
            },
          );
        }
      },
      whileActive(world, self, dt, t) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        const guards = unitsOf(world, self, "guard");
        // Three volleys: every grenadier fires at once.
        for (const at of [0.5, 1.1, 1.7]) {
          if (ticks(t, dt, 99, at) === 0) continue;
          for (const g of guards) {
            fireProjectile(
              world,
              self,
              Math.atan2(enemy.y - g.y, enemy.x - g.x),
              {
                style: "musket",
                speed: 1300,
                radius: 9,
                damage: 25,
                knockback: 120,
                blast: 0,
                poison: 0,
                poisonDps: 0,
                bounces: 0,
                ttl: 1.2,
              },
              { x: g.x, y: g.y },
            );
          }
          world.emit({ type: "shoot", fighter: self.index, style: "musket" });
        }
        // Then they charge with bayonets.
        if (ticks(t, dt, 99, 2.1) > 0) for (const g of guards) g.speed = 360;
      },
    },
  }),
};

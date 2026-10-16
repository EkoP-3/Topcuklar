import type { FighterDef } from "../types";
import { fireProjectile, leadAngle, spawnUnit, unitsOf } from "../units";
import { fan, skill, ticks } from "./kit";

const BALL_SPEED = 900;
const ABILITY = { name: "GRAND BATTERY", text: "Cannonballs that bounce twice" };

export const napoleon: FighterDef = {
  id: "napoleon",
  name: "NAPOLEON",
  description:
    "Napolyon. Küçük ve çevik; belli aralıklarla ağır top güllesi atar, gülle iki kez duvardan seker. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle.",
  era: "1769–1821",
  fact: "An artillery officer who crowned himself Emperor of the French in 1804.",
  fullName: "Napoleon Bonaparte",
  sources: ["https://en.wikipedia.org/wiki/Napoleon"],
  musicMode: "harmonicMinor",
  title: "Emperor of the French",
  flag: "france",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "CANNON DMG", base: 73 },
  hp: 900,
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
          damage: 73,
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
              damage: 33,
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

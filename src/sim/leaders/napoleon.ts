import type { FighterDef } from "../types";
import { fireProjectile, leadAngle } from "../units";
import { fan, skill } from "./kit";

const BALL_SPEED = 900;
const ABILITY = { name: "GRAND BATTERY", text: "Cannonballs that bounce once" };

export const napoleon: FighterDef = {
  id: "napoleon",
  name: "NAPOLEON",
  description:
    "Napolyon. Küçük ve çevik; belli aralıklarla ağır top güllesi atar, gülle bir kez duvardan seker. Önce 1, 15. saniyede 2, 30. saniyede 3 gülle.",
  era: "1769–1821",
  fact: "An artillery officer who crowned himself Emperor of the French in 1804.",
  title: "Emperor of the French",
  flag: "france",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "CANNON DMG", base: 65 },
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
  contactDamage: 19,
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
          damage: 65,
          knockback: 420,
          blast: 0,
          poison: 0,
          poisonDps: 0,
          bounces: 1,
          ttl: 3,
        });
      }
      world.emit({ type: "shoot", fighter: self.index, style: "ball" });
    },
    ultimate: {
      name: "AUSTERLITZ",
      cast(world, self) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        for (let i = 0; i < 8; i++) {
          // Guns all around the arena edge, every one aimed at the enemy.
          const a = (i / 8) * Math.PI * 2;
          const from = { x: 360 + Math.cos(a) * 340, y: 360 + Math.sin(a) * 340 };
          fireProjectile(
            world,
            self,
            Math.atan2(enemy.y - from.y, enemy.x - from.x),
            {
              style: "ball",
              speed: 800,
              radius: 18,
              damage: 43,
              knockback: 300,
              blast: 0,
              poison: 0,
              poisonDps: 0,
              bounces: 0,
              ttl: 2,
            },
            from,
          );
        }
        world.emit({ type: "shoot", fighter: self.index, style: "bombard" });
      },
    },
  }),
};

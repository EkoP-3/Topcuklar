import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { spawnZone } from "../units";
import { skill, steerToward, ticks } from "./kit";

const DASH_SPEED = 1450;
const ABILITY = { name: "STAKES", text: "Plants stakes that hurt and stun on touch" };

export const vlad: FighterDef = {
  id: "vlad",
  name: "VLAD III",
  description:
    "Kazıklı Voyvoda. Belli aralıklarla rakibin gideceği yola kazıklar diker; kazığa çarpan geri seker, hasar alır ve kısa süre sersemler. Önce 2, 15. saniyede 3, 30. saniyede 4 kazık. Ultimate'ta arena kararır ve Vlad karanlıkta üç kez saldırır.",
  era: "1431–1476",
  fact: "Fought the Ottomans; his 1462 Night Attack nearly reached Mehmed II's tent.",
  fullName: "Vlad III Dracula (the Impaler)",
  sources: ["https://en.wikipedia.org/wiki/Vlad_the_Impaler"],
  musicMode: "harmonicMinor",
  title: "Prince of Wallachia",
  flag: "romania",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "STAKE DMG", base: 54 },
  hp: 1000,
  radius: 56,
  mass: 1.1,
  baseSpeed: 470,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 28,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.5,
    cooldown: 3.5,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      // Stakes go up where the enemy is heading.
      const count = level + 1;
      for (let i = 0; i < count; i++) {
        const t = 0.3 + i * 0.18;
        spawnZone(world, self, {
          style: "stakes",
          x: enemy.x + enemy.vx * t + world.rng.range(-45, 45),
          y: enemy.y + enemy.vy * t + world.rng.range(-45, 45),
          radius: 22,
          ttl: 5,
          damage: 54,
          poison: 0,
          poisonDps: 0,
        });
      }
    },
    ultimate: {
      name: "NIGHT ATTACK",
      active: 2.4,
      cast(world, self) {
        world.darkness = 2.7;
        self.speedMul = 1.6;
        self.relax = 10;
        self.trail = true;
        self.damageTakenMul = 0.8;
      },
      whileActive(world, self, dt, t) {
        // Three strikes out of the dark.
        if (ticks(t, dt, 0.8, 0.15) > 0) {
          const enemy = world.nearestEnemy(self);
          if (enemy) {
            const a = Math.atan2(enemy.y - self.y, enemy.x - self.x);
            self.vx = Math.cos(a) * DASH_SPEED;
            self.vy = Math.sin(a) * DASH_SPEED;
            world.emit({ type: "dash", fighter: self.index });
          }
        } else {
          steerToward(world, self, 2 * dt);
        }
      },
      onEnd(_world, self) {
        self.speedMul = 1;
        self.relax = DEFAULT_RELAX;
        self.trail = false;
        self.damageTakenMul = 1;
      },
      damageMultiplier: 2.2,
      knockbackMultiplier: 2,
    },
  }),
};

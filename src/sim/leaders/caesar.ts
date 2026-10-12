import type { FighterDef } from "../types";
import { ARENA } from "../world";
import { spawnUnit, countUnits } from "../units";
import { aim, fan, skill, ticks } from "./kit";

const ABILITY = { name: "LEGIONS", text: "Summons legionaries that chase" };

export const caesar: FighterDef = {
  id: "caesar",
  name: "CAESAR",
  description:
    "Jül Sezar. Belli aralıklarla lejyoner çağırır; lejyonerler rakibi kovalar ve temas ettikçe hasar verir. Önce 2, 15. saniyede 3, 30. saniyede 4 lejyoner.",
  era: "100–44 BC",
  fact: "Crossed the Rubicon in 49 BC and started a civil war.",
  title: "Dictator of Rome",
  flag: "spqr",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "LEGION DMG", base: 26 },
  hp: 1000,
  radius: 58,
  mass: 1,
  baseSpeed: 430,
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
    firstAt: 1.5,
    cooldown: 4.5,
    cast(world, self, level) {
      const wave = level + 1;
      const room = wave * 2 - countUnits(world, self, "legion");
      const count = Math.min(wave, room);
      for (const a of fan(aim(world, self), count, 1.8 / Math.max(1, count - 1))) {
        spawnUnit(
          world,
          self,
          {
            style: "legion",
            radius: 27,
            mass: 0.35,
            speed: 340,
            hp: 95,
            damage: 26,
            knockback: 90,
            stun: 0,
            hitInterval: 0.6,
            ttl: 8,
          },
          a,
        );
      }
    },
    ultimate: {
      name: "VENI, VIDI, VICI",
      active: 1.7,
      cast(world, self) {
        // VENI — he came: Caesar appears right next to the enemy.
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        const a = Math.atan2(self.y - enemy.y, self.x - enemy.x);
        const d = self.radius + enemy.radius + 6;
        self.x = Math.min(ARENA - self.radius, Math.max(self.radius, enemy.x + Math.cos(a) * d));
        self.y = Math.min(ARENA - self.radius, Math.max(self.radius, enemy.y + Math.sin(a) * d));
        self.vx = 0;
        self.vy = 0;
        world.emit({ type: "callout", fighter: self.index, text: "VENI" });
        world.emit({ type: "dash", fighter: self.index });
      },
      whileActive(world, self, dt, t) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // VIDI — he saw: the enemy is frozen in place.
        if (ticks(t, dt, 99, 0.5) > 0) {
          enemy.stun = Math.max(enemy.stun, 1.1);
          world.emit({ type: "stun", fighter: enemy.index });
          world.emit({ type: "callout", fighter: self.index, text: "VIDI" });
        }
        // VICI — he conquered: three heavy blows.
        if (ticks(t, dt, 99, 1) > 0) {
          world.emit({ type: "callout", fighter: self.index, text: "VICI" });
        }
        for (const [at, kb] of [
          [1, 150],
          [1.2, 150],
          [1.4, 1000],
        ] as const) {
          if (ticks(t, dt, 99, at) > 0) {
            world.dealDamage(self, enemy, 60, enemy.x, enemy.y, kb);
          }
        }
      },
    },
  }),
};

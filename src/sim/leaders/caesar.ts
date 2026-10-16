import type { FighterDef } from "../types";
import { spawnUnit, countUnits } from "../units";
import { aim, fan, skill, ticks } from "./kit";

const ABILITY = { name: "LEGIONS", text: "Legionaries chase and lock shields" };

export const caesar: FighterDef = {
  id: "caesar",
  name: "CAESAR",
  description:
    "Jül Sezar. Belli aralıklarla lejyoner çağırır; lejyonerler rakibi kovalar ve temas ettikçe hasar verir; rakibe yaklaşınca kalkan duvarı (testudo) kurup daha az hasar alırlar. Önce 2, 15. saniyede 3, 30. saniyede 4 lejyoner.",
  era: "100–44 BC",
  fact: "Crossed the Rubicon in 49 BC and started a civil war.",
  fullName: "Julius Caesar",
  sources: ["https://en.wikipedia.org/wiki/Julius_Caesar"],
  musicMode: "dorian",
  title: "Dictator of Rome",
  flag: "spqr",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "LEGION DMG", base: 26 },
  hp: 970,
  radius: 58,
  mass: 1,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 23,
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
        const lo = world.lo + self.radius;
        const hi = world.hi - self.radius;
        self.x = Math.min(hi, Math.max(lo, enemy.x + Math.cos(a) * d));
        self.y = Math.min(hi, Math.max(lo, enemy.y + Math.sin(a) * d));
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

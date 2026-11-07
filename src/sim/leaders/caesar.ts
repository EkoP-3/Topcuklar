import type { FighterDef } from "../types";
import { spawnMark, spawnUnit, countUnits } from "../units";
import { aim, fan, perFighter, signature, skill, ticks } from "./kit";
import { hurtOnWalls } from "./domains";

const ABILITY = {
  name: "LEGIONS",
  text: "Legionaries chase and lock shields; crossing the Rubicon makes him faster",
};

/**
 * Crossing the Rubicon: a river runs across the arena between Caesar and the enemy.
 * Once he crosses it there is no way back: faster and harder-hitting for the rest of
 * the fight. `at` = how far from Caesar toward the enemy the river runs (0..1).
 */
const RUBICON = { at: 0.6, speed: 1.15, damage: 1.08 };
const rubicon = perFighter(() => ({ placed: false, crossed: false }));

const ALESIA = { damage: 18, knockback: 260 };

export const caesar: FighterDef = {
  id: "caesar",
  name: "CAESAR",
  description:
    "Jül Sezar. Belli aralıklarla lejyoner çağırır; lejyonerler rakibi kovalar ve temas ettikçe hasar verir; rakibe yaklaşınca kalkan duvarı (testudo) kurup daha az hasar alırlar. Önce 2, 15. saniyede 3, 30. saniyede 4 lejyoner. Rubikon: arenadaki nehri bir kez geçince maç boyunca daha hızlı olur ve daha sert vurur.",
  era: "100–44 BC",
  fact: "Crossed the Rubicon in 49 BC and started a civil war.",
  fullName: "Julius Caesar",
  sources: ["https://en.wikipedia.org/wiki/Julius_Caesar"],
  musicMode: "dorian",
  title: "Dictator of Rome",
  flag: "spqr",
  ability: ABILITY,
  domain: {
    name: "ALESIA",
    rule: "Siege walls: the enemy is hurt on every wall hit",
    tick(world, self, dt) {
      hurtOnWalls(world, self, dt, ALESIA);
    },
  },
  growth: { perSecond: 0.015, stat: "LEGION DMG", base: 31 },
  hp: 950,
  radius: 58,
  mass: 1,
  baseSpeed: 430,
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
    passive(world, self) {
      const s = rubicon(self);
      if (s.crossed) return;
      if (!s.placed) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        s.placed = true;
        const dx = enemy.x - self.x;
        const dy = enemy.y - self.y;
        const d = Math.hypot(dx, dy) || 1;
        spawnMark(world, self, {
          style: "rubicon",
          x: self.x + dx * RUBICON.at,
          y: self.y + dy * RUBICON.at,
          nx: dx / d,
          ny: dy / d,
          ttl: Infinity,
        });
        return;
      }
      const river = world.hazards.find(
        (h) => h.kind === "mark" && h.style === "rubicon" && h.owner === self.index,
      );
      if (river?.kind !== "mark") return;
      if ((self.x - river.x) * river.nx + (self.y - river.y) * river.ny < 0) return;
      // Alea iacta est.
      s.crossed = true;
      river.ttl = 0.6;
      self.boost.speed *= RUBICON.speed;
      self.boost.damage *= RUBICON.damage;
      signature(world, self, self.x, self.y, "#4a8fd6", "ALEA IACTA EST!");
    },
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
            damage: 31,
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

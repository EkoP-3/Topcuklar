import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { countUnits, spawnUnit, spawnWall } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "TERRACOTTA ARMY", text: "Clay soldiers march slowly and block shots" };
const WALL_HALF_LENGTH = 220;
/** Damage when the enemy is slammed into the wall. */
const WALL = { damage: 60 };

export const qin: FighterDef = {
  id: "qin",
  name: "QIN SHI HUANG",
  description:
    "Çin'in ilk imparatoru. Belli aralıklarla yavaş ama dayanıklı terracotta askerleri çıkarır; askerler mermileri gövdeleriyle durdurur. Önce 2, 15. saniyede 3, 30. saniyede 4 asker. Ultimate'ta rakibin arkasına bir sur örer ve rakibi sura doğru ezer.",
  era: "259–210 BC",
  fact: "Unified China in 221 BC and was buried with the Terracotta Army.",
  fullName: "Qin Shi Huang",
  sources: ["https://en.wikipedia.org/wiki/Qin_Shi_Huang"],
  musicMode: "gong",
  title: "First Emperor of China",
  flag: "qin",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "SOLDIER DMG", base: 40 },
  hp: 1000,
  radius: 58,
  mass: 1.2,
  baseSpeed: 430,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 38,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.8,
    cooldown: 5,
    cast(world, self, level) {
      const count = Math.max(
        0,
        Math.min(level + 1, level + 3 - countUnits(world, self, "terracotta")),
      );
      for (const a of fan(aim(world, self), count, 0.7)) {
        spawnUnit(
          world,
          self,
          {
            style: "terracotta",
            radius: 26,
            mass: 2,
            speed: 150,
            hp: 140,
            damage: 40,
            knockback: 260,
            stun: 0,
            hitInterval: 0.8,
            ttl: 8,
          },
          a,
        );
      }
    },
    ultimate: {
      name: "GREAT WALL",
      active: 1.4,
      cast(world, self) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // A wall rises just behind the enemy, across the line between them. It is
        // shortened along its own line (never bent) to stay inside the arena.
        const a = Math.atan2(enemy.y - self.y, enemy.x - self.x);
        const half = 14;
        const lo = world.lo + half;
        const hi = world.hi - half;
        const inside = (v: number) => Math.min(hi, Math.max(lo, v));
        const cx = inside(enemy.x + Math.cos(a) * (enemy.radius + 45));
        const cy = inside(enemy.y + Math.sin(a) * (enemy.radius + 45));
        const ux = -Math.sin(a);
        const uy = Math.cos(a);
        const reach = (dir: number): number => {
          let t = WALL_HALF_LENGTH;
          for (const [c, u] of [
            [cx, ux * dir],
            [cy, uy * dir],
          ] as const) {
            if (u > 1e-9) t = Math.min(t, (hi - c) / u);
            else if (u < -1e-9) t = Math.min(t, (lo - c) / u);
          }
          return Math.max(0, t);
        };
        const t1 = reach(-1);
        const t2 = reach(1);
        if (t1 + t2 >= 80) {
          spawnWall(world, self, {
            x1: cx - ux * t1,
            y1: cy - uy * t1,
            x2: cx + ux * t2,
            y2: cy + uy * t2,
            half,
            ttl: 4,
            damage: WALL.damage,
          });
        }
        // ...and the emperor drives them into it.
        self.speedMul = 2.6;
        self.relax = 6;
        self.trail = true;
        self.vx = Math.cos(a) * 1200;
        self.vy = Math.sin(a) * 1200;
        world.emit({ type: "dash", fighter: self.index });
      },
      onEnd(_world, self) {
        self.speedMul = 1;
        self.relax = DEFAULT_RELAX;
        self.trail = false;
      },
      damageMultiplier: 2,
      knockbackMultiplier: 2,
    },
  }),
};

import { ARENA, DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { countUnits, spawnUnit, spawnWall } from "../units";
import { aim, fan, skill } from "./kit";

const ABILITY = { name: "TERRACOTTA ARMY", text: "Clay soldiers march slowly and block shots" };
const WALL_HALF_LENGTH = 220;

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
  growth: { perSecond: 0.015, stat: "SOLDIER DMG", base: 39 },
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
  contactDamage: 37,
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
            damage: 39,
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
        // A wall rises just behind the enemy, across the line between them...
        const a = Math.atan2(enemy.y - self.y, enemy.x - self.x);
        const cx = enemy.x + Math.cos(a) * (enemy.radius + 45);
        const cy = enemy.y + Math.sin(a) * (enemy.radius + 45);
        const px = -Math.sin(a) * WALL_HALF_LENGTH;
        const py = Math.cos(a) * WALL_HALF_LENGTH;
        const clampA = (v: number) => Math.min(ARENA, Math.max(0, v));
        spawnWall(world, self, {
          x1: clampA(cx - px),
          y1: clampA(cy - py),
          x2: clampA(cx + px),
          y2: clampA(cy + py),
          half: 14,
          ttl: 4,
          damage: 59,
        });
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

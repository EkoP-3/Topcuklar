import { DEFAULT_RELAX } from "../world";
import type { FighterDef } from "../types";
import { closestOnSegment } from "../geom";
import { damageUnitsAlong, fireProjectile } from "../units";
import { aim, fan, skill, ticks } from "./kit";

/** The cut of the iai slash. */
const SLASH = { damage: 116, knockback: 380 };
const ABILITY = { name: "IAI SLASH", text: "Lightning dash that cuts everything in its path" };

export const nobunaga: FighterDef = {
  id: "nobunaga",
  name: "ODA NOBUNAGA",
  description:
    "Oda Nobunaga. Belli aralıklarla kısa bir an durup nişan alır ve ışık hızında atılır; geçtiği hattaki rakip büyük hasar alır, arkada kesik izi kalır. 15. saniyede atılım uzar, 30. saniyede art arda iki kez atılır. Ultimate'ta (Nagashino) üç sıra tüfek yaylımı yapar.",
  era: "1534–1582",
  fact: "Won the Battle of Nagashino in 1575 with massed arquebus volleys.",
  fullName: "Oda Nobunaga",
  sources: ["https://en.wikipedia.org/wiki/Oda_Nobunaga"],
  musicMode: "in",
  title: "Unifier of Japan",
  flag: "japan",
  ability: ABILITY,
  domain: {
    name: "AZUCHI CASTLE",
    rule: "Under the cherry blossoms: slashes come far quicker",
    buff: { skillRate: 2 },
  },
  growth: { perSecond: 0.015, stat: "SLASH DMG", base: 116 },
  hp: 960,
  radius: 54,
  mass: 1,
  baseSpeed: 500,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 34,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.8,
    cooldown: 2.8,
    windup: 0.35,
    charges: (level) => (level >= 3 ? 2 : 1),
    onWindup(world, self) {
      self.speedMul = 0.15;
      self.relax = 8;
      world.emit({ type: "charge", fighter: self.index });
    },
    whileWindup(world, self) {
      // Held every tick so an ultimate in between cannot leave him half-paused.
      self.speedMul = 0.15;
      self.relax = 8;
      self.angle = aim(world, self);
    },
    cast(world, self, level) {
      self.speedMul = 1;
      self.relax = DEFAULT_RELAX;
      const dist = level >= 2 ? 300 : 260;
      const r = self.radius;
      const x1 = self.x;
      const y1 = self.y;
      const cx = Math.cos(self.angle);
      const cy = Math.sin(self.angle);
      const inX = (v: number) => Math.min(world.hi - r, Math.max(world.lo + r, v));
      const inY = inX;
      // The cut runs the full dash line, even if he has to land short of it.
      const xc = inX(x1 + cx * dist);
      const yc = inY(y1 + cy * dist);
      let x2 = xc;
      let y2 = yc;
      // Never land inside an enemy (the push-out could shove him through a wall):
      // step clean past them, or stop short if there is no room behind them.
      for (const f of world.fighters) {
        if (!f.alive || f.side === self.side) continue;
        const gap = r + f.radius + 2;
        if (Math.hypot(x2 - f.x, y2 - f.y) >= gap) continue;
        const along = (f.x - x1) * cx + (f.y - y1) * cy;
        const px = inX(x1 + cx * (along + gap));
        const py = inY(y1 + cy * (along + gap));
        if (Math.hypot(px - f.x, py - f.y) >= gap - 0.5) {
          x2 = px;
          y2 = py;
        } else {
          x2 = inX(x1 + cx * Math.max(0, along - gap));
          y2 = inY(y1 + cy * Math.max(0, along - gap));
        }
      }
      // One step: he is simply on the other side.
      self.x = x2;
      self.y = y2;
      self.vx = Math.cos(self.angle) * 700;
      self.vy = Math.sin(self.angle) * 700;
      world.emit({ type: "slash", fighter: self.index, x1, y1, x2: xc, y2: yc });
      for (const f of world.fighters) {
        if (!f.alive || f.side === self.side) continue;
        const c = closestOnSegment(f.x, f.y, x1, y1, xc, yc);
        if (c.d2 > (f.radius + r * 0.7) ** 2) continue;
        world.dealDamage(self, f, SLASH.damage, c.x, c.y, SLASH.knockback, {
          fromX: c.x,
          fromY: c.y,
        });
      }
      damageUnitsAlong(world, self, x1, y1, xc, yc, r * 0.7, SLASH.damage);
    },
    ultimate: {
      name: "NAGASHINO",
      active: 1.4,
      cast(_world, self) {
        self.speedMul = 0.5;
      },
      whileActive(world, self, dt, t) {
        // Three ranks of arquebusiers fire in turn.
        if (ticks(t, dt, 0.45, 0.1) === 0) return;
        for (const a of fan(aim(world, self), 5, 0.13)) {
          fireProjectile(world, self, a, {
            style: "musket",
            speed: 1100,
            radius: 8,
            damage: 31,
            knockback: 90,
            blast: 0,
            poison: 0,
            poisonDps: 0,
            bounces: 0,
            ttl: 1.5,
          });
        }
        world.emit({ type: "shoot", fighter: self.index, style: "musket" });
      },
      onEnd(_world, self) {
        self.speedMul = 1;
      },
    },
  }),
};

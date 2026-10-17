import type { FighterDef } from "../types";
import { countUnits, spawnSweep, spawnUnit } from "../units";
import { skill } from "./kit";

const ABILITY = { name: "BUFFALO HORNS", text: "Warriors appear on both flanks and close in" };

export const shaka: FighterDef = {
  id: "shaka",
  name: "SHAKA ZULU",
  description:
    "Shaka Zulu. Belli aralıklarla rakibin iki yanında hızlı savaşçılar belirir ve rakibi 'bufalo boynuzları' gibi kıskaca alır. Önce 2, 15. saniyede 4, 30. saniyede 6 savaşçı. Ultimate'ta iki yandan karşılıklı savaşçı dalgaları arenayı geçer.",
  era: "c. 1787–1828",
  fact: "Built the Zulu into a military power with the 'buffalo horns' formation.",
  fullName: "Shaka kaSenzangakhona",
  sources: ["https://en.wikipedia.org/wiki/Shaka"],
  musicMode: "pentatonic",
  title: "King of the Zulu",
  flag: "zulu",
  ability: ABILITY,
  growth: { perSecond: 0.015, stat: "WARRIOR DMG", base: 36 },
  hp: 1000,
  radius: 56,
  mass: 1.05,
  baseSpeed: 490,
  spin: 0,
  reach: 0,
  thickness: 0,
  damage: 0,
  knockback: 140,
  hitInterval: 0.5,
  contactDamage: 45,
  contactInterval: 0.5,
  createAbility: skill({
    label: ABILITY.name,
    firstAt: 1.7,
    cooldown: 4.2,
    cast(world, self, level) {
      const enemy = world.nearestEnemy(self);
      if (!enemy) return;
      const perSide = Math.max(
        0,
        Math.min(level, Math.floor((7 - countUnits(world, self, "impi")) / 2)),
      );
      // The two horns appear on the enemy's flanks...
      const a = Math.atan2(enemy.y - self.y, enemy.x - self.x);
      const px = -Math.sin(a);
      const py = Math.cos(a);
      for (const side of [-1, 1]) {
        for (let i = 0; i < perSide; i++) {
          const along = (i - (perSide - 1) / 2) * 44;
          // Inside the current walls; a flank squeezed onto the enemy flips to the other side.
          const inside = (v: number) => Math.min(world.hi - 22, Math.max(world.lo + 22, v));
          let x = inside(enemy.x + px * side * 210 + Math.cos(a) * along);
          let y = inside(enemy.y + py * side * 210 + Math.sin(a) * along);
          if (Math.hypot(x - enemy.x, y - enemy.y) < enemy.radius + 60) {
            x = inside(enemy.x - px * side * 210 + Math.cos(a) * along);
            y = inside(enemy.y - py * side * 210 + Math.sin(a) * along);
          }
          // ...and charge straight in.
          spawnUnit(
            world,
            self,
            {
              style: "impi",
              radius: 20,
              mass: 0.8,
              speed: 420,
              hp: 50,
              damage: 36,
              knockback: 200,
              stun: 0,
              hitInterval: 0.6,
              ttl: 4.5,
            },
            Math.atan2(enemy.y - y, enemy.x - x),
            { x, y },
          );
        }
      }
    },
    ultimate: {
      name: "IMPI CHARGE",
      cast(world, self) {
        const enemy = world.nearestEnemy(self);
        if (!enemy) return;
        // Waves from both sides at once, across the line between them.
        const ex = enemy.x - self.x;
        const ey = enemy.y - self.y;
        const dirs =
          Math.abs(ex) >= Math.abs(ey)
            ? [
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 },
              ]
            : [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
              ];
        for (const dir of dirs) {
          spawnSweep(world, self, {
            style: "impi",
            speed: 520,
            depth: 60,
            count: 6,
            itemHalf: 24,
            damage: 77,
            knockback: 450,
            stun: 0.2,
            dir,
          });
        }
      },
    },
  }),
};

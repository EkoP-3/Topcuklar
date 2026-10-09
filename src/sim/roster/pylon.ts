import { closestOnSegment } from "../geom";
import type { Ability, ArcHazard, FighterDef, PylonHazard } from "../types";

const MAX_PYLONS = 4;
const ARC_INTERVAL = 2.6;
const ARC_TTL = 0.45;
const ARC_KNOCKBACK = 420;

export const pylon: FighterDef = {
  id: "pylon",
  name: "PYLON",
  description:
    "Duvara her çarptığında duvara bir direk diker. Direkler arasında elektrik yayı çakar; yay ne kadar çok direk varsa o kadar sert vurur.",
  hp: 100,
  radius: 44,
  mass: 1,
  baseSpeed: 500,
  spin: 8.2,
  reach: 74,
  thickness: 20,
  damage: 5,
  knockback: 260,
  hitInterval: 0.3,
  createAbility: () => {
    const pylons: PylonHazard[] = [];
    let arc: ArcHazard | null = null;
    let timer = ARC_INTERVAL;
    const struck = new Set<number>();

    const ability: Ability = {
      onWallHit(world, self, hit) {
        const p: PylonHazard = { kind: "pylon", owner: self.index, x: hit.x, y: hit.y, age: 0 };
        if (pylons.length >= MAX_PYLONS) {
          const oldest = pylons.shift();
          if (oldest) world.removeHazard(oldest);
        }
        pylons.push(p);
        world.hazards.push(p);
        world.emit({ type: "pylon", fighter: self.index, x: hit.x, y: hit.y });
      },
      onTick(world, self, dt) {
        for (const p of pylons) p.age += dt;

        const a = arc;
        if (a) {
          a.ttl -= dt;
          const damage = 4 + 3 * pylons.length;
          for (const t of world.fighters) {
            if (!t.alive || t.side === self.side || struck.has(t.index)) continue;
            for (let i = 0; i + 1 < a.points.length; i++) {
              const p0 = a.points[i];
              const p1 = a.points[i + 1];
              if (!p0 || !p1) continue;
              const c = closestOnSegment(t.x, t.y, p0.x, p0.y, p1.x, p1.y);
              if (c.d2 > (t.radius + 8) ** 2) continue;
              struck.add(t.index);
              world.dealDamage(self, t, damage, t.x, t.y, ARC_KNOCKBACK);
              break;
            }
          }
          if (a.ttl <= 0) {
            world.removeHazard(a);
            arc = null;
            timer = ARC_INTERVAL;
          }
          return;
        }

        if (pylons.length < 2) return;
        timer -= dt;
        if (timer > 0) return;

        const points = pylons.map((p) => ({ x: p.x, y: p.y }));
        const first = points[0];
        if (pylons.length >= 3 && first) points.push({ x: first.x, y: first.y });
        arc = { kind: "arc", owner: self.index, points, ttl: ARC_TTL, maxTtl: ARC_TTL };
        struck.clear();
        world.hazards.push(arc);
        world.emit({ type: "arc", fighter: self.index });
      },
      hud: () =>
        pylons.length < 2
          ? `[INSTALLING ${pylons.length}/${MAX_PYLONS}]`
          : arc
            ? `[ARC!] PYLONS:${pylons.length}`
            : `[CHARGE ${Math.max(0, timer).toFixed(1)}s] PYLONS:${pylons.length}`,
    };
    return ability;
  },
};

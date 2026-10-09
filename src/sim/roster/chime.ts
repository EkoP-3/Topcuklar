import type { Ability, FighterDef, RingHazard } from "../types";

/** Wall hits needed to ring the bell. */
const NEEDED = 7;
const RING_SPEED = 900;
const RING_MAX_RADIUS = 440;
const RING_DAMAGE = 26;
const RING_KNOCKBACK = 700;

export const chime: FighterDef = {
  id: "chime",
  name: "CHIME",
  description:
    "Her duvar vuruşu çanı doldurur. Çan dolunca etrafa şok dalgası yayar; dalga çok sert vurur.",
  hp: 100,
  radius: 46,
  mass: 1,
  baseSpeed: 500,
  spin: 6.5,
  reach: 64,
  thickness: 26,
  damage: 5,
  knockback: 380,
  hitInterval: 0.3,
  createAbility: () => {
    let count = 0;
    let ring: RingHazard | null = null;
    const struck = new Set<number>();

    const ability: Ability = {
      onWallHit(world, self) {
        if (ring) return;
        count++;
        if (count < NEEDED) return;
        count = 0;
        struck.clear();
        ring = {
          kind: "ring",
          owner: self.index,
          x: self.x,
          y: self.y,
          radius: self.radius,
          maxRadius: RING_MAX_RADIUS,
        };
        world.hazards.push(ring);
        world.emit({ type: "ring", fighter: self.index, x: self.x, y: self.y });
      },
      onTick(world, self, dt) {
        const r = ring;
        if (!r) return;
        r.radius += RING_SPEED * dt;
        for (const t of world.fighters) {
          if (!t.alive || t.side === self.side || struck.has(t.index)) continue;
          const d = Math.hypot(t.x - r.x, t.y - r.y);
          if (Math.abs(d - r.radius) > t.radius + 16) continue;
          struck.add(t.index);
          world.dealDamage(self, t, RING_DAMAGE, t.x, t.y, RING_KNOCKBACK);
        }
        if (r.radius >= r.maxRadius) {
          world.removeHazard(r);
          ring = null;
        }
      },
      hud: () => (ring ? "[SHOCKWAVE!]" : `[BELL ${count}/${NEEDED}]`),
    };
    return ability;
  },
};

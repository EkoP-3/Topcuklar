import type {
  Fighter,
  Hazard,
  ProjectileHazard,
  StrikeHazard,
  SweepHazard,
  UnitHazard,
  ZoneHazard,
} from "./types";
import { ARENA, limitSpeed, type World } from "./world";

/** Seconds a unit needs to swing toward a new heading (lower = sharper turns). */
const UNIT_STEER = 3;
/** A projectile passing an enemy within this gap (without hitting) is a close call. */
const PROJECTILE_NEAR_GAP = 8;
/** Units hit by a fighter take this much of the fighter's contact damage. */
const VS_UNIT_DAMAGE = 1.5;

export type UnitSpec = Omit<
  UnitHazard,
  "kind" | "owner" | "x" | "y" | "vx" | "vy" | "maxHp" | "lock" | "hurt"
>;
export type ProjectileSpec = Omit<ProjectileHazard, "kind" | "owner" | "x" | "y" | "vx" | "vy"> & {
  speed: number;
};

/** Puts a unit next to its owner (or at `at`), heading `angle`. */
export function spawnUnit(
  world: World,
  owner: Fighter,
  spec: UnitSpec,
  angle: number,
  at?: { x: number; y: number },
): UnitHazard {
  const d = owner.radius + spec.radius + 4;
  const unit: UnitHazard = {
    kind: "unit",
    owner: owner.index,
    ...spec,
    x: clampInside(at ? at.x : owner.x + Math.cos(angle) * d, spec.radius),
    y: clampInside(at ? at.y : owner.y + Math.sin(angle) * d, spec.radius),
    vx: Math.cos(angle) * spec.speed,
    vy: Math.sin(angle) * spec.speed,
    maxHp: spec.hp,
    lock: 0.3,
    hurt: 0,
  };
  world.hazards.push(unit);
  world.emit({ type: "summon", fighter: owner.index, style: spec.style, x: unit.x, y: unit.y });
  return unit;
}

/** Launches a projectile from the edge of its owner's body (or from `from`). */
export function fireProjectile(
  world: World,
  owner: Fighter,
  angle: number,
  spec: ProjectileSpec,
  from?: { x: number; y: number },
): ProjectileHazard {
  const { speed, ...rest } = spec;
  const d = owner.radius + spec.radius;
  const p: ProjectileHazard = {
    kind: "projectile",
    owner: owner.index,
    ...rest,
    x: from ? from.x : owner.x + Math.cos(angle) * d,
    y: from ? from.y : owner.y + Math.sin(angle) * d,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
  world.hazards.push(p);
  return p;
}

/** Angle from `from` to where `target` will roughly be when a shot of `speed` arrives. */
export function leadAngle(from: Fighter, target: Fighter, speed: number, lead = 0.6): number {
  const t = (Math.hypot(target.x - from.x, target.y - from.y) / speed) * lead;
  return Math.atan2(target.y + target.vy * t - from.y, target.x + target.vx * t - from.x);
}

export interface SweepSpec {
  style: SweepHazard["style"];
  speed: number;
  depth: number;
  /** Number of items spread evenly across the arena, each `itemHalf` wide (half). */
  count: number;
  itemHalf: number;
  damage: number;
  knockback: number;
  stun?: number;
  poison?: number;
  poisonDps?: number;
  /** Travel toward the owner (starting behind the enemy) instead of away from it. */
  toward?: boolean;
  /** Fixed direction (axis-aligned unit vector) instead of "toward the enemy". */
  dir?: { dx: number; dy: number };
}

/**
 * Sends a row across the whole arena along the axis that points most toward the
 * nearest enemy, starting just outside the edge on the owner's side.
 */
export function spawnSweep(world: World, owner: Fighter, spec: SweepSpec): SweepHazard | null {
  const enemy = world.nearestEnemy(owner);
  if (!enemy) return null;
  const ex = enemy.x - owner.x;
  const ey = enemy.y - owner.y;
  let dx = 0;
  let dy = 0;
  if (spec.dir) {
    dx = spec.dir.dx;
    dy = spec.dir.dy;
  } else if (Math.abs(ex) >= Math.abs(ey)) dx = ex >= 0 ? 1 : -1;
  else dy = ey >= 0 ? 1 : -1;
  if (spec.toward) {
    dx = -dx;
    dy = -dy;
  }
  const half = ARENA / 2;
  const start = half + spec.depth;
  const step = ARENA / spec.count;
  const items = Array.from({ length: spec.count }, (_, i) => -half + step * (i + 0.5));
  const sweep: SweepHazard = {
    kind: "sweep",
    owner: owner.index,
    style: spec.style,
    x: half - dx * start,
    y: half - dy * start,
    dx,
    dy,
    speed: spec.speed,
    depth: spec.depth,
    items,
    itemHalf: spec.itemHalf,
    damage: spec.damage,
    knockback: spec.knockback,
    stun: spec.stun ?? 0,
    poison: spec.poison ?? 0,
    poisonDps: spec.poisonDps ?? 0,
    hit: world.fighters.map(() => false),
    travelled: 0,
    distance: start * 2,
    ttl: 10,
  };
  world.hazards.push(sweep);
  return sweep;
}

export interface StrikeSpec {
  style: StrikeHazard["style"];
  x: number;
  y: number;
  radius: number;
  delay: number;
  damage: number;
  knockback: number;
  stun?: number;
}

/** Marks a spot that explodes after `delay` seconds, hurting enemies inside `radius`. */
export function spawnStrike(world: World, owner: Fighter, spec: StrikeSpec): StrikeHazard {
  const strike: StrikeHazard = {
    kind: "strike",
    owner: owner.index,
    style: spec.style,
    x: clampInside(spec.x, 20),
    y: clampInside(spec.y, 20),
    radius: spec.radius,
    delay: spec.delay,
    t: 0,
    damage: spec.damage,
    knockback: spec.knockback,
    stun: spec.stun ?? 0,
    ttl: 1,
  };
  world.hazards.push(strike);
  return strike;
}

/** This owner's units of one style that are still around. */
export function unitsOf(world: World, owner: Fighter, style: UnitHazard["style"]): UnitHazard[] {
  const out: UnitHazard[] = [];
  for (const h of world.hazards) {
    if (h.kind === "unit" && h.owner === owner.index && h.style === style && h.ttl > 0) out.push(h);
  }
  return out;
}

export function countUnits(world: World, owner: Fighter, style: UnitHazard["style"]): number {
  let n = 0;
  for (const h of world.hazards)
    if (h.kind === "unit" && h.owner === owner.index && h.style === style) n++;
  return n;
}

/** Moves every unit and projectile one step. Called by the world. */
export function updateUnits(world: World, dt: number): void {
  let removed = false;
  for (const h of world.hazards) {
    if (h.kind === "unit") updateUnit(world, h, dt);
    else if (h.kind === "projectile") updateProjectile(world, h, dt);
    else if (h.kind === "sweep") updateSweep(world, h, dt);
    else if (h.kind === "strike") updateStrike(world, h, dt);
    else if (h.kind === "zone") updateZone(world, h, dt);
    else continue;
    if (h.ttl <= 0) removed = true;
  }
  if (removed) world.hazards = world.hazards.filter((h) => !isGone(h));
}

function isGone(h: Hazard): boolean {
  return (
    (h.kind === "unit" ||
      h.kind === "projectile" ||
      h.kind === "sweep" ||
      h.kind === "strike" ||
      h.kind === "zone") &&
    h.ttl <= 0
  );
}

function updateStrike(world: World, s: StrikeHazard, dt: number): void {
  const owner = world.fighters[s.owner];
  if (!owner || s.ttl <= 0) return;
  s.t += dt;
  if (s.t < s.delay) return;
  s.ttl = 0;
  world.emit({ type: "strike", style: s.style, x: s.x, y: s.y, radius: s.radius });
  for (const f of world.fighters) {
    if (!f.alive || f.side === owner.side) continue;
    if (Math.hypot(f.x - s.x, f.y - s.y) > s.radius + f.radius) continue;
    const dealt = world.dealDamage(owner, f, s.damage, f.x, f.y, s.knockback, {
      fromX: s.x,
      fromY: s.y,
    });
    if (dealt > 0 && s.stun > 0) {
      f.stun = Math.max(f.stun, s.stun);
      world.emit({ type: "stun", fighter: f.index });
    }
  }
  for (const o of world.hazards) {
    if (o.kind !== "unit" || o.ttl <= 0) continue;
    if (world.fighters[o.owner]?.side === owner.side) continue;
    if (Math.hypot(o.x - s.x, o.y - s.y) <= s.radius + o.radius) {
      damageUnit(world, o, owner, s.damage, o.x, o.y);
    }
  }
}

function updateSweep(world: World, s: SweepHazard, dt: number): void {
  const owner = world.fighters[s.owner];
  if (!owner || s.ttl <= 0) return;
  const move = s.speed * dt;
  s.x += s.dx * move;
  s.y += s.dy * move;
  s.travelled += move;
  if (s.travelled >= s.distance) {
    s.ttl = 0;
    return;
  }
  // Across-the-row axis.
  const px = -s.dy;
  const py = s.dx;
  const touches = (x: number, y: number, r: number): boolean => {
    const along = (x - s.x) * s.dx + (y - s.y) * s.dy;
    if (Math.abs(along) > s.depth / 2 + r) return false;
    const across = (x - s.x) * px + (y - s.y) * py;
    return s.items.some((o) => Math.abs(across - o) <= s.itemHalf + r);
  };

  for (const f of world.fighters) {
    if (!f.alive || f.side === owner.side || s.hit[f.index]) continue;
    if (!touches(f.x, f.y, f.radius)) continue;
    s.hit[f.index] = true;
    const dealt = world.dealDamage(owner, f, s.damage, f.x, f.y, s.knockback, {
      fromX: f.x - s.dx * 100,
      fromY: f.y - s.dy * 100,
    });
    world.emit({ type: "sweepHit", fighter: f.index, x: f.x, y: f.y });
    if (dealt <= 0) continue;
    if (s.stun > 0) {
      f.stun = Math.max(f.stun, s.stun);
      world.emit({ type: "stun", fighter: f.index });
    }
    if (s.poison > 0) {
      f.poison = Math.max(f.poison, s.poison);
      f.poisonDps = s.poisonDps;
      f.poisonBy = owner.index;
      world.emit({ type: "poison", fighter: f.index });
    }
  }
  for (const o of world.hazards) {
    if (o.kind !== "unit" || o.ttl <= 0) continue;
    if (world.fighters[o.owner]?.side === owner.side) continue;
    if (touches(o.x, o.y, o.radius)) damageUnit(world, o, owner, o.hp * 2 + 1, o.x, o.y);
  }
}

function updateUnit(world: World, u: UnitHazard, dt: number): void {
  const owner = world.fighters[u.owner];
  if (!owner || u.ttl <= 0) return;
  u.ttl -= dt;
  u.hurt = Math.max(0, u.hurt - dt);
  u.lock = Math.max(0, u.lock - dt);

  const enemy = nearestEnemyFighter(world, owner.side, u.x, u.y);
  if (enemy) {
    const a = Math.atan2(enemy.y - u.y, enemy.x - u.x);
    const k = Math.min(1, UNIT_STEER * dt);
    u.vx += (Math.cos(a) * u.speed - u.vx) * k;
    u.vy += (Math.sin(a) * u.speed - u.vy) * k;
  }
  u.x += u.vx * dt;
  u.y += u.vy * dt;
  if (u.x < world.lo + u.radius || u.x > world.hi - u.radius) {
    u.x = clampTo(world, u.x, u.radius);
    u.vx = -u.vx;
  }
  if (u.y < world.lo + u.radius || u.y > world.hi - u.radius) {
    u.y = clampTo(world, u.y, u.radius);
    u.vy = -u.vy;
  }

  for (const f of world.fighters) {
    if (!f.alive) continue;
    const n = overlap(u, f);
    if (!n) continue;
    const invU = 1 / u.mass;
    const invF = 1 / f.def.mass;
    const share = n.depth / (invU + invF);
    u.x -= n.nx * share * invU;
    u.y -= n.ny * share * invU;
    f.x += n.nx * share * invF;
    f.y += n.ny * share * invF;
    if (f.side === owner.side) continue;

    const closing = (f.vx - u.vx) * n.nx + (f.vy - u.vy) * n.ny;
    if (closing < 0) {
      const impulse = (-2 * closing) / (invU + invF);
      u.vx -= impulse * invU * n.nx;
      u.vy -= impulse * invU * n.ny;
      f.vx += impulse * invF * n.nx;
      f.vy += impulse * invF * n.ny;
      limitSpeed(f);
    }
    if (u.lock > 0) continue;
    u.lock = u.hitInterval;
    const cx = u.x + n.nx * u.radius;
    const cy = u.y + n.ny * u.radius;
    const dealt = world.dealDamage(owner, f, u.damage, cx, cy, u.knockback, {
      fromX: u.x,
      fromY: u.y,
    });
    if (dealt > 0 && u.stun > 0) {
      f.stun = Math.max(f.stun, u.stun);
      world.emit({ type: "stun", fighter: f.index });
    }
    if (dealt > 0 && u.style === "elephant") {
      // Trample: the elephant carries its victim along.
      f.vx += u.vx * 0.9;
      f.vy += u.vy * 0.9;
      limitSpeed(f);
    }
    // The fighter hits back.
    const back = f.def.contactDamage ?? 0;
    if (back > 0) {
      const mul = f.ability?.damageMultiplier?.(f) ?? 1;
      damageUnit(world, u, f, back * mul * VS_UNIT_DAMAGE, cx, cy);
    }
  }

  // Enemy units grind each other down; friendly ones just keep apart.
  for (const o of world.hazards) {
    if (o === u || o.kind !== "unit" || o.ttl <= 0) continue;
    const n = overlap(u, o);
    if (!n) continue;
    u.x -= n.nx * n.depth * 0.5;
    u.y -= n.ny * n.depth * 0.5;
    o.x += n.nx * n.depth * 0.5;
    o.y += n.ny * n.depth * 0.5;
    const other = world.fighters[o.owner];
    if (!other || other.side === owner.side || u.lock > 0) continue;
    u.lock = u.hitInterval;
    damageUnit(world, o, owner, u.damage, (u.x + o.x) / 2, (u.y + o.y) / 2);
  }
}

function updateProjectile(world: World, p: ProjectileHazard, dt: number): void {
  const owner = world.fighters[p.owner];
  if (!owner || p.ttl <= 0) return;
  p.ttl -= dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const outX = p.x < world.lo + p.radius || p.x > world.hi - p.radius;
  const outY = p.y < world.lo + p.radius || p.y > world.hi - p.radius;
  if (outX || outY) {
    if (p.bounces > 0) {
      p.bounces--;
      if (outX) p.vx = -p.vx;
      if (outY) p.vy = -p.vy;
      p.x = clampTo(world, p.x, p.radius);
      p.y = clampTo(world, p.y, p.radius);
      world.emit({ type: "wall", fighter: owner.index, x: p.x, y: p.y });
    } else {
      explode(world, owner, p, null);
      p.ttl = 0;
      leaveBehind(world, owner, p, true);
    }
    return;
  }
  if (p.ttl <= 0) {
    leaveBehind(world, owner, p, true);
    return;
  }

  for (const f of world.fighters) {
    if (!f.alive || f.side === owner.side) continue;
    const gap = Math.hypot(f.x - p.x, f.y - p.y) - f.radius - p.radius;
    if (gap > 0) {
      watchNearMiss(world, p, gap);
      continue;
    }
    if (world.time < f.reflectUntil) {
      // Leonidas' shield: the shot flies back at whoever fired it.
      const a = Math.atan2(owner.y - p.y, owner.x - p.x);
      const speed = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.owner = f.index;
      // Bounced shots come back weaker.
      p.damage *= 0.5;
      p.poison *= 0.5;
      p.x = f.x + Math.cos(a) * (f.radius + p.radius + 2);
      p.y = f.y + Math.sin(a) * (f.radius + p.radius + 2);
      delete p.closest;
      p.nearCounted = true;
      delete p.leaves;
      world.emit({ type: "reflect", fighter: f.index, x: p.x, y: p.y });
      return;
    }
    const speed = Math.hypot(p.vx, p.vy) || 1;
    const hx = f.x - (p.vx / speed) * f.radius;
    const hy = f.y - (p.vy / speed) * f.radius;
    const dealt = world.dealDamage(owner, f, p.damage, hx, hy, p.knockback, {
      fromX: f.x - p.vx,
      fromY: f.y - p.vy,
    });
    if (dealt > 0 && p.poison > 0) {
      f.poison = Math.max(f.poison, p.poison);
      f.poisonDps = p.poisonDps;
      f.poisonBy = owner.index;
      world.emit({ type: "poison", fighter: f.index });
    }
    explode(world, owner, p, f);
    p.ttl = 0;
    leaveBehind(world, owner, p, false);
    return;
  }

  // Shots fly through enemy soldiers, hurting each once; elephants and shells stop them.
  for (const o of world.hazards) {
    if (o.kind !== "unit" || o.ttl <= 0 || !overlap(p, o)) continue;
    if (world.fighters[o.owner]?.side === owner.side) continue;
    if (p.pierced?.includes(o)) continue;
    damageUnit(world, o, owner, p.damage, p.x, p.y);
    // Elephants are big enough to stop any shot; explosive shells blow up on them.
    if (p.blast > 0 || o.style === "elephant") {
      explode(world, owner, p, null);
      p.ttl = 0;
      leaveBehind(world, owner, p, false);
      return;
    }
    (p.pierced ??= []).push(o);
  }
}

/** Big shots that skim right past an enemy (heading at them) count as close calls. */
function watchNearMiss(world: World, p: ProjectileHazard, gap: number): void {
  if (p.style !== "ball" && p.style !== "bombard") return;
  if (gap < (p.closest ?? Infinity)) {
    p.closest = gap;
    p.nearX = p.x;
    p.nearY = p.y;
  } else if (
    !p.nearCounted &&
    (p.closest ?? Infinity) < PROJECTILE_NEAR_GAP &&
    gap > (p.closest ?? 0) + 6
  ) {
    p.nearCounted = true;
    world.closeCall(p.nearX ?? p.x, p.nearY ?? p.y);
  }
}

/** Fire crater after a bombard lands; a snake trap where an asp missed. */
function leaveBehind(world: World, owner: Fighter, p: ProjectileHazard, missed: boolean): void {
  if (p.leaves === "fire") {
    spawnZone(world, owner, {
      style: "fire",
      x: p.x,
      y: p.y,
      radius: 65,
      ttl: 2,
      damage: 30,
      poison: 0,
      poisonDps: 0,
    });
  } else if (p.leaves === "snake" && missed) {
    spawnZone(world, owner, {
      style: "snake",
      x: p.x,
      y: p.y,
      radius: 20,
      ttl: 3,
      damage: p.damage * 0.5,
      poison: p.poison * 0.5,
      poisonDps: p.poisonDps,
    });
  }
}

export function spawnZone(
  world: World,
  owner: Fighter,
  spec: Omit<ZoneHazard, "kind" | "owner" | "maxTtl" | "lock">,
): ZoneHazard {
  const zone: ZoneHazard = {
    kind: "zone",
    owner: owner.index,
    ...spec,
    x: clampTo(world, spec.x, spec.radius * 0.5),
    y: clampTo(world, spec.y, spec.radius * 0.5),
    maxTtl: spec.ttl,
    lock: 0,
  };
  world.hazards.push(zone);
  world.emit({ type: "zone", style: zone.style, x: zone.x, y: zone.y, radius: zone.radius });
  return zone;
}

function updateZone(world: World, z: ZoneHazard, dt: number): void {
  const owner = world.fighters[z.owner];
  if (!owner || z.ttl <= 0) return;
  z.ttl -= dt;
  z.lock = Math.max(0, z.lock - dt);
  if (z.lock > 0) return;
  for (const f of world.fighters) {
    if (!f.alive || f.side === owner.side) continue;
    if (Math.hypot(f.x - z.x, f.y - z.y) > z.radius + f.radius) continue;
    if (z.style === "fire") {
      // A quarter-second tick of burn.
      world.dealDamage(owner, f, z.damage * 0.25, f.x, f.y, 0, { dot: true });
      z.lock = 0.25;
    } else {
      const dealt = world.dealDamage(owner, f, z.damage, z.x, z.y, 120, { fromX: z.x, fromY: z.y });
      if (dealt > 0 && z.poison > 0) {
        f.poison = Math.max(f.poison, z.poison);
        f.poisonDps = z.poisonDps;
        f.poisonBy = owner.index;
        world.emit({ type: "poison", fighter: f.index });
      }
      z.ttl = 0;
    }
    return;
  }
}

/** Splash damage around a projectile's impact (skips the fighter it hit directly). */
function explode(world: World, owner: Fighter, p: ProjectileHazard, direct: Fighter | null): void {
  if (p.blast <= 0) return;
  world.emit({ type: "blast", x: p.x, y: p.y, radius: p.blast });
  for (const f of world.fighters) {
    if (f === direct || !f.alive || f.side === owner.side) continue;
    const d = Math.hypot(f.x - p.x, f.y - p.y) - f.radius;
    if (d > p.blast) continue;
    world.dealDamage(owner, f, p.damage * 0.5, f.x, f.y, p.knockback * 0.6, {
      fromX: p.x,
      fromY: p.y,
    });
  }
  for (const o of world.hazards) {
    if (o.kind !== "unit" || o.ttl <= 0) continue;
    if (world.fighters[o.owner]?.side === owner.side) continue;
    if (Math.hypot(o.x - p.x, o.y - p.y) - o.radius <= p.blast) {
      damageUnit(world, o, owner, p.damage * 0.3, o.x, o.y);
    }
  }
}

function damageUnit(
  world: World,
  u: UnitHazard,
  attacker: Fighter,
  amount: number,
  x: number,
  y: number,
): void {
  if (world.phase !== "fight" || u.ttl <= 0) return;
  // Testudo: legionaries close to the enemy lock shields and take half damage.
  const enemy = nearestEnemyFighter(world, world.fighters[u.owner]?.side ?? -1, u.x, u.y);
  const testudo = u.style === "legion" && enemy && Math.hypot(enemy.x - u.x, enemy.y - u.y) < 130;
  u.hp -= Math.max(1, Math.round(amount * world.power(attacker) * (testudo ? 0.7 : 1)));
  u.hurt = 0.15;
  world.emit({ type: "bump", x, y, strength: 500 });
  if (u.hp <= 0) {
    u.ttl = 0;
    world.emit({
      type: "unitDown",
      x: u.x,
      y: u.y,
      side: world.fighters[u.owner]?.side ?? 0,
      style: u.style,
    });
  }
}

function nearestEnemyFighter(world: World, side: number, x: number, y: number): Fighter | null {
  let best: Fighter | null = null;
  let bestD = Infinity;
  for (const f of world.fighters) {
    if (!f.alive || f.side === side) continue;
    const d = (f.x - x) ** 2 + (f.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Contact normal (from a to b) and penetration depth, or null when apart. */
function overlap(a: Circle, b: Circle): { nx: number; ny: number; depth: number } | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.radius + b.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return null;
  const d = Math.sqrt(d2) || 0.001;
  return { nx: dx / d, ny: dy / d, depth: min - d };
}

function clampInside(v: number, r: number): number {
  return Math.min(ARENA - r, Math.max(r, v));
}

/** Keeps a coordinate inside the current (possibly shrunken) walls. */
function clampTo(world: World, v: number, r: number): number {
  return Math.min(world.hi - r, Math.max(world.lo + r, v));
}

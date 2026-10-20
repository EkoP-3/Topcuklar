import type { Fighter } from "../types";
import { spawnStrike, spawnUnit, spawnZone } from "../units";
import type { World } from "../world";
import { ticks } from "./kit";

/**
 * Building blocks for Domain Expansion rules (see DomainSpec). Each leader's domain
 * picks one or two of these with its own numbers.
 */

/** True once every `interval` seconds of the domain's life (`t` = seconds since it won). */
export function every(t: number, dt: number, interval: number, start = 0.6): boolean {
  return ticks(t, dt, interval, start) > 0;
}

const drainLeft = new WeakMap<Fighter, number>();
const mendLeft = new WeakMap<Fighter, number>();

/** Whole points due this tick, carrying the fraction over (like poison does). */
function owed(store: WeakMap<Fighter, number>, key: Fighter, amount: number): number {
  const total = (store.get(key) ?? 0) + amount;
  const whole = Math.floor(total);
  store.set(key, total - whole);
  return whole;
}

/** Damage over time on the enemy, dealt in quarter-second ticks. */
export function drain(world: World, self: Fighter, dt: number, t: number, perSecond: number): void {
  if (!every(t, dt, 0.25, 0)) return;
  const enemy = world.nearestEnemy(self);
  if (!enemy) return;
  const amount = owed(drainLeft, self, perSecond * 0.25);
  if (amount > 0) world.dealDamage(self, enemy, amount, enemy.x, enemy.y, 0, { dot: true });
}

/** Healing for the owner in quarter-second ticks. */
export function mend(world: World, self: Fighter, dt: number, t: number, perSecond: number): void {
  if (!every(t, dt, 0.25, 0)) return;
  const amount = owed(mendLeft, self, perSecond * 0.25);
  if (amount > 0) world.heal(self, amount);
}

/** A marked shell where the enemy is heading (artillery, bombards). */
export function shellAtEnemy(
  world: World,
  self: Fighter,
  spec: { radius: number; delay: number; damage: number; knockback: number },
): void {
  const enemy = world.nearestEnemy(self);
  if (!enemy) return;
  spawnStrike(world, self, {
    style: "shell",
    x: enemy.x + enemy.vx * spec.delay * 0.8 + world.rng.range(-30, 30),
    y: enemy.y + enemy.vy * spec.delay * 0.8 + world.rng.range(-30, 30),
    radius: spec.radius,
    delay: spec.delay,
    damage: spec.damage,
    knockback: spec.knockback,
  });
}

/** A patch (fire, stakes) where the enemy is heading. */
export function zoneAtEnemy(
  world: World,
  self: Fighter,
  spec: { style: "fire" | "stakes"; radius: number; ttl: number; damage: number },
): void {
  const enemy = world.nearestEnemy(self);
  if (!enemy) return;
  spawnZone(world, self, {
    style: spec.style,
    x: enemy.x + enemy.vx * 0.4 + world.rng.range(-40, 40),
    y: enemy.y + enemy.vy * 0.4 + world.rng.range(-40, 40),
    radius: spec.radius,
    ttl: spec.ttl,
    damage: spec.damage,
    poison: 0,
    poisonDps: 0,
  });
}

/** Per-fighter cooldown for "hurts on every wall hit" rules. */
const wallLocks = new WeakMap<Fighter, number>();

/** The enemy is hurt (and thrown back in) whenever it touches the arena's edge. */
export function hurtOnWalls(
  world: World,
  self: Fighter,
  dt: number,
  spec: { damage: number; knockback: number },
): boolean {
  const enemy = world.nearestEnemy(self);
  if (!enemy) return false;
  const lock = Math.max(0, (wallLocks.get(enemy) ?? 0) - dt);
  wallLocks.set(enemy, lock);
  const r = enemy.radius + 2;
  const touching =
    enemy.x - r <= world.lo ||
    enemy.x + r >= world.hi ||
    enemy.y - r <= world.lo ||
    enemy.y + r >= world.hi;
  if (!touching || lock > 0) return false;
  wallLocks.set(enemy, 0.6);
  const mid = (world.lo + world.hi) / 2;
  world.dealDamage(self, enemy, spec.damage, enemy.x, enemy.y, spec.knockback, {
    fromX: enemy.x + (enemy.x - mid),
    fromY: enemy.y + (enemy.y - mid),
  });
  return true;
}

/** Warriors running in from a random edge toward the enemy. */
export function raidersFromEdges(
  world: World,
  self: Fighter,
  count: number,
  spec: {
    radius: number;
    speed: number;
    hp: number;
    damage: number;
    knockback: number;
    ttl: number;
  },
): void {
  const enemy = world.nearestEnemy(self);
  if (!enemy) return;
  for (let i = 0; i < count; i++) {
    const edge = Math.floor(world.rng.next() * 4);
    const along = world.rng.range(world.lo + 40, world.hi - 40);
    const inset = spec.radius + 6;
    const x = edge === 0 ? world.lo + inset : edge === 1 ? world.hi - inset : along;
    const y = edge === 2 ? world.lo + inset : edge === 3 ? world.hi - inset : along;
    const unit = spawnUnit(
      world,
      self,
      {
        style: "impi",
        radius: spec.radius,
        mass: 0.8,
        speed: spec.speed,
        hp: spec.hp,
        damage: spec.damage,
        knockback: spec.knockback,
        stun: 0,
        hitInterval: 0.6,
        ttl: spec.ttl,
      },
      Math.atan2(enemy.y - y, enemy.x - x),
      { x, y },
    );
    unit.fromDomain = true;
  }
}

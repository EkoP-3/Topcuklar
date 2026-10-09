/**
 * Seeded random number generator (mulberry32).
 *
 * Every random decision in a match goes through one of these, so the same seed
 * always produces the same match.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Either -1 or 1. */
  sign(): 1 | -1;
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let a = seed | 0;

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] as T,
  };
}

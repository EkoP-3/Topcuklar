import { winChance } from "./odds";
import { LIVE_WEIGHTS } from "./livemodel";
import type { World } from "./world";

/**
 * Live win chance for the first fighter, from a small logistic model fitted on
 * thousands of simulated matches (scripts/live-odds.ts). Display only: it reads the
 * world and never changes it. Null when the matchup has no pre-fight odds.
 */
export function liveFeatures(world: World): number[] | null {
  const [a, b] = world.fighters;
  if (!a || !b) return null;
  const prior = winChance(a.def.id, b.def.id);
  if (prior === null) return null;
  const p = Math.min(0.98, Math.max(0.02, prior));
  const d = Math.max(0, a.hp) / a.maxHp - Math.max(0, b.hp) / b.maxHp;
  const late = Math.min(world.time, 40) / 20;
  const ult = (f: typeof a) => (f.ability?.skillState?.().ult === "ready" ? 1 : 0);
  const dom = world.domain.phase === "owned" ? (world.domain.owner === a.index ? 1 : -1) : 0;
  return [1, Math.log(p / (1 - p)), d, d * late, ult(a) - ult(b), dom];
}

export function liveChance(world: World): number | null {
  const [a, b] = world.fighters;
  if (a && b && world.phase !== "fight" && world.phase !== "intro") {
    if (!a.alive && b.alive) return 0;
    if (!b.alive && a.alive) return 1;
    if (world.winner === 0) return 1;
    if (world.winner === 1) return 0;
  }
  const x = liveFeatures(world);
  if (!x) return null;
  let z = 0;
  for (let i = 0; i < x.length; i++) z += (LIVE_WEIGHTS[i] ?? 0) * (x[i] ?? 0);
  return 1 / (1 + Math.exp(-z));
}

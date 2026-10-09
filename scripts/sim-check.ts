/**
 * Headless checks for the simulation core. Run with:  bun scripts/sim-check.ts [matchesPerPair]
 *
 *  1. Determinism: the same seed must produce the identical match.
 *  2. Balance: every pairing is played many times and win rates / durations are printed.
 */
import { ROSTER } from "../src/sim/roster";
import type { FighterDef } from "../src/sim/types";
import { MATCH_LIMIT, World } from "../src/sim/world";

const FRAME = 1 / 60;

function play(seed: number, a: FighterDef, b: FighterDef): World {
  const world = new World(seed, [a, b]);
  let frames = 0;
  while (world.phase !== "over" && frames < 60 * 200) {
    world.advance(FRAME);
    world.events.length = 0;
    frames++;
  }
  return world;
}

let failed = false;

// 1. Determinism --------------------------------------------------------------
let mismatches = 0;
let checked = 0;
for (const a of ROSTER) {
  for (const b of ROSTER) {
    for (const seed of [1, 7, 4242]) {
      const first = play(seed, a, b).hash();
      const second = play(seed, a, b).hash();
      checked++;
      if (first !== second) {
        mismatches++;
        console.log(`MISMATCH ${a.id} vs ${b.id} seed ${seed}: ${first} != ${second}`);
      }
    }
  }
}
console.log(`determinism: ${checked - mismatches}/${checked} identical replays`);
if (mismatches > 0) failed = true;

// 2. Balance ------------------------------------------------------------------
const perPair = Number(process.argv[2] ?? 100);
const totals = new Map<string, { wins: number; games: number }>();
for (const d of ROSTER) totals.set(d.id, { wins: 0, games: 0 });

let timeouts = 0;
let closeFinishes = 0;
let games = 0;
let durationSum = 0;

console.log(`\nwin rate of ROW against COLUMN (${perPair} matches per pair)`);
console.log(["".padEnd(8), ...ROSTER.map((d) => d.name.padStart(8))].join(" "));

for (const row of ROSTER) {
  const cells: string[] = [row.name.padEnd(8)];
  for (const col of ROSTER) {
    if (row.id === col.id) {
      cells.push("-".padStart(8));
      continue;
    }
    let wins = 0;
    for (let s = 0; s < perPair; s++) {
      // Alternate who spawns where.
      const swap = s % 2 === 1;
      const world = play(1000 + s, swap ? col : row, swap ? row : col);
      const rowIndex = swap ? 1 : 0;
      const won = world.winner === rowIndex;
      if (won) wins++;
      games++;
      durationSum += world.time;
      if (world.time >= MATCH_LIMIT) timeouts++;
      const winner = world.fighters[world.winner];
      if (winner && winner.hp / winner.maxHp <= 0.15) closeFinishes++;
    }
    const t = totals.get(row.id);
    if (t) {
      t.wins += wins;
      t.games += perPair;
    }
    cells.push(`${Math.round((wins / perPair) * 100)}%`.padStart(8));
  }
  console.log(cells.join(" "));
}

console.log("\noverall win rate");
for (const d of ROSTER) {
  const t = totals.get(d.id);
  if (t) console.log(`  ${d.name.padEnd(8)} ${Math.round((t.wins / t.games) * 100)}%`);
}
console.log(
  `\nmatches: ${games}, avg fight length: ${(durationSum / games).toFixed(1)}s, ` +
    `timeouts: ${timeouts} (${((timeouts / games) * 100).toFixed(1)}%), ` +
    `winner finished <=15% HP: ${((closeFinishes / games) * 100).toFixed(1)}%`,
);

if (failed) process.exit(1);

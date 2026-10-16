/**
 * Headless checks for the simulation core. Run with:
 *   bun scripts/sim-check.ts [matchesPerPair] [leaders|weapons]
 *
 *  1. Determinism: the same seed must produce the identical match.
 *  2. Balance: every pairing is played many times and win rates / durations are printed.
 */
import { ROSTERS, isRosterId } from "../src/sim/rosters";
import type { FighterDef } from "../src/sim/types";
import { MATCH_LIMIT, World } from "../src/sim/world";

const FRAME = 1 / 60;
const rosterArg = process.argv[3] ?? "leaders";
if (!isRosterId(rosterArg)) throw new Error(`unknown roster: ${rosterArg}`);
const ROSTER = ROSTERS[rosterArg];
const NAME_W = Math.max(8, ...ROSTER.map((d) => d.name.length)) + 1;

/** Fighters that fired their ultimate in the last played match. */
let ultUsers: number[] = [];
let nearMisses = 0;
let frenzies = 0;
const firstFrenzyAt: number[] = [];

function play(seed: number, a: FighterDef, b: FighterDef): World {
  const world = new World(seed, [a, b]);
  ultUsers = [];
  let frenzyThisMatch = false;
  let frames = 0;
  while (world.phase !== "over" && frames < 60 * 200) {
    world.advance(FRAME);
    for (const e of world.events) {
      if (e.type === "ultimate") ultUsers.push(e.fighter);
      else if (e.type === "nearMiss") nearMisses++;
      else if (e.type === "frenzy" && e.on) {
        if (!frenzyThisMatch) firstFrenzyAt.push(world.time);
        frenzyThisMatch = true;
        frenzies++;
      }
    }
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

let lowest = { rate: 1, pair: "" };
let timeouts = 0;
let closeFinishes = 0;
let reached15 = 0;
let reached30 = 0;
let ultCount = 0;
let ultMatches = 0;
let ultWins = 0;
let games = 0;
let durationSum = 0;

console.log(`\n${rosterArg}: win rate of ROW against COLUMN (${perPair} matches per pair)`);
console.log(["".padEnd(NAME_W), ...ROSTER.map((d) => d.name.slice(0, 8).padStart(8))].join(" "));

for (const row of ROSTER) {
  const cells: string[] = [row.name.padEnd(NAME_W)];
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
      if (world.time >= 15) reached15++;
      if (world.time >= 30) reached30++;
      ultCount += ultUsers.length;
      if (ultUsers.length > 0) ultMatches++;
      ultWins += ultUsers.filter((i) => i === world.winner).length;
      const winner = world.fighters[world.winner];
      if (winner && winner.hp / winner.maxHp <= 0.15) closeFinishes++;
    }
    const t = totals.get(row.id);
    if (t) {
      t.wins += wins;
      t.games += perPair;
    }
    cells.push(`${Math.round((wins / perPair) * 100)}%`.padStart(8));
    const rate = wins / perPair;
    if (rate < lowest.rate) lowest = { rate, pair: `${row.name} vs ${col.name}` };
  }
  console.log(cells.join(" "));
}

console.log(
  `\nmost one-sided matchup: ${lowest.pair} ${Math.round(lowest.rate * 100)}%` +
    ` (${Math.round((1 - lowest.rate) * 100)}% the other way)`,
);
console.log("\noverall win rate");
for (const d of ROSTER) {
  const t = totals.get(d.id);
  if (t) console.log(`  ${d.name.padEnd(NAME_W)} ${Math.round((t.wins / t.games) * 100)}%`);
}
console.log(
  `\nmatches: ${games}, avg fight length: ${(durationSum / games).toFixed(1)}s, ` +
    `timeouts: ${timeouts} (${((timeouts / games) * 100).toFixed(1)}%), ` +
    `winner finished <=15% HP: ${((closeFinishes / games) * 100).toFixed(1)}%`,
);
console.log(
  `reached 15s: ${((reached15 / games) * 100).toFixed(1)}%, ` +
    `reached 30s: ${((reached30 / games) * 100).toFixed(1)}%`,
);
if (nearMisses > 0) {
  const avgFirst = firstFrenzyAt.reduce((s, t) => s + t, 0) / Math.max(1, firstFrenzyAt.length);
  console.log(
    `close calls: ${(nearMisses / games).toFixed(1)} per match, ` +
      `frenzies: ${(frenzies / games).toFixed(2)} per match, ` +
      `in ${((firstFrenzyAt.length / games) * 100).toFixed(1)}% of matches, ` +
      `first at ${avgFirst.toFixed(1)}s on average`,
  );
}
if (ultCount > 0) {
  console.log(
    `ultimates: ${(ultCount / games).toFixed(2)} per match, ` +
      `in ${((ultMatches / games) * 100).toFixed(1)}% of matches, ` +
      `user won ${((ultWins / ultCount) * 100).toFixed(1)}%`,
  );
}

if (failed) process.exit(1);

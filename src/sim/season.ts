import { LEADERS } from "./leaders";
import type { FighterDef } from "./types";
import { World } from "./world";

/**
 * Seasons: a fixed group of leaders whose published matches add up to a league table.
 * Leaders outside the current season stay playable (and selectable); they just wait
 * for their season.
 */
export const CURRENT_SEASON = 1;

/** Season 1's eight leaders. Every other leader belongs to Season 2. */
export const SEASON_1: readonly string[] = [
  "alexander",
  "caesar",
  "cleopatra",
  "genghis",
  "leonidas",
  "napoleon",
  "mehmed",
  "vlad",
];

export function seasonOf(id: string): number {
  return SEASON_1.includes(id) ? 1 : 2;
}

export function inCurrentSeason(id: string): boolean {
  return seasonOf(id) === CURRENT_SEASON;
}

/** Season 1's leaders as fighter definitions, in roster order. */
export const SEASON_1_DEFS: readonly FighterDef[] = LEADERS.filter((d) => seasonOf(d.id) === 1);

/** One published match of the season. */
export interface SeasonMatch {
  a: string;
  b: string;
  seed: number;
  /** The winner's leader id. */
  winner: string;
  /** When it was added, ISO date. */
  at: string;
}

/** Same pairing (either order) and seed: the same match, never counted twice. */
export function matchKey(m: { a: string; b: string; seed: number }): string {
  const [x, y] = m.a < m.b ? [m.a, m.b] : [m.b, m.a];
  return `${x}--${y}--${m.seed}`;
}

/** Oldest first; a stable order for "the matches before this one". */
export function sortLedger(matches: readonly SeasonMatch[]): SeasonMatch[] {
  return [...matches].sort((p, q) => (p.at < q.at ? -1 : p.at > q.at ? 1 : 0));
}

/** Accepts anything that looks like a ledger entry (imports, stored data); null otherwise. */
export function parseMatch(raw: unknown): SeasonMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const { a, b, seed, winner, at } = r;
  if (typeof a !== "string" || typeof b !== "string" || typeof winner !== "string") return null;
  if (typeof seed !== "number" || !Number.isFinite(seed)) return null;
  if (a === b || (winner !== a && winner !== b)) return null;
  return { a, b, seed, winner, at: typeof at === "string" ? at : new Date(0).toISOString() };
}

/** Plays the match headlessly (the video's own 60 fps steps) and returns the winner's id. */
export function playWinner(seed: number, fighters: [FighterDef, FighterDef]): string | null {
  const probe = new World(seed, fighters);
  let frames = 0;
  while (probe.phase !== "over" && frames < 60 * 200) {
    probe.advance(1 / 60);
    probe.events.length = 0;
    frames++;
  }
  if (probe.phase !== "over") return null;
  return probe.fighters[probe.winner]?.def.id ?? null;
}

/** A leader's season so far. `streak` counts the latest wins in a row. */
export interface SeasonRecord {
  wins: number;
  losses: number;
  streak: number;
}

export function recordOf(matches: readonly SeasonMatch[], id: string): SeasonRecord {
  let wins = 0;
  let losses = 0;
  let streak = 0;
  for (const m of sortLedger(matches)) {
    if (m.a !== id && m.b !== id) continue;
    if (m.winner === id) {
      wins++;
      streak++;
    } else {
      losses++;
      streak = 0;
    }
  }
  return { wins, losses, streak };
}

export interface Standing extends SeasonRecord {
  id: string;
  /** 1-based place in the table. */
  rank: number;
}

/**
 * The season table: most wins first, then fewer losses, then the head-to-head
 * results among the tied leaders, then the name. Leaders without a match show 0–0.
 */
export function standings(
  matches: readonly SeasonMatch[],
  ids: readonly string[] = SEASON_1,
): Standing[] {
  const names = new Map(LEADERS.map((d) => [d.id, d.name]));
  const rows = ids.map((id) => ({ id, ...recordOf(matches, id) }));
  /** Wins of `id` against the others in its tie group. */
  const h2h = (id: string, group: readonly string[]) =>
    matches.filter(
      (m) =>
        m.winner === id && group.includes(m.a === id ? m.b : m.a) && (m.a === id || m.b === id),
    ).length;
  const groupOf = (r: (typeof rows)[number]) =>
    rows.filter((o) => o.wins === r.wins && o.losses === r.losses).map((o) => o.id);
  const sorted = [...rows].sort((p, q) => {
    if (p.wins !== q.wins) return q.wins - p.wins;
    if (p.losses !== q.losses) return p.losses - q.losses;
    const group = groupOf(p);
    const d = h2h(q.id, group) - h2h(p.id, group);
    if (d !== 0) return d;
    return (names.get(p.id) ?? p.id).localeCompare(names.get(q.id) ?? q.id);
  });
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** One row of the end card's table. */
export interface SeasonRow {
  def: FighterDef;
  rank: number;
  wins: number;
  losses: number;
  /** Places gained (+) or lost (−) by this match. */
  moved: number;
  /** 1: won this match, -1: lost it, 0: did not play. */
  result: 1 | -1 | 0;
}

/** What the video shows of the season, built once per match by the caller. */
export interface SeasonView {
  season: number;
  /** This match's two leaders, by side. */
  sides: readonly [string, string];
  /** Each side's record before this match (the video must not spoil its own result). */
  before: readonly [SeasonRecord, SeasonRecord];
  /** The table with this match counted. */
  table: readonly SeasonRow[];
}

/**
 * The season as this match's video tells it, or null when the match is not a
 * Season 1 pairing. If the match is already in the ledger, only the matches added
 * before it count as "before".
 */
export function seasonView(
  ledger: readonly SeasonMatch[],
  match: { a: FighterDef; b: FighterDef; seed: number; winner: string | null },
): SeasonView | null {
  const { a, b, seed, winner } = match;
  if (seasonOf(a.id) !== 1 || seasonOf(b.id) !== 1 || a.id === b.id) return null;
  const key = matchKey({ a: a.id, b: b.id, seed });
  const sorted = sortLedger(ledger);
  const at = sorted.findIndex((m) => matchKey(m) === key);
  const before = at >= 0 ? sorted.slice(0, at) : sorted;
  const after =
    winner === null
      ? before
      : [...before, { a: a.id, b: b.id, seed, winner, at: new Date().toISOString() }];
  const oldRank = new Map(standings(before).map((s) => [s.id, s.rank]));
  const defs = new Map(SEASON_1_DEFS.map((d) => [d.id, d]));
  const table: SeasonRow[] = [];
  for (const s of standings(after)) {
    const def = defs.get(s.id);
    if (!def) continue;
    const played = s.id === a.id || s.id === b.id;
    table.push({
      def,
      rank: s.rank,
      wins: s.wins,
      losses: s.losses,
      moved: (oldRank.get(s.id) ?? s.rank) - s.rank,
      result: !played || winner === null ? 0 : s.id === winner ? 1 : -1,
    });
  }
  return {
    season: 1,
    sides: [a.id, b.id],
    before: [recordOf(before, a.id), recordOf(before, b.id)],
    table,
  };
}

/** "3W–1L" */
export function formatRecord(r: { wins: number; losses: number }): string {
  return `${r.wins}W–${r.losses}L`;
}

import { matchKey, parseMatch, sortLedger, type SeasonMatch } from "./sim/season";

/**
 * The season ledger: the matches actually published this season.
 *
 * Inside the claude.ai viewer it lives in the artifact's shared database (`db`
 * capability), so it follows the page across devices. Everywhere else, or until the
 * database answers, it lives in this browser's localStorage, which is also kept as a
 * backup copy of whatever the database holds.
 */

/** "-2": the Season 1 table was reset once; older copies in browsers are ignored. */
const STORAGE_KEY = "topcuklar.season1-2";
const COLLECTION = "seasons/s1/matches";

export type LedgerBackend = "db" | "local";

type Listener = (matches: readonly SeasonMatch[], backend: LedgerBackend) => void;

// The few db calls used here (see the artifact runtime's db.d.ts).
interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
interface CollectionRef {
  doc(id: string): DocRef;
  onSnapshot(next: (snap: { docs: DocSnap[] }) => void, error?: (e: unknown) => void): () => void;
}
interface Db {
  collection(path: string): CollectionRef;
}

let matches: SeasonMatch[] = readLocal();
let backend: LedgerBackend = "local";
let collection: CollectionRef | null = null;
const listeners = new Set<Listener>();
let started = false;

function readLocal(): SeasonMatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return parseLedger(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function writeLocal(list: readonly SeasonMatch[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage unavailable: the database (or nothing) keeps the season
  }
}

/** Accepts an exported file ({ matches: [...] }) or a bare list; drops broken entries and repeats. */
export function parseLedger(raw: unknown): SeasonMatch[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { matches?: unknown }).matches)
      ? (raw as { matches: unknown[] }).matches
      : [];
  const seen = new Set<string>();
  const out: SeasonMatch[] = [];
  for (const item of list) {
    const m = parseMatch(item);
    if (!m || seen.has(matchKey(m))) continue;
    seen.add(matchKey(m));
    out.push(m);
  }
  return sortLedger(out);
}

function publish(next: SeasonMatch[]): void {
  // One entry per pairing and seed, however the page and the database raced to add it.
  const seen = new Set<string>();
  const unique = next.filter((m) => {
    const key = matchKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  matches = sortLedger(unique);
  writeLocal(matches);
  for (const l of listeners) l(matches, backend);
}

const SYNCED_KEY = `${STORAGE_KEY}.synced`;

/** Whether this browser has already handed its local matches to the database once. */
function synced(): boolean {
  try {
    return localStorage.getItem(SYNCED_KEY) === "1";
  } catch {
    return false;
  }
}

function markSynced(): void {
  try {
    localStorage.setItem(SYNCED_KEY, "1");
  } catch {
    // private window: the hand-over may simply happen again, which only re-adds matches
  }
}

/** Connects to the artifact database when the page has one; never blocks the first paint. */
async function connect(): Promise<void> {
  let db: Db | null = null;
  try {
    const host = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } })
      .claude;
    db = ((await host?.use?.("db")) as Db | null | undefined) ?? null;
  } catch {
    db = null;
  }
  if (!db) return;
  let ref: CollectionRef;
  try {
    ref = db.collection(COLLECTION);
  } catch {
    return;
  }
  let first = true;
  try {
    ref.onSnapshot(
      (snap) => {
        const remote: SeasonMatch[] = [];
        for (const d of snap.docs) {
          const m = d.exists ? parseMatch(d.data()) : null;
          if (m) remote.push(m);
        }
        collection = ref;
        backend = "db";
        if (first && !synced()) {
          first = false;
          markSynced();
          // Matches only this browser had (added before the database ever answered) move up
          // once. After that the database is the source: a match deleted there stays deleted
          // instead of coming back from this browser's copy.
          const known = new Set(remote.map(matchKey));
          const missing = matches.filter((m) => !known.has(matchKey(m)));
          void (async () => {
            for (const m of missing) {
              try {
                await ref.doc(matchKey(m)).set({ ...m });
              } catch {
                // read-only viewer or a full database: the local copy keeps it
              }
            }
          })();
          publish([...remote, ...missing]);
          return;
        }
        first = false;
        publish(remote);
      },
      () => {
        // The database went away: carry on with the local copy.
        collection = null;
        backend = "local";
        publish(matches);
      },
    );
  } catch {
    collection = null;
  }
}

/** Calls `listener` now and on every change. Returns the unsubscribe. */
export function subscribeLedger(listener: Listener): () => void {
  listeners.add(listener);
  listener(matches, backend);
  if (!started) {
    started = true;
    void connect();
  }
  return () => listeners.delete(listener);
}

/** Adds a match unless the same pairing and seed is already in. Resolves false for a repeat. */
export async function addMatch(m: SeasonMatch): Promise<boolean> {
  const key = matchKey(m);
  if (matches.some((x) => matchKey(x) === key)) return false;
  if (collection) await collection.doc(key).set({ ...m });
  publish([...matches, m]);
  return true;
}

export async function removeMatch(m: SeasonMatch): Promise<void> {
  const key = matchKey(m);
  if (collection) await collection.doc(key).delete();
  publish(matches.filter((x) => matchKey(x) !== key));
}

/** Adds every new match from an exported file. Resolves how many were added. */
export async function importMatches(list: readonly SeasonMatch[]): Promise<number> {
  let added = 0;
  for (const m of list) if (await addMatch(m)) added++;
  return added;
}

export function exportLedger(list: readonly SeasonMatch[]): string {
  return JSON.stringify({ season: 1, matches: list }, null, 2);
}

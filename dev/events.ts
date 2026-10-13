/** Dev-only: key simulation events with their frame times, as the browser computes them. */
import { findIn } from "../src/sim/rosters";
import { World } from "../src/sim/world";

const q = new URLSearchParams(location.search);
const a = findIn("leaders", q.get("a") ?? "mehmed");
const b = findIn("leaders", q.get("b") ?? "caesar");
const out: string[] = [];
if (a && b) {
  const w = new World(Number(q.get("seed") ?? 1), [a, b]);
  for (let f = 1; f < 60 * 60 && w.phase !== "over"; f++) {
    w.advance(1 / 60);
    for (const e of w.events) {
      if (["levelUp", "frenzy", "ultimate", "ultimateCast", "ko"].includes(e.type)) {
        out.push(`${(f / 60).toFixed(2)} ${e.type}`);
      }
    }
    w.events.length = 0;
  }
}
(window as unknown as { events: string[] }).events = out;

/**
 * Dev-only frame checker (not part of the build): plays a match headlessly and draws
 * chosen moments side by side. Open /dev/frames.html?a=mehmed&b=caesar&seed=3
 * Optional &t=1,5,15.2 (fight seconds); by default it shows the intro and each
 * ultimate (name on screen, then the effect). &sig=1 also snaps each signature mechanic
 * that shouts (MOLON LABE!, BREACH!...), up to 8. Looks: &style=arcade|night.
 * Season record and standings card come from this browser's season ledger
 * (localStorage "topcuklar.season1-2"; seed one to check them).
 */
import { createRenderer, type DrawExtras } from "../src/sim/render/canvas";
import { Fx } from "../src/sim/render/fx";
import { loadFonts } from "../src/sim/render/palette";
import { artReady } from "../src/sim/render/images";
import { findIn } from "../src/sim/rosters";
import { World } from "../src/sim/world";
import { playWinner, seasonView } from "../src/sim/season";
import { subscribeLedger } from "../src/ledger";

const q = new URLSearchParams(location.search);
const a = findIn("leaders", q.get("a") ?? "mehmed");
const b = findIn("leaders", q.get("b") ?? "caesar");
const seed = Number(q.get("seed") ?? 1);
const times = (q.get("t") ?? "").split(",").filter(Boolean).map(Number);
const sigShots = q.has("sig");

let extras: DrawExtras = {};

function snap(world: World, fx: Fx): void {
  const c = document.createElement("canvas");
  createRenderer(c, 0.5).draw(world, fx, extras);
  document.body.append(c);
}

await loadFonts();
await artReady();
if (a && b) {
  let ledger: Parameters<typeof seasonView>[0] = [];
  subscribeLedger((m) => (ledger = m))();
  extras = { season: seasonView(ledger, { a, b, seed, winner: playWinner(seed, [a, b]) }) };
  const world = new World(seed, [a, b]);
  const fx = new Fx(seed);
  const shots: { at: number; frame: number }[] = [];
  let frame = 0;
  let introShot = false;
  let nearShots = 0;
  const castFrames: number[] = [];
  let sigs = 0;
  while (world.phase !== "over" && frame < 60 * 90) {
    world.advance(1 / 60);
    const ult = world.events.some((e) => e.type === "ultimate");
    const cast = world.events.some((e) => e.type === "ultimateCast");
    const near = world.events.some((e) => e.type === "nearMiss");
    const frenzy = world.events.some((e) => e.type === "frenzy" && e.on);
    const domainCast = world.events.some((e) => e.type === "domainCast");
    const clash = world.events.some((e) => e.type === "domainClash");
    const shatter = world.events.some((e) => e.type === "wallsShatter");
    const sig = world.events.some((e) => e.type === "signature" && e.text);
    fx.consume(world);
    fx.update(1 / 60, world);
    frame++;
    if (!introShot && world.phase === "intro" && world.phaseTime > 0.4) {
      introShot = true;
      snap(world, fx);
    }
    if (frame === 140) snap(world, fx);
    if (sigShots && sig && sigs < 8) {
      sigs++;
      castFrames.push(frame + 6);
    }
    if (times.length > 0) {
      if (times.some((t) => Math.abs(world.time - t) < 1 / 120)) snap(world, fx);
    } else {
      if (ult) shots.push({ at: frame + 30, frame });
      if (cast) castFrames.push(frame + 12, frame + 40);
      if (near && nearShots < 2) {
        nearShots++;
        castFrames.push(frame + 8);
      }
      if (frenzy && !domainCast) castFrames.push(frame + 20);
      if (domainCast) castFrames.push(frame + 8, frame + 50);
      if (clash) castFrames.push(frame + 70);
      if (shatter) castFrames.push(frame + 4, frame + 60);
      if (shots.some((s) => s.at === frame) || castFrames.includes(frame)) snap(world, fx);
    }
  }
  // End screen: "X WINS", then the "who's next?" card.
  for (let i = 0; i < 60 * 4.2; i++) {
    world.advance(1 / 60);
    fx.consume(world);
    fx.update(1 / 60, world);
    if (i === 30 || i === 100 || i === 240) snap(world, fx);
  }
}
(window as unknown as { done: boolean }).done = true;

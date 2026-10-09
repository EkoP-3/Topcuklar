import { useEffect, useRef, useState } from "react";
import { createRng } from "./sim/rng";
import { createRenderer } from "./sim/render/canvas";
import { Fx } from "./sim/render/fx";
import { SIDES } from "./sim/render/palette";
import { ROSTER, findDef } from "./sim/roster";
import type { FighterDef } from "./sim/types";
import { World } from "./sim/world";

interface ArenaSearch {
  a: string | undefined;
  b: string | undefined;
  seed: number | undefined;
}

/** Reads ?a=&b=&seed= from the address bar so a match can be shared as a link. */
function readSearch(): ArenaSearch {
  const q = new URLSearchParams(window.location.search);
  const rawSeed = q.get("seed");
  const seed = Number(rawSeed);
  return {
    a: q.get("a") ?? undefined,
    b: q.get("b") ?? undefined,
    seed: rawSeed !== null && Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : undefined,
  };
}

const RANDOM = "random";
/** Seconds to show the winner before the next match starts (when auto-play is on). */
const AUTO_NEXT_DELAY = 2.6;

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** "random" picks from the roster using the seed, so a match is still fully repeatable. */
function resolveFighters(seed: number, a: string, b: string): [FighterDef, FighterDef] {
  const rng = createRng(seed ^ 0x2545f491);
  const defA = findDef(a) ?? rng.pick(ROSTER);
  const defB = findDef(b) ?? rng.pick(ROSTER.filter((d) => d.id !== defA.id));
  return [defA, defB];
}

export function ArenaPage() {
  const [search] = useState(readSearch);

  useEffect(() => {
    document.title = "Arena — Silah Savaşı Prototipi";
  }, []);

  const [a, setA] = useState(search.a ?? RANDOM);
  const [b, setB] = useState(search.b ?? RANDOM);
  const [seed, setSeed] = useState(search.seed ?? 1);
  const [restarts, setRestarts] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [auto, setAuto] = useState(true);
  const [matchup, setMatchup] = useState<[string, string] | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const fxRef = useRef<Fx | null>(null);
  const live = useRef({ paused, speed, auto });
  const nextMatch = useRef(() => setSeed(randomSeed()));

  useEffect(() => {
    live.current = { paused, speed, auto };
  }, [paused, speed, auto]);

  // Start a fresh match whenever the setup changes.
  useEffect(() => {
    const [defA, defB] = resolveFighters(seed, a, b);
    worldRef.current = new World(seed, [defA, defB]);
    fxRef.current = new Fx(seed);
    setMatchup([defA.name, defB.name]);
  }, [a, b, seed, restarts]);

  // Animation loop: step the simulation, then draw it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createRenderer(canvas);
    let raf = 0;
    let last = performance.now();
    let overFor = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      const fx = fxRef.current;
      const { paused: isPaused, speed: rate, auto: isAuto } = live.current;

      if (world && fx) {
        if (!isPaused) {
          world.advance(dt * rate);
          fx.consume(world);
          fx.update(dt * rate, world);
        }
        renderer.draw(world, fx);

        if (world.phase === "over" && isAuto && !isPaused) {
          overFor += dt;
          if (overFor >= AUTO_NEXT_DELAY) {
            overFor = 0;
            nextMatch.current();
          }
        } else {
          overFor = 0;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const controlClass =
    "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-white/40";
  const buttonClass =
    "rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 transition-colors hover:bg-white/20 active:bg-white/25";

  return (
    <div className="min-h-screen bg-[#05060a] text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-4 lg:flex-row lg:items-start lg:justify-center lg:gap-10 lg:py-8">
        <div
          className="w-full"
          style={{ maxWidth: "min(100%, 460px, calc((100dvh - 2rem) * 0.5625))" }}
        >
          <canvas
            ref={canvasRef}
            className="block aspect-[9/16] w-full rounded-2xl bg-black shadow-[0_0_60px_rgba(61,139,255,0.18)]"
          />
        </div>

        <div className="w-full max-w-[460px] space-y-5 pb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Arena Prototipi</h1>
            <p className="mt-1 text-sm text-neutral-400">
              İki karakter otomatik savaşır. Aynı seed her zaman aynı maçı verir.
            </p>
            {matchup && (
              <p className="mt-3 font-mono text-sm">
                <span style={{ color: SIDES[0].main }}>{matchup[0]}</span>
                <span className="mx-2 text-neutral-500">vs</span>
                <span style={{ color: SIDES[1].main }}>{matchup[1]}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-neutral-400">
              1. Karakter
              <select
                className={`${controlClass} w-full`}
                value={a}
                onChange={(e) => setA(e.target.value)}
              >
                <option className="bg-[#0d1224]" value={RANDOM}>
                  🎲 Rastgele
                </option>
                {ROSTER.map((d) => (
                  <option className="bg-[#0d1224]" key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-neutral-400">
              2. Karakter
              <select
                className={`${controlClass} w-full`}
                value={b}
                onChange={(e) => setB(e.target.value)}
              >
                <option className="bg-[#0d1224]" value={RANDOM}>
                  🎲 Rastgele
                </option>
                {ROSTER.map((d) => (
                  <option className="bg-[#0d1224]" key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-end gap-3">
            <label className="flex-1 space-y-1 text-xs text-neutral-400">
              Seed
              <input
                type="number"
                min={0}
                className={`${controlClass} w-full font-mono`}
                value={seed}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  if (Number.isFinite(n) && n >= 0) setSeed(n);
                }}
              />
            </label>
            <button className={buttonClass} onClick={() => setSeed(randomSeed())}>
              🎲 Rastgele maç
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className={buttonClass} onClick={() => setRestarts((n) => n + 1)}>
              ↻ Yeniden oyna
            </button>
            <button className={buttonClass} onClick={() => setPaused((p) => !p)}>
              {paused ? "▶ Devam" : "⏸ Duraklat"}
            </button>
            <div className="flex overflow-hidden rounded-lg border border-white/15">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    speed === s ? "bg-white/25 text-white" : "bg-white/5 text-neutral-300"
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => setAuto(e.target.checked)}
              className="size-4 accent-[#3d8bff]"
            />
            Sürekli oynat (maç bitince yeni rastgele maç)
          </label>

          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Karakterler
            </h2>
            {ROSTER.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-sm font-bold">{d.name}</span>
                  <span className="font-mono text-xs text-neutral-500">
                    HP {d.hp} · HASAR {d.damage}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-neutral-400">{d.description}</p>
              </div>
            ))}
          </div>

          <p className="text-xs leading-relaxed text-neutral-500">
            Bu M0 prototipidir: ses, boss'lar, elementler ve video kaydı sonraki adımlarda
            eklenecek.
          </p>
        </div>
      </div>
    </div>
  );
}

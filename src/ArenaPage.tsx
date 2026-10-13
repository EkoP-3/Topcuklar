import { useEffect, useRef, useState } from "react";
import { createRng } from "./sim/rng";
import { createRenderer } from "./sim/render/canvas";
import { Fx } from "./sim/render/fx";
import { SIDES } from "./sim/render/palette";
import { Music, musicState } from "./sim/render/music";
import { Sfx } from "./sim/render/sfx";
import { ROSTERS, ROSTER_LABELS, findIn, isRosterId, type RosterId } from "./sim/rosters";
import type { FighterDef } from "./sim/types";
import { World } from "./sim/world";
import { canRecord, recordMatch, tailSeconds, type Recording } from "./recorder";
import { ultimateName, videoDescription } from "./describe";

interface ArenaSearch {
  mode: RosterId | undefined;
  a: string | undefined;
  b: string | undefined;
  seed: number | undefined;
}

/** Reads ?mode=&a=&b=&seed= from the address bar so a match can be shared as a link. */
function readSearch(): ArenaSearch {
  const q = new URLSearchParams(window.location.search);
  const rawSeed = q.get("seed");
  const seed = Number(rawSeed);
  const mode = q.get("mode");
  return {
    mode: isRosterId(mode) ? mode : undefined,
    a: q.get("a") ?? undefined,
    b: q.get("b") ?? undefined,
    seed: rawSeed !== null && Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : undefined,
  };
}

const RANDOM = "random";
/** Extra seconds after the end screen before the next match starts (auto-play). */
const AUTO_NEXT_PAUSE = 0.6;

/** Unknown ids in the address bar fall back to a random pick instead of an empty select. */
function knownOrRandom(mode: RosterId, id: string | undefined): string {
  return id && findIn(mode, id) ? id : RANDOM;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem("arena-muted") === "1";
  } catch {
    return false;
  }
}

function readMusicOn(): boolean {
  try {
    return localStorage.getItem("arena-music") !== "0";
  } catch {
    return true;
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** "random" picks from the roster using the seed, so a match is still fully repeatable. */
function resolveFighters(
  seed: number,
  mode: RosterId,
  a: string,
  b: string,
): [FighterDef, FighterDef] {
  const roster = ROSTERS[mode];
  const rng = createRng(seed ^ 0x2545f491);
  const defA = findIn(mode, a) ?? rng.pick(roster);
  const defB = findIn(mode, b) ?? rng.pick(roster.filter((d) => d.id !== defA.id));
  return [defA, defB];
}

export function ArenaPage() {
  const [search] = useState(readSearch);

  useEffect(() => {
    document.title = "Arena Prototipi";
  }, []);

  const [mode, setModeState] = useState<RosterId>(search.mode ?? "leaders");
  const [a, setA] = useState(knownOrRandom(mode, search.a));
  const [b, setB] = useState(knownOrRandom(mode, search.b));
  const roster = ROSTERS[mode];
  const setMode = (next: RosterId) => {
    if (next === mode) return;
    setModeState(next);
    setA(RANDOM);
    setB(RANDOM);
  };
  const [seed, setSeed] = useState(search.seed ?? 1);
  const [restarts, setRestarts] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [auto, setAuto] = useState(true);
  const [matchup, setMatchup] = useState<[string, string] | null>(null);
  const [recProgress, setRecProgress] = useState<number | null>(null);
  const [recMessage, setRecMessage] = useState<string | null>(null);
  const recording = useRef<Recording | null>(null);
  const [recordable] = useState(canRecord);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const fxRef = useRef<Fx | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const musicRef = useRef<Music | null>(null);
  const [musicOn, setMusicOn] = useState(readMusicOn);
  const [nextA, setNextA] = useState("");
  const [nextB, setNextB] = useState("");
  const [copied, setCopied] = useState(false);
  const extrasRef = useRef<{
    musicOn: boolean;
    next: readonly [FighterDef, FighterDef] | null;
  }>({ musicOn, next: null });
  const [muted, setMuted] = useState(readMuted);
  const [audioReady, setAudioReady] = useState(false);
  const mutedRef = useRef(muted);
  const live = useRef({ paused, speed, auto, busy: false });
  const nextMatch = useRef(() => setSeed(randomSeed()));

  // Browsers only allow sound after the first tap/click, so audio starts then.
  useEffect(() => {
    const start = () => {
      if (!sfxRef.current) {
        try {
          sfxRef.current = new Sfx(new AudioContext());
          musicRef.current = new Music(sfxRef.current);
        } catch {
          return;
        }
      }
      sfxRef.current.setMuted(mutedRef.current);
      sfxRef.current.resume();
      setAudioReady(true);
    };
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
    sfxRef.current?.setMuted(muted);
    try {
      localStorage.setItem("arena-muted", muted ? "1" : "0");
    } catch {
      // storage unavailable: the choice just is not remembered
    }
  }, [muted]);

  useEffect(() => {
    live.current = { paused, speed, auto, busy: recProgress !== null };
  }, [paused, speed, auto, recProgress]);

  // Chosen "who's next?" leaders (both must be picked to replace the question marks).
  const nextDefs: readonly [FighterDef, FighterDef] | null = (() => {
    const da = findIn(mode, nextA);
    const db = findIn(mode, nextB);
    return da && db ? [da, db] : null;
  })();
  useEffect(() => {
    const da = findIn(mode, nextA);
    const db = findIn(mode, nextB);
    extrasRef.current = { musicOn, next: da && db ? [da, db] : null };
    try {
      localStorage.setItem("arena-music", musicOn ? "1" : "0");
    } catch {
      // storage unavailable: the choice just is not remembered
    }
  }, [musicOn, mode, nextA, nextB]);

  const startRecording = () => {
    if (recording.current) return;
    const fighters = resolveFighters(seed, mode, a, b);
    setRecMessage(null);
    setRecProgress(0);
    const job = recordMatch({
      seed,
      fighters,
      onProgress: setRecProgress,
      music: musicOn,
      next: nextDefs,
    });
    recording.current = job;
    job.done
      .then((name) => setRecMessage(name ? `İndirildi: ${name}` : "Kayıt iptal edildi."))
      .catch((err: unknown) =>
        setRecMessage(err instanceof Error ? err.message : "Kayıt başarısız oldu."),
      )
      .finally(() => {
        recording.current = null;
        setRecProgress(null);
      });
  };

  useEffect(() => () => recording.current?.cancel(), []);

  // Start a fresh match whenever the setup changes.
  useEffect(() => {
    const [defA, defB] = resolveFighters(seed, mode, a, b);
    worldRef.current = new World(seed, [defA, defB]);
    fxRef.current = new Fx(seed);
    musicRef.current?.reset();
    setMatchup([defA.name, defB.name]);
  }, [mode, a, b, seed, restarts]);

  // Animation loop: step the simulation, then draw it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Draw at the real on-screen resolution (sharp on phones) without wasting work.
    const pickQuality = () =>
      Math.min(1, Math.max(0.5, (canvas.clientWidth * (window.devicePixelRatio || 1)) / 1080));
    let shownWidth = canvas.clientWidth;
    let renderer = createRenderer(canvas, pickQuality());
    const onResize = () => {
      if (Math.abs(canvas.clientWidth - shownWidth) < 8) return;
      shownWidth = canvas.clientWidth;
      renderer = createRenderer(canvas, pickQuality());
    };
    window.addEventListener("resize", onResize);
    let raf = 0;
    let last = performance.now();
    let overFor = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      const fx = fxRef.current;
      const { paused: isPaused, speed: rate, auto: isAuto, busy } = live.current;

      if (world && fx && !busy) {
        const extras = extrasRef.current;
        if (!isPaused) {
          fx.sfx = sfxRef.current;
          world.advance(dt * rate);
          fx.consume(world);
          fx.update(dt * rate, world);
          const sfx = sfxRef.current;
          if (extras.musicOn && sfx && sfx.ctx.state === "running") {
            musicRef.current?.update(musicState(world), sfx.ctx.currentTime);
          }
        }
        renderer.draw(world, fx, { next: extras.next });

        if (world.phase === "over" && isAuto && !isPaused) {
          overFor += dt;
          const wait = tailSeconds(world.fighters.map((f) => f.def)) + AUTO_NEXT_PAUSE;
          if (overFor >= wait) {
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
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
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

          <div className="flex overflow-hidden rounded-lg border border-white/15">
            {(Object.keys(ROSTERS) as RosterId[]).map((id) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  mode === id ? "bg-white/25 text-white" : "bg-white/5 text-neutral-300"
                }`}
              >
                {ROSTER_LABELS[id]}
              </button>
            ))}
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
                {roster.map((d) => (
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
                {roster.map((d) => (
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

          <div className="space-y-2">
            {recProgress === null ? (
              <button
                className={`${buttonClass} w-full bg-[#3d8bff]/25 hover:bg-[#3d8bff]/40`}
                onClick={startRecording}
                disabled={!recordable}
              >
                🎬 Bu maçı video olarak kaydet
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-white/15 bg-white/5 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Hazırlanıyor… %{Math.round(recProgress * 100)}</span>
                  <button
                    className="text-neutral-400 underline"
                    onClick={() => recording.current?.cancel()}
                  >
                    İptal
                  </button>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-white/10">
                  <div
                    className="h-full bg-[#3d8bff]"
                    style={{ width: `${Math.round(recProgress * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-neutral-400">
                  Video hazırlanıyor. Cihazınızın hızına göre birkaç saniye ile bir dakika
                  sürebilir; bu sekmeyi açık tutun, bitince dosya kendiliğinden iner.
                </p>
              </div>
            )}
            {!recordable && (
              <p className="text-xs text-neutral-500">
                Bu tarayıcı video kaydını desteklemiyor (Chrome/Edge önerilir).
              </p>
            )}
            {recMessage && <p className="text-xs text-neutral-400">{recMessage}</p>}
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

          <div className="flex flex-wrap items-center gap-3">
            <button className={buttonClass} onClick={() => setMuted((m) => !m)}>
              {muted ? "🔇 Ses kapalı" : "🔊 Ses açık"}
            </button>
            <button className={buttonClass} onClick={() => setMusicOn((m) => !m)}>
              {musicOn ? "🎵 Müzik açık" : "🎵 Müzik kapalı"}
            </button>
            {!audioReady && !muted && (
              <span className="text-xs text-neutral-500">
                Tarayıcı sesi bir dokunuştan sonra açar; sayfaya bir kez tıklayın.
              </span>
            )}
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

          {mode === "leaders" && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                Sonraki maç kartı (video sonu)
              </h2>
              <p className="text-xs text-neutral-500">
                Boş bırakılırsa kartta “?” görünür. Seçilirse “WHO&apos;S NEXT?” kartında bu iki
                lider gösterilir.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    [nextA, setNextA],
                    [nextB, setNextB],
                  ] as const
                ).map(([value, set], i) => (
                  <select
                    key={i}
                    className={`${controlClass} w-full`}
                    value={value}
                    onChange={(e) => set(e.target.value)}
                  >
                    <option className="bg-[#0d1224]" value="">
                      ?
                    </option>
                    {roster.map((d) => (
                      <option className="bg-[#0d1224]" key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
          )}

          {mode === "leaders" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
                  Video açıklaması
                </h2>
                <button
                  className={buttonClass}
                  onClick={() => {
                    const [da, db] = resolveFighters(seed, mode, a, b);
                    void navigator.clipboard?.writeText(videoDescription(da, db)).then(
                      () => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      },
                      () => setCopied(false),
                    );
                  }}
                >
                  {copied ? "✓ Kopyalandı" : "📋 Kopyala"}
                </button>
              </div>
              <textarea
                readOnly
                className={`${controlClass} h-48 w-full font-mono text-xs`}
                value={(() => {
                  const [da, db] = resolveFighters(seed, mode, a, b);
                  return videoDescription(da, db);
                })()}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}

          <div className="space-y-2 pt-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
              Karakterler
            </h2>
            {roster.map((d) => (
              <div key={d.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-sm font-bold">
                    {d.name}
                    {d.era && <span className="ml-2 font-normal text-neutral-500">{d.era}</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    HP {d.hp}
                    {d.reach > 0 && ` · HASAR ${d.damage}`}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug text-neutral-400">{d.description}</p>
                {d.title && <p className="mt-0.5 text-xs text-neutral-300">{d.title}</p>}
                {d.ability && (
                  <p className="mt-1 text-xs text-neutral-300">
                    <span className="font-semibold">{d.ability.name}</span> — {d.ability.text}
                  </p>
                )}
                {ultimateName(d) && (
                  <p className="mt-0.5 text-xs text-amber-300">
                    ULTIMATE (%30 can): {ultimateName(d)}
                  </p>
                )}
                {d.fact && <p className="mt-1 text-xs italic text-neutral-500">“{d.fact}”</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

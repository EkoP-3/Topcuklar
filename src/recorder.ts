import { createRenderer } from "./sim/render/canvas";
import { Fx } from "./sim/render/fx";
import { Sfx } from "./sim/render/sfx";
import type { FighterDef } from "./sim/types";
import { World } from "./sim/world";

/** Seconds of the winner screen kept at the end of the clip. */
const TAIL = 1.6;
/** Safety net: stop a recording that somehow never finishes. */
const MAX_SECONDS = 90;

export interface RecordOptions {
  seed: number;
  fighters: [FighterDef, FighterDef];
  /** Called often with 0..1. */
  onProgress: (progress: number) => void;
}

export interface Recording {
  cancel(): void;
  /** Resolves with the saved file name, or null when cancelled. Rejects on failure. */
  done: Promise<string | null>;
}

interface Format {
  mime: string;
  ext: "mp4" | "webm";
}

const FORMATS: Format[] = [
  { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

function pickFormat(): Format | null {
  if (typeof MediaRecorder === "undefined") return null;
  return FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

export function canRecord(): boolean {
  return pickFormat() !== null && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

/** How long the clip will be, found by quickly playing the same match without drawing. */
function clipSeconds(seed: number, fighters: [FighterDef, FighterDef]): number {
  const probe = new World(seed, fighters);
  let frames = 0;
  while (probe.phase !== "over" && frames < 60 * MAX_SECONDS) {
    probe.advance(1 / 60);
    probe.events.length = 0;
    frames++;
  }
  return frames / 60 + TAIL;
}

/**
 * Plays the match from the start on a hidden 1080x1920 canvas, records it in real
 * time and downloads the file when the winner has been shown.
 */
export function recordMatch(opts: RecordOptions): Recording {
  const format = pickFormat();
  if (!format) {
    return {
      cancel() {},
      done: Promise.reject(new Error("Bu tarayıcı video kaydını desteklemiyor.")),
    };
  }

  let cancelled = false;
  let stop: () => void = () => {};

  const done = (async (): Promise<string | null> => {
    if (document.fonts) await document.fonts.ready;

    const total = clipSeconds(opts.seed, opts.fighters);
    const world = new World(opts.seed, opts.fighters);
    const fx = new Fx(opts.seed);
    const canvas = document.createElement("canvas");
    const renderer = createRenderer(canvas, 1);
    renderer.draw(world, fx);

    const stream = canvas.captureStream(60);

    // Sound: the same effects the preview plays, recorded into the clip.
    let audioContext: AudioContext | null = null;
    try {
      audioContext = new AudioContext();
      const sfx = new Sfx(audioContext);
      sfx.resume();
      sfx.tap.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      fx.sfx = sfx;
    } catch {
      audioContext = null;
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise<string | null>((resolve, reject) => {
      let raf = 0;
      let finished = false;
      let last = performance.now();
      const startedAt = last;
      let tail = 0;

      const finish = (discard: boolean) => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf);
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          void audioContext?.close();
          if (discard) {
            resolve(null);
            return;
          }
          const name = `arena-${opts.fighters[0].id}-vs-${opts.fighters[1].id}-seed${opts.seed}.${format.ext}`;
          const blob = new Blob(chunks, {
            type: format.ext === "mp4" ? "video/mp4" : "video/webm",
          });
          saveFile(name, blob).then(
            (saved) => resolve(saved ? name : null),
            (err: unknown) =>
              reject(err instanceof Error ? err : new Error("Kayıt kaydedilemedi.")),
          );
        };
        recorder.onerror = () => reject(new Error("Kayıt sırasında bir hata oluştu."));
        if (recorder.state !== "inactive") recorder.stop();
        else recorder.onstop?.(new Event("stop"));
      };
      stop = () => finish(true);

      const tick = (now: number) => {
        const dt = Math.min(1 / 20, (now - last) / 1000);
        last = now;
        world.advance(dt);
        fx.consume(world);
        fx.update(dt, world);
        renderer.draw(world, fx);

        const elapsed = (now - startedAt) / 1000;
        opts.onProgress(Math.min(1, elapsed / total));

        if (world.phase === "over") tail += dt;
        if (tail >= TAIL || elapsed > MAX_SECONDS) {
          finish(cancelled);
          return;
        }
        raf = requestAnimationFrame(tick);
      };

      recorder.start(250);
      raf = requestAnimationFrame(tick);
    });
  })();

  return {
    cancel() {
      cancelled = true;
      stop();
    },
    done,
  };
}

interface HostDownloads {
  save(request: { filename: string; data: Blob }): Promise<unknown>;
}

/**
 * Saves a file. Inside the claude.ai viewer, plain downloads are blocked, so the
 * viewer's own "downloads" capability is used there; everywhere else a normal
 * browser download. Resolves false when the person declined the save.
 */
async function saveFile(name: string, blob: Blob): Promise<boolean> {
  const host = (
    window as unknown as {
      claude?: { use?: (name: string) => Promise<HostDownloads | null> };
    }
  ).claude;
  if (host?.use) {
    try {
      const downloads = await host.use("downloads");
      if (downloads) {
        await downloads.save({ filename: name, data: blob });
        return true;
      }
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "declined") return false;
      // Any other failure: fall through to the ordinary download below.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createRenderer } from "./sim/render/canvas";
import { loadFonts } from "./sim/render/palette";
import { Fx } from "./sim/render/fx";
import { Music, musicState } from "./sim/render/music";
import { Sfx } from "./sim/render/sfx";
import { Narrator, OUTRO_DELAY, loadVoice, speakIntro, speakOutro } from "./sim/render/voice";
import type { FighterDef } from "./sim/types";
import { World } from "./sim/world";

/** Seconds of the end screen kept at the end of the clip (history mode adds the "who's next?" card). */
export function tailSeconds(fighters: readonly FighterDef[]): number {
  return fighters.some((d) => d.growth) ? 3.6 : 1.6;
}
/** Safety net: stop a recording that somehow never finishes. */
const MAX_SECONDS = 90;
const FPS = 60;
const WIDTH = 1080;
const HEIGHT = 1920;
const VIDEO_BITRATE = 8_000_000;
const SAMPLE_RATE = 48_000;
/** Share of the progress bar used by the sound pass; the rest is video frames. */
const AUDIO_SHARE = 0.08;

export interface RecordOptions {
  seed: number;
  fighters: [FighterDef, FighterDef];
  /** Called often with 0..1. */
  onProgress: (progress: number) => void;
  /** Background music in the clip (default true). */
  music?: boolean;
  /** Shown on the "who's next?" end card instead of question marks. */
  next?: readonly [FighterDef, FighterDef] | null;
}

export interface Recording {
  cancel(): void;
  /** Resolves with the saved file name, or null when cancelled. Rejects on failure. */
  done: Promise<string | null>;
}

class Cancelled extends Error {}

export function canRecord(): boolean {
  return canEncodeOffline() || pickStreamFormat() !== null;
}

/**
 * Records the match from the start and saves it as a video file.
 *
 * Preferred path: frames are drawn one by one and handed to the device's video
 * encoder (WebCodecs), not tied to the clock. The page takes a break after every
 * frame, so the device stays responsive; a fast computer finishes quicker than real
 * time, a slow phone a bit slower, and no frame is ever dropped. Output: MP4.
 *
 * Fallback for browsers without WebCodecs: real-time MediaRecorder capture (lighter
 * than before: 30 fps).
 */
export function recordMatch(opts: RecordOptions): Recording {
  let cancelled = false;
  let cancelStream: () => void = () => {};
  const done = (async (): Promise<string | null> => {
    await loadFonts();
    const plan = canEncodeOffline() ? await pickOfflineCodecs() : null;
    try {
      if (plan) return await recordOffline(opts, plan, () => cancelled);
      const job = recordStream(opts);
      cancelStream = job.cancel;
      if (cancelled) job.cancel();
      return await job.done;
    } catch (err) {
      if (err instanceof Cancelled) return null;
      throw err;
    }
  })();
  return {
    cancel() {
      cancelled = true;
      cancelStream();
    },
    done,
  };
}

// --- offline (WebCodecs) ---------------------------------------------------------

interface OfflinePlan {
  video: { codec: string; mux: "avc" | "vp9" };
  audio: { codec: string; mux: "aac" | "opus" };
}

function canEncodeOffline(): boolean {
  return (
    typeof VideoEncoder !== "undefined" &&
    typeof VideoFrame !== "undefined" &&
    typeof AudioEncoder !== "undefined" &&
    typeof OfflineAudioContext !== "undefined"
  );
}

async function pickOfflineCodecs(): Promise<OfflinePlan | null> {
  const videos: OfflinePlan["video"][] = [
    { codec: "avc1.64002A", mux: "avc" }, // H.264 High 4.2
    { codec: "avc1.4D402A", mux: "avc" }, // H.264 Main 4.2
    { codec: "avc1.42E02A", mux: "avc" }, // H.264 Baseline 4.2
    { codec: "vp09.00.41.08", mux: "vp9" },
  ];
  const audios: OfflinePlan["audio"][] = [
    { codec: "mp4a.40.2", mux: "aac" },
    { codec: "opus", mux: "opus" },
  ];
  let video: OfflinePlan["video"] | null = null;
  for (const c of videos) {
    if (await supported(() => VideoEncoder.isConfigSupported(videoConfig(c.codec)))) {
      video = c;
      break;
    }
  }
  let audio: OfflinePlan["audio"] | null = null;
  for (const c of audios) {
    if (await supported(() => AudioEncoder.isConfigSupported(audioConfig(c.codec)))) {
      audio = c;
      break;
    }
  }
  // Without sound the older recorder (which always has sound) is the better choice.
  return video && audio ? { video, audio } : null;
}

async function supported(check: () => Promise<{ supported?: boolean }>): Promise<boolean> {
  try {
    return (await check()).supported === true;
  } catch {
    return false;
  }
}

function videoConfig(codec: string): VideoEncoderConfig {
  return {
    codec,
    width: WIDTH,
    height: HEIGHT,
    bitrate: VIDEO_BITRATE,
    framerate: FPS,
    ...(codec.startsWith("avc1") ? { avc: { format: "avc" as const } } : {}),
  };
}

function audioConfig(codec: string): AudioEncoderConfig {
  return { codec, sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 128_000 };
}

async function recordOffline(
  opts: RecordOptions,
  plan: OfflinePlan,
  isCancelled: () => boolean,
): Promise<string | null> {
  const check = () => {
    if (isCancelled()) throw new Cancelled();
  };

  // 1. Sound: replay the match without drawing, then render all sounds at once.
  const sound = await renderSound(opts);
  check();
  const totalFrames = sound.frames;
  opts.onProgress(AUDIO_SHARE * 0.5);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: plan.video.mux, width: WIDTH, height: HEIGHT, frameRate: FPS },
    audio: { codec: plan.audio.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    // Metadata at the end: no big copy when finishing (players and YouTube handle it).
    fastStart: false,
  });

  let failure: Error | null = null;
  const fail = (e: unknown) => {
    failure ??= e instanceof Error ? e : new Error("Video kodlanamadı.");
  };
  const assertOk = () => {
    if (failure) throw failure;
  };

  await encodeAudio(sound.buffer, plan.audio.codec, muxer, fail);
  assertOk();
  check();
  opts.onProgress(AUDIO_SHARE);

  // 2. Video: draw each frame and hand it to the encoder.
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: fail,
  });
  encoder.configure(videoConfig(plan.video.codec));

  const world = new World(opts.seed, opts.fighters);
  const fx = new Fx(opts.seed);
  const canvas = document.createElement("canvas");
  const renderer = createRenderer(canvas, 1);
  const dt = 1 / FPS;

  try {
    for (let i = 0; i < totalFrames; i++) {
      check();
      assertOk();
      if (i > 0) {
        world.advance(dt);
        fx.consume(world);
        fx.update(dt, world);
      }
      renderer.draw(world, fx, { next: opts.next ?? null });
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / FPS),
        duration: Math.round(1e6 / FPS),
      });
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
      frame.close();
      // Let the encoder catch up, and let the page breathe.
      while (encoder.encodeQueueSize > 2) await waitForDequeue(encoder);
      await yieldToPage();
      opts.onProgress(AUDIO_SHARE + (1 - AUDIO_SHARE) * ((i + 1) / totalFrames));
    }
    await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
  assertOk();
  check();

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  const name = fileName(opts, "mp4");
  return (await saveFile(name, blob)) ? name : null;
}

/** Plays the match headlessly into an OfflineAudioContext. Also finds the clip length. */
async function renderSound(opts: RecordOptions): Promise<{ buffer: AudioBuffer; frames: number }> {
  const probe = new World(opts.seed, opts.fighters);
  const dt = 1 / FPS;
  const plays: { t: number; events: World["events"] }[] = [];
  // Frame 0 is the starting position; frame n has been advanced n times.
  let frames = 1;
  let overFrames = 0;
  let overAt = 0;
  const tail = tailSeconds(opts.fighters);
  const states: ReturnType<typeof musicState>[] = [musicState(probe)];
  while (overFrames < tail * FPS && frames < FPS * MAX_SECONDS) {
    probe.advance(dt);
    if (probe.events.length > 0) {
      plays.push({ t: frames * dt, events: probe.events });
      probe.events = [];
    }
    states.push(musicState(probe));
    if (probe.phase === "over") {
      if (overFrames === 0) overAt = frames * dt;
      overFrames++;
    }
    frames++;
    if (frames % 240 === 0) await yieldToPage();
  }

  const length = Math.ceil((frames / FPS) * SAMPLE_RATE);
  const ctx = new OfflineAudioContext(2, length, SAMPLE_RATE);
  const sfx = new Sfx(ctx);
  // Sfx only looks up who hit whom (fixed character data), so the final state is fine.
  for (let i = 0; i < plays.length; i++) {
    const p = plays[i];
    if (!p) continue;
    sfx.clock = p.t;
    for (const e of p.events) sfx.play(probe, e);
    if (i % 100 === 99) await yieldToPage();
  }
  if (opts.music !== false) {
    // The same music code as the live preview, driven by the frame clock.
    const music = new Music(sfx);
    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      if (state) music.update(state, i * dt);
      if (i % 600 === 599) await yieldToPage();
    }
  }
  if (opts.fighters.some((d) => d.growth)) {
    const clips = await loadVoice(ctx);
    speakIntro(sfx, clips, opts.fighters[0].id, opts.fighters[1].id);
    speakOutro(sfx, clips, overAt + OUTRO_DELAY);
  }
  const buffer = await ctx.startRendering();
  return { buffer, frames };
}

async function encodeAudio(
  buffer: AudioBuffer,
  codec: string,
  muxer: Muxer<ArrayBufferTarget>,
  fail: (e: unknown) => void,
): Promise<void> {
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: fail,
  });
  encoder.configure(audioConfig(codec));
  const block = 4800;
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  try {
    for (let start = 0; start < buffer.length; start += block) {
      const n = Math.min(block, buffer.length - start);
      const data = new Float32Array(n * 2);
      data.set(left.subarray(start, start + n), 0);
      data.set(right.subarray(start, start + n), n);
      const audio = new AudioData({
        format: "f32-planar",
        sampleRate: SAMPLE_RATE,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round((start * 1e6) / SAMPLE_RATE),
        data,
      });
      encoder.encode(audio);
      audio.close();
      if (encoder.encodeQueueSize > 8) await yieldToPage();
    }
    await encoder.flush();
  } finally {
    if (encoder.state !== "closed") encoder.close();
  }
}

function waitForDequeue(encoder: VideoEncoder): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 20);
    encoder.addEventListener(
      "dequeue",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

const channel = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
const waiting: (() => void)[] = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();

/** Gives the browser a chance to handle input and paint before continuing. */
function yieldToPage(): Promise<void> {
  return new Promise((resolve) => {
    if (channel) {
      waiting.push(resolve);
      channel.port2.postMessage(0);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// --- fallback: real-time MediaRecorder ------------------------------------------

interface StreamFormat {
  mime: string;
  ext: "mp4" | "webm";
}

const STREAM_FORMATS: StreamFormat[] = [
  { mime: "video/mp4;codecs=avc1,mp4a.40.2", ext: "mp4" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];
const STREAM_FPS = 30;

function pickStreamFormat(): StreamFormat | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return null;
  return STREAM_FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
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
  return frames / 60 + tailSeconds(fighters);
}

/** Real-time capture of a hidden canvas (browsers without WebCodecs). */
function recordStream(opts: RecordOptions): Recording {
  const format = pickStreamFormat();
  if (!format) {
    return {
      cancel() {},
      done: Promise.reject(new Error("Bu tarayıcı video kaydını desteklemiyor.")),
    };
  }
  let stop: () => void = () => {};

  const done = (async (): Promise<string | null> => {
    const total = clipSeconds(opts.seed, opts.fighters);
    const world = new World(opts.seed, opts.fighters);
    const fx = new Fx(opts.seed);
    const canvas = document.createElement("canvas");
    const renderer = createRenderer(canvas, 1);
    const extras = { next: opts.next ?? null };
    renderer.draw(world, fx, extras);

    const stream = canvas.captureStream(STREAM_FPS);
    let audioContext: AudioContext | null = null;
    let music: Music | null = null;
    let narrator: Narrator | null = null;
    try {
      audioContext = new AudioContext();
      const sfx = new Sfx(audioContext, { tap: true });
      sfx.resume();
      sfx.tap?.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      fx.sfx = sfx;
      if (opts.music !== false) music = new Music(sfx);
      narrator = new Narrator(sfx);
    } catch {
      audioContext = null;
    }
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mime,
      videoBitsPerSecond: 5_000_000,
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
      let sinceDraw = 0;

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
          const name = fileName(opts, format.ext);
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
        if (music && audioContext) music.update(musicState(world), audioContext.currentTime);
        narrator?.update(world);
        fx.consume(world);
        fx.update(dt, world);
        // Only draw as often as the stream captures.
        sinceDraw += dt;
        if (sinceDraw >= 1 / STREAM_FPS - 0.002) {
          sinceDraw = 0;
          renderer.draw(world, fx, extras);
        }

        const elapsed = (now - startedAt) / 1000;
        opts.onProgress(Math.min(1, elapsed / total));

        if (world.phase === "over") tail += dt;
        if (tail >= tailSeconds(opts.fighters) || elapsed > MAX_SECONDS) {
          finish(false);
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
      stop();
    },
    done,
  };
}

// --- saving ----------------------------------------------------------------------

function fileName(opts: RecordOptions, ext: string): string {
  return `arena-${opts.fighters[0].id}-vs-${opts.fighters[1].id}-seed${opts.seed}.${ext}`;
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

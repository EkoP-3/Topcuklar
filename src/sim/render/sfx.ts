import type { SimEvent } from "../types";
import type { World } from "../world";

/** Weapons that sound like heavy impacts instead of metal. */
const BLUNT = new Set(["maul", "mace"]);

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
  attack?: number;
}

interface NoiseOptions {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  slideTo?: number;
  q?: number;
  delay?: number;
}

/**
 * Sound effects synthesized with the Web Audio API (no audio files). Purely
 * cosmetic: it listens to simulation events and never feeds anything back.
 *
 * Sound goes to the speakers (unless muted) and, when `recordTap` is read, to a
 * stream that a video recorder can add to the clip.
 */
export class Sfx {
  readonly ctx: AudioContext;
  /** Audio stream for video recording; always carries sound, even when muted. */
  readonly tap: MediaStreamAudioDestinationNode;
  private readonly bus: GainNode;
  private readonly monitor: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private readonly lastPlayed = new Map<string, number>();

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.tap = ctx.createMediaStreamDestination();

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55;
    this.bus.connect(compressor);

    this.monitor = ctx.createGain();
    compressor.connect(this.monitor);
    this.monitor.connect(ctx.destination);
    compressor.connect(this.tap);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.monitor.gain.value = muted ? 0 : 1;
  }

  resume(): void {
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Plays the sound for one simulation event. */
  play(world: World, e: SimEvent): void {
    if (this.ctx.state !== "running") return;
    switch (e.type) {
      case "hit": {
        if (!this.allow("hit", 0.03)) return;
        const attacker = world.fighters[e.attacker];
        const power = clamp(0.3 + e.damage / 28, 0.3, 1);
        if (attacker && BLUNT.has(attacker.def.id)) this.thud(power);
        else this.clang(power);
        break;
      }
      case "clash":
        if (!this.allow("clash", 0.08)) return;
        this.tone(1250 * rand(0.95, 1.05), 0.35, { type: "triangle", gain: 0.22 });
        this.tone(1870 * rand(0.95, 1.05), 0.25, { type: "square", gain: 0.06 });
        this.noise(0.06, { filter: "highpass", freq: 3000, gain: 0.3 });
        break;
      case "wall":
        if (!this.allow("wall", 0.05)) return;
        this.tone(180 * rand(0.9, 1.1), 0.07, { type: "sine", gain: 0.2, slideTo: 90 });
        break;
      case "bump":
        if (!this.allow("bump", 0.06)) return;
        this.tone(110, 0.1, {
          type: "sine",
          gain: clamp(e.strength / 1200, 0.15, 0.5),
          slideTo: 55,
        });
        break;
      case "levelUp":
        [523, 659, 784, 1046].forEach((f, i) =>
          this.tone(f, 0.12, { type: "square", gain: 0.1, delay: i * 0.055 }),
        );
        break;
      case "ring":
        this.tone(880, 1.4, { type: "sine", gain: 0.3 });
        this.tone(1320, 1.1, { type: "sine", gain: 0.12 });
        this.tone(2217, 0.8, { type: "sine", gain: 0.06 });
        this.tone(70, 0.5, { type: "sine", gain: 0.6, slideTo: 35 });
        break;
      case "pylon":
        this.tone(900, 0.12, { type: "sawtooth", gain: 0.1, slideTo: 300 });
        break;
      case "arc":
        this.noise(0.45, { filter: "bandpass", freq: 2200, q: 1.5, gain: 0.5 });
        this.tone(95, 0.45, { type: "sawtooth", gain: 0.2, slideTo: 60 });
        break;
      case "hookLaunch":
        this.noise(0.25, { filter: "bandpass", freq: 700, slideTo: 2200, q: 2, gain: 0.25 });
        break;
      case "hookAttach":
        this.tone(1500, 0.12, { type: "triangle", gain: 0.25, slideTo: 700 });
        this.noise(0.05, { filter: "highpass", freq: 2500, gain: 0.3 });
        break;
      case "charge":
        this.tone(160, 0.65, { type: "sawtooth", gain: 0.12, slideTo: 620 });
        break;
      case "dash":
        this.noise(0.3, { filter: "bandpass", freq: 3000, slideTo: 500, q: 1.2, gain: 0.5 });
        break;
      case "ko":
        this.tone(120, 0.9, { type: "sawtooth", gain: 0.45, slideTo: 30 });
        this.noise(0.8, { filter: "lowpass", freq: 1800, slideTo: 120, gain: 0.7 });
        this.tone(55, 1.2, { type: "sine", gain: 0.6, slideTo: 28 });
        break;
      case "fight":
        [392, 523, 659].forEach((f, i) =>
          this.tone(f, 0.28, { type: "square", gain: 0.09, delay: i * 0.07 }),
        );
        break;
      default:
        break;
    }
  }

  /** Metal-on-body impact. */
  private clang(power: number): void {
    const f = 520 * rand(0.9, 1.15);
    this.tone(f, 0.16, { type: "triangle", gain: 0.3 * power, slideTo: f * 0.55 });
    this.tone(f * 2.76, 0.1, { type: "square", gain: 0.05 * power });
    this.noise(0.07, { filter: "bandpass", freq: 3200, q: 0.9, gain: 0.55 * power });
  }

  /** Heavy blunt impact. */
  private thud(power: number): void {
    this.tone(150 * rand(0.9, 1.1), 0.22, { type: "sine", gain: 0.7 * power, slideTo: 45 });
    this.noise(0.12, { filter: "lowpass", freq: 900, gain: 0.55 * power });
  }

  /** Skips a sound that played less than `gap` seconds ago (avoids machine-gun stacking). */
  private allow(key: string, gap: number): boolean {
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -1) < gap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, o: ToneOptions = {}): void {
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + dur);
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, o: NoiseOptions = {}): void {
    const t0 = this.ctx.currentTime + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filter ?? "bandpass";
    filter.frequency.setValueAtTime(o.freq ?? 1500, t0);
    if (o.slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t0 + dur);
    filter.Q.value = o.q ?? 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(o.gain ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.bus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

import type { SimEvent } from "../types";
import type { World } from "../world";

/** Weapons that sound like heavy impacts instead of metal. */
const BLUNT = new Set(["maul", "mace"]);

export interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  delay?: number;
  attack?: number;
  /** Absolute start time (overrides `delay`). */
  at?: number;
  /** Soften bright waves with a low-pass filter at this frequency. */
  lowpass?: number;
  /** Route to the music bus instead of the effects bus. */
  music?: boolean;
}

export interface NoiseOptions {
  gain?: number;
  filter?: BiquadFilterType;
  freq?: number;
  slideTo?: number;
  q?: number;
  delay?: number;
  at?: number;
  music?: boolean;
}

/**
 * Sound effects synthesized with the Web Audio API (no audio files). Purely
 * cosmetic: it listens to simulation events and never feeds anything back.
 *
 * Sound goes to the context's destination: the speakers for a live `AudioContext`
 * (unless muted), or the rendered buffer for an `OfflineAudioContext` (video export).
 * With `{ tap: true }` it is also sent to a MediaStream a recorder can add to a clip.
 */
export class Sfx {
  readonly ctx: BaseAudioContext;
  /** Audio stream for real-time video recording; always carries sound, even when muted. */
  readonly tap: MediaStreamAudioDestinationNode | null;
  /**
   * Offline rendering: the time (seconds) at which sounds played now should start.
   * Null means "right now" on a live context.
   */
  clock: number | null = null;
  private readonly bus: GainNode;
  /** Background music goes through here (quieter than the effects). */
  private readonly musicBus: GainNode;
  private readonly monitor: GainNode;
  private readonly noiseBuffer: AudioBuffer;
  private readonly lastPlayed = new Map<string, number>();

  constructor(ctx: BaseAudioContext, opts: { tap?: boolean } = {}) {
    this.ctx = ctx;
    this.tap = opts.tap && ctx instanceof AudioContext ? ctx.createMediaStreamDestination() : null;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.55;
    this.bus.connect(compressor);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(compressor);

    this.monitor = ctx.createGain();
    compressor.connect(this.monitor);
    this.monitor.connect(ctx.destination);
    if (this.tap) compressor.connect(this.tap);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted: boolean): void {
    this.monitor.gain.value = muted ? 0 : 1;
  }

  resume(): void {
    if (this.ctx instanceof AudioContext && this.ctx.state === "suspended") void this.ctx.resume();
  }

  now(): number {
    return this.clock ?? this.ctx.currentTime;
  }

  /** Plays the sound for one simulation event. */
  play(world: World, e: SimEvent): void {
    if (this.clock === null && this.ctx.state !== "running") return;
    switch (e.type) {
      case "hit": {
        if (e.dot) {
          if (!this.allow("dot", 0.25)) return;
          this.tone(520, 0.06, { type: "sine", gain: 0.06, slideTo: 380 });
          return;
        }
        if (!this.allow("hit", 0.03)) return;
        const attacker = world.fighters[e.attacker];
        const target = world.fighters[e.target];
        const rel = target ? (e.damage / target.maxHp) * 100 : e.damage;
        const power = clamp(0.3 + rel / 28, 0.3, 1);
        // Leaders hit with their bodies, units and projectiles: heavy impacts.
        if (attacker && (BLUNT.has(attacker.def.id) || attacker.def.reach <= 0)) this.thud(power);
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
      case "summon":
        if (e.style === "elephant") {
          this.tone(330, 0.5, { type: "sawtooth", gain: 0.12, slideTo: 620, attack: 0.05 });
          this.tone(660, 0.45, { type: "square", gain: 0.04, slideTo: 1240, attack: 0.05 });
        } else {
          [196, 294].forEach((f, i) =>
            this.tone(f, 0.32, { type: "sawtooth", gain: 0.1, delay: i * 0.14, attack: 0.03 }),
          );
        }
        break;
      case "shoot":
        if (e.style === "arrow") {
          this.noise(0.12, { filter: "bandpass", freq: 2600, slideTo: 900, q: 2, gain: 0.35 });
          this.tone(880, 0.07, { type: "triangle", gain: 0.12, slideTo: 420 });
        } else if (e.style === "musket") {
          // Volley: a crackle of shots.
          for (let i = 0; i < 5; i++) {
            this.noise(0.12, { filter: "highpass", freq: 1800, gain: 0.5, delay: i * 0.018 });
          }
          this.tone(140, 0.25, { type: "sine", gain: 0.4, slideTo: 60 });
        } else if (e.style === "asp") {
          this.noise(0.35, { filter: "highpass", freq: 4500, gain: 0.25 });
        } else {
          const big = e.style === "bombard";
          this.tone(big ? 70 : 110, big ? 0.6 : 0.35, {
            type: "sine",
            gain: big ? 0.8 : 0.55,
            slideTo: big ? 28 : 45,
          });
          this.noise(big ? 0.5 : 0.25, { filter: "lowpass", freq: 1400, slideTo: 150, gain: 0.6 });
        }
        break;
      case "blast":
        this.tone(60, 0.9, { type: "sine", gain: 0.8, slideTo: 24 });
        this.noise(0.9, { filter: "lowpass", freq: 2200, slideTo: 100, gain: 0.8 });
        break;
      case "unitDown":
        if (!this.allow("unitDown", 0.08)) return;
        this.thud(0.5);
        break;
      case "shield":
        this.tone(660, 0.5, { type: "triangle", gain: 0.18 });
        this.tone(990, 0.45, { type: "triangle", gain: 0.12, delay: 0.03 });
        this.noise(0.08, { filter: "highpass", freq: 3500, gain: 0.25 });
        break;
      case "stun":
        [1200, 950, 750].forEach((f, i) =>
          this.tone(f, 0.08, { type: "triangle", gain: 0.12, delay: i * 0.07 }),
        );
        break;
      case "poison":
        this.noise(0.4, { filter: "bandpass", freq: 4200, q: 3, gain: 0.3 });
        break;
      case "ultimate":
        // Rising tension while the name is on screen.
        this.tone(110, 1.8, { type: "sawtooth", gain: 0.16, slideTo: 880, attack: 0.3 });
        this.tone(55, 1.8, { type: "sine", gain: 0.4, slideTo: 110, attack: 0.2 });
        this.noise(1.7, { filter: "bandpass", freq: 300, slideTo: 4000, q: 0.8, gain: 0.35 });
        break;
      case "ultimateCast":
        this.tone(48, 1.4, { type: "sine", gain: 0.9, slideTo: 22 });
        this.noise(1.2, { filter: "lowpass", freq: 2600, slideTo: 90, gain: 0.9 });
        [262, 330, 392, 523].forEach((f) =>
          this.tone(f, 0.9, { type: "sawtooth", gain: 0.07, attack: 0.02 }),
        );
        break;
      case "strike":
        if (e.style === "shell") {
          if (!this.allow("shell", 0.06)) return;
          const big = e.radius > 120;
          this.tone(big ? 45 : 70, big ? 1.2 : 0.6, {
            type: "sine",
            gain: big ? 0.9 : 0.6,
            slideTo: 25,
          });
          this.noise(big ? 1 : 0.5, { filter: "lowpass", freq: 2000, slideTo: 100, gain: 0.7 });
        } else {
          if (!this.allow("arrowHit", 0.05)) return;
          this.tone(380 * rand(0.9, 1.1), 0.05, { type: "triangle", gain: 0.12, slideTo: 200 });
        }
        break;
      case "stomp":
        this.thud(1);
        this.tone(55, 0.5, { type: "sine", gain: 0.6, slideTo: 30 });
        break;
      case "nearMiss":
        // Whoosh past.
        this.noise(0.28, { filter: "bandpass", freq: 600, slideTo: 3500, q: 1.5, gain: 0.45 });
        this.tone(660 + e.count * 110, 0.12, { type: "triangle", gain: 0.12, delay: 0.12 });
        break;
      case "frenzy":
        if (e.on) {
          // Alarm + rumble as the walls close in.
          for (let i = 0; i < 3; i++) {
            this.tone(880, 0.16, { type: "square", gain: 0.1, delay: i * 0.22, slideTo: 660 });
          }
          this.tone(50, 1.2, { type: "sawtooth", gain: 0.25, slideTo: 35, lowpass: 400 });
        } else {
          this.tone(300, 0.4, { type: "triangle", gain: 0.12, slideTo: 150 });
        }
        break;
      case "callout":
        this.tone(98, 0.6, { type: "sawtooth", gain: 0.15, attack: 0.01 });
        this.tone(147, 0.6, { type: "sawtooth", gain: 0.1, attack: 0.01 });
        this.thud(1);
        break;
      case "sweepHit":
        this.thud(1);
        this.noise(0.4, { filter: "lowpass", freq: 1200, slideTo: 100, gain: 0.7 });
        break;
      case "slam":
        this.tone(70, 0.8, { type: "sine", gain: 0.9, slideTo: 25 });
        this.noise(0.15, { filter: "highpass", freq: 2500, gain: 0.6 });
        this.noise(0.6, { filter: "lowpass", freq: 1500, slideTo: 80, gain: 0.8 });
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
    const now = this.now();
    if (now - (this.lastPlayed.get(key) ?? -1) < gap) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  tone(freq: number, dur: number, o: ToneOptions = {}): void {
    const t0 = o.at ?? this.now() + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + dur);
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const out = o.music ? this.musicBus : this.bus;
    if (o.lowpass) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = o.lowpass;
      osc.connect(lp).connect(g).connect(out);
    } else {
      osc.connect(g).connect(out);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur: number, o: NoiseOptions = {}): void {
    const t0 = o.at ?? this.now() + (o.delay ?? 0);
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
    src
      .connect(filter)
      .connect(g)
      .connect(o.music ? this.musicBus : this.bus);
    src.start(Math.max(0, t0), Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

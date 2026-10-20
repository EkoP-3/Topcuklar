import type { SimEvent } from "../types";
import { winChance } from "../odds";
import type { World } from "../world";

/** Below this pre-fight win chance a victory counts as an upset. */
export const UPSET_CHANCE = 0.4;

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
  /** Pitch offset in cents (for detuned layers). */
  detune?: number;
  /** Fraction of `dur` held at full volume before the fade (default 0: decay at once). */
  hold?: number;
}

export interface NoteOptions {
  at?: number;
  delay?: number;
  gain?: number;
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
  /** Plucked-string notes, rendered once per pitch. */
  private readonly plucks = new Map<number, AudioBuffer>();

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

    // Shared hall reverb: everything sounds like it is played in one stone room.
    const reverb = ctx.createConvolver();
    reverb.buffer = hallImpulse(ctx, 1.9);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = 0.9;
    reverb.connect(reverbReturn).connect(compressor);
    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.18;
    this.bus.connect(fxSend).connect(reverb);
    const musicSend = ctx.createGain();
    musicSend.gain.value = 0.38;
    this.musicBus.connect(musicSend).connect(reverb);

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
        this.bell(1250 * rand(0.95, 1.05), 0.4, 0.2);
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
        // War-horn call over a drum hit.
        if (!this.allow("levelUp", 0.5)) return;
        this.drum(0.9);
        this.horn(196, 0.22, { gain: 0.12 });
        this.horn(262, 0.6, { gain: 0.14, delay: 0.2 });
        this.horn(392, 0.6, { gain: 0.06, delay: 0.2 });
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
        if (e.style === "terracotta") {
          this.drum(0.5);
          this.noise(0.12, { filter: "lowpass", freq: 600, gain: 0.3 });
        } else if (e.style === "impi") {
          if (!this.allow("impi", 0.2)) return;
          this.drum(0.45);
          this.drum(0.35, { delay: 0.12 });
        } else if (e.style === "elephant") {
          // Trumpeting elephant.
          this.tone(330, 0.5, {
            type: "sawtooth",
            gain: 0.12,
            slideTo: 620,
            attack: 0.05,
            lowpass: 1800,
          });
          this.tone(336, 0.45, {
            type: "sawtooth",
            gain: 0.06,
            slideTo: 640,
            attack: 0.05,
            lowpass: 2400,
          });
        } else {
          this.horn(196, 0.2, { gain: 0.1 });
          this.horn(294, 0.35, { gain: 0.1, delay: 0.14 });
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
        } else if (e.style === "axe") {
          // Whirring axe.
          for (let i = 0; i < 3; i++) {
            this.noise(0.09, {
              filter: "bandpass",
              freq: 900 + i * 250,
              q: 2,
              gain: 0.3,
              delay: i * 0.07,
            });
          }
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
        this.drum(1);
        for (const f of [131, 196, 262, 330]) this.horn(f, 1.1, { gain: 0.07 });
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
        // Whoosh past, then a plucked sting that climbs with the count.
        this.noise(0.32, { filter: "bandpass", freq: 500, slideTo: 3200, q: 1.4, gain: 0.5 });
        this.pluck(440 * 2 ** ((e.count * 3) / 12), { gain: 0.5, delay: 0.1 });
        break;
      case "frenzy":
        if (e.on) {
          // Two war-horn blasts and a rumble as the walls close in.
          this.horn(147, 0.45, { gain: 0.16 });
          this.horn(147, 0.9, { gain: 0.16, delay: 0.5 });
          this.horn(220, 0.9, { gain: 0.08, delay: 0.5 });
          this.drum(1);
          this.tone(50, 1.2, { type: "sawtooth", gain: 0.25, slideTo: 35, lowpass: 400 });
        } else {
          this.tone(300, 0.4, { type: "triangle", gain: 0.12, slideTo: 150 });
        }
        break;
      case "callout":
        this.horn(98, 0.6, { gain: 0.15 });
        this.horn(147, 0.6, { gain: 0.1 });
        this.drum(1);
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
      case "countdown":
        this.drum(e.n === 1 ? 0.9 : 0.6);
        this.tone(e.n === 1 ? 392 : 294, 0.18, { type: "triangle", gain: 0.1, lowpass: 1500 });
        break;
      case "ko": {
        // Upset: the underdog won — a triumphant horn sting after the K.O.
        const loser = world.fighters[e.fighter];
        const winner = world.fighters.find((f) => f.alive && f.side !== loser?.side);
        const chance = winner && loser ? winChance(winner.def.id, loser.def.id) : null;
        if (chance !== null && chance < UPSET_CHANCE) {
          this.horn(262, 0.25, { gain: 0.12, delay: 0.55 });
          this.horn(330, 0.25, { gain: 0.12, delay: 0.75 });
          this.horn(392, 0.9, { gain: 0.14, delay: 0.95 });
        }
        this.tone(120, 0.9, { type: "sawtooth", gain: 0.45, slideTo: 30 });
        this.noise(0.8, { filter: "lowpass", freq: 1800, slideTo: 120, gain: 0.7 });
        this.tone(55, 1.2, { type: "sine", gain: 0.6, slideTo: 28 });
        break;
      }
      case "fight":
        this.drum(1);
        this.horn(196, 0.16, { gain: 0.12 });
        this.horn(196, 0.16, { gain: 0.12, delay: 0.16 });
        this.horn(294, 0.7, { gain: 0.14, delay: 0.32 });
        this.horn(392, 0.7, { gain: 0.06, delay: 0.32 });
        break;
      case "reflect":
        // Bronze shield ringing as the shot is turned back.
        this.bell(900, 0.6, 0.22);
        this.noise(0.08, { filter: "highpass", freq: 3500, gain: 0.35 });
        this.thud(0.6);
        break;
      case "domainCast":
        // A deep gong and a swelling brass chord.
        this.bell(98, 2.2, 0.35);
        this.drum(1);
        for (const f of [98, 147, 196]) this.horn(f, 1.4, { gain: 0.08, delay: 0.05 });
        this.noise(1.2, { filter: "bandpass", freq: 200, slideTo: 2400, q: 0.8, gain: 0.25 });
        break;
      case "domainOpen":
        this.tone(55, 1.2, { type: "sine", gain: 0.6, slideTo: 30 });
        break;
      case "cracks":
        for (let i = 0; i < 4; i++) {
          this.noise(0.08, { filter: "highpass", freq: 2500, gain: 0.4, delay: i * 0.09 });
        }
        this.thud(0.8);
        break;
      case "domainClash":
        for (let i = 0; i < 8; i++) this.drum(0.5 + (i % 2) * 0.3, { delay: i * 0.11 });
        this.horn(147, 0.6, { gain: 0.12 });
        this.horn(156, 0.6, { gain: 0.1 });
        break;
      case "wallsShatter":
        this.noise(1.6, { filter: "lowpass", freq: 2200, slideTo: 80, gain: 0.9 });
        this.tone(45, 1.4, { type: "sine", gain: 0.9, slideTo: 22 });
        for (let i = 0; i < 5; i++) this.thud(1, i * 0.12);
        break;
      case "domainWon":
        for (const f of [131, 196, 262, 330]) this.horn(f, 1.6, { gain: 0.08, delay: 0.15 });
        this.drum(1.2, { delay: 0.1 });
        break;
      case "domainHit":
        this.thud(1);
        this.bell(660, 0.8, 0.15);
        break;
      case "heal":
        if (!this.allow("heal", 0.35)) return;
        this.bell(1320, 0.4, 0.05);
        break;
      case "slash":
        // Katana: a bright "shing" and a cut through the air.
        this.noise(0.18, { filter: "bandpass", freq: 6000, slideTo: 2500, q: 1.5, gain: 0.5 });
        this.bell(2400, 0.35, 0.12);
        break;
      case "rampart":
        this.noise(1.1, { filter: "lowpass", freq: 400, slideTo: 90, gain: 0.8 });
        this.drum(1);
        this.drum(0.8, { delay: 0.2 });
        break;
      case "zone":
        if (e.style === "stakes") {
          if (!this.allow("stakes", 0.1)) return;
          this.tone(230, 0.12, { type: "triangle", gain: 0.25, slideTo: 120 });
          this.noise(0.05, { filter: "bandpass", freq: 1200, gain: 0.3 });
        } else if (e.style === "banner") {
          this.horn(262, 0.5, { gain: 0.1 });
          this.horn(392, 0.7, { gain: 0.08, delay: 0.15 });
          this.bell(1046, 0.6, 0.06, { delay: 0.15 });
        } else if (e.style === "fire") {
          this.noise(1.2, { filter: "lowpass", freq: 900, slideTo: 300, gain: 0.35 });
          this.noise(0.6, { filter: "highpass", freq: 3000, gain: 0.12, delay: 0.1 });
        } else {
          this.noise(0.5, { filter: "highpass", freq: 5000, gain: 0.18 });
        }
        break;
      default:
        break;
    }
  }

  /** Metal-on-body impact. */
  private clang(power: number): void {
    const f = 520 * rand(0.9, 1.15);
    this.tone(f, 0.16, { type: "triangle", gain: 0.3 * power, slideTo: f * 0.55 });
    this.tone(f * 2.76, 0.1, { type: "sine", gain: 0.08 * power });
    this.noise(0.07, { filter: "bandpass", freq: 3200, q: 0.9, gain: 0.55 * power });
  }

  /** Heavy blunt impact: a body thump with a little leather slap on top. */
  private thud(power: number, delay = 0): void {
    this.tone(150 * rand(0.9, 1.1), 0.22, { type: "sine", gain: 0.7 * power, slideTo: 45, delay });
    this.noise(0.12, { filter: "lowpass", freq: 900, gain: 0.55 * power, delay });
    this.noise(0.03, { filter: "bandpass", freq: 1800, q: 1.2, gain: 0.25 * power, delay });
  }

  /** Struck metal: inharmonic partials that ring out. */
  bell(freq: number, dur: number, gain: number, o: NoteOptions = {}): void {
    const at = o.at ?? this.now() + (o.delay ?? 0);
    const music = o.music ?? false;
    [1, 2.76, 5.4].forEach((k, i) => {
      this.tone(freq * k, dur / (1 + i * 0.6), {
        type: "sine",
        gain: gain / (1 + i * 1.5),
        at,
        music,
      });
    });
  }

  /**
   * War horn / brass: two slightly detuned saws through a low-pass that opens as the
   * note swells, like breath going into a horn.
   */
  horn(freq: number, dur: number, o: NoteOptions = {}): void {
    const t0 = o.at ?? this.now() + (o.delay ?? 0);
    const peak = o.gain ?? 0.12;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.06);
    g.gain.setValueAtTime(peak, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.12);
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 1.4;
    lp.frequency.setValueAtTime(freq * 1.5, t0);
    lp.frequency.exponentialRampToValueAtTime(Math.min(freq * 7, 4200), t0 + 0.09);
    lp.frequency.exponentialRampToValueAtTime(freq * 3, t0 + dur + 0.1);
    lp.connect(g).connect(o.music ? this.musicBus : this.bus);
    for (const cents of [-7, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq * 0.97, t0);
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.05);
      osc.detune.value = cents;
      osc.connect(lp);
      osc.start(t0);
      osc.stop(t0 + dur + 0.2);
    }
  }

  /** Big frame drum / taiko: a deep pitched thump plus the skin's slap. */
  drum(power: number, o: NoteOptions = {}): void {
    const at = o.at ?? this.now() + (o.delay ?? 0);
    const music = o.music ?? false;
    const gain = o.gain ?? 1;
    this.tone(78, 0.55, { type: "sine", gain: 0.85 * power * gain, slideTo: 36, at, music });
    this.tone(118, 0.18, { type: "sine", gain: 0.3 * power * gain, slideTo: 60, at, music });
    this.noise(0.09, { filter: "lowpass", freq: 700, gain: 0.4 * power * gain, at, music });
    this.noise(0.025, {
      filter: "bandpass",
      freq: 2200,
      q: 1,
      gain: 0.15 * power * gain,
      at,
      music,
    });
  }

  /** Plucked string (lute / oud), synthesized with the Karplus-Strong method. */
  pluck(freq: number, o: NoteOptions = {}): void {
    const t0 = o.at ?? this.now() + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = this.pluckBuffer(freq);
    const g = this.ctx.createGain();
    g.gain.value = o.gain ?? 0.4;
    src.connect(g).connect(o.music ? this.musicBus : this.bus);
    src.start(Math.max(0, t0));
  }

  private pluckBuffer(freq: number): AudioBuffer {
    const key = Math.round(freq);
    const hit = this.plucks.get(key);
    if (hit) return hit;
    const sr = this.ctx.sampleRate;
    const length = Math.round(sr * 1.3);
    const buffer = this.ctx.createBuffer(1, length, sr);
    const out = buffer.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const line = new Float32Array(period);
    // Slightly darkened noise burst = the pick hitting the string.
    let prev = 0;
    for (let i = 0; i < period; i++) {
      prev = prev * 0.5 + (Math.random() * 2 - 1) * 0.5;
      line[i] = prev;
    }
    const decay = 0.996;
    let idx = 0;
    let last = 0;
    for (let i = 0; i < length; i++) {
      const cur = line[idx] ?? 0;
      const next = (cur + last) * 0.5 * decay;
      last = cur;
      line[idx] = next;
      out[i] = cur;
      idx = (idx + 1) % period;
    }
    // Soft fade at the end so the buffer never clicks off.
    const fade = Math.round(sr * 0.1);
    for (let i = 0; i < fade; i++) {
      const k = length - fade + i;
      out[k] = (out[k] ?? 0) * (1 - i / fade);
    }
    this.plucks.set(key, buffer);
    return buffer;
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
    if (o.detune) osc.detune.value = o.detune;
    const g = this.ctx.createGain();
    const peak = o.gain ?? 0.2;
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    if (o.hold) g.gain.setValueAtTime(peak, t0 + Math.max(attack, dur * o.hold));
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

/** Decaying stereo noise: the echo of a medium stone hall. */
function hallImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const length = Math.round(sr * seconds);
  const buffer = ctx.createBuffer(2, length, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Darker as it fades, like air soaking up the highs.
      const k = 0.35 + 0.6 * t;
      lp = lp * k + (Math.random() * 2 - 1) * (1 - k);
      data[i] = lp * (1 - t) ** 2.6 * 2.2;
    }
  }
  return buffer;
}

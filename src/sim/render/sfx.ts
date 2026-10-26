import type { SimEvent } from "../types";
import { winChance } from "../odds";
import type { World } from "../world";
import { clipLoader, clipUrls, type Clips } from "./samples";

/** Recorded effects (`src/assets/sfx/<name>.mp3`), used where they fit; synthesis covers the rest. */
const loadClips = clipLoader(
  clipUrls(
    import.meta.glob("../../assets/sfx/*.mp3", {
      eager: true,
      query: "?url",
      import: "default",
    }) as Record<string, string>,
  ),
);

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

/** Level of effects and music while the narrator speaks. */
const VOICE_DUCK = 0.2;
/**
 * Epic finish: the loser lost at least EPIC_SHARE of their max HP in the last EPIC_WINDOW
 * seconds — wiped out in one burst. Only then does the finishing track play.
 */
const EPIC_WINDOW = 2;
const EPIC_SHARE = 0.25;

export interface HitRecord {
  t: number;
  target: number;
  damage: number;
}

/** Whether a K.O. at `koAt` was an epic finish, from the hits so far. */
export function isEpicFinish(
  hits: readonly HitRecord[],
  loser: number,
  maxHp: number,
  koAt: number,
): boolean {
  let burst = 0;
  for (const h of hits) if (h.target === loser && koAt - h.t <= EPIC_WINDOW) burst += h.damage;
  return burst >= maxHp * EPIC_SHARE;
}

/** The finishing track: the beat drops EPIC_DROP seconds into the clip, right on the K.O. */
const EPIC_DROP = 4.03;
/** Seconds of the track after the drop (the clip fades out by itself). */
const EPIC_TAIL = 5.35;
/** Normal levels of the background music and effects buses. */
const MUSIC_LEVEL = 0.32;
const EFFECTS_LEVEL = 0.55;

/**
 * Sound effects: mostly synthesized with the Web Audio API, plus a few recorded
 * clips. Purely cosmetic: it listens to simulation events and never feeds anything back.
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
  /** Effects and music dip under the narrator through this. */
  private readonly duck: GainNode;
  /** The epic track: its own path, not squeezed by the effects compressor (still under the narrator). */
  private readonly epicBus: GainNode;
  private readonly voice: GainNode;
  private readonly speaking = new Set<AudioBufferSourceNode>();
  private readonly noiseBuffer: AudioBuffer;
  private readonly lastPlayed = new Map<string, number>();
  /** Plucked-string notes, rendered once per pitch. */
  private readonly plucks = new Map<number, AudioBuffer>();
  private clips: Clips | null = null;
  private readonly clipsLoaded: Promise<void>;
  /** The epic track plays at most once per match. */
  private epicWorld: World | null = null;
  private epicPlayed = false;
  /** Recent hits this match, to spot an epic finish (live preview). */
  private hits: HitRecord[] = [];

  constructor(ctx: BaseAudioContext, opts: { tap?: boolean } = {}) {
    this.ctx = ctx;
    this.tap = opts.tap && ctx instanceof AudioContext ? ctx.createMediaStreamDestination() : null;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;

    this.bus = ctx.createGain();
    this.bus.gain.value = EFFECTS_LEVEL;
    this.bus.connect(compressor);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC_LEVEL;
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
    this.duck = ctx.createGain();
    // Everything ends in a brick-wall limiter so the loudest moments never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    compressor.connect(this.duck).connect(limiter);
    this.epicBus = ctx.createGain();
    this.epicBus.connect(this.duck);
    // The narrator gets its own gentle compression so every word sits above the fight.
    const voiceComp = ctx.createDynamicsCompressor();
    voiceComp.threshold.value = -22;
    voiceComp.ratio.value = 3;
    voiceComp.attack.value = 0.005;
    voiceComp.release.value = 0.15;
    this.voice = ctx.createGain();
    this.voice.gain.value = 1.3;
    this.voice.connect(voiceComp).connect(limiter);
    limiter.connect(this.monitor).connect(ctx.destination);
    if (this.tap) limiter.connect(this.tap);

    const length = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.clipsLoaded = loadClips(ctx).then((c) => {
      this.clips = c;
    });
  }

  /** Resolves once the recorded effects are decoded (await before an offline render). */
  clipsReady(): Promise<void> {
    return this.clipsLoaded;
  }

  setMuted(muted: boolean): void {
    this.monitor.gain.value = muted ? 0 : 1;
  }

  /** Plays a narrator clip at `at` (seconds, context time); everything else dips meanwhile. */
  speak(clip: AudioBuffer, at: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = clip;
    src.connect(this.voice);
    src.start(at);
    this.speaking.add(src);
    src.onended = () => this.speaking.delete(src);
    const g = this.duck.gain;
    g.setTargetAtTime(VOICE_DUCK, Math.max(0, at - 0.05), 0.04);
    g.setTargetAtTime(1, at + clip.duration, 0.25);
  }

  /** Live preview: cuts the narrator off when a new match starts. */
  silenceVoice(): void {
    for (const src of this.speaking) src.stop();
    this.speaking.clear();
    this.duck.gain.cancelScheduledValues(this.ctx.currentTime);
    this.duck.gain.setValueAtTime(1, this.ctx.currentTime);
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
        this.track(world);
        this.hits = this.hits.filter((h) => this.now() - h.t <= EPIC_WINDOW);
        this.hits.push({ t: this.now(), target: e.target, damage: e.damage });
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
        if (attacker?.def.growth && e.weapon) {
          // A leader's cultural weapon: a real blade.
          if (!this.sample("sword-hit", { gain: 0.25 + 0.5 * power, rate: rand(0.92, 1.08) })) {
            this.clang(power);
          }
        } else if (attacker && (BLUNT.has(attacker.def.id) || attacker.def.growth)) {
          // Leaders hit with their bodies, units and projectiles: heavy impacts.
          this.thud(power);
        } else {
          this.clang(power);
        }
        if (rel >= 9 && this.allow("crack", 0.8)) {
          this.sample("bone-crack", { gain: 0.5, rate: rand(0.95, 1.05) });
        }
        break;
      }
      case "clash":
        if (!this.allow("clash", 0.08)) return;
        if (this.sample("clash", { gain: 0.45, rate: rand(0.95, 1.05) })) break;
        if (this.sample("sword-hit", { gain: 0.3, rate: 1.3, duration: 0.35 })) break;
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
        if (e.style === "arrow" && this.allow("bow", 0.1) && this.sample("bow", { gain: 0.35 })) {
          // recorded bow
        } else if (e.style === "bombard" && this.sample("cannon", { gain: 0.85 })) {
          // recorded cannon
        } else if (e.style === "ball" && this.sample("cannon", { gain: 0.5, rate: 1.15 })) {
          // a field gun: the same blast, lighter
        } else if (e.style === "arrow") {
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
        this.sample("horn", { gain: 0.5 });
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
        this.sample("gasp", { gain: 0.35, delay: 0.05 });
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
        if (this.allow("crack", 0.8)) this.sample("bone-crack", { gain: 0.65 });
        this.tone(70, 0.8, { type: "sine", gain: 0.9, slideTo: 25 });
        this.noise(0.15, { filter: "highpass", freq: 2500, gain: 0.6 });
        this.noise(0.6, { filter: "lowpass", freq: 1500, slideTo: 80, gain: 0.8 });
        break;
      case "countdown":
        this.drum(e.n === 1 ? 0.9 : 0.6);
        this.tone(e.n === 1 ? 392 : 294, 0.18, { type: "triangle", gain: 0.1, lowpass: 1500 });
        break;
      case "ko": {
        // Leaders, epic finish: the finishing track drops on this very frame.
        this.track(world);
        const fallen = world.fighters[e.fighter];
        const epic =
          this.epicPlayed ||
          (!!fallen && isEpicFinish(this.hits, e.fighter, fallen.maxHp, this.now()));
        if (epic && this.epic(world)) {
          this.tone(55, 1.2, { type: "sine", gain: 0.6, slideTo: 28 });
          break;
        }
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
  /**
   * Plays a recorded clip on the effects bus (or the music bus). Returns false when
   * the clip is missing or not decoded yet, so the caller can fall back to synthesis.
   */
  private sample(
    name: string,
    o: {
      gain?: number;
      rate?: number;
      delay?: number;
      duration?: number;
      /** Start this far into the clip. */
      offset?: number;
      /** Absolute start time (overrides `delay`). */
      at?: number;
      music?: boolean;
      out?: AudioNode;
    } = {},
  ): boolean {
    const clip = this.clips?.get(name);
    if (!clip) return false;
    const at = o.at ?? this.now() + (o.delay ?? 0);
    const src = this.ctx.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = o.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = o.gain ?? 1;
    src.connect(g).connect(o.out ?? (o.music ? this.musicBus : this.bus));
    if (o.duration) {
      g.gain.setValueAtTime(o.gain ?? 1, at + o.duration * 0.7);
      g.gain.linearRampToValueAtTime(0, at + o.duration);
      src.start(at, 0, o.duration);
    } else {
      src.start(at, o.offset ?? 0);
    }
    return true;
  }

  /**
   * Video export knows when the K.O. will come: the finishing track starts early so its
   * build-up plays while the loser goes down and the beat drops exactly on the K.O.
   */
  scheduleFinale(world: World, koAt: number): void {
    this.epic(world, koAt);
  }

  /**
   * Live preview, called every frame: `koAt` is when (in `world.elapsed` seconds) the
   * foreseen epic K.O. lands. Starts the track once its build-up is due, so the drop
   * still lands on the K.O. as in the video.
   */
  finaleDue(world: World, koAt: number): void {
    if (this.clock === null && this.ctx.state !== "running") return;
    this.track(world);
    if (this.epicPlayed || koAt - world.elapsed > EPIC_DROP) return;
    if (world.phase === "over") return;
    this.epic(world, this.now() + koAt - world.elapsed);
  }

  /**
   * Leaders' K.O.: the finishing track over everything (once per match), the background
   * music stepping aside. `koAt` given (video export): the drop lands on it, with the
   * build-up before. Otherwise the K.O. is now, so the track starts at the drop. True when
   * the track plays (or was already scheduled) for this match.
   */
  /** Per-match state resets when a new match (world) shows up. */
  private track(world: World): void {
    if (world === this.epicWorld) return;
    this.epicWorld = world;
    this.epicPlayed = false;
    this.hits = [];
  }

  private epic(world: World, koAt?: number): boolean {
    this.track(world);
    if (this.epicPlayed) return true;
    if (!world.fighters.some((f) => f.def.growth)) return false;
    const ko = koAt ?? this.now();
    const start = Math.max(0, ko - EPIC_DROP);
    const offset = start - (ko - EPIC_DROP);
    if (!this.sample("epic", { gain: 0.8, out: this.epicBus, at: start, offset })) return false;
    this.epicPlayed = true;
    const at = start;
    const back = ko + EPIC_TAIL - 0.8;
    this.musicBus.gain.setTargetAtTime(0.03, at, 0.08);
    this.musicBus.gain.setTargetAtTime(MUSIC_LEVEL, back, 0.4);
    // Effects keep their punch through the build-up and step back on the drop.
    this.bus.gain.setTargetAtTime(EFFECTS_LEVEL * 0.55, ko, 0.08);
    this.bus.gain.setTargetAtTime(EFFECTS_LEVEL, back, 0.4);
    return true;
  }

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

import type { Sfx } from "./sfx";
import type { World } from "../world";

/** Scales (semitones above the root) for each leader's musical colour. */
const MODES: Record<string, number[]> = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};
const DEFAULT_MODE = "dorian";
/** Root note A2. */
const ROOT = 110;
/** Scale degree the harmony sits on in each bar of the 4-bar loop. */
const BAR_DEGREES = [0, 5, 3, 4];
/** Melody, one note per eighth over two bars (scale degrees, relative to the bar). */
const MELODY = [0, 2, 4, 2, 3, 4, 5, 4, 7, 6, 4, 2, 3, 2, 1, 0];

/** The few things the music reacts to, read from the world once per frame. */
export interface MusicState {
  phase: World["phase"];
  /** 1..3, from the fight clock (same times as the leaders' level-ups). */
  level: number;
  frenzy: boolean;
  cinematic: boolean;
  /** Mode of whoever is ahead on HP (or the winner once it is over). */
  mode: string;
}

export function musicState(world: World): MusicState {
  const [a, b] = world.fighters;
  let lead = a;
  if (a && b && b.hp / b.maxHp > a.hp / a.maxHp) lead = b;
  if (world.winner >= 0) lead = world.fighters[world.winner] ?? lead;
  return {
    phase: world.phase,
    level: world.time >= 30 ? 3 : world.time >= 15 ? 2 : 1,
    frenzy: world.frenzy > 0,
    cinematic: world.cinematic !== null,
    mode: lead?.def.musicMode ?? DEFAULT_MODE,
  };
}

/**
 * Procedural battle music (no audio files, no copyright): war drums from the start,
 * strings and a melody from level 2, more drive at level 3, faster during a frenzy,
 * silence while an ultimate is announced, a fanfare for the winner. The melody uses
 * the musical mode of the leader who is ahead (hijaz for the Ottomans, pentatonic
 * for the Mongols…). Notes are scheduled slightly ahead on the audio clock, so the
 * same code drives the live preview (real clock) and the video export (frame clock).
 */
export class Music {
  private nextStep = -1;
  private step = 0;
  private fanfareDone = false;

  constructor(private readonly sfx: Sfx) {}

  reset(): void {
    this.nextStep = -1;
    this.step = 0;
    this.fanfareDone = false;
  }

  /** Schedules everything due between `now` and `now + ahead`. */
  update(s: MusicState, now: number, ahead = 0.25): void {
    if (s.phase === "over") {
      if (!this.fanfareDone) this.fanfare(now + 0.05, s.mode);
      this.fanfareDone = true;
      return;
    }
    if (s.phase !== "fight" || s.cinematic) {
      // Silence (intro, K.O. slow motion, ultimate announcement); restart on the beat after.
      this.nextStep = -1;
      return;
    }
    const bpm = (s.level >= 3 ? 128 : 116) * (s.frenzy ? 1.25 : 1);
    const eighth = 60 / bpm / 2;
    if (this.nextStep < now - 0.5 || this.nextStep < 0) this.nextStep = now + 0.03;
    while (this.nextStep < now + ahead) {
      this.playStep(this.step, this.nextStep, s, eighth);
      this.step++;
      this.nextStep += eighth;
    }
  }

  private playStep(step: number, at: number, s: MusicState, eighth: number): void {
    const sfx = this.sfx;
    const scale = MODES[s.mode] ?? MODES[DEFAULT_MODE] ?? [0];
    const inBar = step % 8;
    const bar = Math.floor(step / 8) % 4;
    const barRoot = BAR_DEGREES[bar] ?? 0;
    const freq = (degree: number, base: number) => {
      const n = scale.length;
      const octave = Math.floor(degree / n);
      const semis = (scale[((degree % n) + n) % n] ?? 0) + 12 * octave;
      return base * 2 ** (semis / 12);
    };

    // War drums (taiko-like): big hits on 1 and 3, a smaller drum answering.
    if (inBar === 0 || inBar === 4) {
      sfx.drum(inBar === 0 ? 1 : 0.7, { at, music: true });
    }
    if (inBar === 6 || (bar === 3 && inBar >= 5)) {
      sfx.tone(150, 0.2, { at, type: "sine", gain: 0.4, slideTo: 85, music: true });
      sfx.noise(0.03, { at, filter: "bandpass", freq: 1800, gain: 0.12, music: true });
    }
    if (s.level >= 3 || s.frenzy) {
      sfx.noise(0.04, { at, filter: "highpass", freq: 7000, gain: 0.12, music: true });
    }

    // Bass ostinato on the bar's root.
    if (inBar === 0 || inBar === 3 || inBar === 4 || inBar === 6) {
      sfx.tone(freq(barRoot, ROOT / 2), eighth * 1.6, {
        at,
        type: "triangle",
        gain: 0.34,
        lowpass: 500,
        music: true,
      });
    }

    if (s.level < 2) return;

    // Strings: a soft ensemble chord swelling through the bar (detuned pairs).
    if (inBar === 0) {
      for (const d of [0, 2, 4]) {
        for (const detune of [-9, 9]) {
          sfx.tone(freq(barRoot + d, ROOT), eighth * 8.4, {
            at,
            type: "sawtooth",
            gain: 0.035,
            attack: 0.4,
            hold: 0.75,
            detune,
            lowpass: 1100,
            music: true,
          });
        }
      }
    }
    // Melody on a plucked lute/oud, in the leading leader's mode.
    const m = MELODY[step % MELODY.length] ?? 0;
    if (s.level >= 3 || step % 2 === 0 || s.frenzy) {
      sfx.pluck(freq(barRoot + m, ROOT * 4), { at, gain: 0.32, music: true });
    }
  }

  /** Horn call and a held brass chord over a drum roll. */
  private fanfare(at: number, mode: string): void {
    const sfx = this.sfx;
    const scale = MODES[mode] ?? MODES[DEFAULT_MODE] ?? [0];
    const f = (i: number) =>
      ROOT * 2 * 2 ** ((scale[i % scale.length] ?? 0) / 12 + Math.floor(i / scale.length));
    [0, 2, 4].forEach((d, i) => {
      sfx.horn(f(d), 0.2, { at: at + i * 0.15, gain: 0.13, music: true });
    });
    for (const d of [0, 2, 4, 7]) {
      sfx.horn(f(d), 1.5, { at: at + 0.45, gain: 0.08, music: true });
    }
    for (let i = 0; i < 10; i++) {
      sfx.tone(85, 0.2, {
        at: at + i * 0.05,
        type: "sine",
        gain: 0.3 + i * 0.04,
        slideTo: 50,
        music: true,
      });
    }
    sfx.drum(1.2, { at: at + 0.45, music: true });
  }
}

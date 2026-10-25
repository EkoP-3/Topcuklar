import type { World } from "../world";
import type { Sfx } from "./sfx";
import { clipLoader, clipUrls, type Clips } from "./samples";

/**
 * Narrator clips (recorded once with ElevenLabs, see docs): `src/assets/voice/<leader id>.mp3`
 * introduces that leader; `versus`, `who-wins` and `who-next` are shared.
 * The narrator only introduces the two leaders and asks the viewer to pick a side —
 * it does not comment on the fight.
 */
const voiceUrls = import.meta.glob("../../assets/voice/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Gap between two narrator lines. */
const LINE_GAP = 0.05;
/** The intro starts this long after the clip does. */
const INTRO_AT = 0.1;
/** "Who should fight next?" starts this long after the match is over (on the end card). */
export const OUTRO_DELAY = 1.0;

/** Decodes every clip for this audio context (once). */
export const loadVoice = clipLoader(clipUrls(voiceUrls));

/** "A ... versus ... B ... who wins?", from `at`. */
export function speakIntro(sfx: Sfx, clips: Clips, a: string, b: string, at = INTRO_AT): void {
  let t = at;
  for (const id of [a, "versus", b, "who-wins"]) {
    const clip = clips.get(id);
    if (!clip) continue;
    sfx.speak(clip, t);
    t += clip.duration + LINE_GAP;
  }
}

export function speakOutro(sfx: Sfx, clips: Clips, at: number): void {
  const clip = clips.get("who-next");
  if (clip) sfx.speak(clip, at);
}

/** Live preview: speaks the intro when a leader match starts and the outro on its end card. */
export class Narrator {
  private world: World | null = null;
  private overAt: number | null = null;
  private outroDone = false;

  constructor(private readonly sfx: Sfx) {
    void loadVoice(sfx.ctx);
  }

  update(world: World): void {
    if (!world.fighters.some((f) => f.def.growth)) return;
    if (this.sfx.clock === null && this.sfx.ctx.state !== "running") return;
    const [a, b] = world.fighters;
    if (!a || !b) return;
    const clips = this.clips();
    if (!clips) return;
    const now = this.sfx.now();
    if (world !== this.world) {
      this.world = world;
      this.overAt = null;
      this.outroDone = false;
      this.sfx.silenceVoice();
      speakIntro(this.sfx, clips, a.def.id, b.def.id, now + INTRO_AT);
    }
    if (world.phase !== "over" || this.outroDone) return;
    this.overAt ??= now;
    if (now - this.overAt >= OUTRO_DELAY) {
      this.outroDone = true;
      speakOutro(this.sfx, clips, now);
    }
  }

  private cached: Clips | null = null;
  private clips(): Clips | null {
    if (!this.cached) void loadVoice(this.sfx.ctx).then((c) => (this.cached = c));
    return this.cached;
  }
}

/**
 * Recorded sounds (narrator lines, a few effects). Files are bundled as data URLs and
 * decoded here without `fetch`, which some embeds block for `data:` URLs.
 */
export type Clips = Map<string, AudioBuffer>;

/** `../../assets/x/<id>.mp3` → id. */
export function clipUrls(glob: Record<string, string>): Map<string, string> {
  const byId = new Map<string, string>();
  for (const [path, url] of Object.entries(glob)) {
    const id = path
      .split("/")
      .pop()
      ?.replace(/\.mp3$/, "");
    if (id) byId.set(id, url);
  }
  return byId;
}

async function bytes(url: string): Promise<ArrayBuffer> {
  const comma = url.indexOf(",");
  if (url.startsWith("data:") && url.slice(0, comma).endsWith(";base64")) {
    const bin = atob(url.slice(comma + 1));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  return (await fetch(url)).arrayBuffer();
}

/** Decodes every clip for this audio context once; a clip that fails is just left out. */
export function clipLoader(urls: Map<string, string>): (ctx: BaseAudioContext) => Promise<Clips> {
  const loaded = new WeakMap<BaseAudioContext, Promise<Clips>>();
  return (ctx) => {
    let p = loaded.get(ctx);
    if (!p) {
      p = (async () => {
        const clips: Clips = new Map();
        await Promise.all(
          [...urls].map(async ([id, url]) => {
            try {
              clips.set(id, await ctx.decodeAudioData(await bytes(url)));
            } catch {
              // missing or undecodable: not played
            }
          }),
        );
        return clips;
      })();
      loaded.set(ctx, p);
    }
    return p;
  };
}

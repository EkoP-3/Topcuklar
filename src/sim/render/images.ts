/**
 * Optional artwork. With no files the game uses its code-drawn shapes.
 * - `src/assets/weapons/<id>.png|webp` replaces the vector weapon with that id.
 * - `src/assets/leaders/<id>.png|webp|jpg` is shown on that leader's ball (cropped to a circle).
 */
const weaponUrls = import.meta.glob("../../assets/weapons/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const portraitUrls = import.meta.glob("../../assets/leaders/*.{png,webp,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const pending: Promise<unknown>[] = [];

function imageSet(urls: Record<string, string>): (id: string) => HTMLImageElement | null {
  const byId = new Map<string, string>();
  for (const [path, url] of Object.entries(urls)) {
    const id = path
      .split("/")
      .pop()
      ?.replace(/\.(png|webp|jpe?g)$/, "");
    if (id) byId.set(id, url);
  }
  const images = new Map<string, HTMLImageElement>();
  const load = (id: string, url: string): HTMLImageElement => {
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.src = url;
      images.set(id, img);
      pending.push(img.decode().catch(() => undefined));
    }
    return img;
  };
  // Start every download right away so recordings never draw a placeholder.
  if (typeof Image !== "undefined") for (const [id, url] of byId) load(id, url);
  return (id) => {
    const url = byId.get(id);
    if (!url) return null;
    const img = load(id, url);
    return img.complete && img.naturalWidth > 0 ? img : null;
  };
}

/** Resolves once all artwork has loaded (or failed); call before recording. */
export function artReady(): Promise<void> {
  return Promise.all(pending).then(() => undefined);
}

/** Whether there is artwork for this weapon id (loaded or not). */
export function hasWeaponImage(id: string): boolean {
  return Object.keys(weaponUrls).some(
    (p) =>
      p
        .split("/")
        .pop()
        ?.replace(/\.(png|webp)$/, "") === id,
  );
}

/** The loaded image for a weapon, or null while loading / when there is none. */
export const weaponImage = imageSet(weaponUrls);
/** The loaded portrait for a leader, or null while loading / when there is none. */
export const portraitImage = imageSet(portraitUrls);

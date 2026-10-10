/**
 * Optional weapon artwork. Any `src/assets/weapons/<id>.png|webp` replaces the
 * hand-drawn vector weapon with that id. With no files the game looks as before.
 */
const urls = import.meta.glob("../../assets/weapons/*.{png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byId = new Map<string, string>();
for (const [path, url] of Object.entries(urls)) {
  const id = path
    .split("/")
    .pop()
    ?.replace(/\.(png|webp)$/, "");
  if (id) byId.set(id, url);
}

const images = new Map<string, HTMLImageElement>();

/** The loaded image for a weapon, or null while loading / when there is none. */
export function weaponImage(id: string): HTMLImageElement | null {
  const url = byId.get(id);
  if (!url) return null;
  let img = images.get(id);
  if (!img) {
    img = new Image();
    img.src = url;
    images.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

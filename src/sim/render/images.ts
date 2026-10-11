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
  return (id) => {
    const url = byId.get(id);
    if (!url) return null;
    let img = images.get(id);
    if (!img) {
      img = new Image();
      img.src = url;
      images.set(id, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  };
}

/** The loaded image for a weapon, or null while loading / when there is none. */
export const weaponImage = imageSet(weaponUrls);
/** The loaded portrait for a leader, or null while loading / when there is none. */
export const portraitImage = imageSet(portraitUrls);

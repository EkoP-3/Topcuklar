/**
 * Team colours, like two armies on an old map. Side 0 is red, side 1 is royal blue.
 * `bright` is for big text over the dark ink curtain, `main` for text on parchment.
 */
export const SIDES = [
  { name: "RED", main: "#c23a2b", dark: "#5c1610", light: "#ffa898", bright: "#ef5a40" },
  { name: "BLUE", main: "#2f5fb0", dark: "#13295a", light: "#a6c4ff", bright: "#5f97ff" },
] as const;

/** Roman-inscription capitals for names, banners and numbers. */
export const DISPLAY_FONT = '"Cinzel", "Trajan Pro", Georgia, "Times New Roman", serif';
/** Numbers use the same family so the frame reads as one printed page. */
export const MONO_FONT = DISPLAY_FONT;
/** Book face for the small descriptive lines. */
export const BODY_FONT = '"EB Garamond", Garamond, Georgia, "Times New Roman", serif';

/** Ink: outlines and text shadows. */
export const OUTLINE = "#1e130b";
/** Parchment and ink tones. */
export const PAPER = "#ecdcb4";
export const PAPER_DARK = "#c9a66b";
export const INK = "#2b1b0f";
export const GOLD = "#f2c14e";
export const GOLD_INK = "#7a4f06";

let fontEpoch = 0;
/** Bumped when web fonts finish loading, so cached text measurements are redone. */
export function fontsVersion(): number {
  return fontEpoch;
}

/**
 * Canvas text only uses a web font once it has been requested, so ask for every face
 * the renderer draws with before the first frame (and before recording).
 */
export async function loadFonts(): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const faces = [
    `700 40px ${DISPLAY_FONT}`,
    `800 40px ${DISPLAY_FONT}`,
    `900 40px ${DISPLAY_FONT}`,
    `500 30px ${BODY_FONT}`,
    `600 30px ${BODY_FONT}`,
  ];
  try {
    await Promise.all(faces.map((f) => document.fonts.load(f)));
  } catch {
    // Offline: the serif fallbacks are fine.
  }
  fontEpoch++;
}

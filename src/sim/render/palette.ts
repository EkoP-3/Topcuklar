/** One team's colours. `bright` is for big text over the dark ink curtain, `main` for the ball and bars. */
export interface SideColors {
  main: string;
  dark: string;
  light: string;
  bright: string;
}

/** Weapon mode and unknown leaders: red against royal blue, like two armies on an old map. */
const DEFAULT_SIDES: readonly [SideColors, SideColors] = [
  { main: "#c23a2b", dark: "#5c1610", light: "#ffa898", bright: "#ef5a40" },
  { main: "#2f5fb0", dark: "#13295a", light: "#a6c4ff", bright: "#5f97ff" },
];

/**
 * Each leader's colour from their people's own symbols, and a second one for when
 * both leaders would look alike (e.g. Mehmed's green against Richard's red).
 */
const LEADER_COLORS: Record<string, readonly [string, string]> = {
  alexander: ["#d39a1e", "#6b3fa0"], // Vergina Sun gold / Macedonian royal purple
  caesar: ["#b0242b", "#6a2a7a"], // legion vexillum red / triumphal purple
  cleopatra: ["#1d9a95", "#d39a1e"], // Egyptian faience turquoise / pharaoh gold
  genghis: ["#2f80c8", "#b8312f"], // Eternal Blue Sky / Mongol red
  hannibal: ["#82306a", "#c8202a"], // Phoenician Tyrian purple / Carthage red
  harald: ["#4f6b88", "#ba1f33"], // Norse iron and sea / Norway red
  joan: ["#2c55b0", "#d39a1e"], // French royal azure / fleur-de-lis gold
  leonidas: ["#a3221c", "#a8722c"], // Spartan crimson cloak / bronze shield
  mehmed: ["#d0202a", "#2e7d4f"], // Ottoman red / Ottoman green
  napoleon: ["#22408c", "#2f6b3a"], // Grande Armée blue / imperial livery green
  nobunaga: ["#e0532a", "#c9962e"], // Japanese vermilion / Azuchi gold
  qin: ["#b5653a", "#4a4e5a"], // terracotta army / Qin black
  richard: ["#c22a30", "#d39a1e"], // Plantagenet gules / the three gold lions
  saladin: ["#e0ae26", "#2f7a45"], // Ayyubid yellow / green
  shaka: ["#9a5a26", "#3a7d3c"], // cowhide shield / Zulu beadwork green
  vlad: ["#7a1320", "#1f4b9a"], // Order of the Dragon blood red / Wallachian blue
};

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: readonly number[]): string =>
  "#" +
  c
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
const mix = (hex: string, to: number, k: number): string =>
  toHex(rgb(hex).map((v) => v + (to - v) * k));

function shades(main: string): SideColors {
  return {
    main,
    dark: mix(main, 0, 0.55),
    light: mix(main, 255, 0.6),
    bright: mix(main, 255, 0.28),
  };
}

/** Rough perceived distance between two colours (weighted RGB). */
function distance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const rm = (r1 + r2) / 2;
  return Math.sqrt(
    (2 + rm / 256) * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + (2 + (255 - rm) / 256) * (b1 - b2) ** 2,
  );
}

/** Two colours closer than this read as the same team at a glance. */
const TOO_CLOSE = 190;

/** The two teams' colours for a pairing: each leader's own, swapping to the second colour on a clash. */
export function matchColors(aId: string, bId: string): [SideColors, SideColors] {
  const a = LEADER_COLORS[aId];
  const b = LEADER_COLORS[bId];
  if (!a || !b) return [DEFAULT_SIDES[0], DEFAULT_SIDES[1]];
  const options: [string, string][] = [
    [a[0], b[0]],
    [a[0], b[1]],
    [a[1], b[0]],
    [a[1], b[1]],
  ];
  const pick =
    options.find(([x, y]) => distance(x, y) >= TOO_CLOSE) ??
    options.reduce((best, o) => (distance(o[0], o[1]) > distance(best[0], best[1]) ? o : best));
  return [shades(pick[0]), shades(pick[1])];
}

/** The current match's team colours, indexed by side. Set with `setMatchColors`. */
export const SIDES: [SideColors, SideColors] = [DEFAULT_SIDES[0], DEFAULT_SIDES[1]];

export function setMatchColors(aId: string, bId: string): void {
  [SIDES[0], SIDES[1]] = matchColors(aId, bId);
}

/** Roman-inscription capitals for names, banners and numbers. */
const CINZEL = '"Cinzel", "Trajan Pro", Georgia, "Times New Roman", serif';
/** Chunky rounded game lettering for the arcade look. */
const BALOO = '"Baloo 2", "Arial Black", Impact, sans-serif';

/**
 * The look of the whole frame:
 * - `map`: a printed sea chart on leather (the original look);
 * - `arcade`: dark arena, glowing balls and game lettering, like the big ball-battle channels;
 * - `night`: the sea chart at night — dark navy paper with gold lines, glowing balls.
 */
export type StyleId = "map" | "arcade" | "night";

export interface Theme {
  id: StyleId;
  font: string;
  /** Around the arena: radial gradient centre → edge, and a gilt rule (or none). */
  page: readonly [string, string];
  pageRule: string | null;
  /** Arena floor gradient, its grid, rhumb lines, compass, stains and edge darkening. */
  floor: readonly [string, string];
  grid: string;
  rhumb: string | null;
  compass: { ink: string; light: string; alpha: number } | null;
  stains: boolean;
  edge: string;
  /** Arena border: main line, outer hairline, corner diamonds; optional glow. */
  border: string;
  borderOuter: string;
  borderGlow: string | null;
  /** Whole-frame vignette colour and TV scanline strength (0 = none). */
  vignette: string;
  scanlines: number;
  /** Balls: glow blur, shaded body, outline width and HP label style. */
  ballGlow: number;
  ballShade: boolean;
  ballOutline: number;
  hpTag: "paper" | "pill";
  /** Trails and sparks add light on dark floors. */
  additive: boolean;
  /** HP and win bars, small tabs and the end-card curtain. */
  barBg: string;
  barFrame: string;
  tabBg: string;
  tabInk: string;
  curtain: string;
}

const THEMES: Record<StyleId, Theme> = {
  map: {
    id: "map",
    font: CINZEL,
    page: ["#4a2e1a", "#160d07"],
    pageRule: "rgba(176,138,74,0.55)",
    floor: ["#f0e1bb", "#ecdcb4"],
    grid: "rgba(90,60,25,0.16)",
    rhumb: "rgba(90,60,25,0.1)",
    compass: { ink: "#2b1b0f", light: "#c9a66b", alpha: 0.16 },
    stains: true,
    edge: "rgba(110,70,25,0.42)",
    border: "#2b1b0f",
    borderOuter: "#b08a4a",
    borderGlow: null,
    vignette: "rgba(20,10,4,0.5)",
    scanlines: 0,
    ballGlow: 0,
    ballShade: false,
    ballOutline: 4,
    hpTag: "paper",
    additive: false,
    barBg: "#0f0905",
    barFrame: "#b08a4a",
    tabBg: "#efe0bb",
    tabInk: "#2b1b0f",
    curtain: "rgba(29,18,10,0.86)",
  },
  arcade: {
    id: "arcade",
    font: BALOO,
    page: ["#15151c", "#030304"],
    pageRule: null,
    floor: ["#101015", "#08080b"],
    grid: "rgba(255,255,255,0.05)",
    rhumb: null,
    compass: { ink: "#ffffff", light: "#ffffff", alpha: 0.05 },
    stains: false,
    edge: "rgba(0,0,0,0.45)",
    border: "#ffffff",
    borderOuter: "rgba(255,255,255,0.25)",
    borderGlow: "rgba(255,255,255,0.7)",
    vignette: "rgba(0,0,0,0.55)",
    scanlines: 0.07,
    ballGlow: 34,
    ballShade: true,
    ballOutline: 5,
    hpTag: "pill",
    additive: true,
    barBg: "#030304",
    barFrame: "#ffffff",
    tabBg: "#101015",
    tabInk: "#ffffff",
    curtain: "rgba(3,3,4,0.88)",
  },
  night: {
    id: "night",
    font: CINZEL,
    page: ["#1d2742", "#070a14"],
    pageRule: "rgba(242,193,78,0.45)",
    floor: ["#1c2a4a", "#101a33"],
    grid: "rgba(242,193,78,0.10)",
    rhumb: "rgba(242,193,78,0.06)",
    compass: { ink: "#f2c14e", light: "#7d8fb8", alpha: 0.18 },
    stains: false,
    edge: "rgba(3,6,14,0.55)",
    border: "#f2c14e",
    borderOuter: "rgba(242,193,78,0.45)",
    borderGlow: "rgba(242,193,78,0.6)",
    vignette: "rgba(2,4,10,0.55)",
    scanlines: 0,
    ballGlow: 28,
    ballShade: true,
    ballOutline: 5,
    hpTag: "pill",
    additive: true,
    barBg: "#070a14",
    barFrame: "#f2c14e",
    tabBg: "#101a33",
    tabInk: "#f2c14e",
    curtain: "rgba(7,10,20,0.88)",
  },
};

const isStyle = (s: string | null): s is StyleId => s === "map" || s === "arcade" || s === "night";

/** The look in use. The page's `?style=` picks it; `map` otherwise. */
export let THEME: Theme = THEMES.map;
/** Display and number fonts follow the look (live bindings: importers see the switch). */
export let DISPLAY_FONT = CINZEL;
export let MONO_FONT = CINZEL;

export function setStyle(id: StyleId): void {
  THEME = THEMES[id];
  DISPLAY_FONT = THEME.font;
  MONO_FONT = THEME.font;
}

if (typeof location !== "undefined") {
  const asked = new URLSearchParams(location.search).get("style");
  if (isStyle(asked)) setStyle(asked);
}
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
    `800 40px ${BALOO}`,
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

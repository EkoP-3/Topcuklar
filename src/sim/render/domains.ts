import { TAU } from "../geom";
import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

/**
 * Domain Expansion battlefields: one code-drawn scene per leader, the size of the
 * arena square (`s` pixels). Each is drawn once and cached; the renderer clips and
 * blends them while domains open, clash and take over.
 */
const cache = new Map<string, HTMLCanvasElement>();

export function domainLayer(id: string, size: number, quality: number): HTMLCanvasElement {
  const key = `${id}|${size}|${quality}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * quality);
  canvas.height = Math.round(size * quality);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(quality, quality);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    (SCENES[id] ?? plainScene)(ctx, size);
    vignette(ctx, size);
  }
  cache.set(key, canvas);
  return canvas;
}

const SCENES: Record<string, (ctx: Ctx, s: number) => void> = {
  alexander: gaugamela,
  genghis: steppe,
  caesar: alesia,
  hannibal: alps,
  napoleon: austerlitz,
  leonidas: thermopylae,
  mehmed: constantinople,
  cleopatra: nile,
  vlad: forest,
  richard: arsuf,
  saladin: hattin,
  qin: greatWall,
  joan: orleans,
  harald: fjords,
  nobunaga: azuchi,
  shaka: kraal,
};

// --- helpers -------------------------------------------------------------------

function noise(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function ground(ctx: Ctx, s: number, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, s * 0.3, s);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

/** Small specks/strokes scattered over the ground. */
function speckle(ctx: Ctx, s: number, n: number, color: string, size: number, seed: number): void {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = noise(i, seed) * s;
    const y = noise(i, seed + 1) * s;
    const r = size * (0.4 + noise(i, seed + 2));
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
}

function strokes(
  ctx: Ctx,
  s: number,
  n: number,
  color: string,
  len: number,
  seed: number,
  lean = 0.3,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const x = noise(i, seed) * s;
    const y = noise(i, seed + 1) * s;
    const l = len * (0.5 + noise(i, seed + 2));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (noise(i, seed + 3) - 0.5) * l * lean * 2, y - l);
    ctx.stroke();
  }
}

/** Jagged mountain range along one edge (0 top, 1 right, 2 bottom, 3 left). */
function mountains(
  ctx: Ctx,
  s: number,
  edge: number,
  depth: number,
  rock: string,
  snow: string | null,
  seed: number,
): void {
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate((edge * Math.PI) / 2);
  ctx.translate(-s / 2, -s / 2);
  const peaks = 7;
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  const pts: [number, number][] = [];
  for (let i = 0; i <= peaks * 2; i++) {
    const x = (i / (peaks * 2)) * (s + 20) - 10;
    const h =
      i % 2 === 1 ? depth * (0.6 + 0.4 * noise(i, seed)) : depth * 0.25 * noise(i, seed + 5);
    pts.push([x, h]);
    ctx.lineTo(x, h);
  }
  ctx.lineTo(s + 10, -10);
  ctx.closePath();
  ctx.fillStyle = rock;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (snow) {
    ctx.fillStyle = snow;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [x, h] = pts[i] ?? [0, 0];
      const [xl] = pts[i - 1] ?? [0, 0];
      const [xr] = pts[i + 1] ?? [0, 0];
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x - (x - xl) * 0.35, h * 0.62);
      ctx.lineTo(x + (xr - x) * 0.35, h * 0.62);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Water band (sea, river) along one edge or across, with wave marks. */
function water(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  deep: string,
  light: string,
): void {
  ctx.fillStyle = deep;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = light;
  ctx.lineWidth = 2.5;
  const rows = Math.max(2, Math.floor(h / 26));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < w / 60; c++) {
      const wx = x + c * 60 + (r % 2) * 30 + 10;
      const wy = y + 14 + r * 26;
      ctx.beginPath();
      ctx.arc(wx, wy, 9, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }
}

/** Stone wall with crenellations from (x1,y1) to (x2,y2), `t` thick. */
function stoneWall(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
  color: string,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.translate(x1, y1);
  ctx.rotate(Math.atan2(y2 - y1, x2 - x1));
  ctx.fillStyle = color;
  ctx.fillRect(0, -t / 2, len, t);
  for (let x = 4; x < len - 8; x += 22) ctx.fillRect(x, -t / 2 - 7, 11, 7);
  ctx.strokeStyle = "rgba(30,19,11,0.45)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x < len; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, -t / 2);
    ctx.lineTo(x, t / 2);
    ctx.stroke();
  }
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(0, -t / 2, len, t);
  ctx.restore();
}

function tower(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, TAU);
  ctx.strokeStyle = "rgba(30,19,11,0.4)";
  ctx.stroke();
}

function tree(ctx: Ctx, x: number, y: number, r: number, leaf: string, trunk = "#5a3b20"): void {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - r * 0.12, y, r * 0.24, r * 0.7);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.7, 0, TAU);
  ctx.arc(x - r * 0.5, y + r * 0.15, r * 0.5, 0, TAU);
  ctx.arc(x + r * 0.5, y + r * 0.15, r * 0.5, 0, TAU);
  ctx.fillStyle = leaf;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function tent(ctx: Ctx, x: number, y: number, w: number, cloth: string, mark: string | null): void {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y + w * 0.4);
  ctx.lineTo(x, y - w * 0.45);
  ctx.lineTo(x + w / 2, y + w * 0.4);
  ctx.closePath();
  ctx.fillStyle = cloth;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  if (mark) {
    ctx.fillStyle = mark;
    ctx.fillRect(x - w * 0.04, y - w * 0.15, w * 0.08, w * 0.35);
    ctx.fillRect(x - w * 0.13, y - w * 0.04, w * 0.26, w * 0.08);
  }
}

function dome(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, TAU);
  ctx.lineTo(x + r, y + r * 0.1);
  ctx.lineTo(x - r, y + r * 0.1);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.strokeStyle = "rgba(30,19,11,0.35)";
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 3; k++) {
    ctx.beginPath();
    ctx.arc(x, y, r * (1 - k * 0.3), Math.PI, TAU);
    ctx.stroke();
  }
}

/** A row of sharpened stakes along a line. */
function stakesRow(
  ctx: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  h: number,
  gap: number,
): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  for (let d = 0; d <= len; d += gap) {
    const x = x1 + ux * d;
    const y = y1 + uy * d;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x - 4, y - h * 0.8);
    ctx.lineTo(x, y - h);
    ctx.lineTo(x + 4, y - h * 0.8);
    ctx.lineTo(x + 4, y);
    ctx.closePath();
    ctx.fillStyle = "#8a5a30";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

function vignette(ctx: Ctx, s: number): void {
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.35, s / 2, s / 2, s * 0.75);
  g.addColorStop(0, "rgba(20,10,4,0)");
  g.addColorStop(1, "rgba(20,10,4,0.4)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
}

// --- scenes ------------------------------------------------------------------------

function plainScene(ctx: Ctx, s: number): void {
  ground(ctx, s, "#c9b07a", "#a88a55");
}

/** Gaugamela, 331 BC: a wide dusty plain levelled for chariots. */
function gaugamela(ctx: Ctx, s: number): void {
  ground(ctx, s, "#d8bf86", "#b8975e");
  mountains(ctx, s, 0, 70, "#9a7a52", null, 3);
  ctx.strokeStyle = "rgba(110,80,40,0.35)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    const y = s * (0.3 + i * 0.1);
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(s * 0.3, y - 40, s * 0.6, y + 40, s, y - 10);
    ctx.stroke();
  }
  speckle(ctx, s, 260, "rgba(120,90,50,0.25)", 3, 11);
  speckle(ctx, s, 40, "rgba(255,240,210,0.25)", 14, 12);
}

/** The Mongolian steppe: endless grass, far mountains and a few gers. */
function steppe(ctx: Ctx, s: number): void {
  ground(ctx, s, "#b9c46a", "#8fa04a");
  mountains(ctx, s, 0, 80, "#7d8aa0", "#e8eef5", 7);
  strokes(ctx, s, 900, "rgba(70,90,30,0.45)", 16, 21);
  strokes(ctx, s, 300, "rgba(230,220,140,0.5)", 12, 22);
  for (const [x, y] of [
    [0.12, 0.85],
    [0.2, 0.9],
    [0.86, 0.82],
  ] as const) {
    dome(ctx, x * s, y * s, 30, "#f1ead8");
  }
}

/** Alesia, 52 BC: Caesar's double ring of siege works. */
function alesia(ctx: Ctx, s: number): void {
  ground(ctx, s, "#9fb06a", "#7c8f4c");
  strokes(ctx, s, 500, "rgba(60,80,30,0.35)", 12, 31);
  for (const inset of [40, 92]) {
    stakesRow(ctx, inset, inset + 16, s - inset, inset + 16, 24, 16);
    stakesRow(ctx, inset, s - inset, s - inset, s - inset, 24, 16);
    stakesRow(ctx, inset, inset + 16, inset, s - inset, 24, 16);
    stakesRow(ctx, s - inset, inset + 16, s - inset, s - inset, 24, 16);
  }
  for (const [x, y] of [
    [40, 40],
    [s - 40, 40],
    [40, s - 40],
    [s - 40, s - 40],
  ] as const) {
    tower(ctx, x, y, 22, "#8a6a42");
  }
}

/** The Alps, 218 BC: snow, ice and peaks all around. */
function alps(ctx: Ctx, s: number): void {
  ground(ctx, s, "#f4f7fb", "#cdd9e8");
  for (let e = 0; e < 4; e++) mountains(ctx, s, e, 90, "#8792a6", "#ffffff", 40 + e);
  speckle(ctx, s, 300, "rgba(255,255,255,0.9)", 2.5, 41);
  speckle(ctx, s, 60, "rgba(160,180,210,0.35)", 12, 42);
}

/** Austerlitz, 1805: a snowy field, frozen ponds and gun smoke. */
function austerlitz(ctx: Ctx, s: number): void {
  ground(ctx, s, "#e8ece8", "#c4ccc6");
  for (const [x, y, w, h] of [
    [0.25, 0.7, 180, 90],
    [0.72, 0.3, 150, 80],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x * s, y * s, w, h, 0.2, 0, TAU);
    ctx.fillStyle = "#b9d3e6";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(x * s, y * s);
      const a = (k / 5) * TAU + 0.3;
      ctx.lineTo(x * s + Math.cos(a) * w * 0.8, y * s + Math.sin(a) * h * 0.8);
      ctx.stroke();
    }
  }
  speckle(ctx, s, 30, "rgba(150,150,150,0.3)", 26, 51);
  mountains(ctx, s, 0, 55, "#9aa39c", "#f4f6f4", 52);
}

/** Thermopylae, 480 BC: cliffs on one side, the sea on the other, a narrow pass. */
function thermopylae(ctx: Ctx, s: number): void {
  ground(ctx, s, "#d6bc8a", "#b8996a");
  water(ctx, s * 0.78, 0, s * 0.22, s, "#2f5f8f", "rgba(220,235,255,0.6)");
  ctx.beginPath();
  ctx.moveTo(0, 0);
  for (let i = 0; i <= 12; i++) ctx.lineTo(s * (0.16 + 0.06 * noise(i, 61)), (i / 12) * s);
  ctx.lineTo(0, s);
  ctx.closePath();
  ctx.fillStyle = "#7b6448";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  speckle(ctx, s, 120, "rgba(90,70,40,0.3)", 4, 62);
}

/** Constantinople, 1453: the great land walls and their towers. */
function constantinople(ctx: Ctx, s: number): void {
  ground(ctx, s, "#b5a58a", "#8f7f66");
  speckle(ctx, s, 200, "rgba(70,55,40,0.3)", 5, 71);
  const m = 34;
  stoneWall(ctx, m, m, s - m, m, 28, "#c9bba0");
  stoneWall(ctx, m, s - m, s - m, s - m, 28, "#c9bba0");
  stoneWall(ctx, m, m, m, s - m, 28, "#c9bba0");
  stoneWall(ctx, s - m, m, s - m, s - m, 28, "#c9bba0");
  for (let i = 0; i <= 4; i++) {
    const p = m + ((s - 2 * m) * i) / 4;
    for (const [x, y] of [
      [p, m],
      [p, s - m],
      [m, p],
      [s - m, p],
    ] as const) {
      tower(ctx, x, y, 24, "#b8a888");
    }
  }
  speckle(ctx, s, 14, "rgba(255,140,40,0.35)", 22, 72);
}

/** The Nile: a river through the sand, reeds and pyramids. */
function nile(ctx: Ctx, s: number): void {
  ground(ctx, s, "#e4cc93", "#c9a96a");
  ctx.save();
  ctx.translate(s / 2, s / 2);
  ctx.rotate(-0.5);
  water(ctx, -s, -60, s * 2, 120, "#3c7fa8", "rgba(220,240,255,0.6)");
  ctx.fillStyle = "#4f8a3a";
  for (let i = -12; i < 12; i++) {
    for (const side of [-70, 62]) {
      ctx.fillRect(i * 50 + 10, side, 5, 14);
      ctx.fillRect(i * 50 + 22, side + 2, 5, 12);
    }
  }
  ctx.restore();
  for (const [x, y, w] of [
    [0.82, 0.86, 110],
    [0.92, 0.9, 70],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x * s - w / 2, y * s);
    ctx.lineTo(x * s, y * s - w * 0.7);
    ctx.lineTo(x * s + w / 2, y * s);
    ctx.closePath();
    ctx.fillStyle = "#d9b56a";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

/** The forest of the impaled: dark wood and rows of stakes. */
function forest(ctx: Ctx, s: number): void {
  ground(ctx, s, "#5d4a36", "#3e2f22");
  speckle(ctx, s, 200, "rgba(20,15,10,0.35)", 6, 81);
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    tree(ctx, t * s, 18, 34, "#2f4a2a");
    tree(ctx, t * s, s - 30, 34, "#2f4a2a");
  }
  stakesRow(ctx, 30, 90, s - 30, 90, 40, 26);
  stakesRow(ctx, 30, s - 70, s - 30, s - 70, 40, 26);
  stakesRow(ctx, 40, 120, 40, s - 90, 40, 30);
  stakesRow(ctx, s - 40, 120, s - 40, s - 90, 40, 30);
}

/** Arsuf, 1191: the coast road, the sea and the crusader camp. */
function arsuf(ctx: Ctx, s: number): void {
  ground(ctx, s, "#e2cf9c", "#c7ad74");
  water(ctx, 0, 0, s * 0.2, s, "#3a6f9a", "rgba(220,240,255,0.6)");
  for (let i = 0; i < 5; i++) tent(ctx, s * 0.88, s * (0.12 + i * 0.19), 56, "#f3ead6", "#c8202a");
  speckle(ctx, s, 160, "rgba(140,110,60,0.25)", 4, 91);
}

/** The Horns of Hattin, 1187: dry hills, burning grass, no water. */
function hattin(ctx: Ctx, s: number): void {
  ground(ctx, s, "#d8b260", "#b88a3c");
  for (const [x, y] of [
    [0.3, 0.2],
    [0.7, 0.2],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x * s, y * s, 150, 90, 0, 0, TAU);
    ctx.fillStyle = "#a9802f";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  strokes(ctx, s, 600, "rgba(120,80,20,0.4)", 12, 101);
  speckle(ctx, s, 22, "rgba(255,120,30,0.35)", 18, 102);
  speckle(ctx, s, 40, "rgba(90,80,70,0.25)", 26, 103);
}

/** The Great Wall winding over green mountains. */
function greatWall(ctx: Ctx, s: number): void {
  ground(ctx, s, "#8fae6a", "#6a8a4a");
  mountains(ctx, s, 0, 90, "#5f7a4a", null, 111);
  mountains(ctx, s, 2, 90, "#5f7a4a", null, 112);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) pts.push([(i / 10) * s, s * (0.18 + 0.08 * Math.sin(i * 1.1))]);
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i] ?? [0, 0];
    const [x2, y2] = pts[i + 1] ?? [0, 0];
    stoneWall(ctx, x1, y1, x2, y2, 20, "#c2b49a");
  }
  for (let i = 0; i < pts.length; i += 3) {
    const [x, y] = pts[i] ?? [0, 0];
    tower(ctx, x, y, 18, "#b5a68c");
  }
  strokes(ctx, s, 400, "rgba(40,70,30,0.35)", 12, 113);
}

/** Orléans, 1429: the city walls on the Loire, French banners flying. */
function orleans(ctx: Ctx, s: number): void {
  ground(ctx, s, "#a8b97a", "#869a5a");
  water(ctx, 0, s * 0.82, s, s * 0.18, "#4a7fa8", "rgba(220,240,255,0.6)");
  stoneWall(ctx, 20, 40, s - 20, 40, 30, "#cfc4ad");
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * ((s - 80) / 5);
    tower(ctx, x, 40, 26, "#c2b69c");
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, -16);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#5a3b20";
    ctx.stroke();
    ctx.fillStyle = "#2a4fa8";
    ctx.fillRect(x, -16, 24, 14);
  }
  strokes(ctx, s, 300, "rgba(60,80,30,0.3)", 12, 121);
}

/** The fjords: icy rock, cold sea and longships. */
function fjords(ctx: Ctx, s: number): void {
  ground(ctx, s, "#9aa7b2", "#76838f");
  water(ctx, 0, 0, s, s * 0.14, "#25476a", "rgba(220,235,255,0.55)");
  water(ctx, 0, s * 0.86, s, s * 0.14, "#25476a", "rgba(220,235,255,0.55)");
  for (const x of [0.25, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x * s - 60, s * 0.07);
    ctx.quadraticCurveTo(x * s, s * 0.13, x * s + 60, s * 0.07);
    ctx.lineTo(x * s + 70, s * 0.04);
    ctx.lineTo(x * s - 70, s * 0.04);
    ctx.closePath();
    ctx.fillStyle = "#6b4a2a";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = "#c8202a";
    ctx.fillRect(x * s - 4, s * 0.0, 8, s * 0.05);
  }
  speckle(ctx, s, 120, "rgba(230,240,250,0.5)", 5, 131);
  speckle(ctx, s, 60, "rgba(50,60,70,0.3)", 14, 132);
}

/** Azuchi Castle under cherry blossoms. */
function azuchi(ctx: Ctx, s: number): void {
  ground(ctx, s, "#cdb99a", "#ab9474");
  // castle keep, top centre
  const cx = s / 2;
  for (let k = 0; k < 4; k++) {
    const w = 220 - k * 46;
    const y = 120 - k * 26;
    ctx.fillStyle = "#f3ead6";
    ctx.fillRect(cx - w / 2 + 12, y - 4, w - 24, 22);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeRect(cx - w / 2 + 12, y - 4, w - 24, 22);
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y);
    ctx.quadraticCurveTo(cx, y - 18, cx + w / 2, y);
    ctx.lineTo(cx + w / 2 - 20, y - 8);
    ctx.lineTo(cx - w / 2 + 20, y - 8);
    ctx.closePath();
    ctx.fillStyle = "#2a2230";
    ctx.fill();
    ctx.stroke();
  }
  for (const [x, y] of [
    [0.08, 0.3],
    [0.92, 0.35],
    [0.1, 0.85],
    [0.9, 0.88],
  ] as const) {
    tree(ctx, x * s, y * s, 50, "#f2b8cc");
  }
  speckle(ctx, s, 220, "rgba(242,170,195,0.8)", 3.5, 141);
}

/** KwaBulawayo: Shaka's royal kraal, a ring of beehive huts on red earth. */
function kraal(ctx: Ctx, s: number): void {
  ground(ctx, s, "#c98a52", "#a86a3a");
  speckle(ctx, s, 200, "rgba(90,50,20,0.3)", 4, 151);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    dome(ctx, s / 2 + Math.cos(a) * s * 0.43, s / 2 + Math.sin(a) * s * 0.43 + 20, 30, "#d8b26a");
  }
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.36, 0, TAU);
  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(90,60,30,0.6)";
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [x, y] of [
    [0.06, 0.06],
    [0.94, 0.94],
  ] as const) {
    tree(ctx, x * s, y * s, 44, "#5f7a3a");
  }
}

import { TAU } from "../geom";
import { LEVEL_TIMES } from "../leaders/kit";
import type { Fighter } from "../types";
import { OUTLINE, THEME } from "./palette";

type Ctx = CanvasRenderingContext2D;

/** One power tier's metal: highlight, body and shadow tones. */
export interface TierLook {
  name: string;
  light: string;
  main: string;
  dark: string;
}

/**
 * Leaders power up at each LEVEL_TIMES mark, like the ages of the ancient world:
 * bronze (the start, plain), then iron, then gold.
 */
export const TIERS: readonly [TierLook, TierLook, TierLook] = [
  { name: "BRONZE", light: "#f3c28c", main: "#c47a3a", dark: "#6a3812" },
  { name: "IRON", light: "#ffffff", main: "#b4c0d0", dark: "#4a5566" },
  { name: "GOLD", light: "#fff4b5", main: "#ffc93a", dark: "#9a6206" },
];

export function tierLook(tier: number): TierLook {
  return TIERS[Math.min(Math.max(tier, 1), TIERS.length) - 1] ?? TIERS[0];
}

/** A leader's power tier, 1..3 (0 for fighters that do not grow). */
export function tierOf(f: Fighter, time: number): number {
  if (!f.def.growth) return 0;
  return f.ability?.skillState?.().level ?? 1 + LEVEL_TIMES.filter((t) => time >= t).length;
}

/**
 * A metal ring around the ball in the tier's colour: none at bronze, polished iron,
 * then gold with a halo and a glint running round it.
 */
export function drawTierRim(ctx: Ctx, r: number, tier: number, time: number): void {
  if (tier < 2) return;
  const look = tierLook(tier);
  const w = Math.max(7, r * 0.17);
  const rr = r + w * 0.35;
  ctx.save();
  if (tier >= 3) {
    // A soft gold halo that breathes a little.
    ctx.beginPath();
    ctx.arc(0, 0, rr + w * 0.9, 0, TAU);
    ctx.lineWidth = w * 1.6;
    ctx.strokeStyle = `rgba(255,201,58,${(THEME.ballGlow > 0 ? 0.3 : 0.22) + 0.1 * Math.sin(time * 4)})`;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, rr, 0, TAU);
  ctx.lineWidth = w + 4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // Lit from the top left like the balls: bright, body, shadow, body, bright.
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, look.light);
  g.addColorStop(0.3, look.main);
  g.addColorStop(0.62, look.dark);
  g.addColorStop(0.85, look.main);
  g.addColorStop(1, look.light);
  ctx.lineWidth = w;
  ctx.strokeStyle = g;
  ctx.stroke();
  // A thin bevel line along the middle of the band.
  ctx.beginPath();
  ctx.arc(0, 0, rr - w * 0.15, Math.PI * 0.95, Math.PI * 1.55);
  ctx.lineWidth = Math.max(1.5, w * 0.22);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.stroke();
  if (tier >= 3) {
    // A glint sweeping round the gold.
    const a = time * 2.6;
    for (const [len, alpha, width] of [
      [0.9, 0.35, 0.9],
      [0.45, 0.95, 0.5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(0, 0, rr, a - len / 2, a + len / 2);
      ctx.lineWidth = w * width;
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function starPath(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.47;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

/**
 * Three star slots under the HP badge; one fills per tier in that tier's metal, so the
 * empty ones promise what is still to come. `pop` (0..1) bounces the newest star in.
 */
export function drawTierPips(ctx: Ctx, r: number, tier: number, pop: number): void {
  if (tier < 1) return;
  const look = tierLook(tier);
  const s = r * 0.22;
  const gap = s * 2.15;
  const y = r * 1.4;
  ctx.save();
  ctx.lineJoin = "round";
  for (let i = 0; i < TIERS.length; i++) {
    const x = (i - 1) * gap;
    // The middle slot sits lowest, following the curve of the ball.
    const sy = y + (i === 1 ? s * 0.35 : 0);
    const on = i < tier;
    const grow = on && i === tier - 1 ? 1 + 0.8 * pop : 1;
    starPath(ctx, x, sy, s * grow);
    if (on) {
      const g = ctx.createLinearGradient(x, sy - s, x, sy + s);
      g.addColorStop(0, look.light);
      g.addColorStop(0.55, look.main);
      g.addColorStop(1, look.dark);
      ctx.fillStyle = g;
    } else ctx.fillStyle = THEME.ballGlow > 0 ? "rgba(255,255,255,0.16)" : "rgba(43,27,15,0.22)";
    ctx.fill();
    ctx.lineWidth = on ? 3 : 2;
    ctx.strokeStyle = on ? OUTLINE : THEME.ballGlow > 0 ? "rgba(255,255,255,0.5)" : OUTLINE;
    ctx.globalAlpha = on ? 1 : 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Tinted copies of weapon art, made once per (image, tier). */
const tinted = new Map<HTMLImageElement, Map<number, TintedWeapon>>();

export interface TintedWeapon {
  canvas: HTMLCanvasElement;
  /** Blank margin (in image pixels) around the art, room for the glow. */
  pad: number;
}

/**
 * The weapon art re-cast in the tier's metal: recoloured towards it (keeping the art's
 * own shading), two diagonal sheen streaks, and for gold a soft glow baked in.
 */
export function tintedWeapon(img: HTMLImageElement, tier: number): TintedWeapon | null {
  if (tier < 2 || typeof document === "undefined") return null;
  let byTier = tinted.get(img);
  if (!byTier) {
    byTier = new Map();
    tinted.set(img, byTier);
  }
  const hit = byTier.get(tier);
  if (hit) return hit;

  const look = tierLook(tier);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const art = document.createElement("canvas");
  art.width = w;
  art.height = h;
  const a = art.getContext("2d");
  if (!a) return null;
  a.drawImage(img, 0, 0);
  // Recolour towards the metal, keeping the art's light and dark.
  a.globalCompositeOperation = "color";
  a.globalAlpha = tier >= 3 ? 0.8 : 0.75;
  a.fillStyle = look.main;
  a.fillRect(0, 0, w, h);
  // Brighten: polished metal.
  a.globalCompositeOperation = "soft-light";
  a.globalAlpha = tier >= 3 ? 0.65 : 0.55;
  a.fillStyle = look.light;
  a.fillRect(0, 0, w, h);
  // Sheen streaks across the blade.
  a.globalAlpha = 1;
  a.globalCompositeOperation = "source-over";
  const sheen = a.createLinearGradient(0, 0, w, h * 2.5);
  for (const [at, k] of [
    [0.3, 0],
    [0.36, 0.55],
    [0.42, 0],
    [0.55, 0],
    [0.58, 0.35],
    [0.61, 0],
  ] as const) {
    sheen.addColorStop(at, `rgba(255,255,255,${k})`);
  }
  a.fillStyle = sheen;
  a.fillRect(0, 0, w, h);
  // Keep only the art's own shape.
  a.globalCompositeOperation = "destination-in";
  a.drawImage(img, 0, 0);

  let out: TintedWeapon = { canvas: art, pad: 0 };
  if (tier >= 3) {
    const pad = Math.round(Math.max(w, h) * 0.07);
    const c = document.createElement("canvas");
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const g = c.getContext("2d");
    if (g) {
      g.shadowColor = "rgba(255,206,70,0.95)";
      g.shadowBlur = pad * 0.8;
      g.drawImage(art, pad, pad);
      g.shadowBlur = 0;
      g.drawImage(art, pad, pad);
      out = { canvas: c, pad };
    }
  }
  byTier.set(tier, out);
  return out;
}

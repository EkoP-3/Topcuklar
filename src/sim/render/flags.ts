import { TAU } from "../geom";
import { drawEmblem } from "./emblems";
import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

/** Flags are drawn 3:2. */
export const FLAG_RATIO = 1.5;

/**
 * Simplified, code-drawn flags and banners with (0, 0) at the top-left corner and
 * height `h`. Modern flags where they are well known; historical banners where a
 * modern one would be unclear or disputed (Macedonian sun, Roman SPQR).
 */
export function drawFlag(ctx: Ctx, id: string, h: number): void {
  const w = h * FLAG_RATIO;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  switch (id) {
    case "greece":
      greece(ctx, w, h);
      break;
    case "mongolia":
      mongolia(ctx, w, h);
      break;
    case "tunisia":
      crescentFlag(ctx, w, h, "#e70013", w / 2, h / 4, true);
      break;
    case "turkey":
      crescentFlag(ctx, w, h, "#e30a17", w * 0.36, h / 4, false);
      break;
    case "france":
      stripes(ctx, w, h, ["#0055a4", "#ffffff", "#ef4135"], true);
      break;
    case "egypt":
      stripes(ctx, w, h, ["#ce1126", "#ffffff", "#000000"], false);
      eagle(ctx, w / 2, h / 2, h * 0.17);
      break;
    case "vergina":
      ctx.fillStyle = "#a3201f";
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      drawEmblem(ctx, "alexander", h * 0.44);
      break;
    case "spqr":
      spqr(ctx, w, h);
      break;
    default:
      ctx.fillStyle = "#555b6a";
      ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  ctx.lineWidth = Math.max(2, h * 0.06);
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(0, 0, w, h);
}

function stripes(ctx: Ctx, w: number, h: number, colors: string[], vertical: boolean): void {
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    if (vertical) ctx.fillRect((w / colors.length) * i, 0, w / colors.length + 0.5, h);
    else ctx.fillRect(0, (h / colors.length) * i, w, h / colors.length + 0.5);
  });
}

function greece(ctx: Ctx, w: number, h: number): void {
  const s = h / 9;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#0d5eaf" : "#ffffff";
    ctx.fillRect(0, i * s, w, s + 0.5);
  }
  ctx.fillStyle = "#0d5eaf";
  ctx.fillRect(0, 0, s * 5, s * 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, s * 2, s * 5, s);
  ctx.fillRect(s * 2, 0, s, s * 5);
}

function mongolia(ctx: Ctx, w: number, h: number): void {
  stripes(ctx, w, h, ["#c4272f", "#015197", "#c4272f"], true);
  // Simplified Soyombo: flame, sun, crescent and bars.
  const x = w / 6;
  const u = h / 14;
  ctx.fillStyle = "#f9cf02";
  ctx.beginPath();
  ctx.moveTo(x, u * 1.5);
  ctx.lineTo(x + u * 1.1, u * 3.6);
  ctx.lineTo(x - u * 1.1, u * 3.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, u * 5, u * 1.1, 0, TAU);
  ctx.fill();
  ctx.fillRect(x - u * 1.8, u * 6.8, u * 3.6, u * 0.8);
  ctx.fillRect(x - u * 1.8, u * 11.6, u * 3.6, u * 0.8);
  ctx.fillRect(x - u * 1.8, u * 7.9, u * 0.8, u * 3.4);
  ctx.fillRect(x + u, u * 7.9, u * 0.8, u * 3.4);
  ctx.beginPath();
  ctx.arc(x, u * 9.6, u * 0.9, 0, TAU);
  ctx.fill();
}

/** Red field with a white crescent and star (Turkey; Tunisia adds a white disc). */
function crescentFlag(
  ctx: Ctx,
  w: number,
  h: number,
  red: string,
  cx: number,
  r: number,
  disc: boolean,
): void {
  ctx.fillStyle = red;
  ctx.fillRect(0, 0, w, h);
  const cy = h / 2;
  let fg = "#ffffff";
  if (disc) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, TAU);
    ctx.fill();
    fg = red;
  }
  const outer = disc ? r * 0.85 : r;
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.arc(cx, cy, outer, 0, TAU);
  ctx.fill();
  ctx.fillStyle = disc ? "#ffffff" : red;
  ctx.beginPath();
  ctx.arc(cx + outer * 0.25, cy, outer * 0.8, 0, TAU);
  ctx.fill();
  star(ctx, cx + outer * 0.95, cy, outer * 0.42, fg, Math.PI);
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string, rot: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU;
    const rr = i % 2 === 0 ? r : r * 0.4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/** Simplified golden eagle of Saladin (Egypt). */
function eagle(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.fillStyle = "#c09300";
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 1.1, y - r * 0.2);
  ctx.lineTo(x + r * 0.5, y + r);
  ctx.lineTo(x - r * 0.5, y + r);
  ctx.lineTo(x - r * 1.1, y - r * 0.2);
  ctx.closePath();
  ctx.fill();
}

/** Roman vexillum: crimson with a gold border and SPQR. */
function spqr(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = "#8b1a1a";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#ffd45e";
  ctx.lineWidth = h * 0.07;
  ctx.strokeRect(h * 0.1, h * 0.1, w - h * 0.2, h - h * 0.2);
  ctx.fillStyle = "#ffd45e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.42)}px Georgia, "Times New Roman", serif`;
  ctx.fillText("SPQR", w / 2, h / 2 + h * 0.03);
}

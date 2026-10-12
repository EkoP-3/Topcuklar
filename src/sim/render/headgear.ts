import { TAU } from "../geom";
import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

const GOLD = "#ffd45e";

/**
 * Each leader's headgear, drawn on top of their ball so a viewer sees "ruler" at a
 * glance. Origin is the ball centre, `r` the ball radius. Unknown ids draw nothing.
 */
export function drawHeadgear(ctx: Ctx, id: string, r: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const lw = Math.max(2, r * 0.07);
  switch (id) {
    case "mehmed":
      turban(ctx, r, lw);
      break;
    case "napoleon":
      bicorne(ctx, r, lw);
      break;
    case "caesar":
      laurel(ctx, r, lw);
      break;
    case "alexander":
      crown(ctx, r, lw);
      break;
    case "leonidas":
      spartan(ctx, r, lw);
      break;
    case "genghis":
      mongolHat(ctx, r, lw);
      break;
    case "hannibal":
      plumedHelmet(ctx, r, lw);
      break;
    case "cleopatra":
      nemes(ctx, r, lw);
      break;
  }
  ctx.restore();
}

function paint(ctx: Ctx, fill: string, lw: number): void {
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function turban(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.98, r * 0.66, r * 0.44, 0, 0, TAU);
  paint(ctx, "#f4f1ea", lw);
  // wraps
  ctx.strokeStyle = "rgba(8,10,17,0.35)";
  ctx.lineWidth = lw * 0.6;
  for (const k of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.ellipse(
      0,
      -r * (0.98 + k * 0.3),
      r * 0.62,
      r * 0.18,
      k * 0.5,
      Math.PI * 0.1,
      Math.PI * 0.9,
    );
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(0, -r * 1.36, r * 0.2, r * 0.13, 0, 0, TAU);
  paint(ctx, "#c8202a", lw * 0.8);
  // jewel and plume (sorguç)
  ctx.beginPath();
  ctx.moveTo(r * 0.05, -r * 0.95);
  ctx.quadraticCurveTo(r * 0.25, -r * 1.35, r * 0.15, -r * 1.6);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(r * 0.05, -r * 0.92, r * 0.1, 0, TAU);
  paint(ctx, "#2fd27a", lw * 0.7);
}

function bicorne(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, -r * 0.6);
  ctx.quadraticCurveTo(-r * 0.5, -r * 1.55, 0, -r * 1.4);
  ctx.quadraticCurveTo(r * 0.5, -r * 1.55, r * 1.05, -r * 0.6);
  ctx.quadraticCurveTo(0, -r * 0.95, -r * 1.05, -r * 0.6);
  ctx.closePath();
  paint(ctx, "#1d2233", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -r * 0.68);
  ctx.quadraticCurveTo(0, -r * 1.02, r * 0.9, -r * 0.68);
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  const rings: [number, string][] = [
    [0.2, "#e0453a"],
    [0.13, "#f4f6fb"],
    [0.06, "#2f5bd3"],
  ];
  for (const [k, c] of rings) {
    ctx.beginPath();
    ctx.arc(0, -r * 1.12, r * k, 0, TAU);
    paint(ctx, c, lw * 0.5);
  }
}

function laurel(ctx: Ctx, r: number, lw: number): void {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + side * (0.25 + i * 0.27);
      const x = Math.cos(a) * r * 1.0;
      const y = Math.sin(a) * r * 1.0;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + side * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.2, r * 0.09, 0, 0, TAU);
      paint(ctx, i % 2 ? "#7ccf5a" : "#9be070", lw * 0.6);
      ctx.restore();
    }
  }
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.0, -Math.PI / 2 - 1.75, -Math.PI / 2 + 1.75);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = "#3f7d2a";
  ctx.stroke();
}

function crown(ctx: Ctx, r: number, lw: number): void {
  const y0 = -r * 0.78;
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, y0);
  ctx.lineTo(-r * 0.7, -r * 1.3);
  ctx.lineTo(-r * 0.35, -r * 1.05);
  ctx.lineTo(0, -r * 1.45);
  ctx.lineTo(r * 0.35, -r * 1.05);
  ctx.lineTo(r * 0.7, -r * 1.3);
  ctx.lineTo(r * 0.62, y0);
  ctx.closePath();
  paint(ctx, GOLD, lw);
  ctx.beginPath();
  ctx.rect(-r * 0.62, y0 - r * 0.16, r * 1.24, r * 0.16);
  paint(ctx, "#e8b93c", lw * 0.7);
  for (const [x, c] of [
    [-0.35, "#e0453a"],
    [0, "#3d8bff"],
    [0.35, "#e0453a"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(r * x, y0 - r * 0.08, r * 0.07, 0, TAU);
    paint(ctx, c, lw * 0.4);
  }
}

function spartan(ctx: Ctx, r: number, lw: number): void {
  // transverse red crest
  ctx.beginPath();
  ctx.ellipse(0, -r * 1.02, r * 0.95, r * 0.42, 0, Math.PI, TAU);
  ctx.closePath();
  paint(ctx, "#c8202a", lw);
  ctx.strokeStyle = "rgba(8,10,17,0.35)";
  ctx.lineWidth = lw * 0.5;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.18, -r * 1.02);
    ctx.lineTo(i * r * 0.2, -r * 1.02 - Math.sqrt(Math.max(0, 1 - (i / 5) ** 2)) * r * 0.36);
    ctx.stroke();
  }
  // bronze helmet bowl
  ctx.beginPath();
  ctx.arc(0, -r * 0.35, r * 0.72, Math.PI * 1.08, Math.PI * 1.92);
  ctx.closePath();
  paint(ctx, "#d9a441", lw);
}

function mongolHat(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, -r * 0.95);
  ctx.quadraticCurveTo(0, -r * 1.75, r * 0.5, -r * 0.95);
  ctx.closePath();
  paint(ctx, "#c8202a", lw);
  ctx.beginPath();
  ctx.arc(0, -r * 1.42, r * 0.09, 0, TAU);
  paint(ctx, GOLD, lw * 0.6);
  // fur brim
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.88, r * 0.75, r * 0.2, 0, 0, TAU);
  paint(ctx, "#8a5a32", lw);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = lw * 0.5;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.2, -r * 0.98);
    ctx.lineTo(i * r * 0.2 + r * 0.05, -r * 0.8);
    ctx.stroke();
  }
}

function plumedHelmet(ctx: Ctx, r: number, lw: number): void {
  // tall horsehair plume
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 1.2);
  ctx.bezierCurveTo(-r * 0.2, -r * 1.75, r * 0.6, -r * 1.75, r * 0.85, -r * 1.05);
  ctx.bezierCurveTo(r * 0.5, -r * 1.35, r * 0.2, -r * 1.35, r * 0.1, -r * 1.15);
  ctx.closePath();
  paint(ctx, "#2a2d36", lw);
  ctx.beginPath();
  ctx.arc(0, -r * 0.35, r * 0.88, Math.PI * 1.15, Math.PI * 1.85);
  ctx.closePath();
  paint(ctx, "#c9a24a", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, -r * 0.95);
  ctx.lineTo(r * 0.45, -r * 0.95);
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = "rgba(8,10,17,0.4)";
  ctx.stroke();
}

function nemes(ctx: Ctx, r: number, lw: number): void {
  // striped royal headcloth
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 0.45);
  ctx.quadraticCurveTo(-r * 0.75, -r * 1.35, 0, -r * 1.35);
  ctx.quadraticCurveTo(r * 0.75, -r * 1.35, r * 0.95, -r * 0.45);
  ctx.quadraticCurveTo(0, -r * 0.85, -r * 0.95, -r * 0.45);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = "#2f5bd3";
  for (let i = -6; i <= 6; i += 2) {
    ctx.save();
    ctx.translate(i * r * 0.15, -r * 0.9);
    ctx.rotate(i * 0.05);
    ctx.fillRect(-r * 0.06, -r * 0.6, r * 0.12, r * 1.2);
    ctx.restore();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-r * 0.95, -r * 0.45);
  ctx.quadraticCurveTo(-r * 0.75, -r * 1.35, 0, -r * 1.35);
  ctx.quadraticCurveTo(r * 0.75, -r * 1.35, r * 0.95, -r * 0.45);
  ctx.quadraticCurveTo(0, -r * 0.85, -r * 0.95, -r * 0.45);
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // uraeus cobra at the brow
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.05);
  ctx.bezierCurveTo(r * 0.16, -r * 1.2, r * 0.12, -r * 1.5, 0, -r * 1.58);
  ctx.bezierCurveTo(-r * 0.12, -r * 1.5, -r * 0.16, -r * 1.2, 0, -r * 1.05);
  paint(ctx, "#e8b93c", lw * 0.7);
}

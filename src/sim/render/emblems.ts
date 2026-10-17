import { TAU } from "../geom";
import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

const GOLD = "#ffd45e";
const CREAM = "#fff4d6";

/**
 * Simple code-drawn symbol for each leader, centred on (0, 0) and fitting inside a
 * circle of radius `r`. Used on the ball, in the top panel and on the page.
 * Unknown ids draw nothing.
 */
export function drawEmblem(ctx: Ctx, id: string, r: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const lw = Math.max(1.5, r * 0.09);
  switch (id) {
    case "alexander":
      sun(ctx, r, lw);
      break;
    case "genghis":
      bow(ctx, r, lw);
      break;
    case "caesar":
      gladius(ctx, r, lw);
      break;
    case "hannibal":
      elephant(ctx, r, lw);
      break;
    case "napoleon":
      monogram(ctx, r, lw);
      break;
    case "leonidas":
      hoplon(ctx, r, lw);
      break;
    case "mehmed":
      cannon(ctx, r, lw);
      break;
    case "cleopatra":
      pyramid(ctx, r, lw);
      break;
    case "vlad":
      stake(ctx, r, lw);
      break;
    case "richard":
      lionheart(ctx, r, lw);
      break;
    case "saladin":
      scimitars(ctx, r, lw);
      break;
    case "qin":
      terracotta(ctx, r, lw);
      break;
    case "joan":
      banner(ctx, r, lw);
      break;
    case "harald":
      axe(ctx, r, lw);
      break;
    case "nobunaga":
      katana(ctx, r, lw);
      break;
    case "shaka":
      cowhideShield(ctx, r, lw);
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

/** Vergina sun: the 16-ray star of the Macedonian royal house. */
function sun(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  const rays = 16;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * TAU - Math.PI / 2;
    const half = (TAU / rays) * 0.28;
    ctx.moveTo(Math.cos(a - half) * r * 0.3, Math.sin(a - half) * r * 0.3);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    ctx.lineTo(Math.cos(a + half) * r * 0.3, Math.sin(a + half) * r * 0.3);
    ctx.closePath();
  }
  paint(ctx, GOLD, lw);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.36, 0, TAU);
  paint(ctx, GOLD, lw);
}

/** Recurve bow with a nocked arrow. */
function bow(ctx: Ctx, r: number, lw: number): void {
  const top = { x: -r * 0.1, y: -r * 0.85 };
  const bottom = { x: -r * 0.1, y: r * 0.85 };
  // string
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(-r * 0.45, 0);
  ctx.lineTo(bottom.x, bottom.y);
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 0.4;
  ctx.strokeStyle = CREAM;
  ctx.stroke();
  // limbs
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.bezierCurveTo(r * 0.25, -r * 0.75, r * 0.45, -r * 0.35, r * 0.4, 0);
  ctx.bezierCurveTo(r * 0.45, r * 0.35, r * 0.25, r * 0.75, bottom.x, bottom.y);
  ctx.lineWidth = lw * 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 1.6;
  ctx.strokeStyle = "#c58a4a";
  ctx.stroke();
  // arrow
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, 0);
  ctx.lineTo(r * 0.7, 0);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = CREAM;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.95, 0);
  ctx.lineTo(r * 0.62, -r * 0.17);
  ctx.lineTo(r * 0.62, r * 0.17);
  ctx.closePath();
  paint(ctx, CREAM, lw * 0.8);
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, -r * 0.16);
  ctx.lineTo(-r * 0.4, 0);
  ctx.lineTo(-r * 0.62, r * 0.16);
  ctx.lineTo(-r * 0.52, 0);
  ctx.closePath();
  paint(ctx, "#e05a4a", lw * 0.7);
}

/** Roman short sword, point up. */
function gladius(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.95);
  ctx.lineTo(r * 0.17, -r * 0.7);
  ctx.lineTo(r * 0.15, r * 0.25);
  ctx.lineTo(-r * 0.15, r * 0.25);
  ctx.lineTo(-r * 0.17, -r * 0.7);
  ctx.closePath();
  paint(ctx, "#dfe4ee", lw);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.8);
  ctx.lineTo(0, r * 0.2);
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = "rgba(8,10,17,0.35)";
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, r * 0.32, r * 0.42, r * 0.11, 0, 0, TAU);
  paint(ctx, GOLD, lw);
  ctx.beginPath();
  ctx.rect(-r * 0.1, r * 0.42, r * 0.2, r * 0.36);
  paint(ctx, "#8a5a32", lw);
  ctx.beginPath();
  ctx.arc(0, r * 0.86, r * 0.14, 0, TAU);
  paint(ctx, GOLD, lw);
}

/** Napoleon's imperial "N" inside a laurel wreath. */
function monogram(ctx: Ctx, r: number, lw: number): void {
  laurel(ctx, r, lw);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(r * 1.05)}px Georgia, "Times New Roman", serif`;
  ctx.lineWidth = lw * 1.4;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText("N", 0, r * 0.08);
  ctx.fillStyle = GOLD;
  ctx.fillText("N", 0, r * 0.08);
}

/** Pyramid with the sun behind it. */
function pyramid(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.arc(r * 0.35, -r * 0.35, r * 0.32, 0, TAU);
  paint(ctx, "#ffb15c", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.7);
  ctx.lineTo(r * 0.85, r * 0.6);
  ctx.lineTo(-r * 0.95, r * 0.6);
  ctx.closePath();
  paint(ctx, "#e8c27a", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, -r * 0.7);
  ctx.lineTo(r * 0.15, r * 0.6);
  ctx.lineTo(r * 0.85, r * 0.6);
  ctx.closePath();
  ctx.fillStyle = "rgba(8,10,17,0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(8,10,17,0.3)";
  ctx.lineWidth = lw * 0.5;
  for (const k of [0.25, 0.5, 0.75]) {
    const y = -r * 0.7 + r * 1.3 * k;
    ctx.beginPath();
    ctx.moveTo(-r * 0.05 - r * 0.9 * k, y);
    ctx.lineTo(-r * 0.05 + r * 0.9 * k, y);
    ctx.stroke();
  }
}

/** Laurel wreath, open at the top. */
function laurel(ctx: Ctx, r: number, lw: number): void {
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.68, Math.PI / 2 + side * 0.15, Math.PI / 2 + side * 2.6, side < 0);
    ctx.lineWidth = lw * 1.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 2 + side * (0.45 + i * 0.4);
      const x = Math.cos(a) * r * 0.68;
      const y = r * 0.05 + Math.sin(a) * r * 0.68;
      for (const out of [-1, 1]) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + (out > 0 ? 0 : Math.PI) + side * 0.9 * out);
        ctx.beginPath();
        ctx.ellipse(r * 0.14, 0, r * 0.15, r * 0.065, 0, 0, TAU);
        paint(ctx, GOLD, lw * 0.7);
        ctx.restore();
      }
    }
  }
}

/** War elephant facing right. */
function elephant(ctx: Ctx, r: number, lw: number): void {
  const grey = "#c9ced8";
  // legs
  ctx.beginPath();
  for (const x of [-0.5, -0.25, 0.08, 0.3]) {
    ctx.rect(x * r, r * 0.15, r * 0.17, r * 0.5);
  }
  paint(ctx, grey, lw);
  // body
  ctx.beginPath();
  ctx.ellipse(-r * 0.12, r * 0.02, r * 0.55, r * 0.38, 0, 0, TAU);
  paint(ctx, grey, lw);
  // trunk
  ctx.beginPath();
  ctx.moveTo(r * 0.55, -r * 0.15);
  ctx.bezierCurveTo(r * 0.85, r * 0.0, r * 0.75, r * 0.45, r * 0.9, r * 0.62);
  ctx.lineWidth = lw * 3.2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 1.6;
  ctx.strokeStyle = grey;
  ctx.stroke();
  // head
  ctx.beginPath();
  ctx.arc(r * 0.42, -r * 0.18, r * 0.27, 0, TAU);
  paint(ctx, grey, lw);
  // ear
  ctx.beginPath();
  ctx.ellipse(r * 0.24, -r * 0.12, r * 0.17, r * 0.27, -0.2, 0, TAU);
  paint(ctx, "#a7adba", lw);
  // tusk
  ctx.beginPath();
  ctx.moveTo(r * 0.55, r * 0.0);
  ctx.quadraticCurveTo(r * 0.72, r * 0.12, r * 0.82, r * 0.02);
  ctx.lineWidth = lw * 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 0.9;
  ctx.strokeStyle = CREAM;
  ctx.stroke();
  // eye
  ctx.beginPath();
  ctx.arc(r * 0.48, -r * 0.25, r * 0.045, 0, TAU);
  ctx.fillStyle = OUTLINE;
  ctx.fill();
}

/** Round hoplite shield with the Spartan lambda. */
function hoplon(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  paint(ctx, "#d9a441", lw);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, TAU);
  ctx.lineWidth = lw * 0.7;
  ctx.strokeStyle = "rgba(8,10,17,0.45)";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, r * 0.45);
  ctx.lineTo(0, -r * 0.48);
  ctx.lineTo(r * 0.42, r * 0.45);
  ctx.lineWidth = lw * 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.lineWidth = lw * 1.7;
  ctx.strokeStyle = "#a3201f";
  ctx.stroke();
}

/** Siege bombard on a wheel. */
function cannon(ctx: Ctx, r: number, lw: number): void {
  ctx.save();
  ctx.rotate(-0.38);
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, -r * 0.22);
  ctx.lineTo(r * 0.75, -r * 0.3);
  ctx.lineTo(r * 0.75, r * 0.3);
  ctx.lineTo(-r * 0.8, r * 0.22);
  ctx.arc(-r * 0.8, 0, r * 0.22, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  paint(ctx, "#c9a24a", lw);
  for (const x of [-0.35, 0.15, 0.6]) {
    ctx.beginPath();
    ctx.rect(r * x, -r * 0.33, r * 0.1, r * 0.66);
    paint(ctx, "#8f6f2a", lw * 0.6);
  }
  ctx.beginPath();
  ctx.ellipse(r * 0.78, 0, r * 0.08, r * 0.3, 0, 0, TAU);
  paint(ctx, "#2a2d36", lw * 0.6);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(-r * 0.15, r * 0.45, r * 0.3, 0, TAU);
  paint(ctx, "#8a5a32", lw);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    ctx.moveTo(-r * 0.15 + Math.cos(a) * r * 0.27, r * 0.45 + Math.sin(a) * r * 0.27);
    ctx.lineTo(-r * 0.15 - Math.cos(a) * r * 0.27, r * 0.45 - Math.sin(a) * r * 0.27);
  }
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** A sharpened stake. */
function stake(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.16, r * 0.85);
  ctx.lineTo(-r * 0.16, -r * 0.45);
  ctx.lineTo(0, -r * 0.92);
  ctx.lineTo(r * 0.16, -r * 0.45);
  ctx.lineTo(r * 0.16, r * 0.85);
  ctx.closePath();
  paint(ctx, "#a8743f", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.08, -r * 0.62);
  ctx.lineTo(0, -r * 0.92);
  ctx.lineTo(r * 0.08, -r * 0.62);
  ctx.closePath();
  ctx.fillStyle = "#b3201c";
  ctx.fill();
}

/** A crowned heart: the Lionheart. */
function lionheart(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(0, r * 0.82);
  ctx.bezierCurveTo(-r * 1.1, 0, -r * 0.6, -r * 0.75, 0, -r * 0.3);
  ctx.bezierCurveTo(r * 0.6, -r * 0.75, r * 1.1, 0, 0, r * 0.82);
  ctx.closePath();
  paint(ctx, "#c8202a", lw);
  ctx.beginPath();
  ctx.moveTo(-r * 0.36, -r * 0.42);
  ctx.lineTo(-r * 0.36, -r * 0.8);
  ctx.lineTo(-r * 0.18, -r * 0.62);
  ctx.lineTo(0, -r * 0.88);
  ctx.lineTo(r * 0.18, -r * 0.62);
  ctx.lineTo(r * 0.36, -r * 0.8);
  ctx.lineTo(r * 0.36, -r * 0.42);
  ctx.closePath();
  paint(ctx, GOLD, lw * 0.8);
}

/** Two crossed scimitars. */
function scimitars(ctx: Ctx, r: number, lw: number): void {
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(-r * 0.6, r * 0.62);
    ctx.quadraticCurveTo(r * 0.1, r * 0.2, r * 0.55, -r * 0.82);
    ctx.quadraticCurveTo(r * 0.25, r * 0.05, -r * 0.48, r * 0.72);
    ctx.closePath();
    paint(ctx, CREAM, lw * 0.8);
    ctx.beginPath();
    ctx.moveTo(-r * 0.72, r * 0.48);
    ctx.lineTo(-r * 0.4, r * 0.86);
    ctx.lineWidth = lw * 1.4;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    ctx.restore();
  }
}

/** Terracotta warrior's head with a topknot. */
function terracotta(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.arc(r * 0.18, -r * 0.62, r * 0.2, 0, TAU);
  paint(ctx, "#a85c35", lw * 0.8);
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.55, r * 0.68, 0, 0, TAU);
  paint(ctx, "#c47a4c", lw);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lw * 0.7;
  for (const x of [-r * 0.2, r * 0.2]) {
    ctx.beginPath();
    ctx.moveTo(x - r * 0.1, -r * 0.05);
    ctx.lineTo(x + r * 0.1, -r * 0.05);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-r * 0.18, r * 0.38);
  ctx.lineTo(r * 0.18, r * 0.38);
  ctx.stroke();
}

/** Joan's standard: a pole with a swallow-tailed banner and a fleur-de-lis. */
function banner(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.9);
  ctx.lineTo(-r * 0.55, -r * 0.9);
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = "#6b4a2a";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, -r * 0.85);
  ctx.lineTo(r * 0.8, -r * 0.7);
  ctx.lineTo(r * 0.45, -r * 0.3);
  ctx.lineTo(r * 0.8, r * 0.1);
  ctx.lineTo(-r * 0.55, r * 0.1);
  ctx.closePath();
  paint(ctx, "#2a4fa8", lw);
  fleur(ctx, r * 0.02, -r * 0.38, r * 0.3, lw * 0.5);
}

/** A bearded Norse axe. */
function axe(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.85);
  ctx.lineTo(r * 0.35, -r * 0.7);
  ctx.lineWidth = lw * 1.5;
  ctx.strokeStyle = "#6b4a2a";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.12, -r * 0.6);
  ctx.quadraticCurveTo(r * 0.6, -r * 0.95, r * 0.88, -r * 0.55);
  ctx.quadraticCurveTo(r * 0.6, -r * 0.4, r * 0.62, r * 0.05);
  ctx.quadraticCurveTo(r * 0.35, -r * 0.2, r * 0.3, -r * 0.3);
  ctx.closePath();
  paint(ctx, "#c9cdd4", lw);
}

/** A katana, drawn diagonally. */
function katana(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.4);
  ctx.quadraticCurveTo(r * 0.2, -r * 0.1, r * 0.82, -r * 0.82);
  ctx.quadraticCurveTo(r * 0.3, -r * 0.05, -r * 0.3, r * 0.5);
  ctx.closePath();
  paint(ctx, CREAM, lw * 0.8);
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, r * 0.48, r * 0.16, r * 0.07, -0.8, 0, TAU);
  paint(ctx, GOLD, lw * 0.6);
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.55);
  ctx.lineTo(-r * 0.85, r * 0.9);
  ctx.lineWidth = lw * 1.6;
  ctx.strokeStyle = "#2a2230";
  ctx.stroke();
}

/** Zulu cowhide shield with a spear behind it. */
function cowhideShield(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, r * 0.85);
  ctx.lineTo(r * 0.75, -r * 0.85);
  ctx.lineWidth = lw * 1.2;
  ctx.strokeStyle = "#6b4a2a";
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(r * 0.75, -r * 0.85);
  ctx.lineTo(r * 0.6, -r * 0.55);
  ctx.lineTo(r * 0.88, -r * 0.66);
  ctx.closePath();
  paint(ctx, "#c9cdd4", lw * 0.6);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.45, r * 0.8, 0, 0, TAU);
  paint(ctx, CREAM, lw);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#2a1a10";
  for (const [x, y, w] of [
    [-0.2, -0.4, 0.25],
    [0.18, 0.1, 0.3],
    [-0.15, 0.5, 0.22],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x * r, y * r, w * r, w * r * 0.7, 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.8);
  ctx.lineTo(0, r * 0.8);
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** Fleur-de-lis centred on (x, y), about `s` tall. */
export function fleur(ctx: Ctx, x: number, y: number, s: number, lw: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.35, -s * 0.4, 0, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.35, -s * 0.4, 0, -s);
  ctx.moveTo(-s * 0.1, s * 0.05);
  ctx.quadraticCurveTo(-s * 0.9, -s * 0.5, -s * 0.6, s * 0.35);
  ctx.quadraticCurveTo(-s * 0.4, s * 0.1, -s * 0.1, s * 0.2);
  ctx.moveTo(s * 0.1, s * 0.05);
  ctx.quadraticCurveTo(s * 0.9, -s * 0.5, s * 0.6, s * 0.35);
  ctx.quadraticCurveTo(s * 0.4, s * 0.1, s * 0.1, s * 0.2);
  ctx.rect(-s * 0.4, s * 0.2, s * 0.8, s * 0.14);
  ctx.moveTo(-s * 0.08, s * 0.34);
  ctx.lineTo(0, s * 0.75);
  ctx.lineTo(s * 0.08, s * 0.34);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

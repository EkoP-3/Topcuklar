import { OUTLINE } from "./palette";

/** Drill head colour per level: wood, stone, iron, gold, diamond, void. */
const TIER_COLORS = ["#a8743d", "#9aa1ab", "#e6e9ee", "#ffd447", "#4de8e0", "#8a55e8"] as const;

type Ctx = CanvasRenderingContext2D;

function fillShape(ctx: Ctx, color: string, width = 4): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

/** A line with a dark outline so it reads on any background. */
function bar(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + 6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

/**
 * Draws a weapon pointing along +x. `from` is where the handle starts (usually
 * hidden under the body) and `to` is the tip.
 */
export function drawWeapon(
  ctx: Ctx,
  id: string,
  from: number,
  to: number,
  thick: number,
  level = 0,
): void {
  const len = to - from;
  ctx.save();
  ctx.translate(from, 0);
  ctx.lineJoin = "round";

  switch (id) {
    case "drill": {
      bar(ctx, 0, 0, len * 0.34, 0, thick * 0.5, "#8d95a6");
      ctx.beginPath();
      ctx.moveTo(len * 0.3, -thick * 0.62);
      ctx.lineTo(len, 0);
      ctx.lineTo(len * 0.3, thick * 0.62);
      ctx.closePath();
      fillShape(ctx, TIER_COLORS[Math.min(level, TIER_COLORS.length - 1)] ?? "#9aa1ab");
      ctx.strokeStyle = "rgba(8,10,17,0.45)";
      ctx.lineWidth = 3;
      for (let i = 1; i <= 3; i++) {
        const x = len * (0.3 + i * 0.16);
        const h = thick * 0.62 * (1 - (x - len * 0.3) / (len * 0.7));
        ctx.beginPath();
        ctx.moveTo(x - 6, -h);
        ctx.lineTo(x + 6, h);
        ctx.stroke();
      }
      break;
    }
    case "chime": {
      const h = thick * 1.25;
      bar(ctx, 0, 0, len * 0.55, 0, 7, "#c4c8d2");
      ctx.beginPath();
      ctx.moveTo(len * 0.5, -h * 0.22);
      ctx.bezierCurveTo(len * 0.7, -h * 0.3, len * 0.8, -h * 0.55, len, -h * 0.62);
      ctx.lineTo(len, h * 0.62);
      ctx.bezierCurveTo(len * 0.8, h * 0.55, len * 0.7, h * 0.3, len * 0.5, h * 0.22);
      ctx.closePath();
      fillShape(ctx, "#ffcf4a");
      ctx.beginPath();
      ctx.arc(len * 0.97, 0, h * 0.17, 0, Math.PI * 2);
      fillShape(ctx, "#7a5a1e", 3);
      break;
    }
    case "pylon": {
      bar(ctx, 0, 0, len, 0, thick * 0.3, "#d3dae8");
      for (const k of [0.35, 0.55, 0.75]) {
        bar(ctx, len * k, -thick * 0.55, len * k, thick * 0.55, 5, "#aab4c8");
      }
      ctx.save();
      ctx.shadowColor = "#7cc0ff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(len, 0, thick * 0.5, 0, Math.PI * 2);
      fillShape(ctx, "#8cc8ff");
      ctx.restore();
      break;
    }
    case "grapple": {
      bar(ctx, 0, 0, len * 0.62, 0, thick * 0.34, "#cbc3b0");
      ctx.beginPath();
      ctx.moveTo(len * 0.6, 0);
      ctx.quadraticCurveTo(len * 1.04, -thick * 0.25, len * 0.98, thick * 1.0);
      ctx.quadraticCurveTo(len * 0.9, thick * 1.45, len * 0.7, thick * 1.05);
      ctx.strokeStyle = OUTLINE;
      ctx.lineWidth = thick * 0.34 + 6;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.strokeStyle = "#e0d8c4";
      ctx.lineWidth = thick * 0.34;
      ctx.stroke();
      break;
    }
    case "lance": {
      bar(ctx, 0, 0, len * 0.84, 0, thick * 0.42, "#b9835a");
      ctx.beginPath();
      ctx.moveTo(len * 0.8, -thick * 0.85);
      ctx.lineTo(len, 0);
      ctx.lineTo(len * 0.8, thick * 0.85);
      ctx.closePath();
      fillShape(ctx, "#e8eef7");
      ctx.beginPath();
      ctx.moveTo(len * 0.7, 0);
      ctx.lineTo(len * 0.62, -thick * 0.9);
      ctx.lineTo(len * 0.58, 0);
      ctx.lineTo(len * 0.62, thick * 0.9);
      ctx.closePath();
      fillShape(ctx, "#e5483f", 3);
      break;
    }
    case "maul": {
      bar(ctx, 0, 0, len * 0.72, 0, thick * 0.34, "#8a5a34");
      const x0 = len * 0.6;
      const h = thick * 0.78;
      ctx.beginPath();
      ctx.moveTo(x0 + 8, -h);
      ctx.lineTo(len - 8, -h);
      ctx.quadraticCurveTo(len, -h, len, -h + 8);
      ctx.lineTo(len, h - 8);
      ctx.quadraticCurveTo(len, h, len - 8, h);
      ctx.lineTo(x0 + 8, h);
      ctx.quadraticCurveTo(x0, h, x0, h - 8);
      ctx.lineTo(x0, -h + 8);
      ctx.quadraticCurveTo(x0, -h, x0 + 8, -h);
      ctx.closePath();
      fillShape(ctx, "#9ba3b3");
      for (const sy of [-h * 0.45, h * 0.45]) {
        ctx.beginPath();
        ctx.arc((x0 + len) / 2, sy, 4.5, 0, Math.PI * 2);
        fillShape(ctx, "#5c6577", 2);
      }
      break;
    }
    default: {
      bar(ctx, 0, 0, len, 0, thick * 0.4, "#cfd6e6");
    }
  }

  ctx.restore();
}

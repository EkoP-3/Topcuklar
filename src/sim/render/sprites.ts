import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

/** Drill bit colour per level: wood, stone, iron, gold, diamond, void. */
const TIER_COLORS = ["#a8743d", "#9aa1ab", "#e6e9ee", "#ffd447", "#4de8e0", "#8a55e8"] as const;

const STEEL = "#b9c3d6";
const DARK_STEEL = "#687389";
const WOOD = "#a76d3c";
const DARK_WOOD = "#6c4325";
const GOLD = "#f4b934";
const DARK_GOLD = "#a9741a";
const GLOW = "#79d4ff";
const RED = "#e5483f";

const LINE = 5;

/**
 * Fills the current path with a flat colour, adds a light top half and a shaded
 * bottom half (one light direction for every weapon), then outlines it.
 */
function solid(ctx: Ctx, color: string): void {
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.26)";
  ctx.fillRect(-4000, -4000, 8000, 4000);
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(-4000, 0, 8000, 4000);
  ctx.restore();
  ctx.lineWidth = LINE;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A thin vertical band across the weapon (grip wrap, ring, groove). */
function band(ctx: Ctx, x: number, h: number, w: number, color: string): void {
  rect(ctx, x - w / 2, -h / 2, w, h, Math.min(3, w / 2));
  solid(ctx, color);
}

/** The current path as a thick outlined line. */
function stroke(ctx: Ctx, w: number, color: string): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + LINE * 1.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

/**
 * Draws a weapon pointing along +x. `from` is where the handle starts (usually
 * hidden under the body) and `to` is the tip. `thick` is the weapon's hit width.
 */
export function drawWeapon(
  ctx: Ctx,
  id: string,
  from: number,
  to: number,
  thick: number,
  level = 0,
): void {
  const L = to - from;
  const T = thick;
  ctx.save();
  ctx.translate(from, 0);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (id) {
    case "drill": {
      // grip
      rect(ctx, 0, -T * 0.3, L * 0.3, T * 0.6, 4);
      solid(ctx, DARK_STEEL);
      band(ctx, L * 0.09, T * 0.78, 5, STEEL);
      band(ctx, L * 0.2, T * 0.78, 5, STEEL);
      // collar
      rect(ctx, L * 0.28, -T * 0.5, L * 0.08, T, 4);
      solid(ctx, STEEL);
      // conical bit with flutes
      const bit = TIER_COLORS[Math.min(level, TIER_COLORS.length - 1)] ?? STEEL;
      ctx.beginPath();
      ctx.moveTo(L * 0.36, -T * 0.66);
      ctx.lineTo(L, 0);
      ctx.lineTo(L * 0.36, T * 0.66);
      ctx.closePath();
      solid(ctx, bit);
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = "rgba(8,10,17,0.5)";
      ctx.lineWidth = 3.5;
      for (let i = 0; i < 4; i++) {
        const x = L * (0.42 + i * 0.15);
        ctx.beginPath();
        ctx.moveTo(x, -T);
        ctx.lineTo(x + T * 0.5, T);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case "chime": {
      // hanging rod and bell
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L * 0.46, 0);
      stroke(ctx, T * 0.2, STEEL);
      const h = T * 0.82;
      ctx.beginPath();
      ctx.moveTo(L * 0.4, 0);
      ctx.bezierCurveTo(L * 0.4, -h * 0.9, L * 0.56, -h * 0.95, L * 0.7, -h * 0.8);
      ctx.bezierCurveTo(L * 0.82, -h * 0.7, L * 0.94, -h * 0.9, L * 0.99, -h * 1.05);
      ctx.lineTo(L * 0.99, h * 1.05);
      ctx.bezierCurveTo(L * 0.94, h * 0.9, L * 0.82, h * 0.7, L * 0.7, h * 0.8);
      ctx.bezierCurveTo(L * 0.56, h * 0.95, L * 0.4, h * 0.9, L * 0.4, 0);
      ctx.closePath();
      solid(ctx, GOLD);
      // lip
      rect(ctx, L * 0.94, -h * 1.1, L * 0.06, h * 2.2, 5);
      solid(ctx, DARK_GOLD);
      // clapper
      ctx.beginPath();
      ctx.arc(L * 1.0, 0, T * 0.22, 0, Math.PI * 2);
      solid(ctx, DARK_WOOD);
      break;
    }

    case "pylon": {
      // coil rod
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L * 0.86, 0);
      stroke(ctx, T * 0.3, STEEL);
      // growing rings
      [0.3, 0.46, 0.62].forEach((x, i) => {
        ctx.beginPath();
        ctx.ellipse(L * x, 0, L * 0.035, T * (0.5 + i * 0.12), 0, 0, Math.PI * 2);
        solid(ctx, DARK_STEEL);
      });
      // energy orb
      ctx.save();
      ctx.shadowColor = GLOW;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(L * 0.88, 0, T * 0.68, 0, Math.PI * 2);
      solid(ctx, GLOW);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(L * 0.86, -T * 0.2, T * 0.17, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fill();
      break;
    }

    case "grapple": {
      // shaft
      rect(ctx, 0, -T * 0.17, L * 0.6, T * 0.34, 4);
      solid(ctx, WOOD);
      band(ctx, L * 0.16, T * 0.6, 6, DARK_WOOD);
      band(ctx, L * 0.32, T * 0.6, 6, DARK_WOOD);
      band(ctx, L * 0.58, T * 0.62, 8, STEEL);
      // three-pronged hook: centre spike plus two swept-back barbs
      ctx.beginPath();
      ctx.moveTo(L * 0.6, 0);
      ctx.lineTo(L * 0.94, 0);
      stroke(ctx, T * 0.3, STEEL);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(L * 0.62, 0);
        ctx.quadraticCurveTo(L * 0.96, s * T * 0.35, L * 0.9, s * T * 1.1);
        stroke(ctx, T * 0.26, STEEL);
      }
      ctx.beginPath();
      ctx.moveTo(L * 0.92, -T * 0.34);
      ctx.lineTo(L, 0);
      ctx.lineTo(L * 0.92, T * 0.34);
      ctx.closePath();
      solid(ctx, STEEL);
      break;
    }

    case "lance": {
      // shaft
      rect(ctx, 0, -T * 0.3, L * 0.8, T * 0.6, 4);
      solid(ctx, WOOD);
      band(ctx, L * 0.2, T * 0.84, 7, DARK_WOOD);
      band(ctx, L * 0.4, T * 0.84, 7, DARK_WOOD);
      band(ctx, L * 0.6, T * 0.84, 7, DARK_WOOD);
      // pennant
      ctx.beginPath();
      ctx.moveTo(L * 0.76, -T * 0.2);
      ctx.lineTo(L * 0.5, -T * 1.35);
      ctx.lineTo(L * 0.58, -T * 0.2);
      ctx.closePath();
      solid(ctx, RED);
      // guard and leaf head
      ctx.beginPath();
      ctx.ellipse(L * 0.8, 0, L * 0.03, T * 1.0, 0, 0, Math.PI * 2);
      solid(ctx, DARK_STEEL);
      ctx.beginPath();
      ctx.moveTo(L * 0.8, 0);
      ctx.quadraticCurveTo(L * 0.87, -T * 1.1, L, 0);
      ctx.quadraticCurveTo(L * 0.87, T * 1.1, L * 0.8, 0);
      ctx.closePath();
      solid(ctx, STEEL);
      ctx.beginPath();
      ctx.moveTo(L * 0.83, 0);
      ctx.lineTo(L * 0.96, 0);
      ctx.strokeStyle = "rgba(8,10,17,0.4)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
      break;
    }

    case "maul": {
      // handle
      rect(ctx, 0, -T * 0.16, L * 0.7, T * 0.32, 4);
      solid(ctx, WOOD);
      band(ctx, L * 0.14, T * 0.52, 6, DARK_WOOD);
      band(ctx, L * 0.3, T * 0.52, 6, DARK_WOOD);
      // heavy head with metal end caps
      const hx = L * 0.58;
      const hw = L * 0.42;
      const hh = T * 0.84;
      rect(ctx, hx, -hh, hw, hh * 2, 8);
      solid(ctx, DARK_STEEL);
      rect(ctx, hx, -hh, hw * 0.2, hh * 2, 8);
      solid(ctx, STEEL);
      rect(ctx, hx + hw * 0.8, -hh, hw * 0.2, hh * 2, 8);
      solid(ctx, STEEL);
      for (const sy of [-hh * 0.5, hh * 0.5]) {
        ctx.beginPath();
        ctx.arc(hx + hw * 0.5, sy, 4.5, 0, Math.PI * 2);
        solid(ctx, STEEL);
      }
      break;
    }

    default: {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(L, 0);
      stroke(ctx, T * 0.4, STEEL);
    }
  }

  ctx.restore();
}

import { TAU } from "../geom";
import { OUTLINE } from "./palette";

type Ctx = CanvasRenderingContext2D;

/** What a leader's face shows right now (purely cosmetic, picked by the renderer). */
export type Mood =
  "determined" | "focus" | "smug" | "scared" | "furious" | "ouch" | "dizzy" | "win" | "ko";

const WHITE = "#fffaf0";
const MOUTH = "#3a1208";
const BEARD = "#3b2414";

/**
 * Cartoon face on a leader's ball: big eyes that follow the enemy, ink brows and a
 * mouth that change with the mood, plus each leader's trademark (Hannibal's eye patch,
 * Genghis' moustache…). Origin is the ball centre, `r` the ball radius; the headgear
 * is drawn on top afterwards.
 *
 * @param look direction to the enemy (any length; 0,0 looks straight ahead)
 * @param time seconds, for blinking and wobbles
 * @param index fighter index, so the two leaders do not blink in sync
 */
export function drawFace(
  ctx: Ctx,
  id: string,
  r: number,
  mood: Mood,
  lookX: number,
  lookY: number,
  time: number,
  index: number,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  const lw = Math.max(2, r * 0.07);
  const len = Math.hypot(lookX, lookY) || 1;
  const lx = (lookX / len) * r * 0.075;
  const ly = (lookY / len) * r * 0.06;
  // A quick blink every few seconds.
  const blink = mood !== "ko" && mood !== "win" && (time * 0.37 + index * 0.53) % 1 > 0.965;

  if (id === "leonidas") beard(ctx, r, lw, 0.05);
  if (id === "mehmed") beard(ctx, r, lw, 0.3);

  // Eyebrows: inner end raised (+) or lowered (−).
  let browTilt = 0.04;
  let browY = -0.36;
  if (mood === "furious") browTilt = -0.16;
  else if (mood === "scared") {
    browTilt = 0.14;
    browY = -0.42;
  } else if (mood === "ouch") browTilt = -0.08;
  else if (mood === "focus") browTilt = -0.06;
  if (id === "napoleon" && mood !== "scared" && mood !== "win") browTilt -= 0.07;

  for (const side of [-1, 1] as const) {
    const ex = side * r * 0.32;
    const ey = -r * 0.08;
    const patched = id === "hannibal" && side === -1;
    if (patched) {
      eyePatch(ctx, ex, ey, r, lw);
    } else {
      eye(ctx, ex, ey, r, lw, side, mood, blink, lx, ly, time);
      if (id === "cleopatra") eyeliner(ctx, ex, ey, r, lw, side);
    }
    // Brow (Hannibal keeps one over the patch too).
    const smugLift = mood === "smug" && side === 1 ? -0.07 : 0;
    const inner = (browY - browTilt + smugLift) * r;
    const outer = (browY + browTilt * 0.4 + smugLift) * r;
    ctx.beginPath();
    ctx.moveTo(side * r * 0.12, inner);
    ctx.lineTo(side * r * 0.5, outer);
    ctx.lineWidth = lw * 1.3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }

  if (id === "genghis") moustache(ctx, r, lw);
  if (id === "mehmed") smallMoustache(ctx, r, lw);
  mouth(ctx, r, lw, mood, time);

  if (mood === "scared") {
    // Sweat drop.
    const sx = r * 0.62;
    const sy = -r * 0.2 + ((time * 0.8) % 1) * r * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r * 0.16);
    ctx.quadraticCurveTo(sx + r * 0.1, sy, sx, sy + r * 0.06);
    ctx.quadraticCurveTo(sx - r * 0.1, sy, sx, sy - r * 0.16);
    ctx.fillStyle = "#bfe6ff";
    ctx.fill();
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

function eye(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  lw: number,
  side: -1 | 1,
  mood: Mood,
  blink: boolean,
  lx: number,
  ly: number,
  time: number,
): void {
  const er = r * 0.19;
  ctx.strokeStyle = OUTLINE;
  if (mood === "ko") {
    const k = er * 0.75;
    ctx.beginPath();
    ctx.moveTo(x - k, y - k);
    ctx.lineTo(x + k, y + k);
    ctx.moveTo(x + k, y - k);
    ctx.lineTo(x - k, y + k);
    ctx.lineWidth = lw * 1.2;
    ctx.stroke();
    return;
  }
  if (mood === "win") {
    // Happy closed eyes: ^ ^
    ctx.beginPath();
    ctx.arc(x, y + er * 0.4, er * 0.8, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = lw * 1.2;
    ctx.stroke();
    return;
  }
  if (blink) {
    ctx.beginPath();
    ctx.moveTo(x - er, y);
    ctx.lineTo(x + er, y);
    ctx.lineWidth = lw;
    ctx.stroke();
    return;
  }
  const squash = mood === "ouch" ? 0.45 : mood === "focus" ? 0.6 : mood === "scared" ? 1.15 : 1;
  ctx.beginPath();
  ctx.ellipse(x, y, er, er * squash, 0, 0, TAU);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.lineWidth = lw * 0.8;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  if (mood === "dizzy") {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * TAU * 2 + time * 10 * side;
      const d = (i / 24) * er * 0.85;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  } else {
    const pr = mood === "scared" ? er * 0.38 : er * 0.5;
    ctx.beginPath();
    ctx.arc(x + lx, y + ly, pr, 0, TAU);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + lx - pr * 0.35, y + ly - pr * 0.35, pr * 0.3, 0, TAU);
    ctx.fillStyle = WHITE;
    ctx.fill();
  }
  if (mood === "smug" || mood === "furious") {
    // Heavy upper lid.
    ctx.fillStyle = "rgba(30,19,11,0.85)";
    ctx.beginPath();
    const drop = mood === "smug" ? 0.15 : -0.25;
    ctx.moveTo(x - er * 1.2, y - er * 1.2);
    ctx.lineTo(x + er * 1.2, y - er * 1.2);
    ctx.lineTo(x + er * 1.2, y + er * (drop + (mood === "furious" ? side * 0.3 : 0)));
    ctx.lineTo(x - er * 1.2, y + er * (drop - (mood === "furious" ? side * 0.3 : 0)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function mouth(ctx: Ctx, r: number, lw: number, mood: Mood, time: number): void {
  const y = r * 0.4;
  const w = r * 0.24;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lw;
  ctx.beginPath();
  switch (mood) {
    case "win": {
      // Big open grin.
      ctx.moveTo(-w * 1.4, y - r * 0.06);
      ctx.quadraticCurveTo(0, y + r * 0.42, w * 1.4, y - r * 0.06);
      ctx.closePath();
      ctx.fillStyle = MOUTH;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, y + r * 0.1, w * 0.5, r * 0.06, 0, 0, TAU);
      ctx.fillStyle = "#d9534f";
      ctx.fill();
      return;
    }
    case "furious": {
      // Clenched teeth.
      ctx.rect(-w * 1.2, y - r * 0.08, w * 2.4, r * 0.18);
      ctx.fillStyle = WHITE;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 1.2, y + r * 0.01);
      ctx.lineTo(w * 1.2, y + r * 0.01);
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * w * 0.45, y - r * 0.08);
        ctx.lineTo(i * w * 0.45, y + r * 0.1);
      }
      ctx.lineWidth = lw * 0.6;
      ctx.stroke();
      return;
    }
    case "ouch":
    case "ko": {
      ctx.ellipse(0, y + r * 0.04, w * 0.6, r * 0.13, 0, 0, TAU);
      ctx.fillStyle = MOUTH;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case "scared": {
      // Wobbly line.
      const shake = Math.sin(time * 30) * r * 0.015;
      ctx.moveTo(-w * 1.1, y + r * 0.04);
      for (let i = 1; i <= 6; i++) {
        ctx.lineTo(-w * 1.1 + (i / 6) * w * 2.2, y + (i % 2 === 0 ? 0.04 : -0.03) * r + shake);
      }
      ctx.stroke();
      return;
    }
    case "smug": {
      ctx.moveTo(-w * 0.9, y + r * 0.02);
      ctx.quadraticCurveTo(w * 0.2, y + r * 0.08, w * 1.1, y - r * 0.1);
      ctx.stroke();
      return;
    }
    case "focus":
      ctx.moveTo(-w * 0.6, y);
      ctx.lineTo(w * 0.6, y);
      ctx.stroke();
      return;
    case "dizzy":
      ctx.moveTo(-w, y);
      ctx.quadraticCurveTo(-w * 0.5, y - r * 0.08, 0, y);
      ctx.quadraticCurveTo(w * 0.5, y + r * 0.08, w, y);
      ctx.stroke();
      return;
    default:
      // Determined: firm, slightly turned down.
      ctx.moveTo(-w, y + r * 0.03);
      ctx.quadraticCurveTo(0, y - r * 0.04, w, y + r * 0.03);
      ctx.stroke();
  }
}

function beard(ctx: Ctx, r: number, lw: number, top: number): void {
  // Along the bottom of the ball from cheek to cheek, with a U cut out for the mouth.
  const a0 = Math.PI * (0.08 + top * 0.1);
  const cx = r * Math.cos(a0);
  const cy = r * Math.sin(a0);
  ctx.beginPath();
  ctx.arc(0, 0, r, a0, Math.PI - a0);
  ctx.quadraticCurveTo(-r * 0.6, r * 0.2, -r * 0.32, r * 0.22);
  ctx.quadraticCurveTo(0, r * 0.95, r * 0.32, r * 0.22);
  ctx.quadraticCurveTo(r * 0.6, r * 0.2, cx, cy);
  ctx.closePath();
  ctx.fillStyle = BEARD;
  ctx.fill();
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function moustache(ctx: Ctx, r: number, lw: number): void {
  // Long drooping Mongol moustache.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.26);
    ctx.quadraticCurveTo(side * r * 0.35, r * 0.18, side * r * 0.42, r * 0.62);
    ctx.quadraticCurveTo(side * r * 0.3, r * 0.3, 0, r * 0.32);
    ctx.closePath();
    ctx.fillStyle = BEARD;
    ctx.fill();
    ctx.lineWidth = lw * 0.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
}

function smallMoustache(ctx: Ctx, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, r * 0.33);
  ctx.quadraticCurveTo(0, r * 0.16, r * 0.3, r * 0.33);
  ctx.quadraticCurveTo(0, r * 0.26, -r * 0.3, r * 0.33);
  ctx.fillStyle = BEARD;
  ctx.fill();
  ctx.lineWidth = lw * 0.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function eyePatch(ctx: Ctx, x: number, y: number, r: number, lw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - r * 0.42, y - r * 0.3);
  ctx.lineTo(x + r * 0.62, y - r * 0.52);
  ctx.lineWidth = lw * 0.8;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.2, r * 0.17, 0, 0, TAU);
  ctx.fillStyle = "#1a1410";
  ctx.fill();
  ctx.stroke();
}

function eyeliner(ctx: Ctx, x: number, y: number, r: number, lw: number, side: -1 | 1): void {
  const er = r * 0.19;
  ctx.beginPath();
  ctx.arc(x, y, er, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineWidth = lw * 1.3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // Wing.
  ctx.beginPath();
  ctx.moveTo(x + side * er * 0.95, y - er * 0.2);
  ctx.lineTo(x + side * er * 1.6, y - er * 0.65);
  ctx.lineWidth = lw * 1.1;
  ctx.stroke();
}

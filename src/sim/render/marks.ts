import { TAU, clamp } from "../geom";
import type { MarkHazard } from "../types";
import type { World } from "../world";
import { DISPLAY_FONT, GOLD, OUTLINE, SIDES, THEME } from "./palette";

/**
 * Signature-mechanic markers (see MarkHazard), in world units. `drawMarksUnder` goes
 * on the floor below everything (the Rubicon, wall cannons and breaches, the blood
 * under Vlad's rooted stakes); `drawMarksOver` goes over the fighters (auras, the anvil).
 */
type Ctx = CanvasRenderingContext2D;

export function drawMarksUnder(ctx: Ctx, world: World, frame: number): void {
  for (const h of world.hazards) {
    // Vlad's stakes that drew blood stay for good: a dark stain under them.
    if (h.kind === "zone" && h.style === "stakes" && h.ttl > 1000) {
      ctx.save();
      ctx.globalAlpha = clamp((h.maxTtl - h.ttl) / 0.3, 0, 1);
      ctx.beginPath();
      ctx.ellipse(h.x, h.y + 8, 34, 16, 0, 0, TAU);
      ctx.fillStyle = "rgba(140,18,18,0.55)";
      ctx.fill();
      ctx.restore();
    }
    if (h.kind !== "mark") continue;
    if (h.style === "rubicon") drawRubicon(ctx, h, frame);
    else if (h.style === "breach") drawBreach(ctx, h, world);
    else if (h.style === "cannon") drawCannon(ctx, h, world);
  }
}

export function drawMarksOver(ctx: Ctx, world: World, frame: number): void {
  for (const h of world.hazards) {
    if (h.kind !== "mark") continue;
    if (h.style === "laststand") drawLastStand(ctx, h, world, frame);
    else if (h.style === "charm") drawCharm(ctx, h, world, frame);
    else if (h.style === "anvil") drawAnvil(ctx, h);
  }
}

/** 1 while the mark lives, fading over its last `out` seconds and its first `inn`. */
function fade(h: MarkHazard, out: number, inn = 0.15): number {
  const age = h.maxTtl === Infinity ? Infinity : h.maxTtl - h.ttl;
  return clamp(h.ttl / out, 0, 1) * clamp(age / inn, 0, 1);
}

/** The Rubicon: a winding blue river right across the arena. */
function drawRubicon(ctx: Ctx, h: MarkHazard, frame: number): void {
  ctx.save();
  ctx.globalAlpha = h.ttl === Infinity ? 1 : clamp(h.ttl / 0.6, 0, 1);
  ctx.translate(h.x, h.y);
  // Along the river, turned so its name never reads upside down.
  let a = Math.atan2(h.ny, h.nx) + Math.PI / 2;
  if (Math.cos(a) < 0) a += Math.PI;
  ctx.rotate(a);
  // Along x now runs the river; y crosses it.
  const len = 1100;
  const wave = (x: number, k: number) => Math.sin(x * 0.02 + k) * 7;
  const river = (half: number) => {
    ctx.beginPath();
    for (let x = -len; x <= len; x += 20) ctx.lineTo(x, wave(x, 0) - half);
    for (let x = len; x >= -len; x -= 20) ctx.lineTo(x, wave(x, 0) + half);
    ctx.closePath();
  };
  river(17);
  ctx.fillStyle = OUTLINE;
  ctx.globalAlpha *= 0.55;
  ctx.fill();
  ctx.globalAlpha /= 0.55;
  river(13);
  ctx.fillStyle = THEME.id === "map" ? "#5f9fd8" : "#3f8fe6";
  ctx.fill();
  // Ripples drifting downstream.
  ctx.strokeStyle = "rgba(235,248,255,0.85)";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  const drift = (frame * 1.2) % 60;
  for (let x = -len + drift; x < len; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, wave(x, 0) - 3);
    ctx.lineTo(x + 18, wave(x + 18, 0) - 3);
    ctx.stroke();
  }
  ctx.font = `900 15px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = THEME.id === "map" ? "#1f4f86" : "#bfe0ff";
  ctx.fillText("RUBICON", 0, -20);
  ctx.restore();
}

/** Where a wall marker sits now: on the current wall (it slides in during a frenzy). */
function onWall(h: MarkHazard, world: World): { x: number; y: number } {
  const wall = h.nx > 0 || h.ny > 0 ? world.lo : world.hi;
  return h.nx !== 0 ? { x: wall, y: h.y } : { x: h.x, y: wall };
}

/** A breach in the wall: cracked stone and rubble spilling into the arena. */
function drawBreach(ctx: Ctx, h: MarkHazard, world: World): void {
  const p = onWall(h, world);
  ctx.save();
  ctx.globalAlpha = fade(h, 0.4);
  ctx.translate(p.x, p.y);
  // Rotate so the arena is toward +y and the wall runs along x.
  ctx.rotate(Math.atan2(h.ny, h.nx) - Math.PI / 2);
  const half = 100;
  ctx.beginPath();
  ctx.moveTo(-half, 0);
  for (let i = 0; i <= 10; i++) ctx.lineTo(-half + (i * half) / 5, i % 2 ? 30 : 16);
  ctx.lineTo(half, 0);
  ctx.closePath();
  ctx.fillStyle = "#2b1b0f";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ff8a2a";
  ctx.stroke();
  // Rubble.
  const stones: [number, number, number][] = [
    [-60, 36, 12],
    [-34, 44, 10],
    [-8, 38, 14],
    [20, 46, 9],
    [44, 37, 13],
    [66, 43, 10],
    [86, 35, 9],
    [-84, 40, 9],
    [6, 56, 8],
    [-48, 54, 8],
  ];
  for (const [x, y, s] of stones) {
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x - s * 0.4, y - s * 0.8);
    ctx.lineTo(x + s * 0.7, y - s * 0.6);
    ctx.lineTo(x + s, y + s * 0.3);
    ctx.lineTo(x, y + s * 0.8);
    ctx.closePath();
    ctx.fillStyle = "#9a8f7e";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

/** One of Napoleon's guns, set up on the wall and aimed into the arena. */
function drawCannon(ctx: Ctx, h: MarkHazard, world: World): void {
  const p = onWall(h, world);
  const side = SIDES[world.fighters[h.owner]?.side ?? 0];
  ctx.save();
  ctx.globalAlpha = h.ttl === Infinity ? 1 : clamp(h.ttl / 0.35, 0, 1);
  ctx.translate(p.x + h.nx * 6, p.y + h.ny * 6);
  ctx.rotate(Math.atan2(h.ny, h.nx));
  ctx.scale(1.45, 1.45);
  // Emplacement in the team colour.
  ctx.beginPath();
  ctx.arc(0, 0, 30, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = side.main;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // Bronze barrel...
  ctx.beginPath();
  ctx.moveTo(4, -9);
  ctx.lineTo(46, -6);
  ctx.lineTo(46, 6);
  ctx.lineTo(4, 9);
  ctx.closePath();
  ctx.fillStyle = "#c9933e";
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(44, -7, 5, 14);
  // ...on a wheel.
  ctx.beginPath();
  ctx.arc(14, 0, 11, 0, TAU);
  ctx.fillStyle = "#6b4426";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(14, 0, 3, 0, TAU);
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.restore();
}

/** Leonidas' last stand: a blood-red glow and a hedge of spear points around him. */
function drawLastStand(ctx: Ctx, h: MarkHazard, world: World, frame: number): void {
  const f = world.fighters[h.fighter];
  if (!f?.alive) return;
  const k = fade(h, 0.4, 0.2);
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.35);
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = k;
  const r = f.radius + 14;
  ctx.beginPath();
  ctx.arc(0, 0, r + 6 * pulse, 0, TAU);
  ctx.fillStyle = `rgba(200,32,42,${0.18 + 0.12 * pulse})`;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#c8202a";
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  // Spear points all round, slowly turning.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + frame * 0.01;
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(r + 2, -6);
    ctx.lineTo(r + 26, 0);
    ctx.lineTo(r + 2, 6);
    ctx.closePath();
    ctx.fillStyle = "#e8ecf2";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function heart(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
  ctx.closePath();
}

/** Cleopatra's charm: a pink glow and hearts circling the charmed enemy's head. */
function drawCharm(ctx: Ctx, h: MarkHazard, world: World, frame: number): void {
  const f = world.fighters[h.fighter];
  if (!f?.alive) return;
  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.globalAlpha = fade(h, 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, f.radius + 8, 0, TAU);
  ctx.fillStyle = "rgba(255,111,168,0.22)";
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#ff6fa8";
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.08 + (i / 3) * TAU;
    const x = Math.cos(a) * f.radius * 0.8;
    const y = -f.radius * 1.55 + Math.sin(a) * 10;
    heart(ctx, x, y, 15 + 2 * Math.sin(frame * 0.3 + i));
    ctx.fillStyle = "#ff4f93";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

/** The anvil: a row of hoplite shields along the wall the enemy was hammered into. */
function drawAnvil(ctx: Ctx, h: MarkHazard): void {
  ctx.save();
  ctx.globalAlpha = fade(h, 0.35, 0.08);
  ctx.translate(h.x, h.y);
  ctx.rotate(Math.atan2(h.ny, h.nx) - Math.PI / 2);
  for (let i = -3; i <= 3; i++) {
    const x = i * 40;
    ctx.beginPath();
    ctx.arc(x, 6, 23, 0, TAU);
    ctx.fillStyle = "#c9a24a";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 6, 14, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#7a4f06";
    ctx.stroke();
    // Spear tip over each shield.
    ctx.beginPath();
    ctx.moveTo(x - 5, 26);
    ctx.lineTo(x, 50);
    ctx.lineTo(x + 5, 26);
    ctx.closePath();
    ctx.fillStyle = "#e8ecf2";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

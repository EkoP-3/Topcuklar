import { TAU, clamp } from "../geom";
import type {
  ArcHazard,
  Fighter,
  FighterDef,
  HookHazard,
  ProjectileHazard,
  PylonHazard,
  RingHazard,
  StrikeHazard,
  SweepHazard,
  UnitHazard,
  WallHazard,
  ZoneHazard,
} from "../types";
import {
  ARENA,
  CLOSE_CALLS_FOR_FRENZY,
  DOMAIN_CLASH_TIME,
  nightStrength,
  ULT_CINEMATIC,
  ULT_HP,
  type World,
  weaponAngle,
} from "../world";
import { winChance } from "../odds";
import { liveChance } from "../live";
import { drawFace, type Mood } from "./faces";
import { domainLayer } from "./domains";
import { UPSET_CHANCE } from "./sfx";
import type { Fx } from "./fx";
import {
  BODY_FONT,
  DISPLAY_FONT,
  GOLD,
  INK,
  MONO_FONT,
  OUTLINE,
  PAPER,
  PAPER_DARK,
  SIDES,
  fontsVersion,
  matchColors,
  setMatchColors,
} from "./palette";
import { LEVEL_TIMES } from "../leaders/kit";
import { drawEmblem, fleur } from "./emblems";
import { FLAG_RATIO, drawFlag } from "./flags";
import { drawHeadgear } from "./headgear";
import { hasWeaponImage, portraitImage } from "./images";
import { weaponArt } from "../leaders/weapons";
import { drawWeapon } from "./sprites";

/** The video frame is laid out in a fixed 1080x1920 (9:16) space and scaled to the canvas. */
const W = 1080;
const H = 1920;
/** Arena square inside the frame, in frame pixels. */
/** Everything sits this far down the frame: clear of the Shorts top bar, and the
 * empty space under the arena is left for the title and caption overlay. */
const LAYOUT_DY = 110;
const AX = 24;
const AY = 350;
const AS = 1032;
/** Frame pixels per world unit. The world is smaller than the frame so fighters look big. */
const K = AS / ARENA;
/** Corner radius of the map sheet. */
const AR = 14;
/** Dark leather around the map. */
const LEATHER = "#1d120a";

type Ctx = CanvasRenderingContext2D;

export interface DrawExtras {
  /** Leaders to show on the "who's next?" end card (question marks when null). */
  next?: readonly [FighterDef, FighterDef] | null;
}

export interface Renderer {
  draw(world: World, fx: Fx, extras?: DrawExtras): void;
}

/**
 * @param quality canvas pixels per frame unit. 2/3 gives 720x1280 (good for live
 * preview); use 1 for full 1080x1920.
 */
export function createRenderer(canvas: HTMLCanvasElement, quality = 2 / 3): Renderer {
  canvas.width = Math.round(W * quality);
  canvas.height = Math.round(H * quality);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not supported in this browser");

  // Static layers are drawn once and blitted every frame (much cheaper than redrawing).
  const background = buildBackground(quality);
  const overlay = buildOverlay(quality);
  const hpLag: number[] = [];
  /** Smoothed live win chance of the first fighter (null = not shown). */
  let winShown: number | null = null;
  let frame = 0;
  const cam: Camera = { zoom: 1, x: ARENA / 2, y: ARENA / 2 };

  const draw = (world: World, fx: Fx, extras: DrawExtras = {}): void => {
    frame++;
    const [fa, fb] = world.fighters;
    if (fa && fb) setMatchColors(fa.def.id, fb.def.id);
    ctx.setTransform(quality, 0, 0, quality, 0, 0);
    ctx.fillStyle = LEATHER;
    ctx.fillRect(0, 0, W, H);
    followCamera(cam, world);

    for (const f of world.fighters) {
      const ratio = clamp(f.hp / f.maxHp, 0, 1);
      const prev = hpLag[f.index] ?? ratio;
      hpLag[f.index] =
        world.phase === "intro" || prev < ratio ? ratio : prev + (ratio - prev) * 0.07;
    }

    ctx.save();
    ctx.translate(fx.shakeX, fx.shakeY + LAYOUT_DY);
    ctx.drawImage(background, 0, 0, W, H);
    const live = world.phase === "intro" ? null : liveChance(world);
    if (live === null) winShown = null;
    else winShown = winShown === null ? live : winShown + (live - winShown) * 0.08;
    drawTopPanel(ctx, world, hpLag, winShown);
    drawArena(ctx, world, fx, frame, extras, cam);
    drawCloseCalls(ctx, world);
    drawDomainBadge(ctx, world);
    ctx.restore();

    drawOverlay(ctx, fx, overlay);
  };

  return { draw };
}

// --- camera ----------------------------------------------------------------------

/** Edited-video feel: the view leans in on the ultimate's caster and on the K.O. */
interface Camera {
  zoom: number;
  x: number;
  y: number;
}

function followCamera(cam: Camera, world: World): void {
  let zoom = 1;
  let x = ARENA / 2;
  let y = ARENA / 2;
  const caster = world.cinematic ? world.fighters[world.cinematic.fighter] : null;
  const fallen = world.phase === "ko" ? world.fighters.find((f) => !f.alive) : undefined;
  if (caster) {
    zoom = 1.16;
    x = caster.x;
    y = caster.y;
  } else if (fallen) {
    zoom = 1.2;
    x = fallen.x;
    y = fallen.y;
  }
  if (world.phase === "intro") {
    cam.zoom = 1;
    cam.x = x;
    cam.y = y;
    return;
  }
  cam.zoom += (zoom - cam.zoom) * 0.12;
  cam.x += (x - cam.x) * 0.15;
  cam.y += (y - cam.y) * 0.15;
}

// --- layout pieces -------------------------------------------------------------

/** Top of the frame: flag + name and the HP bar for each side, "VS" and the clock. */
function drawTopPanel(ctx: Ctx, world: World, hpLag: number[], win: number | null): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  drawFighterPanel(ctx, a, hpLag[a.index] ?? 1, 60, "left");
  drawFighterPanel(ctx, b, hpLag[b.index] ?? 1, W - 60, "right");
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 56px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", W / 2, 282, PAPER, 8);
  ctx.font = `700 30px ${MONO_FONT}`;
  // The clock sits above "VS" when the win-chance bar takes its place.
  outlinedText(
    ctx,
    formatTime(world.time),
    W / 2,
    win === null ? 324 : 232,
    "rgba(236,220,180,0.6)",
    5,
  );
  if (win !== null) drawWinBar(ctx, a, b, win);
}

function drawFighterPanel(
  ctx: Ctx,
  f: Fighter,
  lag: number,
  edgeX: number,
  align: "left" | "right",
): void {
  const side = SIDES[f.side];
  const w = 400;
  const x0 = align === "left" ? edgeX : edgeX - w;
  const ratio = clamp(f.hp / f.maxHp, 0, 1);

  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  let nameX = edgeX;
  if (f.def.flag) {
    const fh = 46;
    const fw = fh * FLAG_RATIO;
    ctx.save();
    ctx.translate(align === "left" ? edgeX : edgeX - fw, 182);
    drawFlag(ctx, f.def.flag, fh);
    ctx.restore();
    nameX = align === "left" ? edgeX + fw + 14 : edgeX - fw - 14;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
  }
  fitFont(ctx, f.def.name, 900, 58, w - Math.abs(nameX - edgeX), DISPLAY_FONT);
  outlinedText(ctx, f.def.name, nameX, 224, side.light, 9);

  const y = 250;
  const h = 44;
  roundRect(ctx, x0, y, w, h, 6);
  ctx.fillStyle = "#0f0905";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const fillPart = (r: number, color: string) => {
    ctx.fillStyle = color;
    if (align === "left") ctx.fillRect(x0, y, w * r, h);
    else ctx.fillRect(x0 + w * (1 - r), y, w * r, h);
  };
  fillPart(lag, "rgba(236,220,180,0.6)");
  fillPart(ratio, side.main);
  // A little sheen so the bar looks enamelled rather than flat.
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x0, y + 4, w, h * 0.3);
  ctx.restore();
  roundRect(ctx, x0, y, w, h, 6);
  ctx.strokeStyle = "#b08a4a";
  ctx.lineWidth = 4;
  ctx.stroke();
  if (f.def.growth) {
    // Where the ultimate fires.
    const tx = align === "left" ? x0 + w * ULT_HP : x0 + w * (1 - ULT_HP);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(tx - 4, y - 8, 8, h + 16);
    ctx.fillStyle = GOLD;
    ctx.fillRect(tx - 2, y - 6, 4, h + 12);
  }
}

// --- arena -----------------------------------------------------------------------

function drawArena(
  ctx: Ctx,
  world: World,
  fx: Fx,
  frame: number,
  extras: DrawExtras,
  cam: Camera,
): void {
  ctx.save();
  ctx.translate(AX, AY);
  roundRect(ctx, 0, 0, AS, AS, AR);
  ctx.clip();

  // Everything below lives in world units.
  ctx.save();
  ctx.scale(K, K);
  if (cam.zoom > 1.001) {
    // Zooming about a point inside the map keeps the map covering the whole frame.
    const zx = clamp(cam.x, 0, ARENA);
    const zy = clamp(cam.y, 0, ARENA);
    ctx.translate(zx, zy);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-zx, -zy);
  }
  drawDomain(ctx, world, frame);
  drawDangerZone(ctx, world, frame);
  for (const h of world.hazards) if (h.kind === "zone") drawZone(ctx, h, frame);

  for (const d of fx.trail) {
    const k = d.life / d.max;
    ctx.globalAlpha = 0.32 * k;
    ctx.fillStyle = SIDES[d.side].main;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.radius * (0.55 + 0.45 * k), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const h of world.hazards) {
    switch (h.kind) {
      case "ring":
        drawRing(ctx, h, world);
        break;
      case "pylon":
        drawPylon(ctx, h);
        break;
      case "arc":
        drawArc(ctx, h, frame);
        break;
      case "hook":
        drawHook(ctx, h, world);
        break;
      case "unit":
        drawUnit(ctx, h, world);
        break;
      case "wall":
        drawWall(ctx, h);
        break;
      case "projectile":
        break;
    }
  }

  for (const f of world.fighters) if (f.alive) drawFighter(ctx, f, world);
  // Armies and projectiles go over bodies.
  for (const h of world.hazards) if (h.kind === "strike") drawStrike(ctx, h);
  for (const h of world.hazards) if (h.kind === "sweep") drawSweep(ctx, h, world);
  for (const h of world.hazards) if (h.kind === "projectile") drawProjectile(ctx, h, world.time);

  for (const r of fx.rings) {
    const k = r.life / r.max;
    ctx.globalAlpha = clamp(k, 0, 1);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 4 + 14 * k;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius * (1 - k * k * 0.7), 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const p of fx.particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size / 2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of fx.texts) {
    ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
    ctx.font = `900 ${Math.round(t.size / K)}px ${DISPLAY_FONT}`;
    // Keep callouts fully inside the arena.
    const half = ctx.measureText(t.text).width / 2 + 8;
    const x = half * 2 < ARENA ? clamp(t.x, half, ARENA - half) : ARENA / 2;
    outlinedText(ctx, t.text, x, Math.max(24, t.y), t.color, 8 / K);
  }
  ctx.globalAlpha = 1;
  for (const sl of fx.slashes) {
    const k = clamp(sl.life / sl.max, 0, 1);
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = k;
    ctx.beginPath();
    ctx.moveTo(sl.x1, sl.y1);
    ctx.lineTo(sl.x2, sl.y2);
    ctx.lineWidth = 16 * k + 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 9 * k + 2;
    ctx.strokeStyle = "#fff8e8";
    ctx.stroke();
    ctx.restore();
  }
  drawNight(ctx, world, frame);
  drawSpotlight(ctx, world);
  ctx.restore();

  drawBanner(ctx, world, extras);
  ctx.restore();
  if (world.domain.shattered) drawBrokenBorder(ctx, world);
  else {
    drawMapBorder(ctx);
    if (world.domain.cracked) drawCracks(ctx, world);
  }
}

/** Ink double rule around the map with small diamonds at the corners. */
function drawMapBorder(ctx: Ctx): void {
  roundRect(ctx, AX, AY, AS, AS, AR);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.stroke();
  roundRect(ctx, AX - 9, AY - 9, AS + 18, AS + 18, AR + 6);
  ctx.strokeStyle = "#b08a4a";
  ctx.lineWidth = 3;
  ctx.stroke();
  const inset = 16;
  ctx.strokeStyle = "rgba(43,27,15,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(AX + inset, AY + inset, AS - inset * 2, AS - inset * 2);
  for (const [cx, cy] of [
    [AX + inset, AY + inset],
    [AX + AS - inset, AY + inset],
    [AX + inset, AY + AS - inset],
    [AX + AS - inset, AY + AS - inset],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.lineTo(cx + 11, cy);
    ctx.lineTo(cx, cy + 11);
    ctx.lineTo(cx - 11, cy);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TAU);
    ctx.fillStyle = "#b08a4a";
    ctx.fill();
  }
}

/** The Great Wall: a stretch of stone with crenellations, rising and crumbling away. */
function drawWall(ctx: Ctx, w: WallHazard): void {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const rise = clamp((w.maxTtl - w.ttl) / 0.25, 0, 1);
  const fade = clamp(w.ttl / 0.4, 0, 1);
  const t = w.half * 2 * rise;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(w.x1, w.y1);
  ctx.rotate(Math.atan2(w.y2 - w.y1, w.x2 - w.x1));
  ctx.fillStyle = "rgba(43,27,15,0.25)";
  ctx.fillRect(4, -t / 2 + 6, len, t);
  ctx.fillStyle = "#a99a83";
  ctx.fillRect(0, -t / 2, len, t);
  ctx.strokeStyle = "rgba(43,27,15,0.55)";
  ctx.lineWidth = 1.5;
  for (let x = 0; x < len; x += 22) {
    ctx.beginPath();
    ctx.moveTo(x, -t / 2);
    ctx.lineTo(x, t / 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  // Crenellations along one edge.
  ctx.fillStyle = "#8f8069";
  for (let x = 4; x < len - 10; x += 26) ctx.fillRect(x, -t / 2 - 8 * rise, 13, 8 * rise);
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.strokeRect(0, -t / 2, len, t);
  ctx.restore();
}

/** Night attack: the map goes dark except right around the fighters, with a moon. */
function drawNight(ctx: Ctx, world: World, frame: number): void {
  const k = nightStrength(world.darkness);
  if (k <= 0) return;
  ctx.save();
  // Dark everywhere except the union of the lights around the fighters
  // (one clip per light, so overlapping lights do not cancel out).
  for (const f of world.fighters) {
    if (!f.alive) continue;
    const r = f.radius * (2 + 0.1 * Math.sin(frame * 0.3 + f.index));
    ctx.beginPath();
    ctx.rect(-ARENA, -ARENA, ARENA * 3, ARENA * 3);
    ctx.arc(f.x, f.y, r, 0, TAU, true);
    ctx.clip("evenodd");
  }
  ctx.globalAlpha = 0.84 * k;
  ctx.fillStyle = "#0a0d1c";
  ctx.fillRect(-ARENA, -ARENA, ARENA * 3, ARENA * 3);
  ctx.restore();
  // Crescent moon.
  ctx.save();
  ctx.globalAlpha = k;
  ctx.beginPath();
  ctx.arc(ARENA - 90, 90, 38, 0, TAU);
  ctx.fillStyle = "#f3ead6";
  ctx.fill();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(ARENA - 76, 80, 34, 0, TAU);
  ctx.fillStyle = "#0a0d1c";
  ctx.fill();
  ctx.restore();
}

/** Burning crater (Şahi shell) or a coiled asp waiting on the ground. */
function drawZone(ctx: Ctx, z: ZoneHazard, frame: number): void {
  const fade = clamp(z.ttl / 0.4, 0, 1) * clamp((z.maxTtl - z.ttl) / 0.12, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(z.x, z.y);
  if (z.style === "fire") {
    // Scorched ground…
    const g = ctx.createRadialGradient(0, 0, z.radius * 0.1, 0, 0, z.radius);
    g.addColorStop(0, "rgba(255,170,60,0.75)");
    g.addColorStop(0.55, "rgba(200,70,20,0.45)");
    g.addColorStop(1, "rgba(40,20,10,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, z.radius * 0.92, 0, TAU);
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(60,25,10,0.6)";
    ctx.stroke();
    ctx.setLineDash([]);
    // …and flickering flame tongues.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + noise(i, 3) * 0.6;
      const d = z.radius * (0.25 + 0.5 * noise(i, 7));
      const fh = 18 + 16 * noise(i, Math.floor(frame / 3));
      const fx = Math.cos(a) * d;
      const fy = Math.sin(a) * d;
      ctx.beginPath();
      ctx.moveTo(fx - 8, fy + 6);
      ctx.quadraticCurveTo(fx - 6, fy - fh * 0.5, fx, fy - fh);
      ctx.quadraticCurveTo(fx + 6, fy - fh * 0.5, fx + 8, fy + 6);
      ctx.closePath();
      ctx.fillStyle = i % 2 === 0 ? "#ff8a2a" : GOLD;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(60,25,10,0.7)";
      ctx.stroke();
    }
  } else if (z.style === "stakes") {
    // A little cluster of sharpened stakes.
    for (const [ox, oy, h] of [
      [-10, 6, 40],
      [9, 4, 46],
      [0, 12, 34],
    ] as const) {
      ctx.save();
      ctx.translate(ox, oy);
      ctx.beginPath();
      ctx.moveTo(-5, 0);
      ctx.lineTo(-5, -h * 0.8);
      ctx.lineTo(0, -h);
      ctx.lineTo(5, -h * 0.8);
      ctx.lineTo(5, 0);
      ctx.closePath();
      ctx.fillStyle = "#9b6a3a";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-2.5, -h * 0.86);
      ctx.lineTo(0, -h);
      ctx.lineTo(2.5, -h * 0.86);
      ctx.fillStyle = "#a3221a";
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(0, 10, z.radius, z.radius * 0.35, 0, 0, TAU);
    ctx.fillStyle = "rgba(60,35,15,0.35)";
    ctx.fill();
  } else if (z.style === "banner") {
    // Holy ground around the standard, then the standard itself.
    ctx.beginPath();
    ctx.arc(0, 0, z.radius, 0, TAU);
    ctx.fillStyle = "rgba(242,193,78,0.14)";
    ctx.fill();
    ctx.setLineDash([12, 10]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(176,138,74,0.85)";
    ctx.stroke();
    ctx.setLineDash([]);
    const big = z.radius > 180 ? 1.4 : 1;
    ctx.scale(big, big);
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.lineTo(0, -95);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#5a3b20";
    ctx.stroke();
    const wave = Math.sin(frame * 0.15) * 6;
    ctx.beginPath();
    ctx.moveTo(0, -92);
    ctx.quadraticCurveTo(28, -100 + wave, 62, -88);
    ctx.lineTo(48, -70 + wave * 0.5);
    ctx.lineTo(62, -52);
    ctx.quadraticCurveTo(28, -62 - wave, 0, -56);
    ctx.closePath();
    ctx.fillStyle = "#2a4fa8";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    fleur(ctx, 26, -74, 13, 1.5);
  } else {
    // A coiled asp, head raised.
    const r = z.radius * 1.3;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40;
      const a = t * TAU * 1.6 + frame * 0.04;
      const d = r * (1 - t * 0.75);
      if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
      else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.lineCap = "round";
    ctx.lineWidth = 9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#4fbf3a";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 6, 0, 0, TAU);
    ctx.fillStyle = "#4fbf3a";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

/** Which face a leader pulls right now (most urgent first). */
function moodFor(world: World, f: Fighter): Mood {
  if (!f.alive) return "ko";
  if ((world.phase === "ko" || world.phase === "over") && world.winner === f.index) return "win";
  if (f.stun > 0) return "dizzy";
  if (f.hurt > 0.06) return "ouch";
  if (f.ability?.skillState?.().ult === "active" || world.cinematic?.fighter === f.index) {
    return "furious";
  }
  const ratio = f.hp / f.maxHp;
  if (ratio < ULT_HP) return "scared";
  const foe = world.fighters.find((o) => o.side !== f.side && o.alive);
  if (foe && ratio - foe.hp / foe.maxHp > 0.15) return "smug";
  if (f.speedMul < 0.5) return "focus";
  return "determined";
}

/** Leader's HP on a small parchment tag across the bottom of the ball. */
function hpBadge(ctx: Ctx, hp: string, r: number): void {
  const size = Math.round(r * 0.36);
  ctx.font = `900 ${size}px ${MONO_FONT}`;
  const w = ctx.measureText(hp).width + size * 0.8;
  const h = size * 1.15;
  const y = r * 0.95;
  roundRect(ctx, -w / 2, y - h / 2, w, h, h * 0.3);
  ctx.fillStyle = "#f3e5c0";
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.035);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText(hp, 0, y + size * 0.06);
}

function drawFighter(ctx: Ctx, f: Fighter, world: World): void {
  const time = world.time;
  const side = SIDES[f.side];
  const leader = !!f.def.growth;
  ctx.save();
  ctx.translate(f.x, f.y);

  if (f.def.reach > 0) {
    ctx.save();
    ctx.rotate(weaponAngle(f));
    drawWeapon(
      ctx,
      leader && !hasWeaponImage(f.def.id) ? weaponArt(f.def.id) : f.def.id,
      leader ? f.radius * 0.15 : f.radius * 0.3,
      // Leaders' art is drawn a bit past the hit reach so the weapon reads at phone size.
      f.radius + f.def.reach * (leader ? 1.3 : 1),
      f.def.thickness,
      f.ability?.visualLevel?.() ?? 0,
    );
    ctx.restore();
  }

  // Soft ink shadow on the paper.
  ctx.beginPath();
  ctx.arc(3, 5, f.radius, 0, TAU);
  ctx.fillStyle = "rgba(43,27,15,0.14)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius, 0, TAU);
  ctx.fillStyle = side.main;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = side.dark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius + 2, 0, TAU);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius - 9, 0, TAU);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,240,210,0.35)";
  ctx.stroke();

  if (leader) {
    const portrait = portraitImage(f.def.id);
    if (portrait) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, f.radius - 6, 0, TAU);
      ctx.clip();
      const s = (f.radius - 6) * 2;
      const scale = Math.max(s / portrait.naturalWidth, s / portrait.naturalHeight);
      const w = portrait.naturalWidth * scale;
      const h = portrait.naturalHeight * scale;
      ctx.drawImage(portrait, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  if (f.poison > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, TAU);
    ctx.fillStyle = `rgba(110,230,90,${0.22 + 0.12 * Math.sin(time * 12)})`;
    ctx.fill();
  }

  if (f.hurt > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${clamp((f.hurt / 0.18) * 0.85, 0, 0.85)})`;
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const hp = String(Math.max(0, Math.ceil(f.hp)));
  if (leader) {
    const foe = world.fighters.find((o) => o.side !== f.side);
    drawFace(
      ctx,
      f.def.id,
      f.radius,
      moodFor(world, f),
      foe ? foe.x - f.x : 0,
      foe ? foe.y - f.y : 0,
      world.time + world.phaseTime * (world.phase === "fight" ? 0 : 1),
      f.index,
    );
    hpBadge(ctx, hp, f.radius);
  } else {
    ctx.font = `900 ${Math.round(f.radius * 0.48)}px ${MONO_FONT}`;
    outlinedText(ctx, hp, 0, 2, "#fff8e8", 4);
  }

  if (leader) drawHeadgear(ctx, f.def.id, f.radius);

  if (f.whirl > 0) {
    // Scimitars spinning around Saladin, out to where the cuts actually land.
    const ring = f.whirl - 12;
    for (let k = 0; k < 3; k++) {
      const a = time * 14 + (k / 3) * TAU;
      ctx.save();
      ctx.rotate(a);
      ctx.translate(ring - 10, 0);
      ctx.beginPath();
      ctx.moveTo(-6, 22);
      ctx.quadraticCurveTo(10, 0, 2, -30);
      ctx.quadraticCurveTo(-6, 0, -12, 20);
      ctx.closePath();
      ctx.fillStyle = "#e8ecf2";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, ring, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(232,236,242,0.45)";
    ctx.stroke();
  }

  if (f.shielded) {
    ctx.beginPath();
    ctx.arc(0, 0, f.radius + 11, 0, TAU);
    ctx.fillStyle = "rgba(255,212,94,0.14)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = `rgba(255,212,94,${0.75 + 0.25 * Math.sin(time * 18)})`;
    ctx.stroke();
  }

  if (f.stun > 0) {
    for (let i = 0; i < 3; i++) {
      const a = time * 6 + (i / 3) * TAU;
      const sy = leader ? -f.radius * 1.65 : -f.radius - 10;
      star(ctx, Math.cos(a) * f.radius * 0.7, sy + Math.sin(a) * 8, 9, GOLD);
    }
  }

  ctx.restore();
}

function drawUnit(ctx: Ctx, u: UnitHazard, world: World): void {
  const side = SIDES[world.fighters[u.owner]?.side ?? 0];
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.globalAlpha = clamp(u.ttl / 0.4, 0, 1);
  ctx.beginPath();
  ctx.arc(0, 0, u.radius, 0, TAU);
  const clay = u.style === "terracotta";
  ctx.fillStyle = u.style === "elephant" ? "#5b6170" : clay ? "#b8693f" : side.main;
  ctx.fill();
  ctx.lineWidth = u.style === "elephant" || clay ? 4 : 2.5;
  ctx.strokeStyle = u.style === "elephant" || clay ? side.main : side.dark;
  ctx.stroke();

  if (clay) {
    // Terracotta soldier: topknot, armour plates, a calm clay face.
    const r = u.radius;
    ctx.beginPath();
    ctx.arc(r * 0.3, -r * 0.85, r * 0.28, 0, TAU);
    ctx.fillStyle = "#9c5531";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.strokeStyle = "rgba(30,19,11,0.55)";
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, r * (0.2 + k * 0.22));
      ctx.lineTo(r * 0.6, r * (0.2 + k * 0.22));
      ctx.stroke();
    }
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(-r * 0.36, -r * 0.18, r * 0.2, r * 0.08);
    ctx.fillRect(r * 0.16, -r * 0.18, r * 0.2, r * 0.08);
  } else if (u.style === "impi") {
    // Zulu warrior: cowhide shield and a short spear.
    const r = u.radius;
    const a = Math.atan2(u.vy, u.vx);
    ctx.save();
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, r * 0.9);
    ctx.lineTo(r * 1.5, -r * 0.2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#6b4a2a";
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, 0, r * 0.45, r * 0.8, 0, 0, TAU);
    ctx.fillStyle = "#f3ead6";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, -r * 0.25, r * 0.18, r * 0.14, 0.4, 0, TAU);
    ctx.ellipse(-r * 0.05, r * 0.3, r * 0.2, r * 0.15, 0.4, 0, TAU);
    ctx.fillStyle = "#2a1a10";
    ctx.fill();
  } else if (u.style === "elephant") {
    if (u.vx < 0) ctx.scale(-1, 1);
    drawEmblem(ctx, "hannibal", u.radius * 0.8);
  } else if (u.style === "guard") {
    // Grenadier of the Imperial Guard: white cross-belts and a tall bearskin.
    ctx.strokeStyle = PAPER;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-u.radius * 0.6, -u.radius * 0.5);
    ctx.lineTo(u.radius * 0.6, u.radius * 0.6);
    ctx.moveTo(u.radius * 0.6, -u.radius * 0.5);
    ctx.lineTo(-u.radius * 0.6, u.radius * 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -u.radius * 1.05, u.radius * 0.55, u.radius * 0.7, 0, 0, TAU);
    ctx.fillStyle = "#14161c";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u.radius * 0.35, -u.radius * 1.35, u.radius * 0.14, 0, TAU);
    ctx.fillStyle = "#e0453a";
    ctx.fill();
  } else {
    // Legionary: red scutum with a gold boss.
    ctx.beginPath();
    roundRectPath(ctx, -u.radius * 0.45, -u.radius * 0.6, u.radius * 0.9, u.radius * 1.2, 4);
    ctx.fillStyle = "#b8322b";
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, u.radius * 0.2, 0, TAU);
    ctx.fillStyle = GOLD;
    ctx.fill();
  }

  if (u.hurt > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, u.radius, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${clamp(u.hurt / 0.15, 0, 0.8)})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawProjectile(ctx: Ctx, p: ProjectileHazard, time: number): void {
  const a = Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(a);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (p.style) {
    case "arrow": {
      ctx.scale(p.radius / 7, p.radius / 7);
      ctx.beginPath();
      ctx.moveTo(-34, 0);
      ctx.lineTo(8, 0);
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#e8d8b0";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(4, -8);
      ctx.lineTo(4, 8);
      ctx.closePath();
      ctx.fillStyle = "#dfe4ee";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-36, -8);
      ctx.lineTo(-26, 0);
      ctx.lineTo(-36, 8);
      ctx.fillStyle = "#e05a4a";
      ctx.fill();
      break;
    }
    case "ball":
    case "bombard": {
      const big = p.style === "bombard";
      // smoke trail
      ctx.fillStyle = "rgba(70,55,40,0.22)";
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(-i * p.radius * 1.1, 0, p.radius * (1 - i * 0.22), 0, TAU);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fillStyle = big ? "#3a3530" : "#2a2d36";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = big ? "#ff9a3c" : "#c9ced8";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-p.radius * 0.3, -p.radius * 0.3, p.radius * 0.3, 0, TAU);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fill();
      break;
    }
    case "musket": {
      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(0, 0);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(60,40,20,0.55)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.8, 0, TAU);
      ctx.fillStyle = "#2a2d36";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = GOLD;
      ctx.stroke();
      break;
    }
    case "axe": {
      // Spinning bearded axe.
      ctx.rotate(time * 22);
      ctx.scale(p.radius / 16, p.radius / 16);
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(16, 0);
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#8a5a32";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(8, -3);
      ctx.quadraticCurveTo(14, -20, 26, -16);
      ctx.quadraticCurveTo(22, -2, 26, 12);
      ctx.quadraticCurveTo(14, 8, 8, 3);
      ctx.closePath();
      ctx.fillStyle = "#c9cdd4";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      break;
    }
    case "asp": {
      ctx.scale(p.radius / 12, p.radius / 12);
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = -i * 4;
        const y = Math.sin(time * 22 + i * 0.8) * 6 * (i / 12);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 9;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#6ee65a";
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(4, 0, 11, 8, 0, 0, TAU);
      ctx.fillStyle = "#6ee65a";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawSweep(ctx: Ctx, s: SweepHazard, world: World): void {
  const side = SIDES[world.fighters[s.owner]?.side ?? 0];
  const px = -s.dy;
  const py = s.dx;
  for (const o of s.items) {
    ctx.save();
    ctx.translate(s.x + px * o, s.y + py * o);
    // Elephants face where they run (mirrored instead of upside down when going left).
    if (s.dx < 0) ctx.scale(-1, 1);
    else if (s.dy !== 0) ctx.rotate(s.dy > 0 ? Math.PI / 2 : -Math.PI / 2);
    const r = s.itemHalf * 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = s.style === "elephant" ? "#5b6170" : side.main;
    ctx.fill();
    ctx.lineWidth = s.style === "elephant" ? 7 : 5;
    ctx.strokeStyle = s.style === "elephant" ? side.main : side.dark;
    ctx.stroke();
    if (s.style === "elephant") {
      drawEmblem(ctx, "hannibal", s.itemHalf * 0.85);
    } else if (s.style === "knight") {
      // Crusader knight: lance forward, white surcoat with a red cross, great helm.
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, r * 0.3);
      ctx.lineTo(r * 2, r * 0.3);
      ctx.lineWidth = 5;
      ctx.strokeStyle = "#6b4a2a";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, TAU);
      ctx.fillStyle = "#f3ead6";
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.fillStyle = "#c8202a";
      ctx.fillRect(-r * 0.1, -r * 0.5, r * 0.2, r * 1);
      ctx.fillRect(-r * 0.45, -r * 0.1, r * 0.9, r * 0.2);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.45, r * 0.8, 0, 0, TAU);
      ctx.fillStyle = "#f3ead6";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(-r * 0.05, -r * 0.25, r * 0.18, r * 0.14, 0.4, 0, TAU);
      ctx.ellipse(r * 0.08, r * 0.3, r * 0.2, r * 0.15, 0.4, 0, TAU);
      ctx.fillStyle = "#2a1a10";
      ctx.fill();
    }
    ctx.restore();
  }
}

/** Marked spot before it blows: a shrinking target ring, or an arrow falling onto its shadow. */
function drawStrike(ctx: Ctx, s: StrikeHazard): void {
  const p = clamp(s.t / s.delay, 0, 1);
  ctx.save();
  if (s.style === "shell") {
    ctx.globalAlpha = 0.25 + 0.35 * p;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, TAU);
    ctx.fillStyle = "rgba(255,70,50,0.35)";
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#ff5a3c";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * (1 - p), 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    // the ball dropping in
    const h = (1 - p) * 260;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y - h, 10 + s.radius * 0.12, 0, TAU);
    ctx.fillStyle = "#2a2d36";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ff9a3c";
    ctx.stroke();
  } else {
    ctx.globalAlpha = 0.35 + 0.4 * p;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, 10 + 8 * p, 5 + 4 * p, 0, 0, TAU);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fill();
    const h = (1 - p) * 220;
    ctx.globalAlpha = 1;
    ctx.translate(s.x, s.y - h);
    ctx.rotate(Math.PI / 2);
    ctx.scale(1.7, 1.7);
    ctx.beginPath();
    ctx.moveTo(-34, 0);
    ctx.lineTo(8, 0);
    ctx.lineWidth = 5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#e8d8b0";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(4, -8);
    ctx.lineTo(4, 8);
    ctx.closePath();
    ctx.fillStyle = "#dfe4ee";
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: Ctx, x: number, y: number, r: number, color: string): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function drawRing(ctx: Ctx, h: RingHazard, world: World): void {
  const side = SIDES[world.fighters[h.owner]?.side ?? 0];
  const p = clamp(h.radius / h.maxRadius, 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(1 - p * 0.85, 0.1, 1);
  ctx.shadowColor = side.light;
  ctx.shadowBlur = 26;
  ctx.strokeStyle = side.light;
  ctx.lineWidth = 8 + 22 * (1 - p);
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.radius, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha *= 0.5;
  ctx.fillStyle = side.main;
  ctx.fill();
  ctx.restore();
}

function drawPylon(ctx: Ctx, h: PylonHazard): void {
  const r = 12 + Math.sin(h.age * 8) * 2;
  ctx.save();
  ctx.shadowColor = "#8cc8ff";
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, 0, TAU);
  ctx.fillStyle = "#8cc8ff";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

function drawArc(ctx: Ctx, h: ArcHazard, frame: number): void {
  ctx.save();
  ctx.globalAlpha = clamp((h.ttl / h.maxTtl) * 1.5, 0, 1);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = 0; i + 1 < h.points.length; i++) {
    const p0 = h.points[i];
    const p1 = h.points[i + 1];
    if (!p0 || !p1) continue;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(4, Math.round(len / 40));
    ctx.moveTo(p0.x, p0.y);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const jitter = s === steps ? 0 : (noise(i * 31 + s, frame) * 2 - 1) * 20;
      ctx.lineTo(p0.x + dx * t + nx * jitter, p0.y + dy * t + ny * jitter);
    }
  }
  ctx.shadowColor = "#7cc0ff";
  ctx.shadowBlur = 20;
  ctx.strokeStyle = "rgba(124,192,255,0.5)";
  ctx.lineWidth = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#9ed0ff";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();
}

function drawHook(ctx: Ctx, h: HookHazard, world: World): void {
  const owner = world.fighters[h.owner];
  if (!owner) return;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(owner.x, owner.y);
  ctx.lineTo(h.x, h.y);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 11;
  ctx.stroke();
  ctx.strokeStyle = "#e3dcc8";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(h.x, h.y, 14, 0, TAU);
  ctx.fillStyle = h.attached >= 0 ? GOLD : "#e3dcc8";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function drawBanner(ctx: Ctx, world: World, extras: DrawExtras = {}): void {
  let text = "";
  let color = PAPER;
  let size = 120;
  let t = world.phaseTime;
  let alpha = 1;

  const leaders = world.fighters.some((f) => f.def.growth);
  if (world.cinematic) {
    drawUltimateBanner(ctx, world);
    return;
  }
  if (world.phase === "fight" && drawDomainTitle(ctx, world)) return;
  if (
    leaders &&
    (world.phase === "intro" || (world.phase === "fight" && world.phaseTime < WHO_WINS_TIME))
  ) {
    if (!(world.phase === "fight" && levelBanner(world))) {
      drawWhoWins(ctx, world.phase === "intro" ? 0 : world.phaseTime);
      return;
    }
  }

  switch (world.phase) {
    case "intro":
      drawMatchCard(ctx, world);
      return;
    case "fight": {
      const lv = levelBanner(world);
      if (lv) {
        text = `LEVEL ${lv.level}`;
        size = 150;
        color = GOLD;
        t = lv.t;
        alpha = 1 - clamp((lv.t - 0.8) / 0.4, 0, 1);
        break;
      }
      if (world.phaseTime >= 0.7) return;
      text = "FIGHT!";
      size = 180;
      color = GOLD;
      alpha = 1 - clamp((world.phaseTime - 0.4) / 0.3, 0, 1);
      break;
    }
    case "ko":
      text = world.fighters.some((f) => !f.alive) ? "K.O." : "TIME UP";
      size = 200;
      color = "#ff5a5a";
      break;
    case "over": {
      const winner = world.fighters[world.winner];
      if (!winner) return;
      if (leaders && world.phaseTime >= WINS_TIME) {
        drawNextCard(ctx, world.phaseTime - WINS_TIME, extras.next ?? null);
        return;
      }
      text = `${winner.def.name} WINS`;
      size = 108;
      color = SIDES[winner.side].main;
      t += 0.5;
      const loser = world.fighters.find((f) => f.index !== winner.index);
      const chance = leaders && loser ? winChance(winner.def.id, loser.def.id) : null;
      if (chance !== null && chance < UPSET_CHANCE) drawUpset(ctx, t, chance);
      break;
    }
  }

  const s = easeOutBack(clamp(t / 0.25, 0, 1));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(AS / 2, AS / 2);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitFont(ctx, text, 800, size, AS - 60, DISPLAY_FONT);
  outlinedText(ctx, text, 0, 0, color, 16);
  ctx.restore();
}

/** History mode: "WHO WINS?" sits over the first seconds of the fight instead of an intro card. */
const WHO_WINS_TIME = 2.4;

function drawWhoWins(ctx: Ctx, t: number): void {
  const s = easeOutBack(clamp(t / 0.2 + 0.3, 0, 1));
  ctx.save();
  ctx.globalAlpha = 1 - clamp((t - (WHO_WINS_TIME - 0.4)) / 0.4, 0, 1);
  ctx.translate(AS / 2, AS * 0.13);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 112px ${DISPLAY_FONT}`;
  outlinedText(ctx, "WHO WINS?", 0, 0, GOLD, 14);
  ctx.font = `800 40px ${DISPLAY_FONT}`;
  outlinedText(ctx, "COMMENT YOUR PICK", 0, 78, PAPER, 9);
  ctx.restore();
}

/** "UPSET!" stamped above the winner's name when the underdog won. */
function drawUpset(ctx: Ctx, t: number, chance: number): void {
  const k = easeOutBack(clamp((t - 0.6) / 0.25, 0, 1));
  if (k <= 0) return;
  ctx.save();
  ctx.translate(AS / 2, AS / 2 - 230);
  ctx.rotate(-0.06);
  ctx.scale(k, k);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 130px ${DISPLAY_FONT}`;
  outlinedText(ctx, "UPSET!", 0, 0, "#ff6a3c", 16);
  ctx.font = `800 40px ${DISPLAY_FONT}`;
  outlinedText(ctx, `ONLY ${Math.round(chance * 100)}% TO WIN`, 0, 96, PAPER, 9);
  ctx.restore();
}

function leaderCard(ctx: Ctx, f: Fighter, y: number): void {
  cardName(ctx, f, y);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (f.def.title) {
    fitFont(ctx, f.def.title, 700, 44, AS - 100, DISPLAY_FONT);
    outlinedText(ctx, f.def.title, 0, y + 78, SIDES[f.side].light, 8);
  }
}

/** Ultimate intro: dark arena with a spotlight on the caster. */
function drawSpotlight(ctx: Ctx, world: World): void {
  const c = world.cinematic;
  const f = c ? world.fighters[c.fighter] : null;
  if (!c || !f) return;
  const p = clamp(c.t / ULT_CINEMATIC, 0, 1);
  ctx.save();
  ctx.globalAlpha = 0.7 * clamp(p * 5, 0, 1);
  ctx.beginPath();
  ctx.rect(0, 0, ARENA, ARENA);
  ctx.arc(f.x, f.y, f.radius * 2, 0, TAU, true);
  ctx.fillStyle = "#000000";
  ctx.fill("evenodd");
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(f.x, f.y, f.radius * 2, 0, TAU);
  ctx.lineWidth = 6;
  ctx.strokeStyle = GOLD;
  ctx.stroke();
  ctx.restore();
}

/** "ULTIMATE" + the move's name, huge, while the world is in slow motion. */
function drawUltimateBanner(ctx: Ctx, world: World): void {
  const c = world.cinematic;
  const f = c ? world.fighters[c.fighter] : null;
  if (!c || !f) return;
  const p = clamp(c.t / ULT_CINEMATIC, 0, 1);
  const s = easeOutBack(clamp(p * 4, 0, 1));
  // Keep the text away from the caster: top half unless they are up there.
  const y = f.y * K < AS / 2 ? AS * 0.7 : AS * 0.28;
  ctx.save();
  ctx.translate(AS / 2, y);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 40px ${DISPLAY_FONT}`;
  outlinedText(ctx, c.kind === "domain" ? "DOMAIN EXPANSION" : "ULTIMATE", 0, -48, GOLD, 10);
  fitFont(ctx, c.name, 800, 88, AS - 120, DISPLAY_FONT);
  outlinedText(ctx, c.name, 0, 20, SIDES[f.side].bright, 14);
  ctx.restore();
}

/** Seconds the "X WINS" banner shows before the "who's next?" card (history mode). */
const WINS_TIME = 1.1;

/** End card: "WHO'S NEXT?" with two mystery balls (or the chosen next leaders). */
function drawNextCard(ctx: Ctx, t: number, next: readonly [FighterDef, FighterDef] | null): void {
  const a = clamp(t / 0.25, 0, 1);
  const s = easeOutBack(a);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(29,18,10,0.86)";
  ctx.fillRect(0, 0, AS, AS);
  ctx.translate(AS / 2, 0);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 96px ${DISPLAY_FONT}`;
  outlinedText(ctx, "WHO'S NEXT?", 0, 170, GOLD, 14);

  const r = 120;
  const y = 460;
  const colors = next ? matchColors(next[0].id, next[1].id) : SIDES;
  ([-1, 1] as const).forEach((dir, i) => {
    const side = colors[i === 0 ? 0 : 1];
    const def = next?.[i] ?? null;
    const x = dir * 230;
    // Gentle bob so the card does not look frozen.
    const by = y + Math.sin(t * 4 + i * 1.7) * 8;
    ctx.beginPath();
    ctx.arc(x, by, r, 0, TAU);
    ctx.fillStyle = side.main;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = side.dark;
    ctx.stroke();
    if (def) {
      ctx.save();
      ctx.translate(x, by);
      drawFace(ctx, def.id, r, "determined", -dir, 0, t, i);
      drawHeadgear(ctx, def.id, r);
      ctx.restore();
      fitFont(ctx, def.name, 800, 50, 400, DISPLAY_FONT);
      outlinedText(ctx, def.name, x, by + r + 50, side.light, 9);
    } else {
      ctx.font = `800 150px ${DISPLAY_FONT}`;
      outlinedText(ctx, "?", x, by + 8, "#ffffff", 14);
    }
  });
  ctx.font = `800 80px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", 0, y, PAPER, 12);

  ctx.font = `800 58px ${DISPLAY_FONT}`;
  outlinedText(ctx, "COMMENT BELOW", 0, 760, PAPER, 10);
  // Bouncing arrow pointing down at the comments.
  const ay = 830 + Math.abs(Math.sin(t * 5)) * 18;
  ctx.beginPath();
  ctx.moveTo(-34, ay);
  ctx.lineTo(34, ay);
  ctx.lineTo(0, ay + 44);
  ctx.closePath();
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.restore();
}

/** Frenzy: everything outside the shrunken walls turns into a red danger zone. */
function drawDangerZone(ctx: Ctx, world: World, frame: number): void {
  if (world.lo <= 0.5) return;
  const lo = world.lo;
  const hi = world.hi;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ARENA, ARENA);
  ctx.rect(lo, lo, hi - lo, hi - lo);
  ctx.fillStyle = "rgba(170,20,30,0.45)";
  ctx.fill("evenodd");
  // Warning stripes along the danger zone.
  ctx.save();
  ctx.clip("evenodd");
  ctx.strokeStyle = "rgba(255,90,60,0.25)";
  ctx.lineWidth = 14;
  const shift = (frame * 2) % 60;
  for (let x = -ARENA; x < ARENA * 2; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + shift, 0);
    ctx.lineTo(x + shift + ARENA, ARENA);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.rect(lo, lo, hi - lo, hi - lo);
  ctx.lineWidth = 8;
  ctx.strokeStyle = `rgba(255,${120 + 60 * Math.sin(frame * 0.4)},60,0.95)`;
  ctx.stroke();
  ctx.restore();
}

/**
 * History mode: a small tab on the arena's top edge — "CLOSE CALLS" with 5 dots, or
 * the frenzy countdown while the arena is shrunk.
 */
function drawCloseCalls(ctx: Ctx, world: World): void {
  if (!world.closeCallsEnabled || world.phase === "intro") return;
  const w = 350;
  const h = 48;
  const x = W / 2 - w / 2;
  const y = AY - h / 2;
  const frenzy = world.frenzy > 0;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = frenzy ? "#8e1a14" : "#efe0bb";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.textBaseline = "middle";
  if (frenzy) {
    ctx.textAlign = "center";
    ctx.font = `900 28px ${DISPLAY_FONT}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(`SHRINK  ${world.frenzy.toFixed(1)}s`, W / 2, y + h / 2 + 1);
    return;
  }
  ctx.textAlign = "left";
  ctx.font = `900 24px ${DISPLAY_FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText("CLOSE CALLS", x + 26, y + h / 2 + 1);
  for (let i = 0; i < CLOSE_CALLS_FOR_FRENZY; i++) {
    const cx = x + 252 + i * 30;
    ctx.beginPath();
    ctx.arc(cx, y + h / 2, 10, 0, TAU);
    ctx.fillStyle = i < world.closeCalls ? "#a3221a" : "rgba(43,27,15,0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/** "LEVEL 2" banner for 1.2 s after each level-up time (history mode only). */
function levelBanner(world: World): { level: number; t: number } | null {
  if (!world.fighters.some((f) => f.def.growth)) return null;
  for (let i = 0; i < LEVEL_TIMES.length; i++) {
    // At 15 s the Domain Expansion takes the stage instead.
    if (i === 0 && world.domainsEnabled) continue;
    const t = world.time - (LEVEL_TIMES[i] ?? 0);
    if (t >= 0 && t < 1.2) return { level: i + 2, t };
  }
  return null;
}

/** Intro: both names (with flags) in their team colours and "VS" between them. */
function drawMatchCard(ctx: Ctx, world: World): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  const s = easeOutBack(clamp(world.phaseTime / 0.25, 0, 1));
  ctx.save();
  ctx.translate(AS / 2, AS / 2);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  cardName(ctx, a, -150);
  ctx.textAlign = "center";
  ctx.font = `800 96px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", 0, 0, PAPER, 14);
  cardName(ctx, b, 150);
  ctx.restore();
}

function cardName(ctx: Ctx, f: Fighter, y: number): void {
  const fh = 76;
  const fw = f.def.flag ? fh * FLAG_RATIO + 26 : 0;
  fitFont(ctx, f.def.name, 800, 120, AS - 80 - fw, DISPLAY_FONT);
  const total = fw + ctx.measureText(f.def.name).width;
  const x = -total / 2;
  if (f.def.flag) {
    ctx.save();
    ctx.translate(x, y - fh / 2);
    drawFlag(ctx, f.def.flag, fh);
    ctx.restore();
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  outlinedText(ctx, f.def.name, x + fw, y, SIDES[f.side].bright, 16);
}

// --- overlay ---------------------------------------------------------------------

function drawOverlay(ctx: Ctx, fx: Fx, overlay: HTMLCanvasElement): void {
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,246,222,${clamp(fx.flash * 0.4, 0, 0.4)})`;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.drawImage(overlay, 0, 0, W, H);
}

function layer(quality: number): { canvas: HTMLCanvasElement; g: Ctx | null } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * quality);
  canvas.height = Math.round(H * quality);
  const g = canvas.getContext("2d");
  g?.setTransform(quality, 0, 0, quality, 0, 0);
  return { canvas, g };
}

/**
 * Leather around the page and the arena as an old sea chart: parchment with stains and
 * burnt edges, a lat/long grid, rhumb lines and a faded compass rose. Drawn once.
 */
function buildBackground(quality: number): HTMLCanvasElement {
  const { canvas, g: ctx } = layer(quality);
  if (!ctx) return canvas;

  // Leather.
  const lg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.1, W / 2, H * 0.45, H * 0.75);
  lg.addColorStop(0, "#4a2e1a");
  lg.addColorStop(1, "#160d07");
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) {
    const x = noise(i, 1) * W;
    const y = noise(i, 2) * H;
    ctx.fillStyle = noise(i, 3) < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,220,170,0.04)";
    ctx.fillRect(x, y, 2, 2);
  }
  // Gilt rule like a book cover.
  ctx.strokeStyle = "rgba(176,138,74,0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(32, 32, W - 64, H - 64);

  // The map sheet.
  ctx.save();
  ctx.translate(AX, AY);
  roundRect(ctx, 0, 0, AS, AS, AR);
  ctx.clip();
  const pg = ctx.createLinearGradient(0, 0, AS, AS);
  pg.addColorStop(0, "#f0e1bb");
  pg.addColorStop(1, PAPER);
  ctx.fillStyle = pg;
  ctx.fillRect(0, 0, AS, AS);
  // Stains.
  for (let i = 0; i < 18; i++) {
    const x = noise(i, 11) * AS;
    const y = noise(i, 12) * AS;
    const r = 40 + noise(i, 13) * 150;
    const st = ctx.createRadialGradient(x, y, 0, x, y, r);
    st.addColorStop(0, `rgba(150,105,45,${0.05 + noise(i, 14) * 0.09})`);
    st.addColorStop(0.8, "rgba(150,105,45,0.03)");
    st.addColorStop(1, "rgba(150,105,45,0)");
    ctx.fillStyle = st;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Fibres.
  ctx.strokeStyle = "rgba(110,75,35,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 700; i++) {
    const x = noise(i, 21) * AS;
    const y = noise(i, 22) * AS;
    const a = noise(i, 23) * TAU;
    const l = 4 + noise(i, 24) * 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  // Lat/long grid.
  ctx.strokeStyle = "rgba(90,60,25,0.16)";
  ctx.lineWidth = 1.5;
  for (let p = 120; p < AS; p += 120) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, AS);
    ctx.moveTo(0, p);
    ctx.lineTo(AS, p);
    ctx.stroke();
  }
  // Rhumb lines and the compass rose.
  const cx = AS / 2;
  const cy = AS / 2;
  ctx.strokeStyle = "rgba(90,60,25,0.1)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * AS, cy + Math.sin(a) * AS);
    ctx.stroke();
  }
  drawCompass(ctx, cx, cy, 190);
  // Burnt, darker edges.
  const burn = ctx.createRadialGradient(cx, cy, AS * 0.35, cx, cy, AS * 0.75);
  burn.addColorStop(0, "rgba(110,70,25,0)");
  burn.addColorStop(1, "rgba(110,70,25,0.42)");
  ctx.fillStyle = burn;
  ctx.fillRect(0, 0, AS, AS);
  ctx.restore();

  return canvas;
}

/** Faded eight-point compass rose. */
function drawCompass(ctx: Ctx, x: number, y: number, r: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const len = i % 2 === 0 ? r : r * 0.6;
    const w = i % 2 === 0 ? r * 0.13 : r * 0.09;
    for (const half of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + (half * Math.PI) / 2) * w, Math.sin(a + (half * Math.PI) / 2) * w);
      ctx.closePath();
      ctx.fillStyle = half < 0 ? INK : PAPER_DARK;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.font = `900 ${Math.round(r * 0.22)}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText("N", 0, -r - r * 0.16);
  ctx.restore();
}

/** Warm vignette on top of everything (no TV scanlines: this is a printed page). */
function buildOverlay(quality: number): HTMLCanvasElement {
  const { canvas, g: ctx } = layer(quality);
  if (!ctx) return canvas;
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.8);
  vignette.addColorStop(0, "rgba(20,10,4,0)");
  vignette.addColorStop(1, "rgba(20,10,4,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

// --- helpers ---------------------------------------------------------------------

/** Sets the largest font (up to `size`) at which `text` fits in `maxWidth`. */
function fitFont(
  ctx: Ctx,
  text: string,
  weight: number,
  size: number,
  maxWidth: number,
  family: string,
): void {
  ctx.font = `${weight} ${size}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxWidth) ctx.font = `${weight} ${Math.floor((size * maxWidth) / w)}px ${family}`;
}

const twoLineCache = new Map<string, { size: number; lines: string[] }>();

/** Largest font size (30 down to 20) at which `text` fits in two lines; cached per text. */
function fitTwoLines(ctx: Ctx, text: string, maxWidth: number): { size: number; lines: string[] } {
  const key = `${fontsVersion()}|${maxWidth}|${text}`;
  const hit = twoLineCache.get(key);
  if (hit) return hit;
  let size = 32;
  let lines: string[] = [];
  for (; size >= 20; size -= 2) {
    ctx.font = `600 ${size}px ${BODY_FONT}`;
    lines = wrapLines(ctx, text, maxWidth);
    if (lines.length <= 2) break;
  }
  const result = { size: Math.max(size, 20), lines: lines.slice(0, 2) };
  twoLineCache.set(key, result);
  return result;
}

/** Splits text into lines no wider than `maxWidth` with the current font. */
function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Ink outline around text, as a share of the width each call asks for: thin, like print. */
const TEXT_OUTLINE = 0.55;

function outlinedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  fill: string,
  lw: number,
): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2, lw * TEXT_OUTLINE);
  ctx.strokeStyle = OUTLINE;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Cheap deterministic pseudo-noise in [0, 1). */
function noise(a: number, b: number): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

// --- Domain Expansion -------------------------------------------------------------

/** The domains themselves: one spreading, two clashing, or the winner's everywhere. */
function drawDomain(ctx: Ctx, world: World, frame: number): void {
  const d = world.domain;
  if (d.phase === "none") return;
  const first = world.fighters[d.first];
  const layer = (f: Fighter) => domainLayer(f.def.id, AS, 1);
  ctx.save();
  if (d.phase === "expanding" && first) {
    // Grows out of the caster.
    const r = ARENA * 0.85 * (1 - (1 - clamp(d.t / 1.2, 0, 1)) ** 3);
    ctx.save();
    ctx.beginPath();
    ctx.arc(first.x, first.y, r, 0, TAU);
    ctx.clip();
    ctx.drawImage(layer(first), 0, 0, ARENA, ARENA);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(first.x, first.y, r, 0, TAU);
    ctx.lineWidth = 8;
    ctx.strokeStyle = SIDES[first.side].bright;
    ctx.stroke();
  } else if (d.phase === "clash") {
    const second = world.fighters[d.second];
    if (first && second) {
      // A wavering seam, pushed toward whoever is losing the clash.
      const shift = d.push * ARENA * 0.3;
      const px = d.midX + d.axisX * shift;
      const py = d.midY + d.axisY * shift;
      const nx = -d.axisY;
      const ny = d.axisX;
      const seam: [number, number][] = [];
      for (let i = -12; i <= 12; i++) {
        const along = (i / 12) * ARENA * 1.5;
        const wob = (noise(i, Math.floor(frame / 2)) - 0.5) * 34;
        seam.push([px + nx * along + d.axisX * wob, py + ny * along + d.axisY * wob]);
      }
      const half = (dir: number) => {
        ctx.beginPath();
        seam.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        const far = ARENA * 3 * dir;
        const last = seam[seam.length - 1] ?? [0, 0];
        const firstPt = seam[0] ?? [0, 0];
        ctx.lineTo(last[0] + d.axisX * far, last[1] + d.axisY * far);
        ctx.lineTo(firstPt[0] + d.axisX * far, firstPt[1] + d.axisY * far);
        ctx.closePath();
      };
      ctx.save();
      half(-1);
      ctx.clip();
      ctx.drawImage(layer(first), 0, 0, ARENA, ARENA);
      ctx.restore();
      ctx.save();
      half(1);
      ctx.clip();
      ctx.drawImage(layer(second), 0, 0, ARENA, ARENA);
      ctx.restore();
      // The seam crackles with both colours.
      ctx.beginPath();
      seam.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.lineWidth = 18;
      ctx.strokeStyle = "rgba(255,246,222,0.55)";
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.strokeStyle = frame % 6 < 3 ? SIDES[first.side].bright : SIDES[second.side].bright;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    }
  } else if (d.phase === "owned") {
    const owner = world.fighters[d.owner];
    const loser = world.fighters[d.owner === d.first ? d.second : d.first];
    if (owner) {
      const k = clamp(d.t / 0.7, 0, 1);
      if (k < 1 && loser && d.second >= 0) ctx.drawImage(layer(loser), 0, 0, ARENA, ARENA);
      ctx.save();
      if (k < 1) {
        ctx.beginPath();
        ctx.arc(owner.x, owner.y, ARENA * 1.5 * (1 - (1 - k) ** 2), 0, TAU);
        ctx.clip();
      }
      ctx.drawImage(layer(owner), 0, 0, ARENA, ARENA);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Cracks spreading in from the map's ink border (first Domain Expansion). */
function drawCracks(ctx: Ctx, world: World): void {
  const d = world.domain;
  const grow = d.phase === "expanding" ? clamp(d.t / 0.5, 0, 1) : 1;
  const more = d.phase === "clash" ? clamp(d.t / DOMAIN_CLASH_TIME, 0, 1) : 0;
  const count = 10 + Math.round(more * 8);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < count; i++) {
    const edge = i % 4;
    const at = 0.1 + 0.8 * noise(i, 7);
    const len = (60 + 110 * noise(i, 8)) * grow * (1 + more * 0.6);
    let x = AX + (edge === 1 ? AS : edge === 3 ? 0 : at * AS);
    let y = AY + (edge === 2 ? AS : edge === 0 ? 0 : at * AS);
    const inX = edge === 1 ? -1 : edge === 3 ? 1 : 0;
    const inY = edge === 2 ? -1 : edge === 0 ? 1 : 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 5;
    for (let k = 1; k <= steps; k++) {
      const side = (noise(i * 13 + k, 9) - 0.5) * 36;
      x += inX * (len / steps) + (inY !== 0 ? side : 0);
      y += inY * (len / steps) + (inX !== 0 ? side : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(255,240,210,0.5)";
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  }
  ctx.restore();
}

/** After the walls shatter: broken ink rule and rubble around the domain. */
function drawBrokenBorder(ctx: Ctx, world: World): void {
  ctx.save();
  ctx.setLineDash([46, 30, 18, 40]);
  roundRect(ctx, AX, AY, AS, AS, AR);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.setLineDash([]);
  const t = world.domain.t;
  for (let i = 0; i < 40; i++) {
    const edge = i % 4;
    const at = noise(i, 21) * AS;
    const off = (noise(i, 22) - 0.5) * 30;
    const x = AX + (edge === 1 ? AS + off : edge === 3 ? off : at);
    const y = AY + (edge === 2 ? AS + off : edge === 0 ? off : at);
    const r = 5 + noise(i, 23) * 9;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(noise(i, 24) * TAU + t * 0.2);
    ctx.fillStyle = noise(i, 25) < 0.5 ? "#7a6a58" : "#4a3a2a";
    ctx.fillRect(-r, -r * 0.7, r * 2, r * 1.4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUTLINE;
    ctx.strokeRect(-r, -r * 0.7, r * 2, r * 1.4);
    ctx.restore();
  }
  ctx.restore();
}

/** Clash tug-of-war bar, then the winning domain's name and rule. */
function drawDomainTitle(ctx: Ctx, world: World): boolean {
  const d = world.domain;
  if (world.cinematic) return false;
  if (d.phase === "clash") {
    const a = world.fighters[d.first];
    const b = world.fighters[d.second];
    if (!a || !b) return false;
    const w = 640;
    const h = 34;
    const x = (AS - w) / 2;
    const y = 104;
    const split = x + w * (0.5 + d.push * 0.5);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 46px ${DISPLAY_FONT}`;
    outlinedText(ctx, "DOMAIN CLASH", AS / 2, y - 34, GOLD, 10);
    roundRect(ctx, x, y, w, h, 8);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = SIDES[a.side].main;
    ctx.fillRect(x, y, split - x, h);
    ctx.fillStyle = SIDES[b.side].main;
    ctx.fillRect(split, y, x + w - split, h);
    ctx.restore();
    roundRect(ctx, x, y, w, h, 8);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#b08a4a";
    ctx.stroke();
    ctx.font = `800 22px ${DISPLAY_FONT}`;
    ctx.textAlign = "left";
    outlinedText(ctx, a.def.domain?.name ?? "", x + 12, y + h / 2 + 1, PAPER, 5);
    ctx.textAlign = "right";
    outlinedText(ctx, b.def.domain?.name ?? "", x + w - 12, y + h / 2 + 1, PAPER, 5);
    ctx.restore();
    return false;
  }
  if (d.phase !== "owned" || d.t > 2.4) return false;
  const owner = world.fighters[d.owner];
  const spec = owner?.def.domain;
  if (!owner || !spec) return false;
  const k = easeOutBack(clamp(d.t / 0.3, 0, 1));
  const fade = 1 - clamp((d.t - 1.9) / 0.5, 0, 1);
  const y = owner.y * K < AS / 2 ? AS * 0.74 : AS * 0.2;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(AS / 2, y);
  ctx.scale(k, k);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 40px ${DISPLAY_FONT}`;
  outlinedText(ctx, `${owner.def.name}'S DOMAIN`, 0, -64, GOLD, 9);
  fitFont(ctx, spec.name, 900, 104, AS - 60, DISPLAY_FONT);
  outlinedText(ctx, spec.name, 0, 4, SIDES[owner.side].bright, 15);
  ctx.font = `600 34px ${BODY_FONT}`;
  outlinedText(ctx, spec.rule, 0, 70, PAPER, 7);
  ctx.restore();
  return false;
}

/** Small tag on the arena's bottom edge naming the domain in force. */
function drawDomainBadge(ctx: Ctx, world: World): void {
  const d = world.domain;
  if (d.phase !== "owned" || world.phase === "over") return;
  const owner = world.fighters[d.owner];
  const name = owner?.def.domain?.name;
  if (!owner || !name) return;
  ctx.save();
  ctx.font = `900 24px ${DISPLAY_FONT}`;
  const w = ctx.measureText(name).width + 60;
  const h = 44;
  const x = W / 2 - w / 2;
  const y = AY + AS - h / 2;
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = "#efe0bb";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = SIDES[owner.side].main;
  ctx.fillRect(x + 12, y + h / 2 - 6, 12, 12);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = INK;
  ctx.fillText(name, W / 2 + 8, y + h / 2 + 1);
  ctx.restore();
}

/** Live win chance: one shared bar under the HP bars, like the one on the "pick your side" card. */
function drawWinBar(ctx: Ctx, a: Fighter, b: Fighter, win: number): void {
  const x = 60;
  const w = W - 120;
  const y = 300;
  const h = 26;
  const pa = Math.round(win * 100);
  const split = x + w * clamp(win, 0, 1);
  roundRect(ctx, x, y, w, h, 8);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = SIDES[a.side].main;
  ctx.fillRect(x, y, split - x, h);
  ctx.fillStyle = SIDES[b.side].main;
  ctx.fillRect(split, y, x + w - split, h);
  ctx.restore();
  roundRect(ctx, x, y, w, h, 8);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#b08a4a";
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.font = `900 22px ${MONO_FONT}`;
  ctx.textAlign = "left";
  outlinedText(ctx, `${pa}%`, x + 12, y + h / 2 + 1, PAPER, 5);
  ctx.textAlign = "right";
  outlinedText(ctx, `${100 - pa}%`, x + w - 12, y + h / 2 + 1, PAPER, 5);
  ctx.textAlign = "center";
  ctx.font = `800 15px ${DISPLAY_FONT}`;
  outlinedText(ctx, "WIN CHANCE", W / 2, y + h / 2 + 1, PAPER, 4);
}

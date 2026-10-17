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
  ZoneHazard,
} from "../types";
import {
  ARENA,
  CLOSE_CALLS_FOR_FRENZY,
  COUNTDOWN_AT,
  ULT_CINEMATIC,
  ULT_HP,
  type World,
} from "../world";
import { winChance } from "../odds";
import { drawFace, type Mood } from "./faces";
import { UPSET_CHANCE } from "./sfx";
import type { Fx } from "./fx";
import {
  BODY_FONT,
  DISPLAY_FONT,
  GOLD,
  GOLD_INK,
  INK,
  MONO_FONT,
  OUTLINE,
  PAPER,
  PAPER_DARK,
  SIDES,
  fontsVersion,
} from "./palette";
import { LEVEL_TIMES } from "../leaders/kit";
import { drawEmblem } from "./emblems";
import { FLAG_RATIO, drawFlag } from "./flags";
import { drawHeadgear } from "./headgear";
import { portraitImage } from "./images";
import { drawWeapon } from "./sprites";

/** The video frame is laid out in a fixed 1080x1920 (9:16) space and scaled to the canvas. */
const W = 1080;
const H = 1920;
/** Arena square inside the frame, in frame pixels. */
const AX = 60;
const AY = 350;
const AS = 960;
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
  let frame = 0;
  const cam: Camera = { zoom: 1, x: ARENA / 2, y: ARENA / 2 };

  const draw = (world: World, fx: Fx, extras: DrawExtras = {}): void => {
    frame++;
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
    ctx.translate(fx.shakeX, fx.shakeY);
    ctx.drawImage(background, 0, 0, W, H);
    drawTopPanel(ctx, world, hpLag);
    drawArena(ctx, world, fx, frame, extras, cam);
    drawSkillCards(ctx, world);
    drawCloseCalls(ctx, world);
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
function drawTopPanel(ctx: Ctx, world: World, hpLag: number[]): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  drawFighterPanel(ctx, a, hpLag[a.index] ?? 1, 60, "left");
  drawFighterPanel(ctx, b, hpLag[b.index] ?? 1, W - 60, "right");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `900 56px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", W / 2, 282, PAPER, 8);
  ctx.font = `700 30px ${MONO_FONT}`;
  outlinedText(ctx, formatTime(world.time), W / 2, 324, "rgba(236,220,180,0.6)", 5);
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

/** History mode: one card per leader under the arena — the move, what it does, how long until it fires, and the ultimate. */
function drawSkillCards(ctx: Ctx, world: World): void {
  const y = AY + AS + 30;
  const h = 210;
  const gap = 20;
  const w = (AS - gap) / 2;
  world.fighters.slice(0, 2).forEach((f, i) => {
    const state = f.ability?.skillState?.();
    if (!state || !f.def.ability) return;
    const side = SIDES[f.side];
    const x = AX + i * (w + gap);
    ctx.save();
    if (!f.alive) ctx.globalAlpha = 0.45;
    parchmentCard(ctx, x, y, w, h, side.main);

    // Wax-seal medallion with a ring that fills up until the move fires.
    const cx = x + 80;
    const cy = y + 82;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, TAU);
    ctx.fillStyle = side.dark;
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(43,27,15,0.18)";
    ctx.stroke();
    const p = clamp(state.progress, 0, 1);
    if (p > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, 54, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.strokeStyle = state.ready ? GOLD : side.main;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, 59, 0, TAU);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Inside the ring: the emblem, with the countdown over it while waiting.
    ctx.save();
    ctx.translate(cx, cy);
    if (!state.ready) ctx.globalAlpha *= 0.35;
    drawEmblem(ctx, f.def.id, 38);
    ctx.restore();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (state.ready) {
      ctx.font = `900 30px ${MONO_FONT}`;
      outlinedText(ctx, "NOW!", cx, cy + 2, GOLD, 7);
    } else {
      ctx.font = `900 36px ${MONO_FONT}`;
      outlinedText(ctx, state.remaining.toFixed(1), cx, cy + 2, PAPER, 7);
    }

    const tx = x + 156;
    const right = x + w - 20;
    ctx.textAlign = "left";
    fitFont(ctx, f.def.ability.name, 900, 34, right - tx, DISPLAY_FONT);
    ctx.fillStyle = side.dark;
    ctx.fillText(f.def.ability.name, tx, y + 46);
    // What it does.
    ctx.fillStyle = INK;
    const { size, lines } = fitTwoLines(ctx, f.def.ability.text, right - tx);
    ctx.font = `600 ${size}px ${BODY_FONT}`;
    lines.forEach((line, k) => ctx.fillText(line, tx, y + 90 + k * (size + 2)));
    // Level and ultimate: [LV 2] [ULT] NAME
    if (state.ult) {
      let px = x + 20;
      const pill = (text: string, on: boolean) => {
        ctx.font = `900 22px ${MONO_FONT}`;
        const pw = ctx.measureText(text).width + 22;
        roundRect(ctx, px, y + 160, pw, 34, 6);
        ctx.fillStyle = on ? GOLD : "rgba(43,27,15,0.1)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = on ? INK : "rgba(43,27,15,0.35)";
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillStyle = on ? INK : "rgba(43,27,15,0.55)";
        ctx.fillText(text, px + pw / 2, y + 178);
        px += pw + 10;
      };
      pill(`LV ${state.level}`, state.level > 1);
      pill("ULT", state.ult !== "used");
      ctx.textAlign = "left";
      fitFont(ctx, state.ultName, 900, 26, right - px, DISPLAY_FONT);
      ctx.fillStyle = state.ult === "used" ? "rgba(43,27,15,0.35)" : GOLD_INK;
      ctx.fillText(state.ultName, px, y + 178);
    }
    ctx.restore();
  });
}

/** A sheet of parchment with an ink double rule and a coloured ribbon edge. */
function parchmentCard(ctx: Ctx, x: number, y: number, w: number, h: number, accent: string): void {
  roundRect(ctx, x, y, w, h, 10);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, "#f1e3bf");
  g.addColorStop(1, "#dcc391");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  const burn = ctx.createRadialGradient(
    x + w / 2,
    y + h / 2,
    h * 0.3,
    x + w / 2,
    y + h / 2,
    w * 0.62,
  );
  burn.addColorStop(0, "rgba(120,80,30,0)");
  burn.addColorStop(1, "rgba(120,80,30,0.32)");
  ctx.fillStyle = burn;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, w, 8);
  ctx.restore();
  roundRect(ctx, x, y, w, h, 10);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  roundRect(ctx, x + 8, y + 14, w - 16, h - 22, 6);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(43,27,15,0.45)";
  ctx.stroke();
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
  drawSpotlight(ctx, world);
  ctx.restore();

  drawBanner(ctx, world, extras);
  ctx.restore();
  drawMapBorder(ctx);
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
    ctx.lineWidth = 11;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#4fbf3a";
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -4, 8, 6, 0, 0, TAU);
    ctx.fillStyle = "#4fbf3a";
    ctx.fill();
    ctx.lineWidth = 3;
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
  ctx.lineWidth = Math.max(2, r * 0.05);
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
  const leader = f.def.reach <= 0;
  ctx.save();
  ctx.translate(f.x, f.y);

  if (!leader) {
    ctx.save();
    ctx.rotate(f.angle);
    drawWeapon(
      ctx,
      f.def.id,
      f.radius * 0.3,
      f.radius + f.def.reach,
      f.def.thickness,
      f.ability?.visualLevel?.() ?? 0,
    );
    ctx.restore();
  }

  // Soft ink shadow on the paper.
  ctx.beginPath();
  ctx.arc(5, 8, f.radius, 0, TAU);
  ctx.fillStyle = "rgba(43,27,15,0.22)";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius, 0, TAU);
  ctx.fillStyle = side.main;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = side.dark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius + 3.5, 0, TAU);
  ctx.lineWidth = 2.5;
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
  ctx.fillStyle = u.style === "elephant" ? "#5b6170" : side.main;
  ctx.fill();
  ctx.lineWidth = u.style === "elephant" ? 6 : 4;
  ctx.strokeStyle = u.style === "elephant" ? side.main : side.dark;
  ctx.stroke();

  if (u.style === "elephant") {
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
    ctx.lineWidth = 3;
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
    ctx.lineWidth = 2.5;
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
      ctx.lineWidth = 7;
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
      ctx.lineWidth = 3;
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
    case "asp": {
      ctx.scale(p.radius / 12, p.radius / 12);
      ctx.beginPath();
      for (let i = 0; i <= 12; i++) {
        const x = -i * 4;
        const y = Math.sin(time * 22 + i * 0.8) * 6 * (i / 12);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 11;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#6ee65a";
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(4, 0, 11, 8, 0, 0, TAU);
      ctx.fillStyle = "#6ee65a";
      ctx.fill();
      ctx.lineWidth = 3;
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
    ctx.beginPath();
    ctx.arc(0, 0, s.itemHalf * 0.95, 0, TAU);
    ctx.fillStyle = "#5b6170";
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = side.main;
    ctx.stroke();
    drawEmblem(ctx, "hannibal", s.itemHalf * 0.85);
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
    ctx.lineWidth = 7;
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
  ctx.lineWidth = 4;
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
  ctx.lineWidth = 4;
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
  if (leaders && world.phase === "intro") {
    if (world.phaseTime < INTRO_CARD_TIME) drawLeaderCards(ctx, world, world.phaseTime);
    else drawPickSide(ctx, world, world.phaseTime - INTRO_CARD_TIME);
    return;
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

/** Seconds of the "who wins?" card; the rest of the intro is "pick your side!". */
const INTRO_CARD_TIME = 1.3;

/**
 * "PICK YOUR SIDE!": both leaders face to face, the pre-fight win chances and a
 * 3-2-1 countdown, so the viewer has picked someone before the first hit.
 */
function drawPickSide(ctx: Ctx, world: World, t: number): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  const left = world.introTime - INTRO_CARD_TIME - t;
  ctx.save();
  ctx.globalAlpha = clamp(left / 0.15, 0, 1);
  ctx.fillStyle = "rgba(29,18,10,0.93)";
  ctx.fillRect(0, 0, AS, AS);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const s = easeOutBack(clamp(t / 0.25, 0, 1));
  ctx.save();
  ctx.translate(AS / 2, 120);
  ctx.scale(s, s);
  ctx.font = `900 80px ${DISPLAY_FONT}`;
  outlinedText(ctx, "PICK YOUR SIDE!", 0, 0, GOLD, 13);
  ctx.font = `600 34px ${BODY_FONT}`;
  ctx.fillStyle = PAPER;
  ctx.fillText("Comment your pick below", 0, 62);
  ctx.restore();

  const r = 118;
  const y = 410;
  [a, b].forEach((f, i) => {
    const side = SIDES[f.side];
    const dir = i === 0 ? -1 : 1;
    const x = AS / 2 + dir * 225;
    const pop = easeOutBack(clamp((t - 0.08 * i) / 0.3, 0, 1));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = side.main;
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = side.dark;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r + 6, 0, TAU);
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    // They stare each other down.
    drawFace(ctx, f.def.id, r, "determined", -dir, 0, t, i);
    drawHeadgear(ctx, f.def.id, r);
    ctx.restore();
    fitFont(ctx, f.def.name, 900, 52, 420, DISPLAY_FONT);
    outlinedText(ctx, f.def.name, x, y + r + 52, side.bright, 9);
  });
  ctx.font = `900 76px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", AS / 2, y, PAPER, 12);

  const chance = winChance(a.def.id, b.def.id);
  if (chance !== null) {
    const pa = Math.round(chance * 100);
    const bw = 760;
    const bh = 58;
    const bx = (AS - bw) / 2;
    const by = 700;
    ctx.font = `700 30px ${DISPLAY_FONT}`;
    ctx.fillStyle = PAPER;
    ctx.fillText("WIN CHANCE", AS / 2, by - 30);
    const grow = clamp((t - 0.2) / 0.4, 0, 1);
    const split = bx + bw * (0.5 + (pa / 100 - 0.5) * grow);
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = SIDES[a.side].main;
    ctx.fillRect(bx, by, split - bx, bh);
    ctx.fillStyle = SIDES[b.side].main;
    ctx.fillRect(split, by, bx + bw - split, bh);
    ctx.restore();
    roundRect(ctx, bx, by, bw, bh, 10);
    ctx.lineWidth = 5;
    ctx.strokeStyle = "#b08a4a";
    ctx.stroke();
    ctx.font = `900 40px ${MONO_FONT}`;
    ctx.textAlign = "left";
    outlinedText(ctx, `${pa}%`, bx + 20, by + bh / 2 + 2, PAPER, 7);
    ctx.textAlign = "right";
    outlinedText(ctx, `${100 - pa}%`, bx + bw - 20, by + bh / 2 + 2, PAPER, 7);
    ctx.textAlign = "center";
  }

  // 3, 2, 1 — each number pops in on its drum hit.
  const it = world.phaseTime;
  const tick = COUNTDOWN_AT.reduce((n, at) => (it >= at ? n + 1 : n), 0);
  if (tick > 0) {
    const since = it - (COUNTDOWN_AT[tick - 1] ?? 0);
    const k = easeOutBack(clamp(since / 0.15, 0, 1));
    ctx.save();
    ctx.translate(AS / 2, 865);
    ctx.scale(k, k);
    ctx.font = `900 120px ${DISPLAY_FONT}`;
    outlinedText(ctx, String(COUNTDOWN_AT.length - tick + 1), 0, 0, GOLD, 14);
    ctx.restore();
  }
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

/** History intro: "WHO WINS?" and a card per leader (flag, name, title, lifetime). */
function drawLeaderCards(ctx: Ctx, world: World, t: number): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  const fade = 1 - clamp((t - (INTRO_CARD_TIME - 0.45)) / 0.45, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(29,18,10,0.72)";
  ctx.fillRect(0, 0, AS, AS);
  const s = easeOutBack(clamp(t / 0.25, 0, 1));
  ctx.translate(AS / 2, 0);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 64px ${DISPLAY_FONT}`;
  outlinedText(ctx, "WHO WINS?", 0, 90, GOLD, 12);
  leaderCard(ctx, a, 290);
  ctx.textAlign = "center";
  ctx.font = `800 84px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", 0, 500, PAPER, 12);
  leaderCard(ctx, b, 680);
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
  ctx.font = `800 52px ${DISPLAY_FONT}`;
  outlinedText(ctx, "ULTIMATE", 0, -60, GOLD, 11);
  fitFont(ctx, c.name, 800, 120, AS - 60, DISPLAY_FONT);
  outlinedText(ctx, c.name, 0, 30, SIDES[f.side].bright, 16);
  ctx.restore();
}

/** Seconds the "X WINS" banner shows before the "who's next?" card (history mode). */
const WINS_TIME = 1.4;

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
  ([-1, 1] as const).forEach((dir, i) => {
    const side = SIDES[i === 0 ? 0 : 1];
    const def = next?.[i] ?? null;
    const x = dir * 230;
    // Gentle bob so the card does not look frozen.
    const by = y + Math.sin(t * 4 + i * 1.7) * 8;
    ctx.beginPath();
    ctx.arc(x, by, r, 0, TAU);
    ctx.fillStyle = side.main;
    ctx.fill();
    ctx.lineWidth = 10;
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
  ctx.lineWidth = 6;
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

function outlinedText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  fill: string,
  lw: number,
): void {
  ctx.lineJoin = "round";
  ctx.lineWidth = lw;
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

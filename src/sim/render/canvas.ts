import { TAU, clamp } from "../geom";
import type {
  ArcHazard,
  Fighter,
  HookHazard,
  ProjectileHazard,
  PylonHazard,
  RingHazard,
  StrikeHazard,
  SweepHazard,
  UnitHazard,
} from "../types";
import { ARENA, ULT_CINEMATIC, ULT_HP, type World } from "../world";
import type { Fx } from "./fx";
import { DISPLAY_FONT, MONO_FONT, OUTLINE, SIDES } from "./palette";
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
const AY = 500;
const AS = 960;
/** Frame pixels per world unit. The world is smaller than the frame so fighters look big. */
const K = AS / ARENA;

type Ctx = CanvasRenderingContext2D;

export interface Renderer {
  draw(world: World, fx: Fx): void;
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

  const draw = (world: World, fx: Fx): void => {
    frame++;
    ctx.setTransform(quality, 0, 0, quality, 0, 0);
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, W, H);

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
    drawArena(ctx, world, fx, frame);
    drawSkillCards(ctx, world);
    ctx.restore();

    drawOverlay(ctx, fx, overlay);
  };

  return { draw };
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
  ctx.font = `700 56px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", W / 2, 432, "#f4f6fb", 8);
  ctx.font = `600 30px ${MONO_FONT}`;
  outlinedText(ctx, formatTime(world.time), W / 2, 474, "rgba(244,246,251,0.55)", 5);
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
    ctx.translate(align === "left" ? edgeX : edgeX - fw, 332);
    drawFlag(ctx, f.def.flag, fh);
    ctx.restore();
    nameX = align === "left" ? edgeX + fw + 14 : edgeX - fw - 14;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
  }
  fitFont(ctx, f.def.name, 700, 58, w - Math.abs(nameX - edgeX), DISPLAY_FONT);
  outlinedText(ctx, f.def.name, nameX, 374, side.main, 9);

  const y = 400;
  const h = 44;
  roundRect(ctx, x0, y, w, h, 12);
  ctx.fillStyle = "#10131c";
  ctx.fill();
  ctx.save();
  ctx.clip();
  const fillPart = (r: number, color: string) => {
    ctx.fillStyle = color;
    if (align === "left") ctx.fillRect(x0, y, w * r, h);
    else ctx.fillRect(x0 + w * (1 - r), y, w * r, h);
  };
  fillPart(lag, "rgba(255,255,255,0.55)");
  fillPart(ratio, side.main);
  ctx.restore();
  roundRect(ctx, x0, y, w, h, 12);
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.stroke();
  if (f.def.growth) {
    // Where the ultimate fires.
    const tx = align === "left" ? x0 + w * ULT_HP : x0 + w * (1 - ULT_HP);
    ctx.fillStyle = OUTLINE;
    ctx.fillRect(tx - 4, y - 8, 8, h + 16);
    ctx.fillStyle = "#ffd45e";
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
    if (!f.alive) ctx.globalAlpha = 0.35;
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = side.main;
    ctx.globalAlpha *= 0.9;
    ctx.stroke();

    // Medallion with a ring that fills up until the move fires.
    const cx = x + 78;
    const cy = y + 80;
    ctx.beginPath();
    ctx.arc(cx, cy, 54, 0, TAU);
    ctx.fillStyle = side.dark;
    ctx.fill();
    ctx.lineWidth = 9;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.stroke();
    const p = clamp(state.progress, 0, 1);
    if (p > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, 54, -Math.PI / 2, -Math.PI / 2 + TAU * p);
      ctx.strokeStyle = state.ready ? "#ffd45e" : side.main;
      ctx.stroke();
    }
    // Inside the ring: the emblem, with the countdown over it while waiting.
    ctx.save();
    ctx.translate(cx, cy);
    if (!state.ready) ctx.globalAlpha *= 0.35;
    drawEmblem(ctx, f.def.id, 38);
    ctx.restore();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (state.ready) {
      ctx.font = `800 32px ${MONO_FONT}`;
      outlinedText(ctx, "NOW!", cx, cy + 2, "#ffd45e", 7);
    } else {
      ctx.font = `800 38px ${MONO_FONT}`;
      outlinedText(ctx, state.remaining.toFixed(1), cx, cy + 2, "#ffffff", 7);
    }

    const tx = x + 152;
    const right = x + w - 18;
    ctx.textAlign = "left";
    fitFont(ctx, f.def.ability.name, 700, 38, right - tx, DISPLAY_FONT);
    ctx.fillStyle = side.light;
    ctx.fillText(f.def.ability.name, tx, y + 44);
    // What it does.
    ctx.fillStyle = "rgba(232,236,244,0.8)";
    let size = 30;
    let lines: string[] = [];
    // Shrink until it fits in two lines.
    for (; size >= 20; size -= 2) {
      ctx.font = `500 ${size}px ${DISPLAY_FONT}`;
      lines = wrapLines(ctx, f.def.ability.text, right - tx);
      if (lines.length <= 2) break;
    }
    lines.slice(0, 2).forEach((line, k) => ctx.fillText(line, tx, y + 88 + k * (size + 4)));
    // Level and ultimate: [LV 2] [ULT] NAME
    if (state.ult) {
      let px = x + 18;
      const pill = (text: string, on: boolean) => {
        ctx.font = `800 24px ${MONO_FONT}`;
        const pw = ctx.measureText(text).width + 20;
        roundRect(ctx, px, y + 160, pw, 36, 9);
        ctx.fillStyle = on ? "#ffd45e" : "rgba(255,255,255,0.14)";
        ctx.fill();
        ctx.textAlign = "center";
        ctx.fillStyle = on ? OUTLINE : "#e8ecf4";
        ctx.fillText(text, px + pw / 2, y + 179);
        px += pw + 10;
      };
      pill(`LV ${state.level}`, state.level > 1);
      pill("ULT", state.ult !== "used");
      ctx.textAlign = "left";
      fitFont(ctx, state.ultName, 800, 28, right - px, DISPLAY_FONT);
      ctx.fillStyle = state.ult === "used" ? "rgba(232,236,244,0.35)" : "#ffd45e";
      ctx.fillText(state.ultName, px, y + 179);
    }
    ctx.restore();
  });
}

// --- arena -----------------------------------------------------------------------

function drawArena(ctx: Ctx, world: World, fx: Fx, frame: number): void {
  ctx.save();
  ctx.translate(AX, AY);
  roundRect(ctx, 0, 0, AS, AS, 40);
  ctx.clip();

  // Everything below lives in world units.
  ctx.save();
  ctx.scale(K, K);

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

  for (const f of world.fighters) if (f.alive) drawFighter(ctx, f, world.time);
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
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of fx.texts) {
    ctx.globalAlpha = clamp(t.life / t.max, 0, 1);
    ctx.font = `800 ${Math.round(t.size / K)}px ${MONO_FONT}`;
    // Keep callouts fully inside the arena.
    const half = ctx.measureText(t.text).width / 2 + 8;
    const x = half * 2 < ARENA ? clamp(t.x, half, ARENA - half) : ARENA / 2;
    outlinedText(ctx, t.text, x, Math.max(24, t.y), t.color, 8 / K);
  }
  ctx.globalAlpha = 1;
  drawSpotlight(ctx, world);
  ctx.restore();

  drawBanner(ctx, world);
  ctx.restore();

  roundRect(ctx, AX, AY, AS, AS, 40);
  ctx.strokeStyle = "#f4f6fb";
  ctx.lineWidth = 7;
  ctx.stroke();
}

function drawFighter(ctx: Ctx, f: Fighter, time: number): void {
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

  ctx.beginPath();
  ctx.arc(0, 0, f.radius, 0, TAU);
  ctx.fillStyle = side.main;
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = side.dark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, f.radius - 9, 0, TAU);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
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
    ctx.font = `800 ${Math.round(f.radius * 0.62)}px ${MONO_FONT}`;
    outlinedText(ctx, hp, 0, 3, "#ffffff", 6);
  } else {
    ctx.font = `700 ${Math.round(f.radius * 0.5)}px ${MONO_FONT}`;
    outlinedText(ctx, hp, 0, 2, "#ffffff", 4);
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
      star(ctx, Math.cos(a) * f.radius * 0.7, sy + Math.sin(a) * 8, 9, "#ffd45e");
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
    ctx.strokeStyle = "#f4f6fb";
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
    ctx.fillStyle = "#ffd45e";
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
      ctx.fillStyle = "rgba(200,200,210,0.25)";
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
      ctx.strokeStyle = "rgba(255,240,200,0.7)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, p.radius * 0.8, 0, TAU);
      ctx.fillStyle = "#2a2d36";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#ffd45e";
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
    ctx.strokeStyle = "#ffd45e";
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
  ctx.fillStyle = h.attached >= 0 ? "#ffd45e" : "#e3dcc8";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function drawBanner(ctx: Ctx, world: World): void {
  let text = "";
  let color = "#f4f6fb";
  let size = 120;
  let t = world.phaseTime;
  let alpha = 1;

  const leaders = world.fighters.some((f) => f.def.growth);
  if (world.cinematic) {
    drawUltimateBanner(ctx, world);
    return;
  }
  if (leaders && (world.phase === "intro" || world.phase === "fight")) {
    const t = world.phase === "intro" ? world.phaseTime : 0.8 + world.phaseTime;
    if (t < INTRO_CARD_TIME) {
      drawLeaderCards(ctx, world, t);
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
        color = "#ffd45e";
        t = lv.t;
        alpha = 1 - clamp((lv.t - 0.8) / 0.4, 0, 1);
        break;
      }
      if (world.phaseTime >= 0.7) return;
      text = "FIGHT!";
      size = 180;
      color = "#ffd45e";
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
      text = `${winner.def.name} WINS`;
      size = 108;
      color = SIDES[winner.side].main;
      t += 0.5;
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

/** Seconds (from the very start) the leader intro cards stay up; the fight starts under them. */
const INTRO_CARD_TIME = 1.9;

/** History intro: "WHO WINS?" and a card per leader (flag, name, title, lifetime). */
function drawLeaderCards(ctx: Ctx, world: World, t: number): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  const fade = 1 - clamp((t - (INTRO_CARD_TIME - 0.45)) / 0.45, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "rgba(5,6,10,0.62)";
  ctx.fillRect(0, 0, AS, AS);
  const s = easeOutBack(clamp(t / 0.25, 0, 1));
  ctx.translate(AS / 2, 0);
  ctx.scale(s, s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 64px ${DISPLAY_FONT}`;
  outlinedText(ctx, "WHO WINS?", 0, 90, "#ffd45e", 12);
  leaderCard(ctx, a, 290);
  ctx.textAlign = "center";
  ctx.font = `800 84px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", 0, 500, "#f4f6fb", 12);
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
  ctx.strokeStyle = "#ffd45e";
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
  outlinedText(ctx, "ULTIMATE", 0, -60, "#ffd45e", 11);
  fitFont(ctx, c.name, 800, 120, AS - 60, DISPLAY_FONT);
  outlinedText(ctx, c.name, 0, 30, SIDES[f.side].main, 16);
  ctx.restore();
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
  outlinedText(ctx, "VS", 0, 0, "#f4f6fb", 14);
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
  outlinedText(ctx, f.def.name, x + fw, y, SIDES[f.side].main, 16);
}

// --- overlay ---------------------------------------------------------------------

function drawOverlay(ctx: Ctx, fx: Fx, overlay: HTMLCanvasElement): void {
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(fx.flash * 0.4, 0, 0.4)})`;
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

/** Arena floor, grid and watermark. Transparent outside the arena. */
function buildBackground(quality: number): HTMLCanvasElement {
  const { canvas, g: ctx } = layer(quality);
  if (!ctx) return canvas;
  ctx.translate(AX, AY);
  roundRect(ctx, 0, 0, AS, AS, 40);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, 0, AS);
  bg.addColorStop(0, "#0d1224");
  bg.addColorStop(1, "#070912");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, AS, AS);

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 2;
  for (let p = 120; p < AS; p += 120) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, AS);
    ctx.moveTo(0, p);
    ctx.lineTo(AS, p);
    ctx.stroke();
  }

  return canvas;
}

/** Vignette and CRT scanlines, drawn on top of everything. */
function buildOverlay(quality: number): HTMLCanvasElement {
  const { canvas, g: ctx } = layer(quality);
  if (!ctx) return canvas;
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  const scanlines = makeScanlines(ctx, quality);
  if (scanlines) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = scanlines;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

function makeScanlines(ctx: Ctx, quality: number): CanvasPattern | null {
  const tile = document.createElement("canvas");
  tile.width = 1;
  tile.height = Math.max(3, Math.round(4 * quality));
  const c = tile.getContext("2d");
  if (!c) return null;
  c.fillStyle = "rgba(0,0,0,0.2)";
  c.fillRect(0, tile.height - 1, 1, 1);
  return ctx.createPattern(tile, "repeat");
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

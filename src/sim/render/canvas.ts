import { TAU, clamp } from "../geom";
import type { ArcHazard, Fighter, HookHazard, PylonHazard, RingHazard } from "../types";
import { ARENA, type World } from "../world";
import type { Fx } from "./fx";
import { DISPLAY_FONT, MONO_FONT, OUTLINE, SIDES } from "./palette";
import { drawWeapon } from "./sprites";

/** The video frame is laid out in a fixed 1080x1920 (9:16) space and scaled to the canvas. */
const W = 1080;
const H = 1920;
/** Arena square inside the frame, in frame pixels. */
const AX = 60;
const AY = 430;
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

  const scanlines = makeScanlines(ctx, quality);
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
    drawTopPanel(ctx, world, hpLag);
    drawArena(ctx, world, fx, frame);
    drawBottomPanel(ctx, world);
    ctx.restore();

    drawOverlay(ctx, fx, scanlines);
  };

  return { draw };
}

// --- layout pieces -------------------------------------------------------------

function drawTopPanel(ctx: Ctx, world: World, hpLag: number[]): void {
  const [a, b] = world.fighters;
  if (!a || !b) return;
  drawFighterPanel(ctx, a, hpLag[a.index] ?? 1, 60, "left");
  drawFighterPanel(ctx, b, hpLag[b.index] ?? 1, W - 60, "right");

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 56px ${DISPLAY_FONT}`;
  outlinedText(ctx, "VS", W / 2, 150, "#f4f6fb", 8);
  ctx.font = `600 38px ${MONO_FONT}`;
  outlinedText(ctx, formatTime(world.time), W / 2, 214, "rgba(244,246,251,0.65)", 6);
}

function drawFighterPanel(
  ctx: Ctx,
  f: Fighter,
  lag: number,
  edgeX: number,
  align: "left" | "right",
): void {
  const side = SIDES[f.side];
  const w = 420;
  const x0 = align === "left" ? edgeX : edgeX - w;
  const ratio = clamp(f.hp / f.maxHp, 0, 1);

  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 62px ${DISPLAY_FONT}`;
  outlinedText(ctx, f.def.name, edgeX, 135, side.main, 9);

  const y = 165;
  const h = 40;
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

  ctx.font = `600 34px ${MONO_FONT}`;
  ctx.fillStyle = "#e8ecf4";
  ctx.fillText(`HP ${Math.max(0, Math.ceil(f.hp))}`, edgeX, 256);

  ctx.save();
  ctx.translate(align === "left" ? edgeX : edgeX - 150, 330);
  drawWeapon(ctx, f.def.id, 0, 150, f.def.thickness * 1.1, f.ability?.visualLevel?.() ?? 0);
  ctx.restore();
}

function drawBottomPanel(ctx: Ctx, world: World): void {
  const x = 60;
  const y = 1436;
  const w = 960;
  const h = 330;
  roundRect(ctx, x, y, w, h, 26);
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  world.fighters.slice(0, 2).forEach((f, i) => {
    const side = SIDES[f.side];
    const cx = x + 34 + i * 470;
    ctx.font = `700 36px ${MONO_FONT}`;
    ctx.fillStyle = side.main;
    ctx.fillText(`${side.name} ${f.def.name}`, cx, y + 70);
    ctx.font = `600 32px ${MONO_FONT}`;
    ctx.fillStyle = "#e8ecf4";
    ctx.fillText(`HP ${Math.max(0, Math.ceil(f.hp))}/${f.maxHp}`, cx, y + 124);
    ctx.fillText(`DMG ${world.damageDealt[f.index] ?? 0}`, cx, y + 172);
    ctx.fillStyle = f.alive ? "#ffd45e" : "#ff6b6b";
    ctx.fillText(f.alive ? (f.ability?.hud?.(f) ?? "[BRUTE FORCE]") : "[K.O.]", cx, y + 236);
  });

  ctx.textAlign = "center";
  ctx.font = `500 26px ${MONO_FONT}`;
  ctx.fillStyle = "rgba(232,236,244,0.45)";
  ctx.fillText(`SEED ${world.seed}`, W / 2, y + h - 22);
}

// --- arena -----------------------------------------------------------------------

function drawArena(ctx: Ctx, world: World, fx: Fx, frame: number): void {
  ctx.save();
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

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 150px ${DISPLAY_FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  ctx.fillText("ARENA SIM", AS / 2, AS / 2);

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
    }
  }

  for (const f of world.fighters) if (f.alive) drawFighter(ctx, f);

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
    outlinedText(ctx, t.text, t.x, t.y, t.color, 8 / K);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawBanner(ctx, world);
  ctx.restore();

  roundRect(ctx, AX, AY, AS, AS, 40);
  ctx.strokeStyle = "#f4f6fb";
  ctx.lineWidth = 7;
  ctx.stroke();
}

function drawFighter(ctx: Ctx, f: Fighter): void {
  const side = SIDES[f.side];
  ctx.save();
  ctx.translate(f.x, f.y);

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

  if (f.hurt > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, f.radius, 0, TAU);
    ctx.fillStyle = `rgba(255,255,255,${clamp((f.hurt / 0.18) * 0.85, 0, 0.85)})`;
    ctx.fill();
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.round(f.radius * 0.9)}px ${MONO_FONT}`;
  outlinedText(ctx, String(Math.max(0, Math.ceil(f.hp))), 0, 3, "#ffffff", 7);

  ctx.restore();
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

  switch (world.phase) {
    case "intro":
      text = "READY...";
      break;
    case "fight":
      if (world.phaseTime >= 0.7) return;
      text = "FIGHT!";
      size = 180;
      color = "#ffd45e";
      alpha = 1 - clamp((world.phaseTime - 0.4) / 0.3, 0, 1);
      break;
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
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  outlinedText(ctx, text, 0, 0, color, 16);
  ctx.restore();
}

// --- overlay ---------------------------------------------------------------------

function drawOverlay(ctx: Ctx, fx: Fx, scanlines: CanvasPattern | null): void {
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${clamp(fx.flash * 0.4, 0, 0.4)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (scanlines) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = scanlines;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
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

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
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

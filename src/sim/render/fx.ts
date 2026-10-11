import { TAU } from "../geom";
import { createRng, type Rng } from "../rng";
import type { SimEvent } from "../types";
import type { World } from "../world";
import { SIDES } from "./palette";
import type { Sfx } from "./sfx";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

interface TrailDot {
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  side: 0 | 1;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  life: number;
  max: number;
  color: string;
}

const MAX_PARTICLES = 1600;
const POISON_GREEN = "#6ee65a";

const SKILL_TEXT: Record<string, string> = {
  legion: "LEGIONS!",
  elephant: "WAR ELEPHANT!",
};

/**
 * Purely cosmetic effects (sparks, floating numbers, screen shake). It reads the
 * simulation's events but never feeds anything back into it.
 */
export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  trail: TrailDot[] = [];
  /** Expanding rings (explosions). */
  rings: Shockwave[] = [];
  /** Current screen shake offset in arena units. */
  shakeX = 0;
  shakeY = 0;
  /** White screen flash, 0..1. */
  flash = 0;
  private shake = 0;
  /** Optional sound output; events are turned into sound as they are handled. */
  sfx: Sfx | null = null;
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = createRng(seed ^ 0x5bd1e995);
  }

  /** Turn the world's pending events into effects and clear them. */
  consume(world: World): void {
    for (const e of world.events) this.handle(world, e);
    world.events.length = 0;
  }

  update(dt: number, world: World): void {
    for (const f of world.fighters) {
      if (f.alive && f.trail) {
        this.trail.push({ x: f.x, y: f.y, radius: f.radius, life: 0.28, max: 0.28, side: f.side });
      }
    }

    for (const f of world.fighters) {
      if (f.alive && f.poison > 0 && this.rng.next() < dt * 14) {
        const a = this.rng.range(0, TAU);
        this.particles.push({
          x: f.x + Math.cos(a) * f.radius * 0.8,
          y: f.y + Math.sin(a) * f.radius * 0.8,
          vx: 0,
          vy: -60,
          life: 0.5,
          max: 0.5,
          size: 7,
          color: POISON_GREEN,
          drag: 1,
        });
      }
    }

    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    for (const t of this.texts) {
      t.y += t.vy * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const d of this.trail) d.life -= dt;
    this.trail = this.trail.filter((d) => d.life > 0);

    this.shake *= Math.exp(-9 * dt);
    if (this.shake < 0.2) this.shake = 0;
    this.shakeX = (this.rng.next() * 2 - 1) * this.shake;
    this.shakeY = (this.rng.next() * 2 - 1) * this.shake;
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }

  private burst(
    x: number,
    y: number,
    count: number,
    colors: readonly string[],
    speed: number,
    life: number,
    size: number,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) return;
      const angle = this.rng.range(0, TAU);
      const v = speed * this.rng.range(0.25, 1);
      const l = life * this.rng.range(0.55, 1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v,
        life: l,
        max: l,
        size: size * this.rng.range(0.5, 1),
        color: this.rng.pick(colors),
        drag: 3.2,
      });
    }
  }

  private text(x: number, y: number, text: string, color: string, size: number, life = 0.8): void {
    this.texts.push({ x, y, vy: -110, life, max: life, text, color, size });
  }

  private addShake(amount: number): void {
    this.shake = Math.min(46, Math.max(this.shake, amount));
  }

  private handle(world: World, e: SimEvent): void {
    this.sfx?.play(world, e);
    switch (e.type) {
      case "hit": {
        const attacker = world.fighters[e.attacker];
        const target = world.fighters[e.target];
        if (e.dot) {
          if (target) {
            this.text(
              target.x,
              target.y - target.radius - 10,
              `-${e.damage}`,
              POISON_GREEN,
              30,
              0.6,
            );
          }
          break;
        }
        const side = SIDES[attacker?.side ?? 0];
        this.burst(
          e.x,
          e.y,
          8 + Math.min(16, e.damage),
          ["#ffffff", side.light, side.main],
          260 + e.damage * 9,
          0.5,
          9,
        );
        if (target) {
          this.text(
            target.x,
            target.y - target.radius - 14,
            `-${e.damage}`,
            "#ffffff",
            36 + Math.min(28, e.damage * 1.3),
          );
        }
        this.addShake(4 + e.damage * 0.9);
        break;
      }
      case "clash":
        this.burst(e.x, e.y, 12, ["#fff3a0", "#ffd45e", "#ffffff"], 380, 0.35, 8);
        this.addShake(7);
        break;
      case "wall": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 4, [side.light], 150, 0.3, 6);
        break;
      }
      case "bump":
        this.burst(e.x, e.y, 5, ["#ffffff"], 160, 0.25, 6);
        break;
      case "levelUp": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 22, ["#ffd45e", "#ffffff", "#ffe9a6"], 420, 0.6, 9);
        this.text(f.x, f.y - f.radius - 30, `LV ${e.level}`, "#ffd45e", 52, 1);
        this.addShake(6);
        break;
      }
      case "ring": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 30, [side.light, side.main, "#ffffff"], 600, 0.7, 10);
        this.flash = Math.max(this.flash, 0.35);
        this.addShake(24);
        break;
      }
      case "pylon":
        this.burst(e.x, e.y, 12, ["#8cc0ff", "#ffffff"], 260, 0.4, 7);
        break;
      case "arc":
        this.flash = Math.max(this.flash, 0.3);
        this.addShake(12);
        break;
      case "hookAttach":
        this.burst(e.x, e.y, 12, ["#d8d0bd", "#ffffff"], 300, 0.4, 8);
        this.addShake(7);
        break;
      case "dash": {
        const f = world.fighters[e.fighter];
        if (f) this.burst(f.x, f.y, 16, [SIDES[f.side].light, "#ffffff"], 420, 0.35, 8);
        this.addShake(9);
        break;
      }
      case "summon": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 14, [side.light, "#ffffff"], 300, 0.4, 8);
        const f = world.fighters[e.fighter];
        const label = SKILL_TEXT[e.style];
        if (f && label) this.text(f.x, f.y - f.radius - 30, label, side.light, 44, 0.9);
        break;
      }
      case "shoot": {
        const f = world.fighters[e.fighter];
        if (!f || e.style === "arrow" || e.style === "asp") break;
        const big = e.style === "bombard";
        this.burst(
          f.x,
          f.y,
          big ? 26 : 12,
          ["#d8d8de", "#9a9aa5", "#ffb15c"],
          big ? 380 : 240,
          0.6,
          12,
        );
        this.addShake(big ? 16 : 6);
        if (big) this.text(f.x, f.y - f.radius - 30, "GREAT BOMBARD!", "#ffb15c", 44, 0.9);
        break;
      }
      case "blast":
        this.burst(e.x, e.y, 46, ["#ffb15c", "#ffd45e", "#ff6a3c", "#ffffff"], 640, 0.7, 13);
        this.rings.push({
          x: e.x,
          y: e.y,
          radius: e.radius,
          life: 0.4,
          max: 0.4,
          color: "#ffb15c",
        });
        this.flash = Math.max(this.flash, 0.4);
        this.addShake(26);
        break;
      case "unitDown": {
        const side = SIDES[e.side];
        this.burst(e.x, e.y, 18, [side.main, side.light, "#ffffff"], 320, 0.5, 9);
        break;
      }
      case "shield": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 18, ["#ffd45e", "#fff3a0", "#ffffff"], 340, 0.45, 8);
        this.text(f.x, f.y - f.radius - 30, "HOLD THE LINE!", "#ffd45e", 44, 0.9);
        break;
      }
      case "stun": {
        const f = world.fighters[e.fighter];
        if (f) this.text(f.x, f.y - f.radius - 44, "STUNNED", "#ffd45e", 38, 0.8);
        break;
      }
      case "poison": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 16, [POISON_GREEN, "#c8ffb8"], 280, 0.45, 8);
        this.text(f.x, f.y - f.radius - 44, "POISONED", POISON_GREEN, 38, 0.8);
        break;
      }
      case "ko": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 80, [side.main, side.light, "#ffffff", side.dark], 620, 1.1, 13);
        this.flash = 0.9;
        this.addShake(40);
        break;
      }
      case "fight":
        this.flash = Math.max(this.flash, 0.3);
        break;
      default:
        break;
    }
  }
}

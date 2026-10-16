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
const POISON_GREEN = "#4fbf3a";
/** Dark flecks of ink mixed into sparks so they read on parchment. */
const INK_SPECK = "#3a2616";
const DUST = ["#b89a6a", "#8d7148", "#d8c08f"] as const;
/** Shown in turn for each close call. */
const NEAR_MISS_WORDS = ["SO CLOSE!", "NEAR MISS!", "ALMOST!", "INCHES AWAY!", "WHEW!"];

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
        // Damage on a 0..100 scale, whatever the target's max HP is.
        const rel = target ? (e.damage / target.maxHp) * 100 : e.damage;
        const big = rel >= 10;
        this.burst(
          e.x,
          e.y,
          8 + Math.min(big ? 30 : 16, rel * (big ? 2 : 1)),
          big ? [INK_SPECK, "#ffd45e", side.light] : [INK_SPECK, side.light, side.main],
          260 + Math.min(rel, 30) * 9,
          0.5,
          big ? 12 : 9,
        );
        if (target) {
          this.text(
            target.x,
            target.y - target.radius - 14,
            `-${e.damage}`,
            big ? "#ffd45e" : "#ffffff",
            36 + Math.min(big ? 48 : 28, rel * 1.3 * (big ? 1.6 : 1)),
            big ? 1.1 : 0.8,
          );
        }
        this.addShake(4 + Math.min(rel, 30) * (big ? 1.4 : 0.9));
        break;
      }
      case "clash":
        this.burst(e.x, e.y, 12, ["#fff3a0", "#ffd45e", INK_SPECK], 380, 0.35, 8);
        this.addShake(7);
        break;
      case "wall": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 4, [side.light], 150, 0.3, 6);
        break;
      }
      case "bump":
        this.burst(e.x, e.y, 5, [INK_SPECK], 160, 0.25, 6);
        break;
      case "levelUp": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 22, ["#ffd45e", INK_SPECK, "#ffe9a6"], 420, 0.6, 9);
        this.text(f.x, f.y - f.radius - 30, `LV ${e.level}`, "#ffd45e", 52, 1);
        this.addShake(6);
        break;
      }
      case "ring": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 30, [side.light, side.main, INK_SPECK], 600, 0.7, 10);
        this.flash = Math.max(this.flash, 0.35);
        this.addShake(24);
        break;
      }
      case "pylon":
        this.burst(e.x, e.y, 12, ["#8cc0ff", INK_SPECK], 260, 0.4, 7);
        break;
      case "arc":
        this.flash = Math.max(this.flash, 0.3);
        this.addShake(12);
        break;
      case "hookAttach":
        this.burst(e.x, e.y, 12, ["#d8d0bd", INK_SPECK], 300, 0.4, 8);
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
        this.burst(e.x, e.y, 14, [side.light, INK_SPECK], 300, 0.4, 8);
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
        break;
      }
      case "blast":
        this.burst(e.x, e.y, 46, ["#ffb15c", "#ffd45e", "#ff6a3c", INK_SPECK], 640, 0.7, 13);
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
        if (e.style === "elephant") {
          // The elephant goes down in a cloud of dust.
          this.burst(e.x, e.y, 34, DUST, 260, 0.9, 16);
          this.rings.push({ x: e.x, y: e.y, radius: 90, life: 0.35, max: 0.35, color: "#8d7148" });
          this.addShake(12);
          break;
        }
        this.burst(e.x, e.y, 18, [side.main, side.light, INK_SPECK], 320, 0.5, 9);
        break;
      }
      case "reflect": {
        this.text(e.x, e.y - 40, "PARRY!", "#f2c14e", 58, 0.9);
        this.burst(e.x, e.y, 18, ["#f2c14e", "#fff3a0", INK_SPECK], 380, 0.4, 9);
        this.rings.push({ x: e.x, y: e.y, radius: 70, life: 0.25, max: 0.25, color: "#f2c14e" });
        this.addShake(10);
        break;
      }
      case "zone":
        if (e.style === "fire") {
          this.burst(e.x, e.y, 24, ["#ff8a2a", "#ffd45e", "#c23a1b", INK_SPECK], 300, 0.7, 12);
        } else {
          this.burst(e.x, e.y, 10, [POISON_GREEN, "#2e6b22"], 160, 0.4, 7);
        }
        break;
      case "shield": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 18, ["#ffd45e", "#fff3a0", INK_SPECK], 340, 0.45, 8);
        break;
      }
      case "ultimate": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 40, ["#ffd45e", "#fff3a0", SIDES[f.side].light], 520, 0.9, 11);
        this.rings.push({ x: f.x, y: f.y, radius: 220, life: 0.5, max: 0.5, color: "#ffd45e" });
        this.flash = Math.max(this.flash, 0.4);
        this.addShake(14);
        break;
      }
      case "ultimateCast": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 70, ["#ffffff", "#ffd45e", SIDES[f.side].main], 900, 1, 14);
        this.rings.push({ x: f.x, y: f.y, radius: 420, life: 0.6, max: 0.6, color: "#ffffff" });
        this.flash = 1;
        this.addShake(40);
        break;
      }
      case "strike":
        if (e.style === "shell") {
          this.burst(e.x, e.y, 40, ["#ffb15c", "#ffd45e", "#ff6a3c", INK_SPECK], 600, 0.7, 13);
          this.rings.push({
            x: e.x,
            y: e.y,
            radius: e.radius,
            life: 0.4,
            max: 0.4,
            color: "#ffb15c",
          });
          this.flash = Math.max(this.flash, 0.3);
          this.addShake(e.radius > 120 ? 46 : 22);
        } else {
          this.burst(e.x, e.y, 5, ["#e8d8b0", "#b9a47a"], 160, 0.3, 6);
        }
        break;
      case "stomp":
        this.rings.push({
          x: e.x,
          y: e.y,
          radius: e.radius,
          life: 0.35,
          max: 0.35,
          color: "#ffd45e",
        });
        this.burst(e.x, e.y, 24, ["#c9a27a", INK_SPECK, "#ffd45e"], 480, 0.5, 10);
        this.addShake(24);
        break;
      case "nearMiss": {
        const phrase = NEAR_MISS_WORDS[(e.count - 1) % NEAR_MISS_WORDS.length] ?? "SO CLOSE!";
        this.texts.push({
          x: e.x,
          y: e.y - 30,
          vy: -90,
          life: 0.9,
          max: 0.9,
          text: phrase,
          color: "#ffd45e",
          size: 54,
        });
        this.burst(e.x, e.y, 10, ["#ffd45e", INK_SPECK], 260, 0.35, 7);
        break;
      }
      case "frenzy":
        if (!e.on) break;
        this.texts.push({
          x: 360,
          y: 330,
          vy: -20,
          life: 1.2,
          max: 1.2,
          text: "ARENA SHRINKS!",
          color: "#ff6a4a",
          size: 104,
        });
        this.texts.push({
          x: 360,
          y: 420,
          vy: -20,
          life: 1.2,
          max: 1.2,
          text: "SPEED +25%",
          color: "#ffd45e",
          size: 64,
        });
        this.flash = Math.max(this.flash, 0.5);
        this.addShake(26);
        break;
      case "callout":
        // VENI / VIDI / VICI: huge words in the middle of the arena.
        this.texts.push({
          x: 360,
          y: 300,
          vy: -30,
          life: 0.6,
          max: 0.6,
          text: e.text,
          color: SIDES[world.fighters[e.fighter]?.side ?? 0].main,
          size: 190,
        });
        this.flash = Math.max(this.flash, 0.5);
        this.addShake(20);
        break;
      case "sweepHit":
        this.burst(e.x, e.y, 36, [INK_SPECK, "#ffd45e", "#ffb15c"], 700, 0.7, 13);
        this.addShake(30);
        this.flash = Math.max(this.flash, 0.4);
        break;
      case "slam": {
        this.burst(e.x, e.y, 50, [INK_SPECK, "#ffd45e", "#c8202a"], 800, 0.8, 14);
        this.rings.push({ x: e.x, y: e.y, radius: 200, life: 0.4, max: 0.4, color: "#ffd45e" });
        this.text(e.x, e.y, "SLAM!", "#ffd45e", 64, 1);
        this.flash = Math.max(this.flash, 0.6);
        this.addShake(46);
        break;
      }
      case "skill": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        // No text: the move itself shows what happens. Just a little sparkle.
        this.burst(f.x, f.y, e.small ? 6 : 14, [SIDES[f.side].light, "#ffffff"], 260, 0.35, 7);
        break;
      }
      case "stun": {
        const f = world.fighters[e.fighter];
        if (f) this.burst(f.x, f.y - f.radius, 10, ["#ffd45e", "#fff3a0"], 220, 0.4, 7);
        break;
      }
      case "poison": {
        const f = world.fighters[e.fighter];
        if (!f) break;
        this.burst(f.x, f.y, 16, [POISON_GREEN, "#c8ffb8"], 280, 0.45, 8);
        break;
      }
      case "ko": {
        const side = SIDES[world.fighters[e.fighter]?.side ?? 0];
        this.burst(e.x, e.y, 80, [side.main, side.light, INK_SPECK, side.dark], 620, 1.1, 13);
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

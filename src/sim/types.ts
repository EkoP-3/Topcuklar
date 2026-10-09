import type { Vec } from "./geom";
import type { World } from "./world";

/** Static description of a character. Pure data plus an optional ability factory. */
export interface FighterDef {
  id: string;
  name: string;
  /** One-line Turkish description shown in the UI. */
  description: string;
  hp: number;
  /** Body radius. */
  radius: number;
  mass: number;
  /** Cruising speed (units/second). Knockback decays back toward this. */
  baseSpeed: number;
  /** Weapon rotation speed (radians/second). */
  spin: number;
  /** How far the weapon sticks out past the body edge. */
  reach: number;
  /** Weapon thickness (hit width). */
  thickness: number;
  /** Damage per weapon hit before multipliers. */
  damage: number;
  /** Speed added to the victim along the attacker->victim line. */
  knockback: number;
  /** Minimum seconds between two weapon hits on the same victim. */
  hitInterval: number;
  /** Creates a fresh per-match ability instance (holds its own state). */
  createAbility?: () => Ability;
}

export interface WallHit {
  /** Contact point on the wall. */
  x: number;
  y: number;
  /** Wall normal pointing into the arena. */
  nx: number;
  ny: number;
}

/** Behaviour hooks a character can plug into. All optional. */
export interface Ability {
  onTick?(world: World, self: Fighter, dt: number): void;
  onWallHit?(world: World, self: Fighter, hit: WallHit): void;
  onHitDealt?(world: World, self: Fighter, target: Fighter, damage: number): void;
  damageMultiplier?(self: Fighter): number;
  knockbackMultiplier?(self: Fighter): number;
  /** Short status text for the telemetry panel, e.g. "[CHARGING]". */
  hud?(self: Fighter): string;
  /** 0..n, lets the renderer tint the weapon as it levels up. */
  visualLevel?(): number;
}

export interface Fighter {
  index: number;
  /** Team: 0 = green, 1 = blue. */
  side: 0 | 1;
  def: FighterDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Current weapon angle (radians). */
  angle: number;
  /** Rotation direction of the weapon. A clash flips it. */
  spinDir: 1 | -1;
  /** Seconds left of the "just got hurt" flash. */
  hurt: number;
  /** Seconds until this fighter's weapon may hit fighter [i] again. */
  hitLock: number[];
  ability: Ability | null;
  /** Temporary modifiers abilities can set. */
  speedMul: number;
  spinMul: number;
  /** How fast speed relaxes toward the target speed (1/second). */
  relax: number;
  /** While true the weapon passes through other weapons (no clash). */
  noClash: boolean;
  /** Renderer hint: draw a motion trail. */
  trail: boolean;
}

/** Things that live in the arena besides fighters. Abilities own and update them. */
export type Hazard =
  | { kind: "pylon"; owner: number; x: number; y: number; age: number }
  | { kind: "arc"; owner: number; points: Vec[]; ttl: number; maxTtl: number }
  | {
      kind: "hook";
      owner: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      bounces: number;
      ttl: number;
      /** Index of the fighter the hook is attached to, or -1. */
      attached: number;
    }
  | { kind: "ring"; owner: number; x: number; y: number; radius: number; maxRadius: number };

export type PylonHazard = Extract<Hazard, { kind: "pylon" }>;
export type ArcHazard = Extract<Hazard, { kind: "arc" }>;
export type HookHazard = Extract<Hazard, { kind: "hook" }>;
export type RingHazard = Extract<Hazard, { kind: "ring" }>;

/** Things that happened during a step. The renderer turns these into effects. */
export type SimEvent =
  | { type: "fight" }
  | { type: "hit"; attacker: number; target: number; damage: number; x: number; y: number }
  | { type: "clash"; x: number; y: number }
  | { type: "wall"; fighter: number; x: number; y: number }
  | { type: "bump"; x: number; y: number; strength: number }
  | { type: "levelUp"; fighter: number; level: number }
  | { type: "ring"; fighter: number; x: number; y: number }
  | { type: "pylon"; fighter: number; x: number; y: number }
  | { type: "arc"; fighter: number }
  | { type: "hookLaunch"; fighter: number }
  | { type: "hookAttach"; fighter: number; x: number; y: number }
  | { type: "charge"; fighter: number }
  | { type: "dash"; fighter: number }
  | { type: "ko"; fighter: number; x: number; y: number }
  | { type: "timeUp" };

export type Phase = "intro" | "fight" | "ko" | "over";

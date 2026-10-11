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
  /** Damage dealt by touching an enemy body (weaponless fighters). */
  contactDamage?: number;
  /** Minimum seconds between two contact hits on the same victim. */
  contactInterval?: number;
  /** History mode: lifetime shown under the name, e.g. "356–323 BC". */
  era?: string;
  /** History mode: one-line English fact shown during the match. */
  fact?: string;
  /** History mode: flag or banner id drawn next to the name (see render/flags.ts). */
  flag?: string;
  /** History mode: signature move, shown in the top panel. */
  ability?: { name: string; text: string };
  /**
   * History mode: all damage this fighter deals grows by `perSecond` (fraction) every
   * full second of the fight; replaces the generic enrage. `stat`/`base` describe the
   * signature number shown growing in the bottom panel, e.g. "BOMBARD DMG" 170.
   */
  growth?: { perSecond: number; stat: string; base: number };
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
  /** Called after this fighter took damage (after reductions). */
  onDamaged?(world: World, self: Fighter, attacker: Fighter, damage: number): void;
  /** Called when this fighter's weapon crosses an enemy weapon. */
  onClash?(world: World, self: Fighter, other: Fighter): void;
  damageMultiplier?(self: Fighter): number;
  knockbackMultiplier?(self: Fighter): number;
  /** Short status text for the telemetry panel, e.g. "[CHARGING]". */
  hud?(self: Fighter): string;
  /** Timed signature move state, for the cooldown bar (history mode). */
  skillState?(): { progress: number; ready: boolean; level: number };
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
  /** Incoming damage is multiplied by this (shields lower it). */
  damageTakenMul: number;
  /** Renderer hint: draw a shield bubble. */
  shielded: boolean;
  /** Seconds left stunned: slowed and the ability timer is frozen. */
  stun: number;
  /** Seconds of poison left, its damage per second and who applied it. */
  poison: number;
  poisonDps: number;
  poisonBy: number;
  /** Poison damage built up but not yet dealt. */
  poisonAcc: number;
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
  | { kind: "ring"; owner: number; x: number; y: number; radius: number; maxRadius: number }
  | UnitHazard
  | ProjectileHazard;

/** A summoned soldier/animal that chases the nearest enemy and hurts on contact. */
export interface UnitHazard {
  kind: "unit";
  owner: number;
  style: "legion" | "elephant";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  speed: number;
  hp: number;
  maxHp: number;
  damage: number;
  knockback: number;
  /** Seconds the victim is stunned by a hit. */
  stun: number;
  hitInterval: number;
  /** Seconds until it may hit fighter / unit again (shared lock). */
  lock: number;
  ttl: number;
  hurt: number;
}

/** Arrow, cannonball or similar: flies straight, hurts the first enemy it touches. */
export interface ProjectileHazard {
  kind: "projectile";
  owner: number;
  style: "arrow" | "ball" | "bombard" | "asp";
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  knockback: number;
  /** Explosion radius on impact (0 = none). Nearby enemies take half damage. */
  blast: number;
  /** Poison applied on hit: seconds and damage per second. */
  poison: number;
  poisonDps: number;
  /** Wall bounces left; the next wall touch after that removes it. */
  bounces: number;
  ttl: number;
}

export type PylonHazard = Extract<Hazard, { kind: "pylon" }>;
export type ArcHazard = Extract<Hazard, { kind: "arc" }>;
export type HookHazard = Extract<Hazard, { kind: "hook" }>;
export type RingHazard = Extract<Hazard, { kind: "ring" }>;

/** Things that happened during a step. The renderer turns these into effects. */
export type SimEvent =
  | { type: "fight" }
  | {
      type: "hit";
      attacker: number;
      target: number;
      damage: number;
      x: number;
      y: number;
      /** Damage over time (poison tick): no hit-stop, quieter effects. */
      dot?: boolean;
    }
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
  | { type: "summon"; fighter: number; style: UnitHazard["style"]; x: number; y: number }
  | { type: "shoot"; fighter: number; style: ProjectileHazard["style"] }
  | { type: "blast"; x: number; y: number; radius: number }
  | { type: "unitDown"; x: number; y: number; side: 0 | 1 }
  | { type: "shield"; fighter: number }
  | { type: "skill"; fighter: number; name: string; small: boolean }
  | { type: "stun"; fighter: number }
  | { type: "poison"; fighter: number }
  | { type: "ko"; fighter: number; x: number; y: number }
  | { type: "timeUp" };

export type Phase = "intro" | "fight" | "ko" | "over";

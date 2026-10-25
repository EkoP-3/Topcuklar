import type { FighterDef } from "../types";

/**
 * Each leader carries a weapon from their own culture, spinning around the ball like
 * in weapon mode. It is a light extra: the signature moves still do most of the work.
 * Artwork: `src/assets/weapons/<leader id>.png`; without it, `art` (a weapon-mode
 * drawing) stands in.
 */
interface LeaderWeapon {
  /** Length past the body (arena units). */
  reach: number;
  /** Hit width. */
  thickness: number;
  art: string;
  /** Balance: weapon damage multiplier (default 1). */
  power?: number;
}

const WEAPONS: Record<string, LeaderWeapon> = {
  alexander: { reach: 80, thickness: 14, art: "lance" }, // sarissa
  caesar: { reach: 44, thickness: 18, art: "sword" }, // gladius
  cleopatra: { reach: 50, thickness: 16, art: "sword" }, // khopesh
  genghis: { reach: 54, thickness: 16, art: "sword", power: 1.5 }, // saber
  hannibal: { reach: 60, thickness: 18, art: "lance", power: 0.4 }, // tusk spear
  harald: { reach: 62, thickness: 20, art: "axe" }, // Dane axe
  joan: { reach: 66, thickness: 18, art: "lance", power: 1.6 }, // banner lance
  leonidas: { reach: 70, thickness: 14, art: "lance", power: 0.7 }, // dory
  mehmed: { reach: 56, thickness: 16, art: "sword", power: 0.6 }, // kilij
  napoleon: { reach: 70, thickness: 14, art: "lance" }, // bayonet musket
  nobunaga: { reach: 60, thickness: 14, art: "sword" }, // katana
  qin: { reach: 52, thickness: 16, art: "sword", power: 1.7 }, // jian
  richard: { reach: 60, thickness: 16, art: "sword", power: 1.7 }, // longsword
  saladin: { reach: 56, thickness: 16, art: "sword", power: 1.4 }, // scimitar
  shaka: { reach: 46, thickness: 16, art: "lance" }, // iklwa
  vlad: { reach: 62, thickness: 16, art: "lance", power: 0.7 }, // stake
};

/** Damage of a weapon hit at the reference reach; longer weapons hit a little softer. */
const WEAPON_DAMAGE = 12;
const REFERENCE_REACH = 60;
const WEAPON_SPIN = 2.6;
const WEAPON_HIT_INTERVAL = 0.6;

/** Drawing to use for a leader's weapon when there is no artwork for it. */
export function weaponArt(id: string): string {
  return WEAPONS[id]?.art ?? "sword";
}

/** The leader with their cultural weapon in hand. */
export function armed(def: FighterDef): FighterDef {
  const w = WEAPONS[def.id];
  if (!w) return def;
  return {
    ...def,
    reach: w.reach,
    thickness: w.thickness,
    spin: WEAPON_SPIN,
    damage: Math.round(((w.power ?? 1) * WEAPON_DAMAGE * REFERENCE_REACH) / w.reach),
    hitInterval: WEAPON_HIT_INTERVAL,
  };
}

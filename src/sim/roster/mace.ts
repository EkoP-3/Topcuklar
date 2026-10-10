import type { Ability, Fighter, FighterDef } from "../types";

/** Damage grows with speed: slow = weak, knocked-around or dashing = brutal. */
function momentum(f: Fighter): number {
  const speed = Math.hypot(f.vx, f.vy);
  return Math.min(3, Math.max(0.7, 0.6 + speed / 420));
}

export const mace: FighterDef = {
  id: "mace",
  name: "MACE",
  description:
    "Vuruşunun gücü hızına bağlı. Yavaşken zayıf, savrulurken veya hızlanırken çok sert vurur.",
  hp: 110,
  radius: 52,
  mass: 1.8,
  baseSpeed: 420,
  spin: 4.6,
  reach: 86,
  thickness: 32,
  damage: 12.5,
  knockback: 520,
  hitInterval: 0.5,
  createAbility: () => {
    const ability: Ability = {
      damageMultiplier: (self) => momentum(self),
      knockbackMultiplier: (self) => 0.7 + momentum(self) * 0.3,
      hud: () => "[MOMENTUM]",
    };
    return ability;
  },
};

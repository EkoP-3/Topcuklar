import type { Ability, FighterDef } from "../types";

/** Damage multiplier per level. Level goes up every time DRILL hits a wall. */
const LEVEL_MUL = [1, 1.6, 2.3, 3.2, 4.4, 6] as const;
const MAX_LEVEL = LEVEL_MUL.length - 1;

export const drill: FighterDef = {
  id: "drill",
  name: "DRILL",
  description: "Duvara çarptıkça seviye atlar. Seviye yükseldikçe vuruşları çok daha sert olur.",
  hp: 100,
  radius: 46,
  mass: 1,
  baseSpeed: 520,
  spin: 7.5,
  reach: 78,
  thickness: 24,
  damage: 3.2,
  knockback: 240,
  hitInterval: 0.18,
  createAbility: () => {
    let level = 0;
    const ability: Ability = {
      onWallHit(world, self) {
        if (level >= MAX_LEVEL) return;
        level++;
        world.emit({ type: "levelUp", fighter: self.index, level });
      },
      damageMultiplier: () => LEVEL_MUL[level] ?? 1,
      hud: () => (level >= MAX_LEVEL ? "[MAX POWER] LV:5" : `[MINING WALL] LV:${level}`),
      visualLevel: () => level,
    };
    return ability;
  },
};

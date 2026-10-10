import type { Ability, FighterDef } from "../types";

const MAX_STACKS = 6;
const PER_STACK = 0.2;
/** Seconds without landing a hit before one stack of fury fades. */
const FADE_AFTER = 3.5;

export const axe: FighterDef = {
  id: "axe",
  name: "AXE",
  description:
    "Ağır ve yavaş. Her isabet öfkesini büyütür, sonraki vuruşlar daha sert iner; uzun süre vuramazsa öfke söner.",
  hp: 125,
  radius: 50,
  mass: 1.4,
  baseSpeed: 440,
  spin: 5.2,
  reach: 92,
  thickness: 30,
  damage: 15,
  knockback: 480,
  hitInterval: 0.5,
  createAbility: () => {
    let stacks = 0;
    let idle = 0;
    const ability: Ability = {
      onHitDealt() {
        stacks = Math.min(MAX_STACKS, stacks + 1);
        idle = 0;
      },
      onTick(_world, _self, dt) {
        if (stacks === 0) return;
        idle += dt;
        if (idle >= FADE_AFTER) {
          stacks--;
          idle = 0;
        }
      },
      damageMultiplier: () => 1 + PER_STACK * stacks,
      hud: () => `[FURY ${stacks}/${MAX_STACKS}]`,
    };
    return ability;
  },
};

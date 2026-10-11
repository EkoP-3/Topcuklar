import type { Ability, FighterDef } from "../types";

const RIPOSTE_TIME = 2.2;
const RIPOSTE_MUL = 2.8;

export const sword: FighterDef = {
  id: "sword",
  name: "SWORD",
  description:
    "Dengeli düellocu. Rakibin silahını savuşturduğu anda karşı vuruş hakkı kazanır; ilk isabeti iki kattan fazla vurur.",
  hp: 122,
  radius: 44,
  mass: 1,
  baseSpeed: 500,
  spin: 6.5,
  reach: 100,
  thickness: 18,
  damage: 8.5,
  knockback: 300,
  hitInterval: 0.4,
  createAbility: () => {
    let riposte = 0;
    const ability: Ability = {
      onClash() {
        riposte = RIPOSTE_TIME;
      },
      onTick(_world, _self, dt) {
        if (riposte > 0) riposte = Math.max(0, riposte - dt);
      },
      damageMultiplier: () => (riposte > 0 ? RIPOSTE_MUL : 1),
      onHitDealt() {
        riposte = 0;
      },
      hud: () => (riposte > 0 ? `[RIPOSTE ${riposte.toFixed(1)}s]` : "[GUARD]"),
    };
    return ability;
  },
};

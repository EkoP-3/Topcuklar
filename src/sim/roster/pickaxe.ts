import type { Ability, FighterDef } from "../types";

const READY_TIME = 3;
const CRIT = 3;

export const pickaxe: FighterDef = {
  id: "pickaxe",
  name: "PICKAXE",
  description:
    "Hızlı ve çevik. Duvara her çarpışında bir sonraki vuruşunu kritik yapar; kritik hazırken vurmazsa süresi dolar.",
  hp: 100,
  radius: 44,
  mass: 1,
  baseSpeed: 540,
  spin: 8,
  reach: 82,
  thickness: 22,
  damage: 6.5,
  knockback: 220,
  hitInterval: 0.2,
  createAbility: () => {
    let ready = 0;
    const ability: Ability = {
      onWallHit() {
        ready = READY_TIME;
      },
      onTick(_world, _self, dt) {
        if (ready > 0) ready = Math.max(0, ready - dt);
      },
      damageMultiplier: () => (ready > 0 ? CRIT : 1),
      onHitDealt() {
        ready = 0;
      },
      hud: () => (ready > 0 ? `[CRIT READY ${ready.toFixed(1)}s]` : "[DIGGING]"),
    };
    return ability;
  },
};

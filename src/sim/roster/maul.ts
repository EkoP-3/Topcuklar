import type { FighterDef } from "../types";

export const maul: FighterDef = {
  id: "maul",
  name: "MAUL",
  description: "Yavaş ve ağır. Özel yeteneği yok ama her vuruşu rakibi duvara fırlatır.",
  hp: 135,
  radius: 54,
  mass: 2.2,
  baseSpeed: 400,
  spin: 5.6,
  reach: 92,
  thickness: 34,
  damage: 15,
  knockback: 820,
  hitInterval: 0.45,
};

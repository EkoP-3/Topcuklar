import type { FighterDef } from "../types";
import { axe } from "./axe";
import { chime } from "./chime";
import { drill } from "./drill";
import { grapple } from "./grapple";
import { lance } from "./lance";
import { mace } from "./mace";
import { maul } from "./maul";
import { pickaxe } from "./pickaxe";
import { pylon } from "./pylon";
import { sword } from "./sword";

/** Every character in the game. Adding a character = adding a file and listing it here. */
export const ROSTER: readonly FighterDef[] = [
  drill,
  chime,
  pylon,
  grapple,
  lance,
  maul,
  axe,
  pickaxe,
  sword,
  mace,
];

export function findDef(id: string): FighterDef | undefined {
  return ROSTER.find((d) => d.id === id);
}

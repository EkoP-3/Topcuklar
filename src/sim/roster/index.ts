import type { FighterDef } from "../types";
import { chime } from "./chime";
import { drill } from "./drill";
import { grapple } from "./grapple";
import { lance } from "./lance";
import { maul } from "./maul";
import { pylon } from "./pylon";

/** Every character in the game. Adding a character = adding a file and listing it here. */
export const ROSTER: readonly FighterDef[] = [drill, chime, pylon, grapple, lance, maul];

export function findDef(id: string): FighterDef | undefined {
  return ROSTER.find((d) => d.id === id);
}

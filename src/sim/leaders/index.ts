import type { FighterDef } from "../types";
import { alexander } from "./alexander";
import { caesar } from "./caesar";
import { cleopatra } from "./cleopatra";
import { genghis } from "./genghis";
import { hannibal } from "./hannibal";
import { leonidas } from "./leonidas";
import { mehmed } from "./mehmed";
import { napoleon } from "./napoleon";

/** History mode: weaponless leaders with a signature move on a timer. */
export const LEADERS: readonly FighterDef[] = [
  alexander,
  genghis,
  caesar,
  hannibal,
  napoleon,
  leonidas,
  mehmed,
  cleopatra,
];

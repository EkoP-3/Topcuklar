import type { FighterDef } from "../types";
import { alexander } from "./alexander";
import { caesar } from "./caesar";
import { cleopatra } from "./cleopatra";
import { genghis } from "./genghis";
import { hannibal } from "./hannibal";
import { leonidas } from "./leonidas";
import { mehmed } from "./mehmed";
import { napoleon } from "./napoleon";
import { vlad } from "./vlad";
import { richard } from "./richard";
import { saladin } from "./saladin";
import { qin } from "./qin";
import { joan } from "./joan";
import { harald } from "./harald";
import { nobunaga } from "./nobunaga";
import { shaka } from "./shaka";

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
  vlad,
  richard,
  saladin,
  qin,
  joan,
  harald,
  nobunaga,
  shaka,
];

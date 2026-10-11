import { LEADERS } from "./leaders";
import { ROSTER } from "./roster";
import type { FighterDef } from "./types";

/** Every playable roster. Each match uses fighters from one roster only. */
export const ROSTERS = {
  leaders: LEADERS,
  weapons: ROSTER,
} as const satisfies Record<string, readonly FighterDef[]>;

export type RosterId = keyof typeof ROSTERS;

export const ROSTER_LABELS: Record<RosterId, string> = {
  leaders: "Tarih (liderler)",
  weapons: "Silahlar",
};

export function isRosterId(id: string | null | undefined): id is RosterId {
  return id === "leaders" || id === "weapons";
}

export function findIn(roster: RosterId, id: string): FighterDef | undefined {
  return ROSTERS[roster].find((d) => d.id === id);
}

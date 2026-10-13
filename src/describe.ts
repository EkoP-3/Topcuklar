import type { FighterDef } from "./sim/types";

/** The ultimate's name, read from a fresh ability instance ("" for non-leaders). */
export function ultimateName(def: FighterDef): string {
  return def.growth ? (def.createAbility?.().skillState?.().ultName ?? "") : "";
}

function tag(def: FighterDef): string {
  return `#${(def.fullName ?? def.name).split(/[\s(]/)[0]?.replace(/[^A-Za-z]/g, "") ?? ""}`;
}

/**
 * English upload text for a match: title, the two leaders with a fact each, the
 * ultimates, a call to comment, sources and hashtags. Pasted into YouTube/Instagram.
 */
export function videoDescription(a: FighterDef, b: FighterDef): string {
  const name = (d: FighterDef) => d.fullName ?? d.name;
  const who = (d: FighterDef) =>
    [name(d), [d.title, d.era].filter(Boolean).join(", ")].filter(Boolean).join(" — ");
  const lines = [
    `${name(a)} vs ${name(b)}: Who Would Win? #shorts`,
    "",
    `⚔️ ${who(a)}`,
    `⚔️ ${who(b)}`,
    "",
  ];
  for (const d of [a, b]) if (d.fact) lines.push(`📜 ${name(d)}: ${d.fact}`);
  const ua = ultimateName(a);
  const ub = ultimateName(b);
  if (ua && ub) lines.push("", `Ultimates: ${ua} vs ${ub}`);
  lines.push("", "Who should fight next? Comment below! 👇");
  const sources = [a, b].flatMap((d) => d.sources ?? []);
  if (sources.length > 0) lines.push("", "Sources:", ...sources.map((s) => `- ${s}`));
  lines.push("", ["#history", "#whowouldwin", "#simulation", tag(a), tag(b), "#shorts"].join(" "));
  return lines.join("\n");
}

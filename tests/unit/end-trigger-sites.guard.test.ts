/// <reference types="node" />
/**
 * Every "ends early on …" the catalogue declares has a place that fires it. A state's
 * `endsEarlyOn` names either an act the creature performs (an attack roll, damage
 * dealt, a spell) or a fact that becomes true (Incapacitated, heavy armor donned). For
 * months "deal-damage" was declared and fired nowhere: Invisibility, Sanctuary and
 * Potion of Invisibility ignored the damage clause. This sweep reads the composed
 * catalogue, so a new trigger without a firing site fails here.
 *
 *  - an ACT fires where a use emits it (`actsOfUse`) or where a caller performs it
 *    (`performAct("<act>")`);
 *  - a FACT fires where a caller ends the states on it
 *    (`resolveActiveStatesEndingOn(…, "<fact>")`).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import { SRD_RACES } from "@/data/races";
import { spells } from "@/data/spells";
import { REPO_ROOT } from "./__helpers__/static-import-graph";

/** Every `endsEarlyOn` value anywhere in `value` (the data shares objects, so each is
 *  walked once). */
function endTriggers(
  value: unknown,
  out = new Set<string>(),
  seen = new WeakSet<object>()
): Set<string> {
  if (!value || typeof value !== "object" || seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) endTriggers(item, out, seen);
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "endsEarlyOn" && Array.isArray(child)) {
      for (const trigger of child) if (typeof trigger === "string") out.add(trigger);
    } else endTriggers(child, out, seen);
  }
  return out;
}

/** The app's source, concatenated (tests excluded). */
function sourceText(): string {
  const parts: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry))
        parts.push(`// ${relative(REPO_ROOT, abs)}\n${readFileSync(abs, "utf8")}`);
    }
  };
  walk(join(REPO_ROOT, "src"));
  return parts.join("\n");
}

describe("every end trigger the catalogue declares has a firing site", () => {
  const triggers = endTriggers([
    spells,
    SRD_MAGIC_ITEMS,
    SRD_FEATS,
    classFeatures,
    SRD_RACES,
    SRD_INVOCATIONS,
    SRD_MANEUVERS,
  ]);
  const src = sourceText();
  const states = readFileSync(join(REPO_ROOT, "src/lib/play/states.ts"), "utf8");
  const emittedByUse = new Set(
    [
      ...(states.match(/export function actsOfUse[\s\S]*?\n\}/)?.[0] ?? "").matchAll(
        /acts\.push\("([\w-]+)"\)/g
      ),
    ].map((m) => m[1])
  );

  it("reads the catalogue and the use's acts", () => {
    expect(triggers.has("attack-roll")).toBe(true);
    expect(triggers.has("deal-damage")).toBe(true);
    expect(emittedByUse.has("attack-roll")).toBe(true);
  });

  it.each([...triggers].sort())("%s fires somewhere", (trigger) => {
    const sites = [
      emittedByUse.has(trigger),
      new RegExp(`performAct\\(\\s*"${trigger}"`).test(src),
      new RegExp(`resolveActiveStatesEndingOn\\([^)]*"${trigger}"\\)`).test(src),
    ];
    expect(sites.some(Boolean), `"${trigger}" is declared but fired nowhere`).toBe(true);
  });
});

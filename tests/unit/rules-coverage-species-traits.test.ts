/**
 * The "Species traits" row of docs/RULES_COVERAGE.md is counted, not estimated.
 * Rule: 1-tap = the trait has a counter or an action row, or its only grants are
 * casts and toggled states; auto = it declares any other standing grant (a sense,
 * a resistance, a reroll, a pick the engine applies); reference = it declares
 * nothing. Dragonborn Damage Resistance is carried by Draconic Ancestry's chosen
 * option, so it counts as auto. Impossible is 0: every trait can be noted by hand.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SRD_RACES } from "@/data/races";
import type { SrdRaceTrait } from "@/data/types";
import type { Grant } from "@/lib/grant-schema";

const TAP_ONLY = new Set([
  "while-active",
  "always-prepared-spell",
  "free-cast-spell",
  "free-cast-from-list",
  "at-will-cast-spell",
  "choice-cantrip",
  "choice-spell",
]);

const CARRIED_BY_SIBLING = new Set(["dragonborn:damage-resistance"]);

function leafKinds(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((grant) =>
    grant.type === "choice-grant-bundle"
      ? grant.options.flatMap((option) => leafKinds(option.grants))
      : [grant.type]
  );
}

function classOf(raceId: string, trait: SrdRaceTrait): "auto" | "tap" | "reference" {
  if (CARRIED_BY_SIBLING.has(`${raceId}:${trait.id}`)) return "auto";
  const kinds = leafKinds(trait.grants ?? []);
  if (trait.mechanics?.tracker || trait.mechanics?.actions?.length) return "tap";
  if (kinds.length === 0) return "reference";
  return kinds.every((kind) => TAP_ONLY.has(kind)) ? "tap" : "auto";
}

describe("RULES_COVERAGE species-trait row", () => {
  it("states the counted auto / 1-tap / reference split of the public species", () => {
    // The public species only (the composed build merges the pack's in).
    const traits = SRD_RACES.filter((race) => race.source === "SRD").flatMap((race) =>
      race.traits.map((trait) => classOf(race.id, trait))
    );
    const count = (c: ReturnType<typeof classOf>) => traits.filter((t) => t === c).length;
    const row = `Species traits (${traits.length})`;
    const line = readFileSync("docs/RULES_COVERAGE.md", "utf8")
      .split("\n")
      .find((l) => l.includes(row));
    expect(line, row).toBeDefined();
    expect(line).toMatch(
      new RegExp(
        `\\| ${count("auto")} / ${count("tap")} / ${count("reference")} / 0 +\\|`
      )
    );
  });
});

/**
 * The "Spells" row of docs/RULES_COVERAGE.md is counted, not estimated. Rule:
 * auto = casting lights a state whose grants the engine applies (a bonus, a
 * resistance, a speed, a rider: anything but a reminder note); 1-tap = the cast
 * carries a structured consequence (damage, healing, temp HP, a condition, a
 * stabilize or revive, an attack or a save, a follow-up, a summon, a program, a
 * reminder state) or runs on a dedicated engine path (Wish, Time Stop, the
 * self-transformations, Find Familiar); reference = it declares nothing
 * structured. Impossible is 0: every spell can be cast, logged and noted by hand.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SRD_CANTRIPS } from "@/data/spells/cantrips";
import { SRD_SPELLS_LEVEL1 } from "@/data/spells/level1";
import { SRD_SPELLS_LEVEL2 } from "@/data/spells/level2";
import { SRD_SPELLS_LEVEL3 } from "@/data/spells/level3";
import { SRD_SPELLS_LEVEL4 } from "@/data/spells/level4";
import { SRD_SPELLS_LEVEL5 } from "@/data/spells/level5";
import { SRD_SPELLS_LEVEL6 } from "@/data/spells/level6";
import { SRD_SPELLS_LEVEL7 } from "@/data/spells/level7";
import { SRD_SPELLS_LEVEL8 } from "@/data/spells/level8";
import { SRD_SPELLS_LEVEL9 } from "@/data/spells/level9";
import type { SrdSpellData } from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import type { Grant } from "@/lib/grant-schema";

/** Spells a dedicated engine module runs from their id (src/lib/play/wish.ts,
 *  extra-turns.ts, polymorph.ts, familiar-ids.ts). */
const ENGINE_OWNED = new Set([
  "wish",
  "time-stop",
  "shapechange",
  "animal-shapes",
  "find-familiar",
]);

function leafKinds(grants: ReadonlyArray<Grant>): string[] {
  return grants.flatMap((grant) =>
    grant.type === "while-active"
      ? leafKinds(grant.grants)
      : grant.type === "choice-grant-bundle"
        ? grant.options.flatMap((option) => leafKinds(option.grants))
        : [grant.type]
  );
}

function classOf(spell: SrdSpellData): "auto" | "tap" | "reference" {
  const lit = (spell.grants ?? []).filter((grant) => grant.type === "while-active");
  if (leafKinds(lit).some((kind) => kind !== "defense-note")) return "auto";
  const { activity, gaps } = translateSpell(spell);
  const structured =
    activity.effects.length > 0 ||
    activity.attack !== undefined ||
    activity.save !== undefined ||
    activity.followUp !== undefined ||
    activity.repeats !== undefined ||
    gaps.length > 0;
  return structured || ENGINE_OWNED.has(spell.id) ? "tap" : "reference";
}

describe("RULES_COVERAGE spell row", () => {
  it("states the counted auto / 1-tap / reference split of the public spells", () => {
    const all = [
      ...SRD_CANTRIPS,
      ...SRD_SPELLS_LEVEL1,
      ...SRD_SPELLS_LEVEL2,
      ...SRD_SPELLS_LEVEL3,
      ...SRD_SPELLS_LEVEL4,
      ...SRD_SPELLS_LEVEL5,
      ...SRD_SPELLS_LEVEL6,
      ...SRD_SPELLS_LEVEL7,
      ...SRD_SPELLS_LEVEL8,
      ...SRD_SPELLS_LEVEL9,
    ];
    const count = (c: ReturnType<typeof classOf>) =>
      all.filter((spell) => classOf(spell) === c).length;
    const row = `Spells (${all.length})`;
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

  it("every engine-owned id names a public spell", () => {
    const ids = new Set(
      SRD_SPELLS_LEVEL9.concat(SRD_SPELLS_LEVEL8, SRD_SPELLS_LEVEL1).map((s) => s.id)
    );
    for (const id of ENGINE_OWNED) expect(ids.has(id), id).toBe(true);
  });
});

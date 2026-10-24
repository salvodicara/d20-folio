/**
 * The "Magic items" row of docs/RULES_COVERAGE.md is counted, not estimated. Rule:
 * auto = the item declares at least one standing grant (a resistance, a bonus, a
 * sense, a score) the engine applies while it is worn; 1-tap = its only structured
 * mechanics are casts, activations, drunk states or a typed resource counter (or a
 * healing formula); reference = it declares nothing structured. Impossible is 0:
 * every item can be noted by hand.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAGIC_ITEMS_PART_1 } from "@/data/magic-items/part-1";
import { MAGIC_ITEMS_PART_2 } from "@/data/magic-items/part-2";
import { MAGIC_ITEMS_PART_3 } from "@/data/magic-items/part-3";
import type { SrdMagicItemData } from "@/data/types";

const TAP_ONLY = new Set([
  "while-active",
  "always-prepared-spell",
  "free-cast-spell",
  "free-cast-from-list",
  "at-will-cast-spell",
]);

function classOf(item: SrdMagicItemData): "auto" | "tap" | "reference" {
  const grants = item.grants ?? [];
  if (grants.some((grant) => !TAP_ONLY.has(grant.type))) return "auto";
  if (grants.length > 0 || item.resources?.length || item.potionFormula) return "tap";
  return "reference";
}

describe("RULES_COVERAGE magic-item row", () => {
  it("states the counted auto / 1-tap / reference split of the public catalogue", () => {
    const items = [...MAGIC_ITEMS_PART_1, ...MAGIC_ITEMS_PART_2, ...MAGIC_ITEMS_PART_3];
    const count = (c: ReturnType<typeof classOf>) =>
      items.filter((i) => classOf(i) === c).length;
    const row = `Magic items (${items.length})`;
    const doc = readFileSync("docs/RULES_COVERAGE.md", "utf8");
    const line = doc.split("\n").find((l) => l.includes(row));
    expect(line, row).toBeDefined();
    expect(line).toMatch(
      new RegExp(
        `\\| ${count("auto")} / ${count("tap")} / ${count("reference")} / 0 +\\|`
      )
    );
  });
});

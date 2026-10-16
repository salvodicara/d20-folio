/**
 * Every Italian SRD spell name is the official IT SRD 5.2.1 name (docs/IT_NAME_REGISTRY.md, tier 1).
 *
 * The fixture is the spell headings of the official Italian SRD 5.2.1 (CC-BY-4.0), extracted from
 * `IT_SRD_CC_v5.2.1.pdf` (the "Descrizioni degli incantesimi" chapter) and keyed by our spell id.
 * The comparison ignores letter case only: the app titles entity names (`Alterare Se Stesso`, the
 * Title-Case convention prose cross-references rely on), while the SRD prints sentence case
 * (`Alterare se stesso`). Every word, accent, article and hyphen must match the print.
 */
import { describe, expect, it } from "vitest";
import itSpells from "@/i18n/it/srd/spells.json";
import official from "./__fixtures__/it-srd-5.2.1-spell-names.json";

const ours: Record<string, string> = Object.fromEntries(
  Object.entries(itSpells as Record<string, { name?: string }>)
    .filter(([key, row]) => !key.includes(".") && row.name)
    .map(([key, row]) => [key, row.name as string])
);
const printed = official as Record<string, string>;

describe("Italian SRD spell names", () => {
  it("covers exactly the spells of the official IT SRD 5.2.1", () => {
    expect(Object.keys(ours).sort()).toEqual(Object.keys(printed).sort());
  });

  it.each(Object.keys(printed))("%s carries its official Italian name", (id) => {
    expect(ours[id]?.toLowerCase()).toBe(printed[id]?.toLowerCase());
  });
});

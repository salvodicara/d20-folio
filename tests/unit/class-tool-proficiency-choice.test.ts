/**
 * Class level-1 tool-proficiency CHOICE — Monk + Bard.
 *
 * 2024 RAW: the Monk grants "Choose one type of Artisan's Tools or Musical
 * Instrument" (amount 1) and the Bard "Choose 3 Musical Instruments" (amount 3),
 * modelled as a `choice-tool-proficiency` grant on `SrdClassTable.grants` so the
 * proficiency is DERIVED + surfaced as a creation pick (the existing
 * collect/apply pipeline — no new kind). This pins:
 *   (1) the class grant source produces the right tool choice slot, and
 *   (2) applying a pick records the chosen tool as STABLE IDS in `toolChoices`,
 *       from which the proficiency is DERIVED (id → synthetic grant source →
 *       `displayToolProficiencies`) and localizes (EN + IT) — never a baked string.
 * The chosen tool's ITEM-append (Monk only) is pinned by the creation-wizard
 * render test (`creation-navigate.test.tsx`).
 */
import { describe, it, expect } from "vitest";
import {
  resolveGrantSourcesForClass,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { collectChoiceSlots, applyChoicePicks } from "@/lib/feature-choices";
import { ARTISAN_TOOL_IDS, MUSICAL_INSTRUMENT_IDS } from "@/lib/feat-skill-tool-choices";
import { EMPTY_CHOICE_PICKS } from "@/lib/feature-choices";
import { evaluateGrants } from "@/lib/grants";
import { displayToolProficiencies } from "@/lib/views/sheet-view";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("class level-1 tool-proficiency choice", () => {
  it("Monk grants ONE tool slot offering all artisan tools + instruments", () => {
    const sources = resolveGrantSourcesForClass("monk");
    const slots = collectChoiceSlots(sources);
    expect(slots.tool).toHaveLength(1);
    const slot = slots.tool[0];
    expect(slot?.amount).toBe(1);
    expect(slot?.slotId).toBe("class:monk::tool-slot-0");
    // The options are the full pickable artisan-tools + musical-instruments set.
    expect(new Set(slot?.options)).toEqual(
      new Set([...ARTISAN_TOOL_IDS, ...MUSICAL_INSTRUMENT_IDS])
    );
    // The generic umbrellas are NOT offered as concrete picks.
    expect(slot?.options).not.toContain("artisans-tools");
    expect(slot?.options).not.toContain("musical-instrument");
  });

  it("Bard grants ONE tool slot to pick THREE musical instruments", () => {
    const slots = collectChoiceSlots(resolveGrantSourcesForClass("bard"));
    expect(slots.tool).toHaveLength(1);
    expect(slots.tool[0]?.amount).toBe(3);
    expect(new Set(slots.tool[0]?.options)).toEqual(new Set(MUSICAL_INSTRUMENT_IDS));
  });

  it("a non-tool-choice class (Fighter) grants no class-level tool slot", () => {
    expect(collectChoiceSlots(resolveGrantSourcesForClass("fighter")).tool).toHaveLength(
      0
    );
  });

  it("applying the Monk pick records the tool ID in toolChoices, never free-text", () => {
    const slots = collectChoiceSlots(resolveGrantSourcesForClass("monk"));
    const slotId = slots.tool[0]?.slotId ?? "";
    expect(slotId).toBe("class:monk::tool-slot-0");
    const picks = { ...EMPTY_CHOICE_PICKS, tool: { [slotId]: ["smiths-tools"] } };
    const base = {
      ...MOCK_CHARACTER.character,
      toolProficiencyIds: [],
      customToolProficiencies: [],
      toolChoices: {},
    };
    const out = applyChoicePicks(base, slots, picks);
    // The PICK is stored as a STABLE ID under the slot id (golden rule 7) — the
    // manual id list is never written (golden rules 6 + 7).
    expect(out.toolChoices?.[slotId]).toEqual(["smiths-tools"]);
    expect(out.toolProficiencyIds).toEqual([]);
  });

  it("the proficiency DERIVES from the toolChoices id and localizes (EN + IT)", () => {
    // The end-to-end single-source path: a stored `toolChoices` id → the synthetic
    // tool-choice grant source (`resolveAllGrantSources`) → the aggregate's
    // `toolProficiencies` set → `displayToolProficiencies` localizes by id.
    const character = {
      ...MOCK_CHARACTER.character,
      // A clean Monk with NO manual free-text and ONLY the choice pick.
      classes: [{ classId: "monk", level: 1 }],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      toolChoices: { "class:monk::tool-slot-0": ["smiths-tools"] },
    };
    const agg = evaluateGrants(resolveAllGrantSources(character));
    // The derived set carries the chosen tool (as the canonical EN anchor).
    expect([...agg.toolProficiencies]).toContain("Smith's Tools");
    // It localizes from the id — EN and IT both resolve through the catalogue.
    expect(displayToolProficiencies([], [], agg, "en")).toContain("Smith's Tools");
    expect(displayToolProficiencies([], [], agg, "it")).toContain("Strumenti da Fabbro");
    // The umbrella never appears.
    expect(displayToolProficiencies([], [], agg, "it")).not.toContain(
      "Strumento Musicale"
    );
  });
});

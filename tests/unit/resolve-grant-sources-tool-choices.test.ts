/**
 * TOOL-CHOICE grant source — `resolveGrantSourcesForToolChoices`.
 *
 * A class / background / feat "choose a tool" decision is stored as STABLE TOOL
 * IDS in `character.toolChoices` (keyed by the namespaced choice slot id). This
 * source DERIVES the tool PROFICIENCY from those ids: each id → a synthetic
 * `tool-proficiency` grant carrying the canonical EN name (the SAME stable anchor
 * the FIXED tool grants use), so a chosen tool flows into
 * `aggregate.toolProficiencies` exactly like a fixed one and localizes by id at
 * display (golden rules 6 + 7). The `fromToolChoice` pack ITEM derives from the
 * SAME ids (`ToolChoiceContext.pickedIds`) — pinned by the umbrella + creation
 * tests; here we pin the PROFICIENCY half + the contract (ids in, no free-text).
 */
import { describe, expect, it } from "vitest";
import {
  resolveGrantSourcesForToolChoices,
  resolveAllGrantSources,
} from "@/lib/resolve-grant-sources";
import { evaluateGrants } from "@/lib/grants";
import { displayToolProficiencies } from "@/lib/views/sheet-view";
import { toolEnNameById } from "@/lib/tool-names";
import { MOCK_CHARACTER } from "@/lib/mock";

describe("resolveGrantSourcesForToolChoices — proficiency DERIVES from toolChoices ids", () => {
  it("emits one tool-proficiency grant per chosen id, carrying the EN anchor", () => {
    const sources = resolveGrantSourcesForToolChoices({
      "class:monk::tool-slot-0": ["smiths-tools"],
      "soldier::tool-slot-0": ["dice-set"],
    });
    expect(sources).toHaveLength(1);
    expect(sources[0]?.id).toBe("tool-choices");
    const grants = sources[0]?.grants ?? [];
    // Each grant is a fixed `tool-proficiency` carrying the canonical EN name.
    expect(grants).toEqual([
      { type: "tool-proficiency", tool: toolEnNameById("smiths-tools") },
      { type: "tool-proficiency", tool: toolEnNameById("dice-set") },
    ]);
  });

  it("a chosen tool flows into the aggregate's toolProficiencies set", () => {
    const agg = evaluateGrants(
      resolveGrantSourcesForToolChoices({ "class:monk::tool-slot-0": ["lute"] })
    );
    expect([...agg.toolProficiencies]).toContain("Lute");
  });

  it("the derived proficiency LOCALIZES by id (EN + IT) — never a baked string", () => {
    const agg = evaluateGrants(
      resolveGrantSourcesForToolChoices({ "class:monk::tool-slot-0": ["smiths-tools"] })
    );
    expect(displayToolProficiencies([], [], agg, "en")).toBe("Smith's Tools");
    expect(displayToolProficiencies([], [], agg, "it")).toBe("Strumenti da Fabbro");
  });

  it("deduplicates a tool id repeated across slots (one grant)", () => {
    const sources = resolveGrantSourcesForToolChoices({
      "a::tool-slot-0": ["lute"],
      "b::tool-slot-0": ["lute"],
    });
    expect(sources[0]?.grants).toEqual([
      { type: "tool-proficiency", tool: toolEnNameById("lute") },
    ]);
  });

  it("skips an unknown / homebrew id — never leaks a raw id", () => {
    const sources = resolveGrantSourcesForToolChoices({
      "x::tool-slot-0": ["not-a-real-tool", "lute"],
    });
    expect(sources[0]?.grants).toEqual([
      { type: "tool-proficiency", tool: toolEnNameById("lute") },
    ]);
  });

  it("emits nothing for empty / absent toolChoices", () => {
    expect(resolveGrantSourcesForToolChoices(undefined)).toEqual([]);
    expect(resolveGrantSourcesForToolChoices({})).toEqual([]);
    expect(resolveGrantSourcesForToolChoices({ "x::tool-slot-0": [] })).toEqual([]);
  });

  it("resolveAllGrantSources includes the tool-choice source (the canonical fan-in)", () => {
    const character = {
      ...MOCK_CHARACTER.character,
      toolProficiencyIds: [],
      customToolProficiencies: [],
      toolChoices: { "class:monk::tool-slot-0": ["smiths-tools"] },
    };
    const agg = evaluateGrants(resolveAllGrantSources(character));
    // The choice pick is present (the synthetic source ran inside the fan-in) — and
    // the MANUAL free-text portion is empty, so the ONLY tool here is the pick.
    expect([...agg.toolProficiencies]).toContain("Smith's Tools");
    expect(displayToolProficiencies([], [], agg, "it")).toContain("Strumenti da Fabbro");
  });
});

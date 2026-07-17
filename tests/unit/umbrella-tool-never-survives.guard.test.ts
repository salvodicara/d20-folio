/**
 * UMBRELLA-LEAK GUARD — a `pickable:false` umbrella tool ("Musical Instrument" /
 * "Gaming Set" / "Artisan's Tools") is a CHOICE PLACEHOLDER and must NEVER survive
 * into a final created character — neither as a tool PROFICIENCY nor as an
 * equipment ITEM. If one does, a "Choose one kind of <X>" choice was not resolved
 * to the player's concrete pick (the owner's Monk+Entertainer report: the
 * equipment showed an EN "Musical Instrument" umbrella, and the umbrella appeared
 * as a tool proficiency alongside the real picks).
 *
 * The architectural contract these guards pin (red BEFORE the fix, green after):
 *
 *  1. A "Choose one kind of <X>" background emits a `choice-tool-proficiency` over
 *     CONCRETE pickable ids — never a fixed `tool-proficiency` on the umbrella, and
 *     never the umbrella id/name in the options.
 *  2. Its Option-A package lists the chosen tool as a `fromToolChoice` MARKER —
 *     never a baked "Musical Instrument" / "Gaming Set" name-only item.
 *  3. Resolving that package with the player's pick yields the CONCRETE tool as a
 *     localized SRD ref (so it localizes), and NO umbrella id/name anywhere.
 *  4. The background's idempotent grant aggregate contributes NO umbrella token to
 *     `toolProficiencies` (the umbrella can't leak into the rail's display).
 *
 * Source of truth: dnd2024.wikidot.com/background:* — every umbrella background
 * prints "Tool Proficiency: Choose one kind of <X>" + "(X) <X> (same as above)…".
 */
import { describe, expect, it } from "vitest";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import {
  resolveGrantSourcesForBackground,
  resolveGrantSourcesForToolChoices,
  toolChoiceContextForBackground,
} from "@/lib/resolve-grant-sources";
import {
  resolveStartingEquipment,
  type ToolChoiceContext,
} from "@/data/background-equipment";
import { evaluateGrants } from "@/lib/grants";
import { displayToolProficiencies } from "@/lib/views/sheet-view";
import { SRD_TOOLS_2024 } from "@/lib/tools";
import { umbrellaToolChoiceOptions, isUmbrellaTool } from "@/lib/tool-names";
import { srd } from "../_harness/loc";
import { isCustomEquipment } from "@/types/character";

/** A tool id's canonical name in a locale — resolved from the SINGLE source, the
 *  SRD equipment catalogue keyed by id (#107). */
const toolName = (id: string, locale: "en" | "it"): string =>
  srd("equipment", id, "name", locale);

/** Every umbrella id + its EN/IT names — the tokens that must never survive. */
const UMBRELLAS = SRD_TOOLS_2024.filter((t) => t.pickable === false);
const UMBRELLA_TOKENS = new Set(
  UMBRELLAS.flatMap((u) => [
    u.id,
    toolName(u.id, "en").toLowerCase(),
    toolName(u.id, "it").toLowerCase(),
  ])
);
const isUmbrellaToken = (s: string): boolean =>
  UMBRELLA_TOKENS.has(s) || UMBRELLA_TOKENS.has(s.toLowerCase());

/** The umbrella backgrounds — those whose tool proficiency is "Choose one kind of <X>". */
const UMBRELLA_BGS = SRD_BACKGROUNDS.filter(
  (bg) => bg.toolProficiency && isUmbrellaTool(bg.toolProficiency)
);

describe("umbrella tool never survives into a created character", () => {
  it("there ARE umbrella backgrounds to defend (the fixture isn't accidentally empty)", () => {
    // Soldier ("Gaming Set") is in the SRD core set; the pack adds the rest
    // (Entertainer, Artisan, Guard, Noble, … — pinned in the pack-side guard).
    expect(UMBRELLA_BGS.length).toBeGreaterThanOrEqual(1);
    expect(UMBRELLA_BGS.map((b) => b.id)).toContain("soldier");
  });

  it("emits a choice-tool-proficiency over CONCRETE picks — never a fixed umbrella proficiency", () => {
    for (const bg of UMBRELLA_BGS) {
      const grants = resolveGrantSourcesForBackground(bg.id)[0]?.grants ?? [];
      // No fixed tool-proficiency carries an umbrella token.
      const fixedUmbrella = grants.filter(
        (g) => g.type === "tool-proficiency" && isUmbrellaToken(g.tool)
      );
      expect(fixedUmbrella, `${bg.id} fixed-umbrella grant`).toEqual([]);
      // Exactly one choice grant, whose options are all CONCRETE (never an umbrella).
      const choice = grants.find((g) => g.type === "choice-tool-proficiency");
      expect(choice, `${bg.id} choice grant`).toBeDefined();
      const options = choice?.type === "choice-tool-proficiency" ? choice.options : [];
      expect(options.length, `${bg.id} options`).toBeGreaterThan(0);
      for (const id of options) {
        expect(isUmbrellaToken(id), `${bg.id} option ${id} is an umbrella`).toBe(false);
      }
    }
  });

  it("its Option-A package lists the chosen tool as a fromToolChoice marker — every other item is a concrete srdId (no baked umbrella)", () => {
    for (const bg of UMBRELLA_BGS) {
      const optionA = bg.startingEquipment?.[0];
      const markers = (optionA?.items ?? []).filter((i) => i.fromToolChoice === true);
      expect(markers, `${bg.id} marker count`).toHaveLength(1);
      // There is no name-only form any more, so a baked umbrella string is
      // structurally impossible — every non-marker item is a concrete SRD id, and
      // no SRD id is an umbrella token.
      for (const item of optionA?.items ?? []) {
        if (item.fromToolChoice) continue;
        expect(item.srdId, `${bg.id} non-marker item is an srdId`).toBeDefined();
        expect(
          isUmbrellaToken(item.srdId),
          `${bg.id} baked umbrella item "${item.srdId}"`
        ).toBe(false);
      }
    }
  });

  it("resolving the package with a concrete pick yields the CONCRETE tool, no umbrella anywhere", () => {
    for (const bg of UMBRELLA_BGS) {
      const options = umbrellaToolChoiceOptions(bg.toolProficiency ?? "") ?? [];
      const pick = options[0]; // a representative concrete pick (e.g. bagpipes / dice-set)
      expect(pick, `${bg.id} has a concrete pick`).toBeDefined();
      const out = resolveStartingEquipment(bg.startingEquipment, "A", {
        options,
        pickedIds: [pick as string],
      });
      // The concrete tool is a localized SRD ref (in weapons or equipment), never custom.
      const allRefs = [...out.weapons, ...out.equipment];
      const concrete = allRefs.find((r) => !isCustomEquipment(r) && r.srdId === pick);
      expect(concrete, `${bg.id} concrete item`).toBeDefined();
      // NOTHING in the resolved kit is an umbrella id or an EN/IT umbrella string.
      for (const ref of out.equipment) {
        if (isCustomEquipment(ref)) {
          expect(
            isUmbrellaToken(ref.name),
            `${bg.id} custom umbrella "${ref.name}"`
          ).toBe(false);
        } else {
          expect(isUmbrellaToken(ref.srdId), `${bg.id} srd umbrella ${ref.srdId}`).toBe(
            false
          );
        }
      }
    }
  });

  it("the background grant aggregate contributes NO umbrella token to toolProficiencies", () => {
    for (const bg of UMBRELLA_BGS) {
      const agg = evaluateGrants(resolveGrantSourcesForBackground(bg.id));
      for (const tool of agg.toolProficiencies) {
        expect(isUmbrellaToken(tool), `${bg.id} aggregate tool "${tool}"`).toBe(false);
      }
    }
  });

  it("the CHOSEN tool — stored as a toolChoices ID — DERIVES both the proficiency AND the pack item, no umbrella, no free-text", () => {
    // The id-based single-source contract (golden rules 6 + 7): for each umbrella
    // background, a concrete pick is STORED as an id in `toolChoices`; the tool
    // PROFICIENCY (via `resolveGrantSourcesForToolChoices`) AND the `fromToolChoice`
    // pack ITEM (via `ToolChoiceContext.pickedIds`) BOTH derive from THAT id —
    // never the umbrella, never a baked free-text string.
    for (const bg of UMBRELLA_BGS) {
      const options = umbrellaToolChoiceOptions(bg.toolProficiency ?? "") ?? [];
      const pick = options[0] as string;
      expect(pick, `${bg.id} has a concrete pick`).toBeDefined();
      const slotId = `${bg.id}::tool-slot-0`;
      const toolChoices = { [slotId]: [pick] };

      // (a) the PROFICIENCY derives from the id and localizes (EN + IT), no umbrella.
      // The localized proficiency string MUST equal the tool's canonical name from
      // the SINGLE source — the SRD equipment catalogue (#107), the same catalogue
      // the inventory item reads — so the two surfaces can never drift.
      const agg = evaluateGrants(resolveGrantSourcesForToolChoices(toolChoices));
      const en = displayToolProficiencies([], [], agg, "en");
      const it = displayToolProficiencies([], [], agg, "it");
      expect(en, `${bg.id} EN proficiency`).toBe(toolName(pick, "en"));
      expect(it, `${bg.id} IT proficiency`).toBe(toolName(pick, "it"));
      for (const tok of [en, it]) {
        expect(isUmbrellaToken(tok), `${bg.id} derived tool "${tok}"`).toBe(false);
      }

      // (b) the PACK ITEM derives from the SAME id (the umbrella `fromToolChoice`
      // marker expands to the picked tool), no umbrella id/name anywhere.
      const ctx: ToolChoiceContext | undefined = toolChoiceContextForBackground(
        bg.id,
        toolChoices
      );
      const out = resolveStartingEquipment(bg.startingEquipment, "A", ctx);
      const concrete = [...out.weapons, ...out.equipment].find(
        (r) => !isCustomEquipment(r) && r.srdId === pick
      );
      expect(concrete, `${bg.id} derived pack item`).toBeDefined();
    }
  });
});

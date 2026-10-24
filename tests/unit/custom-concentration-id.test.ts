/**
 * Concentration on a homebrew spell is keyed by the spell's stable instanceId, not its
 * name: two homebrew spells (or a homebrew copy of a catalogue spell) that share a
 * name no longer read as the same held spell. The stored value still carries the name
 * so every label reads without the sheet, and the legacy `custom:<name>` form stays
 * readable forever (no migration): it labels the same and still counts as held for
 * the spell of that name.
 */
import { describe, expect, it } from "vitest";

import {
  customConcentrationValue,
  customSpellConcentrationValue,
  holdsCustomSpellConcentration,
  normalizeStoredConcentration,
} from "@/lib/concentration";
import { concentrationLabel } from "@/lib/views/tracker-view";
import { applyActionConcentration } from "@/features/character/center/action-state-commit";
import { resolveActions, type ResolvedAction } from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { makeCharacterDoc } from "./_helpers";

const ward = { instanceId: "a1", name: "Ward of Thorns" };
const twin = { instanceId: "b2", name: "Ward of Thorns" };

describe("homebrew Concentration by id", () => {
  it("two same-named homebrew spells are different held spells", () => {
    const held = customSpellConcentrationValue(ward);
    expect(holdsCustomSpellConcentration(held, ward)).toBe(true);
    expect(holdsCustomSpellConcentration(held, twin)).toBe(false);
  });

  it("the stored value labels with the spell's name, without the sheet", () => {
    expect(concentrationLabel(customSpellConcentrationValue(ward), "it")).toBe(
      "Ward of Thorns"
    );
  });

  it("the legacy name form still labels and still counts as held for that name", () => {
    const legacy = customConcentrationValue("Ward of Thorns");
    expect(concentrationLabel(legacy, "en")).toBe("Ward of Thorns");
    expect(holdsCustomSpellConcentration(legacy, ward)).toBe(true);
  });

  it("the stored value survives the read boundary unchanged", () => {
    const held = customSpellConcentrationValue(ward);
    expect(normalizeStoredConcentration(held)).toBe(held);
  });
});

describe("casting a homebrew Concentration spell", () => {
  const spell = (instanceId: string) => ({
    custom: true as const,
    name: "Ward of Thorns",
    level: 1,
    school: "abjuration" as const,
    castingTime: "1 action",
    range: "Self",
    components: { v: true, s: true, m: false },
    duration: "Concentration, up to 1 minute",
    concentration: true,
    description: "",
    prepared: true,
    instanceId,
  });

  it("holds the cast spell by its id; its same-named twin is not held", () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 3,
      spells: [spell("a1"), spell("b2")],
      spellSlots: [{ level: 1, total: 4 }],
    });
    useCharacterStore.setState({
      character: doc,
      readonly: false,
      loading: false,
      error: null,
    });
    // The commit receives the localized action (its name is the user's text).
    const [first, second] = resolveActions(doc, "spellbook")
      .filter((action) => action.customSpellInstanceId)
      .map((action) => localizeAction(action, "en"));
    applyActionConcentration(first as unknown as ResolvedAction, 1);
    const held = useCharacterStore.getState().character?.session.concentration ?? "";
    expect(held).toBe(
      customSpellConcentrationValue({ instanceId: "a1", name: "Ward of Thorns" })
    );
    expect(second?.customSpellInstanceId).toBe("b2");
    expect(holdsCustomSpellConcentration(held, spell("b2"))).toBe(false);
    useCharacterStore.setState({ character: null });
  });
});

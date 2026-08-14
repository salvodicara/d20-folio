import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import i18n from "@/i18n";
import { ResourceConversions } from "@/features/character/molecules/ResourceConversions";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { ResourceConversionEntry } from "@/lib/grants";
import { makeCharacterDoc } from "./_helpers";

const entry: ResourceConversionEntry = {
  sourceId: "sorcerer-font-of-magic",
  conversionId: "font-creating-spell-slots",
  produces: "spell-slot",
  fromTracker: "sorcerer-font-of-magic",
  maxSlotLevel: 5,
  costTable: [{ slotLevel: 2, cost: 3, minLevel: 3 }],
};

function fixture() {
  return makeCharacterDoc(
    {
      classId: "sorcerer",
      level: 5,
      features: [{ srdId: "sorcerer-font-of-magic" }],
      spellSlots: [{ level: 2, total: 3 }],
    },
    { spellSlots: { "2": { used: 1 } } }
  );
}

function renderConversion(doc = fixture()) {
  useCharacterStore.setState({ character: doc, readonly: false });
  return render(
    <ResourceConversions entries={[entry]} doc={doc} unitFor={() => "pts"} />
  );
}

function chooseLevelTwo() {
  fireEvent.click(screen.getByRole("button", { name: "Create spell slot" }));
  fireEvent.click(screen.getByRole("option", { name: /Level 2 slot/ }));
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  useToastStore.getState().clearAll();
  useUndoStore.getState().clear(null);
});

describe("ResourceConversions MechanicsCommand boundary", () => {
  it("commits, exact-undoes, and freshly re-prepares the same choice on redo", () => {
    renderConversion();
    chooseLevelTwo();
    expect(
      useCharacterStore.getState().character?.session.trackers["sorcerer-font-of-magic"]
        ?.used
    ).toBe(3);
    expect(useUndoStore.getState().undo()).toBe(true);
    expect(useCharacterStore.getState().character?.session.spellSlots["2"]?.used).toBe(1);
    expect(useUndoStore.getState().redo()).toBe(true);
    expect(
      useCharacterStore.getState().character?.session.spellSlots["2"]
    ).toBeUndefined();
  });

  it("revalidates after the picker opened and reports a stale-choice conflict", () => {
    renderConversion();
    fireEvent.click(screen.getByRole("button", { name: "Create spell slot" }));
    useCharacterStore.getState().useTracker("sorcerer-font-of-magic", 5);
    fireEvent.click(screen.getByRole("option", { name: /Level 2 slot/ }));
    expect(useCharacterStore.getState().character?.session.spellSlots["2"]?.used).toBe(1);
    expect(useUndoStore.getState().past).toHaveLength(0);
    expect(
      useToastStore
        .getState()
        .toasts.some((toast) => /Those resources have changed/.test(toast.message ?? ""))
    ).toBe(true);
  });

  it("keeps redo retryable when the source disappeared", () => {
    renderConversion();
    chooseLevelTwo();
    expect(useUndoStore.getState().undo()).toBe(true);
    const live = useCharacterStore.getState().character;
    if (!live) throw new Error("character missing");
    useCharacterStore.getState().setCharacter({
      ...live,
      character: { ...live.character, features: [] },
    });
    expect(useUndoStore.getState().redo()).toBe(false);
    expect(useUndoStore.getState().future).toHaveLength(1);
    expect(useCharacterStore.getState().character?.session.spellSlots["2"]?.used).toBe(1);
  });
});

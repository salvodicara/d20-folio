import { describe, it, expect } from "vitest";
import { buildInventoryViewModel } from "@/lib/views/inventory-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import enEquipment from "@/i18n/en/ui/equipment.json";
import itEquipment from "@/i18n/it/ui/equipment.json";

const mock = (): CharacterDoc => structuredClone(MOCK_CHARACTER);

describe("inventory encumbrance VM — push/drag/lift surfaced (RA-27)", () => {
  it("exposes pushDragLift = STR × 30 (twice the carry capacity)", () => {
    const enc = buildInventoryViewModel(mock(), "en").encumbrance;
    if (!enc) throw new Error("encumbrance VM missing"); // narrows; no non-null `!`
    // Mock (Lyra Voss) is STR 8, no STR-altering item → carry 120, push/drag/lift 240.
    expect(enc.capacity).toBe(120);
    expect(enc.pushDragLift).toBe(240);
    expect(enc.pushDragLift).toBe(enc.capacity * 2);
  });

  it("the capacity tooltip carries the {{pushDragLift}} placeholder in both locales", () => {
    expect(enEquipment.equipment.encumbranceHint).toContain("{{pushDragLift}}");
    expect(itEquipment.equipment.encumbranceHint).toContain("{{pushDragLift}}");
  });
});

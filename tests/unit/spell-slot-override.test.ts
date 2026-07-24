/**
 * RA-33 — a durable per-slot-level max-count override.
 *
 * `character.spellSlots` is a materialized derived array, re-derived and clobbered
 * on any Bio class/level edit (`reconcileBuildChoices`) and on level-up (`levelUp`).
 * A homebrew slot count is now pinned on `spellcasting.slotMaxOverrides` and
 * re-applied at BOTH clobber sites, so it survives a level-only edit / a level-up
 * but correctly DROPS on a class change (the old count is stale). The presenter
 * flags an overridden row so the edit cell can offer reset-to-auto.
 *
 * fail-before: reconcile/levelUp overwrite `spellSlots` with the pure derived list
 * and drop the override map.
 */
import { describe, it, expect } from "vitest";
import { reconcileBuildChoices } from "@/lib/reconcile-build";
import { levelUp } from "@/lib/level-up";
import { deriveSpellSlots, applySlotMaxOverrides } from "@/lib/multiclass-slots";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { totalLevel, primaryClassId } from "@/lib/classes";
import { MOCK_CHARACTER } from "@/lib/mock";

/** L1 normal-pool total from a slot list. */
function normalL1(
  slots: ReadonlyArray<{ level: number; total: number; pactMagic?: boolean }>
) {
  return slots.find((s) => s.level === 1 && s.pactMagic !== true)?.total;
}

describe("RA-33 — slot-count override durability", () => {
  it("survives a level-only Bio edit (reconcile re-applies it)", () => {
    const prev = structuredClone(MOCK_CHARACTER.character);
    if (!prev.spellcasting) throw new Error("mock is a caster");
    prev.spellcasting.slotMaxOverrides = { "1": 5 };
    prev.spellSlots = applySlotMaxOverrides(deriveSpellSlots(prev.classes), { "1": 5 });

    // A level-only change (scopeChanged, NOT classChanged): bump the primary entry.
    const primary = prev.classes[0];
    if (!primary) throw new Error("mock has a class");
    const next = structuredClone(prev);
    next.classes = [{ ...primary, level: primary.level + 1 }, ...next.classes.slice(1)];

    const result = reconcileBuildChoices(prev, next);
    // The baseline (pure derived) at the new level differs from the override…
    expect(normalL1(deriveSpellSlots(next.classes))).not.toBe(5);
    // …but the reconcile keeps the override on both the array and the config.
    expect(normalL1(result.spellSlots)).toBe(5);
    expect(result.spellcasting?.slotMaxOverrides).toEqual({ "1": 5 });
  });

  it("DROPS the override on a class change (the count is stale)", () => {
    const prev = structuredClone(MOCK_CHARACTER.character);
    if (!prev.spellcasting) throw new Error("mock is a caster");
    prev.spellcasting.slotMaxOverrides = { "1": 5 };
    prev.spellSlots = applySlotMaxOverrides(deriveSpellSlots(prev.classes), { "1": 5 });

    const primary = prev.classes[0];
    if (!primary) throw new Error("mock has a class");
    const next = structuredClone(prev);
    // Bard → Wizard (classChanged): re-infers the block from the new class.
    next.classes = [
      { classId: "wizard", level: primary.level },
      ...next.classes.slice(1),
    ];

    const result = reconcileBuildChoices(prev, next);
    expect(result.spellcasting?.slotMaxOverrides).toBeUndefined();
    expect(normalL1(result.spellSlots)).toBe(normalL1(deriveSpellSlots(next.classes)));
  });

  it("survives a level-up recompute (levelUp re-applies it)", () => {
    const char = structuredClone(MOCK_CHARACTER.character); // single-class Bard 9
    if (!char.spellcasting) throw new Error("mock is a caster");
    char.spellcasting.slotMaxOverrides = { "1": 6 };

    const { updatedCharacter } = levelUp(char, totalLevel(char) + 1);
    expect(normalL1(updatedCharacter.spellSlots)).toBe(6);
    expect(updatedCharacter.spellcasting?.slotMaxOverrides).toEqual({ "1": 6 });
  });

  it("the presenter flags an overridden slot row (and only that row)", () => {
    const doc = structuredClone(MOCK_CHARACTER);
    if (!doc.character.spellcasting) throw new Error("mock is a caster");
    doc.character.spellcasting.slotMaxOverrides = { "1": 5 };
    doc.character.spellSlots = applySlotMaxOverrides(
      deriveSpellSlots(doc.character.classes),
      { "1": 5 }
    );

    const vm = buildSpellsViewModel(doc, primaryClassId(doc.character), "en", true);
    const l1 = vm.slots.find((s) => s.level === 1 && !s.pactMagic);
    expect(l1?.overridden).toBe(true);
    expect(l1?.total).toBe(5);
    const l2 = vm.slots.find((s) => s.level === 2 && !s.pactMagic);
    expect(l2?.overridden).toBe(false);
  });
});

/**
 * The sheet's numbers, each with where it comes from (design session VM 5,
 * 2026-10-18): AC, initiative, speed, Proficiency Bonus, max HP, the six saves, the
 * 18 skills and the three passives, every one as `{ total, parts }`. The total is
 * the number the sheet shows (`deriveCharacter`, the one derivation); the parts are
 * the existing breakdown builders' and always sum to it. A hand-set value has no
 * composition to explain, so its parts are null. Cases come from every dev scenario.
 */
import { describe, expect, it } from "vitest";

import { sheetNumbers, sheetNumbersView } from "@/lib/views/sheet-numbers-view";
import { deriveCharacter } from "@/lib/views/derive-character";
import { breakdownTotal } from "@/lib/value-breakdown";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";

const docs: [string, CharacterDoc][] = Object.keys(DEV_SCENARIOS).flatMap((id) => {
  const doc = buildDevScenario(id);
  return doc ? [[id, doc] as [string, CharacterDoc]] : [];
});

type Explained = { total: number; parts: Parameters<typeof breakdownTotal>[0] | null };

function sums(n: Explained): void {
  if (n.parts) expect(breakdownTotal(n.parts)).toBe(n.total);
}

describe("sheetNumbers", () => {
  it.each(docs)(
    "%s: each total is the sheet's number, and its parts sum to it",
    (_id, doc) => {
      const sheet = deriveCharacter(doc);
      const n = sheetNumbers(doc);

      expect(n.ac.total).toBe(sheet.ac);
      expect(n.initiative.total).toBe(sheet.initiativeBonus);
      expect(n.speed.total).toBe(sheet.walkingSpeedFt);
      expect(n.proficiencyBonus.total).toBe(sheet.proficiencyBonus);
      expect(n.maxHp.total).toBe(sheet.hp.max);
      expect(n.saves.map((s) => [s.ability, s.total])).toEqual(
        sheet.saves.map((s) => [s.ability, s.bonus])
      );
      expect(n.skills.map((s) => [s.id, s.total])).toEqual(
        sheet.skills.map((s) => [s.id, s.bonus])
      );
      expect({
        perception: n.passives.perception.total,
        investigation: n.passives.investigation.total,
        insight: n.passives.insight.total,
      }).toEqual(sheet.passives);

      [n.ac, n.initiative, n.speed, n.proficiencyBonus, n.maxHp].forEach(sums);
      n.saves.forEach(sums);
      n.skills.forEach(sums);
      Object.values(n.passives).forEach(sums);
    }
  );

  it("explains the computed numbers (the parts are there, not just a total)", () => {
    const doc = docs[0]?.[1];
    if (!doc) throw new Error("no scenario");
    const n = sheetNumbers(doc);
    expect(n.ac.parts?.length).toBeGreaterThan(0);
    expect(n.initiative.parts?.length).toBeGreaterThan(0);
    expect(n.speed.parts?.length).toBeGreaterThan(0);
    expect(n.proficiencyBonus.parts?.length).toBe(1);
    expect(n.passives.perception.parts?.length).toBeGreaterThan(1);
  });

  it("a hand-set number shows as set, with nothing to explain", () => {
    const base = docs[0]?.[1];
    if (!base) throw new Error("no scenario");
    const doc: CharacterDoc = {
      ...base,
      character: {
        ...base.character,
        acOverride: 21,
        initiativeBonusOverride: 7,
        speedOverride: 45,
        proficiencyBonusOverride: 6,
        passivePerceptionOverride: 25,
        hp: { ...base.character.hp, max: base.character.hp.max + 3 },
      },
    };
    const n = sheetNumbers(doc);
    expect(n.ac).toEqual({ total: 21, parts: null });
    expect(n.initiative).toEqual({ total: 7, parts: null });
    expect(n.speed).toEqual({ total: 45, parts: null });
    expect(n.proficiencyBonus).toEqual({ total: 6, parts: null });
    expect(n.passives.perception).toEqual({ total: 25, parts: null });
    // A rolled or hand-pinned max HP is not the by-the-book composition.
    expect(n.maxHp.parts).toBeNull();
    expect(n.maxHp.total).toBe(deriveCharacter(doc).hp.max);
  });
});

describe("sheetNumbersView", () => {
  it("serves the same totals with the parts as display lines", () => {
    const doc = docs[0]?.[1];
    if (!doc) throw new Error("no scenario");
    const raw = sheetNumbers(doc);
    const view = sheetNumbersView(doc, "it");
    expect(view.ac.total).toBe(raw.ac.total);
    expect(view.ac.parts?.length).toBe(raw.ac.parts?.length);
    expect(view.skills.map((s) => s.total)).toEqual(raw.skills.map((s) => s.total));
    expect(
      view.passives.insight.parts?.every((line) => typeof line.value === "string")
    ).toBe(true);
  });
});

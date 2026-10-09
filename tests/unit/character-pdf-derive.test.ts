/**
 * The PDF sheet prints the SAME numbers as the hero's sheet: every ability, save,
 * skill, passive, AC, initiative and max HP in the PDF view model equals
 * `deriveCharacter` — cases from every dev scenario (real builds, real engine).
 */
import { describe, it, expect } from "vitest";
import i18n from "@/i18n";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { buildCharacterPdfViewModel } from "@/lib/pdf/character-pdf-view";
import { deriveCharacter } from "@/lib/views/derive-character";
import type { CharacterDoc } from "@/types/character";

const t = i18n.getFixedT("en");
const fmt = (n: number): string => (n >= 0 ? `+${n}` : `-${Math.abs(n)}`);
const docs: [string, CharacterDoc][] = Object.keys(DEV_SCENARIOS).flatMap((id) => {
  const doc = buildDevScenario(id);
  return doc ? [[id, doc] as [string, CharacterDoc]] : [];
});

describe("PDF view model = deriveCharacter", () => {
  it.each(docs)("%s", (_id, doc) => {
    const vm = buildCharacterPdfViewModel(doc, "en", t);
    const sheet = deriveCharacter(doc);

    expect(
      vm.abilities.map((a) => [a.code, a.score, a.modifier, a.save, a.saveProficient])
    ).toEqual(
      sheet.saves.map((s) => [
        s.ability,
        sheet.abilities[s.ability].score,
        fmt(sheet.abilities[s.ability].modifier),
        fmt(s.bonus),
        s.proficient,
      ])
    );
    const bySkill = new Map(sheet.skills.map((s) => [s.id, s]));
    for (const row of vm.skills) {
      expect([row.id, row.ability, row.bonus]).toEqual([
        row.id,
        bySkill.get(row.id)?.ability,
        fmt(bySkill.get(row.id)?.bonus ?? NaN),
      ]);
    }
    expect(vm.passives.map((p) => p.value)).toEqual([
      sheet.passives.perception,
      sheet.passives.insight,
      sheet.passives.investigation,
    ]);
    expect(vm.combat.ac).toBe(String(sheet.ac));
    expect(vm.combat.initiative).toBe(fmt(sheet.initiativeBonus));
    expect(vm.combat.hpMax).toBe(sheet.hp.max);
  });
});

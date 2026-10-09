/**
 * deriveCharacter — the ONE derivation from a stored character to its computed sheet
 * (the Folio Core entry other surfaces and, later, other apps call). Its cases come
 * from every dev scenario (real builds through the real engine): each number must
 * equal what the player's own sheet shows today (the cockpit rail's saves/skills/
 * passives, the vitals' AC/HP, the Spells tab's DC/attack), and the DM's party view
 * must read the same numbers — including a hand-set passive override.
 */
import { describe, it, expect } from "vitest";
import { deriveCharacter } from "@/lib/derive-character";
import { DEV_SCENARIOS, buildDevScenario } from "@/lib/dev-scenarios";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { effectiveAC, effectiveMaxHp } from "@/lib/aggregate-character";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { primaryClassId } from "@/lib/classes";
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import type { CharacterDoc } from "@/types/character";

const docs: [string, CharacterDoc][] = Object.keys(DEV_SCENARIOS).flatMap((id) => {
  const doc = buildDevScenario(id);
  return doc ? [[id, doc] as [string, CharacterDoc]] : [];
});

describe("deriveCharacter", () => {
  it("has scenarios to check", () => {
    expect(docs.length).toBeGreaterThan(10);
  });

  it.each(docs)("%s: equals what the player's sheet shows", (_id, doc) => {
    const sheet = deriveCharacter(doc);
    const { character, session } = doc;
    const rail = deriveSavesAndChecks(character, session);
    const aggSession = {
      activeFeatures: session.activeFeatures,
      grantBundleChoices: session.grantBundleChoices,
      itemResources: session.itemResources,
    };

    expect(sheet.saves.map((s) => [s.ability, s.bonus, s.proficient])).toEqual(
      rail.saves.map((s) => [s.id, s.bonus, s.proficient])
    );
    expect(sheet.skills.map((s) => [s.id, s.bonus, s.proficiency])).toEqual(
      rail.skills.map((s) => [s.id, s.bonus, s.proficiency])
    );
    expect(sheet.passives).toEqual(
      Object.fromEntries(rail.passives.map((p) => [p.id, p.override ?? p.computed]))
    );
    expect(sheet.ac).toBe(effectiveAC(character, aggSession));
    expect(sheet.hp.max).toBe(effectiveMaxHp(character, aggSession));

    const spells = buildSpellsViewModel(doc, primaryClassId(character), "en", false);
    expect(sheet.spellcasting?.saveDc ?? null).toBe(spells.castSummary?.saveDC ?? null);
    expect(sheet.spellcasting?.attackBonus ?? null).toBe(
      spells.castSummary?.attackBonus ?? null
    );
  });

  it.each(docs)("%s: the DM's party view reads the same numbers", (_id, doc) => {
    const sheet = deriveCharacter(doc);
    const party = derivePartyMemberStats(doc);
    expect(party.passivePerception).toBe(sheet.passives.perception);
    expect(party.passiveInsight).toBe(sheet.passives.insight);
    expect(party.passiveInvestigation).toBe(sheet.passives.investigation);
    expect(party.saves.map((s) => s.bonus)).toEqual(sheet.saves.map((s) => s.bonus));
    expect(party.ac).toBe(sheet.ac);
    expect(party.initiativeBonus).toBe(sheet.initiativeBonus);
  });

  it("a hand-set passive Perception shows in the DM's party view too", () => {
    const base = docs[0]?.[1];
    if (!base) throw new Error("no scenario");
    const doc: CharacterDoc = {
      ...base,
      character: { ...base.character, passivePerceptionOverride: 25 },
    };
    expect(deriveCharacter(doc).passives.perception).toBe(25);
    expect(derivePartyMemberStats(doc).passivePerception).toBe(25);
  });

  it("hand-set sense and speed ranges reach the DM's party view, like the sheet's rail", () => {
    const found = docs.find(([, d]) => deriveCharacter(d).senses.length > 0)?.[1];
    if (!found) throw new Error("no scenario with a sense");
    const kind = deriveCharacter(found).senses[0]?.kind;
    if (!kind) throw new Error("no sense");
    const doc: CharacterDoc = {
      ...found,
      character: { ...found.character, senseRangeOverrides: { [kind]: 120 } },
    };
    expect(deriveCharacter(doc).senses.find((s) => s.kind === kind)?.rangeFt).toBe(120);
    expect(derivePartyMemberStats(doc).senses.find((s) => s.kind === kind)?.rangeFt).toBe(
      120
    );
  });
});

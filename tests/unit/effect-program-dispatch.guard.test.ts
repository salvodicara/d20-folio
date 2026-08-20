/**
 * The deletion-wave GO condition, pinned (the combat-automation-gaps wave):
 * every PUBLIC spell still carrying a legacy `effectProgram` also carries an
 * authored `mechanicsProgram` (or a superseding declarative transcription) AND
 * dispatches ENGINE through the one spell gate in its real solo context — so
 * the wave that deletes legacy effect-program execution cannot strand a spell
 * without automation. The one public non-spell carrier (Uncanny Dodge's
 * reaction) is the documented boundary: its transcription refuses
 * (`effect-program: legacy-program-migration`), and the reaction stays with
 * the legacy runtime until an authored program lands. Pack-side carriers are
 * proven by the pack's own suites (rule 28).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { engineSpellCastRequest } from "@/features/character/center/tabs/spells/engine-spell-gate";
import { classFeatureIndex } from "@/data/classes";
import { spellIndex } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import { transcribeFeatureAction, transcribeSpell } from "@/lib/mechanics-transcription";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";

/** Every public spell whose catalogue entry still carries `effectProgram`. */
const EFFECT_PROGRAM_SPELLS = [...spellIndex.values()]
  .filter((spell) => spell.effectProgram !== undefined && spell.source === "SRD")
  .map((spell) => spell.id)
  .sort();

/** A generic full caster with the probed spell prepared and clean slots. */
function casterFor(spellId: string): CharacterDoc {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.classes = [{ classId: "wizard", level: 17 }];
  doc.character.spells = [{ srdId: spellId, prepared: true }];
  doc.character.spellSlots = Array.from({ length: 9 }, (_, index) => ({
    level: index + 1,
    total: 2,
  }));
  doc.session.spellSlots = {};
  doc.session.concentration = "";
  doc.session.activeFeatures = [];
  return doc;
}

describe("legacy effect-program carriers dispatch engine (deletion prerequisite)", () => {
  it("covers the exact known roster (a new carrier must extend this guard)", () => {
    expect(EFFECT_PROGRAM_SPELLS).toEqual([
      "contagion",
      "delayed-blast-fireball",
      "dragons-breath",
      "eldritch-blast",
      "ensnaring-strike",
      "fire-shield",
      "melfs-acid-arrow",
      "phantasmal-force",
      "phantasmal-killer",
      "prismatic-spray",
      "prismatic-wall",
      "searing-smite",
      "spike-growth",
      "storm-of-vengeance",
      "vitriolic-sphere",
      "weird",
    ]);
  });

  it.each(EFFECT_PROGRAM_SPELLS)("%s transcribes and gates ENGINE solo", (spellId) => {
    useCombatStore.getState().endCombat();
    const spell = spellIndex.get(spellId);
    if (!spell) throw new Error(`missing spell ${spellId}`);
    // The authored/declarative program supersedes the legacy effectProgram.
    expect(transcribeSpell(spell).program).not.toBeNull();
    // And the ONE spell gate dispatches it engine outside a shared encounter.
    const doc = casterFor(spellId);
    const action = localizeActions(doc, "en", "spellbook").find(
      (row) => row.spellId === spellId
    );
    if (!action) throw new Error(`no action row for ${spellId}`);
    const request = engineSpellCastRequest({
      action,
      badges: { mastery: "m", signature: "s" },
      character: doc,
      locale: "en",
      sheetCombat: false,
      spell,
      spellName: action.name,
      uid: "test-uid",
    });
    expect(request).not.toBeNull();
    expect(request?.spellId).toBe(spellId);
  });

  it("uncanny dodge is the one public non-spell carrier and stays legacy (documented)", () => {
    const feature = classFeatureIndex.get("rogue-uncanny-dodge");
    const action = feature?.mechanics?.actions?.find(
      (candidate) => candidate.effectProgram !== undefined
    );
    if (!feature || !action) throw new Error("uncanny dodge action not found");
    const transcription = transcribeFeatureAction("rogue-uncanny-dodge", action, 0, {});
    expect(transcription.program).toBeNull();
    expect(
      transcription.clauses.some(
        (clause) =>
          clause.clauseId === "effect-program" &&
          clause.status === "unsupported" &&
          clause.detail === "legacy-program-migration"
      )
    ).toBe(true);
  });
});

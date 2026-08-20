/**
 * The post-deletion regression guard (the combat-automation-gaps wave): the
 * legacy effect-program runtime is DELETED, and every public spell that used
 * to carry one keeps its canonical automation — it transcribes (authored
 * `mechanicsProgram` or declarative transcription) AND dispatches ENGINE
 * through the one spell gate in its real solo context. The roster is pinned
 * literally (the `effectProgram` field no longer exists to derive it from).
 * The one public non-spell ex-carrier (Uncanny Dodge's reaction) gates ENGINE
 * too: its authored canonical program transcribes (damage-taken adjustment
 * phase + the kernel Reaction claim) and fires through the damage-entry
 * reaction runtime (`lib/damage-reaction.ts` — proven end-to-end by
 * `damage-reaction-runtime.test.ts`). Pack-side ex-carriers (crusaders-mantle,
 * backlash, banishing-smite, shield-master) are proven by the pack's own
 * suites (rule 28).
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
import { characterDamageReactionOptions } from "@/lib/damage-reaction";
import { spellIndex } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import { transcribeFeatureAction, transcribeSpell } from "@/lib/mechanics-transcription";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCombatStore } from "@/stores/combatStore";
import type { CharacterDoc } from "@/types/character";

/** The pinned roster of public spells the deleted legacy runtime used to own. */
const EFFECT_PROGRAM_SPELLS = [
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
] as const;

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

describe("legacy effect-program ex-carriers keep dispatching engine", () => {
  it.each(EFFECT_PROGRAM_SPELLS)("%s transcribes and gates ENGINE solo", (spellId) => {
    useCombatStore.getState().endCombat();
    const spell = spellIndex.get(spellId);
    if (!spell) throw new Error(`missing spell ${spellId}`);
    // The canonical program (authored or declarative) transcribes.
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

  it("uncanny dodge (the one public non-spell ex-carrier) transcribes ENGINE", () => {
    const feature = classFeatureIndex.get("rogue-uncanny-dodge");
    const action = feature?.mechanics?.actions?.find(
      (candidate) => candidate.mechanicsProgram !== undefined
    );
    if (!feature || !action) throw new Error("uncanny dodge action not found");
    expect(action.mechanicsProgram).toBeDefined();
    const transcription = transcribeFeatureAction("rogue-uncanny-dodge", action, 0, {});
    const program = transcription.program;
    expect(program).not.toBeNull();
    if (!program) return;
    expect(
      transcription.clauses.filter((clause) => clause.status === "unsupported")
    ).toEqual([]);
    // The reactive shape the damage-entry runtime composes around: an
    // invocation phase claiming the round's Reaction plus a damage-taken
    // phase carrying the compensating adjustment — answer-free throughout.
    const deflect = program.phases.find(
      (phase) =>
        phase.trigger.kind === "damage-taken" &&
        phase.steps.some((step) => step.kind === "incoming-damage-adjustment")
    );
    expect(deflect).toBeDefined();
    expect(program.phases.every((phase) => phase.inputs.length === 0)).toBe(true);
    const claim = program.phases
      .flatMap((phase) => phase.steps)
      .find((step) => step.kind === "turn-claim");
    expect(claim).toMatchObject({
      claim: {
        kind: "claim-reaction",
        reaction: { kind: "program", requirementId: "reaction.rogue-uncanny-dodge.0" },
      },
    });
    // And the runtime actually offers it off the real mock doc — the full
    // hit + reduction + claim + undo path is proven end-to-end by
    // `damage-reaction-runtime.test.ts`.
    const offered = characterDamageReactionOptions(MOCK_CHARACTER).some(
      (option) => option.featureId === "rogue-uncanny-dodge"
    );
    expect(offered).toBe(true);
  });
});

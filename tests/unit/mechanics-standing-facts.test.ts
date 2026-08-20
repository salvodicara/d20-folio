/**
 * The recipient-standing vocabulary laws: the transcriber's recipient-aware
 * emission shapes (Death Ward / Aid / Warding Bond / Heroism and the gated
 * cantrip debuffs), the authoring conformance of the new standing-fact
 * templates, and the exact runtime-fact boundary. The end-to-end behavior
 * (floor firing/consumption, raise-then-heal, resistance halving, the THP
 * pulse) is proven through the coordinator in mechanics-coordinator.test.ts.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { conformNewMechanicOccurrence } from "@/lib/mechanic-occurrences";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import { transcribeSpell } from "@/lib/mechanics-transcription";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";

const HERO = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: HERO } as const;

function transcribed(spellId: string) {
  const spell = spells.find((entry) => entry.id === spellId);
  if (!spell) throw new Error(`${spellId} fixture`);
  const transcription = transcribeSpell(spell);
  if (!transcription.program) {
    throw new Error(`${spellId} program: ${JSON.stringify(transcription.clauses)}`);
  }
  return transcription;
}

function resolveSteps(spellId: string): readonly MechanicsStep[] {
  const { program } = transcribed(spellId);
  const resolve = program?.phases.find(({ phaseId }) => phaseId === "resolve");
  if (!resolve) throw new Error(`${spellId} resolve phase`);
  return resolve.steps;
}

function standingStep(steps: readonly MechanicsStep[], stepId: string) {
  const step = steps.find((entry) => entry.stepId === stepId);
  if (step?.kind !== "standing") throw new Error(`${stepId} standing step`);
  return step;
}

describe("recipient-aware spell standing emission", () => {
  it("death ward binds the active key AND the floor fact to the selected recipient", () => {
    const steps = resolveSteps("death-ward");
    const key = standingStep(steps, "standing-spell-death-ward");
    const floor = standingStep(steps, "standing-spell-death-ward-floor");
    expect(key.fact).toEqual({ key: "spell-death-ward", kind: "active-key" });
    expect(key.target).toEqual({ inputId: "targets", kind: "input" });
    expect(floor.fact).toEqual({ key: "spell-death-ward", kind: "zero-hp-floor" });
    expect(floor.target).toEqual({ inputId: "targets", kind: "input" });
    // Both share the spell's frozen 8-hour duration lifetime.
    expect(floor.lifetime).toEqual(key.lifetime);
    expect(key.lifetime).toMatchObject({ kind: "duration" });
  });

  it("aid pairs a cast-level-scaled max-hp-delta with a heal into the raised headroom", () => {
    const steps = resolveSteps("aid");
    const delta = standingStep(steps, "standing-spell-aid-max-hp");
    if (delta.fact.kind !== "max-hp-delta") throw new Error("max-hp-delta fact");
    expect(delta.fact.key).toBe("spell-aid");
    // The amount is authored as 5 + 5·max(0, slot − 2), reading the slot input.
    expect(JSON.stringify(delta.fact.amount)).toContain("input.slot.level");
    const heal = steps.find((entry) => entry.stepId === "standing-spell-aid-current-hp");
    if (heal?.kind !== "heal") throw new Error("aid heal step");
    expect(heal.target).toEqual({ inputId: "targets", kind: "input" });
    expect(heal.amount).toEqual({ expression: delta.fact.amount, kind: "integer" });
    // The delta standing precedes its heal so the compiler's same-cast
    // headroom sees it.
    expect(steps.indexOf(delta)).toBeLessThan(steps.indexOf(heal));
  });

  it("warding bond emits the ward's resistance and RECORDS the transfer payer", () => {
    const { clauses } = transcribed("warding-bond");
    const steps = resolveSteps("warding-bond");
    const resistance = standingStep(steps, "standing-spell-warding-bond-resistance");
    expect(resistance.fact).toEqual({
      kind: "damage-defense",
      rule: {
        kind: "resistance",
        selector: {
          damageTypes: [],
          deliveries: [],
          forbiddenTraits: [],
          requiredTraits: [],
        },
        sourceId: "spell-warding-bond",
      },
    });
    const transfer = standingStep(steps, "standing-spell-warding-bond-transfer");
    expect(transfer.fact).toEqual({
      key: "spell-warding-bond",
      kind: "damage-transfer",
      to: { kind: "role", role: "caster" },
    });
    // The transfer's APPLICATION is honestly a table boundary: the recipient's
    // hits are table events in solo play, so the kernel records the payer and
    // the table mirrors the damage.
    expect(clauses).toContainEqual({
      clauseId: "standing-spell-warding-bond-transfer",
      detail: "recorded-fact",
      status: "automated",
    });
    expect(clauses).toContainEqual({
      clauseId: "standing-spell-warding-bond-transfer-application",
      detail: "table-mirrors-damage-to-caster",
      status: "table",
    });
    // The AC/save riders stay with the derived grant layer.
    expect(
      clauses.filter((entry) => entry.clauseId === "standing-grant-ac-bonus")
    ).toHaveLength(1);
  });

  it("heroism emits the immunity fact and a turn-start THP pulse phase", () => {
    const { clauses, program } = transcribed("heroism");
    const steps = resolveSteps("heroism");
    const immunity = standingStep(steps, "standing-spell-heroism-immune-frightened");
    expect(immunity.fact).toEqual({
      conditionId: "frightened",
      kind: "condition-immunity",
    });
    const pulse = program?.phases.find(({ phaseId }) => phaseId === "turn-thp");
    if (!pulse) throw new Error("heroism turn-thp phase");
    expect(pulse.trigger).toEqual({ eventId: "turn-thp", kind: "root-pulse" });
    const grant = pulse.steps.find((entry) => entry.stepId === "turn-thp-grant");
    if (grant?.kind !== "temporary-hit-points") throw new Error("thp grant step");
    expect(grant.decision).toBe("replace");
    expect(grant.amount).toEqual({
      expression: { bindingId: "spellcasting-modifier", kind: "binding" },
      kind: "integer",
    });
    // Honest classification: the grant is automated, the turn-start SIGNAL is
    // the table's (no turn-boundary event bus yet — the possessor declares it).
    expect(clauses).toContainEqual({
      clauseId: "per-turn-temp-hp",
      detail: "pulse-on-recipient-turn-start",
      status: "automated",
    });
    expect(clauses).toContainEqual({
      clauseId: "per-turn-temp-hp-signal",
      detail: "table-signals-turn-start",
      status: "table",
    });
  });

  it("gates recipient debuffs like the condition suite: on-hit and on-failed-save", () => {
    // Chill Touch rides an attack: its standing applies on the landed hit.
    const chillTouch = standingStep(
      resolveSteps("chill-touch"),
      "standing-spell-chill-touch"
    );
    expect(chillTouch.target).toEqual({
      cardinality: "per-request",
      inputId: "attack",
      kind: "d20-outcome",
      outcomeIds: ["hit", "critical-hit"],
      quantifier: "any",
    });
    // Vicious Mockery rides a save: its standing applies on the failure.
    const mockery = standingStep(
      resolveSteps("vicious-mockery"),
      "standing-spell-vicious-mockery"
    );
    expect(mockery.target).toEqual({
      cardinality: "per-request",
      inputId: "saves",
      kind: "d20-outcome",
      outcomeIds: ["failure"],
      quantifier: "any",
    });
  });

  it("keeps caster-recipient buffs on the caster role (Hex unchanged)", () => {
    const hex = resolveSteps("hex");
    expect(standingStep(hex, "standing-spell-hex").target).toEqual({
      kind: "role",
      role: "caster",
    });
    expect(standingStep(hex, "mark-cursed").target).toEqual({
      kind: "role",
      role: "caster",
    });
  });

  it("every recipient-selected SRD spell still transcribes an executable program", () => {
    const recipients = spells.filter((spell) =>
      (spell.grants ?? []).some(
        (grant) => grant.type === "while-active" && grant.recipient === "selected"
      )
    );
    // 25 SRD-only; the composed pack adds its own recipient-selected twins.
    expect(recipients.length).toBeGreaterThanOrEqual(25);
    for (const spell of recipients) {
      expect(transcribeSpell(spell).program, spell.id).not.toBeNull();
    }
  });
});

describe("standing-fact authoring conformance", () => {
  const base = {
    id: "law-program",
    registers: [],
    version: 1,
  } as const;

  function program(fact: unknown, inputs: unknown[] = []) {
    return conformMechanicsProgram({
      ...base,
      phases: [
        {
          inputs,
          phaseId: "resolve",
          steps: [
            {
              fact,
              kind: "standing",
              lifetime: { kind: "manual" },
              operation: "start",
              stepId: "start",
              target: { kind: "role", role: "caster" },
              when: null,
            },
          ],
          trigger: { kind: "invocation" },
        },
      ],
    });
  }

  it("accepts the three new fact templates", () => {
    expect(program({ key: "ward", kind: "zero-hp-floor" })).not.toBeNull();
    expect(
      program({
        amount: { kind: "fixed", value: 5 },
        key: "aid",
        kind: "max-hp-delta",
      })
    ).not.toBeNull();
    expect(
      program({
        key: "bond",
        kind: "damage-transfer",
        to: { kind: "role", role: "caster" },
      })
    ).not.toBeNull();
  });

  it("rejects malformed templates and wrong-kind transfer selectors", () => {
    expect(program({ kind: "zero-hp-floor" })).toBeNull();
    expect(program({ key: "aid", kind: "max-hp-delta" })).toBeNull();
    expect(program({ key: "bond", kind: "damage-transfer" })).toBeNull();
    // A transfer payer selector must reference an ENTITIES input.
    expect(
      program(
        {
          key: "bond",
          kind: "damage-transfer",
          to: { inputId: "confirm", kind: "input" },
        },
        [{ inputId: "confirm", kind: "boolean", when: null }]
      )
    ).toBeNull();
  });
});

describe("standing-fact runtime conformance", () => {
  const origin = {
    execution: 1,
    kind: "program-step",
    phaseId: "resolve",
    root: {
      occurrence: { material: HERO, occurrenceId: "root-1" },
      ordinal: 1,
    },
    slot: 1,
    stepId: "start",
  } as const;

  function occurrence(fact: unknown) {
    return conformNewMechanicOccurrence({
      endRules: [],
      fact,
      kind: "standing",
      origin,
      parentId: "root-1",
      target: SELF,
    });
  }

  it("accepts the three new runtime facts exactly", () => {
    expect(occurrence({ key: "spell-death-ward", kind: "zero-hp-floor" })).not.toBeNull();
    expect(
      occurrence({ amount: 15, key: "spell-aid", kind: "max-hp-delta" })
    ).not.toBeNull();
    expect(
      occurrence({ key: "spell-warding-bond", kind: "damage-transfer", to: SELF })
    ).not.toBeNull();
  });

  it("rejects non-positive deltas, missing keys, and non-entity payers", () => {
    expect(occurrence({ amount: 0, key: "spell-aid", kind: "max-hp-delta" })).toBeNull();
    expect(
      occurrence({ amount: 1.5, key: "spell-aid", kind: "max-hp-delta" })
    ).toBeNull();
    expect(occurrence({ kind: "zero-hp-floor" })).toBeNull();
    expect(
      occurrence({ key: "spell-warding-bond", kind: "damage-transfer", to: "caster" })
    ).toBeNull();
  });
});

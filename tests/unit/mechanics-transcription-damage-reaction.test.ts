/**
 * The damage-reaction transcription FAMILY: a `type: "reaction"` action whose
 * whole effect is reducing one observed incoming damage instance compiles to
 * the canonical reactive shape — an invocation phase claiming the round's
 * Reaction plus a `damage-taken` phase carrying the
 * `incoming-damage-adjustment` (Deflect Attacks declaratively, Uncanny Dodge
 * through the authored action channel) — and the claim identity always
 * matches the turn-economy projection's requirement roster.
 */

import { describe, expect, it } from "vitest";

import { classFeatureIndex } from "@/data/classes";
import {
  damageReactionClaimId,
  transcribeFeatureAction,
} from "@/lib/mechanics-transcription";
import { characterTurnEconomyProjection } from "@/lib/mechanics-world-store";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { SrdActionDef } from "@/data/types";

function deflectAttacksAction(): Readonly<SrdActionDef> {
  const action = classFeatureIndex
    .get("monk-deflect-attacks")
    ?.mechanics?.actions?.find((candidate) => candidate.damageReduction !== undefined);
  if (!action) throw new Error("deflect attacks action missing");
  return action;
}

describe("damage-reaction transcription", () => {
  it("compiles Deflect Attacks: claim + damage-taken adjustment + rolled reduction", () => {
    const action = deflectAttacksAction();
    const transcription = transcribeFeatureAction("monk-deflect-attacks", action, 0, {
      scalingLevel: 3,
    });
    const program = transcription.program;
    expect(program).not.toBeNull();
    if (!program) return;
    expect(
      transcription.clauses.filter((clause) => clause.status === "unsupported")
    ).toEqual([]);
    // The reduction roll is a real physical input; its bonus (DEX + Monk
    // level) arrives as the caller-resolved feature-bonus binding.
    expect(
      transcription.clauses.some(
        (clause) =>
          clause.clauseId === "reduction-roll" && clause.status === "physical-input"
      )
    ).toBe(true);
    expect(
      transcription.clauses.some(
        (clause) =>
          clause.clauseId === "economy" && clause.detail === "kernel-claims-reaction"
      )
    ).toBe(true);

    const invocation = program.phases.find(
      (phase) => phase.trigger.kind === "invocation"
    );
    const claim = invocation?.steps.find((step) => step.kind === "turn-claim");
    expect(claim).toMatchObject({
      claim: {
        kind: "claim-reaction",
        reaction: {
          kind: "program",
          requirementId: damageReactionClaimId("monk-deflect-attacks", action, 0),
        },
      },
    });

    const deflect = program.phases.find((phase) => phase.trigger.kind === "damage-taken");
    expect(deflect).toBeDefined();
    if (!deflect) return;
    const adjustment = deflect.steps.find(
      (step) => step.kind === "incoming-damage-adjustment"
    );
    expect(adjustment).toMatchObject({
      selector: {
        // Monk 3: only Bludgeoning/Piercing/Slashing attacks deflect.
        damageTypes: ["bludgeoning", "piercing", "slashing"],
        deliveries: ["attack"],
      },
    });
    // Single-use: the spent reaction ends itself.
    expect(deflect.steps.some((step) => step.kind === "end-program")).toBe(true);
    // The rolled reduction is a dice input on the reactive phase.
    expect(deflect.inputs.some((input) => input.kind === "dice")).toBe(true);
  });

  it("widens Deflect Attacks to every damage type at Monk 13 (empty selector)", () => {
    const transcription = transcribeFeatureAction(
      "monk-deflect-attacks",
      deflectAttacksAction(),
      0,
      { scalingLevel: 13 }
    );
    const adjustment = transcription.program?.phases
      .flatMap((phase) => phase.steps)
      .find((step) => step.kind === "incoming-damage-adjustment");
    expect(adjustment).toMatchObject({ selector: { damageTypes: [] } });
  });

  it("reports the honest boundary without a session scaling level", () => {
    const transcription = transcribeFeatureAction(
      "monk-deflect-attacks",
      deflectAttacksAction(),
      0,
      {}
    );
    expect(transcription.program).toBeNull();
    expect(
      transcription.clauses.some(
        (clause) =>
          clause.clauseId === "reduction-damage-types" &&
          clause.status === "unsupported" &&
          clause.detail === "level-scaled-types-need-session-level"
      )
    ).toBe(true);
  });

  it("the projection's requirement roster authorizes every held reaction claim", () => {
    // The claim a transcribed/authored reaction program makes is admissible
    // exactly when the projection lists its requirement id — one id math
    // (`damageReactionClaimId`) on both sides, drift-proof by construction.
    const projection = characterTurnEconomyProjection(MOCK_CHARACTER);
    expect(projection).not.toBeNull();
    const ids = projection?.reactions.requirements.map(
      ({ requirementId }) => requirementId
    );
    expect(ids).toContain("reaction.rogue-uncanny-dodge.0");
  });
});

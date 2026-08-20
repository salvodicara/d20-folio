import { describe, expect, it } from "vitest";

import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";
import type { MechanicsStep } from "@/types/mechanics-program-authoring";
import type { TurnEconomyCommand } from "@/types/turn-economy";

type AuthoredTurnClaim = Extract<MechanicsStep, { readonly kind: "turn-claim" }>["claim"];
type CanonicalTurnClaim = Extract<TurnEconomyCommand, { readonly claimId: string }>;

function asCanonicalClaim(claim: AuthoredTurnClaim): CanonicalTurnClaim {
  return claim;
}

function asAuthoredClaim(claim: CanonicalTurnClaim): AuthoredTurnClaim {
  return claim;
}

function conformStep(step: unknown): MechanicsStep | null {
  const program = conformMechanicsProgram({
    id: "turn-claim-authoring",
    phases: [
      {
        inputs: [],
        phaseId: "resolve",
        steps: [step],
        trigger: { kind: "invocation" },
      },
    ],
    registers: [],
    version: 1,
  });
  return program?.phases[0].steps[0] ?? null;
}

function turnClaimStep(claim: unknown): unknown {
  return {
    claim,
    combatant: "owner",
    kind: "turn-claim",
    stepId: "claim",
    when: null,
  };
}

const CANONICAL_CLAIMS = [
  {
    action: {
      firstAttack: { claimId: "attack.first", optionId: "weapon.longsword" },
      kind: "attack",
    },
    claimId: "action.attack",
    kind: "claim-action",
  },
  {
    action: { kind: "ready", preparationId: "ready.fireball" },
    claimId: "action.ready",
    kind: "claim-action",
  },
  {
    attackActionClaimId: "action.attack",
    authorization: {
      kind: "light-nick",
      qualifyingAttackClaimId: "attack.first",
    },
    claimId: "attack.second",
    kind: "claim-attack",
    optionId: "weapon.scimitar",
  },
  {
    bonusAction: {
      kind: "action",
      requirementId: "feature.cunning-action.dash",
    },
    claimId: "bonus.dash",
    kind: "claim-bonus-action",
  },
  {
    claimId: "reaction.shield",
    kind: "claim-reaction",
    reaction: { kind: "program", requirementId: "spell.shield" },
  },
  {
    claimId: "reaction.ready",
    kind: "claim-reaction",
    reaction: { kind: "ready", readyActionClaimId: "action.ready" },
  },
  {
    claimId: "movement.fly",
    distanceFt: 30,
    kind: "move",
    mode: "fly",
  },
  {
    claimId: "movement.stand",
    kind: "claim-movement-requirement",
    requirementId: "condition.prone.stand",
  },
  {
    claimId: "interaction.door",
    interactionId: "door.open",
    kind: "claim-free-interaction",
    timingBoundary: { authority: "environment", boundaryId: "door.closed" },
  },
  {
    authority: "table",
    boundaryId: "range.confirmed",
    claimId: "boundary.range",
    kind: "record-manual-boundary",
  },
] as const satisfies readonly CanonicalTurnClaim[];

describe("MechanicsProgram turn-claim authoring", () => {
  it("is isomorphic to every claim-bearing TurnEconomyCommand payload", () => {
    for (const command of CANONICAL_CLAIMS) {
      const authored = asAuthoredClaim(command);
      expect(asCanonicalClaim(authored)).toEqual(command);
      expect(conformStep(turnClaimStep(command))).toMatchObject({
        claim: command,
        kind: "turn-claim",
      });
    }
  });

  it("rejects the generic reducer, lifecycle commands and inexact payloads", () => {
    expect(
      conformStep({
        amount: { kind: "fixed", value: 1 },
        claim: "dash",
        combatant: "owner",
        kind: "turn-claim",
        stepId: "legacy",
        when: null,
      })
    ).toBeNull();
    expect(
      conformStep({
        ...(turnClaimStep(CANONICAL_CLAIMS[0]) as Record<string, unknown>),
        amount: { kind: "fixed", value: 1 },
      })
    ).toBeNull();
    expect(
      conformStep(turnClaimStep({ kind: "start-turn", turnId: "turn.1" }))
    ).toBeNull();
    expect(
      conformStep(
        turnClaimStep({
          action: { kind: "ready" },
          claimId: "action.ready",
          kind: "claim-action",
        })
      )
    ).toBeNull();
    expect(
      conformStep(
        turnClaimStep({
          claimId: "movement.invalid",
          distanceFt: 30,
          kind: "move",
          mode: "teleport",
        })
      )
    ).toBeNull();
  });
});

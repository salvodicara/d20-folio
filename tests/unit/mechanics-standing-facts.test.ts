/**
 * The recipient-standing vocabulary laws: the authoring conformance of the
 * standing-fact templates and the exact runtime-fact boundary. The end-to-end
 * behavior (floor firing/consumption, raise-then-heal, resistance halving, the
 * THP pulse) is proven through the coordinator in mechanics-coordinator.test.ts.
 */
import { describe, expect, it } from "vitest";

import { conformNewMechanicOccurrence } from "@/lib/mechanic-occurrences";
import { conformMechanicsProgram } from "@/lib/mechanics-program-authoring";

const HERO = {
  characterId: "hero",
  kind: "character-play",
  uid: "user",
} as const;
const SELF = { entityId: "self", material: HERO } as const;

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

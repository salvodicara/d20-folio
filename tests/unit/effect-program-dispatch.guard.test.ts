/**
 * Uncanny Dodge (the public non-spell effect-program ex-carrier): its authored
 * program transcribes (damage-taken adjustment phase + the kernel Reaction claim).
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { classFeatureIndex } from "@/data/classes";
import { transcribeFeatureAction } from "@/lib/mechanics-transcription";

describe("uncanny dodge keeps dispatching engine", () => {
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
  });
});

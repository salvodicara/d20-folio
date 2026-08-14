import { describe, expect, it } from "vitest";

import type {
  CombatEffectCommandBatch,
  CombatEffectCommandLifecycleReceipt,
} from "@/lib/combat-effect-command";
import {
  atomicAddressKey,
  conformCombatEffectAtomicReadSet,
  type AtomicOwner,
  type AtomicRead,
  type CombatEffectAtomicReadSet,
} from "@/lib/combat-effect-atomic";
import {
  conformCombatEffectLifecycle,
  reduceCombatEffectLifecycle,
  serializeCombatEffectLifecycle,
  type CombatEffectLifecycleResult,
  type CombatEffectLifecycleRuntime,
} from "@/lib/combat-effect-lifecycle";

type LifecycleEvent = NonNullable<CombatEffectCommandLifecycleReceipt["events"]>[number];
type RelocationEvent = Extract<LifecycleEvent, { kind: "relocation-event" }>;
type LifecycleConsequence =
  CombatEffectCommandLifecycleReceipt["auxiliaryConsequences"][number];

interface LifecycleOptions {
  occurrenceId?: string;
  programId?: string;
  phaseId?: string;
  sourceId?: string;
  occurrence?: number;
  attempt?: number;
  initialTallies?: Readonly<Record<string, number>>;
  finalTallies?: Readonly<Record<string, number>>;
  initialLayerStates?: Readonly<Record<string, "active" | "destroyed">>;
  finalLayerStates?: Readonly<Record<string, "active" | "destroyed">>;
  initialAreaStates?: CombatEffectCommandLifecycleReceipt["initialAreaStates"];
  finalAreaStates?: CombatEffectCommandLifecycleReceipt["finalAreaStates"];
  ended?: boolean;
  events?: ReadonlyArray<LifecycleEvent>;
  auxiliaryConsequences?: ReadonlyArray<LifecycleConsequence>;
}

function lifecycle(options: LifecycleOptions = {}): CombatEffectCommandLifecycleReceipt {
  return {
    occurrenceId: options.occurrenceId ?? "cast:one",
    programId: options.programId ?? "spell:test",
    phaseId: options.phaseId ?? "resolve",
    sourceId: options.sourceId ?? "caster:one",
    occurrence: options.occurrence ?? 0,
    attempt: options.attempt ?? 0,
    auxiliaryConsequences: options.auxiliaryConsequences ?? [],
    ...(options.events === undefined ? {} : { events: options.events }),
    initialTallies: options.initialTallies ?? {},
    finalTallies: options.finalTallies ?? options.initialTallies ?? {},
    ...(options.initialLayerStates === undefined
      ? {}
      : { initialLayerStates: options.initialLayerStates }),
    ...(options.finalLayerStates === undefined
      ? options.initialLayerStates === undefined
        ? {}
        : { finalLayerStates: options.initialLayerStates }
      : { finalLayerStates: options.finalLayerStates }),
    ...(options.initialAreaStates === undefined
      ? {}
      : { initialAreaStates: options.initialAreaStates }),
    ...(options.finalAreaStates === undefined
      ? options.initialAreaStates === undefined
        ? {}
        : { finalAreaStates: options.initialAreaStates }
      : { finalAreaStates: options.finalAreaStates }),
    ended: options.ended ?? false,
  };
}

function id(receipt: CombatEffectCommandLifecycleReceipt): string {
  return [
    receipt.occurrenceId,
    receipt.programId,
    receipt.phaseId,
    receipt.sourceId,
    String(receipt.occurrence),
    String(receipt.attempt),
  ]
    .map((part) => `${part.length}:${part}`)
    .join("|");
}

function payloadIdentity(receipt: CombatEffectCommandLifecycleReceipt): string {
  // Production supplies a canonical identity for the entire reviewed command.
  // These lifecycle-only fixtures have no mutations, so the lifecycle payload is
  // the complete variable command content that must remain bound across replay.
  return JSON.stringify(receipt);
}

function readSet(
  receipt: CombatEffectCommandLifecycleReceipt
): CombatEffectAtomicReadSet {
  const owner: AtomicOwner = {
    kind: "pc",
    surface: "shared",
    campaignId: "campaign:one",
    encounterEpoch: 1,
    combatantId: receipt.sourceId,
    memberUid: "caster-user",
    characterId: "caster-character",
  };
  const reads: AtomicRead[] = [
    {
      owner,
      address: {
        kind: "document-revision",
        document: {
          kind: "character-play",
          uid: "caster-user",
          characterId: "caster-character",
        },
      },
      expected: 0,
    },
    {
      owner,
      address: {
        kind: "document-revision",
        document: {
          kind: "shared-encounter",
          campaignId: "campaign:one",
          encounterEpoch: 1,
        },
      },
      expected: 0,
    },
    {
      owner,
      address: { kind: "base-state" },
      expected: {
        hp: 10,
        tempHp: 0,
        stable: false,
        deathSaves: { successes: 0, failures: 0 },
        conditions: [],
        conditionLifetimes: {},
        standing: [],
        standingLifetimes: {},
        resources: {},
        stateFlags: {},
      },
    },
    { owner, address: { kind: "max-hp" }, expected: 10 },
    {
      owner,
      address: { kind: "damage-defenses" },
      expected: {
        allDamageResistance: false,
        resistances: [],
        immunities: [],
        vulnerabilities: [],
        sourceResistances: [],
        flatReductions: [],
        saveDamageRules: [],
      },
    },
    { owner, address: { kind: "zero-hp-floors" }, expected: [] },
    { owner, address: { kind: "occurrence-heads" }, expected: [] },
    {
      owner,
      address: {
        kind: "lifecycle-head",
        occurrenceId: receipt.occurrenceId,
        programId: receipt.programId,
        sourceId: receipt.sourceId,
      },
      expected: { present: false },
    },
  ];
  reads.sort((left, right) =>
    atomicAddressKey(left.owner, left.address).localeCompare(
      atomicAddressKey(right.owner, right.address)
    )
  );
  const candidate: CombatEffectAtomicReadSet = {
    schema: 1,
    bindings: [{ ref: { kind: "source", id: receipt.sourceId }, owner }],
    reads,
  };
  const conformed = conformCombatEffectAtomicReadSet(candidate, {
    occurrenceId: receipt.occurrenceId,
    programId: receipt.programId,
    sourceId: receipt.sourceId,
  });
  if (!conformed) throw new TypeError("Invalid lifecycle read-set fixture");
  return conformed;
}

function batch(
  receipt: CombatEffectCommandLifecycleReceipt,
  operation: "commit" | "undo" | "redo" = "commit"
): CombatEffectCommandBatch {
  const reverse = operation === "undo";
  return {
    schema: 1,
    commandId: id(receipt),
    payloadIdentity: payloadIdentity(receipt),
    adapterId: "coordinator",
    surface: "shared",
    direction: reverse ? "reverse" : "forward",
    expectedCausalState:
      operation === "commit" ? "available" : reverse ? "committed" : "undone",
    nextCausalState: reverse ? "undone" : "committed",
    readSet: readSet(receipt),
    readSetPolicy: operation === "commit" ? "initial" : reverse ? "undo" : "redo",
    coordinatesLifecycle: true,
    lifecycle: receipt,
    operations: [],
  };
}

function provenance(
  receipt: Pick<
    CombatEffectCommandLifecycleReceipt,
    "occurrenceId" | "programId" | "phaseId" | "occurrence"
  >,
  stepId: string
) {
  return {
    occurrenceId: receipt.occurrenceId,
    programId: receipt.programId,
    phaseId: receipt.phaseId,
    stepId,
    target: null,
    instance: null,
    iteration: receipt.occurrence,
  } as const;
}

function relocation(
  receipt: CombatEffectCommandLifecycleReceipt,
  stepId: string
): RelocationEvent {
  return {
    kind: "relocation-event",
    provenance: provenance(receipt, stepId),
    recipient: { kind: "source", id: receipt.sourceId },
    mode: "teleport",
    destination: { kind: "manual" },
  };
}

function counter(
  receipt: CombatEffectCommandLifecycleReceipt,
  before: number,
  after: number
): LifecycleConsequence {
  return {
    kind: "counter",
    provenance: provenance(receipt, "pulse"),
    counterId: "pulse",
    before,
    after,
  };
}

function endProgram(receipt: CombatEffectCommandLifecycleReceipt): LifecycleConsequence {
  return {
    kind: "end-program",
    provenance: provenance(receipt, "end"),
  };
}

function applied(
  result: CombatEffectLifecycleResult
): Readonly<CombatEffectLifecycleRuntime> {
  expect(result.status).toBe("applied");
  if (result.status !== "applied")
    throw new TypeError("Expected applied lifecycle result");
  return result.runtime;
}

function commit(
  current: Readonly<CombatEffectLifecycleRuntime> | null,
  receipt: CombatEffectCommandLifecycleReceipt
): Readonly<CombatEffectLifecycleRuntime> {
  return applied(reduceCombatEffectLifecycle(current, batch(receipt)));
}

describe("combat effect lifecycle ledger", () => {
  it("accepts the first authored cursor and commits an event-only coordinator batch", () => {
    const seed = lifecycle({
      initialTallies: { pulse: 3 },
      initialLayerStates: { "wall:one": "active" },
      initialAreaStates: ["strong-wind", "obscured"],
    });
    const receipt = lifecycle({
      initialTallies: seed.initialTallies,
      initialLayerStates: seed.initialLayerStates,
      initialAreaStates: seed.initialAreaStates,
      events: [relocation(seed, "relocate")],
    });
    const runtime = commit(null, receipt);

    expect(runtime.cursor).toEqual({
      tallies: [{ id: "pulse", value: 3 }],
      layerStates: [{ id: "wall:one", state: "active" }],
      areaStates: ["obscured", "strong-wind"],
      ended: false,
      phases: [{ phaseId: "resolve", nextOccurrence: 1 }],
    });
    expect(runtime.commands).toHaveLength(1);
    expect(runtime.commands[0]?.schema).toBe(1);
    expect(runtime.events).toEqual([
      { commandId: id(receipt), event: receipt.events?.[0] },
    ]);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.cursor.tallies[0])).toBe(true);

    const serialized = serializeCombatEffectLifecycle(runtime);
    const conformed = conformCombatEffectLifecycle(JSON.parse(serialized));
    expect(conformed).not.toBeNull();
    expect(serializeCombatEffectLifecycle(conformed)).toBe(serialized);
  });

  it("rejects an identical commit retry as a duplicate without advancing cadence", () => {
    const receipt = lifecycle();
    const runtime = commit(null, receipt);

    expect(reduceCombatEffectLifecycle(runtime, batch(receipt))).toEqual({
      status: "rejected",
      reason: "duplicate-command",
    });
    expect(runtime.cursor.phases).toEqual([{ phaseId: "resolve", nextOccurrence: 1 }]);
  });

  it("rejects payload substitution behind the same command header on every replay path", () => {
    const receipt = lifecycle();
    const committed = commit(null, receipt);
    const forgedIdentity = "forged-reviewed-payload";

    expect(
      reduceCombatEffectLifecycle(committed, {
        ...batch(receipt),
        payloadIdentity: forgedIdentity,
      })
    ).toEqual({ status: "rejected", reason: "stale-command" });
    expect(
      reduceCombatEffectLifecycle(committed, {
        ...batch(receipt, "undo"),
        payloadIdentity: forgedIdentity,
      })
    ).toEqual({ status: "rejected", reason: "stale-command" });

    const undone = applied(
      reduceCombatEffectLifecycle(committed, batch(receipt, "undo"))
    );
    expect(
      reduceCombatEffectLifecycle(undone, {
        ...batch(receipt, "redo"),
        payloadIdentity: forgedIdentity,
      })
    ).toEqual({ status: "rejected", reason: "stale-command" });
  });

  it("rejects out-of-order cadence but accepts distinct repeating occurrences", () => {
    const firstBase = lifecycle({
      initialTallies: { pulse: 0 },
      finalTallies: { pulse: 1 },
    });
    const first = lifecycle({
      initialTallies: firstBase.initialTallies,
      finalTallies: firstBase.finalTallies,
      auxiliaryConsequences: [counter(firstBase, 0, 1)],
    });
    const afterFirst = commit(null, first);
    const skippedBase = lifecycle({
      occurrence: 2,
      initialTallies: { pulse: 1 },
      finalTallies: { pulse: 2 },
    });
    const skipped = lifecycle({
      occurrence: 2,
      initialTallies: skippedBase.initialTallies,
      finalTallies: skippedBase.finalTallies,
      auxiliaryConsequences: [counter(skippedBase, 1, 2)],
    });
    expect(reduceCombatEffectLifecycle(afterFirst, batch(skipped))).toEqual({
      status: "rejected",
      reason: "occurrence-conflict",
    });

    const secondBase = lifecycle({
      occurrence: 1,
      initialTallies: { pulse: 1 },
      finalTallies: { pulse: 2 },
    });
    const second = lifecycle({
      occurrence: 1,
      initialTallies: secondBase.initialTallies,
      finalTallies: secondBase.finalTallies,
      auxiliaryConsequences: [counter(secondBase, 1, 2)],
    });
    const afterSecond = commit(afterFirst, second);
    expect(afterSecond.cursor.tallies).toEqual([{ id: "pulse", value: 2 }]);
    expect(afterSecond.cursor.phases).toEqual([
      { phaseId: "resolve", nextOccurrence: 2 },
    ]);
    expect(afterSecond.commands.map((command) => command.commandId)).toEqual([
      id(first),
      id(second),
    ]);
  });

  it("tracks cadence independently per phase", () => {
    const resolved = lifecycle();
    const upkeep = lifecycle({ phaseId: "turn-start", occurrence: 0 });
    const runtime = commit(commit(null, resolved), upkeep);

    expect(runtime.cursor.phases).toEqual([
      { phaseId: "resolve", nextOccurrence: 1 },
      { phaseId: "turn-start", nextOccurrence: 1 },
    ]);
  });

  it("fences an earlier undo behind the later causal head", () => {
    const first = lifecycle();
    const second = lifecycle({ occurrence: 1 });
    const runtime = commit(commit(null, first), second);

    expect(reduceCombatEffectLifecycle(runtime, batch(first, "undo"))).toEqual({
      status: "rejected",
      reason: "head-conflict",
    });
  });

  it("undoes only the head's owned facts and redo restores byte-identical state", () => {
    const firstSeed = lifecycle();
    const first = lifecycle({ events: [relocation(firstSeed, "first")] });
    const secondSeed = lifecycle({ occurrence: 1 });
    const second = lifecycle({
      occurrence: 1,
      events: [relocation(secondSeed, "second")],
    });
    const committed = commit(commit(null, first), second);
    const committedJson = serializeCombatEffectLifecycle(committed);

    const undone = applied(reduceCombatEffectLifecycle(committed, batch(second, "undo")));
    expect(undone.cursor.phases).toEqual([{ phaseId: "resolve", nextOccurrence: 1 }]);
    expect(undone.events.map((entry) => entry.commandId)).toEqual([id(first)]);
    expect(undone.commands.map((command) => command.causalState)).toEqual([
      "committed",
      "undone",
    ]);
    expect(reduceCombatEffectLifecycle(undone, batch(second, "undo"))).toEqual({
      status: "rejected",
      reason: "duplicate-command",
    });

    const redone = applied(reduceCombatEffectLifecycle(undone, batch(second, "redo")));
    expect(serializeCombatEffectLifecycle(redone)).toBe(committedJson);
    expect(reduceCombatEffectLifecycle(redone, batch(second, "redo"))).toEqual({
      status: "rejected",
      reason: "duplicate-command",
    });
  });

  it("allows a corrected higher attempt after undo without weakening retry fencing", () => {
    const originalSeed = lifecycle();
    const original = lifecycle({
      events: [relocation(originalSeed, "original")],
    });
    const committed = commit(null, original);
    const undone = applied(
      reduceCombatEffectLifecycle(committed, batch(original, "undo"))
    );
    const correctedSeed = lifecycle({ attempt: 1 });
    const corrected = lifecycle({
      attempt: 1,
      events: [relocation(correctedSeed, "corrected")],
    });
    const replacement = commit(undone, corrected);

    expect(replacement.headCommandId).toBe(id(corrected));
    expect(replacement.commands.map((command) => command.causalState)).toEqual([
      "undone",
      "committed",
    ]);
    expect(replacement.cursor.phases).toEqual([
      { phaseId: "resolve", nextOccurrence: 1 },
    ]);
    expect(reduceCombatEffectLifecycle(replacement, batch(corrected))).toEqual({
      status: "rejected",
      reason: "duplicate-command",
    });
    expect(reduceCombatEffectLifecycle(replacement, batch(original, "redo"))).toEqual({
      status: "rejected",
      reason: "head-conflict",
    });
  });

  it.each([{ sourceId: "caster:two" }, { programId: "spell:other" }])(
    "rejects a source/program identity collision: %o",
    (identity) => {
      const runtime = commit(null, lifecycle());
      expect(reduceCombatEffectLifecycle(runtime, batch(lifecycle(identity)))).toEqual({
        status: "rejected",
        reason: "identity-conflict",
      });
    }
  );

  it("rejects an exact initial-cursor mismatch", () => {
    const firstBase = lifecycle({
      initialTallies: { pulse: 0 },
      finalTallies: { pulse: 1 },
    });
    const first = lifecycle({
      initialTallies: firstBase.initialTallies,
      finalTallies: firstBase.finalTallies,
      auxiliaryConsequences: [counter(firstBase, 0, 1)],
    });
    const runtime = commit(null, first);
    const stale = lifecycle({
      occurrence: 1,
      initialTallies: { pulse: 0 },
      finalTallies: { pulse: 0 },
    });

    expect(reduceCombatEffectLifecycle(runtime, batch(stale))).toEqual({
      status: "rejected",
      reason: "cursor-conflict",
    });
  });

  it("fails closed on malformed persisted input and exact-schema additions", () => {
    const receipt = lifecycle();
    const runtime = commit(null, receipt);
    const malformed = JSON.parse(serializeCombatEffectLifecycle(runtime)) as Record<
      string,
      unknown
    >;
    const commands = malformed.commands as Array<Record<string, unknown>>;
    const first = commands[0];
    if (!first) throw new TypeError("Missing command fixture");
    first.futureField = true;

    expect(conformCombatEffectLifecycle(malformed)).toBeNull();
    expect(reduceCombatEffectLifecycle(malformed, batch(receipt, "undo"))).toEqual({
      status: "rejected",
      reason: "invalid-runtime",
    });
    expect(() => serializeCombatEffectLifecycle(malformed)).toThrow(TypeError);

    const accessor = JSON.parse(serializeCombatEffectLifecycle(runtime)) as Record<
      string,
      unknown
    >;
    const cursor = accessor.cursor as object;
    Object.defineProperty(cursor, "ended", { enumerable: true, get: () => false });
    expect(conformCombatEffectLifecycle(accessor)).toBeNull();
  });

  it("rejects new commands after end while allowing exact undo and redo", () => {
    const endingSeed = lifecycle({ ended: true });
    const ending = lifecycle({
      ended: true,
      auxiliaryConsequences: [endProgram(endingSeed)],
    });
    const ended = commit(null, ending);
    expect(ended.cursor.ended).toBe(true);

    const laterPhase = lifecycle({ phaseId: "manual", occurrence: 0 });
    expect(reduceCombatEffectLifecycle(ended, batch(laterPhase))).toEqual({
      status: "rejected",
      reason: "ended",
    });
    const undone = applied(reduceCombatEffectLifecycle(ended, batch(ending, "undo")));
    expect(undone.cursor.ended).toBe(false);
    const redone = applied(reduceCombatEffectLifecycle(undone, batch(ending, "redo")));
    expect(redone.cursor.ended).toBe(true);
  });

  it("rejects stale replay facts and non-coordinator batches", () => {
    const seed = lifecycle();
    const receipt = lifecycle({ events: [relocation(seed, "move")] });
    const committed = commit(null, receipt);
    const undone = applied(
      reduceCombatEffectLifecycle(committed, batch(receipt, "undo"))
    );
    const changedEvent: LifecycleEvent = {
      ...relocation(seed, "move"),
      mode: "plane-transfer",
    };
    const changed = lifecycle({ events: [changedEvent] });
    expect(reduceCombatEffectLifecycle(undone, batch(changed, "redo"))).toEqual({
      status: "rejected",
      reason: "stale-command",
    });

    const nonCoordinator: CombatEffectCommandBatch = {
      ...batch(receipt),
      coordinatesLifecycle: false,
      lifecycle: undefined,
    };
    expect(reduceCombatEffectLifecycle(null, nonCoordinator)).toEqual({
      status: "rejected",
      reason: "not-coordinator",
    });
  });
});

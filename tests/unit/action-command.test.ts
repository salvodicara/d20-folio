import { describe, expect, it, vi } from "vitest";

import {
  actionCommitTransition,
  actionRedoTransition,
  actionUndoTransition,
  executeActionTransition,
  isActionCommandReceipt,
  prepareActionCommand,
  serializeActionCommandReceipt,
  type ActionCommandAdapter,
  type ActionCommandDraft,
  type ActionCommandReceipt,
} from "@/lib/action-command";
import {
  atomicDocumentForOwner,
  conformCombatEffectAtomicReadSet,
  type AtomicOwner,
} from "@/lib/combat-effect-atomic";
import {
  prepareCombatEffectCommand,
  type CombatEffectCommandAdapter,
  type CombatEffectCommandReceipt,
} from "@/lib/combat-effect-command";
import { createCombatEffectPlanningState } from "@/lib/combat-effect-planning-state";
import type {
  CombatEffectMutation,
  CombatEffectMutationReceipt,
  CombatEffectPlan,
  CombatEffectStateView,
} from "@/lib/combat-effect-program";
import type { DamageDefenses } from "@/lib/damage-intake";

const owner: AtomicOwner = {
  kind: "pc",
  surface: "local",
  uid: "user:one",
  characterId: "character:one",
  combatantId: "hero:one",
};
const source = { kind: "source", id: owner.combatantId } as const;
const state: CombatEffectStateView = {
  hp: 8,
  maxHp: 10,
  tempHp: 0,
  stable: false,
  deathSaves: { successes: 0, failures: 0 },
  conditions: [],
  conditionLifetimes: {},
  standing: [],
  standingLifetimes: {},
  resources: {},
  stateFlags: {},
};
const defenses: DamageDefenses = {
  allDamageResistance: false,
  resistances: new Set(),
  immunities: new Set(),
  vulnerabilities: new Set(),
  sourceResistances: new Set(),
  flatReductions: [],
  saveDamageRules: [],
};

function combatEffectReceipt(): CombatEffectCommandReceipt {
  const header = {
    occurrenceId: "occurrence:action",
    programId: "program:action",
    sourceId: source.id,
  };
  const planning = createCombatEffectPlanningState([
    {
      owner,
      documentRevisions: [{ document: atomicDocumentForOwner(owner), revision: 0 }],
      refs: [source],
      baseState: state,
      defenses,
      resourceSnapshots: {},
      stateFlagBindings: {},
      occurrenceHeads: [],
      lifecycleHeads: [{ header, expected: { present: false } }],
      stateZeroHpFloors: [],
    },
  ]);
  const draft = planning.createDisposableDraft();
  const readSet = conformCombatEffectAtomicReadSet(draft.atomicReadSet(header), header);
  if (!readSet) throw new Error("Fixture read set rejected");
  const mutation: CombatEffectMutation = {
    kind: "heal",
    amount: 2,
    provenance: {
      occurrenceId: header.occurrenceId,
      programId: header.programId,
      phaseId: "resolve",
      stepId: "heal",
      target: null,
      instance: 0,
      iteration: 0,
    },
    recipient: source,
  };
  const consequence = {
    ...mutation,
    ...draft.apply(mutation),
  } as CombatEffectMutationReceipt;
  const plan: CombatEffectPlan = {
    schema: 1,
    ...header,
    phaseId: "resolve",
    occurrence: 0,
    readSet,
    consequences: [consequence],
    initialTallies: {},
    finalTallies: {},
    ended: false,
  };
  const adapter: CombatEffectCommandAdapter = {
    id: "play-state",
    surface: "local",
    accepts: () => true,
    compareAndSwap: () => ({ status: "rejected", reason: "failed" }),
  };
  const prepared = prepareCombatEffectCommand(plan, [adapter]);
  if (prepared.status !== "prepared") throw new Error(prepared.reason);
  return prepared.receipt;
}

function command(overrides: Partial<ActionCommandDraft> = {}): {
  status: "ready";
  command: ActionCommandDraft;
} {
  const effect = combatEffectReceipt();
  return {
    status: "ready",
    command: {
      schema: 1,
      commandId: "action:one",
      adapterId: "play-state",
      actor: owner,
      predecessor: null,
      legs: [
        {
          id: "log",
          kind: "log",
          owner,
          changes: [
            {
              path: ["log", "action:one"],
              expected: { present: false },
              next: { present: true, value: { kind: "action", id: "action:one" } },
            },
          ],
        },
        {
          id: "effects",
          kind: "combat-effect",
          owners: [owner],
          receipt: effect,
        },
      ],
      ...overrides,
    },
  };
}

function preparedReceipt(): ActionCommandReceipt {
  const prepared = prepareActionCommand(command());
  if (prepared.status !== "prepared") throw new Error("Fixture command rejected");
  return prepared.receipt;
}

describe("action command envelope", () => {
  it("normalizes one physical action receipt and materializes exact child transitions", () => {
    const prepared = prepareActionCommand(command());
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;

    expect(prepared.receipt.legs.map(({ kind }) => kind)).toEqual([
      "combat-effect",
      "log",
    ]);
    expect(isActionCommandReceipt(prepared.receipt)).toBe(true);
    expect(Object.isFrozen(prepared.receipt)).toBe(true);
    expect(serializeActionCommandReceipt(prepared.receipt)).toBe(
      serializeActionCommandReceipt(
        JSON.parse(serializeActionCommandReceipt(prepared.receipt))
      )
    );

    const commit = actionCommitTransition(prepared.receipt);
    const undo = actionUndoTransition(prepared.receipt, 1);
    const redo = actionRedoTransition(prepared.receipt, 2);
    expect(commit).toMatchObject({
      kind: "commit",
      policy: "initial",
      direction: "forward",
      expectedGeneration: 0,
    });
    expect(commit.combatEffectBatch).toMatchObject({ readSetPolicy: "initial" });
    expect(undo.combatEffectBatch).toMatchObject({ readSetPolicy: "undo" });
    expect(redo.combatEffectBatch).toMatchObject({ readSetPolicy: "redo" });
  });

  it("rejects unknown fields", () => {
    const unknown = command() as unknown as {
      status: "ready";
      command: ActionCommandDraft & { future: true };
    };
    unknown.command.future = true;
    expect(prepareActionCommand(unknown)).toEqual({
      status: "rejected",
      reason: "invalid-command",
    });
  });

  it("executes through one adapter with generation, durability and retry identity fences", async () => {
    const receipt = preparedReceipt();
    const transition = actionCommitTransition(receipt);
    const compareAndSwap = vi.fn<ActionCommandAdapter["compareAndSwap"]>(() => ({
      status: "applied" as const,
      generation: 1,
      head: receipt.commandId,
      durability: "local-pending" as const,
    }));
    const adapter: ActionCommandAdapter = {
      id: receipt.adapterId,
      surface: "local",
      compareAndSwap,
    };
    await expect(executeActionTransition(transition, adapter)).resolves.toMatchObject({
      status: "applied",
      generation: 1,
      head: receipt.commandId,
      durability: "local-pending",
    });
    expect(compareAndSwap).toHaveBeenCalledTimes(1);
    expect(Object.isFrozen(compareAndSwap.mock.calls[0]?.[0])).toBe(true);

    const collision: ActionCommandAdapter = {
      ...adapter,
      compareAndSwap: () => ({
        status: "already-applied",
        payloadIdentity: "different",
        generation: 1,
        head: receipt.commandId,
        durability: "server-confirmed",
      }),
    };
    await expect(executeActionTransition(transition, collision)).resolves.toEqual({
      status: "rejected",
      reason: "command-collision",
    });

    const wrongGeneration: ActionCommandAdapter = {
      ...adapter,
      compareAndSwap: () => ({
        status: "applied",
        generation: 3,
        head: receipt.commandId,
        durability: "server-confirmed",
      }),
    };
    await expect(executeActionTransition(transition, wrongGeneration)).resolves.toEqual({
      status: "rejected",
      reason: "adapter-failure",
    });
  });

  it("requires odd/even causal generations before crossing the adapter boundary", () => {
    const receipt = preparedReceipt();
    expect(() => actionUndoTransition(receipt, 0)).toThrow(TypeError);
    expect(() => actionUndoTransition(receipt, 2)).toThrow(TypeError);
    expect(() => actionRedoTransition(receipt, 1)).toThrow(TypeError);
    expect(() => actionRedoTransition(receipt, 3)).toThrow(TypeError);
  });
});

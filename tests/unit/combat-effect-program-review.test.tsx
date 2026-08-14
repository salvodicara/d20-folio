import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import type { CombatEffectProgram } from "@/data/types";
import { CombatEffectProgramReview } from "@/features/character/center/CombatEffectProgramReview";
import i18n, { changeLanguage } from "@/i18n";
import {
  atomicAddressKey,
  atomicEntityBindingKey,
  type AtomicOwner,
  type AtomicRead,
  type CombatEffectAtomicReadSetHeader,
} from "@/lib/combat-effect-atomic";
import type {
  CombatEffectDisposableDraft,
  CombatEffectEntityRef,
  CombatEffectExecution,
  CombatEffectGeneratedMutationIntent,
  CombatEffectMutation,
  CombatEffectPlan,
  CombatEffectPlanningState,
  CombatEffectStateView,
} from "@/lib/combat-effect-program";
import { validateCombatEffectProgram } from "@/lib/combat-effect-program";
import { combatTableEntityRef } from "@/lib/combat-test-context";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const PROGRAM = {
  version: 1,
  id: "reviewed-prismatic-blast",
  gates: [
    {
      id: "resist",
      kind: "save",
      scope: "target",
      ability: "DEX",
      dc: 10,
    },
  ],
  inputs: [
    {
      id: "damage-roll",
      kind: "roll",
      scope: "target",
      roll: { count: 2, sides: 6 },
      when: { kind: "gate", gateId: "resist", result: "failure" },
    },
    {
      id: "element",
      kind: "choice",
      scope: "target",
      options: ["fire", "cold"],
    },
    {
      id: "destination",
      kind: "table-roll",
      scope: "target",
      roll: { count: 1, sides: 6 },
      rerollValues: [1],
    },
  ],
  phases: [
    {
      id: "resolve",
      trigger: { kind: "resolve" },
      steps: [
        {
          id: "blast",
          kind: "damage",
          scope: "target",
          subject: "target",
          amount: { kind: "input", inputId: "damage-roll" },
          damageType: { kind: "choice", inputId: "element" },
          gate: { gateId: "resist", pass: "failure", otherwise: "skip" },
          when: { kind: "gate", gateId: "resist", result: "failure" },
        },
        {
          id: "teleport",
          kind: "relocation-event",
          scope: "target",
          subject: "target",
          mode: "teleport",
          destination: { kind: "table", inputId: "destination" },
        },
      ],
    },
  ],
} satisfies CombatEffectProgram;

const EXECUTION = {
  occurrenceId: "cast:reviewed-prismatic-blast",
  phaseId: "resolve",
  sourceId: "hero:one",
  targets: [{ combatantId: "enemy:one" }],
  instances: 1,
  gateContexts: [
    {
      gateId: "resist",
      target: { combatantId: "enemy:one" },
      context: {
        ability: "DEX",
        actor: combatTableEntityRef("enemy:one"),
        difficultyClass: { kind: "fixed", value: 10 },
        enteredModifiers: [],
        kind: "saving-throw",
        modifiers: [],
        resolution: { kind: "rolled" },
        rollRules: {
          advantageSourceIds: ["feature:danger-sense"],
          disadvantageSourceIds: [],
          extraD20SourceIds: [],
          faceFloors: [],
          replacements: [],
          substitutions: [],
          totalFloors: [],
        },
        target: combatTableEntityRef("enemy:one"),
        testId: "resist:enemy:one",
      },
    },
  ],
} satisfies CombatEffectExecution;

function state(overrides: Partial<CombatEffectStateView> = {}): CombatEffectStateView {
  return {
    hp: 20,
    maxHp: 20,
    tempHp: 0,
    stable: false,
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    conditionLifetimes: {},
    standing: [],
    standingLifetimes: {},
    resources: {},
    stateFlags: {},
    ...overrides,
  };
}

function cloneState(value: CombatEffectStateView): CombatEffectStateView {
  return structuredClone(value);
}

const PROTECTIVE_BOND: ActiveCombatEffect = {
  id: "protective-bond",
  actor: { kind: "monster", combatantId: "ally:one" },
  target: { kind: "monster", combatantId: "enemy:one" },
  source: { kind: "spell", id: "warding-bond", actionId: "spell-warding-bond" },
  payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
  duration: { kind: "encounter" },
};

function testPlanningState(
  durableTarget: CombatEffectStateView
): CombatEffectPlanningState {
  return {
    createDisposableDraft(): CombatEffectDisposableDraft {
      const entities = new Map<string, CombatEffectStateView>([
        ["target:enemy:one", cloneState(durableTarget)],
        ["target:ally:one", state({ hp: 12, maxHp: 12 })],
        ["source:hero:one", state()],
      ]);
      const current = (ref: CombatEffectEntityRef): CombatEffectStateView => {
        const value = entities.get(entityKey(ref));
        if (!value) throw new RangeError("Unknown test combatant");
        return value;
      };
      return {
        atomicReadSet(header: CombatEffectAtomicReadSetHeader) {
          const bindings = [...entities].map(([key]) => {
            const ref: CombatEffectEntityRef = key.startsWith("source:")
              ? { kind: "source", id: key.slice("source:".length) }
              : {
                  kind: "target",
                  target: { combatantId: key.slice("target:".length) },
                };
            const owner: AtomicOwner = {
              kind: "monster",
              surface: "shared",
              campaignId: "campaign:review",
              encounterEpoch: 1,
              combatantId: ref.kind === "source" ? ref.id : ref.target.combatantId,
            };
            return { ref, owner };
          });
          const reads: AtomicRead[] = [];
          const sharedDocument = {
            kind: "shared-encounter" as const,
            campaignId: "campaign:review",
            encounterEpoch: 1,
          };
          const firstBinding = bindings[0];
          if (!firstBinding) throw new RangeError("Test read set has no bindings");
          reads.push({
            owner: firstBinding.owner,
            address: { kind: "document-revision", document: sharedDocument },
            expected: 1,
          });
          for (const binding of bindings) {
            const value = current(binding.ref);
            reads.push(
              {
                owner: binding.owner,
                address: { kind: "base-state" },
                expected: {
                  hp: value.hp,
                  tempHp: value.tempHp,
                  stable: value.stable,
                  deathSaves: value.deathSaves,
                  conditions: [...value.conditions].sort(),
                  conditionLifetimes: value.conditionLifetimes,
                  standing: [...value.standing].sort(),
                  standingLifetimes: value.standingLifetimes,
                  resources: value.resources,
                  stateFlags: value.stateFlags,
                },
              },
              {
                owner: binding.owner,
                address: { kind: "max-hp" },
                expected: value.maxHp,
              },
              {
                owner: binding.owner,
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
              {
                owner: binding.owner,
                address: { kind: "zero-hp-floors" },
                expected: [],
              },
              {
                owner: binding.owner,
                address: { kind: "occurrence-heads" },
                expected: [],
              }
            );
            for (const [stateKey, active] of Object.entries(value.stateFlags)) {
              reads.push({
                owner: binding.owner,
                address: { kind: "state-flag", stateKey },
                expected: {
                  binding: { kind: "active-feature", activeKey: stateKey },
                  active,
                },
              });
            }
          }
          const source = bindings.find(
            (binding) =>
              binding.ref.kind === "source" && binding.ref.id === header.sourceId
          );
          if (!source) throw new TypeError("Missing review source binding");
          reads.push({
            owner: source.owner,
            address: { kind: "lifecycle-head", ...header },
            expected: { present: false },
          });
          bindings.sort((left, right) =>
            atomicEntityBindingKey(left).localeCompare(atomicEntityBindingKey(right))
          );
          reads.sort((left, right) =>
            atomicAddressKey(left.owner, left.address).localeCompare(
              atomicAddressKey(right.owner, right.address)
            )
          );
          return { schema: 1 as const, bindings, reads };
        },
        read: (ref) => cloneState(current(ref)),
        resourceValue: (ref, resourceId) => current(ref).resources[resourceId] ?? 0,
        conditionPresent: (ref, condition) => current(ref).conditions.includes(condition),
        standingPresent: (ref, effectId) => current(ref).standing.includes(effectId),
        apply(mutation: Readonly<CombatEffectMutation>) {
          const key = entityKey(mutation.recipient);
          const prior = current(mutation.recipient);
          const before = cloneState(prior);
          if (mutation.kind === "damage") {
            const appliedComponents = mutation.components.map((component) => ({
              stepId: component.stepId,
              appliedAmount: component.amount,
            }));
            const appliedAmount = appliedComponents.reduce(
              (total, component) => total + component.appliedAmount,
              0
            );
            const after = { ...prior, hp: Math.max(0, prior.hp - appliedAmount) };
            entities.set(key, after);
            return {
              before,
              after: cloneState(after),
              appliedAmount,
              appliedComponents,
              generatedMutations: [
                {
                  mutation: {
                    kind: "state-flag",
                    operation: "deactivate",
                    stateKey: "death-ward",
                    provenance: structuredClone(mutation.provenance),
                    recipient: structuredClone(mutation.recipient),
                  },
                  source: {
                    kind: "state-flag",
                    recipient: structuredClone(mutation.recipient),
                    stateKey: "death-ward",
                    expectedActive: true,
                    hitPoints: after.hp,
                  },
                },
                {
                  mutation: {
                    kind: "resolved-damage",
                    amount: appliedAmount,
                    sourceEffectId: PROTECTIVE_BOND.id,
                    transferPath: [PROTECTIVE_BOND.id],
                    provenance: structuredClone(mutation.provenance),
                    recipient: {
                      kind: "target",
                      target: { combatantId: "ally:one" },
                    },
                  },
                  source: {
                    kind: "effect-occurrence",
                    recipient: structuredClone(mutation.recipient),
                    effect: structuredClone(PROTECTIVE_BOND),
                    expectedHeadOpId: `apply:${PROTECTIVE_BOND.id}`,
                    expectedActive: true,
                  },
                },
              ] satisfies CombatEffectGeneratedMutationIntent[],
            };
          }
          if (mutation.kind === "resolved-damage") {
            const after = { ...prior, hp: Math.max(0, prior.hp - mutation.amount) };
            entities.set(key, after);
            return {
              before,
              after: cloneState(after),
              appliedAmount: mutation.amount,
            };
          }
          if (mutation.kind === "state-flag") {
            const after = {
              ...prior,
              stateFlags: {
                ...prior.stateFlags,
                [mutation.stateKey]: mutation.operation === "activate",
              },
            };
            entities.set(key, after);
            return { before, after: cloneState(after) };
          }
          throw new TypeError("Test draft received an unexpected mutation");
        },
      };
    },
  };
}

const entityLabels: Record<string, string> = {
  "source:hero:one": "Lyra",
  "target:enemy:one": "Goblin",
  "target:ally:one": "Borin",
};

function entityKey(ref: CombatEffectEntityRef): string {
  return ref.kind === "source" ? `source:${ref.id}` : `target:${ref.target.combatantId}`;
}

function renderReview(
  overrides: Partial<React.ComponentProps<typeof CombatEffectProgramReview>> = {}
) {
  const durableTarget = state({ stateFlags: { "death-ward": true } });
  const onApply = vi.fn<(plan: Readonly<CombatEffectPlan>) => void>();
  const onCancel = vi.fn<() => void>();
  render(
    <CombatEffectProgramReview
      open
      program={PROGRAM}
      execution={EXECUTION}
      planningState={testPlanningState(durableTarget)}
      resolveEntityLabel={(ref) => entityLabels[entityKey(ref)] ?? "Unknown"}
      resolveFactLabel={(id) =>
        id === "death-ward"
          ? i18n.language.startsWith("it")
            ? "Interdizione alla Morte"
            : "Death Ward"
          : id === "protective-bond"
            ? i18n.language.startsWith("it")
              ? "Legame Protettivo"
              : "Protective Bond"
            : id
      }
      onApply={onApply}
      onCancel={onCancel}
      {...overrides}
    />
  );
  return { durableTarget, onApply, onCancel };
}

function currentRequirementKey(): string | undefined {
  return screen.getByTestId("combat-effect-requirement").dataset.requirementKey;
}

function enter(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByRole("spinbutton", { name: label }), {
    target: { value },
  });
}

beforeEach(async () => {
  await changeLanguage("en");
});

afterEach(async () => {
  cleanup();
  await changeLanguage("en");
});

describe("CombatEffectProgramReview", () => {
  it("records staged physical facts and applies only the exact immutable bilingual preview", async () => {
    expect(validateCombatEffectProgram(PROGRAM)).toEqual({ valid: true, errors: [] });
    const { durableTarget, onApply } = renderReview();

    expect(currentRequirementKey()).toContain("gate:resist");
    expect(screen.getByText("DC 10 DEX save")).toBeInTheDocument();
    expect(screen.getByText("Advantage")).toBeInTheDocument();
    enter("First physical d20 result", "1");
    enter("Second physical d20 result", "2");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(currentRequirementKey()).toContain("input:damage-roll");
    enter("Physical d6 result for die 1", "3");
    enter("Physical d6 result for die 2", "4");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(currentRequirementKey()).toContain("input:element");
    fireEvent.click(screen.getByRole("radio", { name: "Fire" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(currentRequirementKey()).toContain("input:destination");
    fireEvent.click(screen.getByRole("button", { name: "Enter required reroll" }));
    enter("Required reroll 1 for d6 die 1", "4");
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("Exact consequences")).toBeInTheDocument();
    expect(screen.getByText("Goblin · Damage · 7")).toBeInTheDocument();
    expect(screen.getByText("20 → 13")).toBeInTheDocument();
    const stateFlagRow = screen.getByText("Goblin · Consumed Death Ward").closest("li");
    if (!stateFlagRow) throw new Error("Expected the state-flag preview row");
    expect(within(stateFlagRow).getByText("Death Ward")).toBeInTheDocument();
    expect(within(stateFlagRow).getByText("Yes → No")).toBeInTheDocument();
    const transferRow = screen.getByText("Borin · Transferred damage · 7").closest("li");
    if (!transferRow) throw new Error("Expected the resolved-damage preview row");
    expect(within(transferRow).getByText("Protective Bond")).toBeInTheDocument();
    expect(within(transferRow).getByText("12 → 5")).toBeInTheDocument();
    const relocationRow = screen.getByText("Goblin · Teleport").closest("li");
    if (!relocationRow) throw new Error("Expected the relocation preview row");
    expect(within(relocationRow).getByText("1 → 4 = 4")).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(durableTarget.hp).toBe(20);
    expect(durableTarget.stateFlags["death-ward"]).toBe(true);

    await act(() => changeLanguage("it"));
    expect(screen.getByText("Conseguenze esatte")).toBeInTheDocument();
    expect(screen.getByText("Goblin · Danno · 7")).toBeInTheDocument();
    expect(
      screen.getByText("Goblin · Consumato Interdizione alla Morte")
    ).toBeInTheDocument();
    expect(screen.getByText("Borin · Danno trasferito · 7")).toBeInTheDocument();
    expect(screen.getByText("Goblin · Teletrasporto")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Applica" }));

    expect(onApply).toHaveBeenCalledOnce();
    const plan = onApply.mock.calls[0]?.[0];
    if (!plan) throw new Error("Expected an applied plan");
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.consequences)).toBe(true);
    expect(Object.isFrozen(plan.events)).toBe(true);
    expect(plan.consequences.map(({ kind }) => kind)).toEqual([
      "damage",
      "state-flag",
      "resolved-damage",
    ]);
    expect(plan.consequences.every(Object.isFrozen)).toBe(true);
    const stateFlag = plan.consequences.find(
      (consequence) => consequence.kind === "state-flag"
    );
    expect(stateFlag).toMatchObject({
      operation: "deactivate",
      stateKey: "death-ward",
      before: { hp: 13, stateFlags: { "death-ward": true } },
      after: { hp: 13, stateFlags: { "death-ward": false } },
    });
    const transferredDamage = plan.consequences.find(
      (consequence) => consequence.kind === "resolved-damage"
    );
    expect(transferredDamage).toMatchObject({
      amount: 7,
      appliedAmount: 7,
      sourceEffectId: "protective-bond",
      transferPath: ["protective-bond"],
      recipient: { kind: "target", target: { combatantId: "ally:one" } },
      before: { hp: 12 },
      after: { hp: 5 },
    });
    const event = plan.events?.[0];
    if (event?.kind !== "relocation-event" || event.destination.kind !== "table") {
      throw new Error("Expected a table relocation event");
    }
    expect(plan.events).toHaveLength(1);
    expect(event.destination.inputId).toBe("destination");
    expect(event.destination.roll.total).toBe(4);
    expect(event.destination.roll.dice).toHaveLength(1);
    expect(event.destination.roll.dice[0]).toMatchObject({
      initialFace: 1,
      replacements: [{ face: 4 }],
    });
    expect(durableTarget.hp).toBe(20);
    expect(durableTarget.stateFlags["death-ward"]).toBe(true);
  });

  it("cancels without producing or applying a plan", () => {
    const { durableTarget, onApply, onCancel } = renderReview();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    expect(durableTarget).toEqual(state({ stateFlags: { "death-ward": true } }));
  });

  it("fails closed in Italian when authoring is invalid", async () => {
    await changeLanguage("it");
    const onApply = vi.fn<(plan: Readonly<CombatEffectPlan>) => void>();
    const onCancel = vi.fn<() => void>();
    const invalid = { ...PROGRAM, version: 2 } as unknown as CombatEffectProgram;

    renderReview({ program: invalid, onApply, onCancel });

    expect(
      screen.getByRole("alert", { name: "Questo effetto non può essere verificato" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Applica" })).not.toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: "Chiudi" });
    const closeAction = closeButtons.at(-1);
    if (!closeAction) throw new Error("Expected the fail-closed action");
    fireEvent.click(closeAction);
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
  });
});

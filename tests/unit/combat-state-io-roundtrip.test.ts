import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocText } from "@/lib/loc-text";
import type { CombatState, PersistedTurnAction } from "@/types/combat-state";
import type { ActiveCombatEffect } from "@/types/combat-effect";

vi.mock("firebase/firestore", () => ({
  doc: (...segments: unknown[]) => ({ path: segments.slice(1).join("/") }),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => "server-ts",
}));
vi.mock("@/lib/firebase", () => ({ db: { _type: "firestore" } }));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));

import { combatStateWriteData, parseCombatState } from "@/lib/combat-state-io";
import {
  economyClaimsForTurn,
  successfulActionPrerequisiteMet,
} from "@/lib/combat-economy";
import { syncCombatFromSession } from "@/features/character/center/combat-hydration";
import { useCombatStore } from "@/stores/combatStore";

const LOC_TEXTS = {
  custom: { custom: "Homebrew Feint" },
  ui: { ui: "combat.otherReactionName" },
  lit: { lit: { en: "Brace", it: "Prepararsi" } },
  srd: { srd: { kind: "spell", key: "fireball", field: "name" } },
} as const satisfies Record<string, LocText>;

function action(
  id: string,
  slot: PersistedTurnAction["slot"],
  name: LocText,
  extra: Partial<PersistedTurnAction> = {}
): PersistedTurnAction {
  return { id, slot, name, ...extra };
}

const EFFECTS: ActiveCombatEffect[] = [
  {
    id: "effect-concentration",
    actor: {
      kind: "pc",
      combatantId: "pc-u1",
      memberUid: "u1",
      characterId: "char-1",
    },
    target: { kind: "monster", combatantId: "monster-0", tokenIndex: 0 },
    source: {
      kind: "spell",
      id: "hex",
      actionId: "spell-hex",
      castLevel: 2,
    },
    payload: { kind: "grant-group", activeKey: "spell-hex", phase: "active" },
    bindings: { spellcastingModifier: 4 },
    applied: { currentHpDelta: -3 },
    duration: { kind: "concentration", actorId: "pc-u1", sourceId: "hex" },
  },
  {
    id: "effect-turn-boundary",
    actor: { kind: "monster", combatantId: "monster-0" },
    target: {
      kind: "pc",
      combatantId: "pc-u1",
      memberUid: "u1",
      characterId: "char-1",
    },
    source: { kind: "feature", id: "mark", actionId: "feature-mark" },
    payload: { kind: "target-mark", activeKey: "feature-mark", scope: "marked" },
    duration: {
      kind: "turn-boundary",
      combatantId: "pc-u1",
      round: 8,
      phase: "turn-end",
    },
  },
  {
    id: "effect-condition",
    actor: { kind: "monster", combatantId: "monster-1", tokenIndex: 1 },
    target: {
      kind: "pc",
      combatantId: "pc-u1",
      memberUid: "u1",
      characterId: "char-1",
    },
    source: { kind: "feature", id: "terror", actionId: "feature-terror" },
    payload: { kind: "condition", conditionId: "frightened" },
    duration: { kind: "encounter" },
  },
  {
    id: "effect-aftereffect",
    actor: {
      kind: "pc",
      combatantId: "pc-u1",
      memberUid: "u1",
      characterId: "char-1",
    },
    target: {
      kind: "pc",
      combatantId: "pc-u1",
      memberUid: "u1",
      characterId: "char-1",
    },
    source: { kind: "spell", id: "haste", actionId: "spell-haste" },
    payload: {
      kind: "grant-group",
      activeKey: "spell-haste",
      phase: "aftereffect",
    },
    duration: { kind: "encounter" },
  },
];

function completeState(): CombatState {
  return {
    hp: { current: 37, temp: 9 },
    conditions: ["prone", "frightened"],
    bardicInspirationDie: "d10",
    heroicInspiration: true,
    initiativeRoll: 18,
    deathSaves: { successes: 2, failures: 1 },
    round: 8,
    recentActions: [
      {
        id: "recent-1",
        targetIds: ["monster-0", "monster-1"],
        outcome: "hit",
        round: 8,
        action: LOC_TEXTS.srd,
        instances: 3,
        save: true,
        riders: ["prone"],
      },
    ],
    activeEffects: EFFECTS,
    appliedEncounterEffects: { epoch: 12, ids: ["effect-a", "effect-b"] },
    turnEconomy: {
      key: "encounter:camp-1:12:8:pc-u1",
      selected: {
        action: [
          action("attack-action", "action", LOC_TEXTS.custom, {
            isAttackGroup: true,
            economyCategory: "attack",
            triggerEvents: ["attack", "bonus-extend"],
            resolutionSucceeded: true,
          }),
          action("dash-action", "action", LOC_TEXTS.srd, {
            economyCategory: "dash",
          }),
        ],
        bonus: [
          action("disengage-action", "bonus", LOC_TEXTS.lit, {
            economyCategory: "disengage",
            triggerEvents: ["bonus-extend"],
          }),
          action("hide-action", "bonus", LOC_TEXTS.ui, {
            economyCategory: "hide",
            resolutionSucceeded: true,
          }),
        ],
        free: [
          action("utilize-action", "free", LOC_TEXTS.custom, {
            economyCategory: "utilize",
          }),
          action("uncategorized-action", "free", LOC_TEXTS.lit),
        ],
      },
      attacksUsed: 3,
      attackSwingIds: ["longsword", "longsword", "fire-bolt"],
      reactionUsed: true,
      reactionUsedId: "counterspell",
      reactionResolutionSucceeded: true,
      movementUsedFt: 25,
      dashesThisTurn: 2,
      spellSlotCastsThisTurn: 1,
      damageTakenThisRound: true,
      nextAttackAdvantage: true,
      movementLocked: true,
    },
  };
}

describe("combat-state IO — full persistence contract", () => {
  beforeEach(() => {
    useCombatStore.getState().endCombat();
  });

  it("round-trips every turn slot, category, event, receipt, counter, flag, LocText, and active-effect shape", () => {
    const state = completeState();
    expect(parseCombatState(combatStateWriteData(state))).toEqual(state);
  });

  it.each([
    ["attack", "action", LOC_TEXTS.custom],
    ["dash", "action", LOC_TEXTS.srd],
    ["disengage", "bonus", LOC_TEXTS.lit],
    ["hide", "bonus", LOC_TEXTS.ui],
    ["utilize", "free", LOC_TEXTS.custom],
  ] as const)(
    "preserves the %s category in the %s slot with its LocText variant",
    (economyCategory, slot, name) => {
      const state = completeState();
      const only = action(`action-${economyCategory}`, slot, name, { economyCategory });
      const turn = state.turnEconomy;
      if (!turn) throw new Error("missing turn economy");
      turn.selected = { action: [], bonus: [], free: [] };
      turn.selected[slot].push(only);

      const parsed = parseCombatState(combatStateWriteData(state));
      expect(parsed.turnEconomy?.selected[slot]).toEqual([only]);
    }
  );

  it("hydrates the parsed receipt once for its exact turn and preserves cadence/prerequisite facts", () => {
    const parsed = parseCombatState(combatStateWriteData(completeState()));
    const turn = parsed.turnEconomy;
    if (!turn) throw new Error("missing turn economy");

    expect(syncCombatFromSession("char-1", 8, "18", null, turn, turn.key, "en")).toBe(
      true
    );

    const restored = useCombatStore.getState();
    const committed = [
      ...restored.selected.action,
      ...restored.selected.bonus,
      ...restored.selected.free,
    ];
    expect(restored.selected.action[0]?.triggerEvents).toEqual([
      "attack",
      "bonus-extend",
    ]);
    expect(restored.dashesThisTurn).toBe(2);
    expect(restored.spellSlotCastsThisTurn).toBe(1);
    expect(restored.damageTakenThisRound).toBe(true);
    expect(restored.nextAttackAdvantage).toBe(true);
    expect(restored.movementLocked).toBe(true);
    expect(
      successfulActionPrerequisiteMet(
        { requiresSuccessfulActionThisTurn: "attack-action" },
        committed
      )
    ).toBe(true);
    expect(
      successfulActionPrerequisiteMet(
        { requiresSuccessfulActionThisTurn: "counterspell" },
        committed,
        {
          id: restored.reactionUsedId,
          resolutionSucceeded: restored.reactionResolutionSucceeded,
        }
      )
    ).toBe(true);
    expect(
      economyClaimsForTurn(restored.selected.action, restored.attacksUsed, 2)
    ).toEqual([{ category: "attack", attackCount: 2 }, { category: "dash" }]);

    useCombatStore.getState().endCombat();
    syncCombatFromSession("char-2", 8, "18", null, turn, `${turn.key}:next-turn`, "en");
    expect(useCombatStore.getState().selected).toEqual({
      action: [],
      bonus: [],
      free: [],
    });
  });

  it("normalizes hostile turn data without preserving impossible success receipts", () => {
    const validEffect = EFFECTS[0];
    const parsed = parseCombatState({
      hp: { current: Number.NaN, temp: Number.POSITIVE_INFINITY },
      conditions: ["prone", 9, null],
      initiativeRoll: Number.POSITIVE_INFINITY,
      deathSaves: { successes: Number.NaN, failures: 2 },
      round: Number.NEGATIVE_INFINITY,
      recentActions: [{ id: "bad", targetIds: [], outcome: "hit", round: 1 }],
      activeEffects: [validEffect, { id: "broken" }],
      appliedEncounterEffects: { epoch: "wrong", ids: ["effect-a"] },
      turnEconomy: {
        key: "turn-1",
        selected: {
          action: [
            null,
            { id: 7, name: LOC_TEXTS.custom },
            { id: "", name: LOC_TEXTS.custom, resolutionSucceeded: true },
            {
              id: "valid-action",
              name: LOC_TEXTS.lit,
              slot: "bonus",
              economyCategory: "cast",
              triggerEvents: ["attack", "invalid", 7],
              resolutionSucceeded: false,
            },
          ],
          bonus: "not-an-array",
          free: [{ id: "missing-name" }],
        },
        attacksUsed: -4,
        attackSwingIds: ["valid-swing", "", 9, null],
        reactionUsed: false,
        reactionUsedId: "forged-reaction",
        reactionResolutionSucceeded: true,
        movementUsedFt: Number.POSITIVE_INFINITY,
        dashesThisTurn: -1,
        spellSlotCastsThisTurn: Number.NaN,
        damageTakenThisRound: "true",
        nextAttackAdvantage: 1,
        movementLocked: null,
      },
    });

    expect(parsed).toMatchObject({
      hp: { current: 0, temp: 0 },
      conditions: ["prone"],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 2 },
      round: 1,
      recentActions: [],
      activeEffects: [validEffect],
      turnEconomy: {
        key: "turn-1",
        selected: {
          action: [
            {
              id: "valid-action",
              name: LOC_TEXTS.lit,
              slot: "action",
              triggerEvents: ["attack"],
            },
          ],
          bonus: [],
          free: [],
        },
        attacksUsed: 0,
        attackSwingIds: ["valid-swing"],
        reactionUsed: false,
        reactionUsedId: null,
        movementUsedFt: 0,
        dashesThisTurn: 0,
        spellSlotCastsThisTurn: 0,
        damageTakenThisRound: false,
        nextAttackAdvantage: false,
        movementLocked: false,
      },
    });
    expect(parsed.appliedEncounterEffects).toBeUndefined();
    expect(parsed.turnEconomy?.reactionResolutionSucceeded).toBeUndefined();

    const committed = parsed.turnEconomy?.selected.action ?? [];
    expect(
      successfulActionPrerequisiteMet(
        { requiresSuccessfulActionThisTurn: "forged-reaction" },
        committed,
        {
          id: parsed.turnEconomy?.reactionUsedId ?? null,
          resolutionSucceeded: parsed.turnEconomy?.reactionResolutionSucceeded ?? false,
        }
      )
    ).toBe(false);
  });

  it.each([undefined, null, [], {}, { key: "" }, { key: 7 }])(
    "drops an invalid turn-economy root: %j",
    (turnEconomy) => {
      expect(
        parseCombatState({
          hp: {},
          deathSaves: {},
          turnEconomy,
        }).turnEconomy
      ).toBeUndefined();
    }
  );
});

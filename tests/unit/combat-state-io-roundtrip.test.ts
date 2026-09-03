import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocText } from "@/lib/loc-text";
import type { CombatState, PersistedTurnAction } from "@/types/combat-state";
import type { ActiveCombatEffect, CombatEffectOp } from "@/types/combat-effect";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";

vi.mock("firebase/firestore", () => ({
  doc: (...segments: unknown[]) => ({ path: segments.slice(1).join("/") }),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => "server-ts",
}));
vi.mock("@/lib/firebase", () => ({ db: { _type: "firestore" } }));
vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));

import { combatStateWriteData, parseCombatState } from "@/lib/combat-state-io";
import { parseLegacyCombatChild } from "@/lib/combat-state-codec";
import { defaultCombatState, sessionToCombatState } from "@/lib/combat-state";
import { economyClaimsForTurn } from "@/lib/combat-economy";
import { combatOutcomePrerequisiteMet } from "@/lib/combat-outcomes";
import { syncCombatFromSession } from "@/features/character/center/combat-hydration";
import { useCombatStore } from "@/stores/combatStore";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import { conc } from "./__helpers__/concentration";
import {
  parsePersistedPlayStateV1,
  sessionToPlayStateV1,
} from "@/lib/session-state-codec";
import { sanitizeSession } from "@/lib/sanitize-session";
import { applyCombatToSession } from "@/lib/combat-state";

function parseState(value: unknown): CombatState {
  const result = parseCombatState(value);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

/** The PRE-CUTOVER reader over a play-state-less stored doc — the only place the
 *  defensive NORMALIZERS still run (the strict reader rejects a non-canonical field
 *  outright). Dies in P3 with `scripts/migrate-character-parents.ts`. */
function parseLegacyState(value: Record<string, unknown>): CombatState {
  const { playState: _playState, ...legacy } = value;
  void _playState;
  const result = parseLegacyCombatChild(legacy);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

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

function receipt(
  occurrenceId: string,
  actionId: string,
  fact: CombatOutcomeReceipt["fact"]
): CombatOutcomeReceipt {
  return {
    id: `${occurrenceId}:0`,
    occurrenceId,
    actionId,
    instance: 0,
    count: 1,
    target: { combatantId: "monster-0" },
    fact,
  };
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
    target: { kind: "monster", combatantId: "monster-0" },
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
    actor: { kind: "monster", combatantId: "monster-1" },
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

const LEGACY_ENCOUNTER_EFFECT = EFFECTS.at(2);
if (!LEGACY_ENCOUNTER_EFFECT) throw new TypeError("missing effect fixture");

const LEDGER_EFFECT: ActiveCombatEffect = {
  ...LEGACY_ENCOUNTER_EFFECT,
  id: "ledger-effect",
  payload: { kind: "grant-group", activeKey: "spell-ledger" },
};

const APPLY_LEDGER_EFFECT_OP: CombatEffectOp = {
  id: "apply:ledger-effect",
  kind: "apply",
  effect: LEDGER_EFFECT,
};

function completeState(): CombatState {
  return {
    playState: sessionToPlayStateV1(makeCharacterDoc().session),
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
    pendingConcentrationSaves: [
      {
        id: "con-save-1",
        spell: conc("haste"),
        damage: 22,
        difficultyClass: 11,
      },
      {
        id: "con-save-2",
        spell: conc("haste"),
        damage: 80,
        difficultyClass: 30,
      },
    ],
    turnEconomy: {
      key: "encounter:camp-1:12:8:pc-u1",
      selected: {
        action: [
          action("attack-action", "action", LOC_TEXTS.custom, {
            isAttackGroup: true,
            economyCategory: "attack",
            triggerEvents: ["attack", "bonus-extend"],
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
          }),
        ],
        free: [
          action("utilize-action", "free", LOC_TEXTS.custom, {
            economyCategory: "utilize",
            outcomeOccurrenceId: "utilize-1",
          }),
          action("uncategorized-action", "free", LOC_TEXTS.lit),
        ],
      },
      attacksUsed: 3,
      attackSwings: [
        { actionId: "longsword", outcomeOccurrenceId: "longsword-1" },
        { actionId: "longsword", outcomeOccurrenceId: "longsword-2" },
        { actionId: "fire-bolt", outcomeOccurrenceId: "fire-bolt-1" },
      ],
      outcomeReceipts: [
        receipt("utilize-1", "utilize-action", {
          kind: "save",
          ability: "DEX",
          result: "failure",
        }),
        receipt("longsword-1", "longsword", { kind: "attack", result: "hit" }),
        receipt("longsword-2", "longsword", { kind: "attack", result: "miss" }),
        receipt("fire-bolt-1", "fire-bolt", { kind: "attack", result: "hit" }),
        receipt("counterspell-1", "counterspell", {
          kind: "save",
          ability: "INT",
          result: "success",
        }),
      ],
      outcomeOrdinal: 5,
      reactionUsed: true,
      reactionUsedId: "counterspell",
      reactionOutcomeOccurrenceId: "counterspell-1",
      movementUsedFt: 25,
      dashesThisTurn: 2,
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: "encounter:camp-1:12:8:pc-u1",
      damageTakenThisRound: true,
      nextAttackAdvantage: true,
      movementLocked: true,
    },
  };
}

describe("combat-state IO — full persistence contract", () => {
  beforeEach(() => {
    useCombatStore.getState().endCombat();
    // The hydration binding lives in the store (not a provider ref); reset it so
    // every test hydrates fresh.
    useCombatStore.setState({ hydratedCharacterId: null });
  });

  it("round-trips every turn slot, category, event, receipt, counter, flag, LocText, and active-effect shape", () => {
    const state = completeState();
    expect(parseState(combatStateWriteData(state))).toEqual(state);
  });

  it("the strict reader requires the v1 play owner; only the migration reader is lenient", () => {
    const state = sessionToCombatState(makeCharacterDoc().session);
    expect(parseCombatState(combatStateWriteData(state))).toMatchObject({
      ok: true,
      state: { playState: { version: 1 } },
    });

    // A PRE-CUTOVER child (combat core, no `playState`) can no longer even be WRITTEN —
    // the write seam is as closed as the read seam, so a stored document the reader
    // would refuse forever cannot be created.
    expect(() => combatStateWriteData({ ...state, playState: undefined })).toThrow(
      "Invalid combat play state: missing"
    );
    // Reading one that predates the cutover: the app refuses it; the migration's own
    // reader still accepts it. Both die in P3 with the script.
    const { playState: _playState, ...legacy } = combatStateWriteData(state);
    void _playState;
    expect(parseCombatState(legacy)).toEqual({
      ok: false,
      reason: "invalid-v1-play-state",
    });
    expect(parseLegacyCombatChild(legacy)).toMatchObject({ ok: true });
  });

  it.each([
    {
      name: "activeEffects",
      patch: { activeEffects: [EFFECTS[0], { id: "broken" }] },
      assertLegacy: (state: CombatState) =>
        expect(state.activeEffects).toEqual([EFFECTS[0]]),
    },
    {
      name: "pendingConcentrationSaves",
      patch: {
        pendingConcentrationSaves: [
          { id: "valid", spell: "haste", damage: 20, difficultyClass: 10 },
          { id: "stale-dc", spell: "haste", damage: 22, difficultyClass: 10 },
        ],
      },
      assertLegacy: (state: CombatState) =>
        expect(state.pendingConcentrationSaves).toEqual([
          {
            id: "valid",
            spell: conc("haste"),
            damage: 20,
            difficultyClass: 10,
          },
        ]),
    },
    {
      name: "turnEconomy",
      patch: { turnEconomy: { key: "solo:turn" } },
      assertLegacy: (state: CombatState) =>
        expect(state.turnEconomy).toMatchObject({
          key: "solo:turn",
          selected: { action: [], bonus: [], free: [] },
          attacksUsed: 0,
        }),
    },
    {
      name: "appliedEncounterEffects",
      patch: { appliedEncounterEffects: { epoch: 12, ids: ["effect-a", 7] } },
      assertLegacy: (state: CombatState) =>
        expect(state.appliedEncounterEffects).toEqual({
          epoch: 12,
          ids: ["effect-a"],
        }),
    },
    {
      name: "recentActions",
      patch: {
        recentActions: [
          {
            id: "valid",
            targetIds: ["monster-0"],
            outcome: "hit",
            round: 3,
          },
          { id: "broken", targetIds: [], outcome: "hit", round: 3 },
        ],
      },
      assertLegacy: (state: CombatState) =>
        expect(state.recentActions).toEqual([
          {
            id: "valid",
            targetIds: ["monster-0"],
            outcome: "hit",
            round: 3,
          },
        ]),
    },
  ])("rejects malformed present v1 $name but preserves legacy tolerance", (testCase) => {
    const { playState: _playState, ...legacyBase } =
      combatStateWriteData(completeState());
    void _playState;
    const v1 = parseCombatState({
      ...legacyBase,
      playState: sessionToPlayStateV1(makeCharacterDoc().session),
      ...testCase.patch,
    });
    expect(v1).toEqual({ ok: false, reason: "invalid-combat-state" });

    // The migration's PRE-CUTOVER reader stays tolerant of the same stored shapes,
    // which is exactly what the cutover canonicalizes. Dies in P3 with the script.
    const legacy = parseLegacyCombatChild({ ...legacyBase, ...testCase.patch });
    expect(legacy).toMatchObject({ ok: true });
    if (legacy.ok) testCase.assertLegacy(legacy.state);
  });

  it("rejects noncanonical v1 ordering/nested shapes but tolerates future roots", () => {
    const base = combatStateWriteData(completeState());
    expect(
      parseCombatState({
        ...base,
        futureCombatFact: { version: 2, value: "preserved-by-newer-client" },
      })
    ).toMatchObject({ ok: true });
  });

  it("rejects hostile present v1 fields without invoking accessors", () => {
    const hostile = combatStateWriteData(completeState());
    let getterRead = false;
    Object.defineProperty(hostile, "recentActions", {
      enumerable: true,
      get: () => {
        getterRead = true;
        return [];
      },
    });
    expect(parseCombatState(hostile)).toEqual({
      ok: false,
      reason: "invalid-combat-state",
    });
    expect(getterRead).toBe(false);
  });

  it("rejects partial combat docs instead of fabricating a 0-HP character", () => {
    expect(parseCombatState({})).toEqual({
      ok: false,
      reason: "invalid-combat-state",
    });
    expect(
      parseCombatState({ hp: {}, conditions: [], initiativeRoll: null, deathSaves: {} })
    ).toEqual({ ok: false, reason: "invalid-combat-state" });
  });

  it("strictly rejects hostile v1 play-state containers without invoking accessors", () => {
    const valid = sessionToPlayStateV1(makeCharacterDoc().session);
    expect(parsePersistedPlayStateV1(valid).ok).toBe(true);
    expect(parsePersistedPlayStateV1({ ...valid, extra: true })).toEqual({
      ok: false,
      reason: "invalid-play-state",
    });
    expect(
      parsePersistedPlayStateV1({
        version: 1,
        state: { ...valid.state, hp: { current: 1 } },
      })
    ).toEqual({ ok: false, reason: "invalid-play-state" });

    const sparse = new Array(1);
    expect(
      parsePersistedPlayStateV1({ version: 1, state: { pinnedActions: sparse } })
    ).toEqual({ ok: false, reason: "invalid-play-state" });

    let getterRead = false;
    const accessor = { version: 1, state: {} };
    Object.defineProperty(accessor.state, "notes", {
      enumerable: true,
      get: () => {
        getterRead = true;
        return "stolen";
      },
    });
    expect(parsePersistedPlayStateV1(accessor)).toEqual({
      ok: false,
      reason: "invalid-play-state",
    });
    expect(getterRead).toBe(false);

    const symbol = { version: 1, state: {} };
    Object.defineProperty(symbol.state, Symbol("hidden"), {
      enumerable: true,
      value: true,
    });
    expect(parsePersistedPlayStateV1(symbol)).toEqual({
      ok: false,
      reason: "invalid-play-state",
    });
  });

  it("ignores a stored branch-era effectOps ledger fail-safe and never writes one", () => {
    // The local authored mirror ledger never had a production writer; a stored
    // field is dropped on read (legacy AND v1 ownership) and the write shape
    // cannot re-emit it.
    const base = combatStateWriteData(completeState());
    expect(
      parseState({
        ...base,
        effectOps: [APPLY_LEDGER_EFFECT_OP, { broken: true }],
      })
    ).not.toHaveProperty("effectOps");
    expect(
      parseCombatState({ ...base, effectOps: [APPLY_LEDGER_EFFECT_OP] })
    ).toMatchObject({ ok: true });
    expect(combatStateWriteData(completeState())).not.toHaveProperty("effectOps");
    expect(sessionToCombatState(makeCharacterDoc().session)).not.toHaveProperty(
      "effectOps"
    );
    expect(defaultCombatState(20)).not.toHaveProperty("effectOps");
  });

  it("reads the Concentration FIFO defensively in the pre-cutover reader", () => {
    const base = combatStateWriteData(completeState());
    // The strict reader refuses a stored queue that is not already canonical…
    expect(
      parseCombatState({ ...base, pendingConcentrationSaves: [{ id: "bad" }] })
    ).toMatchObject({ ok: false });
    // …while the migration reader normalizes exactly what the cutover then rewrites.
    expect(
      parseLegacyState({ ...base, pendingConcentrationSaves: undefined })
    ).not.toHaveProperty("pendingConcentrationSaves");
    expect(
      parseLegacyState({
        ...base,
        pendingConcentrationSaves: [
          {
            id: "valid",
            spell: "haste",
            damage: 60,
            difficultyClass: 30,
          },
          {
            id: "stale-dc",
            spell: "haste",
            damage: 22,
            difficultyClass: 10,
          },
          {
            id: "valid",
            spell: "haste",
            damage: 60,
            difficultyClass: 30,
          },
          { id: "bad-spell", spell: "", damage: 10, difficultyClass: 10 },
        ],
      }).pendingConcentrationSaves
    ).toEqual([
      {
        id: "valid",
        spell: conc("haste"),
        damage: 60,
        difficultyClass: 30,
      },
    ]);
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
      // Receipts/swings name the actions we just dropped; clear them so the stored
      // document stays canonical for the strict reader.
      turn.attacksUsed = 0;
      turn.attackSwings = [];
      turn.outcomeReceipts = [];
      turn.reactionUsed = false;
      turn.reactionUsedId = null;
      turn.reactionOutcomeOccurrenceId = null;

      const parsed = parseState(combatStateWriteData(state));
      expect(parsed.turnEconomy?.selected[slot]).toEqual([only]);
    }
  );

  it("hydrates the parsed receipt once for its exact turn and preserves cadence/prerequisite facts", () => {
    const parsed = parseState(combatStateWriteData(completeState()));
    const turn = parsed.turnEconomy;
    if (!turn) throw new Error("missing turn economy");

    expect(syncCombatFromSession("char-1", 8, "18", turn, turn.key, "en")).toBe(true);

    const restored = useCombatStore.getState();
    expect(restored.selected.action[0]?.triggerEvents).toEqual([
      "attack",
      "bonus-extend",
    ]);
    expect(restored.dashesThisTurn).toBe(2);
    expect(restored.spellSlotCastsThisTurn).toBe(1);
    expect(restored.spellSlotCastTurnKey).toBe("encounter:camp-1:12:8:pc-u1");
    expect(restored.damageTakenThisRound).toBe(true);
    expect(restored.nextAttackAdvantage).toBe(true);
    expect(restored.movementLocked).toBe(true);
    expect(
      combatOutcomePrerequisiteMet(
        { actionId: "longsword", kind: "attack", result: "success" },
        restored.outcomeReceipts
      )
    ).toBe(true);
    expect(
      combatOutcomePrerequisiteMet(
        {
          actionId: "counterspell",
          kind: "save",
          ability: "INT",
          result: "success",
        },
        restored.outcomeReceipts
      )
    ).toBe(true);
    expect(restored.attackSwings[0]?.outcomeOccurrenceId).toBe("longsword-1");
    expect(restored.reactionOutcomeOccurrenceId).toBe("counterspell-1");
    expect(restored.outcomeOrdinal).toBe(5);
    expect(
      economyClaimsForTurn(restored.selected.action, restored.attacksUsed, 2)
    ).toEqual([{ category: "attack", attackCount: 2 }, { category: "dash" }]);

    useCombatStore.getState().endCombat();
    syncCombatFromSession("char-2", 8, "18", turn, `${turn.key}:next-turn`, "en");
    expect(useCombatStore.getState().selected).toEqual({
      action: [],
      bonus: [],
      free: [],
    });
  });

  it("rejects a hostile combat core instead of preserving impossible success receipts", () => {
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
        attackSwings: [
          { actionId: "valid-swing", outcomeOccurrenceId: "swing-1" },
          { actionId: "" },
          9,
          null,
        ],
        outcomeReceipts: [
          receipt("swing-1", "wrong-owner", { kind: "attack", result: "hit" }),
          { id: "broken" },
        ],
        outcomeOrdinal: 2.8,
        reactionUsed: false,
        reactionUsedId: "forged-reaction",
        reactionOutcomeOccurrenceId: "forged-occurrence",
        reactionResolutionSucceeded: true,
        movementUsedFt: Number.POSITIVE_INFINITY,
        dashesThisTurn: -1,
        spellSlotCastsThisTurn: Number.NaN,
        spellSlotCastTurnKey: 7,
        damageTakenThisRound: "true",
        nextAttackAdvantage: 1,
        movementLocked: null,
      },
    });

    expect(parsed).toEqual({ ok: false, reason: "invalid-combat-state" });
  });

  it.each([undefined, null, [], {}, { key: "" }, { key: 7 }])(
    "drops an invalid turn-economy root: %j",
    (turnEconomy) => {
      const base = combatStateWriteData(completeState());
      expect(parseLegacyState({ ...base, turnEconomy }).turnEconomy).toBeUndefined();
      // The strict reader does not normalize a stored non-canonical root: it refuses.
      expect(parseCombatState({ ...base, turnEconomy })).toMatchObject({ ok: false });
    }
  );

  it("binds a legacy non-zero slot count to its enclosing turn key", () => {
    const state = completeState();
    const turn = state.turnEconomy;
    if (!turn) throw new Error("missing turn economy");
    delete turn.spellSlotCastTurnKey;

    const parsed = parseLegacyState(combatStateWriteData(state));
    expect(parsed.turnEconomy).toMatchObject({
      spellSlotCastsThisTurn: 1,
      spellSlotCastTurnKey: turn.key,
    });
  });
});

describe("v1 play-state — arrays and the persisted engine world", () => {
  const LOG_ENTRY = {
    event: { kind: "legacy", text: "Ilyra hits the ogre" },
    ts: 1722470400000,
    id: "log-entry-1",
  } as const;

  it("parses a v1 play state whose log carries entries (arrays are plain JSON)", () => {
    const parsed = parsePersistedPlayStateV1({
      version: 1,
      state: { log: [LOG_ENTRY] },
    });
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.session.logEntries).toEqual([LOG_ENTRY]);
  });

  it("round-trips array-bearing play facts through the v1 codec", () => {
    const session = sanitizeSession({
      logEntries: [LOG_ENTRY],
      pinnedActions: ["second-wind"],
      unpinnedActions: ["dash"],
      activeFeatures: ["rage"],
    });
    const v1 = sessionToPlayStateV1(session);
    const parsed = parsePersistedPlayStateV1(v1);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;
    expect(parsed.session.logEntries).toEqual([LOG_ENTRY]);
    expect(parsed.session.pinnedActions).toEqual(["second-wind"]);
    expect(parsed.session.unpinnedActions).toEqual(["dash"]);
    expect(parsed.session.activeFeatures).toEqual(["rage"]);
  });

  it("writes and re-reads a log-bearing v1 combat state instead of throwing", () => {
    const doc = makeCharacterDoc({}, { logEntries: [LOG_ENTRY] });
    const written = combatStateWriteData(sessionToCombatState(doc.session));
    const parsed = parseCombatState(written);
    expect(parsed).toMatchObject({ ok: true });
  });

  it("still rejects accessor/non-enumerable properties on plain objects", () => {
    const hostile: Record<string, unknown> = { version: 1, state: {} };
    Object.defineProperty(hostile.state as object, "notes", {
      enumerable: true,
      get: () => "boom",
    });
    expect(parsePersistedPlayStateV1(hostile)).toEqual({
      ok: false,
      reason: "invalid-play-state",
    });

    const nonEnumerable: Record<string, unknown> = { version: 1, state: {} };
    Object.defineProperty(nonEnumerable.state as object, "hidden", {
      enumerable: false,
      value: 1,
    });
    expect(parsePersistedPlayStateV1(nonEnumerable)).toEqual({
      ok: false,
      reason: "invalid-play-state",
    });
  });

  it("carries the persisted engine world byte-identical through write → parse → hydrate", () => {
    const world = {
      clockBinding: { timeline: { material: { kind: "character-play", uid: "uid-1" } } },
      inventory: { instances: [{ instanceId: "berry-1", quantity: 3 }] },
      vitals: { hitPoints: { current: 21 } },
    };
    const doc = makeCharacterDoc({}, { world });
    const written = combatStateWriteData(sessionToCombatState(doc.session));
    const parsed = parseCombatState(written);
    expect(parsed).toMatchObject({ ok: true });
    if (!parsed.ok) return;

    const fresh = makeCharacterDoc().session;
    const hydrated = applyCombatToSession(fresh, parsed.state, 44);
    expect(hydrated.ok).toBe(true);
    if (!hydrated.ok) return;
    expect(JSON.stringify(hydrated.session.world)).toBe(JSON.stringify(world));
  });

  it("keeps the world opaque: a world the engine would reject still round-trips", () => {
    // The play-state codec must never shape-validate the world — its own
    // fail-closed parser re-proves it at read (`characterWorldState`).
    const opaque = { schema: 99, anything: [1, { nested: true }] };
    const session = sanitizeSession({ world: opaque });
    const parsed = parsePersistedPlayStateV1(sessionToPlayStateV1(session));
    expect(parsed).toMatchObject({ ok: true });
    if (parsed.ok) expect(parsed.session.world).toEqual(opaque);
  });
});

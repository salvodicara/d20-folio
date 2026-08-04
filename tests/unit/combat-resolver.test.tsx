import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/features/character/center/apply-damage", () => ({
  applyDeclaredCombatEffects: vi.fn(() => Promise.resolve()),
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffectsBySource: vi.fn(() => Promise.resolve()),
}));

import "@/i18n";
import { CombatResolver } from "@/features/character/center/CombatResolver";
import {
  appendPersistentCombatEffect,
  applyDeclaredCombatEffects,
  revokePersistentCombatEffect,
  revokePersistentCombatEffectsBySource,
} from "@/features/character/center/apply-damage";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { buildScenario } from "@/lib/dev-scenarios";

function monster(id: string, name: string, tokens = [7]): EncounterCombatantView {
  return {
    id,
    kind: "monster",
    name,
    ac: 12,
    initiative: 10,
    conditions: [],
    currentHp: tokens.reduce((sum, hp) => sum + hp, 0),
    maxHp: 7 * tokens.length,
    tempHp: 0,
    down: tokens.every((hp) => hp === 0),
    hidden: false,
    tokens,
  };
}

function pc(): EncounterCombatantView {
  return {
    id: "pc-u1",
    kind: "pc",
    name: "Lyra",
    ac: 15,
    initiative: 14,
    conditions: [],
    currentHp: 20,
    maxHp: 20,
    tempHp: 0,
    down: false,
    hidden: false,
    memberUid: "u1",
    characterId: MOCK_CHARACTER.id,
  };
}

function allyPc(): EncounterCombatantView {
  return {
    ...pc(),
    id: "pc-u2",
    name: "Borin",
    memberUid: "u2",
    characterId: "char-u2",
  };
}

function secondAllyPc(): EncounterCombatantView {
  return {
    ...pc(),
    id: "pc-u3",
    name: "Cora",
    memberUid: "u3",
    characterId: "char-u3",
  };
}

function combat(rows: EncounterCombatantView[], round = 2): GlobalCombat {
  return {
    campaignId: "camp1",
    encounter: {} as GlobalCombat["encounter"],
    view: { rows, turnOrderIds: rows.map((row) => row.id), currentId: null },
    myId: "pc-u1",
    characterId: MOCK_CHARACTER.id,
    gathering: false,
    isMyTurn: true,
    initiativeBonus: 2,
    initiativeRoll: 12,
    round,
  };
}

function action(summary: ResolvedAction["summary"]): ResolvedAction {
  return {
    id: "spell-test",
    name: "Test action",
    nameLoc: { custom: "Test action" },
    type: "action",
    source: "spell",
    spellLevel: 0,
    concentration: false,
    summary,
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}

function healingPoolAction(): ResolvedAction {
  return {
    ...action({
      poolSpendEffect: "healing",
      uses: { current: 20, total: 20, isPool: true, unit: "hp" },
      targeting: { affinity: "ally", maxTargets: 1 },
      cureOptions: [{ condition: "poisoned", costHp: 5 }],
    }),
    id: "paladin-lay-on-hands-bonus",
    source: "feature",
    spellLevel: null,
    costTracker: "paladin-lay-on-hands",
    costTrackerIsPool: true,
    costTrackerUnit: "hp",
  };
}

const applyMock = vi.mocked(applyDeclaredCombatEffects);
const appendPersistentMock = vi.mocked(appendPersistentCombatEffect);
const revokePersistentMock = vi.mocked(revokePersistentCombatEffect);
const revokePersistentSourceMock = vi.mocked(revokePersistentCombatEffectsBySource);
const commitNow = (afterCommit: () => void) => afterCommit();

function expectApplied(effects: unknown[]): void {
  expect(applyMock).toHaveBeenCalledWith(
    "camp1",
    effects,
    expect.objectContaining({
      actorId: "pc-u1",
      action: { custom: "Test action" },
    })
  );
}

beforeEach(() => {
  applyMock.mockClear();
  appendPersistentMock.mockClear();
  revokePersistentMock.mockClear();
  revokePersistentSourceMock.mockClear();
  useCharacterStore.setState({
    character: { ...MOCK_CHARACTER },
    readonly: false,
    combatRecentActions: [],
    combatActiveEffects: [],
    combatPersistence: null,
  });
});

describe("universal combat resolution", () => {
  it("renders canonical monster art in target choices, with initials only as fallback", () => {
    render(
      <CombatResolver
        action={action({ damage: "1d8", attackBonus: 6 })}
        sheetCombat={combat([
          { ...monster("monster-1", "Goblin"), srdId: "goblin-warrior" },
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    expect(screen.getByAltText("Goblin")).toHaveAttribute(
      "src",
      expect.stringContaining("goblin-warrior")
    );
  });

  it("cancels without spending or declaring anything", () => {
    const onCommit = vi.fn(commitNow);
    const onDone = vi.fn();
    render(
      <CombatResolver
        action={action({ damage: "1d8", attackBonus: 6 })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={onCommit}
        onDone={onDone}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
    expect(appendPersistentMock).not.toHaveBeenCalled();
    expect(useCharacterStore.getState().combatRecentActions).toEqual([]);
  });

  it("applies Warding Bond to one other ally and undo revokes that exact occurrence", async () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
    const wardingBond: ResolvedAction = {
      ...action({
        targeting: { affinity: "ally", excludeSelf: true, maxTargets: 1 },
      }),
      id: "spell-warding-bond",
      spellId: "warding-bond",
      spellLevel: 2,
      slotLevel: 2,
      standingEffect: {
        sourceId: "warding-bond",
        activeKey: "spell-warding-bond",
        targetAffinity: "ally",
        excludeSelf: true,
        maxRounds: 600,
      },
    };
    let execute: (() => (() => void) | undefined) | undefined;
    let undo: (() => void) | undefined;
    render(
      <CombatResolver
        action={wardingBond}
        sheetCombat={combat([pc(), allyPc()], 4)}
        onCommit={(afterCommit) => {
          execute = afterCommit;
          undo = afterCommit();
        }}
        onDone={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: "Lyra" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(appendPersistentMock).toHaveBeenCalledWith(
      "camp1",
      expect.objectContaining({
        id: "00000000-0000-4000-8000-000000000001",
        actor: {
          kind: "pc",
          combatantId: "pc-u1",
          memberUid: "u1",
          characterId: MOCK_CHARACTER.id,
        },
        target: {
          kind: "pc",
          combatantId: "pc-u2",
          memberUid: "u2",
          characterId: "char-u2",
        },
        payload: { kind: "grant-group", activeKey: "spell-warding-bond" },
        duration: {
          kind: "turn-boundary",
          combatantId: "pc-u1",
          round: 604,
          phase: "turn-end",
        },
      })
    );

    undo?.();
    await vi.waitFor(() =>
      expect(revokePersistentMock).toHaveBeenCalledWith(
        "camp1",
        "00000000-0000-4000-8000-000000000001"
      )
    );

    const undoRedo = execute?.();
    await vi.waitFor(() =>
      expect(appendPersistentMock).toHaveBeenLastCalledWith(
        "camp1",
        expect.objectContaining({ id: "00000000-0000-4000-8000-000000000002" })
      )
    );
    undoRedo?.();
    randomUuid.mockRestore();
  });

  it("compensates every intended target when a multi-target persistent append partially fails", async () => {
    const randomUuid = vi
      .spyOn(globalThis.crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000011")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000012");
    appendPersistentMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second target rejected"));
    const sharedWard: ResolvedAction = {
      ...action({ targeting: { affinity: "ally", excludeSelf: true, maxTargets: 2 } }),
      id: "spell-shared-ward",
      spellId: "shared-ward",
      spellLevel: 2,
      slotLevel: 2,
      standingEffect: {
        sourceId: "shared-ward",
        activeKey: "spell-shared-ward",
        targetAffinity: "ally",
        excludeSelf: true,
        maxRounds: 10,
      },
    };

    render(
      <CombatResolver
        action={sharedWard}
        sheetCombat={combat([pc(), allyPc(), secondAllyPc()], 4)}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    fireEvent.click(screen.getByRole("button", { name: /cora/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    await vi.waitFor(() => expect(appendPersistentMock).toHaveBeenCalledTimes(2));
    expect(appendPersistentMock.mock.calls.map(([, effect]) => effect.target)).toEqual([
      {
        kind: "pc",
        combatantId: "pc-u2",
        memberUid: "u2",
        characterId: "char-u2",
      },
      {
        kind: "pc",
        combatantId: "pc-u3",
        memberUid: "u3",
        characterId: "char-u3",
      },
    ]);
    await vi.waitFor(() =>
      expect(revokePersistentMock.mock.calls).toEqual([
        ["camp1", "00000000-0000-4000-8000-000000000011"],
        ["camp1", "00000000-0000-4000-8000-000000000012"],
      ])
    );
    randomUuid.mockRestore();
  });

  it("ends and undo-restores a recurring spell after the target succeeds on its save", async () => {
    const recurring = {
      ...action({
        damage: "1d6",
        damageType: "fire",
        damageResolution: "automatic",
        saveAbility: "CON",
        saveDC: 13,
        targeting: { affinity: "enemy", maxTargets: 1 },
        recurringUse: true,
        endsOnSuccessfulSave: true,
      }),
      id: "spell-searing-smite-recurring",
      spellId: "searing-smite",
      endsActiveKeyOnSuccessfulSave: "spell-searing-smite",
      persistentTargetSourceId: "searing-smite",
    } satisfies ResolvedAction;
    const runningEffect = {
      id: "burning-goblin",
      actor: {
        kind: "pc" as const,
        combatantId: "pc-u1",
        memberUid: "u1",
        characterId: MOCK_CHARACTER.id,
      },
      target: { kind: "monster" as const, combatantId: "monster-1" },
      source: {
        kind: "spell" as const,
        id: "searing-smite",
        actionId: "spell-searing-smite",
        castLevel: 1,
      },
      payload: { kind: "grant-group" as const, activeKey: "spell-searing-smite" },
      duration: {
        kind: "turn-boundary" as const,
        combatantId: "pc-u1",
        round: 11,
        phase: "turn-end" as const,
      },
    };
    const runningCombat = combat([
      pc(),
      monster("monster-1", "Goblin"),
      monster("monster-2", "Orc"),
    ]);
    runningCombat.encounter = {
      effectOps: [{ id: "apply-burning", kind: "apply", effect: runningEffect }],
    } as GlobalCombat["encounter"];
    useCharacterStore.setState((state) => ({
      character: state.character
        ? {
            ...state.character,
            session: {
              ...state.character.session,
              activeFeatures: ["spell-searing-smite"],
              activeSpellCastLevels: { "spell-searing-smite": 1 },
            },
          }
        : null,
    }));
    let undo: (() => void) | undefined;
    render(
      <CombatResolver
        action={recurring}
        sheetCombat={runningCombat}
        onCommit={(afterCommit) => {
          undo = afterCommit();
        }}
        onDone={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /orc/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(revokePersistentSourceMock).toHaveBeenCalledWith("camp1", {
      actorId: "pc-u1",
      sourceId: "searing-smite",
    });
    expect(useCharacterStore.getState().character?.session.activeFeatures).not.toContain(
      "spell-searing-smite"
    );

    undo?.();
    await vi.waitFor(() =>
      expect(appendPersistentMock).toHaveBeenCalledWith(
        "camp1",
        expect.objectContaining({
          target: { kind: "monster", combatantId: "monster-1" },
          source: runningEffect.source,
        })
      )
    );
    expect(useCharacterStore.getState().character?.session.activeFeatures).toContain(
      "spell-searing-smite"
    );
  });

  it("transfers a vow from a fallen target without another resource cost or duration reset", () => {
    const vow = {
      ...action({ targeting: { affinity: "enemy", maxTargets: 1 } }),
      id: "paladin-vengeance-vow-of-enmity-free",
      source: "feature" as const,
      spellLevel: null,
      costTracker: "paladin-channel-divinity",
      standingEffect: {
        sourceId: "paladin-vengeance-vow-of-enmity",
        sourceKind: "feature" as const,
        activeKey: "paladin-vengeance-vow-of-enmity",
        markScope: "vowed" as const,
        targetAffinity: "enemy" as const,
        maxRounds: 10,
      },
    } satisfies ResolvedAction;
    const oldVow = {
      id: "vow-old",
      actor: {
        kind: "pc" as const,
        combatantId: "pc-u1",
        memberUid: "u1",
        characterId: MOCK_CHARACTER.id,
      },
      target: { kind: "monster" as const, combatantId: "monster-old" },
      source: {
        kind: "feature" as const,
        id: "paladin-vengeance-vow-of-enmity",
        actionId: "paladin-vengeance-vow-of-enmity-free",
      },
      payload: {
        kind: "target-mark" as const,
        activeKey: "paladin-vengeance-vow-of-enmity",
        scope: "vowed" as const,
      },
      duration: {
        kind: "turn-boundary" as const,
        combatantId: "pc-u1",
        round: 7,
        phase: "turn-end" as const,
      },
    };
    const activeCombat = combat([
      pc(),
      monster("monster-old", "Fallen Fiend", [0]),
      monster("monster-new", "New Fiend"),
    ]);
    activeCombat.encounter = {
      effectOps: [{ id: "apply-old-vow", kind: "apply", effect: oldVow }],
    } as GlobalCombat["encounter"];
    let committed: ResolvedAction | undefined;

    render(
      <CombatResolver
        action={vow}
        sheetCombat={activeCombat}
        onCommit={(afterCommit, actionOverride) => {
          committed = actionOverride;
          afterCommit();
        }}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /new fiend/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(committed?.costTracker).toBeUndefined();
    expect(appendPersistentMock).toHaveBeenCalledWith(
      "camp1",
      expect.objectContaining({
        target: { kind: "monster", combatantId: "monster-new" },
        payload: oldVow.payload,
        duration: oldVow.duration,
      })
    );
  });

  it("commits once and applies the entered damage to the selected creature", () => {
    const onCommit = vi.fn(commitNow);
    render(
      <CombatResolver
        action={action({ damage: "1d8", attackBonus: 6, attackMode: "melee" })}
        sheetCombat={combat([monster("monster-1", "Goblin")], 3)}
        onCommit={onCommit}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expectApplied([{ kind: "damage", targetId: "monster-1", amount: 7 }]);
    expect(applyMock).toHaveBeenCalledWith(
      "camp1",
      [{ kind: "damage", targetId: "monster-1", amount: 7 }],
      expect.objectContaining({
        hitTargetIds: ["monster-1"],
        attackMode: "melee",
      })
    );
    expect(useCharacterStore.getState().combatRecentActions).toEqual([
      {
        id: "1",
        action: { custom: "Test action" },
        targetIds: ["monster-1"],
        outcome: "hit",
        round: 3,
      },
    ]);
  });

  it("offers creature-type bonus damage only for qualifying targets", () => {
    const smite = action({
      damage: "2d8",
      damageType: "radiant",
      damageResolution: "automatic",
      targeting: { affinity: "enemy", maxTargets: 1 },
      extraDamage: [
        {
          dice: "1d8",
          damageType: "radiant",
          oncePerTurn: false,
          sourceName: "Divine Smite",
          targetCreatureTypes: ["fiend", "undead"],
        },
      ],
    });
    const { unmount } = render(
      <CombatResolver
        action={smite}
        sheetCombat={combat([
          { ...monster("monster-1", "Zombie"), creatureType: "undead" },
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /zombie/i }));
    expect(screen.getAllByRole("spinbutton", { name: /damage to zombie/i })).toHaveLength(
      2
    );
    unmount();

    render(
      <CombatResolver
        action={smite}
        sheetCombat={combat([
          { ...monster("monster-2", "Bandit"), creatureType: "humanoid" },
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /bandit/i }));
    expect(screen.getAllByRole("spinbutton", { name: /damage to bandit/i })).toHaveLength(
      1
    );
  });

  it("applies Sneak Attack and its round-1 dependent rider atomically", () => {
    const doc = buildScenario({
      name: "Rook",
      raceId: "human",
      classId: "rogue",
      level: 3,
      background: "criminal",
      abilityScores: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 12, CHA: 8 },
      weapons: [{ srdId: "rapier", quantity: 1 }],
    });
    doc.session.trackers["rogue-sneak-attack"] = { used: 0 };
    doc.session.logEntries = [];
    useCharacterStore.setState({ character: doc });
    let undo: (() => void) | undefined;
    const sneakAttack = action({
      damage: "1d8+3",
      damageType: "piercing",
      attackBonus: 6,
      extraDamage: [
        {
          dice: "2d6",
          damageType: "piercing",
          oncePerTurn: true,
          sourceName: "Sneak Attack",
          sourceLoc: {
            srd: {
              kind: "class-feature",
              key: "rogue-sneak-attack",
              field: "name",
            },
          },
          resourceTrackerId: "rogue-sneak-attack",
        },
        {
          dice: "3",
          fixedAmount: 3,
          damageType: "piercing",
          oncePerTurn: true,
          sourceName: "Assassinate",
          round1: true,
          requiresRiderTrackerId: "rogue-sneak-attack",
        },
      ],
    });
    render(
      <CombatResolver
        action={sneakAttack}
        sheetCombat={combat([monster("monster-1", "Goblin")], 1)}
        onCommit={(afterCommit) => {
          undo = afterCommit();
        }}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    const amounts = screen.getAllByRole("spinbutton", { name: /damage to goblin/i });
    const baseAmount = amounts[0];
    const sneakAmount = amounts[1];
    if (!baseAmount || !sneakAmount) throw new Error("damage entries missing");
    expect(screen.getByText(/Sneak Attack/)).toBeInTheDocument();
    expect(screen.queryByText(/Assassinate/)).not.toBeInTheDocument();
    fireEvent.change(baseAmount, { target: { value: "6" } });
    fireEvent.change(sneakAmount, { target: { value: "7" } });
    expect(screen.getByText(/Assassinate/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expectApplied([{ kind: "damage", targetId: "monster-1", amount: 16 }]);
    expect(
      useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]?.used
    ).toBe(1);
    expect(
      useCharacterStore
        .getState()
        .character?.session.logEntries.some((entry) => entry.event.kind === "rider-use")
    ).toBe(true);

    undo?.();
    expect(
      useCharacterStore.getState().character?.session.trackers["rogue-sneak-attack"]?.used
    ).toBe(0);
    expect(useCharacterStore.getState().character?.session.logEntries).toEqual([]);
  });

  it("resolves every save target separately and automates area half damage", () => {
    render(
      <CombatResolver
        action={action({
          damage: "8d6",
          saveAbility: "DEX",
          saveDC: 15,
          area: true,
          damageOnSave: "half",
        })}
        sheetCombat={combat([
          monster("monster-1", "Goblin"),
          monster("monster-2", "Ogre"),
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /ogre/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage you rolled/i }), {
      target: { value: "25" },
    });
    const ogreRow = screen
      .getAllByText("Ogre")
      .map((node) => node.closest(".combat-result-row"))
      .find((node) => node !== null);
    if (!ogreRow) throw new Error("Ogre result row missing");
    const saved = ogreRow.querySelector<HTMLButtonElement>(
      'button[aria-pressed="false"]'
    );
    if (!saved) throw new Error("Ogre save control missing");
    fireEvent.click(saved);
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "damage", targetId: "monster-1", amount: 25 },
      { kind: "damage", targetId: "monster-2", amount: 12 },
    ]);
  });

  it("captures mixed hit/miss results when several attack instances share a target", () => {
    render(
      <CombatResolver
        action={action({ damage: "2d6", attackBonus: 7, instances: 3 })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /instances assigned to goblin/i }),
      { target: { value: "3" } }
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: /hits on goblin/i }), {
      target: { value: "2" },
    });
    const damageRolls = screen.getAllByRole("spinbutton", {
      name: /damage roll \d for goblin/i,
    });
    const [firstDamageRoll, secondDamageRoll] = damageRolls;
    if (!firstDamageRoll || !secondDamageRoll) throw new Error("missing damage rolls");
    fireEvent.change(firstDamageRoll, { target: { value: "5" } });
    fireEvent.change(secondDamageRoll, { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "damage", targetId: "monster-1", amount: 11 }]);
  });

  it("applies a one-roll bonus to exactly one chosen target", () => {
    render(
      <CombatResolver
        action={action({
          damage: "1d4+1",
          damageType: "force",
          instances: 3,
          oneRollDamageBonus: 4,
        })}
        sheetCombat={combat([
          monster("monster-1", "Goblin"),
          monster("monster-2", "Ogre"),
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /ogre/i }));
    fireEvent.click(
      screen.getByRole("button", {
        name: /apply \+4 to one damage roll against ogre/i,
      })
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to ogre/i }), {
      target: { value: "3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "damage", targetId: "monster-1", amount: 2 },
      { kind: "damage", targetId: "monster-2", amount: 7 },
    ]);
  });

  it("resolves a split attack plus area-save action without asking irrelevant questions", () => {
    render(
      <CombatResolver
        action={action({
          damage: "1d10",
          damageType: "piercing",
          attackBonus: 7,
          saveAbility: "DEX",
          saveDC: 15,
          secondaryDamage: {
            dice: "2d6",
            damageType: "cold",
            resolution: "save",
            area: true,
          },
        })}
        sheetCombat={combat([
          monster("monster-1", "Goblin"),
          monster("monster-2", "Ogre"),
        ])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /ogre/i }));
    expect(
      screen.getByRole("group", { name: /attack result for goblin/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /attack result for ogre/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /saving throw result for ogre/i })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage you rolled/i }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "damage", targetId: "monster-1", amount: 15 },
      { kind: "damage", targetId: "monster-2", amount: 7 },
    ]);
  });

  it("exposes individual targets for a legacy grouped creature", () => {
    render(
      <CombatResolver
        action={action({ damage: "1d4", instances: 3 })}
        sheetCombat={combat([monster("monster-1", "Goblin", [7, 4, 7])])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /goblin 1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /goblin 2/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /goblin 3/i })).toBeInTheDocument();
  });

  it("keeps ally targeting behind one explicit override instead of forbidding it", () => {
    render(
      <CombatResolver
        action={action({ damage: "1d8", attackBonus: 6 })}
        sheetCombat={combat([monster("monster-1", "Goblin"), pc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /lyra/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Any creature" }));
    expect(screen.getByRole("button", { name: /lyra/i })).toBeInTheDocument();
  });

  it("makes an authored self exclusion overridable through Any creature", () => {
    render(
      <CombatResolver
        action={action({
          tempHpRoll: { dice: "1d8" },
          targeting: { affinity: "ally", excludeSelf: true, maxTargets: 2 },
        })}
        sheetCombat={combat([pc(), allyPc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /lyra/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Any creature" }));
    expect(screen.getByRole("button", { name: /lyra/i })).toBeInTheDocument();
  });

  it("actually cures a modeled condition on the caster", () => {
    useCharacterStore.setState({
      character: {
        ...MOCK_CHARACTER,
        session: { ...MOCK_CHARACTER.session, conditions: ["poisoned"] },
      },
    });
    render(
      <CombatResolver
        action={action({
          conditionRemoval: { options: ["poisoned"], max: 1 },
        })}
        sheetCombat={combat([{ ...pc(), conditions: ["poisoned"] }])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    expect(screen.getByRole("button", { name: /cure poisoned/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([]);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("delivers healing for another PC instead of silently dropping it", () => {
    const ally: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
      currentHp: 8,
    };
    render(
      <CombatResolver
        action={action({ healing: "2d4+5" })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for grimaldo/i }), {
      target: { value: "9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "healing", targetId: "pc-u2", amount: 9 }]);
  });

  it("delivers a held Bardic Inspiration die to the reviewed ally", () => {
    render(
      <CombatResolver
        action={action({
          grantedDie: { kind: "bardic-inspiration", die: "d6" },
          targeting: { affinity: "ally", maxTargets: 1, excludeSelf: true },
        })}
        sheetCombat={combat([pc(), allyPc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    expect(screen.queryByText("Lyra")).toBeNull();
    fireEvent.click(screen.getByText("Borin"));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      {
        kind: "resource",
        targetId: "pc-u2",
        resource: { kind: "bardic-inspiration-die", value: "d6" },
      },
    ]);
  });

  it("delivers Heroic Inspiration to every reviewed ally up to the resolved PB cap", () => {
    render(
      <CombatResolver
        action={action({
          grantsHeroicInspiration: true,
          targeting: { affinity: "ally", maxTargets: 2, excludeSelf: true },
        })}
        sheetCombat={combat([pc(), allyPc(), secondAllyPc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    expect(screen.queryByText("Lyra")).toBeNull();
    fireEvent.click(screen.getByText("Borin"));
    fireEvent.click(screen.getByText("Cora"));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      {
        kind: "resource",
        targetId: "pc-u2",
        resource: { kind: "heroic-inspiration" },
      },
      {
        kind: "resource",
        targetId: "pc-u3",
        resource: { kind: "heroic-inspiration" },
      },
    ]);
  });

  it("heals and ends a peer condition in one reviewed feature action", () => {
    const ally: EncounterCombatantView = {
      ...allyPc(),
      currentHp: 8,
      conditions: ["poisoned"],
    };
    render(
      <CombatResolver
        action={action({
          healApply: { dice: "d8", bonus: 3 },
          conditionRemoval: { options: ["poisoned"], max: 1 },
          targeting: { affinity: "any", maxTargets: 1 },
        })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for borin/i }), {
      target: { value: "5" },
    });
    expect(screen.getByRole("button", { name: /cure poisoned/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "healing", targetId: "pc-u2", amount: 8 },
      {
        kind: "condition",
        targetId: "pc-u2",
        conditionId: "poisoned",
        active: false,
      },
    ]);
  });

  it("spends one HP pool atomically across ally healing and paid condition cures", () => {
    const ally: EncounterCombatantView = {
      ...allyPc(),
      currentHp: 8,
      conditions: ["poisoned"],
    };
    const layOnHands = healingPoolAction();
    let committed: ResolvedAction | undefined;
    render(
      <CombatResolver
        action={layOnHands}
        sheetCombat={combat([pc(), ally])}
        onCommit={(afterCommit, actionOverride) => {
          committed = actionOverride;
          afterCommit();
        }}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    const cure = screen.getByRole("button", { name: /cure poisoned/i });
    expect(cure).toHaveAttribute("aria-pressed", "false");
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for borin/i }), {
      target: { value: "7" },
    });
    fireEvent.click(cure);
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(committed?.trackerCost).toBe(12);
    expectApplied([
      { kind: "healing", targetId: "pc-u2", amount: 7 },
      {
        kind: "condition",
        targetId: "pc-u2",
        conditionId: "poisoned",
        active: false,
      },
    ]);
  });

  it("heals and cures the solo character through the same pool resolver and undo", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    wounded.session.conditions = ["poisoned"];
    useCharacterStore.setState({ character: wounded });
    const layOnHands = healingPoolAction();
    let committed: ResolvedAction | undefined;
    let undo: (() => void) | undefined;
    render(
      <CombatResolver
        action={layOnHands}
        sheetCombat={null}
        onCommit={(afterCommit, actionOverride) => {
          committed = actionOverride;
          undo = afterCommit();
        }}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /lyra voss/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for lyra voss/i }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: /cure poisoned/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(committed?.trackerCost).toBe(12);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(17);
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([]);
    expect(applyMock).not.toHaveBeenCalled();

    undo?.();
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(10);
    expect(useCharacterStore.getState().character?.session.conditions).toEqual([
      "poisoned",
    ]);
  });

  it("persists a bounded solo condition as a source-owned occurrence and undoes it", () => {
    const charmPerson: ResolvedAction = {
      ...action({
        saveAbility: "WIS",
        saveDC: 14,
        targeting: { affinity: "any", maxTargets: 1 },
        conditionApplication: {
          options: ["charmed"],
          on: "failed-save",
          lifetime: { kind: "timed", minutes: 60, maxRounds: 600 },
        },
      }),
      id: "spell-charm-person",
      spellId: "charm-person",
      spellLevel: 1,
      slotLevel: 1,
    };
    let undo: (() => void) | undefined;
    render(
      <CombatResolver
        action={charmPerson}
        sheetCombat={null}
        onCommit={(afterCommit) => {
          undo = afterCommit();
        }}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /lyra voss/i }));
    fireEvent.click(screen.getByRole("button", { name: /failed save/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    expect(useCharacterStore.getState().combatActiveEffects).toEqual([
      expect.objectContaining({
        actor: {
          kind: "pc",
          combatantId: "self",
          memberUid: "self",
          characterId: MOCK_CHARACTER.id,
        },
        target: {
          kind: "pc",
          combatantId: "self",
          memberUid: "self",
          characterId: MOCK_CHARACTER.id,
        },
        payload: { kind: "condition", conditionId: "charmed" },
        duration: {
          kind: "turn-boundary",
          combatantId: "self",
          round: 601,
          phase: "turn-end",
        },
      }),
    ]);
    expect(useCharacterStore.getState().character?.session.encounterEffects).toHaveLength(
      1
    );
    expect(useCharacterStore.getState().character?.session.conditions).not.toContain(
      "charmed"
    );

    undo?.();
    expect(useCharacterStore.getState().combatActiveEffects).toEqual([]);
  });

  it("maximizes spell healing and applies one linked self-heal for another target", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    useCharacterStore.setState({ character: wounded });
    const ally: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
      currentHp: 8,
    };
    render(
      <CombatResolver
        action={action({
          healing: "2d8+5",
          healingMode: "maximum",
          selfHealingOnOther: { amount: 5, perCastLevel: 1 },
        })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    expect(
      screen.queryByRole("spinbutton", { name: /healing for grimaldo/i })
    ).toBeNull();
    expect(screen.getByText("Heal yourself 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "healing", targetId: "pc-u2", amount: 21 }]);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(15);
  });

  it("does not trigger linked self-healing when the other target is already full", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    useCharacterStore.setState({ character: wounded });
    const fullAlly: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
    };
    render(
      <CombatResolver
        action={action({
          healing: "2d8+5",
          healingMode: "maximum",
          selfHealingOnOther: { amount: 5, perCastLevel: 1 },
        })}
        sheetCombat={combat([pc(), fullAlly])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(10);
  });

  it("waits for the real economy commit before applying reviewed effects", () => {
    let finishCommit: (() => void) | undefined;
    render(
      <CombatResolver
        action={action({ damage: "1d8", attackBonus: 6 })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={(finish) => {
          finishCommit = finish;
        }}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(applyMock).not.toHaveBeenCalled();
    expect(useCharacterStore.getState().combatRecentActions).toEqual([]);
    finishCommit?.();
    expect(applyMock).toHaveBeenCalledTimes(1);
    expect(useCharacterStore.getState().combatRecentActions).toHaveLength(1);
  });

  it("resolves a non-damaging save and lets the table add a structured condition", () => {
    render(
      <CombatResolver
        action={action({ saveAbility: "WIS", saveDC: 14, effect: "Falls prone" })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /condition to goblin/i }), {
      target: { value: "prone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "prone",
        active: true,
      },
    ]);
  });

  it("applies a modeled condition only after its failed save", () => {
    render(
      <CombatResolver
        action={action({
          saveAbility: "WIS",
          saveDC: 14,
          conditionApplication: {
            options: ["frightened"],
            on: "failed-save",
          },
        })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    expect(
      screen.getByRole("group", { name: /saving throw result for goblin/i })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "frightened",
        active: true,
      },
    ]);
  });

  it("stores a concentration condition as a source-owned encounter occurrence", async () => {
    const holdPerson: ResolvedAction = {
      ...action({
        saveAbility: "WIS",
        saveDC: 14,
        conditionApplication: {
          options: ["paralyzed"],
          on: "failed-save",
          lifetime: { kind: "source" },
        },
      }),
      id: "spell-hold-person",
      spellId: "hold-person",
      spellLevel: 2,
      slotLevel: 2,
      concentration: true,
    };
    render(
      <CombatResolver
        action={holdPerson}
        sheetCombat={combat([pc(), monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    await waitFor(() => expect(appendPersistentMock).toHaveBeenCalledTimes(1));
    expect(applyMock).not.toHaveBeenCalled();
    const persisted = appendPersistentMock.mock.calls[0]?.[1];
    expect(persisted).toMatchObject({
      actor: { combatantId: "pc-u1" },
      target: { combatantId: "monster-1" },
      source: {
        kind: "spell",
        id: "hold-person",
        actionId: "spell-hold-person",
        castLevel: 2,
      },
      payload: { kind: "condition", conditionId: "paralyzed" },
      duration: {
        kind: "concentration",
        actorId: "pc-u1",
        sourceId: "hold-person",
      },
    });
  });

  it("stores a bounded non-concentration condition until its exact encounter round", async () => {
    const charmPerson: ResolvedAction = {
      ...action({
        saveAbility: "WIS",
        saveDC: 14,
        conditionApplication: {
          options: ["charmed"],
          on: "failed-save",
          lifetime: { kind: "timed", minutes: 60, maxRounds: 600 },
        },
      }),
      id: "spell-charm-person",
      spellId: "charm-person",
      spellLevel: 1,
      slotLevel: 1,
    };
    render(
      <CombatResolver
        action={charmPerson}
        sheetCombat={combat([pc(), monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    await waitFor(() => expect(appendPersistentMock).toHaveBeenCalledTimes(1));
    expect(applyMock).not.toHaveBeenCalled();
    expect(appendPersistentMock.mock.calls[0]?.[1]).toMatchObject({
      actor: { combatantId: "pc-u1" },
      target: { combatantId: "monster-1" },
      source: {
        kind: "spell",
        id: "charm-person",
        actionId: "spell-charm-person",
        castLevel: 1,
      },
      payload: { kind: "condition", conditionId: "charmed" },
      duration: {
        kind: "turn-boundary",
        combatantId: "pc-u1",
        round: 602,
        phase: "turn-end",
      },
    });
  });

  it("anchors a condition boundary to the selected target's exact turn", async () => {
    const battle = combat([pc(), monster("monster-1", "Goblin")]);
    battle.encounter = {
      currentCombatantId: "pc-u1",
      order: ["pc-u1", "monster-1"],
    } as GlobalCombat["encounter"];
    const searingOrb: ResolvedAction = {
      ...action({
        saveAbility: "DEX",
        saveDC: 14,
        conditionApplication: {
          options: ["blinded"],
          on: "failed-save",
          lifetime: {
            kind: "turn-boundary",
            phase: "turn-end",
            turns: 1,
            anchor: "target",
          },
        },
      }),
      id: "spell-searing-orb",
      spellId: "searing-orb",
      spellLevel: 2,
      slotLevel: 2,
    };
    render(
      <CombatResolver
        action={searingOrb}
        sheetCombat={battle}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    await waitFor(() => expect(appendPersistentMock).toHaveBeenCalledTimes(1));
    expect(appendPersistentMock.mock.calls[0]?.[1]).toMatchObject({
      target: { combatantId: "monster-1" },
      payload: { kind: "condition", conditionId: "blinded" },
      duration: {
        kind: "turn-boundary",
        combatantId: "monster-1",
        round: 2,
        phase: "turn-end",
      },
    });
  });

  it("uses the chosen condition's own lifetime when one spell has several", async () => {
    const symbol: ResolvedAction = {
      ...action({
        saveAbility: "WIS",
        saveDC: 14,
        conditionApplication: {
          options: ["frightened", "unconscious"],
          max: 1,
          on: "failed-save",
          lifetimes: {
            frightened: { kind: "timed", minutes: 1, maxRounds: 10 },
            unconscious: { kind: "timed", minutes: 10, maxRounds: 100 },
          },
        },
      }),
      id: "spell-symbol",
      spellId: "symbol",
      spellLevel: 7,
      slotLevel: 7,
    };
    render(
      <CombatResolver
        action={symbol}
        sheetCombat={combat([pc(), monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /condition to goblin/i }), {
      target: { value: "unconscious" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));

    await waitFor(() => expect(appendPersistentMock).toHaveBeenCalledTimes(1));
    expect(appendPersistentMock.mock.calls[0]?.[1]).toMatchObject({
      payload: { kind: "condition", conditionId: "unconscious" },
      duration: {
        kind: "turn-boundary",
        round: 102,
        phase: "turn-end",
      },
    });
  });

  it("clears an automatic condition on a successful save but permits a table override", () => {
    render(
      <CombatResolver
        action={action({
          saveAbility: "WIS",
          saveDC: 14,
          conditionApplication: {
            options: ["frightened"],
            on: "failed-save",
          },
        })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    const saveGroup = screen.getByRole("group", {
      name: /saving throw result for goblin/i,
    });
    const savedButton = saveGroup.querySelectorAll("button")[1];
    if (!savedButton) throw new Error("missing saved outcome button");
    fireEvent.click(savedButton);
    expect(
      screen.queryByRole("button", { name: /remove frightened from goblin/i })
    ).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: /condition to goblin/i }), {
      target: { value: "frightened" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      {
        kind: "condition",
        targetId: "monster-1",
        conditionId: "frightened",
        active: true,
      },
    ]);
  });

  it("defaults healing to allies and applies it directly when the target is self", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    useCharacterStore.setState({ character: wounded });
    render(
      <CombatResolver
        action={action({ healing: "1d8+3" })}
        sheetCombat={combat([monster("monster-1", "Goblin"), pc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    expect(screen.queryByRole("button", { name: /goblin/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for lyra/i }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(16);
  });

  it("treats an allied NPC as a healing target and excludes enemy creatures", () => {
    const ally = {
      ...monster("monster-ally", "Squire"),
      side: "ally" as const,
      currentHp: 3,
    };
    render(
      <CombatResolver
        action={action({ healing: "1d8+3" })}
        sheetCombat={combat([ally, monster("monster-enemy", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );

    expect(screen.queryByRole("button", { name: /goblin/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /squire/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for squire/i }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "healing", targetId: "monster-ally", amount: 4 }]);
  });

  it("fully heals without exposing a meaningless roll input", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 3;
    useCharacterStore.setState({ character: wounded });
    render(
      <CombatResolver
        action={action({ healingMode: "full", targeting: { affinity: "ally" } })}
        sheetCombat={combat([{ ...pc(), currentHp: 3 }])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    expect(screen.queryByRole("spinbutton", { name: /healing for lyra/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(20);
  });

  it("uses one roll for every target of a group heal", () => {
    const ally: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
      currentHp: 8,
    };
    render(
      <CombatResolver
        action={action({
          healing: "2d4+4",
          targeting: { affinity: "ally", maxTargets: 6, sharedAmount: true },
        })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing you rolled/i }), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "healing", targetId: "pc-u2", amount: 7 }]);
  });

  it("adds a feature heal's deterministic bonus to one shared roll for every target", () => {
    const allies = [
      { ...allyPc(), currentHp: 8 },
      { ...secondAllyPc(), currentHp: 9 },
    ];
    render(
      <CombatResolver
        action={action({
          healApply: { dice: "1d10", bonus: 7 },
          targeting: {
            affinity: "ally",
            excludeSelf: true,
            maxTargets: 2,
            sharedAmount: true,
          },
        })}
        sheetCombat={combat([pc(), ...allies])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    fireEvent.click(screen.getByRole("button", { name: /cora/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing you rolled/i }), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "healing", targetId: "pc-u2", amount: 13 },
      { kind: "healing", targetId: "pc-u3", amount: 13 },
    ]);
  });

  it("applies a shared multiplied feature roll as Temporary HP", () => {
    render(
      <CombatResolver
        action={action({
          tempHpRoll: { dice: "1d8", multiplier: 2, bonus: 1 },
          targeting: {
            affinity: "ally",
            excludeSelf: true,
            maxTargets: 2,
            sharedAmount: true,
          },
        })}
        sheetCombat={combat([pc(), allyPc(), secondAllyPc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    fireEvent.click(screen.getByRole("button", { name: /cora/i }));
    expect(screen.getByText("2×(1d8)+1")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing you rolled/i }), {
      target: { value: "4" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([
      { kind: "temp-hp", targetId: "pc-u2", amount: 9 },
      { kind: "temp-hp", targetId: "pc-u3", amount: 9 },
    ]);
  });

  it("resolves heal-or-harm per target in one casting", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    useCharacterStore.setState({ character: wounded });
    render(
      <CombatResolver
        action={action({
          damage: "2d8",
          damageType: "radiant",
          attackBonus: 6,
          healing: "1d8+3",
          targeting: { affinity: "any", maxTargets: 2 },
        })}
        sheetCombat={combat([monster("monster-1", "Goblin"), pc()])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: /healing for lyra/i }), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "damage", targetId: "monster-1", amount: 8 }]);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(15);
  });

  it("applies damage-linked self-healing in the same undoable resolution", () => {
    const wounded = structuredClone(MOCK_CHARACTER);
    wounded.session.hp.current = 10;
    useCharacterStore.setState({ character: wounded });
    render(
      <CombatResolver
        action={action({
          damage: "3d6",
          damageType: "necrotic",
          attackBonus: 6,
          selfHealingFromDamage: { fraction: 0.5 },
        })}
        sheetCombat={combat([monster("monster-1", "Goblin")])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /goblin/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /damage to goblin/i }), {
      target: { value: "8" },
    });
    expect(screen.getByText("Heal yourself 4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "damage", targetId: "monster-1", amount: 8 }]);
    expect(useCharacterStore.getState().character?.session.hp.current).toBe(14);
  });

  it("distributes Temporary HP to several PCs through the delivery queue", () => {
    const ally: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
    };
    render(
      <CombatResolver
        action={action({
          tempHpPool: 10,
          targeting: { affinity: "ally", maxTargets: 2 },
        })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: /temporary hp for lyra/i }), {
      target: { value: "7" },
    });
    fireEvent.change(
      screen.getByRole("spinbutton", { name: /temporary hp for grimaldo/i }),
      {
        target: { value: "7" },
      }
    );
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "temp-hp", targetId: "pc-u2", amount: 3 }]);
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(7);
  });

  it("never distributes more healing than a shared pool", () => {
    const ally: EncounterCombatantView = {
      ...pc(),
      id: "pc-u2",
      name: "Grimaldo",
      memberUid: "u2",
      characterId: "char-u2",
      currentHp: 8,
    };
    render(
      <CombatResolver
        action={action({
          healing: "10",
          healingPool: 10,
          targeting: { affinity: "ally" },
        })}
        sheetCombat={combat([pc(), ally])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /lyra/i }));
    fireEvent.click(screen.getByRole("button", { name: /grimaldo/i }));
    const lyraHealing = screen.getByRole("spinbutton", { name: /healing for lyra/i });
    const grimaldoHealing = screen.getByRole("spinbutton", {
      name: /healing for grimaldo/i,
    });
    fireEvent.change(lyraHealing, { target: { value: "7" } });
    fireEvent.change(grimaldoHealing, { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "healing", targetId: "pc-u2", amount: 3 }]);
  });

  it("offers stabilization only for an unstable 0-HP PC and declares it once", () => {
    const down = {
      ...allyPc(),
      currentHp: 0,
      down: true,
      deathSaves: { successes: 1, failures: 2 },
    };
    const stable = {
      ...secondAllyPc(),
      currentHp: 0,
      down: true,
      deathSaves: { successes: 3, failures: 0 },
    };
    render(
      <CombatResolver
        action={action({
          stabilize: true,
          targeting: { affinity: "ally", maxTargets: 1 },
        })}
        sheetCombat={combat([pc(), down, stable])}
        onCommit={commitNow}
        onDone={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /borin/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cora/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /lyra/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /borin/i }));
    expect(screen.getByText("Stabilize at 0 HP")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply action" }));
    expectApplied([{ kind: "stabilize", targetId: "pc-u2" }]);
  });
});

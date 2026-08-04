import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/features/character/center/apply-damage", () => ({
  applyDeclaredCombatEffects: vi.fn(() => Promise.resolve()),
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));

import "@/i18n";
import { CombatResolver } from "@/features/character/center/CombatResolver";
import {
  appendPersistentCombatEffect,
  applyDeclaredCombatEffects,
  revokePersistentCombatEffect,
} from "@/features/character/center/apply-damage";
import { useCharacterStore } from "@/stores/characterStore";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import type { ResolvedAction } from "@/lib/smart-tracker";

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
  useCharacterStore.setState({
    character: { ...MOCK_CHARACTER },
    readonly: false,
    combatRecentActions: [],
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
});

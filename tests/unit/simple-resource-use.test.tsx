import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { User } from "firebase/auth";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import { localizeActions } from "@/lib/views/combat-action-view";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { makeCharacterDoc } from "./_helpers";

const live = () => {
  const character = useCharacterStore.getState().character;
  if (!character) throw new Error("Test character missing");
  return character;
};

function ActionProbe({ cost }: { cost: string }) {
  const doc = useCharacterStore((s) => s.character);
  const { executeAction } = useTurnEconomy();
  const action =
    doc &&
    localizeActions(doc, "en").find(
      (entry) =>
        entry.costTracker === cost || entry.costEquipment === cost || entry.id === cost
    );
  return (
    <button
      onClick={() => {
        if (!action) throw new Error(`Missing action: ${cost}`);
        executeAction(action);
      }}
    >
      Use resource
    </button>
  );
}

function mountAction(cost: string) {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <ActionProbe cost={cost} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  useCharacterStore.setState({
    character: makeCharacterDoc(),
    readonly: false,
    combatPendingDamageReaction: null,
  });
});

it("manual damage applies immediately, without a reaction decision, and undoes", () => {
  const doc = structuredClone(MOCK_CHARACTER);
  doc.session.hp = { current: 38, temp: 0 };
  doc.session.concentration = "";
  useCharacterStore.setState({ character: doc });
  const { result } = renderHook(() => useHpControls());
  act(() => result.current.handleApplyDamage([{ amount: 10 }]));
  expect(live().session.hp.current).toBe(28);
  expect(useCharacterStore.getState().combatPendingDamageReaction).toBeNull();
  expect(useCombatStore.getState().reactionUsed).toBe(false);
  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  expect(live().session.hp.current).toBe(38);
  act(() => {
    expect(useUndoStore.getState().redo()).toBe(true);
  });
  expect(live().session.hp.current).toBe(28);
});

describe("consumables", () => {
  it("spends exactly one item across duplicate stocked rows", () => {
    live().character.equipment = [
      { srdId: "potion-of-healing", quantity: 0 },
      { srdId: "potion-of-healing", quantity: 2 },
      { srdId: "potion-of-healing", quantity: 3 },
    ];
    useCharacterStore.getState().useEquipmentItem("potion-of-healing");
    expect(live().character.equipment.map((ref) => ref.quantity)).toEqual([0, 1, 3]);
  });

  it.each([1, 2])(
    "undo restores only the consumed unit (starting quantity %s)",
    async (quantity) => {
      live().character.equipment = [
        { srdId: "potion-of-healing", quantity, tracked: true },
      ];
      live().session.hp = { current: 5, temp: 0 };
      mountAction("potion-of-healing");
      fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
      await waitFor(() => expect(useUndoStore.getState().past).toHaveLength(1));
      expect(
        live().character.equipment.reduce((n, ref) => n + (ref.quantity ?? 1), 0)
      ).toBe(quantity - 1);
      expect(live().session.hp.current).toBe(5);
      act(() =>
        useCharacterStore.getState().setCharacter({
          ...live(),
          character: {
            ...live().character,
            equipment: [{ srdId: "rope", quantity: 4 }, ...live().character.equipment],
          },
        })
      );
      act(() => {
        expect(useUndoStore.getState().undo()).toBe(true);
      });
      expect(live().character.equipment).toContainEqual({ srdId: "rope", quantity: 4 });
      expect(
        live().character.equipment.find(
          (ref) => "srdId" in ref && ref.srdId === "potion-of-healing"
        )?.quantity
      ).toBe(quantity);
      act(() => {
        expect(useUndoStore.getState().redo()).toBe(true);
      });
      expect(live().character.equipment).toContainEqual({ srdId: "rope", quantity: 4 });
    }
  );
});

describe("resource amount picker", () => {
  function openPool() {
    useCharacterStore.setState({
      character: makeCharacterDoc({
        classId: "paladin",
        level: 3,
        features: [{ srdId: "paladin-lay-on-hands" }],
      }),
    });
    mountAction("paladin-lay-on-hands");
    fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
    const modal = screen.getByRole("dialog");
    fireEvent.change(within(modal).getByRole("spinbutton"), { target: { value: "3" } });
    return modal;
  }

  it("spends the chosen points without changing HP and supports undo", async () => {
    const modal = openPool();
    const hp = structuredClone(live().session.hp);
    fireEvent.click(within(modal).getByRole("button", { name: "Spend" }));
    await waitFor(() =>
      expect(live().session.trackers["paladin-lay-on-hands"]?.used).toBe(3)
    );
    expect(live().session.hp).toEqual(hp);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(live().session.trackers["paladin-lay-on-hands"]?.used ?? 0).toBe(0);
  });

  it.each(["character", "readonly", "depleted"])(
    "rejects the pending choice after %s changes",
    async (change) => {
      const modal = openPool();
      act(() => {
        if (change === "character")
          useCharacterStore.setState({
            character: { ...structuredClone(live()), id: "other-hero" },
          });
        else if (change === "readonly") useCharacterStore.setState({ readonly: true });
        else useCharacterStore.getState().useTracker("paladin-lay-on-hands", 15);
      });
      const before = structuredClone(live());
      await act(async () => {
        fireEvent.click(within(modal).getByRole("button", { name: "Spend" }));
        await Promise.resolve();
      });
      expect(live()).toEqual(before);
      expect(useUndoStore.getState().past).toHaveLength(0);
    }
  );
});

it("a delayed consumable commit cannot spend another character's inventory", async () => {
  live().character.equipment = [
    { srdId: "potion-of-healing", quantity: 2, tracked: true },
  ];
  mountAction("potion-of-healing");
  fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
  const other = { ...structuredClone(live()), id: "other-hero" };
  await act(async () => {
    useCharacterStore.setState({ character: other });
    await Promise.resolve();
  });
  expect(live().character.equipment).toEqual(other.character.equipment);
  expect(useUndoStore.getState().past).toHaveLength(0);
});

it.each(["payment", "recovery"])(
  "a %s picker cannot change another character",
  async (kind) => {
    const recovery = kind === "recovery";
    const doc = makeCharacterDoc(
      {
        classId: recovery ? "wizard" : "druid",
        level: 3,
        features: (recovery
          ? ["wizard-arcane-recovery"]
          : ["druid-wild-shape", "druid-wild-companion"]
        ).map((srdId) => ({ srdId })),
        spellSlots: [{ level: 1, total: 4 }],
      },
      { spellSlots: { "1": { used: 1 } } }
    );
    useCharacterStore.setState({ character: doc });
    const action = localizeActions(doc, "en").find((a) =>
      recovery
        ? a.costTracker === "wizard-arcane-recovery"
        : a.alternateCost !== undefined
    );
    if (!action) throw new Error("Missing resource choice");
    mountAction(action.id);
    fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
    const modal = screen.getByRole("dialog");
    if (recovery)
      fireEvent.click(within(modal).getByRole("button", { name: "Increase" }));
    act(() =>
      useCharacterStore.setState({
        character: { ...structuredClone(live()), id: "other-hero" },
      })
    );
    const before = structuredClone(live());
    await act(async () => {
      fireEvent.click(
        within(modal).getByRole("button", {
          name: recovery ? "Recover" : /default cost.*wild shape/i,
        })
      );
      await Promise.resolve();
    });
    expect(live()).toEqual(before);
    expect(useUndoStore.getState().past).toHaveLength(0);
  }
);

it.each(["depleted", "restored slots"])(
  "rechecks recovery after %s changed while choosing",
  (change) => {
    useCharacterStore.setState({
      character: makeCharacterDoc(
        {
          classId: "wizard",
          level: 3,
          features: [{ srdId: "wizard-arcane-recovery" }],
          spellSlots: [{ level: 1, total: 4 }],
        },
        { spellSlots: { "1": { used: 1 } } }
      ),
    });
    mountAction("wizard-arcane-recovery");
    fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
    const modal = screen.getByRole("dialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Increase" }));
    act(() => {
      if (change === "depleted")
        useCharacterStore.getState().useTracker("wizard-arcane-recovery");
      else useCharacterStore.getState().restoreSpellSlot(1);
    });
    const before = structuredClone(live());
    fireEvent.click(within(modal).getByRole("button", { name: "Recover" }));
    expect(live()).toEqual(before);
    expect(useUndoStore.getState().past).toHaveLength(0);
  }
);

it("rechecks recovery availability on redo", () => {
  useCharacterStore.setState({
    character: makeCharacterDoc(
      {
        classId: "wizard",
        level: 3,
        features: [{ srdId: "wizard-arcane-recovery" }],
        spellSlots: [{ level: 1, total: 4 }],
      },
      { spellSlots: { "1": { used: 1 } } }
    ),
  });
  mountAction("wizard-arcane-recovery");
  fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
  const modal = screen.getByRole("dialog");
  fireEvent.click(within(modal).getByRole("button", { name: "Increase" }));
  fireEvent.click(within(modal).getByRole("button", { name: "Recover" }));
  expect(live().session.spellSlots["1"]?.used).toBe(0);
  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  act(() => useCharacterStore.getState().useTracker("wizard-arcane-recovery"));
  const before = structuredClone(live());
  act(() => {
    useUndoStore.getState().redo();
  });
  expect(live()).toEqual(before);
  expect(useUndoStore.getState().past).toHaveLength(0);
});

it("consumable undo preserves same-stack edits and runs only once", () => {
  live().character.equipment = [
    { srdId: "potion-of-healing", quantity: 3, notes: "old" },
  ];
  const undo = useCharacterStore.getState().useEquipmentItem("potion-of-healing");
  expect(undo).not.toBeNull();
  const ref = live().character.equipment[0];
  if (!ref) throw new Error("Consumed stack missing");
  useCharacterStore.setState({
    character: {
      ...live(),
      character: {
        ...live().character,
        equipment: [
          { srdId: "rope", quantity: 2 },
          { ...ref, quantity: 7, notes: "edited" },
        ],
      },
    },
  });
  expect(undo?.()).toBe(true);
  expect(live().character.equipment[1]).toMatchObject({
    quantity: 8,
    notes: "edited",
    instanceId: ref.instanceId,
  });
  expect(undo?.()).toBe(false);
  expect(live().character.equipment[1]?.quantity).toBe(8);
});

it("a consumable redo cannot spend an item that has since been removed", async () => {
  live().character.equipment = [
    { srdId: "potion-of-healing", quantity: 1, tracked: true },
  ];
  mountAction("potion-of-healing");
  fireEvent.click(screen.getByRole("button", { name: "Use resource" }));
  await waitFor(() => expect(useUndoStore.getState().past).toHaveLength(1));
  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  act(() =>
    useCharacterStore.setState({
      character: { ...live(), character: { ...live().character, equipment: [] } },
    })
  );
  const before = structuredClone(live());
  act(() => {
    useUndoStore.getState().redo();
  });
  expect(live()).toEqual(before);
  expect(useUndoStore.getState().past).toHaveLength(0);
});

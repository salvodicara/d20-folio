import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { SpellsTab } from "@/features/character/center/tabs/SpellsTab";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { characterWorldState } from "@/lib/mechanics-world-store";
import { parseCharacter, serializeCharacter } from "@/lib/character-codec";
import type { CharacterDoc } from "@/types/character";
import { concentrationValue } from "@/lib/concentration";
import { effectiveAC } from "@/lib/aggregate-character";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";

function liveCharacter(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("Test character missing");
  return doc;
}

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  const doc = makeCharacterDoc({ classId: "cleric", level: 3 });
  doc.character.spells = [{ srdId: "healing-word", prepared: true }];
  doc.character.spellSlots = [{ level: 1, total: 2 }];
  doc.session.spellSlots = {};
  doc.session.hp = { current: 5, temp: 0 };
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
});

describe.each(["spellbook", "play"] as const)("simple casting from %s", (surface) => {
  it.each([false, true])(
    "spends only the slot, repeats and undoes (existing world: %s)",
    async (existingWorld) => {
      const doc = liveCharacter();
      if (existingWorld) {
        const world = characterWorldState(doc, "test-uid", doc.character.hp.max, {
          "1": 2,
        });
        if (!world) throw new Error("Invalid test world");
        doc.session.world = world;
      }
      const { unmount } = render(
        <MemoryRouter>
          <TurnEconomyProvider>
            {surface === "spellbook" ? <SpellsTab /> : <PlayTab />}
          </TurnEconomyProvider>
        </MemoryRouter>
      );
      if (surface === "play")
        fireEvent.click(screen.getByRole("button", { name: /^all/i }));
      act(() =>
        useCombatStore.setState({
          round: 3,
          spellSlotCastsThisTurn: 1,
          spellSlotCastTurnKey: "solo:test-char:3",
          selected: {
            action: [{ id: "already-used", name: "Already used", slot: "action" }],
            bonus: [
              { id: "already-used-bonus", name: "Already used bonus", slot: "bonus" },
            ],
            free: [],
          },
        })
      );
      const card = screen.getByText("Healing Word").closest(".uc") as HTMLElement;
      fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
      const cast = () => within(card).getByRole("button", { name: /^(cast|use)/i });
      fireEvent.click(cast());
      await waitFor(() =>
        expect(
          useCharacterStore.getState().character?.session.spellSlots["1"]?.used
        ).toBe(1)
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(useCharacterStore.getState().character?.session.hp).toEqual({
        current: 5,
        temp: 0,
      });
      fireEvent.click(cast());
      await waitFor(() =>
        expect(
          useCharacterStore.getState().character?.session.spellSlots["1"]?.used
        ).toBe(2)
      );
      act(() => {
        useUndoStore.getState().undo();
      });
      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        1
      );
      expect(useCharacterStore.getState().character?.session.hp.current).toBe(5);
      act(() => {
        useUndoStore.getState().redo();
      });
      expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(
        2
      );
      if (existingWorld) {
        const parsed = parseCharacter(serializeCharacter(liveCharacter()));
        if (!parsed.success) throw new Error(parsed.error);
        const saved = { ...liveCharacter(), ...parsed.doc };
        expect(saved.session.spellSlots["1"]?.used).toBe(2);
        expect(
          characterWorldState(saved, "test-uid", saved.character.hp.max)?.resources
            .standardSpellSlots["1"]?.current
        ).toBe(0);
      }
      unmount();
    }
  );
});

it("records a reaction spell without applying its armor bonus", async () => {
  const doc = liveCharacter();
  doc.character.spells = [{ srdId: "shield", prepared: true }];
  const ac = effectiveAC(doc.character, doc.session);
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const card = screen.getByText("Shield").closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
  fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
  await waitFor(() =>
    expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1)
  );
  const after = liveCharacter();
  expect(effectiveAC(after.character, after.session)).toBe(ac);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("records an attack without requiring a target or damage roll", async () => {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /^all/i }));
  const card = screen.getByText("Unarmed Strike").closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^attack/i }));
  await waitFor(() =>
    expect(useCombatStore.getState().selected.action).toContainEqual(
      expect.objectContaining({ id: "unarmed-strike" })
    )
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useCharacterStore.getState().character?.session.hp.current).toBe(5);
});

it("replaces concentration after confirmation and restores it with undo", async () => {
  const doc = liveCharacter();
  doc.character.spells = [{ srdId: "shield-of-faith", prepared: true }];
  doc.session.concentration = concentrationValue("bless");
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const card = screen.getByText("Shield of Faith").closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
  fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
  await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
  expect(useCharacterStore.getState().character?.session.spellSlots).toEqual({});
  act(() => useConfirmStore.getState().respond(true));
  await waitFor(() =>
    expect(useCharacterStore.getState().character?.session.concentration).toBe(
      "shield-of-faith"
    )
  );
  expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used).toBe(1);
  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  expect(useCharacterStore.getState().character?.session.concentration).toBe("bless");
  expect(useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0).toBe(
    0
  );
});

it.each(["character", "readonly"] as const)(
  "rejects a pending cast after changing %s",
  async (change) => {
    const doc = liveCharacter();
    doc.character.spells = [{ srdId: "shield-of-faith", prepared: true }];
    doc.session.concentration = concentrationValue("bless");
    render(
      <MemoryRouter>
        <TurnEconomyProvider>
          <SpellsTab />
        </TurnEconomyProvider>
      </MemoryRouter>
    );
    const card = screen.getByText("Shield of Faith").closest(".uc") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
    fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
    await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
    act(() =>
      useCharacterStore.setState(
        change === "character"
          ? { character: { ...doc, id: "different-character" } }
          : { readonly: true }
      )
    );
    await act(async () => {
      useConfirmStore.getState().respond(true);
      await Promise.resolve();
    });
    expect(liveCharacter().session.spellSlots).toEqual({});
    expect(liveCharacter().session.concentration).toBe("bless");
    expect(useUndoStore.getState().past).toEqual([]);
  }
);

it("lets the player pay for Redirect after resolving Deflect at the table", async () => {
  const doc = makeCharacterDoc({
    classId: "monk",
    level: 3,
    features: [{ srdId: "monk-focus" }, { srdId: "monk-deflect-attacks" }],
  });
  useCharacterStore.setState({ character: doc });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /^all/i }));
  fireEvent.click(screen.getByRole("button", { name: /^React: Deflect Attacks/ }));
  await waitFor(() => expect(useCombatStore.getState().reactionUsed).toBe(true));
  expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: /^Use:.*Redirect/i }));
  await waitFor(() =>
    expect(liveCharacter().session.trackers["monk-focus"]?.used).toBe(1)
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("undoing a concentration swap preserves an unlit previous buff", async () => {
  const doc = liveCharacter();
  doc.character.spells = [{ srdId: "bless", prepared: true }];
  doc.session.concentration = concentrationValue("shield-of-faith");
  doc.session.activeFeatures = [];
  const ac = effectiveAC(doc.character, doc.session);
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const card = screen.getByText("Bless").closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
  fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
  await waitFor(() => expect(useConfirmStore.getState().open).toBe(true));
  await act(async () => {
    useConfirmStore.getState().respond(true);
    await Promise.resolve();
  });
  expect(liveCharacter().session.concentration).toBe("bless");
  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  expect(liveCharacter().session.concentration).toBe("shield-of-faith");
  expect(liveCharacter().session.activeFeatures).toEqual([]);
  expect(effectiveAC(liveCharacter().character, liveCharacter().session)).toBe(ac);
});

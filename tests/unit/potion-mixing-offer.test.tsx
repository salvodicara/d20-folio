/**
 * Mixing potions (M18, the DM's optional table): drinking a potion while another
 * one's effect still runs offers a d100 on the table. An offer, never a block: the
 * player records the roll (an undoable log line) or skips it (nothing written).
 */
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
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
import { localizeActions } from "@/lib/views/combat-action-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { act } from "@testing-library/react";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { makeCharacterDoc } from "./_helpers";

const live = () => {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
};

function Drink({ match }: { match: (cost: string) => boolean }) {
  const doc = useCharacterStore((s) => s.character);
  const { executeAction } = useTurnEconomy();
  const action =
    doc &&
    localizeActions(doc, "en").find((a) => a.costEquipment && match(a.costEquipment));
  return (
    <button
      onClick={() => {
        if (!action) throw new Error("no drink action");
        executeAction(action);
      }}
    >
      drink
    </button>
  );
}

async function mount(doc: CharacterDoc, match: (cost: string) => boolean) {
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Drink match={match} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const lines = doc.session.logEntries.length;
  fireEvent.click(screen.getByRole("button", { name: "drink" }));
  // The bottle is used (its log line lands) before anything is read.
  await waitFor(() => expect(live().session.logEntries.length).toBeGreaterThan(lines));
}

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  usePlayPromptStore.setState({ open: {} });
});

const drinker = (running: string[]): CharacterDoc =>
  makeCharacterDoc(
    {
      classId: "fighter",
      level: 3,
      equipment: [{ srdId: "potion-of-invulnerability", quantity: 1 }] as never,
    },
    { activeFeatures: running }
  );

const offer = () => usePlayPromptStore.getState().open["potion-mixing"];
const mixingLines = () =>
  live().session.logEntries.filter((e) => e.event.kind === "potion-mixing");

describe("mixing potions", () => {
  it("drinking one while another runs offers the d100; recording logs it, undoably", async () => {
    await mount(drinker(["potion:potion-of-heroism"]), (c) =>
      c.includes("invulnerability")
    );
    const prompt = offer();
    expect(prompt?.potions).toEqual([
      { srd: { kind: "magic-item", key: "potion-of-invulnerability", field: "name" } },
      { srd: { kind: "magic-item", key: "potion-of-heroism", field: "name" } },
    ]);
    act(() => prompt?.onConfirm(42));
    expect(mixingLines().map((e) => e.event)).toEqual([
      expect.objectContaining({ kind: "potion-mixing", roll: 42 }),
    ]);
    expect(offer()).toBeUndefined();
    act(() => {
      useUndoStore.getState().undo();
    });
    expect(mixingLines()).toEqual([]);
  });

  it("skipping writes nothing", async () => {
    await mount(drinker(["potion:potion-of-heroism"]), (c) =>
      c.includes("invulnerability")
    );
    act(() => offer()?.onConfirm(null));
    expect(mixingLines()).toEqual([]);
    expect(offer()).toBeUndefined();
  });

  it("no other potion running: no offer", async () => {
    await mount(drinker([]), (c) => c.includes("invulnerability"));
    expect(offer()).toBeUndefined();
  });
});

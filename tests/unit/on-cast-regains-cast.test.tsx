/**
 * The cast commit applies what casting gives back (Arcane Ward, Expert Divination),
 * logs it after the cast's own line, and one undo takes the cast and the regain back.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/lib/srd-feature-lookup", async (importOriginal) =>
  (await import("./__helpers__/on-cast-features")).withOnCastFeatures(
    await importOriginal()
  )
);

import { SpellsTab } from "@/features/character/center/tabs/SpellsTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import type { CharacterDoc } from "@/types/character";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";
import {
  ARCANE_WARD,
  EXPERT_DIVINATION,
  registerOnCastFeatureStrings,
} from "./__helpers__/on-cast-features";

function live(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("Test character missing");
  return doc;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({ character: doc, readonly: false, loading: false });
}

function castFromSpellbook(spellName: string): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SpellsTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  const card = screen.getByText(spellName).closest(".uc") as HTMLElement;
  fireEvent.click(within(card).getByRole("button", { name: /^expand/i }));
  fireEvent.click(within(card).getByRole("button", { name: /^cast/i }));
}

const logKinds = () => live().session.logEntries.map((entry) => entry.event.kind);

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  registerOnCastFeatureStrings();
});

it("an Abjurer casting Shield refills the Arcane Ward by 2, and undo spends it again", async () => {
  const doc = makeCharacterDoc(
    {
      classId: "wizard",
      subclassId: "abjurer",
      level: 3,
      features: [{ srdId: ARCANE_WARD }],
      spells: [{ srdId: "shield", prepared: true }],
      spellSlots: [{ level: 1, total: 2 }],
    },
    { trackers: { [ARCANE_WARD]: { used: 5 } } }
  );
  load(doc);
  castFromSpellbook("Shield");
  await waitFor(() => expect(live().session.spellSlots["1"]?.used).toBe(1));
  expect(live().session.trackers[ARCANE_WARD]?.used).toBe(3);
  expect(live().session.logEntries.at(-1)?.event).toEqual({
    kind: "tracker-regain",
    trackerId: ARCANE_WARD,
    amount: 2,
  });

  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  expect(live().session.spellSlots["1"]?.used ?? 0).toBe(0);
  expect(live().session.trackers[ARCANE_WARD]?.used).toBe(5);
  expect(logKinds()).toEqual([]);
}, 20_000);

it("a Diviner casting a level 2 Divination spell regains the expended level 1 slot", async () => {
  const doc = makeCharacterDoc(
    {
      classId: "wizard",
      subclassId: "diviner",
      level: 6,
      features: [{ srdId: EXPERT_DIVINATION }],
      spells: [{ srdId: "see-invisibility", prepared: true }],
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 1 },
      ],
    },
    { spellSlots: { "1": { used: 1 } } }
  );
  load(doc);
  castFromSpellbook("See Invisibility");
  await waitFor(() => expect(live().session.spellSlots["2"]?.used).toBe(1));
  expect(live().session.spellSlots["1"]?.used).toBe(0);
  expect(logKinds()).toEqual(["action-use", "slot-regain"]);

  act(() => {
    expect(useUndoStore.getState().undo()).toBe(true);
  });
  expect(live().session.spellSlots["2"]?.used ?? 0).toBe(0);
  expect(live().session.spellSlots["1"]?.used).toBe(1);
  expect(logKinds()).toEqual([]);
}, 20_000);

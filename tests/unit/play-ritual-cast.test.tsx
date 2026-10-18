/**
 * A ritual spell can be cast as a ritual from the Play tab, not only from the
 * Spells tab (owner 2026-10-16: actions work outside combat too; #343's audit found
 * the Ritual button only on the Spells card). The ritual costs no slot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { makeCharacterDoc } from "./_helpers";
import type { User } from "firebase/auth";

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  const doc = makeCharacterDoc({ classId: "cleric", level: 3 });
  doc.character.spells = [
    { srdId: "detect-magic", prepared: true },
    { srdId: "healing-word", prepared: true },
  ];
  doc.character.spellSlots = [{ level: 1, total: 2 }];
  doc.session.spellSlots = {};
  useCharacterStore.setState({
    character: doc,
    readonly: false,
    loading: false,
    error: null,
  });
});

function renderPlay(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /^all/i }));
}

function card(name: string): HTMLElement {
  const el = screen.getByText(name).closest(".uc") as HTMLElement;
  fireEvent.click(within(el).getByRole("button", { name: /^expand/i }));
  return el;
}

describe("Play tab: cast a ritual", () => {
  it("offers the Ritual cast on a ritual spell, and the ritual spends no slot", async () => {
    renderPlay();
    const detect = card("Detect Magic");
    fireEvent.click(within(detect).getByRole("button", { name: /as a ritual/i }));
    await waitFor(() =>
      expect(useCharacterStore.getState().character?.session.concentration).toBeTruthy()
    );
    expect(
      useCharacterStore.getState().character?.session.spellSlots["1"]?.used ?? 0
    ).toBe(0);
  });

  it("does not offer it on a spell without the ritual tag", () => {
    renderPlay();
    const heal = card("Healing Word");
    expect(within(heal).queryByRole("button", { name: /as a ritual/i })).toBeNull();
  });
});

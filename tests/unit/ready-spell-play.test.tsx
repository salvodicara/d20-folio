/**
 * Ready a spell in play (2024): Ready, then cast an action spell → it is held with
 * Concentration and shown on the reaction row; Release spends the Reaction; the hold
 * is lost at the start of your next turn (solo End Turn) or when Concentration ends.
 */
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

import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUIStore } from "@/stores/uiStore";
import { useUndoStore } from "@/stores/undoStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirmStore } from "@/stores/confirmStore";
import type { CharacterDoc } from "@/types/character";
import type { User } from "firebase/auth";
import { makeCharacterDoc } from "./_helpers";

function live(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("Test character missing");
  return doc;
}

/** The provider's End Turn, as a plain button for the test to press. */
function EndTurnHandle() {
  const { handleEndTurn } = useTurnEconomy();
  return (
    <button type="button" onClick={handleEndTurn}>
      test-end-turn
    </button>
  );
}

function renderPlay(): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <EndTurnHandle />
        <PlayTab />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole("button", { name: /^all/i }));
}

/** Ready, then cast Magic Missile from its card (skipping the target step). */
async function readyMagicMissile(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /^use: ready$/i }));
  await waitFor(() =>
    expect(useCombatStore.getState().selected.action.map((a) => a.id)).toContain(
      "base-ready"
    )
  );
  await castMagicMissile();
}

/** Cast Magic Missile from its card, skipping a target step if one opens. */
async function castMagicMissile(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: /^cast: magic missile/i }));
  await waitFor(() => {
    const step = screen.queryByRole("dialog", { name: /on whom/i });
    if (step) fireEvent.click(within(step).getByRole("button", { name: /^skip/i }));
    expect(live().session.spellSlots["1"]?.used).toBe(1);
  });
}

const releaseButton = () => screen.queryByRole("button", { name: /^release:/i });

beforeEach(() => {
  useCombatStore.getState().endCombat();
  useUndoStore.getState().clear(null);
  useUIStore.setState({ sheetMode: "play" });
  useConfirmStore.setState({ open: false, options: null, _resolve: null });
  useAuthStore.setState({ user: { uid: "test-uid" } as User });
  const doc = makeCharacterDoc({
    classId: "wizard",
    level: 5,
    spells: [{ srdId: "magic-missile", prepared: true }],
    spellSlots: [{ level: 1, total: 4 }],
  });
  useCharacterStore.setState({ character: doc, readonly: false, loading: false });
});

describe("Ready a spell", () => {
  it("holds the spell with Concentration; Release spends the Reaction; one undo each", async () => {
    renderPlay();
    await readyMagicMissile();
    expect(live().session.concentration).toBe("magic-missile");
    expect(live().session.readiedSpell).toEqual({
      expiresRound: 2,
      castLogId: expect.any(String) as string,
    });
    // Nothing resolves yet: the damage tray waits for the release.
    expect(screen.queryByTestId("damage-tray")).not.toBeInTheDocument();

    const release = releaseButton();
    expect(release).not.toBeNull();
    fireEvent.click(release as HTMLElement);
    expect(useCombatStore.getState().reactionUsed).toBe(true);
    // Magic Missile needs no Concentration: releasing it lets go.
    expect(live().session.concentration).toBe("");
    expect(live().session.readiedSpell).toBeUndefined();
    expect(live().session.logEntries.at(-2)?.event.kind).toBe("reaction-use");

    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(live().session.concentration).toBe("magic-missile");
    expect(live().session.readiedSpell?.expiresRound).toBe(2);
  }, 30_000);

  it("is lost at the start of your next turn, and undoing End Turn brings it back", async () => {
    renderPlay();
    await readyMagicMissile();
    fireEvent.click(screen.getByRole("button", { name: "test-end-turn" }));
    expect(live().session.readiedSpell).toBeUndefined();
    expect(live().session.concentration).toBe("");
    await waitFor(() => expect(releaseButton()).toBeNull());
    act(() => {
      expect(useUndoStore.getState().undo()).toBe(true);
    });
    expect(live().session.readiedSpell?.expiresRound).toBe(2);
    expect(live().session.concentration).toBe("magic-missile");
  }, 30_000);

  it("is lost when Concentration breaks", async () => {
    renderPlay();
    await readyMagicMissile();
    act(() => {
      useCharacterStore.getState().setConcentration("", { undoable: false });
    });
    expect(live().session.readiedSpell).toBeUndefined();
    await waitFor(() => expect(releaseButton()).toBeNull());
  }, 30_000);

  it("without Ready, the same cast is an ordinary cast", async () => {
    renderPlay();
    await castMagicMissile();
    expect(live().session.concentration).toBe("");
    expect(live().session.readiedSpell).toBeUndefined();
    expect(releaseButton()).toBeNull();
  }, 30_000);
});

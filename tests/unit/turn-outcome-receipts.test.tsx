import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import "@/i18n";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import {
  useTurnEconomy,
  type PreparedCommit,
  type PreparedCommitArtifact,
} from "@/features/character/center/useTurnEconomy";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { CombatOutcomeReceipt } from "@/types/combat-outcome";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import { MOCK_CHARACTER } from "@/lib/mock";

let stagedCommit: PreparedCommit | null;

function testAction(
  id: string,
  type: ResolvedAction["type"],
  source: ResolvedAction["source"] = "feature"
): ResolvedAction {
  return {
    id,
    name: id,
    nameLoc: { custom: id },
    type,
    source,
    spellLevel: source === "spell" ? 0 : null,
    concentration: false,
    summary: source === "weapon" ? { attackBonus: 5, damage: "1d8+3" } : {},
    costsSlot: false,
    pinned: false,
    defaultPinned: false,
  };
}

function artifact(action: ResolvedAction, occurrenceId: string): PreparedCommitArtifact {
  const receipt: CombatOutcomeReceipt = {
    id: `${occurrenceId}:0`,
    occurrenceId,
    actionId: action.id,
    instance: 0,
    count: 1,
    target: { combatantId: "monster-1" },
    fact: { kind: "attack", result: "hit" },
  };
  return { action, outcomeOccurrenceId: occurrenceId, outcomes: [receipt] };
}

function Probe({
  action,
  prepared,
}: {
  action: ResolvedAction;
  prepared: PreparedCommitArtifact;
}) {
  const { prepareResolution } = useTurnEconomy();
  const [ready, setReady] = useState(false);
  return (
    <>
      <button
        onClick={() =>
          prepareResolution(action, (_resolved, commit) => {
            stagedCommit = commit;
            setReady(true);
          })
        }
      >
        Prepare
      </button>
      <button disabled={!ready} onClick={() => stagedCommit?.(() => undefined, prepared)}>
        Commit
      </button>
    </>
  );
}

function mount(action: ResolvedAction, prepared: PreparedCommitArtifact): void {
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <Probe action={action} prepared={prepared} />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

describe("turn outcome receipt ownership", () => {
  beforeEach(() => {
    stagedCommit = null;
    useCharacterStore.setState({
      character: structuredClone(MOCK_CHARACTER),
      loading: false,
      error: null,
      readonly: false,
      combatPersistence: null,
    });
    useCombatStore.getState().endCombat();
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
    useToastStore.setState({ toasts: [], timers: {} });
    useUndoStore.setState({ characterId: MOCK_CHARACTER.id, past: [], future: [] });
  });

  it.each([
    ["ordinary action", testAction("feature-use", "action"), "feature-use-1"],
    ["cast", testAction("custom-cantrip", "action", "spell"), "cast-1"],
  ])(
    "commits, undoes, and redoes the exact %s occurrence",
    async (_label, action, id) => {
      mount(action, artifact(action, id));
      fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
      fireEvent.click(await screen.findByRole("button", { name: "Commit" }));

      await waitFor(() =>
        expect(useCombatStore.getState().outcomeReceipts).toHaveLength(1)
      );
      expect(useCombatStore.getState().selected.action[0]?.outcomeOccurrenceId).toBe(id);

      act(() => void useUndoStore.getState().undo());
      expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
      expect(useCombatStore.getState().selected.action).toEqual([]);

      act(() => void useUndoStore.getState().redo());
      expect(useCombatStore.getState().outcomeReceipts[0]?.occurrenceId).toBe(id);
      expect(useCombatStore.getState().selected.action[0]?.outcomeOccurrenceId).toBe(id);
    }
  );

  it("binds an Extra Attack swing to its exact occurrence through undo and redo", async () => {
    const action = testAction("weapon-longsword", "action", "weapon");
    const current = useCharacterStore.getState().character;
    if (!current) throw new Error("missing test character");
    useCharacterStore.getState().setCharacter({
      ...current,
      character: {
        ...current.character,
        classes: [{ classId: "fighter", subclassId: "champion", level: 5 }],
      },
    });
    mount(action, artifact(action, "swing-1"));
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit" }));

    await waitFor(() => expect(useCombatStore.getState().attacksUsed).toBe(1));
    expect(useCombatStore.getState().attackSwings).toEqual([
      { actionId: action.id, outcomeOccurrenceId: "swing-1" },
    ]);

    act(() => void useUndoStore.getState().undo());
    expect(useCombatStore.getState().attackSwings).toEqual([]);
    expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
    act(() => void useUndoStore.getState().redo());
    expect(useCombatStore.getState().attackSwings[0]?.outcomeOccurrenceId).toBe(
      "swing-1"
    );
    expect(useCombatStore.getState().outcomeReceipts[0]?.occurrenceId).toBe("swing-1");
  });

  it("binds a reaction to its exact occurrence through undo and redo", async () => {
    const action = testAction("deflect", "reaction");
    mount(action, artifact(action, "reaction-1"));
    fireEvent.click(screen.getByRole("button", { name: "Prepare" }));
    fireEvent.click(await screen.findByRole("button", { name: "Commit" }));

    await waitFor(() => expect(useCombatStore.getState().reactionUsed).toBe(true));
    expect(useCombatStore.getState().reactionOutcomeOccurrenceId).toBe("reaction-1");
    act(() => void useUndoStore.getState().undo());
    expect(useCombatStore.getState().reactionUsed).toBe(false);
    expect(useCombatStore.getState().outcomeReceipts).toEqual([]);
    act(() => void useUndoStore.getState().redo());
    expect(useCombatStore.getState().reactionOutcomeOccurrenceId).toBe("reaction-1");
    expect(useCombatStore.getState().outcomeReceipts[0]?.occurrenceId).toBe("reaction-1");
  });
});

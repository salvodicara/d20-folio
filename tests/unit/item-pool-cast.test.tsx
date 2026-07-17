/**
 * S9 — multi-spell item-cast: WIRING test (golden rule 13). An equipped, attuned
 * Wand of Binding surfaces a pool-picker card on the Play board; tapping it opens
 * the shared guided picker, and choosing a spell debits the item-charge tracker by
 * that spell's VARIABLE cost (Hold Person 2, Hold Monster 5) — with the undo toast
 * restoring EXACTLY that cost (not a hardcoded 1). Staff of Charming casts at the
 * uniform cost of 1. The engine facts are pinned by `item-pool-cast-actions.test.ts`
 * and the picker render/disable by `divine-intervention-modal.test.tsx`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
// PlayTab mounts the shared InitVital → combat-state-io → Firebase; mock it so the
// unit stays CI-pure (the env keys are unset in CI).
vi.mock("@/lib/firebase", () => ({}));
import { MemoryRouter } from "react-router";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { makeCharacterDoc } from "./_helpers";
import type { SrdEquipmentRef } from "@/types/character";

function loadWielder(refs: SrdEquipmentRef[]): void {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5, equipment: refs });
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

const used = (id: string): number =>
  useCharacterStore.getState().character?.session.trackers[id]?.used ?? 0;

function renderPage() {
  return render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <PlayTab />
      </TurnEconomyProvider>
      <ConfirmDialog />
    </MemoryRouter>
  );
}

/** Invoke the most recent toast's undo (mirrors cunning-strike-debit.test.tsx). */
function undoLastToast(): void {
  const toasts = useToastStore.getState().toasts;
  const toast = toasts[toasts.length - 1];
  if (!toast?.onUndo) throw new Error("no undo toast");
  toast.onUndo();
}

describe("S9 — multi-spell item-cast (shared charge pool)", () => {
  beforeEach(() => {
    useCharacterStore.setState({ character: null, loading: false, error: null });
    useUIStore.setState({ sheetMode: "play" });
    useToastStore.setState({ toasts: [], timers: {} });
    useCombatStore.setState({
      round: 1,
      initiative: "",
      selected: { action: [], bonus: [], free: [] },
      reactionUsed: false,
      movementUsedFt: 0,
      damageTakenThisRound: false,
    });
    useConfirmStore.setState({ open: false, options: null, _resolve: null });
  });

  it("Wand of Binding: casting Hold Person debits EXACTLY 2 charges, undo restores 2", async () => {
    loadWielder([
      { srdId: "wand-of-binding", equipped: true, attuned: true, quantity: 1 },
    ]);
    renderPage();

    // The pool-picker card surfaces under the item name; its CTA reads as a spell
    // cast FROM the item (not a bare "Use").
    const cta = await screen.findByLabelText("Cast a spell from Wand of Binding");
    expect(used("wand-of-binding")).toBe(0);

    // Tap → the shared guided picker opens with the item rubric + per-spell costs.
    fireEvent.click(cta);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/wand of binding/i)).toBeInTheDocument();

    // Choosing Hold Person (cost 2) debits exactly 2 charges.
    fireEvent.click(within(dialog).getByText("Hold Person"));
    await waitFor(() => expect(used("wand-of-binding")).toBe(2));

    // The undo toast restores EXACTLY the variable cost (2), not a hardcoded 1.
    undoLastToast();
    expect(used("wand-of-binding")).toBe(2 - 2);
  });

  it("Staff of Charming: a uniform-cost pick debits EXACTLY 1 charge", async () => {
    loadWielder([
      { srdId: "staff-of-charming", equipped: true, attuned: true, quantity: 1 },
    ]);
    renderPage();

    const cta = await screen.findByLabelText("Cast a spell from Staff of Charming");
    fireEvent.click(cta);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Charm Person"));
    await waitFor(() => expect(used("staff-of-charming")).toBe(1));

    undoLastToast();
    expect(used("staff-of-charming")).toBe(0);
  });
});

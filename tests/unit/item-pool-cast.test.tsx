/**
 * S9 — multi-spell item-cast: WIRING test (golden rule 13). An equipped, attuned
 * Wand of Binding surfaces a pool-picker card on the Play board; tapping it opens
 * the shared guided picker, and choosing a spell debits that physical item's pool by
 * that spell's VARIABLE cost (Hold Person 2, Hold Monster 5) — with the undo toast
 * restoring EXACTLY that cost (not a hardcoded 1). Staff of Charming casts at the
 * uniform cost of 1. The engine facts are pinned by `item-pool-cast-actions.test.ts`
 * and the picker render/disable by `divine-intervention-modal.test.tsx`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
const encounterMode = vi.hoisted(() => ({ active: false }));
// PlayTab mounts the shared InitVital → combat-state-io → Firebase; mock it so the
// unit stays CI-pure (the env keys are unset in CI).
vi.mock("@/lib/firebase", () => ({}));
vi.mock("@/features/character/center/turn-state", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/character/center/turn-state")>();
  return {
    ...actual,
    useSheetCombat: () => (encounterMode.active ? ({} as never) : null),
  };
});
vi.mock("@/features/character/center/CombatResolver", () => ({
  CombatResolver: ({
    action,
    onCommit,
    onDone,
  }: {
    action: { name: string; concentration: boolean; summary: { saveDC?: number } };
    onCommit: (apply: () => undefined) => void;
    onDone: () => void;
  }) => (
    <div role="dialog" aria-label={`Resolve ${action.name}`}>
      <span>{`DC ${action.summary.saveDC ?? "—"}`}</span>
      <span>{action.concentration ? "Concentration" : "No concentration"}</span>
      <button
        onClick={() => {
          onCommit(() => undefined);
          onDone();
        }}
      >
        Apply {action.name}
      </button>
    </div>
  ),
}));
import { MemoryRouter } from "react-router";
import { PlayTab } from "@/features/character/center/tabs/PlayTab";
import { ItemResourceCommandProvider } from "@/features/character/center/ItemResourceCommandProvider";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { useConfirmStore } from "@/stores/confirmStore";
import { useUndoStore } from "@/stores/undoStore";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { makeCharacterDoc } from "./_helpers";
import type { SrdEquipmentRef } from "@/types/character";

function loadWielder(refs: SrdEquipmentRef[], capacity: number): void {
  const doc = makeCharacterDoc({ classId: "fighter", level: 5, equipment: refs });
  const ref = refs[0];
  if (!ref?.instanceId) throw new Error("item-resource fixture needs an instance ID");
  doc.session.itemResources = {
    [ref.instanceId]: {
      itemId: ref.srdId,
      instanceId: ref.instanceId,
      revision: 0,
      resources: {
        charges: { capacity, current: capacity, disabled: false },
      },
      disposition: "magical",
      causalHead: null,
    },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

const currentCharges = (instanceId: string): number | undefined =>
  useCharacterStore.getState().character?.session.itemResources?.[instanceId]?.resources
    .charges?.current;

function replaceCharges(
  itemId: string,
  instanceId: string,
  capacity: number,
  current: number
): void {
  const character = useCharacterStore.getState().character;
  if (!character) throw new Error("character missing");
  const previous = character.session.itemResources?.[instanceId];
  useCharacterStore.getState().updateSession({
    itemResources: {
      ...character.session.itemResources,
      [instanceId]: {
        itemId,
        instanceId,
        revision: (previous?.revision ?? 0) + 1,
        resources: {
          charges: { capacity, current, disabled: false },
        },
        disposition: "magical",
        causalHead: null,
      },
    },
  });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ItemResourceCommandProvider>
        <TurnEconomyProvider>
          <PlayTab />
        </TurnEconomyProvider>
      </ItemResourceCommandProvider>
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
    encounterMode.active = false;
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
    useUndoStore.setState({ characterId: null, past: [], future: [] });
  });

  it("Wand of Binding: casting Hold Person debits EXACTLY 2 charges, undo restores 2", async () => {
    loadWielder(
      [
        {
          srdId: "wand-of-binding",
          instanceId: "wand-binding-copy",
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
      7
    );
    renderPage();

    // The pool-picker card surfaces under the item name; its CTA reads as a spell
    // cast FROM the item (not a bare "Use").
    const cta = await screen.findByLabelText("Cast a spell from Wand of Binding");
    // The card carries the magic-item-type seal medallion (the curated Folio
    // wand glyph since the icon-language unification), never a generic glyph.
    expect(cta.closest("article")?.querySelector("span.uc-seal svg")).not.toBeNull();
    expect(currentCharges("wand-binding-copy")).toBe(7);

    // Tap → the shared guided picker opens with the item rubric + per-spell costs.
    fireEvent.click(cta);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/wand of binding/i)).toBeInTheDocument();

    // Choosing Hold Person (cost 2) debits exactly 2 charges.
    fireEvent.click(within(dialog).getByText("Hold Person"));
    await waitFor(() => expect(currentCharges("wand-binding-copy")).toBe(5));
    expect(useCombatStore.getState().selected.action).toContainEqual(
      expect.objectContaining({ id: "spell-hold-person" })
    );
    expect(
      useCharacterStore.getState().character?.session.logEntries.at(-1)?.event
    ).toMatchObject({
      kind: "action-use",
      action: { srd: { kind: "spell", key: "hold-person", field: "name" } },
      slot: "action",
    });

    // The ONE undo restores the exact cost, economy claim, and structured spell log.
    undoLastToast();
    expect(currentCharges("wand-binding-copy")).toBe(7);
    expect(useCombatStore.getState().selected.action).toEqual([]);
    expect(useCharacterStore.getState().character?.session.logEntries ?? []).toEqual([]);

    // Redo revalidates the LIVE pool. If those charges were spent elsewhere after
    // undo, replay bails without overdrawing or resurrecting the action.
    replaceCharges("wand-of-binding", "wand-binding-copy", 7, 0);
    expect(useUndoStore.getState().redo()).toBe(false);
    expect(currentCharges("wand-binding-copy")).toBe(0);
    expect(useCombatStore.getState().selected.action).toEqual([]);
  });

  it("rejects a stale item-cast undo after its exact action owner is gone", async () => {
    loadWielder(
      [
        {
          srdId: "wand-of-binding",
          instanceId: "stale-binding-copy",
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
      7
    );
    renderPage();

    fireEvent.click(await screen.findByLabelText("Cast a spell from Wand of Binding"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Hold Person"));
    await waitFor(() => expect(currentCharges("stale-binding-copy")).toBe(5));

    // Another mutation removed the action that owns this undo. The old undo must
    // fail its ownership check instead of reversing target effects while leaving
    // the item's compare-and-swap spend in place.
    useCombatStore.getState().deselectAction("spell-hold-person");
    expect(useUndoStore.getState().undo()).toBe(false);
    expect(currentCharges("stale-binding-copy")).toBe(5);
    expect(useUndoStore.getState().past).toHaveLength(1);
  });

  it("Staff of Charming: a uniform-cost pick debits EXACTLY 1 charge", async () => {
    loadWielder(
      [
        {
          srdId: "staff-of-charming",
          instanceId: "charming-staff-copy",
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
      10
    );
    renderPage();

    const cta = await screen.findByLabelText("Cast a spell from Staff of Charming");
    fireEvent.click(cta);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Charm Person"));
    await waitFor(() => expect(currentCharges("charming-staff-copy")).toBe(9));

    undoLastToast();
    expect(currentCharges("charming-staff-copy")).toBe(10);
  });

  it("resolves the chosen spell and targets before spending in an encounter", async () => {
    encounterMode.active = true;
    loadWielder(
      [
        {
          srdId: "wand-of-binding",
          instanceId: "encounter-binding-copy",
          equipped: true,
          attuned: true,
          quantity: 1,
        },
      ],
      7
    );
    renderPage();

    fireEvent.click(await screen.findByLabelText("Cast a spell from Wand of Binding"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByText("Hold Person"));

    const resolver = await screen.findByRole("dialog", { name: "Resolve Hold Person" });
    expect(within(resolver).getByText("DC 17")).toBeInTheDocument();
    expect(within(resolver).getByText("Concentration")).toBeInTheDocument();
    expect(currentCharges("encounter-binding-copy")).toBe(7);
    expect(useCombatStore.getState().selected.action).toEqual([]);

    fireEvent.click(within(resolver).getByRole("button", { name: "Apply Hold Person" }));
    await waitFor(() => expect(currentCharges("encounter-binding-copy")).toBe(5));
    expect(useCombatStore.getState().selected.action).toContainEqual(
      expect.objectContaining({ id: "spell-hold-person" })
    );
  });
});

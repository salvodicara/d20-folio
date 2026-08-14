/**
 * S9 — Magic-item charge-cast: WIRING test (golden rule 13 — a thin render test
 * pins that the surface calls the engine + reflects its result; the engine facts
 * themselves are pinned by pure-function tests in `spell-cast-sources.test.ts` /
 * `turn-round-engine.test.ts` / `character-store.test.ts`).
 *
 * An injected character holding an equipped Wand of Magic Missiles (a charged
 * item carrying a `free-cast-spell` grant) surfaces a castable Magic Missile row
 * on the Play board; tapping it commits through the existing cast/cost flow and
 * DEBITS that physical wand's typed charge resource by the selected cast level —
 * with undo restoring the exact amount. The character has NO spell slots, so every
 * offered option comes from the wand.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
const encounterMode = vi.hoisted(() => ({ active: false }));
// PlayTab now mounts the shared InitVital (TB4) → `combat-state-io` → Firebase; mock the
// firebase module so this unit stays CI-pure (the env keys are unset in CI).
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
  }: {
    action: { name: string; summary: { attackBonus?: number } };
  }) => (
    <div role="dialog" aria-label={`Resolve ${action.name}`}>
      {`Attack +${action.summary.attackBonus ?? 0}`}
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
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { makeCharacterDoc } from "./_helpers";

const WAND_INSTANCE_ID = "wand-of-magic-missiles-copy";

/** A fighter (no spell slots) holding an equipped Wand of Magic Missiles. */
function loadWandWielder(): void {
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId: "wand-of-magic-missiles",
        instanceId: WAND_INSTANCE_ID,
        equipped: true,
        quantity: 1,
      },
    ],
  });
  doc.session.itemResources = {
    [WAND_INSTANCE_ID]: {
      itemId: "wand-of-magic-missiles",
      instanceId: WAND_INSTANCE_ID,
      revision: 0,
      resources: {
        charges: { capacity: 7, current: 7, disabled: false },
      },
      disposition: "magical",
      causalHead: null,
    },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

function loadCircletWielder(): void {
  const instanceId = "circlet-of-blasting-copy";
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      {
        srdId: "circlet-of-blasting",
        instanceId,
        equipped: true,
        quantity: 1,
      },
    ],
  });
  doc.session.itemResources = {
    [instanceId]: {
      itemId: "circlet-of-blasting",
      instanceId,
      revision: 0,
      resources: {
        uses: { capacity: 1, current: 1, disabled: false },
      },
      disposition: "magical",
      causalHead: null,
    },
  };
  useCharacterStore.setState({ character: doc, loading: false, error: null });
}

const charges = (): number =>
  useCharacterStore.getState().character?.session.itemResources?.[WAND_INSTANCE_ID]
    ?.resources.charges?.current ?? 0;

function renderPage() {
  return render(
    <MemoryRouter>
      <ItemResourceCommandProvider>
        <TurnEconomyProvider>
          <PlayTab />
        </TurnEconomyProvider>
        <ConfirmDialog />
      </ItemResourceCommandProvider>
    </MemoryRouter>
  );
}

describe("S9 — magic-item charge-cast (Wand of Magic Missiles)", () => {
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
  });

  it("casts Magic Missile at level 3 for 3 charges and undo restores all 3", async () => {
    loadWandWielder();
    renderPage();

    // The wand's granted spell surfaces as a Cast row on the Play board.
    const cta = await screen.findByLabelText("Cast: Magic Missile");
    expect(charges()).toBe(7);

    // Tap opens the shared level picker because this item permits levels 1–3.
    fireEvent.click(cta);
    const cost = await screen.findByText("3 ch.");
    const levelThree = cost.closest("button");
    if (!levelThree) throw new Error("level-3 item cast row is missing");
    fireEvent.click(levelThree);
    await waitFor(() => expect(charges()).toBe(4));
    expect(
      useCombatStore
        .getState()
        .selected.action.find((action) => action.id === "spell-magic-missile")?.cost
    ).toMatchObject({
      type: "tracker",
      key: `magic-item:${WAND_INSTANCE_ID}`,
      trackerAmount: 3,
    });

    // The committed card disables to "Used" (the CTA grammar); undo via the
    // act's live snackbar → the charge is restored.
    expect(screen.getByLabelText("Used: Magic Missile")).toBeDisabled();
    const toast = useToastStore.getState().toasts.find((t) => t.onUndo);
    expect(toast).toBeTruthy();
    act(() => toast?.onUndo?.());
    await waitFor(() => expect(charges()).toBe(7));
  });

  it("builds a fixed item cast with the source-defined attack bonus", async () => {
    encounterMode.active = true;
    loadCircletWielder();
    renderPage();

    fireEvent.click(await screen.findByLabelText("Cast: Scorching Ray"));
    const resolver = await screen.findByRole("dialog", {
      name: "Resolve Scorching Ray",
    });
    expect(resolver).toHaveTextContent("Attack +5");
  });
});

/**
 * RA-14 ammunition debit — `TurnEconomyProvider.commitAction` integration.
 *
 * A ranged weapon with the Ammunition property AND a matching tracked inventory
 * row debits ONE unit per attack commit (SRD "Ammunition": each attack expends
 * one piece), credited back exactly on undo (the inverse op — a weapon attack
 * carries no `costEquipment`, so this is the only restore path). A weapon with
 * no matching ammo row (an untracked bow, or a melee weapon) commits with NO
 * equipment mutation — tracking ammo is the player's choice (override-first).
 * Driven through the REAL provider on a built dev scenario (the engine stamps
 * `summary.ammo`; the provider owns the debit) — the wiring proof for the slice.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useEffect } from "react";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TurnEconomyProvider } from "@/features/character/center/TurnEconomyProvider";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { useToastStore } from "@/stores/toastStore";
import { useCombatStore } from "@/stores/combatStore";
import { localizeActions } from "@/lib/views/combat-action-view";
import { buildScenario, type ScenarioSpec } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";
import type { ResolvedAction } from "@/lib/smart-tracker";
import type { AbilityCode } from "@/data/types";

const S: Record<AbilityCode, number> = {
  STR: 10,
  DEX: 16,
  CON: 12,
  INT: 10,
  WIS: 12,
  CHA: 8,
};

let selectApi: ((action: ResolvedAction) => void) | null = null;
function SelectProbe() {
  const handleSelect = useTurnEconomy().handleSelect;
  useEffect(() => {
    selectApi = handleSelect;
  }, [handleSelect]);
  return null;
}

const spec: ScenarioSpec = {
  name: "Fletcher",
  raceId: "human",
  classId: "rogue",
  level: 3,
  background: "criminal",
  abilityScores: S,
  weapons: [
    { srdId: "shortbow", quantity: 1 },
    { srdId: "dagger", quantity: 1 },
  ],
  equipment: [{ srdId: "arrows", quantity: 18 }],
};

function mount(): void {
  const doc = buildScenario(spec);
  doc.session.logEntries = [];
  useCharacterStore.setState({ character: doc, loading: false, error: null });
  render(
    <MemoryRouter>
      <TurnEconomyProvider>
        <SelectProbe />
      </TurnEconomyProvider>
    </MemoryRouter>
  );
}

function currentDoc(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character loaded");
  return doc;
}

/** Total arrows in the inventory (summed, ammunition semantics). */
function arrowsQty(): number {
  return currentDoc().character.equipment.reduce(
    (sum, ref) =>
      !("custom" in ref) && ref.srdId === "arrows" ? sum + (ref.quantity ?? 1) : sum,
    0
  );
}

/** The live resolved weapon action, as PlayTab hands it to `handleSelect`. */
function weaponAction(id: string): ResolvedAction {
  const action = localizeActions(currentDoc(), "en").find((a) => a.id === id);
  if (!action) throw new Error(`no ${id} action`);
  return action;
}

/** Commit through the real provider (async — awaits the concentration gate). */
async function commit(action: ResolvedAction): Promise<void> {
  if (!selectApi) throw new Error("handleSelect not wired");
  const fn = selectApi;
  await act(async () => {
    fn(action);
    // Flush the async commit path (it awaits the concentration-break gate before
    // the debit fires) so the mutation has landed by the time act() resolves.
    await Promise.resolve();
  });
}

function fireLastUndo(): void {
  const toasts = useToastStore.getState().toasts;
  const toast = toasts[toasts.length - 1];
  if (!toast?.onUndo) throw new Error("no undo toast");
  const undo = toast.onUndo;
  act(() => undo());
}

beforeEach(() => {
  selectApi = null;
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
});

describe("RA-14 — commitAction debits tracked ammunition", () => {
  it("the engine stamps summary.ammo on the tracked ranged weapon", () => {
    mount();
    expect(weaponAction("weapon-shortbow").summary.ammo).toEqual({
      itemId: "arrows",
      remaining: 18,
    });
  });

  it("committing a ranged attack decrements the matching ammo row by exactly 1", async () => {
    mount();
    expect(arrowsQty()).toBe(18);

    await commit(weaponAction("weapon-shortbow"));

    expect(arrowsQty()).toBe(17);
  });

  it("undo credits the exact fired unit back", async () => {
    mount();
    await commit(weaponAction("weapon-shortbow"));
    expect(arrowsQty()).toBe(17);

    fireLastUndo();
    expect(arrowsQty()).toBe(18);
  });

  it("a melee attack (no ammo) commits with NO equipment mutation", async () => {
    mount();
    expect(weaponAction("weapon-dagger").summary.ammo).toBeUndefined();

    await commit(weaponAction("weapon-dagger"));

    // The quiver is untouched — only the fired ranged weapon debits.
    expect(arrowsQty()).toBe(18);
  });
});

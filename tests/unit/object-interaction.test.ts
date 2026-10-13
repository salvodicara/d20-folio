/**
 * The free object interaction (SRD 5.2.1 "Interacting with Things"): one object a
 * turn is free; another in the same turn takes the Utilize action. The cases come
 * from the base-action table itself: every base action that declares a repeat
 * cost is checked, through the resolved board row and the turn's economy slot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { BASE_ACTIONS } from "@/lib/smart-tracker";
import { repeatUseCost } from "@/lib/play/object-interaction";
import { baseActionName, localizeActions } from "@/lib/views/combat-action-view";
import { getEconomySlot } from "@/features/character/center/useTurnEconomy";
import { useCombatStore } from "@/stores/combatStore";
import { MOCK_CHARACTER } from "@/lib/mock";

const ONCE_FREE = BASE_ACTIONS.filter((action) => action.repeatUseCosts !== undefined);

beforeEach(() =>
  useCombatStore.setState({ selected: { action: [], bonus: [], free: [] } })
);

describe("once-free base actions", () => {
  it("the table has the object interaction, costing Utilize after the first", () => {
    expect(ONCE_FREE.map((a) => [a.id, a.repeatUseCosts])).toEqual([
      ["base-object-interaction", "base-utilize"],
    ]);
  });

  it.each(ONCE_FREE.map((a) => [a.id, a] as const))(
    "%s: free, and its repeat cost is a real Action on the board",
    (_id, base) => {
      expect(base.type).toBe("free");
      const cost = BASE_ACTIONS.find((a) => a.id === base.repeatUseCosts);
      expect(cost?.type).toBe("action");
      expect(baseActionName(base.repeatUseCosts ?? "", "it")).toBe(cost?.name.it);
      expect(baseActionName(base.repeatUseCosts ?? "", "en")).toBe(cost?.name.en);
    }
  );

  it.each(ONCE_FREE.map((a) => [a.id, a] as const))(
    "%s: once per turn in the free slot, a second use names its cost, a new turn reopens it",
    (id, base) => {
      const row = localizeActions(MOCK_CHARACTER, "it").find((a) => a.id === id);
      expect(row?.type).toBe("free");
      expect(row?.repeatUseCosts).toBe(base.repeatUseCosts);
      if (!row) return;
      const slot = getEconomySlot(row);
      expect(slot).toBe("free");
      const commit = () =>
        useCombatStore.getState().selectAction({ id: row.id, name: row.id, slot });
      const used = () =>
        useCombatStore.getState().selected.free.some((entry) => entry.id === row.id);

      expect(repeatUseCost(row, used())).toBeNull();
      expect(commit()).toBe(true);
      expect(commit()).toBe(false);
      expect(repeatUseCost(row, used())).toBe(base.repeatUseCosts);

      useCombatStore.getState().resetTurn();
      expect(repeatUseCost(row, used())).toBeNull();
      expect(commit()).toBe(true);
    }
  );

  it("an action without the rule never names a cost", () => {
    for (const base of BASE_ACTIONS.filter((a) => a.repeatUseCosts === undefined)) {
      expect(repeatUseCost(base, true)).toBeNull();
    }
  });
});

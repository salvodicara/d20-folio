/**
 * «Use your action: repeat the save» (Otto's Irresistible Dance, #748): the dancer
 * may spend its action to repeat the WIS save. Saved ends the Charmed effect (undo
 * reinstates it under the v0.26 rules); either way, on Play, the action is spent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const io = vi.hoisted(() => ({
  revokePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  reinstatePersistentCombatEffect: vi.fn(() => Promise.resolve()),
  appendPersistentCombatEffect: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/features/campaigns/campaign-io", () => io);
vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
vi.mock("@/lib/deployed-rules", () => ({ combatEffectsV26On: () => true }));

import { ActionRepeatSaves } from "@/domains/combat/ui/ActionRepeatSaves";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";

const dance: CombatEffectOp = {
  id: "op-dance",
  kind: "apply",
  effect: {
    id: "dance-1",
    actor: { kind: "pc", combatantId: "pc-bard", memberUid: "u", characterId: "c" },
    target: { kind: "pc", combatantId: "pc-me", memberUid: "me", characterId: "c2" },
    source: {
      kind: "spell",
      id: "ottos-irresistible-dance",
      actionId: "cast",
      castLevel: 6,
    },
    payload: { kind: "condition", conditionId: "charmed" },
    bindings: { saveDc: 15 },
    duration: { kind: "encounter" },
  },
};

describe("ActionRepeatSaves", () => {
  beforeEach(() => {
    io.revokePersistentCombatEffect.mockClear();
    io.reinstatePersistentCombatEffect.mockClear();
    useToastStore.setState({ toasts: [] });
    useCombatStore.getState().deselectSlot("action");
  });

  const mount = () =>
    render(
      <ActionRepeatSaves
        campaignId="c1"
        effectOps={[dance]}
        targetId="pc-me"
        locale="en"
        spendAction
      />
    );

  it("offers the repeat save with its DC", () => {
    mount();
    expect(
      screen.getByText("Use your action: repeat the Wisdom save (DC 15) against Charmed.")
    ).toBeTruthy();
  });

  it("saved: ends the condition and spends the action; undo puts both back", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Saved: end it" }));
    await waitFor(() =>
      expect(io.revokePersistentCombatEffect).toHaveBeenCalledWith("c1", "dance-1")
    );
    const action = () => useCombatStore.getState().selected.action;
    expect(action().map((a: { id: string }) => a.id)).toEqual(["repeat-save:dance-1"]);
    useToastStore.getState().toasts[0]?.onUndo?.();
    await waitFor(() =>
      expect(io.reinstatePersistentCombatEffect).toHaveBeenCalledWith("c1", "dance-1")
    );
    expect(action()).toEqual([]);
  });

  it("failed: the condition stays, the action is spent", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Failed: it stays" }));
    expect(io.revokePersistentCombatEffect).not.toHaveBeenCalled();
    expect(
      useCombatStore.getState().selected.action.map((a: { id: string }) => a.id)
    ).toEqual(["repeat-save:dance-1"]);
    // the action is gone: no second try this turn
    expect(screen.queryByRole("button", { name: "Failed: it stays" })).toBeNull();
  });

  it("nothing to offer someone else", () => {
    const { container } = render(
      <ActionRepeatSaves
        campaignId="c1"
        effectOps={[dance]}
        targetId="pc-bard"
        locale="en"
      />
    );
    expect(container.textContent).toBe("");
  });
});

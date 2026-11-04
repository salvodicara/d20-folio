/**
 * «Rianima» on a fallen companion (Beast Master, Steel Defender): a tap on a slot
 * spends it and brings the companion back, with one undo for both; a revive the
 * engine refuses gives the slot back. No slot left: it says so.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { PlayCompanion } from "@/domains/play/play-companions-view";
import { ReviveRow } from "@/domains/play/ui/PlayCompanions";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

const beast: PlayCompanion = {
  key: "primal-companion",
  name: "Bestia della Terra",
  spellId: null,
  hp: { current: 0, max: 20 },
  ac: 13,
  fallen: true,
  attacks: [],
};
const revive = {
  slots: [
    { level: 1, pact: false },
    { level: 2, pact: false },
  ],
  returnsAfterMinutes: 1,
};

describe("ReviveRow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useToastStore.setState({ toasts: [] });
  });

  it("spends the slot and revives, with one undo for both", () => {
    const refund = vi.fn();
    const unrevive = vi.fn();
    const dispatch = vi.fn((e: { kind: string }) =>
      e.kind === "spend-slot" ? refund : unrevive
    );
    useCharacterStore.setState({ dispatch: dispatch as never });
    render(<ReviveRow companion={beast} revive={revive} readonly={false} />);
    expect(screen.getByText(/returns after 1 min/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Level 2 slot" }));
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual([
      { kind: "spend-slot", level: 2, pactMagic: false },
      { kind: "revive-companion", sourceId: "primal-companion" },
    ]);
    const toast = useToastStore.getState().toasts[0];
    expect(toast?.message).toBe("Bestia della Terra comes back to life");
    toast?.onUndo?.();
    expect(unrevive).toHaveBeenCalledOnce();
    expect(refund).toHaveBeenCalledOnce();
  });

  it("gives the slot back when the revive is refused", () => {
    const refund = vi.fn();
    const dispatch = vi.fn((e: { kind: string }) =>
      e.kind === "spend-slot" ? refund : null
    );
    useCharacterStore.setState({ dispatch: dispatch as never });
    render(<ReviveRow companion={beast} revive={revive} readonly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Level 1 slot" }));
    expect(refund).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("says so when no slot is left", () => {
    render(
      <ReviveRow companion={beast} revive={{ ...revive, slots: [] }} readonly={false} />
    );
    expect(screen.getByText("You have no spell slot left to spend.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("past the limit: says how long ago, and offers no slot", () => {
    render(
      <ReviveRow
        companion={beast}
        revive={{
          ...revive,
          window: { fallenMinutes: 75, withinMinutes: 60, within: false },
        }}
        readonly={false}
      />
    );
    expect(
      screen.getByText("Too late: it fell 75 min ago (the limit is 60 min).")
    ).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("in time: says how long ago, and offers the slots", () => {
    render(
      <ReviveRow
        companion={beast}
        revive={{
          ...revive,
          window: { fallenMinutes: 12, withinMinutes: 60, within: true },
        }}
        readonly={false}
      />
    );
    expect(screen.getByText("In time: it fell 12 min ago, limit 60 min.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Level 1 slot" })).toBeTruthy();
  });

  it("time unknown: says so, and still offers the slots", () => {
    render(
      <ReviveRow
        companion={beast}
        revive={{
          ...revive,
          window: { fallenMinutes: null, withinMinutes: 60, within: null },
        }}
        readonly={false}
      />
    );
    expect(
      screen.getByText("Time of the fall unknown: the limit is 60 min.")
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Level 1 slot" })).toBeTruthy();
  });
});

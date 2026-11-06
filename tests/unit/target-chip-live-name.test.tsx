/**
 * The cast dialog's «On whom?» names an ally even when the dialog opened before that
 * ally's sheet had loaded (a fresh session): the chip reads the name from the live
 * fight, not from the snapshot taken when the dialog opened (rehearsal 2026-11-06, #3).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { PlayPrompts } from "@/domains/play/ui/PlayPrompts";
import { usePlayPromptStore } from "@/features/character/center/playPromptStore";
import { useCombatStatusStore } from "@/features/campaigns/global-combat-context";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";

const fight = (allyName: string) =>
  ({
    campaignId: "c1",
    myId: "pc-me",
    view: {
      rows: [
        { id: "pc-me", kind: "pc", side: "ally", name: "Mandorlino" },
        { id: "pc-ally", kind: "pc", side: "ally", name: allyName },
      ],
    },
  }) as unknown as GlobalCombat;

afterEach(() => {
  usePlayPromptStore.setState({ open: {} });
  useCombatStatusStore.setState({ status: null });
});

describe("the cast dialog's ally chip", () => {
  it("shows the ally's name once the fight has it, though the dialog opened without it", () => {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
    useCombatStatusStore.setState({ status: fight("") });
    usePlayPromptStore.setState({
      open: {
        target: {
          request: {
            // the chips are the same for a spell; a plain action skips the hands note
            actionName: "Bless",
            isSpell: false,
            step: {
              max: 2,
              candidates: [
                { id: "pc-me", name: "Mandorlino", side: "ally", self: true },
                { id: "pc-ally", name: "", side: "ally", self: false },
              ],
            },
          },
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        },
      },
    } as never);
    render(<PlayPrompts locale="en" />);
    act(() => useCombatStatusStore.setState({ status: fight("Catalion") }));
    expect(screen.getByRole("button", { name: "Catalion" })).toBeTruthy();
  });
});

/**
 * The helped ally's sheet (SRD 5.2.1 Help on an ability check): while Help's
 * Advantage waits on its next check, the sheet says so, and «Used» spends it —
 * the effect is revoked, with an undo that reinstates it. Nothing shows for the
 * helper, or for the attack form.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { revokeMock, reinstateMock } = vi.hoisted(() => ({
  revokeMock: vi.fn(() => Promise.resolve()),
  reinstateMock: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/campaign-io", () => ({
  revokePersistentCombatEffect: revokeMock,
  reinstatePersistentCombatEffect: reinstateMock,
}));

import { HelpedCheck } from "@/domains/combat/ui/HelpedCheck";
import { helpEffect } from "@/features/character/center/outcome-offer";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";

const pc = (id: string) => ({
  kind: "pc" as const,
  combatantId: `pc-${id}`,
  memberUid: id,
  characterId: `c-${id}`,
});
const apply = (form: "attack" | "check"): CombatEffectOp => ({
  id: `op-${form}`,
  kind: "apply",
  effect: helpEffect({
    helper: pc("me"),
    enemy: pc("ally"),
    round: 2,
    effectId: `fx-${form}`,
    form,
  }),
});

afterEach(() => {
  revokeMock.mockClear();
  reinstateMock.mockClear();
});

describe("HelpedCheck", () => {
  it("names the Advantage on the helped ally's sheet; «Used» spends it, undo restores it", () => {
    render(
      <HelpedCheck campaignId="camp" effectOps={[apply("check")]} targetId="pc-ally" />
    );
    expect(
      screen.getByText("An ally is helping you: Advantage on your next ability check.")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Used" }));
    expect(revokeMock).toHaveBeenCalledWith("camp", "fx-check");
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.message).toBe("Help’s Advantage used");
    act(() => toast?.onUndo?.());
    expect(reinstateMock).toHaveBeenCalledWith("camp", "fx-check");
  });

  it("shows nothing to the helper, nor for the attack form", () => {
    const { container } = render(
      <>
        <HelpedCheck campaignId="camp" effectOps={[apply("check")]} targetId="pc-me" />
        <HelpedCheck campaignId="camp" effectOps={[apply("attack")]} targetId="pc-ally" />
      </>
    );
    expect(container.textContent).toBe("");
  });
});

/**
 * The next-attack note (new UI): a creature whose own next attack roll has
 * Disadvantage from a state on it (Ray of Enfeeblement on a success, SRD 5.2.1: "the
 * target has Disadvantage on the next attack roll it makes until the start of your
 * next turn"). The player's Play screen says it for their character; the DM's fight
 * screen for a monster. «Used» spends it once the attack is rolled at the table, with
 * an undo. The pattern is Help's «Usato» note (HelpedCheck).
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

import i18n from "@/i18n";
import { NextAttackNotes } from "@/domains/combat/ui/NextAttackNote";
import { nextAttackNotes } from "@/domains/combat/next-attack-note-view";
import { useToastStore } from "@/stores/toastStore";
import type { CombatEffectOp } from "@/types/combat-effect";

const rider = (target: string, id = `fx-${target}`): CombatEffectOp => ({
  id: `op-${id}`,
  kind: "apply",
  effect: {
    id,
    actor: { kind: "pc", combatantId: "pc-wiz", memberUid: "wiz", characterId: "c-wiz" },
    target: target.startsWith("pc-")
      ? { kind: "pc", combatantId: target, memberUid: "me", characterId: "c-me" }
      : { kind: "monster", combatantId: target },
    source: { kind: "spell", id: "ray-of-enfeeblement", actionId: "x" },
    payload: { kind: "grant-group", activeKey: "ray-of-enfeeblement-next-attack" },
    duration: {
      kind: "turn-boundary",
      combatantId: "pc-wiz",
      round: 3,
      phase: "turn-start",
    },
  },
});
const weakened: CombatEffectOp = {
  id: "op-weak",
  kind: "apply",
  effect: {
    id: "weak",
    actor: { kind: "pc", combatantId: "pc-wiz", memberUid: "wiz", characterId: "c-wiz" },
    target: { kind: "monster", combatantId: "goblin-b" },
    source: { kind: "spell", id: "ray-of-enfeeblement", actionId: "x" },
    payload: { kind: "grant-group", activeKey: "spell-ray-of-enfeeblement" },
    duration: {
      kind: "concentration",
      actorId: "pc-wiz",
      sourceId: "ray-of-enfeeblement",
    },
  },
};

afterEach(() => {
  revokeMock.mockClear();
  reinstateMock.mockClear();
});

describe("nextAttackNotes", () => {
  it("one note per creature with a one-shot state; a lasting one is not one", () => {
    expect(
      nextAttackNotes([rider("goblin-a"), weakened], ["goblin-a", "goblin-b"])
    ).toEqual([
      {
        targetId: "goblin-a",
        mode: "disadvantage",
        sources: [{ kind: "spell", id: "ray-of-enfeeblement" }],
        effectIds: ["fx-goblin-a"],
      },
    ]);
  });
});

describe("NextAttackNotes", () => {
  it("the player's sheet says it; «Used» spends it, undo restores it", async () => {
    await i18n.changeLanguage("en");
    render(
      <NextAttackNotes
        campaignId="camp"
        effectOps={[rider("pc-me")]}
        targetIds={["pc-me"]}
        locale="en"
      />
    );
    expect(
      screen.getByText("Disadvantage on your next attack roll (Ray of Enfeeblement).")
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Used" }));
    expect(revokeMock).toHaveBeenCalledWith("camp", "fx-pc-me");
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.message).toBe("Used: Disadvantage");
    act(() => toast?.onUndo?.());
    expect(reinstateMock).toHaveBeenCalledWith("camp", "fx-pc-me");
  });

  it("the DM reads it on the monster, in Italian", async () => {
    await i18n.changeLanguage("it");
    render(
      <NextAttackNotes
        campaignId="camp"
        effectOps={[rider("goblin-a")]}
        targetIds={["goblin-a"]}
        nameOf={() => "Goblin"}
        locale="it"
      />
    );
    expect(
      screen.getByText(
        "Goblin: Svantaggio al suo tiro per colpire successivo (Raggio di Affaticamento)."
      )
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Usato" })).toBeTruthy();
    await i18n.changeLanguage("en");
  });

  it("shows nothing without the state", () => {
    const { container } = render(
      <NextAttackNotes
        campaignId="camp"
        effectOps={[weakened]}
        targetIds={["goblin-b"]}
        locale="en"
      />
    );
    expect(container.textContent).toBe("");
  });
});

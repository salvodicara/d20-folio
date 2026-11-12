/**
 * The new UI's fight pip in the top bar: nothing outside a fight; during one, the round
 * and whose turn it is (its drawing loads lazily, so the frame paints every other screen
 * without the fight rows behind it), and a tap opens my character's Play screen.
 */
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";

import { CombatPip } from "@/domains/combat/ui/CombatPip";
import { useCombatStatusStore } from "@/features/campaigns/combat-status-store";
import type { GlobalCombat } from "@/features/campaigns/global-combat-context";
import i18n from "@/i18n";

const ME = "pc-user";
/** The drawing is a lazy chunk: its first import can take a while on a busy machine. */
const LAZY = { timeout: 5000 };

function fight(current: string): GlobalCombat {
  return {
    campaignId: "campaign-1",
    characterId: "test-char",
    myId: ME,
    round: 3,
    gathering: false,
    isMyTurn: current === ME,
    initiativeBonus: 2,
    initiativeRoll: 12,
    encounter: {
      combatants: [
        { kind: "pc", id: ME, memberUid: "user", characterId: "test-char" },
        {
          kind: "monster",
          id: "monster-1",
          name: "Goblin",
          ac: 13,
          initiative: 10,
          conditions: [],
          hp: { current: 7, temp: 0, max: 7 },
        },
      ],
      nextMonsterOrdinal: 2,
      round: 3,
      currentCombatantId: current,
      order: [ME, "monster-1"],
      epoch: 9,
      status: "active",
    },
    view: {
      rows: [
        { id: ME, kind: "pc", name: "Hero", conditions: [] },
        { id: "monster-1", kind: "monster", name: "Goblin", conditions: [] },
      ],
      turnOrderIds: [ME, "monster-1"],
      currentId: current,
    } as unknown as GlobalCombat["view"],
  };
}

const show = () =>
  render(
    <MemoryRouter>
      <CombatPip />
    </MemoryRouter>
  );

afterEach(() => {
  act(() => useCombatStatusStore.getState().set(null, null));
});

describe("the new UI's fight pip", () => {
  it("shows nothing outside a fight", () => {
    const { container } = show();
    expect(container).toBeEmptyDOMElement();
  });

  it("during a fight, says whose turn it is and opens my Play screen", async () => {
    await i18n.changeLanguage("en");
    act(() => useCombatStatusStore.getState().set(fight("monster-1"), null));
    show();
    const pip = await screen.findByRole("link", {}, LAZY);
    expect(pip).toHaveAttribute("href", "/characters/test-char");
    expect(pip).toHaveAccessibleName(
      i18n.t("play.pip.theirs", { round: 3, name: "Goblin" })
    );
  });

  it("marks my own turn", async () => {
    act(() => useCombatStatusStore.getState().set(fight(ME), null));
    show();
    expect(await screen.findByRole("link", {}, LAZY)).toHaveAttribute(
      "data-mine",
      "true"
    );
  });
});

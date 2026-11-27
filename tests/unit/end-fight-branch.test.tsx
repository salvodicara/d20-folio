/**
 * Who gets the write-up on «Fine scontro» (coordinator, 2026-11-26): the DM's end
 * opens the end-of-fight write-up and ends nothing yet; a player's ends the fight at
 * once and writes no chapter.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
// The campaign's effects out of a fight are read live; this test needs none.
vi.mock("@/features/campaigns/campaign-effects-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-effects-io")>()),
  subscribeCampaignEffects: () => () => undefined,
}));
const saveFight = vi.fn(() => Promise.resolve());
vi.mock("@/domains/combat/fight-write-up", () => ({
  inferOutcome: () => "victory",
  endFightWithChapter: () => saveFight(),
  fightChapterClose: () => ({ chapter: "", note: "", outcome: "victory" }),
}));
const endMove = vi.fn(() => Promise.resolve(null));
vi.mock("@/features/campaigns/combat-lifecycle-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/combat-lifecycle-io")>()),
  endCombatNow: () => endMove(),
}));
vi.mock("@/features/campaigns/useSessionLog", () => ({
  useSessionLog: () => ({ entries: [], append: () => Promise.resolve() }),
}));

import { useEndFight } from "@/domains/combat/ui/use-end-fight";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const campaign = {
  id: "camp",
  dmUid: "dm",
  members: ["dm", "ana"],
  memberDetails: {},
} as unknown as CampaignDoc;
const encounter = { epoch: 3, combatants: [], round: 2 } as unknown as EncounterState;

describe("«Fine scontro»", () => {
  beforeEach(() => {
    saveFight.mockClear();
    endMove.mockClear();
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.open = true;
    };
  });

  const hook = (uid: string, endNow = vi.fn()) => ({
    endNow,
    ...renderHook(() =>
      useEndFight(campaign, encounter, uid, uid === "dm", "en", () => {}, endNow)
    ),
  });

  it("the DM's end opens the write-up and ends nothing yet", () => {
    const { result, endNow } = hook("dm");
    act(() => result.current.end());
    expect(endNow).not.toHaveBeenCalled();
    expect(endMove).not.toHaveBeenCalled();
    render(<>{result.current.dialog}</>);
    expect(
      screen.getByRole("dialog", { name: "Save this fight to the Chronicle" })
    ).toBeInTheDocument();
  });

  it("a player's end ends the fight at once, with no write-up and no chapter", () => {
    const { result, endNow } = hook("ana");
    act(() => result.current.end("idle"));
    expect(endNow).toHaveBeenCalledWith("idle");
    expect(result.current.dialog).toBeFalsy();
    expect(saveFight).not.toHaveBeenCalled();
  });
});

/**
 * The end-of-fight write-up on the new fight screen (headless), from the classic «Save
 * this fight to the Chronicle» dialog: the outcome it guesses, the chapter built from
 * the title (the date when left blank), the note and the record lines the DM kept, and
 * the save (the session report keeps the note and outcome; a refused save keeps the
 * fight running for a retry).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const io = vi.hoisted(() => ({ appendChronicleChapter: vi.fn(() => Promise.resolve()) }));
vi.mock("@/features/campaigns/campaign-io", () => io);

import { fightChapterClose, saveFightToChronicle } from "@/domains/combat/fight-write-up";
import { useToastStore } from "@/stores/toastStore";

const t = ((key: string, args?: { date?: string; n?: number }) =>
  args?.date
    ? `${key}:${args.date}`
    : args?.n !== undefined
      ? `${key}:${args.n}`
      : key) as unknown as TFunction;

const lines = [
  { id: "1", round: 1, text: "Ana hits the goblin for 6" },
  { id: "2", round: 1, text: "The goblin misses" },
  { id: "3", round: 2, text: "Ana drops the goblin" },
];

beforeEach(() => vi.clearAllMocks());

describe("fightChapterClose", () => {
  it("the kept lines by round, the note under the title", () => {
    const close = fightChapterClose(
      {
        title: "The ambush",
        note: " Close call. ",
        lines,
        removed: new Set(["2"]),
        outcome: "victory",
      },
      t,
      "10 Nov 2026"
    );
    expect(close.note).toBe("Close call.");
    expect(close.outcome).toBe("victory");
    expect(close.chapter).toContain("## The ambush");
    expect(close.chapter).toContain("Close call.");
    expect(close.chapter).toContain("- Ana drops the goblin");
    expect(close.chapter).not.toContain("misses");
  });

  it("a blank title takes the date", () => {
    const close = fightChapterClose(
      { title: "  ", note: "", lines: [], removed: new Set(), outcome: "ended" },
      t,
      "10 Nov 2026"
    );
    expect(close.chapter).toContain("## combatChronicle.endTitlePlaceholder:10 Nov 2026");
  });
});

describe("saveFightToChronicle", () => {
  const close = { chapter: "## X", note: "n", outcome: "victory" as const };

  it("appends the chapter, writes the session report, says so", async () => {
    const writeLog = vi.fn();
    await saveFightToChronicle(
      { campaignId: "camp", uid: "dm", encounterId: "e1", close, writeLog },
      t
    );
    expect(io.appendChronicleChapter).toHaveBeenCalledWith("camp", {
      chapter: "## X",
      editedBy: "dm",
    });
    expect(writeLog).toHaveBeenCalledTimes(1);
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      "combatChronicle.savedToast"
    );
  });

  it("a refused save rejects, so the fight keeps running for a retry", async () => {
    io.appendChronicleChapter.mockRejectedValueOnce(new Error("offline"));
    await expect(
      saveFightToChronicle(
        { campaignId: "camp", uid: "dm", encounterId: "e1", close, writeLog: vi.fn() },
        t
      )
    ).rejects.toThrow("offline");
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe(
      "combatChronicle.saveFailedToast"
    );
  });
});

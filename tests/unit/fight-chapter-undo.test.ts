/**
 * End a fight with its chapter, undo, end again: the Chronicle holds exactly ONE chapter
 * for that fight (coordinator, 2026-11-26). The end's undo reopens the fight and takes
 * back the chapter this end wrote, and nothing else: the Chronicle is live data, so the
 * removal matches only the exact text this end appended (its last copy, as a whole
 * block), and leaves the text alone when it is no longer there.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TFunction } from "i18next";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: false }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

// The shared Chronicle text, in memory, behind campaign-io's two writes.
const chronicle = vi.hoisted(() => ({ text: "" }));
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/campaigns/campaign-io")>();
  return {
    ...real,
    appendChronicleChapter: (_id: string, a: { chapter: string }) => {
      chronicle.text = real.joinChronicleText(chronicle.text, a.chapter);
      return Promise.resolve();
    },
    removeChronicleChapter: (_id: string, a: { chapter: string }) => {
      const next = real.withoutChronicleChapter(chronicle.text, a.chapter);
      if (next === null) return Promise.resolve(false);
      chronicle.text = next;
      return Promise.resolve(true);
    },
  };
});
// The fight's end and reopen, as plain moves.
const fight = vi.hoisted(() => ({ running: true }));
vi.mock("@/features/campaigns/combat-lifecycle-io", () => ({
  endCombatNow: () => {
    if (!fight.running) return Promise.resolve(null);
    fight.running = false;
    return Promise.resolve(() => {
      fight.running = true;
      return Promise.resolve(true);
    });
  },
}));

import { withoutChronicleChapter } from "@/features/campaigns/campaign-io";
import { endFightWithChapter } from "@/domains/combat/fight-write-up";

const t = ((key: string) => key) as unknown as TFunction;
const close = {
  chapter: "## The bridge\n\n- Ana hits\n\n_won_",
  note: "",
  outcome: "victory" as const,
};
const end = () =>
  endFightWithChapter(
    { campaignId: "camp", uid: "dm", encounterId: "3", close, writeLog: () => {} },
    t
  );
const copies = () => chronicle.text.split("## The bridge").length - 1;

beforeEach(() => {
  chronicle.text = "# Session 1\n\nThe party set out.";
  fight.running = true;
});

describe("end → undo → end", () => {
  it("leaves exactly one chapter, and the rest of the Chronicle as it was", async () => {
    const undo = await end();
    expect(copies()).toBe(1);
    expect(await undo?.()).toBe(true);
    expect(fight.running).toBe(true);
    expect(chronicle.text).toBe("# Session 1\n\nThe party set out.");
    await end();
    expect(copies()).toBe(1);
    expect(chronicle.text.startsWith("# Session 1\n\nThe party set out.")).toBe(true);
  });
});

describe("withoutChronicleChapter", () => {
  const ch = "## The bridge\n\n- Ana hits";

  it("takes out only the last whole copy of that exact chapter", () => {
    expect(withoutChronicleChapter(`intro\n\n${ch}\n\n## Later\n\nmore`, ch)).toBe(
      "intro\n\n## Later\n\nmore"
    );
    expect(withoutChronicleChapter(`${ch}\n\n${ch}`, ch)).toBe(ch);
    expect(withoutChronicleChapter(ch, ch)).toBe("");
  });

  it("never touches text that only contains it, or a chapter edited since", () => {
    expect(withoutChronicleChapter(`intro\n\n${ch} and more`, ch)).toBeNull();
    expect(
      withoutChronicleChapter("intro\n\n## The bridge\n\n- Ana hits hard", ch)
    ).toBeNull();
    expect(withoutChronicleChapter("", ch)).toBeNull();
  });
});

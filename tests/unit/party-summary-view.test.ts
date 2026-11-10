/**
 * The DM's party summary on the new campaign screen (headless), from the classic DM tab:
 * every attached hero on one row (AC, HP, passives, saves), the best of each column
 * marked, and how many sheets are still loading.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { partyMemberRefs, partySummaryView } from "@/domains/campaign/party-summary-view";
import type { MemberDocState } from "@/features/campaigns/useMemberCharacterDocs";
import type { CampaignDoc } from "@/types/campaign";
import { makeCharacterDoc } from "./_helpers";

const campaign = {
  id: "camp-1",
  dmUid: "dm",
  memberDetails: {
    dm: { displayName: "Dana", characterId: null, role: "dm" },
    a: {
      displayName: "Ann",
      characterId: "c-a",
      role: "player",
      character: { name: "Arwen" },
    },
    b: { displayName: "Ben", characterId: "c-b", role: "player" },
    c: { displayName: "Cy", characterId: "c-c", role: "player" },
  },
} as unknown as CampaignDoc;

const sheet = (name: string, WIS: number) =>
  makeCharacterDoc({
    name,
    classes: [{ classId: "fighter", level: 1 }],
    abilityScores: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS, CHA: 10 },
  });

describe("partySummaryView", () => {
  it("one ref per member with a character; the DM without one is left out", () => {
    expect(partyMemberRefs(campaign)).toEqual([
      { uid: "a", characterId: "c-a" },
      { uid: "b", characterId: "c-b" },
      { uid: "c", characterId: "c-c" },
    ]);
  });

  it("rows by the snapshot's name, the best Perception marked, one sheet still loading", () => {
    const docs: Record<string, MemberDocState> = {
      a: { status: "ready", doc: sheet("Arwen (old)", 16) },
      b: { status: "ready", doc: sheet("Brom", 10) },
      c: { status: "loading" },
    };
    const view = partySummaryView(campaign, docs);
    expect(view.rows.map((r) => r.name)).toEqual(["Arwen", "Brom"]);
    expect(view.loading).toBe(1);
    expect([...view.best.passivePerception]).toEqual(["a"]);
  });

  it("no campaign: nothing to show", () => {
    expect(partySummaryView(null, {})).toMatchObject({ rows: [], loading: 0 });
  });
});

/**
 * The new campaign Gruppo panel (approved prototype camp-group, 2026-11-02): one row per
 * character with name, class line, player, HP, AC and passive Perception, plus a chip for
 * Concentration and one per condition. Live numbers come from the member's hydrated
 * character doc (the same derivation as their own sheet); without it the row falls back
 * to the party card in the campaign, and HP stays unknown.
 */
import { describe, expect, it } from "vitest";

import { buildMemberSnapshot } from "@/features/campaigns/member-snapshot";
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import { partyRows } from "@/domains/campaign/party-rows-view";
import { concentrationValue } from "@/lib/concentration";
import { conditionLabel } from "@/lib/views/tracker-view";
import type { CampaignDoc } from "@/types/campaign";
import { makeCharacterDoc } from "./_helpers";

const cleric = makeCharacterDoc(
  { classId: "cleric", level: 5, name: "Selene" as never },
  { concentration: concentrationValue("bless"), conditions: ["prone"] }
);
const rogue = makeCharacterDoc({ classId: "rogue", level: 5, name: "Kaela" as never });

const details = {
  dm: { displayName: "Ottavio", characterId: null, role: "dm" },
  // A stale party card (AC 1, Perception 1): the live doc must win over it.
  a: {
    displayName: "Nico",
    characterId: "c1",
    role: "player",
    character: {
      ...buildMemberSnapshot(cleric),
      ac: 1,
      passives: { perception: 1, investigation: 1, insight: 1 },
    },
  },
  b: {
    displayName: "Ludovica",
    characterId: "c2",
    role: "player",
    character: buildMemberSnapshot(rogue),
  },
} as unknown as CampaignDoc["memberDetails"];
const campaign = { members: ["dm", "a", "b"], memberDetails: details };

describe("partyRows", () => {
  it("one row per character, in member order; a DM without a character has none", () => {
    expect(partyRows(campaign, {}, "it").map((r) => r.uid)).toEqual(["a", "b"]);
  });

  it("live numbers come from the hydrated doc, as the sheet derives them", () => {
    const stats = derivePartyMemberStats(cleric);
    const [row] = partyRows(campaign, { a: cleric }, "it");
    expect(row).toMatchObject({
      name: "Selene",
      player: "Nico",
      hp: { current: stats.currentHp, max: stats.maxHp, temp: stats.tempHp },
      ac: stats.ac,
      perception: stats.passivePerception,
    });
  });

  it("Concentration first, then each condition, localized", () => {
    const [row] = partyRows(campaign, { a: cleric }, "it");
    expect(row?.chips).toEqual([
      { kind: "conc", label: "Benedizione" },
      { kind: "cond", label: conditionLabel("prone", "it") },
    ]);
  });

  it("with the live doc, its name and classes win over a stale party card", () => {
    const renamed = makeCharacterDoc({
      classId: "wizard",
      level: 6,
      name: "Selene la Saggia" as never,
    });
    expect(partyRows(campaign, { a: renamed }, "en")[0]).toMatchObject({
      name: "Selene la Saggia",
      classLine: "Wizard 6",
    });
  });

  it("the class line names each class with its level", () => {
    expect(partyRows(campaign, {}, "en")[1]?.classLine).toBe("Rogue 5");
  });

  it("without the live doc: AC and Perception from the party card, HP unknown, no chips", () => {
    const row = partyRows(campaign, {}, "it")[0];
    expect(row).toMatchObject({ hp: null, ac: 1, perception: 1, chips: [] });
  });
});

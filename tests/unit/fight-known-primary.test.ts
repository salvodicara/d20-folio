/**
 * The shell reads a live status only for the pip's PRIMARY fight
 * (`useLiveEncounter(uid, primaryId)`). A character in another fight on the same
 * account (a fight left running in the player's other campaign) gets no live
 * status, ever, so it must not wait for one: its sheet plays as before #1191
 * (issue #1219). A character in the primary fight still waits for its status.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import { fightKnown, rollTargetOf } from "@/features/campaigns/context-settled";
import {
  useCombatStatusStore,
  type GlobalCombat,
  type PipEntry,
} from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";

const entry = (campaignId: string, characterId: string): PipEntry => ({
  campaignId,
  campaignName: "Campaign",
  role: "pc",
  state: "your-turn",
  round: 1,
  heroName: "Hero",
  characterId,
  actorName: null,
});
const statusFor = (characterId: string, campaignId: string) =>
  ({ characterId, campaignId, initiativeRoll: 12 }) as unknown as GlobalCombat;

afterEach(() => {
  usePartyRosterStore.setState({ party: null, resolvedFor: null, castWaiting: null });
  useCombatStatusStore.setState({ status: null, pip: null });
});

describe("fightKnown with two fights on one account", () => {
  it("a character in the non-primary fight is known: no live status will come for it", () => {
    usePartyRosterStore.getState().setParty(null, "B");
    useCombatStatusStore.setState({
      pip: { primaryId: "camp-A", entries: [entry("camp-A", "A"), entry("camp-B", "B")] },
      status: statusFor("A", "camp-A"),
    });
    expect(fightKnown("B")).toBe(true);
  });

  it("a character in the primary fight still waits for its status (#1191)", () => {
    usePartyRosterStore.getState().setParty(null, "A");
    useCombatStatusStore.setState({
      pip: { primaryId: "camp-A", entries: [entry("camp-A", "A"), entry("camp-B", "B")] },
      status: null,
    });
    expect(fightKnown("A")).toBe(false);
  });

  it("an initiative roll still goes to the campaign whose fight lists the character", () => {
    usePartyRosterStore.getState().setParty(null, "B");
    useCombatStatusStore.setState({
      pip: { primaryId: "camp-A", entries: [entry("camp-A", "A"), entry("camp-B", "B")] },
      status: statusFor("A", "camp-A"),
    });
    expect(rollTargetOf("B", "u1")).toMatchObject({
      kind: "fight",
      campaignId: "camp-B",
    });
  });
});

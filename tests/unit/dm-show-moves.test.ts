/**
 * «Per i giocatori» as a move (the dev replica stands in for Firestore): each mark calls
 * its own writer on every chosen monster, as one move whose undo takes them all back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { dmMoves } from "@/domains/combat/ui/fight-moves";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import { addMonster } from "@/lib/play/encounter";
import type { CampaignDoc, EncounterMonster, EncounterState } from "@/types/campaign";

const raiders = (): EncounterMonster[] =>
  (useCampaignStore.getState().campaign?.encounter?.combatants ?? []).filter(
    (c): c is EncounterMonster => c.kind === "monster"
  );

beforeEach(() => {
  let campaign = {
    id: "camp",
    dmUid: "dm",
    members: ["dm", "ana"],
    memberDetails: {
      dm: { displayName: "dm", role: "dm", characterId: null },
      ana: {
        displayName: "ana",
        role: "player",
        characterId: "c-ana",
        character: { name: "Ana" },
      },
    },
    encounter: null,
    encounterInit: {},
    treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    treasuryLog: [],
  } as unknown as CampaignDoc;
  campaign = {
    ...campaign,
    ...planRoll(campaign, { uid: "ana", roll: 15, bonuses: {}, now: 1 })?.patch,
  };
  const encounter = addMonster(campaign.encounter as EncounterState, {
    name: "Ash Raider",
    ac: 13,
    maxHp: 11,
    count: 2,
    initiative: 17,
  });
  useCampaignStore.setState({ campaign: { ...campaign, encounter } });
});

const ids = () => raiders().map((m) => m.id);

describe("dmMoves.show", () => {
  it("hides both raiders, and the undo shows them again", async () => {
    const undo = await dmMoves.show("camp", "dm", ids(), "hidden", true)();
    expect(raiders().map((m) => m.hidden)).toEqual([true, true]);
    expect(await undo?.()).toBe(true);
    expect(raiders().map((m) => m.hidden ?? false)).toEqual([false, false]);
  });

  it("reveals their exact HP", async () => {
    await dmMoves.show("camp", "dm", ids(), "revealed", true)();
    expect(raiders().map((m) => m.revealed)).toEqual([true, true]);
    expect(raiders().map((m) => m.hidden ?? false)).toEqual([false, false]);
  });

  it("turns them allies, and the undo makes them enemies again", async () => {
    const undo = await dmMoves.show("camp", "dm", ids(), "ally", true)();
    expect(raiders().map((m) => m.side)).toEqual(["ally", "ally"]);
    await undo?.();
    expect(raiders().map((m) => m.side ?? "enemy")).toEqual(["enemy", "enemy"]);
  });

  it("an ally toggle turned off makes them enemies", async () => {
    await dmMoves.show("camp", "dm", ids(), "ally", true)();
    await dmMoves.show("camp", "dm", ids(), "ally", false)();
    expect(raiders().map((m) => m.side ?? "enemy")).toEqual(["enemy", "enemy"]);
  });

  it("a player's tap moves nothing", async () => {
    expect(await dmMoves.show("camp", "ana", ids(), "hidden", true)()).toBeNull();
    expect(raiders().map((m) => m.hidden ?? false)).toEqual([false, false]);
  });
});

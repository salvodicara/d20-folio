/**
 * Under dev auth-bypass the combat moves run on the local campaign replica. From the
 * campaign page the store holds the campaign; from a sheet it does not, and the move
 * answered «Lo scontro è già cambiato» to every roll (design lane, 2026-11-12, H1 on
 * main f229feef4: the sheet's «Tira l'iniziativa» with `d20-dev-attached`). A move reads
 * the replica when the store holds another campaign or none.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  CombatMoveRefused,
  rollIntoCombat,
} from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { readDevDocument, writeDevDocument } from "@/lib/dev-document-store";
import { createMemorySessionLogStore, createSessionRecorder } from "@/lib/session-log";
import type { CampaignDoc } from "@/types/campaign";

const recorder = createSessionRecorder({
  store: createMemorySessionLogStore(),
  uid: "ana",
});
const camp = {
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
} as unknown as CampaignDoc;

beforeEach(() => {
  useCampaignStore.setState({ campaign: null });
  writeDevDocument("campaign", "camp", camp);
});

describe("a combat move from a sheet, under dev bypass", () => {
  it("rolls into the campaign's fight from its local replica", async () => {
    const undo = await rollIntoCombat(
      "camp",
      { uid: "ana", roll: 14, bonuses: {} },
      recorder
    );
    expect(undo).not.toBeNull();
    expect(readDevDocument<CampaignDoc>("campaign", "camp")?.encounter).toMatchObject({
      currentCombatantId: "pc-ana",
    });
  });

  it("leaves the store alone when it holds another campaign", async () => {
    const other = { ...camp, id: "other" };
    useCampaignStore.setState({ campaign: other });
    await rollIntoCombat("camp", { uid: "ana", roll: 14, bonuses: {} }, recorder);
    expect(useCampaignStore.getState().campaign).toBe(other);
  });
});

describe("a roll the fight refuses for a reason of its own", () => {
  // Not someone else moving first: the toast says the reason, never «already changed».
  it("a member with no character the fight can take in is told so, in plain words", async () => {
    const unattached = {
      ...camp,
      memberDetails: {
        ...camp.memberDetails,
        ana: { displayName: "ana", role: "player", characterId: null },
      },
    } as unknown as CampaignDoc;
    writeDevDocument("campaign", "camp", unattached);
    const roll = rollIntoCombat("camp", { uid: "ana", roll: 14, bonuses: {} }, recorder);
    await expect(roll).rejects.toBeInstanceOf(CombatMoveRefused);
    await expect(roll).rejects.toMatchObject({ reason: "notAttached" });
  });
});

/**
 * «Tira l'iniziativa» shows only to a member the fight can take in. A fight starts with
 * the members whose character is attached: its id AND the party snapshot (what
 * `attachCharacter` writes). The roll button read the id alone, so a member with an id
 * but no snapshot saw a roll that always answered «Lo scontro è già cambiato» (the dev
 * campaign's attached hero, 2026-11-12 walkthrough H1).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { fightControls } from "@/domains/combat/fight-controls";
import { playRollOffer } from "@/domains/play/play-roll-offer";
import { isAttached, planRoll } from "@/features/campaigns/combat-lifecycle";
import { makeDevCampaign } from "@/features/campaigns/dev-fixture";
import type { CampaignDoc } from "@/types/campaign";

const campaign = (ana: Record<string, unknown>) =>
  ({
    id: "camp",
    dmUid: "dm",
    members: ["dm", "ana"],
    memberDetails: {
      dm: { displayName: "dm", role: "dm", characterId: null },
      ana: { displayName: "ana", role: "player", ...ana },
    },
    encounter: null,
    encounterInit: {},
  }) as unknown as CampaignDoc;

const idOnly = campaign({ characterId: "c-ana" });
const full = campaign({ characterId: "c-ana", character: { name: "Ana" } });

describe("who may roll into a campaign fight", () => {
  it("a member with a snapshot is attached and starts the fight", () => {
    expect(isAttached(full.memberDetails.ana)).toBe(true);
    expect(planRoll(full, { uid: "ana", roll: 12, bonuses: {}, now: 1 })).not.toBeNull();
    expect(playRollOffer(full, "ana", "c-ana", 2, [])).not.toBeNull();
  });

  it("a member with an id but no snapshot is not offered a roll the fight would refuse", () => {
    expect(isAttached(idOnly.memberDetails.ana)).toBe(false);
    expect(planRoll(idOnly, { uid: "ana", roll: 12, bonuses: {}, now: 1 })).toBeNull();
    expect(playRollOffer(idOnly, "ana", "c-ana", 2, [])).toBeNull();
    const me = { uid: "ana", isDm: false, rolled: false, missing: 0 };
    expect(
      fightControls(
        null,
        null,
        { ...me, hasCharacter: isAttached(idOnly.memberDetails.ana) },
        0
      ).roll
    ).toBe(false);
  });
});

describe("the dev campaign with its hero attached", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rolls into a fight instead of a dead end", () => {
    const flags = new Map([["d20-dev-attached", "1"]]);
    vi.stubGlobal("window", {
      localStorage: { getItem: (k: string) => flags.get(k) ?? null },
      navigator: { language: "en" },
    });
    const dev = makeDevCampaign();
    expect(
      planRoll(dev, { uid: "mock-uid", roll: 14, bonuses: {}, now: 1 })
    ).not.toBeNull();
  });
});

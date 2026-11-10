/**
 * The DM's fight-tool moves run and undo (the dev replica stands in for Firestore):
 * reorder and put back, switch side and back, hide and show.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  reorderCombatantMove,
  setCombatantHiddenMove,
  setMonsterSideMove,
} from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { addMonster } from "@/features/campaigns/encounter";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

const fight = () => useCampaignStore.getState().campaign?.encounter;

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

describe("the DM's fight tools", () => {
  it("reorder, and the undo puts the order back", async () => {
    const before = fight()?.order ?? [];
    const undo = await reorderCombatantMove("camp", {
      uid: "dm",
      id: "pc-ana",
      beforeId: before[0] ?? null,
    });
    expect(fight()?.order?.[0]).toBe("pc-ana");
    expect(await undo?.()).toBe(true);
    expect(fight()?.order).toEqual(before);
  });

  it("a creature moved to the end comes back to its place on undo", async () => {
    const before = fight()?.order ?? [];
    const first = before[0] ?? "";
    const undo = await reorderCombatantMove("camp", {
      uid: "dm",
      id: first,
      beforeId: null,
    });
    expect(fight()?.order?.at(-1)).toBe(first);
    expect(await undo?.()).toBe(true);
    expect(fight()?.order).toEqual(before);
  });

  it("switch a raider to ally and back", async () => {
    const raider = fight()?.combatants.find((c) => c.kind === "monster")?.id ?? "";
    const undo = await setMonsterSideMove("camp", {
      uid: "dm",
      monsterId: raider,
      side: "ally",
    });
    const side = () => {
      const c = fight()?.combatants.find((x) => x.id === raider);
      return c?.kind === "monster" ? c.side : undefined;
    };
    expect(side()).toBe("ally");
    expect(await undo?.()).toBe(true);
    expect(side()).toBeUndefined();
  });

  it("hide and show; a player's attempt does nothing", async () => {
    const raider = fight()?.combatants.find((c) => c.kind === "monster")?.id ?? "";
    expect(
      await setCombatantHiddenMove("camp", { uid: "ana", id: raider, hidden: true })
    ).toBeNull();
    const undo = await setCombatantHiddenMove("camp", {
      uid: "dm",
      id: raider,
      hidden: true,
    });
    expect(fight()?.combatants.find((c) => c.id === raider)?.hidden).toBe(true);
    expect(await undo?.()).toBe(true);
    expect(fight()?.combatants.find((c) => c.id === raider)?.hidden).toBe(false);
  });
});

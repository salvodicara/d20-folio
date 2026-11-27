/**
 * The DM ticks a hero's death save from the new fight screen (coordinator, 2026-11-26;
 * Foundry's GM marks it on the actor): additive, the player can still tick their own.
 * The tick goes through the normal peer write (`writeCampaignCombatEffect`, the shape
 * fence riding it), lands in the session log «by the DM», and is one undo. Only the
 * campaign's DM, and only a hero who is in this campaign's fight.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));
const write = vi.fn();
vi.mock("@/features/campaigns/campaign-io", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/campaigns/campaign-io")>()),
  writeCampaignCombatEffect: (...args: unknown[]) => write(...args) as unknown,
}));

import { dmDeathSaveMove } from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { planRoll } from "@/features/campaigns/combat-lifecycle";
import type { CampaignDoc } from "@/types/campaign";

const state = (successes: number) => ({
  hp: { current: 0, temp: 0 },
  conditions: ["unconscious"],
  deathSaves: { successes, failures: 0 },
});

function seed() {
  let campaign = {
    id: "camp",
    dmUid: "dm",
    members: ["dm", "ana", "bo"],
    memberDetails: {
      dm: { displayName: "dm", role: "dm", characterId: null },
      ana: {
        displayName: "ana",
        role: "player",
        characterId: "c-ana",
        character: { name: "Ana" },
      },
      bo: { displayName: "bo", role: "player", characterId: null, character: null },
    },
    encounter: null,
    encounterInit: {},
  } as unknown as CampaignDoc;
  campaign = {
    ...campaign,
    ...planRoll(campaign, { uid: "ana", roll: 15, bonuses: {}, now: 1 })?.patch,
  };
  useCampaignStore.setState({ campaign });
}

const recorder = () => ({
  record: vi.fn(() => Promise.resolve("line-1")),
  retract: vi.fn(() => Promise.resolve("x")),
});

beforeEach(() => {
  seed();
  write.mockReset();
  write.mockImplementation(() =>
    Promise.resolve({ before: state(0), after: state(1), spends: [], retaliations: [] })
  );
});

const tick = {
  uid: "dm",
  memberUid: "ana",
  characterId: "c-ana",
  maxHp: 30,
  outcome: "success" as const,
};

describe("dmDeathSaveMove", () => {
  it("the DM's tick goes through the peer write and the log says «by the DM»", async () => {
    const log = recorder();
    const undo = await dmDeathSaveMove("camp", tick, log);
    expect(write).toHaveBeenCalledWith("ana", "c-ana", null, 30, {
      kind: "death-save",
      outcome: "success",
    });
    expect(log.record).toHaveBeenCalledWith(
      { kind: "death-save", outcome: "success", actor: "pc-ana", rolledBy: "dm" },
      expect.anything()
    );
    expect(undo).not.toBeNull();
  });

  it("one undo reverts the write and takes the line off", async () => {
    const log = recorder();
    const undo = await dmDeathSaveMove("camp", tick, log);
    write.mockClear();
    expect(await undo?.()).toBe(true);
    expect(write).toHaveBeenCalledWith("ana", "c-ana", null, 30, {
      kind: "revert",
      written: state(1),
      previous: state(0),
    });
    expect(log.retract).toHaveBeenCalledWith("line-1");
  });

  it("only the campaign's DM: a player's tap writes nothing", async () => {
    expect(await dmDeathSaveMove("camp", { ...tick, uid: "ana" }, recorder())).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("only a hero in this campaign's fight, with their own character", async () => {
    for (const other of [
      { memberUid: "bo", characterId: "c-bo" },
      { memberUid: "zed", characterId: "c-zed" },
      { memberUid: "ana", characterId: "c-someone-else" },
    ]) {
      expect(await dmDeathSaveMove("camp", { ...tick, ...other }, recorder())).toBeNull();
    }
    expect(write).not.toHaveBeenCalled();
  });

  it("another campaign's page writes nothing", async () => {
    expect(await dmDeathSaveMove("elsewhere", tick, recorder())).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});

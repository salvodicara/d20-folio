/**
 * What a client still running v0.25.0 makes of the fights the combat lifecycle writes.
 * Each stored value goes through a frozen copy of the v0.25.0 encounter reader.
 */
import { describe, expect, it } from "vitest";

import {
  combatPatchFields,
  planEnd,
  planReopen,
  planRoll,
  type CombatFields,
  type CombatPatch,
} from "@/features/campaigns/combat-lifecycle";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

import { parseEncounterState as readV025 } from "./__fixtures__/encounter-v0.25.0-reader";

const member = (characterId: string | null) => ({
  displayName: "x",
  role: "player",
  characterId,
  character: characterId ? { name: characterId } : null,
});
const table = {
  id: "camp",
  memberDetails: { dm: member(null), ana: member("char-ana"), ben: member("char-ben") },
  encounterInit: {},
} as unknown as CampaignDoc & CombatFields;

/** The campaign as stored after a move: its fields, and the kept fight on the side. */
const after = (
  campaign: CampaignDoc & CombatFields,
  patch: CombatPatch | null | undefined
) => {
  if (!patch) throw new Error("expected a move");
  return { ...campaign, ...patch } as CampaignDoc & CombatFields;
};
const stored = (patch: CombatPatch | null | undefined) =>
  combatPatchFields(patch ?? {}).campaign.encounter;
const bonuses = { "pc-ana": 2, "pc-ben": 1 };

describe("a v0.25.0 client and a fight a player started with a roll", () => {
  const start = planRoll(table, { uid: "ana", roll: 13, bonuses, now: 1000 })?.patch;
  const started = after(table, start);
  const join = planRoll(started, { uid: "ben", roll: 18, bonuses, now: 2000 })?.patch;

  it("reads it as a running fight, with the same turn, order and round", () => {
    for (const patch of [start, join]) {
      const fight = readV025(stored(patch));
      expect(fight.status).toBe("active");
      expect(fight.currentCombatantId).toBe(patch?.encounter?.currentCombatantId);
      expect(fight.order).toEqual(patch?.encounter?.order);
      expect(fight.round).toBe(1);
    }
  });

  it("reads an ended fight as no fight, since the kept fight is a document it never reads", () => {
    const end = planEnd(after(started, join), { reason: "manual", now: 3000 });
    expect(stored(end)).toBeNull();
    expect(combatPatchFields(end ?? {}).kept?.fight).toMatchObject({
      ended: { reason: "manual" },
    });
  });

  it("reads a reopened fight as the fight it was", () => {
    const running = after(started, join);
    const ended = after(running, planEnd(running, { reason: "idle", now: 3000 }));
    const reopened = readV025(stored(planReopen(ended, { now: 4000 })));
    const { clock: _a, ...was } = running.encounter as EncounterState;
    const { clock: _b, ...now } = reopened;
    void _a;
    void _b;
    expect(now).toEqual(was);
  });
});

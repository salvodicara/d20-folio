import { describe, expect, it, vi } from "vitest";

import {
  createEncounterMirror,
  createMemorySessionLogStore,
  foldSession,
  mirrorEncounter,
} from "@/lib/session-log";
import type { LogItem } from "@/lib/session-log";
import type { EncounterState } from "@/types/campaign";
import type { CombatChronicleEvent } from "@/types/combat-chronicle";

const DM = "dm";

function fight(round: number, events: CombatChronicleEvent[]): EncounterState {
  return {
    combatants: [],
    nextMonsterOrdinal: 1,
    round,
    currentCombatantId: null,
    epoch: 77,
    status: "active",
    events,
  };
}

const hit: CombatChronicleEvent = {
  id: "0",
  round: 1,
  kind: "hp-damage",
  targetId: "monster-1",
  amount: 9,
  current: 2,
  max: 11,
};

/** Apply the mirror's drafts as the DM device would, and return the new log. */
function sync(log: LogItem[], encounter: EncounterState | null): LogItem[] {
  const drafts = mirrorEncounter(encounter, foldSession(log, { dmUid: DM }));
  return [...log, ...drafts.map((d): LogItem => ({ ...d, by: DM, at: 1 }))];
}

describe("mirrorEncounter", () => {
  it("records the start, the round and each chronicle beat once", () => {
    const log = sync([], fight(1, [hit]));
    expect(log.map((i) => i.id)).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:ev:0",
    ]);
    expect(foldSession(log, { dmUid: DM })[2]?.event).toEqual({
      kind: "damage",
      amount: 9,
      target: "monster-1",
    });
    // Idempotent: a reload or a repeated snapshot adds nothing.
    expect(sync(log, fight(1, [hit]))).toEqual(log);
  });

  it("records a later attacker tap as a correction, once", () => {
    const log = sync([], fight(1, [hit]));
    const tapped = sync(log, fight(1, [{ ...hit, attackerId: "pc-ana" }]));
    const added = tapped.slice(log.length);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: "correct", target: "enc:77:ev:0" });
    expect(sync(tapped, fight(1, [{ ...hit, attackerId: "pc-ana" }]))).toEqual(tapped);
  });

  it("follows an attacker tapped, cleared and tapped again", () => {
    const tappedHit = { ...hit, attackerId: "pc-ana" };
    let log = sync([], fight(1, [hit]));
    for (const beat of [tappedHit, hit, tappedHit]) log = sync(log, fight(1, [beat]));
    expect(foldSession(log, { dmUid: DM })[2]).toMatchObject({
      corrections: 3,
      event: { actor: "pc-ana" },
    });
  });

  it("retracts a beat the DM undid, and ends the fight when the encounter clears", () => {
    const log = sync([], fight(1, [hit]));
    const undone = sync(log, fight(1, []));
    expect(undone.at(-1)).toMatchObject({ type: "retract", target: "enc:77:ev:0" });
    const ended = sync(undone, null);
    expect(ended.at(-1)).toMatchObject({
      type: "event",
      id: "enc:77:end",
      event: { kind: "encounter-end", encounterId: "77" },
    });
    expect(sync(ended, null)).toEqual(ended);
  });

  it("records each new round as the DM advances", () => {
    const log = sync(sync([], fight(1, [])), fight(2, []));
    expect(log.map((i) => i.id)).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:round:2",
    ]);
  });
});

describe("createEncounterMirror", () => {
  it("keeps the open session in step with the encounter without duplicates", async () => {
    const store = createMemorySessionLogStore();
    const now = () => new Date(2026, 9, 8, 20, 0);
    const mirror = createEncounterMirror({ store, uid: DM, dmUid: DM, now });
    mirror.update(fight(1, [hit]));
    await vi.waitFor(() => expect(store.items("2026-10-08")).toHaveLength(3));
    mirror.update(fight(1, [hit]));
    mirror.update(null);
    await vi.waitFor(() => expect(store.items("2026-10-08")).toHaveLength(4));
    mirror.stop();
    expect(store.items("2026-10-08").map((i) => i.id)).toEqual([
      "enc:77:start",
      "enc:77:round:1",
      "enc:77:ev:0",
      "enc:77:end",
    ]);
  });
});

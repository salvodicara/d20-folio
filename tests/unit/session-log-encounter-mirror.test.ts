import { describe, expect, it, vi } from "vitest";

import {
  buildReport,
  createEncounterMirror,
  encounterCloseDrafts,
  encounterFeed,
  strikeDraft,
  createMemorySessionLogStore,
  foldSession,
  mirrorEncounter,
  loggedIds,
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
  const drafts = mirrorEncounter(
    encounter,
    foldSession(log, { dmUid: DM }),
    loggedIds(log)
  );
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

  it("leaves a 'who struck?' correction appended beside the beat alone", () => {
    const log = sync([], fight(1, [hit]));
    const named: LogItem = {
      type: "correct",
      id: "c1",
      by: DM,
      at: 2,
      target: "enc:77:ev:0",
      event: { kind: "damage", amount: 9, target: "monster-1", actor: "pc-ana" },
    };
    expect(sync([...log, named], fight(1, [hit]))).toEqual([...log, named]);
  });

  it("never re-adds a line struck from the record while its beat still stands", () => {
    const log = sync([], fight(1, [hit]));
    const [line] = encounterFeed(foldSession(log, { dmUid: DM }), "77");
    if (!line) throw new Error("fixture");
    const retracted: LogItem[] = [...log, { ...strikeDraft(line), by: DM, at: 2 }];
    expect(sync(retracted, fight(1, [hit]))).toEqual(retracted);
  });

  it("records a new beat that reuses an undone beat's id as a new line", () => {
    // The encounter numbers beats from its live array, so undoing the newest beat frees
    // its id for the next one.
    const undone = sync(sync([], fight(1, [hit])), fight(1, []));
    const again = { ...hit, amount: 3, current: 8 };
    const log = sync(undone, fight(1, [again]));
    const lines = foldSession(log, { dmUid: DM }).filter((e) => e.id.includes(":ev:"));
    expect(lines.map((e) => [e.id, e.event])).toEqual([
      ["enc:77:ev:0:g2", { kind: "damage", amount: 3, target: "monster-1" }],
    ]);
    expect(sync(log, fight(1, [again]))).toEqual(log);
    // …and undoing that one retracts it in turn.
    expect(sync(log, fight(1, [])).at(-1)).toMatchObject({
      type: "retract",
      target: "enc:77:ev:0:g2",
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

  it("names the fight's monsters on its start line and follows a monster added later", () => {
    const goblin = {
      kind: "monster" as const,
      id: "monster-1",
      name: "Goblin",
      ac: 15,
      initiative: 12,
      conditions: [],
      hp: { current: 7, temp: 0, max: 7 },
    };
    const withGoblin = { ...fight(1, []), combatants: [goblin] };
    let log = sync([], withGoblin);
    expect(foldSession(log, { dmUid: DM })[0]?.event).toEqual({
      kind: "encounter-start",
      encounterId: "77",
      names: { "monster-1": "Goblin" },
    });
    const wolf = { ...goblin, id: "monster-2", name: "Wolf" };
    log = sync(log, { ...withGoblin, combatants: [goblin, wolf] });
    expect(foldSession(log, { dmUid: DM })[0]?.event).toMatchObject({
      names: { "monster-1": "Goblin", "monster-2": "Wolf" },
    });
  });

  it("closes a fight with the DM's note and outcome; the mirror adds no second end", () => {
    const log = sync([], fight(1, [hit]));
    const closed = [
      ...log,
      ...encounterCloseDrafts("77", "The bridge held.", "victory").map(
        (d): LogItem => ({ ...d, by: DM, at: 2 })
      ),
    ];
    expect(sync(closed, null)).toEqual(closed);
    const [section] = buildReport(foldSession(closed, { dmUid: DM }));
    expect(section).toMatchObject({ kind: "encounter", outcome: "victory" });
    const lines =
      section?.kind === "encounter" ? section.rounds.flatMap((r) => r.entries) : [];
    expect(lines.map((e) => e.event)).toContainEqual({
      kind: "note",
      text: "The bridge held.",
    });
    // No note, no note line.
    expect(encounterCloseDrafts("77", "", "ended").map((d) => d.id)).toEqual([
      "enc:77:end",
    ]);
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

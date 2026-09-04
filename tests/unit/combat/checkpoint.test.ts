/**
 * Compaction: the pure half of the shared-encounter budget (design §5.3).
 *
 * The load-bearing proof is fold equality — a compacted document folds to exactly the state the
 * uncompacted one folds to — plus the grace window, which keeps the newest actions in the log so
 * a client that is still catching up never loses the actions it has not folded yet.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import {
  CHECKPOINT_GRACE_MS,
  COMPACT_ACTIONS,
  COMPACT_BYTES,
  checkpointThrough,
  compact,
  encounterBytes,
  shouldCompact,
} from "@/lib/combat/checkpoint";
import { fold } from "@/lib/combat/fold";
import { sortBySeq, type Seq } from "@/lib/combat/ids";
import type { Action, Encounter } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  emptyState,
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

/** `items[index]`, asserted present (test-only invariant). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an element at index ${index}`);
  return item;
}

interface Replay {
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly log: readonly (Omit<Action, "seq"> & { readonly by: string })[];
}

/** The `sara-ogre-ambush` story as ONE self-contained log (opening actions included), so the
 *  whole encounter folds from `initialState()` — the state `compact` folds a head on. */
function replayEncounter(file: string): Encounter {
  const replay = JSON.parse(
    readFileSync(join(__dirname, "replays", file), "utf8")
  ) as Replay;
  const seq = seqFactory(replay.dm);
  const opening = openingActions(
    replay.dm,
    seq,
    replay.entities.map((entity) => testEntity(entity)),
    replay.initiative,
    replay.order
  );
  const log: Action[] = [
    ...opening,
    ...replay.log.map(
      (entry, index): Action =>
        ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
    ),
  ];
  return {
    schema: 1,
    id: file,
    host: { kind: "campaign", campaignId: "replay" },
    log,
    checkpoint: null,
  };
}

/** A log of `count` `end-turn` no-ops stamped `startMs, startMs + stepMs, …`. */
function timedEncounter(count: number, stepMs: number, startMs = 0): Encounter {
  const log: Action[] = [];
  for (let index = 0; index < count; index += 1) {
    log.push(
      tableAction(
        "dm",
        { ms: startMs + index * stepMs, counter: 0, by: "dm" },
        {
          op: "end-turn",
        }
      )
    );
  }
  return {
    schema: 1,
    id: "timed",
    host: { kind: "campaign", campaignId: "camp" },
    log,
    checkpoint: null,
  };
}

describe("combat/checkpoint — budget", () => {
  it("exposes the design's compaction budget", () => {
    expect(COMPACT_ACTIONS).toBe(200);
    expect(COMPACT_BYTES).toBe(512 * 1024);
    expect(CHECKPOINT_GRACE_MS).toBe(5 * 60_000);
  });

  it("measures the encoded document, not the in-memory object", () => {
    const encounter = timedEncounter(3, 1_000);
    expect(encounterBytes(encounter)).toBeGreaterThan(0);
    expect(encounterBytes(timedEncounter(30, 1_000))).toBeGreaterThan(
      encounterBytes(encounter)
    );
  });

  it("compacts past 200 actions or past 512 KiB, never before", () => {
    expect(shouldCompact(timedEncounter(200, 1_000))).toBe(false);
    expect(shouldCompact(timedEncounter(201, 1_000))).toBe(true);
    // Under the action ceiling but over the byte ceiling: one fat unknown key.
    const fat: Encounter = {
      ...timedEncounter(3, 1_000),
      unknown: { blob: "x".repeat(COMPACT_BYTES + 1) },
    };
    expect(fat.log.length).toBeLessThan(COMPACT_ACTIONS);
    expect(shouldCompact(fat)).toBe(true);
  });
});

describe("combat/checkpoint — the grace window", () => {
  it("picks the newest action outside the grace window", () => {
    // ms 0, 100_000, 200_000, 300_000 with a 5-minute grace: only ms 0 is old enough.
    const encounter = timedEncounter(4, 100_000);
    expect(checkpointThrough(encounter)).toEqual({ ms: 0, counter: 0, by: "dm" });
  });

  it("returns null when every action is inside the window", () => {
    expect(checkpointThrough(timedEncounter(5, 1_000))).toBeNull();
    expect(checkpointThrough(timedEncounter(0, 1_000))).toBeNull();
  });

  it("honours a caller-supplied grace", () => {
    const encounter = timedEncounter(4, 100_000);
    expect(checkpointThrough(encounter, 50_000)).toEqual({
      ms: 200_000,
      counter: 0,
      by: "dm",
    });
    expect(checkpointThrough(encounter, 0)).toEqual({
      ms: 300_000,
      counter: 0,
      by: "dm",
    });
  });

  it("breaks a tie on the cutoff millisecond by counter, then by author", () => {
    // Three actions share ms === cutoff; `compareSeq` orders them counter-then-`by`, so the
    // LAST of the three is the one compaction may safely swallow.
    const cutoff = 0;
    const contenders: Seq[] = [
      { ms: cutoff, counter: 0, by: "zoe" },
      { ms: cutoff, counter: 1, by: "amy" },
      { ms: cutoff, counter: 1, by: "bob" },
    ];
    const encounter: Encounter = {
      schema: 1,
      id: "ties",
      host: { kind: "campaign", campaignId: "camp" },
      log: [
        ...contenders.map((seq) => tableAction(seq.by, seq, { op: "end-turn" })),
        tableAction("dm", { ms: 300_000, counter: 0, by: "dm" }, { op: "end-turn" }),
      ],
      checkpoint: null,
    };
    expect(checkpointThrough(encounter)).toEqual({ ms: cutoff, counter: 1, by: "bob" });
  });

  it("never proposes a seq at or before the current checkpoint", () => {
    const base = timedEncounter(4, 100_000);
    const through: Seq = { ms: 0, counter: 0, by: "dm" };
    const already: Encounter = {
      ...base,
      checkpoint: { through, state: emptyState() },
    };
    // ms 0 is already covered and the rest are inside the window → nothing to do.
    expect(checkpointThrough(already)).toBeNull();
    // With a shorter grace the next candidate is the first action AFTER the checkpoint.
    expect(checkpointThrough(already, 150_000)).toEqual({
      ms: 100_000,
      counter: 0,
      by: "dm",
    });
  });
});

/** A two-creature table plus whatever the caller appends, as ONE self-contained log. */
function tableEncounter(extra: (stamp: (ms: number) => Seq) => Action[]): Encounter {
  const opening = openingActions(
    "dm",
    seqFactory("dm", 1_000),
    [
      testEntity({ id: "sara", kind: "pc", controllerUid: "p1" }),
      testEntity({ id: "ogre" }),
    ],
    { sara: 20, ogre: 10 },
    ["sara", "ogre"]
  );
  const stamp = (ms: number): Seq => ({ ms, counter: 0, by: "dm" });
  return {
    schema: 1,
    id: "table",
    host: { kind: "campaign", campaignId: "camp" },
    log: [...opening, ...extra(stamp)],
    checkpoint: null,
  };
}

function undoAction(seq: Seq, of: string): Action {
  return { kind: "undo", id: nextActionId("u"), seq, by: "dm", of, reason: null };
}

describe("combat/checkpoint — compact", () => {
  const encounter = replayEncounter("sara-ogre-ambush.json");
  const sorted = sortBySeq(encounter.log);
  const middle = at(sorted, Math.floor(sorted.length / 2)).seq;

  it("folds to exactly the state the uncompacted document folds to", () => {
    const compacted = compact(encounter, catalogue, middle);
    const before = fold(encounter, catalogue);
    const after = fold(compacted, catalogue);
    expect(after.state).toEqual(before.state);
    expect(after.state.revision).toBe(before.state.revision);
  });

  it("keeps only the actions after `through` and records the checkpoint", () => {
    const compacted = compact(encounter, catalogue, middle);
    expect(compacted.checkpoint?.through).toEqual(middle);
    expect(compacted.log.length).toBeLessThan(encounter.log.length);
    expect(compacted.log.map((action) => action.id)).toEqual(
      sorted.slice(Math.floor(sorted.length / 2) + 1).map((action) => action.id)
    );
    expect(compacted.id).toBe(encounter.id);
    expect(compacted.host).toEqual(encounter.host);
  });

  it("is idempotent under a second compaction on top of the first", () => {
    const once = compact(encounter, catalogue, middle);
    const later = at(sortBySeq(once.log), 1).seq;
    const twice = compact(once, catalogue, later);
    expect(fold(twice, catalogue).state).toEqual(fold(encounter, catalogue).state);
    expect(twice.checkpoint?.through).toEqual(later);
  });
});

describe("combat/checkpoint — undo across the compaction boundary", () => {
  it("keeps an undo that lands AFTER `through` but targets an action before it", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [
      endTurn,
      undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id),
    ]);
    const before = fold(encounter, catalogue);
    // Sanity: the undo really did negate the end-turn in the uncompacted fold.
    expect(before.state.clock.current).toBe("sara");

    const compacted = compact(encounter, catalogue, endTurn.seq);
    const after = fold(compacted, catalogue);
    expect(after.state).toEqual(before.state);
    expect(after.state.clock.current).toBe("sara");
    expect(after.state.revision).toBe(before.state.revision);
  });

  it("resolves an undo-of-undo whose members straddle `through`", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const undoOfUndo = undoAction({ ms: 2_002, counter: 0, by: "dm" }, undo.id);
    const encounter = tableEncounter(() => [endTurn, undo, undoOfUndo]);
    const before = fold(encounter, catalogue);
    // The undo is itself undone, so the end-turn stands.
    expect(before.state.clock.current).toBe("ogre");

    // `through` between the undo and the undo-of-undo: the pair straddles the boundary.
    const compacted = compact(encounter, catalogue, undo.seq);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
  });

  it("resolves an undo-of-undo entirely inside the head", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const undoOfUndo = undoAction({ ms: 2_002, counter: 0, by: "dm" }, undo.id);
    const later = tableAction(
      "dm",
      { ms: 3_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [endTurn, undo, undoOfUndo, later]);
    const before = fold(encounter, catalogue);
    const compacted = compact(encounter, catalogue, undoOfUndo.seq);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
    expect(fold(compacted, catalogue).state.clock.current).toBe("sara");
  });

  it("keeps an undo whose target is also inside the head (the already-correct case)", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const undo = undoAction({ ms: 2_001, counter: 0, by: "dm" }, endTurn.id);
    const later = tableAction(
      "dm",
      { ms: 3_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [endTurn, undo, later]);
    const before = fold(encounter, catalogue);
    const compacted = compact(encounter, catalogue, undo.seq);
    expect(compacted.log.map((action) => action.id)).toEqual([later.id]);
    expect(fold(compacted, catalogue).state).toEqual(before.state);
  });

  it("survives the boundary `checkpointThrough` itself picks for a crossing undo", () => {
    const endTurn = tableAction(
      "dm",
      { ms: 1_000_000, counter: 0, by: "dm" },
      {
        op: "end-turn",
      }
    );
    const encounter = tableEncounter(() => [
      endTurn,
      undoAction({ ms: 1_000_001, counter: 0, by: "dm" }, endTurn.id),
      tableAction("dm", { ms: 1_300_000, counter: 0, by: "dm" }, { op: "end-turn" }),
    ]);
    // Grace 5 min: cutoff = 1_300_000 - 300_000 = 1_000_000 — exactly the undo's TARGET.
    const through = checkpointThrough(encounter);
    expect(through).toEqual(endTurn.seq);
    if (through === null) throw new Error("unreachable");
    expect(fold(compact(encounter, catalogue, through), catalogue).state).toEqual(
      fold(encounter, catalogue).state
    );
  });
});

/// <reference types="node" />
/**
 * The shared-encounter Firestore adapter (`src/lib/combat-io.ts`) against the REAL emulator.
 *
 * EMULATOR-DEPENDENT — see the header of `firestore-rules.test.ts`; this file runs in the same
 * lane (`pnpm test:rules`) and shares its harness shape.
 *
 * Unlike `firestore-rules.test.ts`, which proves the access matrix, this file proves the
 * ADAPTER: the append/subscribe/checkpoint seam every client will run. It is emulator-backed
 * rather than mocked because the three facts under test are Firestore's, not ours — `arrayUnion`
 * grows the log without a read-modify-write race, `onSnapshot` reports a local append with
 * `hasPendingWrites` before the server acknowledges it, and `runTransaction` gives the
 * compaction rewrite a real compare-and-set. A fake would only prove our own assumptions.
 */
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { compact } from "@/lib/combat/checkpoint";
import { parseEncounter } from "@/lib/combat/codec";
import { fold } from "@/lib/combat/fold";
import { sortBySeq, type Seq } from "@/lib/combat/ids";
import type { Action, Encounter } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import {
  appendAction,
  createEncounter,
  createSeqClock,
  checkpointEncounter,
  deleteEncounter,
  encounterRef,
  newActionId,
  personalEncounterRef,
  subscribeEncounter,
  type EncounterSnapshot,
} from "@/lib/combat-io";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";
import {
  openingActions,
  seqFactory,
  tableAction,
} from "@tests/unit/combat/__helpers__/state";

const PROJECT_ID = "demo-d20folio";
const CAMPAIGN = "camp1";
const ENCOUNTER = "enc1";
const WAIT_MS = 8_000;

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

/** `items[index]`, asserted present (test-only invariant). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an element at index ${index}`);
  return item;
}

let testEnv: RulesTestEnvironment;
const openRecorders: (() => void)[] = [];

/** `rules-unit-testing` still declares `firestore()` through the COMPAT namespace type, which is
 *  structurally narrower than the modular `Firestore` the adapter takes (it lacks `type` and
 *  `toJSON`). The instance is the modular one at runtime — every other call in this lane relies
 *  on that too — so the cast is a typings gap, not a behavioural one. */
function clientFor(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

/** `runTransaction` rejects a ref built from a DIFFERENT `Firestore` instance, so a test that
 *  needs both keeps the pair together. */
function sessionFor(uid: string): { db: Firestore; ref: DocumentReference } {
  const db = clientFor(uid);
  return { db, ref: encounterRef(db, CAMPAIGN, ENCOUNTER) };
}

function refFor(uid: string): DocumentReference {
  return sessionFor(uid).ref;
}

/** The standard opening (start · add entity · initiative · begin turns) as a stored log. */
function openingLog(): Action[] {
  return openingActions(
    "dm",
    seqFactory("dm", 1_000),
    [testEntity({ id: "ogre", hp: 30 })],
    { ogre: 12 },
    ["ogre"]
  );
}

function encounterOf(log: readonly Action[]): Encounter {
  return {
    schema: 1,
    id: ENCOUNTER,
    host: { kind: "campaign", campaignId: CAMPAIGN },
    log,
    checkpoint: null,
  };
}

function memberAction(ms: number): Action {
  return tableAction("member", { ms, counter: 0, by: "member" }, { op: "end-turn" });
}

function hasAction(snapshot: EncounterSnapshot, id: string): boolean {
  return (
    snapshot.kind === "encounter" &&
    snapshot.encounter.log.some((action) => action.id === id)
  );
}

interface Recorder {
  readonly seen: readonly EncounterSnapshot[];
  until(
    predicate: (snapshot: EncounterSnapshot) => boolean,
    label: string
  ): Promise<EncounterSnapshot>;
}

/** Subscribe and remember every snapshot, so a test can assert on ORDER, not just the end. */
function record(ref: DocumentReference): Recorder {
  const seen: EncounterSnapshot[] = [];
  let pending: {
    predicate: (snapshot: EncounterSnapshot) => boolean;
    settle: (snapshot: EncounterSnapshot) => void;
    timer: NodeJS.Timeout;
  } | null = null;
  const unsubscribe = subscribeEncounter(ref, (snapshot) => {
    seen.push(snapshot);
    if (pending !== null && pending.predicate(snapshot)) {
      clearTimeout(pending.timer);
      const { settle } = pending;
      pending = null;
      settle(snapshot);
    }
  });
  openRecorders.push(unsubscribe);
  return {
    seen,
    until(predicate, label) {
      const already = seen.find(predicate);
      if (already !== undefined) return Promise.resolve(already);
      return new Promise((settle, reject) => {
        const timer = setTimeout(() => {
          pending = null;
          reject(
            new Error(
              `timed out waiting for ${label}; saw ${JSON.stringify(seen.map((s) => s.kind))}`
            )
          );
        }, WAIT_MS);
        pending = { predicate, settle, timer };
      });
    },
  };
}

async function storedEncounter(): Promise<Encounter> {
  let data: unknown;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snapshot = await getDoc(
      doc(ctx.firestore(), "campaigns", CAMPAIGN, "encounters", ENCOUNTER)
    );
    data = snapshot.data();
  });
  const parsed = parseEncounter(data);
  if (!parsed.ok) throw new Error(`stored document did not parse: ${parsed.reason}`);
  return parsed.encounter;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolvePath(__dirname, "../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(() => {
  while (openRecorders.length > 0) openRecorders.pop()?.();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", "dm"), { status: "active" });
    await setDoc(doc(db, "users", "member"), { status: "active" });
    await setDoc(doc(db, "campaigns", CAMPAIGN), {
      name: "Test Table",
      createdBy: "dm",
      dmUid: "dm",
      members: ["dm", "member"],
      memberDetails: {
        dm: { displayName: "dm", characterId: null, role: "dm" },
        member: { displayName: "member", characterId: null, role: "player" },
      },
      status: "active",
      inviteCode: CAMPAIGN,
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
    });
  });
});

describe("combat-io — document references", () => {
  it("points at the campaign encounter and the personal combat subdoc", () => {
    const db = clientFor("dm");
    expect(encounterRef(db, "c", "e").path).toBe("campaigns/c/encounters/e");
    expect(personalEncounterRef(db, "u", "ch").path).toBe(
      "users/u/characters/ch/combat/state"
    );
  });
});

describe("combat-io — the seq clock and action ids", () => {
  it("counts within a millisecond and never walks backwards", () => {
    const readings = [10, 10, 10, 12, 11];
    let index = 0;
    const clock = createSeqClock("dm", () => at(readings, index++));
    expect(clock()).toEqual({ ms: 10, counter: 0, by: "dm" });
    expect(clock()).toEqual({ ms: 10, counter: 1, by: "dm" });
    expect(clock()).toEqual({ ms: 10, counter: 2, by: "dm" });
    expect(clock()).toEqual({ ms: 12, counter: 0, by: "dm" });
    // The wall clock went backwards (NTP, a sleeping laptop): the seq must not.
    expect(clock()).toEqual({ ms: 12, counter: 1, by: "dm" });
  });

  it("mints distinct action ids", () => {
    expect(newActionId()).not.toBe(newActionId());
  });
});

describe("combat-io — append and subscribe", () => {
  it("the DM creates, a member appends, and the DM's listener folds in the member's action", async () => {
    const dmRef = refFor("dm");
    await createEncounter(dmRef, encounterOf(openingLog()));
    const dmView = record(dmRef);
    await dmView.until((s) => s.kind === "encounter", "the DM's first snapshot");

    const action = memberAction(9_000);
    await appendAction(refFor("member"), action);

    const arrived = await dmView.until(
      (s) => hasAction(s, action.id),
      "the member's action on the DM's listener"
    );
    expect(arrived.kind).toBe("encounter");
    if (arrived.kind !== "encounter") throw new Error("unreachable");
    expect(arrived.encounter.log).toHaveLength(openingLog().length + 1);
    expect(arrived.encounter.host).toEqual({ kind: "campaign", campaignId: CAMPAIGN });
    expect(arrived.encounter.checkpoint).toBeNull();
  });

  it("a member's own append shows locally as pending, then acknowledged", async () => {
    await createEncounter(refFor("dm"), encounterOf(openingLog()));
    const memberRef = refFor("member");
    const memberView = record(memberRef);
    await memberView.until((s) => s.kind === "encounter", "the member's first snapshot");

    const action = memberAction(9_100);
    await appendAction(memberRef, action);
    await memberView.until(
      (s) => hasAction(s, action.id) && s.kind === "encounter" && !s.pending,
      "the acknowledged append"
    );

    const withAction = memberView.seen.filter(
      (s): s is Extract<EncounterSnapshot, { kind: "encounter" }> =>
        hasAction(s, action.id)
    );
    expect(withAction.at(0)?.pending).toBe(true);
    expect(withAction.at(-1)?.pending).toBe(false);
  });

  it("reports a missing document and a deleted one as `missing`", async () => {
    const dmRef = refFor("dm");
    const view = record(dmRef);
    await view.until((s) => s.kind === "missing", "the missing document");
    await createEncounter(dmRef, encounterOf(openingLog()));
    await view.until((s) => s.kind === "encounter", "the created document");
    await deleteEncounter(dmRef);
    await view.until((s) => s.kind === "missing", "the deleted document");
  });

  it("quarantines a document written with a future schema", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "campaigns", CAMPAIGN, "encounters", ENCOUNTER), {
        schema: 2,
        id: ENCOUNTER,
        log: [],
      });
    });
    const view = record(refFor("member"));
    const quarantined = await view.until(
      (s) => s.kind === "quarantined",
      "the quarantined document"
    );
    expect(quarantined).toEqual({ kind: "quarantined", reason: "schema" });
  });
});

describe("combat-io — contended appends (the same-round-trip race)", () => {
  it("two clients appending at once both land, one client's burst of ten lands whole, and every client folds the same state", async () => {
    const dm = sessionFor("dm");
    await createEncounter(dm.ref, encounterOf(openingLog()));
    const member = refFor("member");
    const fromDm = tableAction(
      "dm",
      { ms: 2_000, counter: 0, by: "dm" },
      { op: "end-turn" }
    );
    const fromMember = memberAction(2_000); // the SAME millisecond: only `by` orders them
    await Promise.all([appendAction(dm.ref, fromDm), appendAction(member, fromMember)]);
    // A drag burst: ten placements from one client without waiting for any acknowledgement.
    const burst = Array.from({ length: 10 }, (_, i) => memberAction(3_000 + i));
    await Promise.all(burst.map((action) => appendAction(member, action)));

    const stored = await storedEncounter();
    const ids = new Set(stored.log.map((action) => action.id));
    for (const action of [fromDm, fromMember, ...burst])
      expect(ids.has(action.id)).toBe(true);
    expect(stored.log).toHaveLength(openingLog().length + 12);

    // Each client reads the document through its own context and folds it; the fold must not
    // depend on the order Firestore stored the union in.
    const folds = await Promise.all(
      ["dm", "member"].map(async (uid) => {
        const snapshot = await getDoc(refFor(uid));
        const parsed = parseEncounter(snapshot.data());
        if (!parsed.ok) throw new Error(`${uid}: ${parsed.reason}`);
        return fold(parsed.encounter, catalogue);
      })
    );
    expect(folds[0]?.state).toEqual(folds[1]?.state);
    expect(folds[0]?.applied).toBe(openingLog().length + 12);
    expect(folds[0]?.rejections).toEqual([]);
    // The DM's and the member's same-millisecond stamps order by uid, deterministically.
    const ordered = sortBySeq(stored.log).map((action) => action.id);
    expect(ordered.indexOf(fromDm.id)).toBeLessThan(ordered.indexOf(fromMember.id));
  });
});

describe("combat-io — checkpointEncounter", () => {
  const staleThrough: Seq = { ms: 999_999, counter: 0, by: "nobody" };

  it("refuses a rewrite whose expected checkpoint does not match, leaving the document alone", async () => {
    const { db, ref: dmRef } = sessionFor("dm");
    const original = encounterOf(openingLog());
    await createEncounter(dmRef, original);
    const through = at(sortBySeq(original.log), 1).seq;
    const next = compact(original, catalogue, through);

    const outcome = await checkpointEncounter(db, dmRef, next, staleThrough);
    expect(outcome).toBe("stale");
    const stored = await storedEncounter();
    expect(stored.checkpoint).toBeNull();
    expect(stored.log).toHaveLength(original.log.length);
  });

  it("writes the checkpoint when the expectation matches, and keeps an append that raced the fold", async () => {
    const { db, ref: dmRef } = sessionFor("dm");
    const original = encounterOf(openingLog());
    await createEncounter(dmRef, original);
    const through = at(sortBySeq(original.log), 1).seq;
    // The caller folds here…
    const next = compact(original, catalogue, through);
    // …and a member appends BEFORE the transaction runs.
    const late = memberAction(9_200);
    await appendAction(refFor("member"), late);

    const outcome = await checkpointEncounter(db, dmRef, next, null);
    expect(outcome).toBe("written");

    const stored = await storedEncounter();
    expect(stored.checkpoint?.through).toEqual(through);
    expect(stored.log.map((action) => action.id)).toEqual([
      ...next.log.map((action) => action.id),
      late.id,
    ]);
    // The compacted document still folds to the same revision as the uncompacted one.
    expect(stored.checkpoint?.state.revision).toBe(next.checkpoint?.state.revision);
  });

  it("preserves a top-level key the document gained after the caller's fold", async () => {
    const { db, ref: dmRef } = sessionFor("dm");
    const original = encounterOf(openingLog());
    await createEncounter(dmRef, original);
    const through = at(sortBySeq(original.log), 1).seq;
    // The caller folds here…
    const next = compact(original, catalogue, through);
    // …and a NEWER build writes a top-level key this build does not know.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(
        doc(ctx.firestore(), "campaigns", CAMPAIGN, "encounters", ENCOUNTER),
        { tableNote: { from: "a future schema" } }
      );
    });

    expect(await checkpointEncounter(db, dmRef, next, null)).toBe("written");
    const stored = await storedEncounter();
    expect(stored.unknown).toEqual({ tableNote: { from: "a future schema" } });
    expect(stored.checkpoint?.through).toEqual(through);
  });

  it("refuses a second rewrite that still expects no checkpoint", async () => {
    const { db, ref: dmRef } = sessionFor("dm");
    const original = encounterOf(openingLog());
    await createEncounter(dmRef, original);
    const through = at(sortBySeq(original.log), 1).seq;
    const next = compact(original, catalogue, through);
    expect(await checkpointEncounter(db, dmRef, next, null)).toBe("written");
    expect(await checkpointEncounter(db, dmRef, next, null)).toBe("stale");
    const later = at(sortBySeq(original.log), 2).seq;
    const again = compact(original, catalogue, later);
    expect(await checkpointEncounter(db, dmRef, again, through)).toBe("written");
  });

  it("refuses to rewrite a document that is not there", async () => {
    const { db, ref: dmRef } = sessionFor("dm");
    expect(await checkpointEncounter(db, dmRef, encounterOf(openingLog()), null)).toBe(
      "stale"
    );
  });
});

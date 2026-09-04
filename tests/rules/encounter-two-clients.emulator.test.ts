/// <reference types="node" />
/**
 * THE STAGE GATE for stages 1–4: both acceptance replays fold IDENTICALLY on two real clients.
 *
 * EMULATOR-DEPENDENT — see the header of `firestore-rules.test.ts`; this file runs in the same
 * lane (`pnpm test:rules`) and shares its harness shape.
 *
 * `tests/unit/combat/replays.test.ts` already proves that each golden replay folds to its
 * expected state IN MEMORY, from one process, with the log handed to `fold` as an array. That
 * proves the reducer. It does not prove the thing the architecture actually promises: that the
 * DM's browser and a player's browser, holding the SAME shared document through two independent
 * Firestore listeners, arrive at the same state — and keep arriving at it while both sides
 * override each other and undo each other's overrides.
 *
 * So every action here travels through the real seam: `appendAction` (an `arrayUnion` under the
 * deployed `firestore.rules`), the server, and `subscribeEncounter` on every participating uid's
 * own authenticated client. Nothing is folded from a local array. What the gate covers:
 *
 *   · the replay itself — appended by the client of the uid that authored each action;
 *   · an override and an undo FROM EACH SIDE (DM overrides the PC's HP, the PC's controller
 *     overrides it back, each side undoes the other's override) — the DM's last word and the
 *     player's right to disagree, exercised against the same log;
 *   · compaction — the DM rewrites the document into a checkpoint and every other client's fold
 *     is byte-identical to the one it held before the rewrite;
 *   · the lease — a PC joins the table from its owner's client and leaves it again, with the
 *     entity written back into the owner's personal aggregate;
 *   · the access matrix at play scale: an outsider can neither read nor append.
 *
 * A failure here is NEVER fixed in this file: it means `src/lib/combat-io.ts`,
 * `src/lib/combat-lease.ts`, `src/lib/combat/checkpoint.ts` or `firestore.rules` is wrong.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { buildCatalogue } from "@/lib/combat/catalogue";
import {
  checkpointThrough,
  compact,
  COMPACT_ACTIONS,
  shouldCompact,
} from "@/lib/combat/checkpoint";
import { parseEncounter } from "@/lib/combat/codec";
import { fold, type FoldResult } from "@/lib/combat/fold";
import type { Seq } from "@/lib/combat/ids";
import type {
  Action,
  Encounter,
  Entity,
  FoldedState,
  Rejection,
} from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import {
  appendAction,
  checkpointEncounter,
  createEncounter,
  encounterRef,
  personalEncounterRef,
  subscribeEncounter,
} from "@/lib/combat-io";
import { joinTable, leaveTable, readLease } from "@/lib/combat-lease";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";
import {
  firstOf,
  openingActions,
  seqFactory,
} from "@tests/unit/combat/__helpers__/state";

const PROJECT_ID = "demo-d20folio";
const CAMPAIGN = "camp1";
const ENCOUNTER = "enc1";
/** The character `p-marco` leases into the table. */
const CHARACTER = "marco";
const REPLAY_DIR = join(__dirname, "../unit/combat/replays");
const WAIT_MS = 8_000;
const POLL_MS = 20;
const SEATED = ["dm", "p-marco", "p-hero"] as const;
const EVERYONE = [...SEATED, "outsider"] as const;

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

// ── The replay shape (mirrors `tests/unit/combat/replays.test.ts`) ──────────

type LogEntry = Omit<Action, "seq"> & { readonly by: string };

interface Replay {
  readonly name: string;
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly log: readonly LogEntry[];
  readonly expect: {
    readonly applied: number;
    readonly rejections: readonly {
      readonly action: string;
      readonly rejection: Rejection;
    }[];
    readonly state: Readonly<Record<string, unknown>>;
  };
}

function loadReplay(file: string): Replay {
  return JSON.parse(readFileSync(join(REPLAY_DIR, file), "utf8")) as Replay;
}

/** The SAME seq stamping the unit runner uses, so the two lanes fold the same order. */
function replayActions(replay: Replay): Action[] {
  return replay.log.map(
    (entry, index): Action =>
      ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
  );
}

/** Every uid that authors an action, the DM first. */
function authorsOf(replay: Replay): string[] {
  return [...new Set([replay.dm, ...replay.log.map((entry) => entry.by)])];
}

/** `start` + one `add-entity` and one `set-initiative` per entity + `begin-turns`. Derived, not
 *  a literal, so a fixture that gains an entity fails on the FOLD rather than on arithmetic. */
function openingCount(replay: Replay): number {
  return 2 + 2 * replay.entities.length;
}

function pick(state: FoldedState, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      state
    );
}

function entityOf(state: FoldedState, id: string): Entity {
  const entity = state.entities[id];
  if (entity === undefined) throw new Error(`expected the entity ${id} in the fold`);
  return entity;
}

// ── The harness ─────────────────────────────────────────────────────────────

let testEnv: RulesTestEnvironment;
const openSubscriptions: (() => void)[] = [];

/** `rules-unit-testing` still declares `firestore()` through the COMPAT namespace type, which is
 *  structurally narrower than the modular `Firestore` the adapter takes (it lacks `type` and
 *  `toJSON`). The instance is the modular one at runtime — every other call in this lane relies
 *  on that too — so the cast is a typings gap, not a behavioural one. */
function clientFor(uid: string): Firestore {
  return testEnv.authenticatedContext(uid).firestore() as unknown as Firestore;
}

/**
 * One participant: their own authenticated Firestore instance, their own listener on the shared
 * document, and their own fold of whatever that listener last delivered.
 *
 * The fold is LAZY and memoised on the delivered `Encounter` object, so the polling assertions
 * below fold once per snapshot rather than once per poll, and the two-hundred-append compaction
 * phase — which never asks for a fold — folds nothing at all. The memo is keyed on OBJECT
 * IDENTITY, which is deliberately weaker than the consumer contract a real client wants:
 * `parseEncounter` mints a fresh object per snapshot, so the appending client's pending →
 * acknowledged pair still folds twice here. That costs one extra fold and is not worth a
 * content hash in a test; skipping a pending-only flip is proved where it belongs, on the
 * adapter, by `encounter-io.emulator.test.ts`.
 */
interface Client {
  readonly uid: string;
  readonly db: Firestore;
  readonly ref: DocumentReference;
  latest(): Encounter | null;
  view(): FoldResult;
}

function connect(uid: string): Client {
  const db = clientFor(uid);
  const ref = encounterRef(db, CAMPAIGN, ENCOUNTER);
  let encounter: Encounter | null = null;
  let failure: Error | null = null;
  let memo: { readonly source: Encounter; readonly result: FoldResult } | null = null;
  openSubscriptions.push(
    subscribeEncounter(ref, (snapshot) => {
      if (snapshot.kind === "encounter") encounter = snapshot.encounter;
      else if (snapshot.kind === "missing") encounter = null;
      // A quarantine or a listener error is remembered, not thrown: throwing back INTO the
      // Firestore callback would surface as an uncaught exception attributed to no test.
      else if (snapshot.kind === "quarantined") {
        failure = new Error(`${uid}: the encounter was quarantined (${snapshot.reason})`);
      } else failure = snapshot.error;
    })
  );
  return {
    uid,
    db,
    ref,
    latest: () => {
      if (failure !== null) throw failure;
      return encounter;
    },
    view: () => {
      if (failure !== null) throw failure;
      const source = encounter;
      if (source === null) throw new Error(`${uid}: no encounter document yet`);
      if (memo === null || memo.source !== source) {
        memo = { source, result: fold(source, catalogue) };
      }
      return memo.result;
    },
  };
}

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    if (condition()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
}

/** Read the shared document as the admin, bypassing the rules. */
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

// ── One staged table ────────────────────────────────────────────────────────

interface Table {
  readonly replay: Replay;
  readonly clients: readonly Client[];
  readonly dm: Client;
  /** `applied` once the opening, the (optional) lease join and the replay have all folded. */
  readonly baseApplied: number;
  client(uid: string): Client;
  latest(): Encounter;
}

/** The lease join, appended by `p-marco`'s own client before the replay's log. */
const LEASE_ENTITY = testEntity({ id: "marco-pc", kind: "pc", controllerUid: "p-marco" });
const LEASE_EPOCH = 7;

/**
 * Seat every author at the table, open the encounter as the DM, optionally lease a PC in, then
 * replay the log — every action appended by the client of the uid that authored it.
 */
async function stage(replay: Replay, options: { lease: boolean }): Promise<Table> {
  const clients = authorsOf(replay).map(connect);
  const dm = firstOf(clients);
  const client = (uid: string): Client => {
    const found = clients.find((candidate) => candidate.uid === uid);
    if (found === undefined) throw new Error(`no client for ${uid}`);
    return found;
  };
  const latest = (): Encounter => {
    const encounter = dm.latest();
    if (encounter === null) throw new Error("the DM has no encounter document yet");
    return encounter;
  };

  const opening = openingActions(
    replay.dm,
    seqFactory(replay.dm, 1_000),
    replay.entities.map((entity) => testEntity(entity)),
    replay.initiative,
    replay.order
  );
  await createEncounter(dm.ref, {
    schema: 1,
    id: ENCOUNTER,
    host: { kind: "campaign", campaignId: CAMPAIGN },
    log: opening,
    checkpoint: null,
  });

  if (options.lease) {
    const marco = client("p-marco");
    await joinTable({
      db: marco.db,
      uid: "p-marco",
      characterId: CHARACTER,
      campaignId: CAMPAIGN,
      encounterId: ENCOUNTER,
      epoch: LEASE_EPOCH,
      entity: LEASE_ENTITY,
      action: { id: "lease-join", seq: { ms: 3_000, counter: 0, by: "p-marco" } },
    });
  }

  for (const action of replayActions(replay)) {
    await appendAction(client(action.by).ref, action);
  }

  // The opening, the join and the replay's own applied actions — counted explicitly so the
  // lease's extra `table:join` can never hide a missing or a duplicated replay action.
  const baseApplied = opening.length + (options.lease ? 1 : 0) + replay.expect.applied;
  await converge(clients, baseApplied, `the whole replay (${baseApplied} applied)`);
  return { replay, clients, dm, baseApplied, client, latest };
}

/** Every client has folded exactly `applied` actions, and they all hold the SAME state. */
async function converge(
  clients: readonly Client[],
  applied: number,
  label: string
): Promise<void> {
  await waitFor(
    () => clients.every((c) => c.latest() !== null && c.view().applied === applied),
    label
  );
  const reference = firstOf(clients);
  for (const client of clients) {
    expect(client.view().state, `${client.uid} vs ${reference.uid}: ${label}`).toEqual(
      reference.view().state
    );
  }
}

// ── The extra appends the gate prescribes ───────────────────────────────────

function override(
  id: string,
  ms: number,
  by: string,
  entity: string,
  hp: number
): Action {
  return {
    kind: "override",
    id,
    seq: { ms, counter: 0, by },
    by,
    entity,
    path: "vitals.hp",
    value: hp,
    reason: "the stage gate: an override from this side of the table",
  };
}

function undo(id: string, ms: number, by: string, of: string): Action {
  return { kind: "undo", id, seq: { ms, counter: 0, by }, by, of, reason: null };
}

/** Filler for compaction: the DM toggling a `visible` relation between the first two entities. */
function filler(index: number, a: string, b: string): Action {
  return {
    kind: "declare",
    id: `fill-${index}`,
    seq: { ms: 30_000 + index, counter: 0, by: "dm" },
    by: "dm",
    relation: { kind: "visible", a, b, value: index % 2 === 0 },
    remove: false,
    mover: null,
  };
}

/**
 * Grow the log past `COMPACT_ACTIONS`, compact it through the newest action (grace 0), and prove
 * every OTHER client's fold survived the rewrite untouched.
 */
async function compactAndVerify(table: Table): Promise<void> {
  const [a, b] = table.replay.entities;
  if (a === undefined || b === undefined) throw new Error("expected two entities");

  // A bound, not a belt: if `shouldCompact` ever stops agreeing with `COMPACT_ACTIONS` this
  // must fail with a sentence, not hang until the lane's timeout kills it.
  const ceiling = COMPACT_ACTIONS + 50;
  let index = 0;
  while (!shouldCompact(table.latest())) {
    if (index >= ceiling) {
      throw new Error(
        `appended ${index} filler actions (log ${table.latest().log.length}) without ` +
          `shouldCompact() turning true — COMPACT_ACTIONS is ${COMPACT_ACTIONS}`
      );
    }
    // Ten at a time: two hundred sequential emulator round-trips would eat the lane's budget,
    // and `arrayUnion` is exactly the write that does not need them serialised.
    const batch: Promise<void>[] = [];
    for (let n = 0; n < 10; n += 1, index += 1) {
      batch.push(appendAction(table.dm.ref, filler(index, a.id, b.id)));
    }
    await Promise.all(batch);
  }
  const total = table.latest().log.length;
  await waitFor(
    () => table.clients.every((c) => c.latest()?.log.length === total),
    `every client to hold all ${total} actions`
  );

  const before = new Map(table.clients.map((c) => [c.uid, c.view().state]));
  const source = table.latest();
  const through = checkpointThrough(source, 0);
  expect(through).not.toBeNull();
  expect(
    await checkpointEncounter(
      table.dm.db,
      table.dm.ref,
      compact(source, catalogue, through as Seq),
      null
    )
  ).toBe("written");

  const compacted = (client: Client): boolean => {
    const encounter = client.latest();
    return (
      encounter !== null && encounter.checkpoint !== null && encounter.log.length === 0
    );
  };
  await waitFor(
    () => table.clients.every(compacted),
    "the compacted document on every client"
  );
  for (const client of table.clients) {
    expect(client.view().state, `${client.uid} across the checkpoint`).toEqual(
      before.get(client.uid)
    );
  }
  const stored = await storedEncounter();
  expect(stored.log).toHaveLength(0);
  expect(stored.checkpoint?.through).toEqual(through);
}

// ── Environment ─────────────────────────────────────────────────────────────

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(join(__dirname, "../../firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(() => {
  while (openSubscriptions.length > 0) openSubscriptions.pop()?.();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const uid of EVERYONE) {
      await setDoc(doc(db, "users", uid), { status: "active" });
    }
    await setDoc(doc(db, "campaigns", CAMPAIGN), {
      name: "Test Table",
      createdBy: "dm",
      dmUid: "dm",
      members: [...SEATED],
      memberDetails: Object.fromEntries(
        SEATED.map((uid) => [
          uid,
          { displayName: uid, characterId: null, role: uid === "dm" ? "dm" : "player" },
        ])
      ),
      status: "active",
      inviteCode: CAMPAIGN,
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
    });
    // The parent the lease marks. No `shared` flag and no public sheet: an owner-only document.
    await setDoc(doc(db, "users", "p-marco", "characters", CHARACTER), {
      revision: 0,
      state: {},
      build: {},
      status: "active",
    });
  });
});

/**
 * The gate's "an override and an undo from each side", against the PC the replay is about.
 *
 * Each step converges on EVERY client before the next one is appended, so the assertion is not
 * just "the end state agrees" but "the table never disagrees along the way".
 */
async function overrideAndUndoFromEachSide(table: Table): Promise<void> {
  const pc = firstOf(table.replay.entities.filter((entity) => entity.kind === "pc"));
  const before = entityOf(table.dm.view().state, pc.id);
  const controller = table.client(before.controllerUid);

  await appendAction(table.dm.ref, override("x-dm-over", 20_000, "dm", pc.id, 1));
  await converge(table.clients, table.baseApplied + 1, "the DM's override");
  expect(entityOf(table.dm.view().state, pc.id).vitals.hp).toBe(1);

  await appendAction(
    controller.ref,
    override("x-pc-over", 20_001, controller.uid, pc.id, 5)
  );
  await converge(table.clients, table.baseApplied + 2, "the player's override");
  expect(entityOf(table.dm.view().state, pc.id).vitals.hp).toBe(5);

  // An undo is a LOG-level fact: it is never itself "applied", and it takes the action it
  // targets out of the count — so the player undoing the DM leaves exactly ONE override standing.
  await appendAction(
    controller.ref,
    undo("x-pc-undo", 20_002, controller.uid, "x-dm-over")
  );
  await converge(table.clients, table.baseApplied + 1, "the player undoing the DM");
  expect(entityOf(table.dm.view().state, pc.id).vitals.hp).toBe(5);

  await appendAction(table.dm.ref, undo("x-dm-undo", 20_003, "dm", "x-pc-over"));
  await converge(table.clients, table.baseApplied, "the DM undoing the player");
  // Not merely the HP: the whole entity is back to what the REPLAY left — including the
  // `overrides` ledger, which for Sara still carries the DM's own hand-applied 17.
  expect(entityOf(table.dm.view().state, pc.id)).toEqual(before);

  const stored = await storedEncounter();
  expect(stored.log.map((action) => action.id)).toEqual(
    expect.arrayContaining(["x-dm-over", "x-pc-over", "x-pc-undo", "x-dm-undo"])
  );
}

/** The replay itself, as EVERY client sees it: same rejections, same count, same state. */
function expectTheReplay(table: Table): void {
  for (const client of table.clients) {
    const view = client.view();
    expect(view.rejections, client.uid).toEqual(table.replay.expect.rejections);
    expect(view.applied, client.uid).toBe(table.baseApplied);
    for (const [path, expected] of Object.entries(table.replay.expect.state)) {
      expect(pick(view.state, path), `${client.uid}: ${path}`).toEqual(expected);
    }
  }
}

// ── Marco's first turn (PRODUCT.md acceptance story 1) ──────────────────────

describe("the stage gate — Marco's first turn on two clients", () => {
  const replay = loadReplay("marco-first-turn.json");
  let table: Table;

  beforeEach(async () => {
    table = await stage(replay, { lease: true });
  });

  it("folds identically on the DM's and the player's clients, through an override and an undo from each side", async () => {
    expect(table.baseApplied).toBe(openingCount(replay) + 1 + replay.expect.applied);
    expectTheReplay(table);

    // The lease: the joined PC is in the fold and the character parent carries the marker.
    const marco = table.client("p-marco");
    expect(entityOf(table.dm.view().state, LEASE_ENTITY.id)).toEqual(LEASE_ENTITY);
    const character = await getDoc(
      doc(marco.db, "users", "p-marco", "characters", CHARACTER)
    );
    expect(readLease(character.data())).toEqual({
      campaignId: CAMPAIGN,
      encounterId: ENCOUNTER,
      epoch: LEASE_EPOCH,
    });

    // An outsider sits at no table: no read, no append.
    const outsider = encounterRef(clientFor("outsider"), CAMPAIGN, ENCOUNTER);
    await assertFails(getDoc(outsider));
    await assertFails(
      appendAction(outsider, override("x-outsider", 21_000, "outsider", "marco", 1))
    );

    await overrideAndUndoFromEachSide(table);
  });

  it("compacts to a checkpoint every client folds identically, then returns the leased PC", async () => {
    await compactAndVerify(table);

    // The lease is handed back: the entity leaves the table and lands in the owner's personal
    // aggregate as a `table:sync`, with the lease marker cleared. This is also the one member
    // append in the suite that lands on a log the checkpoint has just emptied.
    const marco = table.client("p-marco");
    const folded = entityOf(table.dm.view().state, LEASE_ENTITY.id);
    await leaveTable({
      db: marco.db,
      uid: "p-marco",
      characterId: CHARACTER,
      campaignId: CAMPAIGN,
      encounterId: ENCOUNTER,
      entity: folded,
      leave: { id: "lease-leave", seq: { ms: 90_000, counter: 0, by: "p-marco" } },
      sync: { id: "lease-sync", seq: { ms: 90_001, counter: 0, by: "p-marco" } },
      personal: null,
    });
    await waitFor(
      () =>
        table.clients.every(
          (c) =>
            c.latest() !== null && c.view().state.entities[LEASE_ENTITY.id] === undefined
        ),
      "the leased PC to leave every client's fold"
    );

    const personal = await getDoc(personalEncounterRef(marco.db, "p-marco", CHARACTER));
    const parsed = parseEncounter(personal.data());
    if (!parsed.ok) {
      throw new Error(`the personal aggregate did not parse: ${parsed.reason}`);
    }
    expect(parsed.encounter.host).toEqual({
      kind: "personal",
      uid: "p-marco",
      characterId: CHARACTER,
    });
    expect(parsed.encounter.log).toHaveLength(1);
    const sync = firstOf(parsed.encounter.log);
    if (sync.kind !== "table" || sync.table.op !== "sync") {
      throw new Error(`expected a table:sync, got ${JSON.stringify(sync)}`);
    }
    expect(sync.table.entity).toEqual(folded);

    const character = await getDoc(
      doc(marco.db, "users", "p-marco", "characters", CHARACTER)
    );
    expect(readLease(character.data())).toBeNull();
  });
});

// ── Sara's ogre ambush (PRODUCT.md acceptance story 2) ──────────────────────

describe("the stage gate — Sara's ogre ambush on two clients", () => {
  const replay = loadReplay("sara-ogre-ambush.json");
  let table: Table;

  beforeEach(async () => {
    table = await stage(replay, { lease: false });
  });

  it("folds identically on the DM's and the player's clients, through an override and an undo from each side", async () => {
    // No lease here: the opening plus the replay's own applied actions, nothing else.
    expect(table.baseApplied).toBe(openingCount(replay) + replay.expect.applied);
    expectTheReplay(table);
    await overrideAndUndoFromEachSide(table);
  });

  it("compacts to a checkpoint every client folds identically", async () => {
    await compactAndVerify(table);
  });
});

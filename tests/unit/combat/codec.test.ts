/**
 * The encounter codec: the closed-world write/parse boundary for the persisted `Encounter`
 * (schema 1). Every golden replay round-trips through write → parse → write; a handful of
 * hand-built fixtures pin the failure reasons and the unknown-key bucket.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encounterWriteData, parseEncounter } from "@/lib/combat/codec";
import type { Action, Encounter } from "@/lib/combat/types";
import { emptyState, openingActions, seqFactory } from "./__helpers__/state";
import { testEntity } from "./__helpers__/entities";

const REPLAY_DIR = join(__dirname, "replays");

type LogEntry = Omit<Action, "seq"> & { readonly by: string };

interface Replay {
  readonly dm: string;
  readonly entities: readonly Parameters<typeof testEntity>[0][];
  readonly initiative: Readonly<Record<string, number>>;
  readonly order: readonly string[];
  readonly log: readonly LogEntry[];
}

/** Builds the same `Encounter` shape `replays.test.ts` folds: opening table ops, then the
 *  JSON log stamped with `seq: { ms: 5_000 + index, counter: 0, by }`. */
function encounterFromReplay(file: string): Encounter {
  const replay = JSON.parse(readFileSync(join(REPLAY_DIR, file), "utf8")) as Replay;
  const seq = seqFactory(replay.dm);
  const opening = openingActions(
    replay.dm,
    seq,
    replay.entities.map((entity) => testEntity(entity)),
    replay.initiative,
    replay.order
  );
  const log = replay.log.map(
    (entry, index): Action =>
      ({ ...entry, seq: { ms: 5_000 + index, counter: 0, by: entry.by } }) as Action
  );
  return {
    schema: 1,
    id: file,
    host: { kind: "campaign", campaignId: "replay" },
    log: [...opening, ...log],
    checkpoint: null,
  };
}

function minimalEncounter(
  overrides: Readonly<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    schema: 1,
    id: "enc-1",
    host: { kind: "campaign", campaignId: "camp-1" },
    log: [],
    checkpoint: null,
    ...overrides,
  };
}

function roundTrip(raw: unknown): void {
  const parsed = parseEncounter(raw);
  if (!parsed.ok) throw new Error(`expected ok, got reason ${parsed.reason}`);
  expect(encounterWriteData(parsed.encounter)).toEqual(raw);
}

describe("parseEncounter / encounterWriteData — golden replays round-trip (a)", () => {
  const files = readdirSync(REPLAY_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();
  it("has at least one replay", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(`${file}: write → parse → write round-trips`, () => {
      const encounter = encounterFromReplay(file);
      const written = encounterWriteData(encounter);
      const parsed = parseEncounter(written);
      if (!parsed.ok) throw new Error(`expected ok, got reason ${parsed.reason}`);
      expect(encounterWriteData(parsed.encounter)).toEqual(written);
    });
  }
});

describe("parseEncounter — unknown top-level keys (b)", () => {
  it("preserves an unknown top-level key and exposes it as encounter.unknown", () => {
    const raw = minimalEncounter({ future: { a: 1 } });
    const parsed = parseEncounter(raw);
    if (!parsed.ok) throw new Error(`expected ok, got reason ${parsed.reason}`);
    expect(parsed.encounter.unknown?.future).toEqual({ a: 1 });
    expect(encounterWriteData(parsed.encounter)).toEqual(raw);
  });

  it("omits `unknown` entirely when there are no extra keys", () => {
    const raw = minimalEncounter();
    const parsed = parseEncounter(raw);
    if (!parsed.ok) throw new Error(`expected ok, got reason ${parsed.reason}`);
    expect(parsed.encounter.unknown).toBeUndefined();
  });
});

describe("parseEncounter — schema mismatch (c)", () => {
  it("schema: 2 is rejected with reason 'schema'", () => {
    const raw = minimalEncounter({ schema: 2 });
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "schema" });
  });
});

describe("parseEncounter — malformed log entry (d)", () => {
  it("a log entry missing seq quarantines the whole document", () => {
    const raw = minimalEncounter({
      log: [{ id: "a1", by: "dm", kind: "table", table: { op: "end-turn" } }],
    });
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("parseEncounter — malformed checkpoint (e)", () => {
  it("a checkpoint whose state.entities is not a map quarantines the whole document", () => {
    const state = { ...emptyState(), entities: [] };
    const raw = minimalEncounter({
      checkpoint: { through: { ms: 1, counter: 0, by: "dm" }, state },
    });
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("parseEncounter / encounterWriteData — override value round-trip (f)", () => {
  it("an override action with a nested JSON value round-trips", () => {
    const raw = minimalEncounter({
      log: [
        {
          id: "ov-1",
          seq: { ms: 10, counter: 0, by: "dm" },
          by: "dm",
          kind: "override",
          entity: "e1",
          path: "vitals.hp",
          value: { nested: [1, "x", null] },
          reason: "test",
        },
      ],
    });
    roundTrip(raw);
  });

  it("an override action with a null value round-trips", () => {
    const raw = minimalEncounter({
      log: [
        {
          id: "ov-2",
          seq: { ms: 11, counter: 0, by: "dm" },
          by: "dm",
          kind: "override",
          entity: "e1",
          path: "vitals.hp",
          value: null,
          reason: "test",
        },
      ],
    });
    roundTrip(raw);
  });
});

describe("parseEncounter / encounterWriteData — roll seed round-trip (g)", () => {
  it("a manual roll with seed: null round-trips", () => {
    const raw = minimalEncounter({
      log: [
        {
          id: "r-1",
          seq: { ms: 20, counter: 0, by: "dm" },
          by: "dm",
          kind: "roll",
          roll: {
            formula: "1d20",
            faces: [10],
            total: 10,
            seed: null,
            source: "manual",
            hidden: false,
            roller: "e1",
            purpose: "attack",
            label: null,
          },
        },
      ],
    });
    roundTrip(raw);
  });

  it("an app roll with a numeric seed round-trips", () => {
    const raw = minimalEncounter({
      log: [
        {
          id: "r-2",
          seq: { ms: 21, counter: 0, by: "dm" },
          by: "dm",
          kind: "roll",
          roll: {
            formula: "1d20",
            faces: [14],
            total: 14,
            seed: 5,
            source: "app",
            hidden: false,
            roller: "e1",
            purpose: "attack",
            label: null,
          },
        },
      ],
    });
    roundTrip(raw);
  });
});

describe("parseEncounter / encounterWriteData — every table op kind round-trips (h)", () => {
  const entity = testEntity({ id: "goblin-1" });
  const ops: readonly Record<string, unknown>[] = [
    { op: "start", epoch: 7 },
    { op: "add-entity", entity },
    { op: "remove-entity", entity: "goblin-1" },
    { op: "join", entity },
    { op: "leave", entity: "goblin-1" },
    { op: "sync", entity },
    { op: "set-initiative", entity: "goblin-1", value: 12 },
    { op: "begin-turns", order: ["goblin-1"] },
    { op: "end-turn" },
    { op: "end" },
    { op: "rest", rest: "short" },
    { op: "settings", revealMonsterHp: true, automation: "propose-and-confirm" },
  ];

  it.each(ops.map((table) => [String(table.op), table] as const))(
    "table op %s round-trips",
    (_name, table) => {
      const raw = minimalEncounter({
        log: [
          {
            id: `t-${String(table.op)}`,
            seq: { ms: 30, counter: 0, by: "dm" },
            by: "dm",
            kind: "table",
            table,
          },
        ],
      });
      roundTrip(raw);
    }
  );
});

describe("parseEncounter — non-record input (i)", () => {
  const values: readonly unknown[] = [null, undefined, 42, "x", true, [1, 2, 3]];
  it.each(values.map((value) => [JSON.stringify(value ?? "undefined"), value] as const))(
    "%s is rejected with reason 'not-a-record'",
    (_label, value) => {
      expect(parseEncounter(value)).toEqual({ ok: false, reason: "not-a-record" });
    }
  );
});

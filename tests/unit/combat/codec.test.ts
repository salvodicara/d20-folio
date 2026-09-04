/**
 * The encounter codec: the closed-world write/parse boundary for the persisted `Encounter`
 * (schema 1). Every golden replay round-trips through write → parse → write; a handful of
 * hand-built fixtures pin the failure reasons and the unknown-key bucket.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { encounterWriteData, parseEncounter } from "@/lib/combat/codec";
import { fold } from "@/lib/combat/fold";
import type { Action, Encounter, FoldedState } from "@/lib/combat/types";
import { conformMechanic, type Mechanic } from "@/lib/combat/mechanic";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { emptyState, firstOf, openingActions, seqFactory } from "./__helpers__/state";
import { testEntity } from "./__helpers__/entities";

const REPLAY_DIR = join(__dirname, "replays");
const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

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

/** A carried mechanic exercising the fat end of the authoring vocabulary: an area save spell
 *  with a nested predicate, an upcast slot cost, every input kind and a `dash` step. */
const CARRIED: Mechanic = {
  schema: 1,
  id: "pc:marco:spell-fireball",
  source: "pack",
  label: "label:fireball",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [
        { kind: "turn", claim: "action" },
        { kind: "slot", level: 3, upcast: true },
        { kind: "concentration" },
        { kind: "resource", id: "ki", amount: 1 },
      ],
      targets: {
        count: "area",
        eligibility: {
          all: [
            { not: { is: ["$self", "$target"] } },
            { any: [{ hp: "$target", op: ">", value: "half-max" }] },
          ],
        },
        area: { kind: "cone", origin: "origin", aim: "aim", lengthFt: 30 },
      },
      inputs: [
        { id: "save", kind: "d20", for: "save", ability: "DEX", perTarget: true },
        { id: "damage", kind: "dice", formula: "8d6" },
        { id: "pick", kind: "choice", options: ["label:a", "label:b"] },
        { id: "ruling", kind: "table", label: "label:ruling" },
        { id: "origin", kind: "position" },
      ],
      steps: [
        {
          id: "burn",
          kind: "save",
          roll: "save",
          ability: "DEX",
          dc: "spell",
          onSuccess: "half",
        },
        {
          id: "scorch",
          kind: "damage",
          parts: [{ dice: "damage", type: "fire" }],
          to: "$target",
          when: { outcome: "save-fail" },
        },
        {
          id: "ward",
          kind: "effect-start",
          effect: {
            kind: "standing",
            to: "$self",
            lifetime: { kind: "seconds", remaining: { byLevel: { 1: 60, 3: 600 } } },
            acBonus: 2,
            concentration: true,
            advantage: false,
            riders: [{ dice: "1d4", type: "force", on: "any-hit", vs: { mark: "self" } }],
          },
        },
        { id: "sprint", kind: "dash" },
      ],
    },
    {
      id: "react",
      trigger: {
        kind: "event",
        event: { kind: "hp-zero", of: { markedBy: "self" } },
        scope: "controlled",
        window: true,
      },
      steps: [
        { id: "note", kind: "manual-table", label: "label:note" },
        {
          id: "heal",
          kind: "heal",
          amount: { sum: [3, { ability: "WIS" }] },
          to: "$self",
        },
      ],
    },
  ],
};

/** A `FoldedState` with every field populated — the checkpoint fixture shared by the
 *  round-trip test and the node-ceiling test. */
function populatedFoldedState(): FoldedState {
  const entity = testEntity({ id: "goblin-1" });
  return {
    epoch: 3,
    clock: {
      phase: "turns",
      round: 2,
      order: ["goblin-1", "hero-1"],
      current: "hero-1",
      initiative: { "goblin-1": 12, "hero-1": 18 },
      restOrdinal: 0,
      dayPhaseOrdinal: 0,
    },
    entities: { "goblin-1": entity },
    mechanics: { [CARRIED.id]: CARRIED },
    relations: [
      { kind: "cover", target: "goblin-1", from: null, degree: "half" },
      { kind: "adjacent", a: "goblin-1", b: "hero-1" },
    ],
    effects: {
      "effect-standing": {
        id: "effect-standing",
        source: {
          entity: "hero-1",
          mechanic: "core:move",
          action: "a1",
          castLevel: null,
        },
        target: "hero-1",
        payload: {
          kind: "standing",
          facts: {
            acBonus: 2,
            advantageOnAttacks: true,
            resistances: ["fire"],
            riders: [],
          },
        },
        lifetime: { kind: "turn-edge", entity: "hero-1", edge: "start", round: 2 },
        concentration: false,
      },
      "effect-condition": {
        id: "effect-condition",
        source: {
          entity: "goblin-1",
          mechanic: "monster:goblin:scimitar",
          action: "a2",
          castLevel: null,
        },
        target: "hero-1",
        payload: { kind: "condition", condition: "poisoned" },
        lifetime: { kind: "rounds", remaining: 3 },
        concentration: false,
      },
      "effect-mark": {
        id: "effect-mark",
        source: { entity: "hero-1", mechanic: "core:move", action: "a3", castLevel: 1 },
        target: "goblin-1",
        payload: {
          kind: "mark",
          riders: [{ dice: "1d6", type: "fire", on: "weapon-hit", vs: { mark: "self" } }],
          advantage: false,
        },
        lifetime: { kind: "rest", rest: "short", minimumOrdinal: 1 },
        concentration: true,
      },
    },
    windows: [
      {
        id: "w1",
        event: {
          kind: "attack-declared",
          attacker: "goblin-1",
          target: "hero-1",
          action: "a2",
        },
        eligible: ["hero-1"],
        declared: "a2",
      },
    ],
    checks: [{ id: "c1", entity: "hero-1", kind: "concentration", dc: 12, cause: "a3" }],
    declared: {
      a4: {
        id: "a4",
        seq: { ms: 100, counter: 0, by: "dm" },
        by: "dm",
        kind: "intent",
        entity: "hero-1",
        mechanic: "core:move",
        program: "move",
        targets: [],
        answers: { to: { x: 1, y: 1 } },
        payment: [],
        window: "w1",
        basedOn: 0,
      },
    },
    rolls: {
      r1: {
        formula: "1d20",
        faces: [10],
        total: 10,
        seed: null,
        source: "manual",
        hidden: false,
        roller: "hero-1",
        purpose: "attack",
        label: null,
      },
    },
    spent: { r1: "a4" },
    nextOrdinal: 5,
    revision: 7,
    settings: { revealMonsterHp: false, automation: "log-only" },
    map: {
      background: {
        path: "campaigns/c1/maps/m1.jpeg",
        url: "https://example.test/m1.jpeg?token=x",
        width: 3000,
        height: 2000,
        cellPx: 100,
        origin: { x: 0, y: 0 },
        bytes: 1_234_567,
      },
      fog: { covered: true, revealed: [{ x: 0, y: 0, w: 4, h: 3 }] },
    },
  };
}

describe("parseEncounter / encounterWriteData — a populated checkpoint round-trips (Important)", () => {
  it("a checkpoint with a full FoldedState round-trips and its state folds further", () => {
    const populatedState = populatedFoldedState();
    const raw = minimalEncounter({
      checkpoint: { through: { ms: 99, counter: 0, by: "dm" }, state: populatedState },
    });

    const parsed = parseEncounter(raw);
    if (!parsed.ok) throw new Error(`expected ok, got reason ${parsed.reason}`);
    expect(encounterWriteData(parsed.encounter)).toEqual(raw);

    const result = fold(parsed.encounter, catalogue);
    expect(result.state.revision).toBe(populatedState.revision);
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
    { op: "add-entity", entity, mechanics: [CARRIED] },
    { op: "remove-entity", entity: "goblin-1" },
    { op: "join", entity, mechanics: [] },
    { op: "leave", entity: "goblin-1" },
    { op: "sync", entity, mechanics: [CARRIED] },
    { op: "set-initiative", entity: "goblin-1", value: 12 },
    { op: "begin-turns", order: ["goblin-1"] },
    { op: "end-turn" },
    { op: "end" },
    { op: "rest", rest: "short" },
    { op: "settings", revealMonsterHp: true, automation: "propose-and-confirm" },
    {
      op: "map",
      background: {
        path: "campaigns/c1/maps/m1.jpeg",
        url: "https://example.test/m1.jpeg?token=x",
        width: 3000,
        height: 2000,
        cellPx: 100,
        origin: { x: -12, y: 4 },
        bytes: 1_234_567,
      },
    },
    { op: "fog", change: { kind: "cover", covered: true } },
    { op: "fog", change: { kind: "reveal", rect: { x: 0, y: 0, w: 4, h: 3 } } },
    { op: "fog", change: { kind: "hide", rect: { x: 1, y: 1, w: 1, h: 1 } } },
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

describe("parseEncounter — carried mechanics are closed-world (stage 6 §2 D2)", () => {
  const seq = seqFactory("dm");
  const entity = testEntity({ id: "goblin-1" });

  function documentWith(mechanics: readonly unknown[]): Record<string, unknown> {
    return encounterWriteData({
      schema: 1,
      id: "enc-1",
      host: { kind: "campaign", campaignId: "camp-1" },
      log: [
        {
          kind: "table",
          id: "t-1",
          seq: seq(),
          by: "dm",
          table: {
            op: "add-entity",
            entity,
            mechanics: mechanics as readonly Mechanic[],
          },
        },
      ],
      checkpoint: null,
    });
  }

  it("round-trips a carried mechanic verbatim", () => {
    const parsed = parseEncounter(documentWith([CARRIED]));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const action = firstOf(parsed.encounter.log);
    if (action.kind !== "table" || action.table.op !== "add-entity") {
      throw new Error("expected the add-entity op back");
    }
    expect(action.table.mechanics).toEqual([CARRIED]);
  });

  it("quarantines the document for an unknown step kind, as an unknown action kind does", () => {
    const alien = {
      ...CARRIED,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          steps: [{ id: "warp", kind: "teleport", to: "$target" }],
        },
      ],
    };
    expect(parseEncounter(documentWith([alien]))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });

  it("what the codec quarantines, the fold-time check rejects — one vocabulary", () => {
    // The dangerous asymmetry (review finding 3): a definition `conformMechanic` waved through
    // but `mechanicSchema` refuses would be WRITTEN, then quarantine the encounter on every
    // client including the writer — and `checkpointEncounter` refuses to repair a quarantined
    // document, so the table would be dead with no way back.
    const malformed: readonly unknown[] = [
      { ...CARRIED, active: [{ id: "cast", trigger: {}, steps: [] }] },
      { ...CARRIED, active: [{ id: "cast", trigger: { kind: "telepathy" }, steps: [] }] },
      {
        ...CARRIED,
        active: [
          {
            id: "cast",
            trigger: { kind: "invocation", economy: "action" },
            cost: [{ kind: "mana", level: 1 }],
            steps: [],
          },
        ],
      },
      {
        ...CARRIED,
        active: [
          {
            id: "cast",
            trigger: { kind: "invocation", economy: "action" },
            steps: [{ id: "warp", kind: "teleport", to: "$target" }],
          },
        ],
      },
      { ...CARRIED, source: "not-a-source" },
      { ...CARRIED, bogus: true },
    ];
    for (const value of malformed) {
      const label = JSON.stringify(value).slice(0, 80);
      expect(conformMechanic(value).ok, `conformMechanic: ${label}`).toBe(false);
      expect(parseEncounter(documentWith([value])).ok, `codec: ${label}`).toBe(false);
    }
  });

  it("quarantines the document for an unknown key inside a program", () => {
    const alien = {
      ...CARRIED,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          steps: [{ id: "note", kind: "manual-table", label: "l" }],
          nonsense: true,
        },
      ],
    };
    expect(parseEncounter(documentWith([alien]))).toEqual({
      ok: false,
      reason: "malformed",
    });
  });
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

describe("parseEncounter — unsafe top-level keys never silently drop data", () => {
  it("a top-level __proto__ key is rejected as malformed, not silently dropped", () => {
    const raw: unknown = JSON.parse(
      '{"schema":1,"id":"enc-1","host":{"kind":"campaign","campaignId":"camp-1"},' +
        '"log":[],"checkpoint":null,"__proto__":{"a":1}}'
    );
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("parseEncounter — a pathologically deep unknown value fails closed", () => {
  function deepValue(depth: number): unknown {
    let value: unknown = 0;
    for (let i = 0; i < depth; i += 1) value = { nested: value };
    return value;
  }

  it("a 100-deep nested value under an unknown key is malformed, not thrown", () => {
    const raw = minimalEncounter({ future: deepValue(100) });
    expect(() => parseEncounter(raw)).not.toThrow();
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("parseEncounter — the log length ceiling", () => {
  function declareAction(index: number): Record<string, unknown> {
    return {
      id: `d-${index}`,
      seq: { ms: 1_000 + index, counter: 0, by: "dm" },
      by: "dm",
      kind: "declare",
      relation: { kind: "adjacent", a: "a", b: "b" },
      remove: false,
      mover: null,
    };
  }

  it("2,048 actions parse", () => {
    const raw = minimalEncounter({
      log: Array.from({ length: 2_048 }, (_, index) => declareAction(index)),
    });
    expect(parseEncounter(raw).ok).toBe(true);
  });

  it("2,049 actions are rejected as malformed", () => {
    const raw = minimalEncounter({
      log: Array.from({ length: 2_049 }, (_, index) => declareAction(index)),
    });
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

// The BINDING ceiling is not the 2,048-entry collection cap but `exact-schema`'s
// `MAX_VALUES` = 50,000 JSON nodes counted over the WHOLE known-keys object — log and
// checkpoint together. A document past it quarantines on every client, and
// `checkpointEncounter` refuses to rewrite a quarantined document, so compaction — the only
// repair — is exactly what stops working. `firestore.rules` therefore caps the log at 1,000
// entries; this pins that a full 1,000-entry log of REALISTIC actions (Marco's Fireball
// intent, the fattest shape the prototype produces) plus a fully populated checkpoint stays
// inside the node budget.
describe("parseEncounter — the node budget at the rules' log cap", () => {
  /** Marco's Fireball intent (`replays/marco-first-turn.json`), with an explicit target list
   *  and a slot payment: ~34 JSON nodes, well above the 21-node log average. */
  function fireballIntent(index: number): Record<string, unknown> {
    return {
      id: `i-${index}`,
      seq: { ms: 1_000 + index, counter: 0, by: "p-marco" },
      by: "p-marco",
      kind: "intent",
      entity: "marco",
      mechanic: "srd:spell:fireball",
      program: "cast",
      targets: ["goblin-1", "goblin-2", "goblin-3"],
      answers: {
        origin: { x: 7, y: 1 },
        "save:goblin-1": { roll: `r-save-1-${index}` },
        "save:goblin-2": { roll: `r-save-2-${index}` },
        "save:goblin-3": { roll: `r-save-3-${index}` },
        damage: { roll: `r-damage-${index}` },
      },
      payment: [{ kind: "slot", level: 3, pool: "standard" }],
      window: null,
      basedOn: 0,
    };
  }

  it("1,000 realistic intents plus a populated checkpoint parse", () => {
    const raw = minimalEncounter({
      log: Array.from({ length: 1_000 }, (_, index) => fireballIntent(index)),
      checkpoint: {
        through: { ms: 999, counter: 0, by: "dm" },
        state: populatedFoldedState(),
      },
    });
    expect(parseEncounter(raw).ok).toBe(true);
  });

  it("2,000 of the same actions quarantine — what the old rules cap admitted", () => {
    // 2,000 x 34 nodes = 68,000, past `MAX_VALUES`. The document would fail to parse on
    // every client and `checkpointEncounter` would refuse to repair it.
    const raw = minimalEncounter({
      log: Array.from({ length: 2_000 }, (_, index) => fireballIntent(index)),
    });
    expect(parseEncounter(raw)).toEqual({ ok: false, reason: "malformed" });
  });
});

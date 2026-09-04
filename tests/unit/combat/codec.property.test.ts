/**
 * The §8 codec round-trip PROPERTY test (design spec §5.5, §8): for generated encounters over
 * every action kind, every table op, entities with and without a position, populated
 * checkpoints and unknown top-level keys, `parseEncounter(encounterWriteData(e))` is `e`.
 *
 * The generator is a 30-line seeded PRNG (mulberry32) rather than a dependency: the repository
 * vets dependencies (golden rule 34) and the property needs nothing a seed cannot give. A
 * failing seed is printed so a case can be replayed; `SEEDS` covers a few hundred documents.
 */
import { describe, expect, it } from "vitest";
import { encounterWriteData, parseEncounter } from "@/lib/combat/codec";
import { ROLL_PURPOSES, type RollRecord } from "@/lib/combat/dice";
import type {
  Action,
  Effect,
  Encounter,
  Entity,
  FoldedState,
  MapRect,
  Relation,
  TableOp,
} from "@/lib/combat/types";
import { testEntity } from "./__helpers__/entities";
import { emptyState } from "./__helpers__/state";

const CASES = 300;

/** mulberry32 — a small, well-known 32-bit PRNG; deterministic per seed. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Gen {
  readonly next: () => number;
  int(min: number, max: number): number;
  bool(): boolean;
  pick<T>(items: readonly T[]): T;
  str(prefix: string): string;
  maybe<T>(value: () => T): T | null;
}

function gen(seed: number): Gen {
  const next = prng(seed);
  const g: Gen = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    bool: () => next() < 0.5,
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error("pick from an empty list");
      return item;
    },
    str: (prefix) => `${prefix}-${g.int(0, 9999)}`,
    maybe: (value) => (next() < 0.3 ? null : value()),
  };
  return g;
}

const ENTITY_IDS = ["hero", "goblin-1", "goblin-2", "ogre", "wolf"] as const;
const DAMAGE = ["fire", "cold", "slashing", "piercing"] as const;

function genRect(g: Gen): MapRect {
  return { x: g.int(-50, 50), y: g.int(-50, 50), w: g.int(1, 20), h: g.int(1, 20) };
}

function genEntity(g: Gen, id: string): Entity {
  const base = testEntity({
    id,
    kind: g.pick(["pc", "monster", "npc", "summon", "companion", "object"] as const),
    hp: g.int(0, 60),
    maxHp: g.int(1, 60),
    ac: g.int(8, 22),
    tempHp: g.bool() ? g.int(1, 10) : undefined,
    life: g.pick(["alive", "dying", "stable", "dead"] as const),
    resistances: g.bool() ? [g.pick(DAMAGE)] : [],
    controllerUid: g.pick(["dm", "p1", "p2"]),
    mechanics: g.bool() ? ["core:move", "srd:weapon:shortsword"] : [],
    position: g.maybe(() => ({ x: g.int(-20, 40), y: g.int(-20, 40) })),
    hidden: g.bool(),
  });
  const overrides: Record<string, { value: unknown; reason: string; by: string }> = {};
  if (g.bool())
    overrides["vitals.hp"] = { value: g.int(0, 30), reason: g.str("r"), by: "dm" };
  if (g.bool()) overrides.position = { value: null, reason: g.str("r"), by: "dm" };
  if (g.bool())
    overrides["stats.speed"] = {
      value: { nested: [1, "two", null] },
      reason: "x",
      by: "p1",
    };
  return {
    ...base,
    resources: g.bool()
      ? {
          rage: {
            current: g.int(0, 3),
            max: 3,
            recharge: g.pick(["short", "long", "never"]),
          },
        }
      : {},
    concentration: g.maybe(() => g.str("effect")),
    turn: {
      action: g.int(0, 1),
      bonus: g.int(0, 1),
      reaction: g.int(0, 1),
      attacksUsed: g.int(0, 2),
      movementUsed: g.int(0, 30),
      movementExtra: g.bool() ? g.int(0, 30) : 0,
      claims: g.bool() ? ["attack"] : [],
    },
    overrides,
    reveal: { block: g.bool(), hp: g.bool(), token: g.bool() },
  };
}

function genRelation(g: Gen): Relation {
  const a = g.pick(ENTITY_IDS);
  const b = g.pick(ENTITY_IDS);
  switch (g.int(0, 6)) {
    case 0:
      return { kind: "adjacent", a, b };
    case 1:
      return {
        kind: "range",
        a,
        b,
        band: g.pick(["reach", "near", "far", "out"] as const),
      };
    case 2:
      return { kind: "visible", a, b, value: g.bool() };
    case 3:
      return {
        kind: "cover",
        target: a,
        from: g.maybe(() => b),
        degree: g.pick(["half", "three-quarters", "total"] as const),
      };
    case 4:
      return { kind: "engaged", a, b };
    case 5:
      return { kind: "aura-member", effect: g.str("effect"), member: a };
    default:
      return { kind: "mark", effect: g.str("effect"), by: a, on: b };
  }
}

function genEffect(g: Gen, id: string): Effect {
  const payloads: Effect["payload"][] = [
    {
      kind: "condition",
      condition: g.pick(["prone", "poisoned", "frightened"] as const),
    },
    {
      kind: "standing",
      facts: {
        acBonus: g.int(1, 5),
        advantageOnAttacks: g.bool(),
        resistances: [g.pick(DAMAGE)],
      },
    },
    {
      kind: "mark",
      riders: [
        { dice: "1d6", type: g.pick(DAMAGE), on: "weapon-hit", vs: { mark: "self" } },
      ],
      advantage: g.bool(),
    },
    { kind: "temp-hp" },
    { kind: "bond" },
  ];
  const lifetimes: Effect["lifetime"][] = [
    { kind: "manual" },
    {
      kind: "turn-edge",
      entity: g.pick(ENTITY_IDS),
      edge: g.pick(["start", "end"] as const),
      round: g.int(1, 9),
    },
    { kind: "rounds", remaining: g.int(1, 10) },
    { kind: "seconds", remaining: g.int(1, 600) },
    {
      kind: "rest",
      rest: g.pick(["short", "long"] as const),
      minimumOrdinal: g.int(0, 3),
    },
    {
      kind: "day-phase",
      phase: g.pick(["dawn", "dusk"] as const),
      minimumOrdinal: g.int(0, 3),
    },
    { kind: "source-end", effect: g.str("effect") },
  ];
  return {
    id,
    source: {
      entity: g.pick(ENTITY_IDS),
      mechanic: g.str("mechanic"),
      action: g.str("action"),
      castLevel: g.maybe(() => g.int(1, 9)),
    },
    target: g.pick(ENTITY_IDS),
    payload: g.pick(payloads),
    lifetime: g.pick(lifetimes),
    concentration: g.bool(),
  };
}

function genRoll(g: Gen): RollRecord {
  const app = g.bool();
  return {
    formula: g.pick(["1d20+5", "2d6", "8d6", "2d20kh1+3"]),
    faces: Array.from({ length: g.int(1, 8) }, () => g.int(1, 20)),
    total: g.int(1, 60),
    seed: app ? g.int(0, 4_294_967_295) : null,
    source: app ? "app" : "manual",
    hidden: g.bool(),
    roller: g.maybe(() => g.pick(ENTITY_IDS)),
    purpose: g.pick(ROLL_PURPOSES),
    label: g.maybe(() => g.str("label")),
  };
}

function genTableOp(g: Gen): TableOp {
  const entity = genEntity(g, g.pick(ENTITY_IDS));
  const ops: TableOp[] = [
    { op: "start", epoch: g.int(1, 99) },
    { op: "add-entity", entity },
    { op: "remove-entity", entity: entity.id },
    { op: "join", entity },
    { op: "leave", entity: entity.id },
    { op: "sync", entity },
    { op: "set-initiative", entity: entity.id, value: g.int(1, 30) },
    { op: "begin-turns", order: [...ENTITY_IDS].slice(0, g.int(1, 5)) },
    { op: "end-turn" },
    { op: "end" },
    { op: "rest", rest: g.pick(["short", "long"] as const) },
    {
      op: "settings",
      revealMonsterHp: g.bool(),
      automation: g.pick(["full-auto", "propose-and-confirm", "log-only"] as const),
    },
    {
      op: "map",
      background: g.maybe(() => ({
        path: `campaigns/${g.str("c")}/maps/${g.str("m")}.jpeg`,
        url: `https://example.test/${g.str("m")}.jpeg?token=${g.str("t")}`,
        width: g.int(100, 8000),
        height: g.int(100, 8000),
        cellPx: g.int(8, 200),
        origin: { x: g.int(-100, 100), y: g.int(-100, 100) },
        bytes: g.int(0, 8_000_000),
      })),
    },
    { op: "fog", change: { kind: "cover", covered: g.bool() } },
    { op: "fog", change: { kind: "reveal", rect: genRect(g) } },
    { op: "fog", change: { kind: "hide", rect: genRect(g) } },
  ];
  return g.pick(ops);
}

function genAnswers(
  g: Gen
): Record<string, Action extends { answers: infer A } ? A : never> {
  const answers: Record<string, unknown> = {};
  if (g.bool()) answers.roll = { roll: g.str("roll") };
  if (g.bool()) answers[`save:${g.pick(ENTITY_IDS)}`] = { roll: g.str("roll") };
  if (g.bool()) answers.to = { x: g.int(-9, 9), y: g.int(-9, 9) };
  if (g.bool()) answers.choice = g.pick(["a", "b"]);
  if (g.bool()) answers.count = g.int(0, 9);
  if (g.bool()) answers.flag = g.bool();
  if (g.bool()) answers.picks = [g.int(0, 3), g.int(0, 3)];
  return answers as Record<string, never>;
}

function genAction(g: Gen, index: number): Action {
  const base = {
    id: `a-${index}-${g.str("id")}`,
    seq: {
      ms: 1_000 + index * g.int(1, 3),
      counter: g.int(0, 2),
      by: g.pick(["dm", "p1"]),
    },
    by: g.pick(["dm", "p1", "p2"]),
  };
  switch (g.int(0, 7)) {
    case 0:
      return {
        ...base,
        kind: "intent",
        entity: g.pick(ENTITY_IDS),
        mechanic: g.pick(["core:move", "srd:spell:fireball", "srd:weapon:shortsword"]),
        program: g.pick(["move", "cast", "attack"]),
        targets: g.bool() ? [g.pick(ENTITY_IDS)] : [],
        answers: genAnswers(g),
        payment: g.bool()
          ? [
              {
                kind: "slot",
                level: g.int(1, 9),
                pool: g.pick(["standard", "pact"] as const),
              },
            ]
          : g.bool()
            ? [{ kind: "resource", id: g.str("res") }]
            : [],
        window: g.maybe(() => g.str("window")),
        basedOn: g.int(0, 50),
      };
    case 1:
      return {
        ...base,
        kind: "declare",
        relation: genRelation(g),
        remove: g.bool(),
        mover: g.maybe(() => g.pick(ENTITY_IDS)),
      };
    case 2:
      return {
        ...base,
        kind: "override",
        entity: g.pick(ENTITY_IDS),
        path: g.pick([
          "vitals.hp",
          "position",
          "reveal.token",
          "stats.speed",
          "vitals.life",
        ]),
        value: g.pick([
          null,
          g.int(0, 40),
          { x: g.int(0, 9), y: g.int(0, 9) },
          g.bool(),
          "dead",
          [1, { deep: ["x", null, false] }],
        ] as const),
        reason: g.str("reason"),
      };
    case 3:
      return { ...base, kind: "resolve", window: g.str("window") };
    case 4:
      return { ...base, kind: "check", check: g.str("check"), answers: genAnswers(g) };
    case 5:
      return {
        ...base,
        kind: "undo",
        of: g.str("a"),
        reason: g.maybe(() => g.str("why")),
      };
    case 6:
      return { ...base, kind: "table", table: genTableOp(g) };
    default:
      return { ...base, kind: "roll", roll: genRoll(g) };
  }
}

function genFoldedState(g: Gen, actions: readonly Action[]): FoldedState {
  const ids = [...ENTITY_IDS].slice(0, g.int(1, 5));
  const entities = Object.fromEntries(ids.map((id) => [id, genEntity(g, id)]));
  const effects = Object.fromEntries(
    Array.from({ length: g.int(0, 3) }, (_, i) => {
      const id = `effect-${i}`;
      return [id, genEffect(g, id)];
    })
  );
  const declaredIntents = actions.filter((a) => a.kind === "intent").slice(0, 2);
  const rolls = Object.fromEntries(
    Array.from({ length: g.int(0, 3) }, (_, i) => [`roll-${i}`, genRoll(g)])
  );
  return {
    ...emptyState(),
    epoch: g.int(0, 9),
    clock: {
      phase: g.pick(["idle", "gathering", "turns", "ended"] as const),
      round: g.int(0, 20),
      order: ids,
      current: g.maybe(() => g.pick(ids)),
      initiative: Object.fromEntries(ids.map((id) => [id, g.int(1, 30)])),
      restOrdinal: g.int(0, 3),
      dayPhaseOrdinal: g.int(0, 3),
    },
    entities,
    relations: Array.from({ length: g.int(0, 4) }, () => genRelation(g)),
    effects,
    windows: Array.from({ length: g.int(0, 2) }, (_, i) => ({
      id: `window-${i}`,
      event: g.pick([
        { kind: "entity-left-reach", entity: g.pick(ids), from: g.pick(ids) },
        {
          kind: "attack-declared",
          attacker: g.pick(ids),
          target: g.pick(ids),
          action: g.str("a"),
        },
        { kind: "hp-zero", entity: g.pick(ids) },
      ] as const),
      eligible: [...ids].sort(),
      declared: g.str("a"),
    })),
    checks: Array.from({ length: g.int(0, 2) }, (_, i) => ({
      id: `check-${i}`,
      entity: g.pick(ids),
      kind: "concentration" as const,
      dc: g.int(10, 20),
      cause: g.str("a"),
    })),
    declared: Object.fromEntries(declaredIntents.map((a) => [a.id, a])),
    rolls,
    spent: Object.fromEntries(
      Object.keys(rolls)
        .filter(() => g.bool())
        .map((id) => [id, g.str("a")])
    ),
    nextOrdinal: g.int(1, 99),
    revision: g.int(0, 999),
    settings: {
      revealMonsterHp: g.bool(),
      automation: g.pick(["full-auto", "log-only"] as const),
    },
    map: {
      background: g.maybe(() => ({
        path: "campaigns/c/maps/m.jpeg",
        url: "https://example.test/m.jpeg?token=t",
        width: g.int(100, 8000),
        height: g.int(100, 8000),
        cellPx: g.int(8, 200),
        origin: { x: g.int(-100, 100), y: g.int(-100, 100) },
        bytes: g.int(0, 8_000_000),
      })),
      fog: {
        covered: g.bool(),
        revealed: Array.from({ length: g.int(0, 6) }, () => genRect(g)),
      },
    },
  };
}

function genEncounter(g: Gen): Encounter {
  const log = Array.from({ length: g.int(0, 12) }, (_, i) => genAction(g, i));
  const checkpoint = g.maybe(() => ({
    through: { ms: g.int(1, 999), counter: g.int(0, 3), by: g.pick(["dm", "p1"]) },
    state: genFoldedState(g, log),
  }));
  const host: Encounter["host"] = g.bool()
    ? { kind: "campaign", campaignId: g.str("camp") }
    : { kind: "personal", uid: g.str("uid"), characterId: g.str("char") };
  const encounter: Encounter = { schema: 1, id: g.str("enc"), host, log, checkpoint };
  return g.bool()
    ? {
        ...encounter,
        unknown: { [g.str("future")]: { kept: [1, "x", null, { deep: true }] } },
      }
    : encounter;
}

describe("codec — round-trip property over generated encounters (§8)", () => {
  it(`write → parse → write is the identity for ${CASES} generated encounters`, () => {
    for (let seed = 1; seed <= CASES; seed += 1) {
      const encounter = genEncounter(gen(seed));
      const written = encounterWriteData(encounter);
      const parsed = parseEncounter(written);
      if (!parsed.ok) throw new Error(`seed ${seed}: quarantined as ${parsed.reason}`);
      expect(parsed.encounter, `seed ${seed}`).toEqual(encounter);
      expect(encounterWriteData(parsed.encounter), `seed ${seed} (second write)`).toEqual(
        written
      );
    }
  });

  it("a generated document with one known key removed never parses ok", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const g = gen(seed);
      const written = encounterWriteData(genEncounter(g));
      const key = g.pick(["schema", "id", "host", "log", "checkpoint"]);
      const without = Object.fromEntries(
        Object.entries(written).filter(([name]) => name !== key)
      );
      expect(parseEncounter(without).ok, `seed ${seed}: without ${key}`).toBe(false);
    }
  });

  it("a generated map background or fog change with one nested key removed quarantines the document", () => {
    let checked = 0;
    for (let seed = 1; seed <= 400 && checked < 20; seed += 1) {
      const g = gen(seed);
      const encounter = genEncounter(g);
      const written = encounterWriteData(encounter) as {
        log: {
          kind: string;
          table?: {
            op: string;
            background?: Record<string, unknown> | null;
            change?: Record<string, unknown>;
          };
        }[];
      };
      const entry = written.log.find(
        (action) =>
          action.kind === "table" &&
          ((action.table?.op === "map" && action.table.background) ||
            action.table?.op === "fog")
      );
      if (!entry?.table) continue;
      const target = entry.table.background ?? entry.table.change;
      if (!target) continue;
      const key = g.pick(Object.keys(target));
      const without = Object.fromEntries(
        Object.entries(target).filter(([name]) => name !== key)
      );
      if (entry.table.background) entry.table.background = without;
      else entry.table.change = without;
      expect(parseEncounter(written).ok, `seed ${seed}: without ${key}`).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a generated log entry with its `kind` corrupted quarantines the document", () => {
    let checked = 0;
    for (let seed = 1; seed <= 60 && checked < 20; seed += 1) {
      const encounter = genEncounter(gen(seed));
      if (encounter.log.length === 0) continue;
      const written = encounterWriteData(encounter) as { log: Record<string, unknown>[] };
      const first = written.log[0];
      if (first === undefined) continue;
      first.kind = "not-a-kind";
      expect(parseEncounter(written).ok, `seed ${seed}`).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

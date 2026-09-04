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
import type {
  AreaShapeSpec,
  Cost,
  EventSelector,
  Expr,
  Input,
  LifetimeSpec,
  Mechanic,
  Predicate,
  Program,
  Step,
  Trigger,
} from "@/lib/combat/mechanic";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { compact } from "@/lib/combat/checkpoint";
import { fold } from "@/lib/combat/fold";
import { compareSeq, sortBySeq, type Seq } from "@/lib/combat/ids";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { emptyState, openingActions, seqFactory, tableAction } from "./__helpers__/state";

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

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const BINDINGS = ["$self", "$target", "$event.entity"] as const;

function genExpr(g: Gen, depth = 0): Expr {
  const leaves: Expr[] = [
    g.int(0, 12),
    { byLevel: { 1: g.int(1, 9), 3: g.int(1, 30), 5: g.int(1, 90) } },
    { ability: g.pick(ABILITIES) },
    { stat: g.pick(["spellSaveDc", "spellAttack", "proficiency"] as const) },
  ];
  if (depth >= 2 || g.bool()) return g.pick(leaves);
  return { sum: [genExpr(g, depth + 1), genExpr(g, depth + 1)] };
}

function genPredicate(g: Gen, depth = 0): Predicate {
  const leaves: Predicate[] = [
    { outcome: g.pick(["hit", "crit", "miss", "save-fail", "save-success"] as const) },
    { answer: g.str("input"), equals: g.pick([g.int(1, 20), "yes", true]) },
    g.bool()
      ? {
          relation: g.pick(["adjacent", "visible", "engaged", "mark"] as const),
          between: [g.pick(BINDINGS), g.pick(BINDINGS)],
          value: g.bool(),
        }
      : {
          relation: g.pick(["adjacent", "visible", "engaged", "mark"] as const),
          between: [g.pick(BINDINGS), g.pick(BINDINGS)],
        },
    {
      condition: g.pick(["prone", "poisoned", "frightened"] as const),
      on: g.pick(BINDINGS),
      present: g.bool(),
    },
    { is: [g.pick(BINDINGS), g.pick(BINDINGS)] },
    {
      hp: g.pick(BINDINGS),
      op: g.pick(["<=", "<", ">=", ">"] as const),
      value: g.bool() ? g.int(1, 40) : ("half-max" as const),
    },
  ];
  if (depth >= 2 || g.next() < 0.6) return g.pick(leaves);
  switch (g.int(0, 2)) {
    case 0:
      return { all: [genPredicate(g, depth + 1), genPredicate(g, depth + 1)] };
    case 1:
      return { any: [genPredicate(g, depth + 1)] };
    default:
      return { not: genPredicate(g, depth + 1) };
  }
}

function genLifetimeSpec(g: Gen): LifetimeSpec {
  return g.pick([
    { kind: "manual" },
    { kind: "turn-edge", entity: g.pick(BINDINGS), edge: g.pick(["start", "end"]) },
    { kind: "rounds", remaining: g.int(1, 10) },
    {
      kind: "seconds",
      remaining: g.bool() ? g.int(1, 600) : { byLevel: { 1: 60, 3: 600 } },
    },
    { kind: "rest", rest: g.pick(["short", "long"]) },
  ] as const satisfies readonly LifetimeSpec[]);
}

function genStep(g: Gen, id: string): Step {
  const damage = [{ dice: g.str("die"), type: g.pick(DAMAGE) }];
  const steps: Step[] = [
    { id, kind: "attack", roll: g.str("in"), bonus: genExpr(g), damage },
    {
      id,
      kind: "save",
      roll: g.str("in"),
      ability: g.pick(ABILITIES),
      dc: g.bool() ? genExpr(g) : "spell",
      onSuccess: g.pick(["half", "negate"] as const),
    },
    { id, kind: "damage", parts: damage, to: g.pick(BINDINGS) },
    { id, kind: "heal", amount: genExpr(g), to: g.pick(BINDINGS) },
    {
      id,
      kind: "effect-start",
      effect: {
        kind: g.pick(["standing", "mark"] as const),
        to: g.pick(BINDINGS),
        lifetime: genLifetimeSpec(g),
        ...(g.bool() ? { concentration: g.bool() } : {}),
        ...(g.bool() ? { acBonus: g.int(1, 5) } : {}),
        ...(g.bool()
          ? {
              riders: [
                {
                  dice: "1d6",
                  type: g.pick(DAMAGE),
                  on: g.pick(["weapon-hit", "spell-hit", "any-hit"] as const),
                  vs: { mark: "self" },
                },
              ],
            }
          : {}),
        ...(g.bool() ? { advantage: g.bool() } : {}),
      },
    },
    {
      id,
      kind: "condition",
      condition: g.pick(["prone", "poisoned", "frightened"] as const),
      to: g.pick(BINDINGS),
      lifetime: genLifetimeSpec(g),
      ...(g.bool() ? { concentration: true } : {}),
    },
    { id, kind: "move-mark", from: g.pick(BINDINGS), to: g.pick(BINDINGS) },
    { id, kind: "turn-claim", claim: "once", key: g.str("key") },
    { id, kind: "negate", target: "declared-action" },
    { id, kind: "manual-table", label: g.str("label") },
    { id, kind: "move", to: g.str("in") },
    { id, kind: "dash" },
  ];
  const step = g.pick(steps);
  return g.bool() ? { ...step, when: genPredicate(g) } : step;
}

function genProgram(g: Gen, id: string): Program {
  const trigger: Trigger = g.bool()
    ? {
        kind: "invocation",
        economy: g.pick(["action", "bonus", "reaction", "free", "none"] as const),
      }
    : {
        kind: "event",
        event: g.pick([
          { kind: "turn-start" },
          { kind: "turn-end" },
          { kind: "round-start" },
          { kind: "attack-declared", target: g.pick(["self", "any"]) },
          { kind: "damage-taken", of: g.pick(["self", "controlled"]) },
          {
            kind: "hp-zero",
            of: g.bool() ? g.pick(["self", "controlled", "any"]) : { markedBy: "self" },
          },
          { kind: "entity-left-reach", of: "self" },
          { kind: "concentration-ended", source: "self" },
          { kind: "rest-completed", rest: g.pick(["short", "long"]) },
        ] as const satisfies readonly EventSelector[]),
        scope: g.pick(["self", "controlled", "others", "any"] as const),
        window: g.bool(),
      };
  const area: AreaShapeSpec = g.pick([
    { kind: "sphere", origin: "origin", radiusFt: g.int(5, 60) },
    { kind: "cylinder", origin: "origin", radiusFt: g.int(5, 60) },
    { kind: "cube", origin: "origin", sizeFt: g.int(5, 30) },
    { kind: "cone", origin: "origin", aim: "aim", lengthFt: g.int(15, 60) },
    {
      kind: "line",
      origin: "origin",
      aim: "aim",
      lengthFt: g.int(30, 100),
      widthFt: g.int(5, 10),
    },
  ] as const satisfies readonly AreaShapeSpec[]);
  return {
    id,
    trigger,
    ...(g.bool()
      ? {
          cost: [
            g.pick([
              g.bool()
                ? { kind: "slot", level: g.int(1, 9), upcast: g.bool() }
                : { kind: "slot", level: g.int(1, 9) },
              { kind: "resource", id: g.str("res"), amount: g.int(1, 3) },
              {
                kind: "turn",
                claim: g.pick(["action", "bonus", "reaction", "attack", "free"] as const),
              },
              { kind: "concentration" },
            ] as const satisfies readonly Cost[]),
          ],
        }
      : {}),
    ...(g.bool()
      ? {
          targets: g.bool()
            ? { count: g.int(1, 3), eligibility: genPredicate(g) }
            : { count: "area" as const, eligibility: genPredicate(g), area },
        }
      : {}),
    ...(g.bool()
      ? {
          inputs: [
            g.bool()
              ? { id: "roll", kind: "d20", for: "save", ability: "DEX", perTarget: true }
              : { id: "roll", kind: "d20", for: "attack" },
            g.bool()
              ? { id: "dmg", kind: "dice", formula: "2d6", perTarget: false }
              : { id: "dmg", kind: "dice", formula: "2d6" },
            { id: "pick", kind: "choice", options: [g.str("opt"), g.str("opt")] },
            { id: "ruling", kind: "table", label: g.str("label") },
            { id: "origin", kind: "position" },
          ] satisfies readonly Input[],
        }
      : {}),
    steps: Array.from({ length: g.int(1, 3) }, (_, i) => genStep(g, `step-${i}`)),
  };
}

function genMechanic(g: Gen, id: string): Mechanic {
  return {
    schema: 1,
    id,
    source: g.pick(["srd", "pack", "homebrew", "monster"] as const),
    ...(g.bool() ? { label: g.str("label") } : {}),
    ...(g.bool()
      ? {
          active: Array.from({ length: g.int(1, 2) }, (_, i) =>
            genProgram(g, `program-${i}`)
          ),
        }
      : {}),
  };
}

function genCarried(g: Gen): Mechanic[] {
  return Array.from({ length: g.int(0, 2) }, (_, i) =>
    genMechanic(g, `${g.pick(["pc", "monster"])}:${g.str("e")}:${i}`)
  );
}

function genTableOp(g: Gen): TableOp {
  const entity = genEntity(g, g.pick(ENTITY_IDS));
  const mechanics = genCarried(g);
  const ops: TableOp[] = [
    { op: "start", epoch: g.int(1, 99) },
    { op: "add-entity", entity, mechanics },
    { op: "remove-entity", entity: entity.id },
    { op: "join", entity, mechanics },
    { op: "leave", entity: entity.id },
    { op: "sync", entity, mechanics },
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
  const carried = Object.fromEntries(
    genCarried(g).map((mechanic) => [mechanic.id, mechanic])
  );
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
    mechanics: carried,
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

// ── Compaction is fold-preserving, including the roll pruning (stage 6 §2 D8) ─

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

const PLAY_RANGER = testEntity({
  id: "ranger",
  kind: "pc",
  controllerUid: "p1",
  hp: 40,
  ac: 15,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:shortsword", "srd:spell:shield", "core:move", "core:dash"],
  resources: { "slot-1": { current: 4, max: 4, recharge: "long" } },
  position: { x: 0, y: 0 },
});

const PLAY_GOBLIN = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 40,
  ac: 12,
  mechanics: ["monster:goblin:scimitar", "core:move", "core:dash"],
  position: { x: 1, y: 0 },
});

const PLAY_ORDER = ["ranger", "monster-1"] as const;
const CONTROLLER: Readonly<Record<string, string>> = { ranger: "p1", "monster-1": "dm" };
const WEAPON: Readonly<Record<string, string>> = {
  ranger: "srd:weapon:shortsword",
  "monster-1": "monster:goblin:scimitar",
};

/**
 * A PLAYABLE encounter: the standard opening, the relations an attack needs, then a few rounds
 * of rolls answered by intents, moves, Dashes and turn ends. Unlike the adversarial generator
 * above (which exists to stress the codec), this one mostly APPLIES, so compacting it at a
 * random cut point actually exercises the checkpoint's state — the rolls included.
 */
function genPlayable(g: Gen): Encounter {
  const seq = seqFactory("dm", 200_000);
  const log: Action[] = [
    ...openingActions(
      "dm",
      seq,
      [PLAY_RANGER, PLAY_GOBLIN],
      { ranger: 20, "monster-1": 10 },
      [...PLAY_ORDER]
    ),
  ];
  const declare = (relation: Relation, id: string): Action => ({
    kind: "declare",
    id,
    seq: seq(),
    by: "dm",
    relation,
    remove: false,
    mover: null,
  });
  log.push(
    declare({ kind: "visible", a: "ranger", b: "monster-1", value: true }, "pd-1"),
    declare({ kind: "visible", a: "monster-1", b: "ranger", value: true }, "pd-2"),
    declare({ kind: "adjacent", a: "ranger", b: "monster-1" }, "pd-3")
  );

  let n = 0;
  const fresh = (prefix: string): string => `${prefix}-${(n += 1)}`;
  for (let round = 0; round < 4; round += 1) {
    for (const entity of PLAY_ORDER) {
      const by = CONTROLLER[entity] ?? "dm";
      for (let step = g.int(1, 3); step > 0; step -= 1) {
        switch (g.int(0, 3)) {
          case 0: {
            const roll = fresh("r");
            const face = g.int(1, 20);
            log.push({
              kind: "roll",
              id: roll,
              seq: seq(),
              by,
              roll: {
                formula: "1d20+3",
                faces: [face],
                total: face + 3,
                seed: null,
                source: "manual",
                hidden: false,
                roller: entity,
                purpose: "attack",
                label: null,
              },
            });
            log.push({
              kind: "intent",
              id: fresh("i"),
              seq: seq(),
              by,
              entity,
              mechanic: WEAPON[entity] ?? "core:move",
              program: "attack",
              targets: [entity === "ranger" ? "monster-1" : "ranger"],
              answers: { roll: { roll }, damage: g.int(1, 6) },
              payment: [],
              window: null,
              basedOn: 0,
            });
            break;
          }
          case 1:
            log.push({
              kind: "intent",
              id: fresh("i"),
              seq: seq(),
              by,
              entity,
              mechanic: "core:move",
              program: "move",
              targets: [],
              answers: { to: { x: g.int(-3, 3), y: g.int(-3, 3) } },
              payment: [],
              window: null,
              basedOn: 0,
            });
            break;
          case 2:
            log.push({
              kind: "intent",
              id: fresh("i"),
              seq: seq(),
              by,
              entity,
              mechanic: "core:dash",
              program: "dash",
              targets: [],
              answers: {},
              payment: [],
              window: null,
              basedOn: 0,
            });
            break;
          default: {
            const ahead = g.int(1, 20);
            // A roll nobody answers with — the player who rolled ahead.
            log.push({
              kind: "roll",
              id: fresh("r"),
              seq: seq(),
              by,
              roll: {
                formula: "1d20",
                faces: [ahead],
                total: ahead,
                seed: null,
                source: "manual",
                hidden: false,
                roller: entity,
                purpose: "attack",
                label: null,
              },
            });
          }
        }
      }
      log.push(tableAction("dm", seq(), { op: "end-turn" }));
    }
  }
  return {
    schema: 1,
    id: "playable",
    host: { kind: "campaign", campaignId: "camp" },
    log,
    checkpoint: null,
  };
}

/** The actions `compact` folds into the checkpoint, so the test can measure what it dropped. */
function headOf(encounter: Encounter, through: Seq): Action[] {
  return sortBySeq(encounter.log).filter(
    (action) => compareSeq(action.seq, through) <= 0
  );
}

describe("compaction — the fold is unchanged by the checkpoint, rolls pruned (§2 D8)", () => {
  it("fold(compact(e)) equals fold(e) at every cut point, for 60 generated tables", () => {
    let pruned = 0;
    let kept = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const g = gen(seed);
      const encounter = genPlayable(g);
      const sorted = sortBySeq(encounter.log);
      const cut = sorted[g.int(0, sorted.length - 1)];
      if (cut === undefined) throw new Error(`seed ${seed}: an empty log`);
      const compacted = compact(encounter, catalogue, cut.seq);
      const before = fold(encounter, catalogue).state;
      const after = fold(compacted, catalogue).state;
      // `revision` and `relations` are in the list on purpose: an action that flips from
      // rejected to applied across the checkpoint changes `revision` (what `basedOn` compares)
      // long before it changes anything visible, so this is the assertion that would catch it.
      for (const key of [
        "entities",
        "clock",
        "effects",
        "windows",
        "mechanics",
        "relations",
        "revision",
      ] as const) {
        expect(after[key], `seed ${seed}: ${key}`).toEqual(before[key]);
      }
      // The pruning is real: a checkpoint never keeps the RECORD of a roll whose consumer has
      // settled — while `spent` keeps every verdict, compacted or not.
      const state = compacted.checkpoint?.state;
      if (state === undefined) throw new Error(`seed ${seed}: no checkpoint`);
      for (const id of Object.keys(state.rolls)) {
        const by = state.spent[id];
        if (by !== undefined) {
          expect(state.declared[by], `seed ${seed}: roll ${id}`).toBeDefined();
        }
      }
      expect(state.spent, `seed ${seed}: spent survives compaction`).toEqual(
        fold({ ...encounter, log: headOf(encounter, cut.seq) }, catalogue).state.spent
      );
      const head = fold({ ...encounter, log: headOf(encounter, cut.seq) }, catalogue);
      pruned += Object.keys(head.state.rolls).length - Object.keys(state.rolls).length;
      kept += Object.keys(state.rolls).length;
    }
    // The corpus is not trivially empty on either side: rolls really are dropped, and rolls
    // really do survive — otherwise the property above would hold vacuously.
    expect(pruned).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });
});

/**
 * The dispatch builders — how a hotbar tile becomes actions (stage 6 design §2 D7).
 *
 * The flow they implement, in three pure steps: `planIntent` says what must be rolled (or why
 * nothing may be), `rollsFor` turns that into `roll` action bodies through the ONE dice seam,
 * and `intentBody` answers each input with the roll that settled it.
 *
 * The load-bearing property, pinned below: **a rejection is never paid for with a die.**
 * `planIntent` re-uses the reducer's own preflight, so every rejection it reports is the one the
 * fold would record for the same intent — proved here by running both over the same states.
 */
import { describe, expect, it } from "vitest";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import type { Mechanic } from "@/lib/combat/mechanic";
import { resolve } from "@/lib/combat/resolve";
import type { Seq } from "@/lib/combat/ids";
import type {
  Action,
  Answers,
  Encounter,
  FoldedState,
  IntentAction,
  Rejection,
} from "@/lib/combat/types";
import {
  intentBody,
  planIntent,
  rollsFor,
  type IntentArgs,
  type PendingInput,
} from "@/features/play/table/dispatch";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";
import { openingActions, seqFactory } from "@tests/unit/combat/__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

const MARCO = testEntity({
  id: "marco",
  kind: "pc",
  controllerUid: "p-marco",
  hp: 25,
  abilities: { DEX: 2 },
  mechanics: ["core:move", "srd:weapon:longbow", "srd:spell:fireball"],
  resources: { "slot-3": { current: 1, max: 1, recharge: "long" } },
  position: { x: 0, y: 0 },
});
const GOBLIN_A = testEntity({ id: "goblin-1", hp: 7, position: { x: 6, y: 0 } });
const GOBLIN_B = testEntity({ id: "goblin-2", hp: 7, position: { x: 7, y: 1 } });

/** Visibility is DECLARED and defaults to true, so the table hides `goblin-2` explicitly —
 *  the longbow's eligibility is exactly this relation. */
function sight(seq: Seq, target: string, value: boolean): Action {
  return {
    kind: "declare",
    id: `see-${target}`,
    seq,
    by: "dm",
    relation: { kind: "visible", a: "marco", b: target, value },
    remove: false,
    mover: null,
  };
}

/** The table mid-fight, `order[0]`'s turn. */
function table(
  order: readonly string[] = ["marco", "goblin-1", "goblin-2"]
): FoldedState {
  const seq = seqFactory("dm", 1_000);
  const log = [
    ...openingActions(
      "dm",
      seq,
      [MARCO, GOBLIN_A, GOBLIN_B],
      { marco: 18, "goblin-1": 9, "goblin-2": 8 },
      order
    ),
    sight(seq(), "goblin-1", true),
    sight(seq(), "goblin-2", false),
  ];
  const encounter: Encounter = {
    schema: 1,
    id: "live",
    host: { kind: "campaign", campaignId: "camp-1" },
    log,
    checkpoint: null,
  };
  return fold(encounter, catalogue).state;
}

const SHOT: IntentArgs = {
  entity: "marco",
  mechanic: "srd:weapon:longbow",
  program: "attack",
  targets: ["goblin-1"],
  answersSoFar: {},
};

const FIREBALL: IntentArgs = {
  entity: "marco",
  mechanic: "srd:spell:fireball",
  program: "cast",
  targets: [],
  answersSoFar: { origin: { x: 6, y: 0 } },
  castLevel: 3,
};

/** The same intent as a full action, so `resolve` can be asked for the same verdict. */
function asAction(args: IntentArgs, answers: Answers = args.answersSoFar): IntentAction {
  return {
    kind: "intent",
    id: "probe",
    seq: { ms: 9_000, counter: 0, by: "p-marco" },
    by: "p-marco",
    entity: args.entity,
    mechanic: args.mechanic,
    program: args.program,
    targets: args.targets,
    answers,
    payment:
      args.castLevel === undefined
        ? []
        : [{ kind: "slot", level: args.castLevel, pool: args.pool ?? "standard" }],
    window: args.window ?? null,
    basedOn: 0,
  };
}

function plannedInputs(state: FoldedState, args: IntentArgs): PendingInput[] {
  const plan = planIntent(state, catalogue, args);
  if ("reason" in plan) throw new Error(`unexpected rejection: ${plan.reason}`);
  return [...plan.inputs];
}

function rejectionOf(state: FoldedState, args: IntentArgs): Rejection {
  const plan = planIntent(state, catalogue, args);
  if (!("reason" in plan)) throw new Error("expected a rejection");
  return plan;
}

/** What the reducer would say about the same intent, with no rolls answered. */
function reducerRejection(state: FoldedState, args: IntentArgs): Rejection {
  const result = resolve(state, asAction(args), catalogue);
  if (result.kind !== "rejected") throw new Error("expected the reducer to reject");
  return result.rejection;
}

describe("planIntent", () => {
  it("lists the d20 and dice inputs of a single-target attack, in the program's order", () => {
    expect(plannedInputs(table(), SHOT)).toEqual([
      { key: "roll", target: null, input: { id: "roll", kind: "d20", for: "attack" } },
      {
        key: "damage",
        target: null,
        input: { id: "damage", kind: "dice", formula: "1d8" },
      },
    ]);
  });

  it("expands a per-target input over the resolved area members, and keeps a shared one once", () => {
    const inputs = plannedInputs(table(), FIREBALL);
    expect(inputs.map((pending) => pending.key)).toEqual([
      "save:goblin-1",
      "save:goblin-2",
      "damage",
    ]);
    expect(inputs.map((pending) => pending.target)).toEqual([
      "goblin-1",
      "goblin-2",
      null,
    ]);
  });

  it("never lists a position, choice or table input — those are answered, not rolled", () => {
    expect(
      plannedInputs(table(), FIREBALL).some((p) => p.input.kind === "position")
    ).toBe(false);
  });

  it("skips an input the caller has already answered", () => {
    const inputs = plannedInputs(table(), {
      ...SHOT,
      answersSoFar: { roll: { roll: "roll-1" } },
    });
    expect(inputs.map((pending) => pending.key)).toEqual(["damage"]);
  });

  it("plans nothing for a program with no rolled inputs", () => {
    expect(
      plannedInputs(table(), {
        entity: "marco",
        mechanic: "core:move",
        program: "move",
        targets: [],
        answersSoFar: { to: { x: 1, y: 0 } },
      })
    ).toEqual([]);
  });
});

describe("planIntent reports exactly the rejection the fold would record", () => {
  const cases: {
    readonly name: string;
    readonly state: () => FoldedState;
    readonly args: IntentArgs;
    readonly rejection: Rejection;
  }[] = [
    {
      name: "an entity the table does not seat",
      state: table,
      args: { ...SHOT, entity: "nobody" },
      rejection: { reason: "unknown-entity", entity: "nobody" },
    },
    {
      name: "a mechanic the entity does not carry",
      state: table,
      args: { ...SHOT, mechanic: "srd:spell:shield", program: "cast" },
      rejection: { reason: "unknown-mechanic", mechanic: "srd:spell:shield" },
    },
    {
      name: "another creature's turn",
      state: () => table(["goblin-1", "marco", "goblin-2"]),
      args: SHOT,
      rejection: { reason: "not-your-turn", entity: "marco" },
    },
    {
      name: "a target the program's eligibility rejects",
      state: table,
      args: { ...SHOT, targets: ["goblin-2"] },
      rejection: { reason: "invalid-target", entity: "goblin-2" },
    },
    {
      name: "an area whose origin nobody has picked",
      state: table,
      args: { ...FIREBALL, answersSoFar: {} },
      rejection: { reason: "missing-answer", input: "origin" },
    },
    {
      name: "a cost the entity cannot pay",
      state: () => {
        const state = table();
        const marco = state.entities.marco;
        if (marco === undefined) throw new Error("expected marco at the table");
        return {
          ...state,
          entities: {
            ...state.entities,
            marco: { ...marco, resources: {} },
          },
        };
      },
      args: FIREBALL,
      rejection: { reason: "unaffordable", cost: "slot:3" },
    },
    {
      name: "a window that is not open",
      state: table,
      args: { ...SHOT, window: "window-9" },
      rejection: { reason: "no-window", window: "window-9" },
    },
  ];

  for (const { name, state, args, rejection } of cases) {
    it(name, () => {
      const folded = state();
      expect(rejectionOf(folded, args)).toEqual(rejection);
      expect(reducerRejection(folded, args)).toEqual(rejection);
    });
  }

  it("rejects before the turn has begun", () => {
    const idle = fold(
      {
        schema: 1,
        id: "live",
        host: { kind: "campaign", campaignId: "camp-1" },
        log: [
          {
            kind: "table",
            id: "t-1",
            seq: { ms: 1, counter: 0, by: "dm" },
            by: "dm",
            table: { op: "add-entity", entity: MARCO, mechanics: [] },
          },
        ],
        checkpoint: null,
      },
      catalogue
    ).state;
    expect(rejectionOf(idle, SHOT)).toEqual({ reason: "not-in-turns" });
    expect(reducerRejection(idle, SHOT)).toEqual({ reason: "not-in-turns" });
  });
});

describe("rollsFor", () => {
  const seedSource = () => 12345;

  it("builds one app roll per input, rolled by the acting entity", () => {
    const rolls = rollsFor(plannedInputs(table(), SHOT), "app", {
      by: "p-marco",
      entity: "marco",
      seedSource,
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls).toHaveLength(2);
    expect(rolls[0]?.by).toBe("p-marco");
    expect(rolls[0]?.roll).toMatchObject({
      formula: "1d20",
      purpose: "attack",
      roller: "marco",
      source: "app",
      hidden: false,
    });
    expect(rolls[1]?.roll).toMatchObject({
      formula: "1d8",
      purpose: "damage",
      roller: "marco",
    });
    expect(rolls[0]?.roll.seed).toBe(12345);
  });

  it("rolls a per-target save as the TARGET, so the target's own die answers its own key", () => {
    const rolls = rollsFor(plannedInputs(table(), FIREBALL), "app", {
      by: "p-marco",
      entity: "marco",
      seedSource,
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls.map((pending) => pending.roll.roller)).toEqual([
      "goblin-1",
      "goblin-2",
      "marco",
    ]);
    expect(rolls.map((pending) => pending.roll.purpose)).toEqual([
      "save",
      "save",
      "damage",
    ]);
  });

  it("marks the DM's hidden rolls", () => {
    const rolls = rollsFor(plannedInputs(table(), SHOT), "app", {
      by: "dm",
      entity: "marco",
      hidden: true,
      seedSource,
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls.every((pending) => pending.roll.hidden)).toBe(true);
  });

  it("takes the faces off the physical dice in manual mode, and draws no seed", () => {
    const rolls = rollsFor(plannedInputs(table(), SHOT), "manual", {
      by: "p-marco",
      entity: "marco",
      faces: { roll: [17], damage: [5] },
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls.map((pending) => pending.roll.total)).toEqual([17, 5]);
    expect(rolls.every((pending) => pending.roll.seed === null)).toBe(true);
    expect(rolls.every((pending) => pending.roll.source === "manual")).toBe(true);
  });

  it("reports the dice seam's own error when a manual roll has no faces", () => {
    const rolls = rollsFor(plannedInputs(table(), SHOT), "manual", {
      by: "p-marco",
      entity: "marco",
      faces: { damage: [5] },
    });
    expect(Array.isArray(rolls)).toBe(false);
    expect(rolls).toEqual({ code: "faces-count" });
  });
});

describe("intentBody", () => {
  it("answers every planned input with its roll and keeps the answers already given", () => {
    const state = table();
    const body = intentBody(state, FIREBALL, {
      "save:goblin-1": "r-1",
      "save:goblin-2": "r-2",
      damage: "r-3",
    });
    expect(body).toEqual({
      kind: "intent",
      entity: "marco",
      mechanic: "srd:spell:fireball",
      program: "cast",
      targets: [],
      answers: {
        origin: { x: 6, y: 0 },
        "save:goblin-1": { roll: "r-1" },
        "save:goblin-2": { roll: "r-2" },
        damage: { roll: "r-3" },
      },
      payment: [{ kind: "slot", level: 3, pool: "standard" }],
      window: null,
      basedOn: state.revision,
    });
  });

  it("carries no payment when nothing was upcast, and the window when it is a reaction", () => {
    const state = table();
    const body = intentBody(state, { ...SHOT, window: "window-3" }, { roll: "r-1" });
    expect(body.payment).toEqual([]);
    expect(body.window).toBe("window-3");
    expect(body.answers).toEqual({ roll: { roll: "r-1" } });
  });

  it("produces an intent the reducer accepts, once its rolls are in the fold", () => {
    const state = table();
    const inputs = plannedInputs(state, SHOT);
    const rolls = rollsFor(inputs, "manual", {
      by: "p-marco",
      entity: "marco",
      faces: { roll: [19], damage: [6] },
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);

    let next = state;
    const ids = ["r-1", "r-2"];
    rolls.forEach((pending, index) => {
      const id = ids[index] as string;
      const result = resolve(
        next,
        { ...pending, id, seq: { ms: 9_000 + index, counter: 0, by: "p-marco" } },
        catalogue
      );
      if (result.kind !== "applied") throw new Error("the roll was rejected");
      next = result.state;
    });

    const body = intentBody(next, SHOT, { roll: "r-1", damage: "r-2" });
    const result = resolve(
      next,
      {
        ...body,
        id: "i-1",
        seq: { ms: 9_100, counter: 0, by: "p-marco" },
        by: "p-marco",
      },
      catalogue
    );
    expect(result.kind).toBe("applied");
  });
});

// ── The two answer families that are NOT declared by `program.inputs` ────────

describe("planIntent plans the answers the reducer requires but no input declares", () => {
  const marked = testEntity({
    id: "marco",
    kind: "pc",
    controllerUid: "p-marco",
    hp: 25,
    abilities: { DEX: 2 },
    mechanics: ["srd:weapon:longbow", "srd:spell:hunters-mark"],
    resources: { "slot-1": { current: 2, max: 2, recharge: "long" } },
    position: { x: 0, y: 0 },
  });

  /** Tough enough that both dice stay visible in the arithmetic below. */
  const tough = testEntity({ id: "goblin-1", hp: 30, position: { x: 6, y: 0 } });

  /** Marco marks the goblin, so his next attack owes the mark's rider its own die. */
  function markedTable(): { state: FoldedState; rider: string } {
    const seqOf = seqFactory("dm", 1_000);
    const log: Action[] = [
      ...openingActions("dm", seqOf, [marked, tough], { marco: 18, "goblin-1": 9 }, [
        "marco",
        "goblin-1",
      ]),
      sight(seqOf(), "goblin-1", true),
      {
        kind: "intent",
        id: "mark-1",
        seq: seqOf(),
        by: "p-marco",
        entity: "marco",
        mechanic: "srd:spell:hunters-mark",
        program: "cast",
        targets: ["goblin-1"],
        answers: {},
        payment: [{ kind: "slot", level: 1, pool: "standard" }],
        window: null,
        basedOn: 0,
      },
    ];
    const folded = fold(
      {
        schema: 1,
        id: "live",
        host: { kind: "campaign", campaignId: "camp-1" },
        log,
        checkpoint: null,
      },
      catalogue
    );
    expect(folded.rejections).toEqual([]);
    const mark = Object.values(folded.state.effects).find(
      (effect) => effect.payload.kind === "mark"
    );
    if (mark === undefined) throw new Error("expected Hunter's Mark in the fold");
    return { state: folded.state, rider: `rider:${mark.id}` };
  }

  it("lists a mark's rider die alongside the program's own inputs", () => {
    const { state, rider } = markedTable();
    const inputs = plannedInputs(state, SHOT);
    expect(inputs.map((pending) => pending.key)).toEqual(["roll", "damage", rider]);
    // The rider is the ATTACKER's extra damage, so the attacker rolls it.
    expect(inputs.at(-1)).toEqual({
      key: rider,
      target: null,
      input: { id: rider, kind: "dice", formula: "1d6" },
    });
  });

  it("builds an intent the reducer APPLIES — no die is spent to learn a missing-answer", () => {
    const { state, rider } = markedTable();
    const inputs = plannedInputs(state, SHOT);
    const rolls = rollsFor(inputs, "manual", {
      by: "p-marco",
      entity: "marco",
      faces: { roll: [19], damage: [6], [rider]: [4] },
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls.map((pending) => pending.roll.roller)).toEqual([
      "marco",
      "marco",
      "marco",
    ]);

    let next = state;
    const ids = inputs.map((_pending, index) => `r-${index}`);
    rolls.forEach((pending, index) => {
      const result = resolve(
        next,
        {
          ...pending,
          id: ids[index] as string,
          seq: { ms: 9_000 + index, counter: 0, by: "p-marco" },
        },
        catalogue
      );
      if (result.kind !== "applied") throw new Error("the roll was rejected");
      next = result.state;
    });

    const rollIds = Object.fromEntries(
      inputs.map((pending, index) => [pending.key, ids[index] as string])
    );
    const result = resolve(
      next,
      {
        ...intentBody(next, SHOT, rollIds),
        id: "i-1",
        seq: { ms: 9_100, counter: 0, by: "p-marco" },
        by: "p-marco",
      },
      catalogue
    );
    expect(result.kind).toBe("applied");
    // 6 from the bow plus 4 from the mark: the rider's die actually landed.
    if (result.kind !== "applied") return;
    expect(result.state.entities["goblin-1"]?.vitals.hp).toBe(30 - 6 - 4);
  });
});

describe("only a per-target d20 expands into per-target keys", () => {
  /** A homebrew blast whose DAMAGE input is authored `perTarget` — the schema allows it and the
   *  reducer still reads the plain `damage` id at every damage part. */
  const scatter: Mechanic = {
    schema: 1,
    id: "test:spell:scatter",
    source: "homebrew",
    active: [
      {
        id: "cast",
        trigger: { kind: "invocation", economy: "action" },
        cost: [{ kind: "turn", claim: "action" }],
        targets: {
          count: "area",
          eligibility: { all: [] },
          area: { kind: "sphere", origin: "origin", radiusFt: 30 },
        },
        inputs: [
          { id: "origin", kind: "position" },
          { id: "damage", kind: "dice", formula: "1d6", perTarget: true },
        ],
        steps: [
          {
            id: "burn",
            kind: "damage",
            parts: [{ dice: "damage", type: "fire" }],
            to: "$target",
          },
        ],
      },
    ],
  };

  const caster = testEntity({
    id: "marco",
    kind: "pc",
    controllerUid: "p-marco",
    hp: 25,
    mechanics: ["test:spell:scatter"],
    position: { x: 6, y: 0 },
  });

  const CAST: IntentArgs = {
    entity: "marco",
    mechanic: "test:spell:scatter",
    program: "cast",
    targets: [],
    answersSoFar: { origin: { x: 6, y: 0 } },
  };

  function scatterTable(): FoldedState {
    const seqOf = seqFactory("dm", 1_000);
    const folded = fold(
      {
        schema: 1,
        id: "live",
        host: { kind: "campaign", campaignId: "camp-1" },
        log: openingActions(
          "dm",
          seqOf,
          [caster, GOBLIN_A, GOBLIN_B],
          { marco: 18, "goblin-1": 9, "goblin-2": 8 },
          ["marco", "goblin-1", "goblin-2"],
          [...PROTOTYPE_MECHANICS, scatter]
        ),
        checkpoint: null,
      },
      catalogue
    );
    expect(folded.rejections).toEqual([]);
    return folded.state;
  }

  it("plans ONE damage roll for a per-target `dice` input over two targets", () => {
    const state = scatterTable();
    const inputs = plannedInputs(state, CAST);
    expect(inputs.map((pending) => pending.key)).toEqual(["damage"]);
    expect(inputs[0]?.target).toBeNull();
  });

  it("builds an intent the reducer applies, with the roll attributed to the caster", () => {
    const state = scatterTable();
    const inputs = plannedInputs(state, CAST);
    const rolls = rollsFor(inputs, "manual", {
      by: "p-marco",
      entity: "marco",
      faces: { damage: [5] },
    });
    if (!Array.isArray(rolls)) throw new Error(`unexpected roll error: ${rolls.code}`);
    expect(rolls[0]?.roll.roller).toBe("marco");

    const rolled = resolve(
      state,
      {
        ...(rolls[0] as (typeof rolls)[number]),
        id: "r-1",
        seq: { ms: 9_000, counter: 0, by: "p-marco" },
      },
      catalogue
    );
    if (rolled.kind !== "applied") throw new Error("the roll was rejected");

    const result = resolve(
      rolled.state,
      {
        ...intentBody(rolled.state, CAST, { damage: "r-1" }),
        id: "i-1",
        seq: { ms: 9_100, counter: 0, by: "p-marco" },
        by: "p-marco",
      },
      catalogue
    );
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    // Both goblins are inside the sphere and both took the one rolled die.
    expect(result.state.entities["goblin-1"]?.vitals.hp).toBe(2);
    expect(result.state.entities["goblin-2"]?.vitals.hp).toBe(2);
  });
});

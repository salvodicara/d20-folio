/// <reference types="node" />
/**
 * The encounter log presenter — prose from actions and receipts (stage 6 design §2 D9).
 *
 * The translator here is the REAL merged catalogue, in both locales, and it THROWS on a key the
 * shards do not carry. So this file is also the completeness lock for `play.json`: every line
 * the reducer can produce — every `summary:` it emits, every `Rejection` it can raise, every
 * `RollPurpose` — must exist in EN and in IT, or the test that renders it fails by name.
 */
import { describe, expect, it } from "vitest";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { fold } from "@/lib/combat/fold";
import { ROLL_PURPOSES } from "@/lib/combat/dice";
import type { Seq } from "@/lib/combat/ids";
import type {
  Action,
  Encounter,
  Receipt,
  Rejection,
  Relation,
  TableOp,
} from "@/lib/combat/types";
import {
  buildLogLines,
  type LogLine,
  type TranslateFn,
} from "@/lib/views/encounter-log-view";
import { testEntity } from "@tests/unit/combat/__helpers__/entities";
import { mergedUi } from "./__helpers__/ui-merged";
import { flatEntries, type Json } from "../../scripts/i18n/leak-detectors";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);

/** The real catalogue, interpolated — and loud about a key that is not in BOTH locales. */
function translator(locale: "en" | "it"): TranslateFn {
  const flat = flatEntries(mergedUi(locale) as Json);
  return (key, args) => {
    const value = flat.get(key);
    if (typeof value !== "string") {
      throw new Error(`missing i18n key in ${locale}: ${key}`);
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_whole, name: string) => {
      const given = args?.[name];
      if (given === undefined)
        throw new Error(`missing interpolation ${name} for ${key}`);
      return String(given);
    });
  };
}

const EN = translator("en");
const IT = translator("it");
/** Labels are resolved by the caller; the test only needs to see WHICH id was localized. */
const labels = (label: string): string => `«${label}»`;

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
const GOBLIN = testEntity({ id: "goblin-1", hp: 4, ac: 5, position: { x: 6, y: 0 } });
const HERO = testEntity({ id: "hero", kind: "pc", controllerUid: "p-hero", hp: 10 });

let stamp = 0;
function seq(by = "dm"): Seq {
  stamp += 1;
  return { ms: 1_000 + stamp, counter: 0, by };
}

function table(op: TableOp, by = "dm"): Action {
  return { kind: "table", id: `t-${stamp + 1}`, seq: seq(by), by, table: op };
}

function encounterOf(log: readonly Action[]): Encounter {
  return {
    schema: 1,
    id: "live",
    host: { kind: "campaign", campaignId: "camp-1" },
    log: [...log],
    checkpoint: null,
  };
}

function lines(
  log: readonly Action[],
  options: {
    readonly t?: TranslateFn;
    readonly viewer?: { uid: string; dm: boolean };
  } = {}
): LogLine[] {
  return buildLogLines({
    encounter: encounterOf(log),
    catalogue,
    viewer: options.viewer ?? { uid: "dm", dm: true },
    dmUid: "dm",
    t: options.t ?? EN,
    labels,
  });
}

const texts = (log: readonly Action[], t: TranslateFn): string[] =>
  lines(log, { t }).map((line) => line.text);

/** The opening every scenario shares: two creatures seated, turns begun on Marco. */
function opening(): Action[] {
  return [
    table({ op: "start", epoch: 1 }),
    table({ op: "add-entity", entity: MARCO, mechanics: [...PROTOTYPE_MECHANICS] }),
    table({ op: "add-entity", entity: GOBLIN, mechanics: [] }),
    table({ op: "set-initiative", entity: "marco", value: 18 }),
    table({ op: "set-initiative", entity: "goblin-1", value: 9 }),
    table({ op: "begin-turns", order: ["marco", "goblin-1"] }),
  ];
}

describe("every table op the reducer applies renders a line, in both locales", () => {
  const log = [
    ...opening(),
    table({ op: "end-turn" }),
    table({ op: "rest", rest: "short" }),
    table({ op: "settings", revealMonsterHp: true, automation: "log-only" }),
    table({ op: "map", background: null }),
    table({ op: "fog", change: { kind: "cover", covered: true } }),
    table({ op: "join", entity: HERO, mechanics: [] }, "p-hero"),
    table({ op: "sync", entity: HERO, mechanics: [] }, "p-hero"),
    table({ op: "leave", entity: "hero" }, "p-hero"),
    table({ op: "remove-entity", entity: "goblin-1" }),
    table({ op: "end" }),
  ];

  it("renders one line per applied op, none of them a raw key", () => {
    const rendered = lines(log);
    expect(rendered.every((line) => line.kind === "action" || line.kind === "roll")).toBe(
      true
    );
    // Every op applied: no rejection line hiding a wrong fixture.
    expect(rendered.filter((line) => line.kind === "rejected")).toEqual([]);
    expect(rendered.map((line) => line.text)).toEqual(
      expect.arrayContaining([
        "The fight begins",
        "«label:marco» joins the fight",
        "«label:marco» rolls initiative 18",
        "Turn order is set",
        "The party takes a short rest",
        "«label:hero» takes a seat at the table",
        "The fight ends",
      ])
    );
  });

  it("renders the same lines in Italian", () => {
    expect(texts(log, IT)).toEqual(
      expect.arrayContaining([
        "Il combattimento inizia",
        "«label:marco» entra nel combattimento",
        "«label:marco» tira iniziativa 18",
        "Il gruppo fa un riposo breve",
        "Il combattimento finisce",
      ])
    );
  });

  it("names a creature that has already left the table", () => {
    const left = texts(log, EN).find((text) => text.includes("leaves the table"));
    expect(left).toBe("«label:hero» leaves the table");
  });
});

describe("rolls", () => {
  function rollAction(
    purpose: (typeof ROLL_PURPOSES)[number],
    hidden: boolean,
    by = "dm"
  ): Action {
    return {
      kind: "roll",
      id: `r-${purpose}-${String(hidden)}`,
      seq: seq(by),
      by,
      roll: {
        formula: "1d20",
        faces: [17],
        total: 17,
        seed: null,
        source: "manual",
        hidden,
        roller: "marco",
        purpose,
        label: null,
      },
    };
  }

  it("renders every roll purpose in both locales", () => {
    const log = [...opening(), ...ROLL_PURPOSES.map((p) => rollAction(p, false))];
    for (const t of [EN, IT]) {
      const rolls = lines(log, { t }).filter((line) => line.kind === "roll");
      expect(rolls).toHaveLength(ROLL_PURPOSES.length);
      expect(rolls.every((line) => line.text.includes("17"))).toBe(true);
    }
  });

  it("masks a hidden roll's faces and total for a player, and shows them to the DM", () => {
    const log = [...opening(), rollAction("attack", true)];
    const player = lines(log, { viewer: { uid: "p-marco", dm: false } }).filter(
      (line) => line.kind === "roll"
    );
    expect(player[0]?.text).toBe("Attack roll: hidden");
    expect(player[0]?.hidden).toBe(true);

    const dm = lines(log).filter((line) => line.kind === "roll");
    expect(dm[0]?.text).toBe("Attack roll: 1d20 → 17 (17)");
    expect(dm[0]?.hidden).toBe(true);
  });
});

describe("intents, rejections, undo and the engine's own consequences", () => {
  /** A manual d20 the log carries, so an intent can answer with it. */
  function roll(
    id: string,
    faces: number[],
    total: number,
    purpose: "attack" | "damage"
  ) {
    return {
      kind: "roll" as const,
      id,
      seq: seq("p-marco"),
      by: "p-marco",
      roll: {
        formula: purpose === "attack" ? "1d20" : "1d8",
        faces,
        total,
        seed: null,
        source: "manual" as const,
        hidden: false,
        roller: "marco",
        purpose,
        label: null,
      },
    };
  }

  const shot = (id: string, by = "p-marco"): Action => ({
    kind: "intent",
    id,
    seq: seq(by),
    by,
    entity: "marco",
    mechanic: "srd:weapon:longbow",
    program: "attack",
    targets: ["goblin-1"],
    answers: { roll: { roll: "hit" }, damage: { roll: "dmg" } },
    payment: [],
    window: null,
    basedOn: 0,
  });

  const killing = [
    ...opening(),
    roll("hit", [19], 19, "attack"),
    roll("dmg", [8], 8, "damage"),
    shot("shot-1"),
  ];

  it("names the mechanic and its outcome, and adds the engine's consequence as an `auto` line", () => {
    const rendered = lines(killing);
    const shotLine = rendered.find((line) => line.id === "shot-1");
    // `established`: the shot dealt damage, so the receipt reports more than mere bookkeeping.
    expect(shotLine?.text).toBe("«srd:weapon:longbow»: takes effect");
    expect(shotLine?.author).toEqual({ uid: "p-marco" });

    const consequence = rendered.find((line) => line.author === "auto");
    expect(consequence?.text).toBe("«label:goblin-1» drops to 0 hit points");
    expect(consequence?.undoable).toBe(false);
    expect(consequence?.id).toContain("shot-1");
  });

  it("renders the same consequence in Italian", () => {
    const auto = lines(killing, { t: IT }).find((line) => line.author === "auto");
    expect(auto?.text).toBe("«label:goblin-1» scende a 0 punti ferita");
  });

  it("marks an action the fold rejected, with the reducer's own reason", () => {
    // Built AFTER the opening so its stamp sorts after it — the fold is ordered by `seq`, and
    // an action stamped before the table exists would reject for the wrong reason.
    const open = opening();
    // The goblin does not carry the longbow: `unknown-mechanic`, straight from the reducer.
    const log = [...open, { ...shot("wrong-mechanic"), entity: "goblin-1" } as Action];
    const rejected = lines(log).filter((line) => line.kind === "rejected");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.text).toBe(
      "Not applied: that action is not available to this creature"
    );
    expect(lines(log, { t: IT }).at(-1)?.text).toBe(
      "Non applicata: quell'azione non è disponibile per questa creatura"
    );
  });

  it("renders an undo line and drops the action it undid", () => {
    const undo: Action = {
      kind: "undo",
      id: "u-1",
      seq: seq(),
      by: "dm",
      of: "shot-1",
      reason: "we misread the range",
    };
    const rendered = lines([...killing, undo]);
    expect(rendered.some((line) => line.id === "shot-1")).toBe(false);
    const undone = rendered.find((line) => line.id === "u-1");
    expect(undone?.kind).toBe("undo");
    expect(undone?.text).toBe("Undone: we misread the range");
  });

  it("renders an undo with no reason given", () => {
    const undo: Action = {
      kind: "undo",
      id: "u-2",
      seq: seq(),
      by: "dm",
      of: "shot-1",
      reason: null,
    };
    expect(lines([...killing, undo]).at(-1)?.text).toBe("Undone");
    expect(lines([...killing, undo], { t: IT }).at(-1)?.text).toBe("Annullata");
  });

  it("renders an override and a declared table fact", () => {
    const open = opening();
    const override: Action = {
      kind: "override",
      id: "o-1",
      seq: seq(),
      by: "dm",
      entity: "goblin-1",
      path: "vitals.hp",
      value: 1,
      reason: "it clings on",
    };
    const declare: Action = {
      kind: "declare",
      id: "d-1",
      seq: seq(),
      by: "dm",
      relation: { kind: "adjacent", a: "marco", b: "goblin-1" },
      remove: false,
      mover: null,
    };
    const rendered = lines([...open, override, declare]);
    expect(rendered.find((line) => line.id === "o-1")?.text).toBe(
      "«label:goblin-1»: vitals.hp set to 1 (it clings on)"
    );
    expect(rendered.find((line) => line.id === "d-1")?.text).toBe("Table fact: adjacent");
    const italian = lines([...open, override, declare], { t: IT });
    expect(italian.find((line) => line.id === "d-1")?.text).toBe(
      "Fatto del tavolo: adiacenza"
    );
  });
});

describe("authorship and undo rights", () => {
  const log = [...opening()];

  it("credits the DM, the viewer and another member differently", () => {
    const asHero = lines(
      [
        ...log,
        table({ op: "join", entity: HERO, mechanics: [] }, "p-hero"),
        table({ op: "end-turn" }, "p-marco"),
      ],
      { viewer: { uid: "p-hero", dm: false } }
    );
    expect(asHero[0]?.author).toBe("dm");
    expect(asHero.find((line) => line.text.includes("takes a seat"))?.author).toBe("you");
    expect(asHero.at(-1)?.author).toEqual({ uid: "p-marco" });
  });

  it("lets the DM undo anything and a member only their own", () => {
    const mixed = [...log, table({ op: "end-turn" }, "p-marco")];
    expect(lines(mixed).every((line) => line.undoable)).toBe(true);
    const asHero = lines(mixed, { viewer: { uid: "p-hero", dm: false } });
    expect(asHero.some((line) => line.undoable)).toBe(false);
    const asMarco = lines(mixed, { viewer: { uid: "p-marco", dm: false } });
    expect(asMarco.filter((line) => line.undoable).map((line) => line.text)).toEqual([
      "End of turn",
    ]);
  });
});

describe("a checkpointed document", () => {
  it("renders only the log the document still holds, folded on the checkpoint's state", () => {
    const log = opening();
    const head = log.slice(0, 4);
    const kept = log.slice(4);
    const through = head[head.length - 1]?.seq;
    if (through === undefined) throw new Error("expected an opening action");
    const rendered = buildLogLines({
      encounter: {
        ...encounterOf(kept),
        checkpoint: { through, state: fold(encounterOf(head), catalogue).state },
      },
      catalogue,
      viewer: { uid: "dm", dm: true },
      dmUid: "dm",
      t: EN,
      labels,
    });
    // The compacted head is gone from the document, so it is gone from the feed; the tail
    // still resolves — its `begin-turns` names creatures only the checkpoint's state holds.
    expect(rendered.map((line) => line.id)).toEqual(kept.map((action) => action.id));
    expect(rendered.some((line) => line.kind === "rejected")).toBe(false);
  });
});

// ── The receipt summaries that need a whole scene: windows and concentration ─

describe("reaction windows and concentration checks", () => {
  const ranger = testEntity({
    id: "ranger",
    kind: "pc",
    controllerUid: "p-marco",
    hp: 20,
    ac: 15,
    abilities: { DEX: 3 },
    mechanics: ["srd:spell:hunters-mark", "srd:spell:shield"],
    resources: { "slot-1": { current: 2, max: 2, recharge: "long" } },
  });
  const scimitarGoblin = testEntity({
    id: "monster-1",
    hp: 7,
    ac: 15,
    mechanics: ["monster:goblin:scimitar"],
  });

  function sight(a: string, b: string): Action {
    return {
      kind: "declare",
      id: `see-${a}-${b}`,
      seq: seq(),
      by: "dm",
      relation: { kind: "visible", a, b, value: true },
      remove: false,
      mover: null,
    };
  }

  function scene(withShield: boolean): Action[] {
    const seated = withShield
      ? ranger
      : { ...ranger, mechanics: ["srd:spell:hunters-mark"] };
    return [
      table({ op: "start", epoch: 1 }),
      table({
        op: "add-entity",
        entity: seated,
        mechanics: [...PROTOTYPE_MECHANICS],
      }),
      table({
        op: "add-entity",
        entity: scimitarGoblin,
        mechanics: [...PROTOTYPE_MECHANICS],
      }),
      table({ op: "set-initiative", entity: "ranger", value: 20 }),
      table({ op: "set-initiative", entity: "monster-1", value: 10 }),
      table({ op: "begin-turns", order: ["ranger", "monster-1"] }),
      sight("ranger", "monster-1"),
      sight("monster-1", "ranger"),
    ];
  }

  const slash = (id: string): Action => ({
    kind: "intent",
    id,
    seq: seq(),
    by: "dm",
    entity: "monster-1",
    mechanic: "monster:goblin:scimitar",
    program: "attack",
    targets: ["ranger"],
    answers: { roll: 12, damage: 5 },
    payment: [],
    window: null,
    basedOn: 0,
  });

  it("holds an attack a reaction may answer, then renders the window resolving", () => {
    const held = [...scene(true), table({ op: "end-turn" }), slash("slash-1")];
    const state = fold(encounterOf(held), catalogue).state;
    const window = state.windows[0];
    if (window === undefined) throw new Error("expected a reaction window");

    const log = [
      ...held,
      {
        kind: "resolve" as const,
        id: "close-1",
        seq: seq(),
        by: "dm",
        window: window.id,
      },
    ];
    const rendered = lines(log);
    expect(rendered.find((line) => line.id === "slash-1")?.text).toBe(
      "«monster:goblin:scimitar», waiting on a reaction"
    );
    expect(rendered.find((line) => line.id === "close-1")?.text).toBe(
      "«monster:goblin:scimitar» resolves"
    );
    const italian = lines(log, { t: IT });
    expect(italian.find((line) => line.id === "slash-1")?.text).toBe(
      "«monster:goblin:scimitar», in attesa di una reazione"
    );
    expect(italian.find((line) => line.id === "close-1")?.text).toBe(
      "«monster:goblin:scimitar» si risolve"
    );
  });

  it("renders a failed concentration check and the consequence it causes", () => {
    const upTo = [
      ...scene(false),
      {
        kind: "intent" as const,
        id: "mark-1",
        seq: seq(),
        by: "p-marco",
        entity: "ranger",
        mechanic: "srd:spell:hunters-mark",
        program: "cast",
        targets: ["monster-1"],
        answers: {},
        payment: [{ kind: "slot" as const, level: 1, pool: "standard" as const }],
        window: null,
        basedOn: 0,
      },
      table({ op: "end-turn" }),
      slash("slash-2"),
    ];
    // The check's id is minted by the fold, so it is read from the fold rather than guessed.
    const pending = fold(encounterOf(upTo), catalogue).state.checks[0];
    if (pending === undefined) throw new Error("expected a concentration check");

    const log = [
      ...upTo,
      {
        kind: "check" as const,
        id: "check-1",
        seq: seq(),
        by: "p-marco",
        check: pending.id,
        answers: { d20: 3 },
      },
    ];
    const rendered = lines(log);
    expect(rendered.find((line) => line.id === "check-1")?.text).toBe(
      "Concentration is broken"
    );
    expect(
      rendered.some(
        (line) => line.author === "auto" && line.text.includes("An effect ends")
      )
    ).toBe(true);
    expect(lines(log, { t: IT }).find((line) => line.id === "check-1")?.text).toBe(
      "La concentrazione si spezza"
    );
  });
});

// ── The completeness lock: every closed union the presenter keys on ──────────

/**
 * A tuple that must cover its union: a new `Rejection`, `TableOp` or `Relation` member makes the
 * call below a COMPILE error until it is listed — and listing it makes the test demand its key
 * in both locales. Together that closes the missing-key crash class (golden rule 13) for the
 * presenter's dynamic keys, which the build-time literal-key check cannot see.
 */
function covering<U extends string>() {
  return <T extends readonly U[]>(
    tuple: Exclude<U, T[number]> extends never ? T : never
  ): T => tuple;
}

const REASONS = covering<Rejection["reason"]>()([
  "unknown-entity",
  "unknown-mechanic",
  "not-in-turns",
  "not-your-turn",
  "unaffordable",
  "missing-answer",
  "no-window",
  "not-eligible",
  "no-such-check",
  "invalid-table-op",
  "already-undone",
  "unknown-action",
  "invalid-target",
  "invalid-roll",
  "roll-consumed",
  "roll-roller-mismatch",
] as const);

const OPS = covering<TableOp["op"]>()([
  "start",
  "add-entity",
  "remove-entity",
  "join",
  "leave",
  "sync",
  "set-initiative",
  "begin-turns",
  "end-turn",
  "end",
  "rest",
  "settings",
  "map",
  "fog",
] as const);

const RELATIONS = covering<Relation["kind"]>()([
  "adjacent",
  "range",
  "visible",
  "cover",
  "engaged",
  "aura-member",
  "mark",
] as const);

const OUTCOMES = covering<Receipt["outcome"]>()([
  "established",
  "negated",
  "applied",
] as const);

describe("play.json covers every closed union the presenter keys on", () => {
  const params = { entity: "x", value: 1, rest: "y", mechanic: "m", reason: "r" };
  const families: readonly (readonly [string, readonly string[]])[] = [
    ["play.log.reason", REASONS],
    ["play.log.table", OPS],
    ["play.log.relation", RELATIONS],
    ["play.log.outcome", OUTCOMES],
    ["play.log.purpose", ROLL_PURPOSES],
    ["play.log.rest", ["short", "long"]],
  ];

  for (const [prefix, tokens] of families) {
    it.each([...tokens])(`${prefix}.%s is written in EN and IT`, (token: string) => {
      for (const t of [EN, IT]) {
        expect(t(`${prefix}.${token}`, params).length).toBeGreaterThan(0);
      }
    });
  }
});

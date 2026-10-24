/**
 * Batch 1 of the reference magic items made automatic (owner 2026-10-24: automate
 * every mechanic possible). Every case comes from the item's own English catalogue
 * text: the counts, the dawn refill, the last-charge d20, the spells it casts and
 * the state it lights are read from the sentence that states them, then checked
 * against the data and the engine that consumes it.
 */
import { describe, expect, it } from "vitest";
import { getMagicItem } from "@/data/magic-items";
import type { ResourceEnteredRoll, ResourceSpec, SrdMagicItemData } from "@/data/types";
import spellEn from "@/i18n/en/srd/spells.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { aggregateAbilityScores } from "@/lib/compute";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { endStatesOnAct } from "@/lib/play/states";
import { removeCondition } from "@/lib/play/conditions";
import { planResourceCommand } from "@/lib/resources";
import { resolveActions, resolveActiveTimedEffects } from "@/lib/smart-tracker";
import { freeCastSourcesForSpell } from "@/lib/views/spell-cast-sources";
import { deriveSensesAndSpeeds } from "@/lib/views/sheet-view";
import type { CharacterDoc, SrdEquipmentRef } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string => srd("magic-item", id, "description", "en");

function item(id: string): SrdMagicItemData {
  const found = getMagicItem(id);
  if (!found) throw new Error(`missing magic item ${id}`);
  return found;
}

/** "1d6 + 1" / "1d3" / "1" as an entered roll or a fixed number. */
function amountOf(written: string): ResourceEnteredRoll | number {
  const m = /^(\d+)(?:d(\d+)(?:\s*\+\s*(\d+))?)?$/.exec(written.trim());
  if (!m) throw new Error(`not an amount: ${written}`);
  if (m[2] === undefined) return Number(m[1]);
  return {
    dice: Number(m[1]),
    sides: Number(m[2]),
    ...(m[3] === undefined ? {} : { modifier: Number(m[3]) }),
  };
}

const APOS = "[’']";
const DESTROYED_ON_ONE = /roll 1d20\. On a 1, [^.]*(?:destroyed|disappears)/;

/** The one resource the text states, built from its own words. */
function resourceStatedBy(id: string): ResourceSpec {
  const t = text(id);
  const charges = /(?:has|have) (\d+) charges/.exec(t);
  const regain =
    /regains? (\d+(?:d\d+(?: \+ \d+)?)?) expended charges? daily at dawn/.exec(t);
  if (charges && regain) {
    const back = amountOf(regain[1] ?? "");
    return {
      kind: "counter",
      id: "charges",
      unit: "charges",
      capacity: { kind: "fixed", amount: Number(charges[1]) },
      initial: { kind: "full" },
      recoveries: [
        {
          trigger: { kind: "dawn" },
          amount:
            typeof back === "number"
              ? { kind: "fixed", amount: back }
              : { kind: "entered-roll", roll: back },
        },
      ],
      ...(DESTROYED_ON_ONE.test(t)
        ? {
            onEmpty: {
              kind: "entered-d20",
              bands: [
                {
                  min: 1,
                  max: 1,
                  outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
                },
                { min: 2, max: 20, outcomes: [] },
              ],
            },
          }
        : {}),
    };
  }
  const perDawn = /up to (\d+) per dawn/.exec(t);
  if (
    perDawn ||
    new RegExp(
      `can${APOS}t be (?:used|cast)(?: from it)?(?: this way)? again until the next dawn|Once per dawn`
    ).test(t)
  ) {
    return {
      kind: "counter",
      id: "uses",
      unit: "uses",
      capacity: { kind: "fixed", amount: perDawn ? Number(perDawn[1]) : 1 },
      initial: { kind: "full" },
      recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
    };
  }
  // A supply that never comes back.
  const contains = /contains (\d+d\d+(?: \+ \d+)?) (?:ounces|pinches|dry beans)/.exec(t);
  const times = /can be used (\d+) times/.exec(t);
  const fixed = charges ? Number(charges[1]) : times ? Number(times[1]) : undefined;
  const once = /enough of it for one use|break the gem/.test(t);
  const stock = contains
    ? amountOf(contains[1] ?? "")
    : (fixed ?? (once ? 1 : undefined));
  if (stock === undefined) throw new Error(`${id} states no resource`);
  const unit = charges ? "charges" : "uses";
  const nonmagical = /becomes a nonmagical|ceases to be magical|becomes useless/.test(t)
    ? true
    : false;
  return {
    kind: "counter",
    id: unit,
    unit,
    capacity:
      typeof stock === "number"
        ? { kind: "fixed", amount: stock }
        : { kind: "entered-roll", roll: stock },
    initial: { kind: "full" },
    ...(nonmagical
      ? {
          onEmpty: {
            kind: "deterministic",
            outcomes: [{ kind: "set-item-disposition", disposition: "nonmagical" }],
          },
        }
      : {}),
  };
}

function spend(id: string, resourceId: string, amount = 1) {
  return planResourceCommand(
    { itemId: id, resources: item(id).resources ?? [] },
    { srdId: id, instanceId: "batch-1" },
    undefined,
    {
      kind: "spend",
      occurrenceId: `test:${id}`,
      expectedRevision: 0,
      resourceId,
      amount,
      inputs: {},
    }
  );
}

describe("items that count a stated resource", () => {
  const COUNTED = [
    "bag-of-beans",
    "bag-of-tricks",
    "bowl-of-commanding-water-elementals",
    "brazier-of-commanding-fire-elementals",
    "censer-of-controlling-air-elementals",
    "chime-of-opening",
    "cloak-of-invisibility",
    "cubic-gate",
    "dust-of-disappearance",
    "dust-of-dryness",
    "elemental-gem",
    "gem-of-brightness",
    "javelin-of-lightning",
    "mace-of-terror",
    "pearl-of-power",
    "pipes-of-haunting",
    "pipes-of-the-sewers",
    "plate-armor-of-etherealness",
    "ring-of-evasion",
    "ring-of-shooting-stars",
    "ring-of-the-ram",
    "robe-of-scintillating-colors",
    "rod-of-resurrection",
    "rod-of-rulership",
    "sending-stones",
    "sovereign-glue",
    "staff-of-withering",
    "stone-of-controlling-earth-elementals",
    "universal-solvent",
    "wand-of-enemy-detection",
    "wand-of-paralysis",
    "wand-of-secrets",
    "wand-of-wonder",
  ];

  it.each(COUNTED)("%s declares the one resource its text states", (id) => {
    expect(item(id).resources).toEqual([resourceStatedBy(id)]);
  });

  it.each(COUNTED)("%s spends from it (a rolled stock asks for the roll first)", (id) => {
    const spec = resourceStatedBy(id);
    const planned = spend(id, spec.id);
    expect(planned.status).toBe(
      spec.capacity.kind === "fixed" ? "planned" : "pending-input"
    );
  });

  it("Helm of Telepathy: each spell has its own use back at dawn", () => {
    expect(text("helm-of-telepathy")).toMatch(
      new RegExp(`that spell can${APOS}t be cast from it again until the next dawn`)
    );
    const ids = item("helm-of-telepathy").resources?.map((r) => r.id);
    expect(ids).toEqual(["detect-thoughts", "suggestion"]);
    for (const resource of item("helm-of-telepathy").resources ?? []) {
      expect(resource).toEqual({
        ...resourceStatedBy("helm-of-telepathy"),
        id: resource.id,
      });
      expect(spend("helm-of-telepathy", resource.id).status).toBe("planned");
    }
  });
});

// ── Spells cast from the item ────────────────────────────────────────────────

const SPELL_NAMES = spellEn as Record<string, { name?: string }>;
const spellName = (id: string): string => SPELL_NAMES[id]?.name ?? id;

function bearer(ref: SrdEquipmentRef): CharacterDoc {
  return makeCharacterDoc({ classId: "fighter", level: 5, equipment: [ref] });
}

/** An equipped, attuned copy with its resource(s) at full. */
function holding(id: string): { doc: CharacterDoc; instanceId: string } {
  const instanceId = `${id}-copy`;
  const doc = bearer({
    srdId: id,
    instanceId,
    equipped: true,
    attuned: true,
    quantity: 1,
  });
  const resources = Object.fromEntries(
    (item(id).resources ?? []).map((r) => {
      const capacity = r.capacity.kind === "fixed" ? r.capacity.amount : 1;
      return [r.id, { capacity, current: capacity, disabled: false }] as const;
    })
  );
  if (Object.keys(resources).length > 0) {
    doc.session.itemResources = {
      [instanceId]: {
        itemId: id,
        instanceId,
        revision: 0,
        resources,
        disposition: "magical",
        causalHead: null,
      },
    };
  }
  return { doc, instanceId };
}

describe("spells cast from the item", () => {
  const AT_WILL: ReadonlyArray<[string, string[]]> = [
    ["boots-of-levitation", ["levitate"]],
    ["ring-of-jumping", ["jump"]],
    ["ring-of-water-walking", ["water-walk"]],
    ["ring-of-shooting-stars", ["dancing-lights", "light"]],
  ];

  it.each(AT_WILL)("%s casts %j at will, as its text says", (id, spellIds) => {
    for (const spellId of spellIds) {
      expect(text(id)).toMatch(
        new RegExp(`cast (?:[A-Z]\\w* )*(?:or )?${spellName(spellId)}\\b`)
      );
    }
    const { doc } = holding(id);
    const atWill = aggregateCharacterGrants(doc.character, doc.session).atWillCasts.map(
      (cast) => cast.spellId
    );
    expect(atWill).toEqual(expect.arrayContaining(spellIds));
  });

  /** [item, spell, charges the text says it spends, save DC the text states]. */
  const PAID: ReadonlyArray<[string, string, number, number | undefined]> = [
    ["helm-of-telepathy", "detect-thoughts", 1, 13],
    ["helm-of-telepathy", "suggestion", 1, 13],
    ["sending-stones", "sending", 1, undefined],
    ["chime-of-opening", "knock", 1, undefined],
    ["ring-of-shooting-stars", "faerie-fire", 1, undefined],
    ["cubic-gate", "gate", 1, undefined],
    ["cubic-gate", "plane-shift", 1, undefined],
    ["rod-of-resurrection", "heal", 1, undefined],
    ["rod-of-resurrection", "resurrection", 5, undefined],
  ];

  it.each(PAID)("%s casts %s, paid from its own resource", (id, spellId, cost, dc) => {
    const t = text(id);
    expect(t).toContain(spellName(spellId));
    if (cost > 1)
      expect(t).toMatch(
        new RegExp(`${spellName(spellId)} \\(expends ${cost} charges\\)`)
      );
    if (dc !== undefined) expect(t).toMatch(new RegExp(`save DC ${dc}`));

    const { doc, instanceId } = holding(id);
    const row = freeCastSourcesForSpell(doc, spellId, "en", "SIG").find(
      (source) =>
        source.payment?.kind === "item-resource" &&
        source.payment.instanceId === instanceId
    );
    expect(row, `${id} → ${spellId}`).toBeDefined();
    expect(row?.castLevels?.[0]?.cost ?? 1).toBe(cost);
    if (dc !== undefined) expect(row?.castOverrides).toEqual({ saveDC: dc });
  });
});

// ── Activated states ─────────────────────────────────────────────────────────

describe("activated item states", () => {
  function lit(id: string, authoredKey: string) {
    const { doc, instanceId } = holding(id);
    const key = `magic-item:${instanceId}:${authoredKey}`;
    return { doc, key, instanceId };
  }

  /** [item, the text's phrase, action economy, duration in rounds or null]. */
  const INVISIBLE: ReadonlyArray<[string, RegExp, number | null]> = [
    [
      "ring-of-invisibility",
      /Magic action to give yourself the Invisible condition/,
      null,
    ],
    ["cloak-of-invisibility", /Invisible condition for (1) hour/, 600],
    ["dust-of-disappearance", /Invisible condition for 2d(4) minutes/, 80],
  ];

  it.each(INVISIBLE)(
    "%s gives the Invisible condition while lit",
    (id, phrase, rounds) => {
      const m = phrase.exec(text(id));
      expect(m).not.toBeNull();
      // Dust runs the 2d4's maximum (8 minutes); the table's roll ends it sooner.
      if (id === "dust-of-disappearance") expect(Number(m?.[1]) * 2 * 10).toBe(rounds);
      if (id === "cloak-of-invisibility") expect(Number(m?.[1]) * 600).toBe(rounds);

      const { doc, key, instanceId } = lit(id, id);
      const action = resolveActions(doc).find((row) => row.activatesKey === key);
      expect(action, id).toMatchObject({ type: "action" });
      if (item(id).resources?.length) {
        expect(action?.resourcePayment).toMatchObject({
          instanceId,
          resourceId: item(id).resources?.[0]?.id,
        });
      }
      expect(effectiveSessionConditions(doc.session)).not.toContain("invisible");

      doc.session.activeFeatures = [key];
      expect(effectiveSessionConditions(doc.session)).toContain("invisible");
      const timed = resolveActiveTimedEffects(doc).find(
        (effect) => effect.activeKey === key
      );
      expect(timed?.maxRounds).toBe(rounds ?? undefined);

      // Ending the condition ends the state that gives it.
      const ended = removeCondition(doc, "invisible");
      expect(ended?.session.activeFeatures ?? []).not.toContain(key);
    }
  );

  it("Dust of Disappearance: an attack roll, damage or a spell ends it early", () => {
    expect(text("dust-of-disappearance")).toMatch(
      /makes an attack roll, deals damage, or casts a spell, the Invisible condition ends/
    );
    for (const act of ["attack-roll", "deal-damage", "cast-spell"] as const) {
      const { doc, key } = lit("dust-of-disappearance", "dust-of-disappearance");
      doc.session.activeFeatures = [key];
      expect(endStatesOnAct(doc, act)?.ended).toEqual([key]);
    }
    // The ring's invisibility does not end on an attack (SRD 5.2.1).
    const { doc, key } = lit("ring-of-invisibility", "ring-of-invisibility");
    doc.session.activeFeatures = [key];
    expect(endStatesOnAct(doc, "attack-roll")).toBeNull();
  });

  it("Robe of Scintillating Colors: a charge gives Disadvantage against you to your next turn's end", () => {
    const id = "robe-of-scintillating-colors";
    expect(text(id)).toMatch(/expend 1 charge[^.]*until the end of your next turn/);
    expect(text(id)).toMatch(/Disadvantage on attack rolls against you/);
    const { doc, key } = lit(id, id);
    const action = resolveActions(doc).find((row) => row.activatesKey === key);
    expect(action).toMatchObject({ type: "action", resourceCost: 1 });
    const off = aggregateCharacterGrants(doc.character, doc.session);
    expect(off.incomingAttackDisadvantages).toHaveLength(0);
    doc.session.activeFeatures = [key];
    const on = aggregateCharacterGrants(doc.character, doc.session);
    expect(on.incomingAttackDisadvantages).toHaveLength(1);
  });

  it("Lantern of Revealing: lit, it shows the Invisible within its 30-foot Bright Light", () => {
    const id = "lantern-of-revealing";
    const range = Number(/Bright Light in a (\d+)-foot radius/.exec(text(id))?.[1]);
    expect(text(id)).toMatch(/Invisible creatures and objects are visible/);
    const { doc, key } = lit(id, id);
    const senses = () =>
      deriveSensesAndSpeeds(aggregateCharacterGrants(doc.character, doc.session), 30)
        .senses;
    expect(senses().some((s) => s.kind === "see-invisible")).toBe(false);
    doc.session.activeFeatures = [key];
    expect(senses()).toContainEqual({ kind: "see-invisible", rangeFt: range });
  });
});

describe("standing benefits", () => {
  it("Thunderous Greatclub: attuned, your Strength is 20 unless already higher", () => {
    const id = "thunderous-greatclub";
    const score = Number(/your Strength is (\d+) unless/.exec(text(id))?.[1]);
    const scores = (str: number, attuned: boolean) => {
      const doc = bearer({ srdId: id, equipped: true, attuned, quantity: 1 });
      doc.character.abilityScores = { ...doc.character.abilityScores, STR: str };
      const agg = aggregateCharacterGrants(doc.character, doc.session);
      return aggregateAbilityScores(doc.character.abilityScores, agg).STR;
    };
    expect(scores(10, true)).toBe(score);
    expect(scores(22, true)).toBe(22);
    expect(scores(10, false)).toBe(10);
  });
});

describe("potions that give a spell's standing effect", () => {
  it("Potion of Diminution: the Reduce effect for 1d4 hours (Disadvantage on Strength)", () => {
    const id = "potion-of-diminution";
    expect(text(id)).toMatch(
      /“reduce” effect of the Enlarge\/Reduce spell for 1d(4) hours/
    );
    expect(item(id).durationRounds).toBe(4 * 600);
    const doc = bearer({ srdId: "dagger", quantity: 1 });
    doc.session.activeFeatures = [`potion:${id}`];
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect(
      agg.disadvantages
        .filter((d) => d.vs === "str")
        .map((d) => d.rollType)
        .sort()
    ).toEqual(["check", "save"]);
  });

  it("Oil of Slipperiness: Freedom of Movement for 8 hours", () => {
    const id = "oil-of-slipperiness";
    expect(text(id)).toMatch(/effect of the Freedom of Movement spell for (8) hours/);
    expect(item(id).durationRounds).toBe(8 * 600);
    const doc = bearer({ srdId: "dagger", quantity: 1 });
    doc.session.activeFeatures = [`potion:${id}`];
    const agg = aggregateCharacterGrants(doc.character, doc.session);
    expect([...agg.conditionImmunities].sort()).toEqual(
      expect.arrayContaining(["paralyzed", "restrained"])
    );
    expect(deriveSensesAndSpeeds(agg, 30).speeds).toContainEqual({
      kind: "swim",
      rangeFt: 30,
    });
  });
});

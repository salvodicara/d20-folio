/**
 * Utility spells, batch 2 (SRD 5.2.1): three spells that batch 1 left as a lit
 * reminder now carry their numbers, through three GENERIC grant shapes (each
 * usable by any homebrew feature, none named after a spell):
 *
 *  - `roll-die-adjustment.appliesTo` (a skill id): Guidance, "choose a skill.
 *    Until the spell ends, the creature adds 1d4 to any ability check using the
 *    chosen skill." The skill row of the sheet carries the +1d4.
 *  - `damage-die-reduction` (new kind): Resistance, "choose a damage type: Acid,
 *    Bludgeoning, Cold, Fire, Lightning, Necrotic, Piercing, Poison, Radiant,
 *    Slashing, or Thunder ... reduces the total damage taken by 1d4 ... only
 *    once per turn." The defenses view carries the −1d4 line.
 *  - `roll-floor.ability`: Glibness, "when you make a Charisma check, you can
 *    replace the number you roll with a 15." The lie-detection clause stays a
 *    note.
 *
 * Every number comes from the catalogue text, read in the first test.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { CombatTargeting } from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import { evaluateGrants, type AggregatedGrants, type Grant } from "@/lib/grants";
import type { LocText } from "@/lib/loc-text";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import { concentrationValue } from "@/lib/concentration";
import { MOCK_CHARACTER } from "@/lib/mock";
import { ALL_SKILLS } from "@/lib/skills";
import { advanceEffectTimers, resolveActions } from "@/lib/smart-tracker";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { deriveDamageDieReductions } from "@/lib/views/sheet-view";
import type { CharacterDoc } from "@/types/character";
import EN_SPELLS from "@/i18n/en/srd/spells.json";
import IT_SPELLS from "@/i18n/it/srd/spells.json";

const EN = EN_SPELLS as Record<string, Record<string, string>>;
const IT = IT_SPELLS as Record<string, Record<string, string>>;

/** What the lit state puts in the aggregate; absent = nothing of that kind. */
interface LitFacts {
  dice?: AggregatedGrants["rollDieAdjustments"];
  dieReductions?: AggregatedGrants["damageDieReductions"];
  floors?: ReadonlyArray<{
    rollType: string;
    floor: number;
    appliesTo: string;
    ability?: string;
  }>;
  notes?: number;
}

interface Row {
  id: string;
  /** The catalogue clause each number is read from. */
  text: ReadonlyArray<string>;
  recipient: "caster" | "selected";
  targeting?: CombatTargeting;
  minutes: number;
  concentration: boolean;
  lit: LitFacts;
  choice?: { options: ReadonlyArray<string>; pick: string; lit: LitFacts };
}

const RESISTANCE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "radiant",
  "slashing",
  "thunder",
];

const ROWS: ReadonlyArray<Row> = [
  {
    id: "guidance",
    text: ["choose a skill", "adds 1d4 to any ability check using the chosen skill"],
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 1,
    concentration: true,
    lit: {},
    choice: {
      options: ALL_SKILLS.map((s) => s.id),
      pick: "stealth",
      lit: {
        dice: [
          {
            sourceId: "guidance",
            rollType: "check",
            operation: "add",
            dice: "1d4",
            consume: "each",
            appliesTo: "stealth",
          },
        ],
      },
    },
  },
  {
    id: "resistance",
    text: [
      "Acid, Bludgeoning, Cold, Fire, Lightning, Necrotic, Piercing, Poison, Radiant, Slashing, or Thunder",
      "reduces the total damage taken by 1d4",
      "only once per turn",
    ],
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 1,
    concentration: true,
    lit: {},
    choice: {
      options: RESISTANCE_TYPES,
      pick: "fire",
      lit: {
        dieReductions: [
          {
            sourceId: "resistance",
            dice: "1d4",
            damageTypes: ["fire"],
            oncePerTurn: true,
          },
        ],
      },
    },
  },
  {
    id: "glibness",
    text: [
      "when you make a Charisma check, you can replace the number you roll with a 15",
      "magic that would determine if you are telling the truth",
    ],
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: {
      floors: [{ rollType: "check", floor: 15, appliesTo: "all", ability: "CHA" }],
      notes: 1,
    },
  },
];

const keyOf = (id: string) => `spell-${id}`;
const sourcesOf = (id: string) =>
  resolveGrantSourcesForSpells([{ srdId: id, prepared: true }]);

function lit(id: string, pick?: string): AggregatedGrants {
  const key = keyOf(id);
  return evaluateGrants(
    sourcesOf(id),
    new Set([key]),
    pick ? new Map([[key, pick]]) : new Map()
  );
}

function factsOf(agg: AggregatedGrants): Required<LitFacts> {
  return {
    dice: agg.rollDieAdjustments,
    dieReductions: agg.damageDieReductions,
    floors: agg.rollFloors.map((f) => ({
      rollType: f.rollType,
      floor: f.floor,
      appliesTo: f.appliesTo,
      ...(f.ability ? { ability: f.ability } : {}),
    })),
    notes: agg.defenseNotes.length,
  };
}

const expected = (facts: LitFacts): Required<LitFacts> => ({
  dice: facts.dice ?? [],
  dieReductions: facts.dieReductions ?? [],
  floors: facts.floors ?? [],
  notes: facts.notes ?? 0,
});

function caster(id: string, activeKeys: string[], picks = {}): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: { ...MOCK_CHARACTER.character, spells: [{ srdId: id, prepared: true }] },
    session: {
      ...MOCK_CHARACTER.session,
      concentration: getSpellById(id)?.concentration
        ? concentrationValue(id)
        : MOCK_CHARACTER.session.concentration,
      activeFeatures: activeKeys,
      grantBundleChoices: picks,
      effectTimers: {},
    },
  };
}

function whileActive(id: string) {
  return getSpellById(id)?.grants?.find(
    (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
  );
}

describe("utility spells batch 2: the lit state carries the spell's numbers", () => {
  it.each(ROWS)("$id: every number is read from the catalogue text", (row) => {
    const description = EN[row.id]?.description ?? "";
    for (const clause of row.text) expect(description).toContain(clause);
  });

  it.each(ROWS)("$id: a $recipient state for the spell's own duration", (row) => {
    const spell = getSpellById(row.id);
    expect(spell?.source).toBe("SRD");
    expect(spell?.concentration).toBe(row.concentration);
    expect(spell?.targeting).toEqual(row.targeting);
    const wa = whileActive(row.id);
    expect(wa?.activeKey).toBe(keyOf(row.id));
    expect(wa?.recipient ?? "caster").toBe(row.recipient);
    expect(wa?.duration).toMatchObject({ kind: "timed", minutes: row.minutes });
  });

  it.each(ROWS)(
    "$id: casting lights the status, ended by time or Concentration",
    (row) => {
      const spell = getSpellById(row.id);
      if (!spell) throw new Error(`no spell ${row.id}`);
      const status = translateSpell(spell).activity.effects.find(
        (e) => e.kind === "status"
      );
      expect(status).toEqual(
        expect.objectContaining({
          key: keyOf(row.id),
          recipient: row.recipient === "selected" ? "selected" : "self",
          lifetime: { kind: "rounds", roundsLeft: row.minutes * 10 },
        })
      );
      const endsOn = status?.kind === "status" ? status.endsOn : [];
      expect(endsOn.some((end) => end.kind === "concentration")).toBe(row.concentration);
    }
  );

  it.each(ROWS)("$id: the cast row hands its round cap to the timer path", (row) => {
    const cast = resolveActions(caster(row.id, []), "spellbook").find(
      (a) => a.spellId === row.id
    );
    expect(cast).toBeDefined();
    if (row.recipient === "caster") {
      expect(cast?.activatesKey).toBe(keyOf(row.id));
      expect(cast?.activeDurationRounds).toBe(row.minutes * 10);
    } else {
      expect(cast?.standingEffect).toEqual(
        expect.objectContaining({ activeKey: keyOf(row.id), maxRounds: row.minutes * 10 })
      );
    }
  });

  it.each(ROWS)("$id: lit, it expires exactly when its time has passed", (row) => {
    const doc = caster(row.id, [keyOf(row.id)]);
    const rounds = row.minutes * 10;
    const early = advanceEffectTimers(doc, undefined, rounds - 1);
    expect(early.expired.map((e) => e.activeKey)).not.toContain(keyOf(row.id));
    const done = advanceEffectTimers(doc, undefined, rounds);
    expect(done.expired.map((e) => e.activeKey)).toContain(keyOf(row.id));
  });

  it.each(ROWS)("$id: nothing until lit, then exactly its effect", (row) => {
    expect(factsOf(evaluateGrants(sourcesOf(row.id)))).toEqual(expected({}));
    expect(factsOf(lit(row.id))).toEqual(expected(row.lit));
    if (row.choice) {
      const bundle = lit(row.id).grantBundles.find((b) => b.bundleKey === keyOf(row.id));
      expect(bundle?.options.map((o) => o.id)).toEqual(row.choice.options);
      expect(factsOf(lit(row.id, row.choice.pick))).toEqual(
        expected({ ...row.lit, ...row.choice.lit })
      );
    }
  });

  it.each(ROWS)("$id: every label and note reads in English and Italian", (row) => {
    const texts: LocText[] = [];
    for (const pick of row.choice ? row.choice.options : [undefined]) {
      const agg = lit(row.id, pick);
      texts.push(
        ...agg.defenseNotes.map((n) => n.description),
        ...agg.rollFloors.map((f) => f.description)
      );
      for (const bundle of agg.grantBundles) {
        texts.push(bundle.label, ...bundle.options.map((o) => o.label));
      }
    }
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect("srd" in text, JSON.stringify(text)).toBe(true);
      if (!("srd" in text)) continue;
      const en = EN[text.srd.key]?.[text.srd.field];
      const it = IT[text.srd.key]?.[text.srd.field];
      expect(en, `${text.srd.key}.${text.srd.field}`).toBeTruthy();
      expect(it, `${text.srd.key}.${text.srd.field} (it)`).toBeTruthy();
      expect(it).not.toBe(en);
      for (const value of [en, it]) expect(value).not.toContain("—");
    }
  });
});

describe("utility spells batch 2: the sheet's own rows carry the numbers", () => {
  it("Guidance on Stealth puts +1d4 on the Stealth row and nowhere else", () => {
    const doc = caster("guidance", [keyOf("guidance")], {
      [keyOf("guidance")]: "stealth",
    });
    const { skills, saves } = deriveSavesAndChecks(doc.character, doc.session);
    for (const row of skills) {
      expect(
        row.dieAdjustments.map((d) => `${d.operation}:${d.dice}`),
        row.id
      ).toEqual(row.id === "stealth" ? ["add:1d4"] : []);
    }
    for (const row of saves) expect(row.dieAdjustments).toEqual([]);
  });

  it("Guidance with no skill picked yet adds nothing", () => {
    const doc = caster("guidance", [keyOf("guidance")]);
    const { skills } = deriveSavesAndChecks(doc.character, doc.session);
    expect(skills.flatMap((row) => row.dieAdjustments)).toEqual([]);
  });

  it("Bless puts +1d4 on every save row and on no skill row", () => {
    const doc = caster("bless", [keyOf("bless")]);
    const { skills, saves } = deriveSavesAndChecks(doc.character, doc.session);
    for (const row of saves) {
      expect(
        row.dieAdjustments.map((d) => `${d.operation}:${d.dice}`),
        row.id
      ).toEqual(["add:1d4"]);
    }
    expect(skills.flatMap((row) => row.dieAdjustments)).toEqual([]);
  });

  it("an unscoped check die reaches every skill row", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          {
            type: "roll-die-adjustment",
            rollType: "check",
            operation: "add",
            dice: "1d6",
            consume: "next",
          },
        ],
      },
    ]);
    expect(agg.rollDieAdjustments).toEqual([
      {
        sourceId: "homebrew",
        rollType: "check",
        operation: "add",
        dice: "1d6",
        consume: "next",
      },
    ]);
  });

  it("Resistance on Fire is a −1d4 Fire line, once per turn", () => {
    expect(deriveDamageDieReductions(lit("resistance", "fire"))).toEqual([
      { sourceId: "resistance", dice: "1d4", damageTypes: ["fire"], oncePerTurn: true },
    ]);
    expect(deriveDamageDieReductions(lit("resistance"))).toEqual([]);
  });

  it("a homebrew die reduction keeps its types sorted and its turn limit off", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          { type: "damage-die-reduction", dice: "1d6", damageTypes: ["fire", "cold"] },
        ],
      },
    ]);
    expect(deriveDamageDieReductions(agg)).toEqual([
      {
        sourceId: "homebrew",
        dice: "1d6",
        damageTypes: ["cold", "fire"],
        oncePerTurn: false,
      },
    ]);
  });
});

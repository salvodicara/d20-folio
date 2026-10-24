/**
 * Utility spells, batch 3 (SRD 5.2.1): six spells that batch 1 left as a lit
 * reminder now carry their effect, through GENERIC grant shapes (each usable by
 * any homebrew feature or item, none named after a spell):
 *
 *  - `see-invisible` without a `range`: See Invisibility, "you see creatures and
 *    objects that have the Invisible condition as if they were visible". The text
 *    names no distance, so the sense has none: line of sight only.
 *  - `detection` (new kind) `{ what, range }`: Detect Magic ("magical effects
 *    within 30 feet"), Detect Evil and Good ("Aberration, Celestial, Elemental,
 *    Fey, Fiend, or Undead within 30 feet") and Detect Poison and Disease
 *    ("poisons, poisonous or venomous creatures, and magical contagions within
 *    30 feet").
 *  - `slowed-fall` (new kind) `{ feetPerRound }`: Feather Fall, "rate of descent
 *    slows to 60 feet per round ... takes no damage from the fall".
 *  - the spell's `followUp`: Expeditious Retreat, "until the spell ends, you can
 *    take that action [Dash] again as a Bonus Action": the Cunning Action shape,
 *    a bonus-action row that counts as Dash.
 *
 * Every number comes from the catalogue text, read in the first test.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { CombatTargeting } from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import { concentrationValue } from "@/lib/concentration";
import { economyActionCategory } from "@/lib/combat-economy";
import { evaluateGrants, type AggregatedGrants, type Grant } from "@/lib/grants";
import { MOCK_CHARACTER } from "@/lib/mock";
import { fallDamageDice, slowedFallFtPerRound } from "@/lib/play/fall";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import { advanceEffectTimers, resolveActions } from "@/lib/smart-tracker";
import { deriveCharacter } from "@/lib/views/derive-character";
import {
  deriveSensesAndSpeeds,
  type DetectionEntry,
  type SensesSpeedsView,
} from "@/lib/views/sheet-view";
import type { CharacterDoc } from "@/types/character";
import EN_SPELLS from "@/i18n/en/srd/spells.json";
import EN_UI from "@/i18n/en/ui/character.json";
import IT_UI from "@/i18n/it/ui/character.json";

const EN = EN_SPELLS as Record<string, Record<string, string>>;

/** What the lit state gives; absent = nothing of that kind. */
interface LitFacts {
  unlimitedSenses?: SensesSpeedsView["unlimitedSenses"];
  detections?: DetectionEntry[];
  slowedFallFt?: number;
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
}

const ROWS: ReadonlyArray<Row> = [
  {
    id: "see-invisibility",
    text: ["you see creatures and objects that have the Invisible condition"],
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: { unlimitedSenses: ["see-invisible"] },
  },
  {
    id: "detect-magic",
    text: ["you sense the presence of magical effects within 30 feet of yourself"],
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { detections: [{ what: "magic", rangeFt: 30 }] },
  },
  {
    id: "detect-evil-and-good",
    text: [
      "Aberration, Celestial, Elemental, Fey, Fiend, or Undead within 30 feet of yourself",
    ],
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { detections: [{ what: "evil-and-good", rangeFt: 30 }] },
  },
  {
    id: "detect-poison-and-disease",
    text: [
      "poisons, poisonous or venomous creatures, and magical contagions within 30 feet of yourself",
    ],
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { detections: [{ what: "poison-and-disease", rangeFt: 30 }] },
  },
  {
    id: "feather-fall",
    text: [
      "Choose up to five falling creatures",
      "slows to 60 feet per round",
      "takes no damage from the fall",
    ],
    recipient: "selected",
    targeting: { affinity: "any", maxTargets: 5 },
    minutes: 1,
    concentration: false,
    lit: { slowedFallFt: 60 },
  },
  {
    id: "expeditious-retreat",
    text: ["you can take that action again as a Bonus Action"],
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: {},
  },
];

const keyOf = (id: string) => `spell-${id}`;
const sourcesOf = (id: string) =>
  resolveGrantSourcesForSpells([{ srdId: id, prepared: true }]);
const lit = (id: string): AggregatedGrants =>
  evaluateGrants(sourcesOf(id), new Set([keyOf(id)]));

function factsOf(agg: AggregatedGrants): Required<LitFacts> {
  const view = deriveSensesAndSpeeds(agg, 30);
  return {
    unlimitedSenses: view.unlimitedSenses,
    detections: view.detections,
    slowedFallFt: slowedFallFtPerRound(agg) ?? 0,
  };
}

const expected = (facts: LitFacts): Required<LitFacts> => ({
  unlimitedSenses: facts.unlimitedSenses ?? [],
  detections: facts.detections ?? [],
  slowedFallFt: facts.slowedFallFt ?? 0,
});

function caster(id: string, activeKeys: string[]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: { ...MOCK_CHARACTER.character, spells: [{ srdId: id, prepared: true }] },
    session: {
      ...MOCK_CHARACTER.session,
      concentration: getSpellById(id)?.concentration
        ? concentrationValue(id)
        : MOCK_CHARACTER.session.concentration,
      activeFeatures: activeKeys,
      effectTimers: {},
    },
  };
}

function whileActive(id: string) {
  return getSpellById(id)?.grants?.find(
    (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
  );
}

describe("utility spells batch 3: the lit state carries the spell's effect", () => {
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
    // No reminder note any more: the effect itself is structured.
    expect(lit(row.id).defenseNotes).toEqual([]);
  });

  it("every detection label reads in English and Italian", () => {
    const en = EN_UI.character as unknown as Record<string, string>;
    const it = IT_UI.character as unknown as Record<string, string>;
    for (const row of ROWS) {
      for (const { what } of row.lit.detections ?? []) {
        expect(en[`detect_${what}`], what).toBeTruthy();
        expect(it[`detect_${what}`], what).toBeTruthy();
        expect(it[`detect_${what}`]).not.toBe(en[`detect_${what}`]);
      }
    }
  });
});

describe("utility spells batch 3: the sheet's own numbers", () => {
  it("See Invisibility lists see-invisible with no range on the sheet", () => {
    const sheet = deriveCharacter(
      caster("see-invisibility", [keyOf("see-invisibility")])
    );
    expect(sheet.unlimitedSenses).toEqual(["see-invisible"]);
    // The ranged list (the rail's feet numbers) does not invent a distance.
    expect(sheet.senses.map((s) => s.kind)).not.toContain("see-invisible");
  });

  it("a ranged see-invisible keeps its feet (Lantern of Revealing, 30 ft)", () => {
    const agg = evaluateGrants([
      { id: "lantern", grants: [{ type: "see-invisible", range: 30 }] },
    ]);
    const view = deriveSensesAndSpeeds(agg, 30);
    expect(view.senses).toContainEqual({ kind: "see-invisible", rangeFt: 30 });
    expect(view.unlimitedSenses).toEqual([]);
  });

  it("an unlimited see-invisible covers a ranged one of the same kind", () => {
    const agg = evaluateGrants([
      { id: "lantern", grants: [{ type: "see-invisible", range: 30 }] },
      { id: "homebrew", grants: [{ type: "see-invisible" }] },
    ]);
    const view = deriveSensesAndSpeeds(agg, 30);
    expect(view.senses.map((s) => s.kind)).not.toContain("see-invisible");
    expect(view.unlimitedSenses).toEqual(["see-invisible"]);
  });

  it("Detect Magic lists magic within 30 ft on the sheet", () => {
    const sheet = deriveCharacter(caster("detect-magic", [keyOf("detect-magic")]));
    expect(sheet.detections).toEqual([{ what: "magic", rangeFt: 30 }]);
  });

  it("detections keep the longest range per kind, in display order", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          { type: "detection", what: "poison-and-disease", range: 10 },
          { type: "detection", what: "magic", range: 30 },
          { type: "detection", what: "magic", range: 60 },
        ],
      },
    ]);
    expect(deriveSensesAndSpeeds(agg, 30).detections).toEqual([
      { what: "magic", rangeFt: 60 },
      { what: "poison-and-disease", rangeFt: 10 },
    ]);
  });

  it("Feather Fall: a 100 ft fall deals no dice while lit, 10d6 without it", () => {
    expect(
      fallDamageDice(100, "ft", slowedFallFtPerRound(lit("feather-fall")) !== null)
    ).toBe(0);
    expect(
      fallDamageDice(30, "m", slowedFallFtPerRound(lit("feather-fall")) !== null)
    ).toBe(0);
    const unlit = evaluateGrants(sourcesOf("feather-fall"));
    expect(slowedFallFtPerRound(unlit)).toBeNull();
    expect(fallDamageDice(100, "ft", slowedFallFtPerRound(unlit) !== null)).toBe(10);
  });

  it("two slowed falls keep the slower descent", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          { type: "slowed-fall", feetPerRound: 60 },
          { type: "slowed-fall", feetPerRound: 30 },
        ],
      },
    ]);
    expect(slowedFallFtPerRound(agg)).toBe(30);
  });

  it("Expeditious Retreat: while concentrating, a bonus-action Dash row, no slot", () => {
    const row = resolveActions(
      caster("expeditious-retreat", [keyOf("expeditious-retreat")]),
      "combat"
    ).find((a) => a.id === "spell-expeditious-retreat-recurring");
    expect(row).toEqual(
      expect.objectContaining({
        type: "bonus",
        costsSlot: false,
        economyCategory: "dash",
      })
    );
    if (row) expect(economyActionCategory(row)).toBe("dash");
  });

  it("Expeditious Retreat: no Dash row before it is cast", () => {
    const doc = caster("expeditious-retreat", []);
    const notCast: CharacterDoc = {
      ...doc,
      session: { ...doc.session, concentration: "" },
    };
    expect(
      resolveActions(notCast, "combat").some(
        (a) => a.id === "spell-expeditious-retreat-recurring"
      )
    ).toBe(false);
  });

  it("the cast row itself stays a spell (its Dash is the table's), the recurring one is Dash", () => {
    const actions = resolveActions(
      caster("expeditious-retreat", [keyOf("expeditious-retreat")]),
      "combat"
    );
    const cast = actions.find(
      (a) =>
        a.spellId === "expeditious-retreat" &&
        a.id !== "spell-expeditious-retreat-recurring"
    );
    expect(cast?.type).toBe("bonus");
    expect(cast?.economyCategory).toBeUndefined();
  });
});

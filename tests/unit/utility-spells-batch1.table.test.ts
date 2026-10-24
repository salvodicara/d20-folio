/**
 * Utility spells, batch 1 (SRD 5.2.1): spells that used to be cast + slot + log
 * only now light a standing state on the caster or the picked creatures when
 * cast, with the effect structured where an existing grant kind says it exactly
 * and a reminder note for the clauses the table adjudicates. Every row takes its
 * numbers from the spell's own catalogue text:
 *
 *  - Water Breathing: up to ten willing creatures breathe underwater, 24 hours.
 *  - Gaseous Form: only a Fly Speed of 10 feet; Resistance to Bludgeoning,
 *    Piercing and Slashing; Immunity to Prone; Advantage on STR/DEX/CON saves;
 *    can't attack or cast spells. Concentration, 1 hour; +1 target per slot.
 *  - Enhance Ability: Advantage on ability checks with the chosen ability (STR,
 *    DEX, INT, WIS or CHA). Concentration, 1 hour; +1 target per slot.
 *  - Protection from Evil and Good: listed creature types have Disadvantage on
 *    attack rolls against the target; charm/fright/possession note.
 *  - Beacon of Hope: any number of creatures; Advantage on WIS saves and Death
 *    Saving Throws; maximum healing as a note. Concentration, 1 minute.
 *  - Pass without Trace: +10 to Dexterity (Stealth) checks; no tracks.
 *  - Heroes' Feast: up to twelve creatures, 24 hours: Resistance to Poison,
 *    Immunity to Frightened and Poisoned; the 2d10 HP maximum is a note.
 *  - Wind Walk: you and up to ten creatures, 8 hours: Fly Speed 300 feet,
 *    Immunity to Prone, Resistance to Bludgeoning, Piercing and Slashing.
 *  - Meld into Stone: Disadvantage on Wisdom (Perception) checks to hear outside.
 *  - Mislead: the caster gains the Invisible condition; the double is a note.
 *  - The rest light a reminder on the right creature(s) for the right time.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { CombatTargeting } from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import { evaluateGrants, type AggregatedGrants, type Grant } from "@/lib/grants";
import type { LocText } from "@/lib/loc-text";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import EN_SPELLS from "@/i18n/en/srd/spells.json";
import IT_SPELLS from "@/i18n/it/srd/spells.json";

const EN = EN_SPELLS as Record<string, Record<string, string>>;
const IT = IT_SPELLS as Record<string, Record<string, string>>;

type Clause = readonly [rollType: string, vs: string];

/** What the lit state puts in the aggregate; absent = nothing of that kind. */
interface LitFacts {
  fly?: number;
  speedCap?: number;
  resist?: ReadonlyArray<string>;
  immune?: ReadonlyArray<string>;
  adv?: ReadonlyArray<Clause>;
  dis?: ReadonlyArray<Clause>;
  checkBonus?: ReadonlyArray<readonly [appliesTo: string, value: number]>;
  incomingDis?: number;
  notes?: number;
  blocksCasting?: true;
  waterBreathing?: true;
}

interface Row {
  id: string;
  recipient: "caster" | "selected";
  targeting?: CombatTargeting;
  /** The spell's own duration, in minutes. */
  minutes: number;
  concentration: boolean;
  lit: LitFacts;
  /** A choice the lit state offers: its option ids, one pick and what it adds. */
  choice?: { options: ReadonlyArray<string>; pick: string; lit: LitFacts };
  /** The cast also applies this condition to its target. */
  condition?: string;
}

const BPS = ["bludgeoning", "piercing", "slashing"];

const ROWS: ReadonlyArray<Row> = [
  // ── Structured effects ──────────────────────────────────────────────────
  {
    id: "water-breathing",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 10 },
    minutes: 1440,
    concentration: false,
    lit: { waterBreathing: true },
  },
  {
    id: "gaseous-form",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
    minutes: 60,
    concentration: true,
    lit: {
      fly: 10,
      speedCap: 0,
      resist: BPS,
      immune: ["prone"],
      adv: [
        ["save", "con"],
        ["save", "dex"],
        ["save", "str"],
      ],
      blocksCasting: true,
      notes: 1,
    },
  },
  {
    id: "enhance-ability",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
    minutes: 60,
    concentration: true,
    lit: {},
    choice: {
      options: ["str", "dex", "int", "wis", "cha"],
      pick: "wis",
      lit: { adv: [["check", "wis"]] },
    },
  },
  {
    id: "protection-from-evil-and-good",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 10,
    concentration: true,
    lit: { incomingDis: 1, notes: 1 },
  },
  {
    id: "beacon-of-hope",
    recipient: "selected",
    targeting: { affinity: "ally" },
    minutes: 1,
    concentration: true,
    lit: {
      adv: [
        ["save", "death-saving-throws"],
        ["save", "wis"],
      ],
      notes: 1,
    },
  },
  {
    id: "pass-without-trace",
    recipient: "selected",
    targeting: { affinity: "ally" },
    minutes: 60,
    concentration: true,
    lit: { checkBonus: [["stealth", 10]], notes: 1 },
  },
  {
    id: "heroes-feast",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 12 },
    minutes: 1440,
    concentration: false,
    lit: { resist: ["poison"], immune: ["frightened", "poisoned"], notes: 1 },
  },
  {
    id: "wind-walk",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 11 },
    minutes: 480,
    concentration: false,
    lit: { fly: 300, resist: BPS, immune: ["prone"], notes: 1 },
  },
  {
    id: "meld-into-stone",
    recipient: "caster",
    minutes: 480,
    concentration: false,
    lit: { dis: [["check", "perception"]], notes: 1 },
  },
  {
    id: "mislead",
    recipient: "caster",
    targeting: { affinity: "self" },
    minutes: 60,
    concentration: true,
    lit: { notes: 1 },
    condition: "invisible",
  },
  // ── A reminder on the right creature(s) for the spell's duration ─────────
  {
    id: "guidance",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 1,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "resistance",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 1,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "jump",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 1 },
    minutes: 1,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "feather-fall",
    recipient: "selected",
    targeting: { affinity: "any", maxTargets: 5 },
    minutes: 1,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "expeditious-retreat",
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "see-invisibility",
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "comprehend-languages",
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "speak-with-animals",
    recipient: "caster",
    minutes: 10,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "disguise-self",
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "detect-magic",
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "detect-evil-and-good",
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "detect-poison-and-disease",
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "nondetection",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 480,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "tongues",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "water-walk",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 10 },
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "blink",
    recipient: "caster",
    minutes: 1,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "speak-with-plants",
    recipient: "caster",
    minutes: 10,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "rarys-telepathic-bond",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 8 },
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "find-the-path",
    recipient: "caster",
    minutes: 1440,
    concentration: true,
    lit: { notes: 1 },
  },
  {
    id: "etherealness",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1, maxTargetsPerUpcast: 3 },
    minutes: 480,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "glibness",
    recipient: "caster",
    minutes: 60,
    concentration: false,
    lit: { notes: 1 },
  },
];

const keyOf = (id: string) => `spell-${id}`;

function sourcesOf(id: string) {
  return resolveGrantSourcesForSpells([{ srdId: id, prepared: true }]);
}

function lit(id: string, pick?: string): AggregatedGrants {
  const key = keyOf(id);
  return evaluateGrants(
    sourcesOf(id),
    new Set([key]),
    pick ? new Map([[key, pick]]) : new Map()
  );
}

const sorted = (clauses: AggregatedGrants["advantages"]) =>
  clauses.map((c) => [c.rollType, c.vs] as const).sort();

/** The aggregate reduced to the facts a row declares, absent kinds empty. */
function factsOf(agg: AggregatedGrants): Required<LitFacts> {
  return {
    fly: typeof agg.flySpeed === "number" ? agg.flySpeed : 0,
    speedCap: agg.speedCapFt ?? -1,
    resist: [...agg.damageResistances].sort(),
    immune: [...agg.conditionImmunities].sort(),
    adv: sorted(agg.advantages),
    dis: sorted(agg.disadvantages),
    checkBonus: agg.abilityCheckBonuses.map(
      (b) => [b.appliesTo, typeof b.value === "number" ? b.value : 0] as const
    ),
    incomingDis: agg.incomingAttackDisadvantages.length,
    notes: agg.defenseNotes.length,
    blocksCasting: agg.spellcastingBlocked as true,
    waterBreathing: agg.airAndWaterBreathing as true,
  };
}

function expected(facts: LitFacts): Required<LitFacts> {
  return {
    fly: facts.fly ?? 0,
    speedCap: facts.speedCap ?? -1,
    resist: [...(facts.resist ?? [])].sort(),
    immune: [...(facts.immune ?? [])].sort(),
    adv: [...(facts.adv ?? [])].sort(),
    dis: [...(facts.dis ?? [])].sort(),
    checkBonus: facts.checkBonus ?? [],
    incomingDis: facts.incomingDis ?? 0,
    notes: facts.notes ?? 0,
    blocksCasting: (facts.blocksCasting ?? false) as true,
    waterBreathing: (facts.waterBreathing ?? false) as true,
  };
}

function whileActive(id: string) {
  return getSpellById(id)?.grants?.find(
    (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
  );
}

describe("utility spells batch 1: the cast lights a standing state", () => {
  it.each(ROWS)(
    "$id: a $recipient state for the spell's own duration and targets",
    (row) => {
      const spell = getSpellById(row.id);
      expect(spell?.source).toBe("SRD");
      expect(spell?.concentration).toBe(row.concentration);
      expect(spell?.targeting).toEqual(row.targeting);
      const wa = whileActive(row.id);
      expect(wa?.activeKey).toBe(keyOf(row.id));
      expect(wa?.recipient ?? "caster").toBe(row.recipient);
      expect(wa?.duration).toMatchObject({ kind: "timed", minutes: row.minutes });
    }
  );

  it.each(ROWS)(
    "$id: casting lights the status, ended by time or Concentration",
    (row) => {
      const spell = getSpellById(row.id);
      if (!spell) throw new Error(`no spell ${row.id}`);
      const { activity } = translateSpell(spell);
      const status = activity.effects.find((e) => e.kind === "status");
      expect(status).toEqual(
        expect.objectContaining({
          key: keyOf(row.id),
          recipient: row.recipient === "selected" ? "selected" : "self",
          lifetime: { kind: "rounds", roundsLeft: row.minutes * 10 },
        })
      );
      const endsOn = status?.kind === "status" ? status.endsOn : [];
      expect(endsOn.some((end) => end.kind === "concentration")).toBe(row.concentration);
      if (row.condition) {
        const condition = activity.effects.find((e) => e.kind === "condition");
        expect(condition?.kind === "condition" && condition.apply.options).toEqual([
          row.condition,
        ]);
      }
    }
  );

  it.each(ROWS)("$id: nothing until lit, then exactly its effect", (row) => {
    const off = evaluateGrants(sourcesOf(row.id));
    expect(factsOf(off)).toEqual(expected({}));
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
    const picks = row.choice ? row.choice.options : [undefined];
    for (const pick of picks) {
      const agg = lit(row.id, pick);
      texts.push(
        ...agg.defenseNotes.map((n) => n.description),
        ...agg.incomingAttackDisadvantages.map((n) => n.description),
        ...agg.advantages.map((a) => a.description),
        ...agg.disadvantages.map((a) => a.description)
      );
      for (const bundle of agg.grantBundles) {
        texts.push(bundle.label, ...bundle.options.map((o) => o.label));
      }
    }
    const label = sourcesOf(row.id)[0]?.grants?.[0];
    expect(label?.type).toBe("while-active");
    expect(EN[`${row.id}.grants.0`]?.label).toBeTruthy();
    expect(IT[`${row.id}.grants.0`]?.label).toBeTruthy();
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

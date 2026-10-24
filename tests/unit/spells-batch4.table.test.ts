/**
 * Spells, batch 4 (SRD 5.2.1): spells that were cast + slot + log only, or a
 * bare save, now carry their effect. Every number is read from the spell's own
 * catalogue text (first test), through generic shapes any homebrew can use:
 *
 *  - `stabilizes` (Spare the Dying): "The creature becomes Stable", the same
 *    stabilize consequence the Healer's Kit already resolves.
 *  - `revives { hitPoints }` (Revivify and Raise Dead "with 1 Hit Point",
 *    Resurrection and True Resurrection "with all its Hit Points"): the cast
 *    names the creature-revive transition, which ordinary healing cannot do.
 *  - `hitPointThreshold { max, atOrBelow }` (Power Word Kill "100 Hit Points or
 *    fewer, it dies", Power Word Stun "150 Hit Points or fewer, it has the
 *    Stunned condition"): which branch a target's current HP takes.
 *  - existing grants on a lit state: Slow (-2 AC and DEX saves, half Speed),
 *    Otto's Irresistible Dance (Disadvantage on DEX saves and attack rolls,
 *    attackers have Advantage), Holy Aura (Advantage on saves, attackers have
 *    Disadvantage), Sanctuary (ends on an attack roll, a spell or damage),
 *    Conjure Minor Elementals (2d8 Acid/Cold/Fire/Lightning on a hit).
 *  - existing cast fields: Banishment's Incapacitated, Otto's Charmed, Conjure
 *    Fey's 3d12 + mod Psychic melee spell attack with Frightened on a hit.
 */
import { describe, expect, it } from "vitest";
import { getSpellById, spells } from "@/data/spells";
import type { CombatTargeting } from "@/data/types";
import { translateSpell } from "@/lib/activities/from-spell";
import { combatResolutionSpec } from "@/lib/combat-resolution";
import { concentrationValue } from "@/lib/concentration";
import { evaluateGrants, type AggregatedGrants, type Grant } from "@/lib/grants";
import type { LocText } from "@/lib/loc-text";
import { MOCK_CHARACTER } from "@/lib/mock";
import { hitPointThresholdOutcome, revivalHitPoints } from "@/lib/play/spell-outcomes";
import { endStatesOnAct } from "@/lib/play/states";
import { resolveGrantSourcesForSpells } from "@/lib/resolve-grant-sources";
import {
  advanceEffectTimers,
  effectiveWalkingSpeedFt,
  resolveActions,
  type ResolvedAction,
} from "@/lib/smart-tracker";
import { localizeAction } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";
import EN_SPELLS from "@/i18n/en/srd/spells.json";
import IT_SPELLS from "@/i18n/it/srd/spells.json";
import { makeCharacterDoc } from "./_helpers";

const EN = EN_SPELLS as Record<string, Record<string, string>>;
const IT = IT_SPELLS as Record<string, Record<string, string>>;

/** The catalogue clauses each row's numbers come from. */
const TEXT: Readonly<Record<string, ReadonlyArray<string>>> = {
  "spare-the-dying": ["has 0 Hit Points and isn't dead", "The creature becomes Stable"],
  revivify: ["died within the last minute", "revives with 1 Hit Point"],
  "raise-dead": ["returns to life with 1 Hit Point"],
  resurrection: ["returns to life with all its Hit Points"],
  "true-resurrection": ["revived with all its Hit Points"],
  "power-word-kill": [
    "If the target has 100 Hit Points or fewer, it dies",
    "Otherwise, it takes 12d12 Psychic damage",
  ],
  "power-word-stun": [
    "If the target has 150 Hit Points or fewer, it has the Stunned condition",
    "Otherwise, its Speed is 0 until the start of your next turn",
  ],
  slow: [
    "up to six creatures",
    "Speed is halved, it takes a −2 penalty to AC and Dexterity saving throws",
    "can't take Reactions",
  ],
  banishment: ["While there, the target has the Incapacitated condition"],
  "ottos-irresistible-dance": [
    "On a failed save, the target has the Charmed condition for the duration",
    "has Disadvantage on Dexterity saving throws and attack rolls, and other creatures have Advantage on attack rolls against it",
  ],
  "holy-aura": [
    "creatures of your choice have Advantage on all saving throws, and other creatures have Disadvantage on attack rolls against them",
  ],
  sanctuary: [
    "You ward a creature within range",
    "The spell ends if the warded creature makes an attack roll, casts a spell, or deals damage",
  ],
  "conjure-minor-elementals": [
    "any attack you make deals an extra 2d8 damage when you hit a creature in the Emanation",
    "Acid, Cold, Fire, or Lightning (your choice",
  ],
  "conjure-fey": [
    "you can make one melee spell attack",
    "Psychic damage equal to 3d12 plus your spellcasting ability modifier",
    "the target has the Frightened condition until the start of your next turn",
    "As a Bonus Action on your later turns",
  ],
};

// ── Lit states ─────────────────────────────────────────────────────────────

/** What a lit state puts in the aggregate; absent = none of that kind. */
interface LitFacts {
  acBonus?: number;
  saveBonusByAbility?: ReadonlyArray<readonly [ability: string, amount: number]>;
  speedMultiplier?: number;
  adv?: ReadonlyArray<readonly [rollType: string, vs: string]>;
  dis?: ReadonlyArray<readonly [rollType: string, vs: string]>;
  incomingAdv?: number;
  incomingDis?: number;
  riders?: ReadonlyArray<{ dice: string; types: ReadonlyArray<string> }>;
  notes?: number;
}

interface StateRow {
  id: string;
  recipient: "caster" | "selected";
  targeting?: CombatTargeting;
  minutes: number;
  concentration: boolean;
  lit: LitFacts;
}

const STATE_ROWS: ReadonlyArray<StateRow> = [
  {
    id: "slow",
    recipient: "selected",
    targeting: { affinity: "enemy", maxTargets: 6 },
    minutes: 1,
    concentration: true,
    lit: {
      acBonus: -2,
      saveBonusByAbility: [["DEX", -2]],
      speedMultiplier: 0.5,
      notes: 1,
    },
  },
  {
    id: "ottos-irresistible-dance",
    recipient: "selected",
    targeting: { affinity: "enemy", maxTargets: 1 },
    minutes: 1,
    concentration: true,
    lit: {
      dis: [
        ["attack", "ottos-irresistible-dance"],
        ["save", "dex"],
      ],
      incomingAdv: 1,
      notes: 1,
    },
  },
  {
    id: "holy-aura",
    recipient: "selected",
    targeting: { affinity: "ally" },
    minutes: 1,
    concentration: true,
    lit: { adv: [["save", "holy-aura"]], incomingDis: 1, notes: 1 },
  },
  {
    id: "sanctuary",
    recipient: "selected",
    targeting: { affinity: "ally", maxTargets: 1 },
    minutes: 1,
    concentration: false,
    lit: { notes: 1 },
  },
  {
    id: "conjure-minor-elementals",
    recipient: "caster",
    minutes: 10,
    concentration: true,
    lit: { riders: [{ dice: "2d8", types: ["acid", "cold", "fire", "lightning"] }] },
  },
];

const keyOf = (id: string) => `spell-${id}`;
const sourcesOf = (id: string) =>
  resolveGrantSourcesForSpells([{ srdId: id, prepared: true }]);
const lit = (id: string): AggregatedGrants =>
  evaluateGrants(sourcesOf(id), new Set([keyOf(id)]));

const sorted = <T>(items: ReadonlyArray<T>) =>
  [...items].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

function factsOf(agg: AggregatedGrants): Required<LitFacts> {
  return {
    acBonus: agg.acBonus,
    saveBonusByAbility: sorted(
      agg.saveBonusByAbility.map((b) => [b.appliesToSave, b.amount] as const)
    ),
    speedMultiplier: agg.speedMultiplier,
    adv: sorted(agg.advantages.map((a) => [a.rollType, a.vs] as const)),
    dis: sorted(agg.disadvantages.map((a) => [a.rollType, a.vs] as const)),
    incomingAdv: agg.incomingAttackAdvantages.length,
    incomingDis: agg.incomingAttackDisadvantages.length,
    riders: agg.damageRiders.map((r) => ({
      dice: r.dice ?? "",
      types: r.damageTypeChoices ?? [r.damageType],
    })),
    notes: agg.defenseNotes.length,
  };
}

const expected = (facts: LitFacts): Required<LitFacts> => ({
  acBonus: facts.acBonus ?? 0,
  saveBonusByAbility: sorted(facts.saveBonusByAbility ?? []),
  speedMultiplier: facts.speedMultiplier ?? 1,
  adv: sorted(facts.adv ?? []),
  dis: sorted(facts.dis ?? []),
  incomingAdv: facts.incomingAdv ?? 0,
  incomingDis: facts.incomingDis ?? 0,
  riders: facts.riders ?? [],
  notes: facts.notes ?? 0,
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

// ── Cast rows, resolved the way the combat tray reads them ─────────────────

const doc = makeCharacterDoc({
  classes: [{ classId: "wizard", level: 20 }],
  spells: spells.map((spell) => ({ srdId: spell.id })),
});
const catalogue: ResolvedAction[] = resolveActions(doc, "spellbook").map((row) =>
  localizeAction(row, "en")
);
function castOf(id: string): ResolvedAction {
  const found = catalogue.find((a) => a.spellId === id && !a.id.endsWith("-recurring"));
  if (!found) throw new Error(`no cast row for ${id}`);
  return found;
}

describe("spells batch 4: every number is read from the catalogue text", () => {
  it.each(Object.entries(TEXT))("%s", (id, clauses) => {
    expect(getSpellById(id)?.source).toBe("SRD");
    const description = EN[id]?.description ?? "";
    for (const clause of clauses) expect(description).toContain(clause);
  });
});

describe("spells batch 4: the lit state carries the effect", () => {
  it.each(STATE_ROWS)("$id: a $recipient state for the spell's own duration", (row) => {
    const spell = getSpellById(row.id);
    expect(spell?.concentration).toBe(row.concentration);
    expect(spell?.targeting).toEqual(row.targeting);
    const wa = whileActive(row.id);
    expect(wa?.activeKey).toBe(keyOf(row.id));
    expect(wa?.recipient ?? "caster").toBe(row.recipient);
    expect(wa?.duration).toMatchObject({ kind: "timed", minutes: row.minutes });
  });

  it.each(STATE_ROWS)("$id: casting lights the status for its rounds", (row) => {
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
  });

  it.each(STATE_ROWS)("$id: lit, it expires exactly when its time has passed", (row) => {
    const lighted = caster(row.id, [keyOf(row.id)]);
    const rounds = row.minutes * 10;
    const early = advanceEffectTimers(lighted, undefined, rounds - 1);
    expect(early.expired.map((e) => e.activeKey)).not.toContain(keyOf(row.id));
    const done = advanceEffectTimers(lighted, undefined, rounds);
    expect(done.expired.map((e) => e.activeKey)).toContain(keyOf(row.id));
  });

  it.each(STATE_ROWS)("$id: nothing until lit, then exactly its effect", (row) => {
    expect(factsOf(evaluateGrants(sourcesOf(row.id)))).toEqual(expected({}));
    expect(factsOf(lit(row.id))).toEqual(expected(row.lit));
  });

  it.each(STATE_ROWS)("$id: every label and note reads in English and Italian", (row) => {
    const agg = lit(row.id);
    const texts: LocText[] = [
      ...agg.defenseNotes.map((n) => n.description),
      ...agg.incomingAttackAdvantages.map((n) => n.description),
      ...agg.incomingAttackDisadvantages.map((n) => n.description),
      ...agg.advantages.map((a) => a.description),
      ...agg.disadvantages.map((a) => a.description),
    ];
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

  it("Sanctuary ends on the warded creature's attack roll, spell or damage", () => {
    const warded = caster("sanctuary", [keyOf("sanctuary")]);
    for (const act of ["attack-roll", "cast-spell", "deal-damage"] as const) {
      const ended = endStatesOnAct(warded, act);
      expect(ended?.ended, act).toEqual([keyOf("sanctuary")]);
      expect(ended?.session.activeFeatures ?? []).not.toContain(keyOf("sanctuary"));
    }
  });

  it("Slow halves the walking Speed; with Haste the two cancel out", () => {
    const base = { ...MOCK_CHARACTER.character, speed: "30 ft" };
    const slowed: CharacterDoc = {
      ...caster("slow", [keyOf("slow")]),
      character: { ...base, spells: [{ srdId: "slow", prepared: true }] },
    };
    expect(effectiveWalkingSpeedFt(slowed)).toBe(15);
    const both: CharacterDoc = {
      ...slowed,
      character: {
        ...base,
        spells: [
          { srdId: "slow", prepared: true },
          { srdId: "haste", prepared: true },
        ],
      },
      session: { ...slowed.session, activeFeatures: [keyOf("slow"), keyOf("haste")] },
    };
    expect(effectiveWalkingSpeedFt(both)).toBe(30);
  });

  it("two slowing factors keep the strongest, never below 0", () => {
    const agg = evaluateGrants([
      {
        id: "homebrew",
        grants: [
          { type: "speed-multiplier", factor: 0.5 },
          { type: "speed-multiplier", factor: 0.25 },
        ],
      },
    ]);
    expect(agg.speedMultiplier).toBe(0.25);
  });

  it("Slow does not end on an act: only Sanctuary's text says so", () => {
    expect(endStatesOnAct(caster("slow", [keyOf("slow")]), "attack-roll")).toBeNull();
  });
});

describe("spells batch 4: the cast's own consequence", () => {
  it("Spare the Dying stabilizes one ally at 0 HP", () => {
    const spell = getSpellById("spare-the-dying");
    if (!spell) throw new Error("no spell");
    expect(translateSpell(spell).activity.effects).toEqual([{ kind: "stabilize" }]);
    const spec = combatResolutionSpec(castOf("spare-the-dying"));
    expect(spec.stabilizes).toBe(true);
    expect(spec.targetAffinity).toBe("ally");
    expect(spec.targetCap).toBe(1);
  });

  it.each([
    ["revivify", 1],
    ["raise-dead", 1],
    ["resurrection", "all"],
    ["true-resurrection", "all"],
  ] as const)("%s revives with %s Hit Point(s)", (id, hitPoints) => {
    const spell = getSpellById(id);
    if (!spell) throw new Error("no spell");
    expect(translateSpell(spell).activity.effects).toEqual([
      { kind: "revive", hitPoints },
    ]);
    const spec = combatResolutionSpec(castOf(id));
    expect(spec.revives).toEqual({ hitPoints });
    expect(spec.targetAffinity).toBe("ally");
    expect(spec.targetCap).toBe(1);
    // A 40-HP creature comes back with 1 HP, or with all 40.
    expect(revivalHitPoints({ hitPoints }, 40)).toBe(hitPoints === "all" ? 40 : 1);
  });

  it("a revive never exceeds the creature's maximum", () => {
    expect(revivalHitPoints({ hitPoints: 5 }, 3)).toBe(3);
  });

  it("Power Word Kill: 100 HP or fewer dies, more takes 12d12 Psychic", () => {
    const spell = getSpellById("power-word-kill");
    if (!spell) throw new Error("no spell");
    const effects = translateSpell(spell).activity.effects;
    expect(effects).toContainEqual({ kind: "hp-threshold", max: 100, atOrBelow: "dies" });
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: "damage",
        dice: { dice: "12d12" },
        types: ["psychic"],
      })
    );
    const spec = combatResolutionSpec(castOf("power-word-kill"));
    expect(spec.hitPointThreshold).toEqual({ max: 100, atOrBelow: "dies" });
    expect(spec.hasDamage).toBe(true);
    const threshold = { max: 100, atOrBelow: "dies" } as const;
    expect(hitPointThresholdOutcome(threshold, 100)).toBe("dies");
    expect(hitPointThresholdOutcome(threshold, 1)).toBe("dies");
    expect(hitPointThresholdOutcome(threshold, 101)).toBe("otherwise");
  });

  it("Power Word Stun: 150 HP or fewer is Stunned, more has Speed 0", () => {
    const spell = getSpellById("power-word-stun");
    if (!spell) throw new Error("no spell");
    expect(translateSpell(spell).activity.effects).toContainEqual({
      kind: "hp-threshold",
      max: 150,
      atOrBelow: "condition",
      otherwise: "speed-zero",
    });
    const spec = combatResolutionSpec(castOf("power-word-stun"));
    expect(spec.hitPointThreshold).toEqual({
      max: 150,
      atOrBelow: "condition",
      otherwise: "speed-zero",
    });
    expect(spec.conditionApplication?.options).toEqual(["stunned"]);
    const threshold = { max: 150, atOrBelow: "condition" } as const;
    expect(hitPointThresholdOutcome(threshold, 150)).toBe("condition");
    expect(hitPointThresholdOutcome(threshold, 151)).toBe("otherwise");
  });

  it("Banishment: a failed CHA save leaves the target Incapacitated while it lasts", () => {
    const spec = combatResolutionSpec(castOf("banishment"));
    expect(spec.kind).toBe("save");
    expect(spec.conditionApplication).toEqual({
      options: ["incapacitated"],
      on: "failed-save",
      lifetime: { kind: "source" },
    });
  });

  it("Otto's Irresistible Dance: a failed WIS save leaves the target Charmed", () => {
    const spec = combatResolutionSpec(castOf("ottos-irresistible-dance"));
    expect(spec.conditionApplication).toEqual({
      options: ["charmed"],
      on: "failed-save",
      lifetime: { kind: "source" },
    });
  });

  it("Conjure Fey: a 3d12 + mod Psychic melee spell attack, Frightened on a hit", () => {
    const spell = getSpellById("conjure-fey");
    if (!spell) throw new Error("no spell");
    const activity = translateSpell(spell).activity;
    expect(activity.attack?.mode).toBe("melee");
    expect(activity.effects).toContainEqual(
      expect.objectContaining({
        kind: "damage",
        types: ["psychic"],
        dice: { dice: "3d12", perUpcast: "1d12", plus: [{ kind: "spell-mod" }] },
      })
    );
    expect(activity.recurrence).toBe("bonus-action-retrigger");
    const spec = combatResolutionSpec(castOf("conjure-fey"));
    expect(spec.kind).toBe("attack");
    expect(spec.conditionApplication).toEqual({
      options: ["frightened"],
      on: "hit",
      lifetime: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
    });
  });
});

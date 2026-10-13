/**
 * Alter Self as a standing state (SRD 5.2.1): while you concentrate on it you keep
 * ONE of its options, and the option's effect changes the sheet:
 *  - Aquatic Adaptation: you breathe underwater and gain a Swim Speed;
 *  - Change Appearance: your looks change (nothing on the sheet moves);
 *  - Natural Weapons: claws, fangs or similar dealing 1d6 + your spellcasting
 *    modifier, which your Unarmed Strike now uses.
 * The option list is read from the spell's own text.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import spellsEn from "@/i18n/en/srd/spells.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { concentrationValue } from "@/lib/concentration";
import { resolveActions } from "@/lib/smart-tracker";
import { deriveSensesAndSpeeds } from "@/lib/views/sheet-view";
import type { Grant } from "@/lib/grants";
import type { AbilityCode } from "@/data/types";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const KEY = "spell-alter-self";
const TEXT = (spellsEn as Record<string, { description?: string }>)["alter-self"]
  ?.description;

/** The option names the text lists: "Aquatic Adaptation (…), Change Appearance (…)…". */
function optionsFromText(): string[] {
  const list = /choose one of the following options: (.*)$/.exec(TEXT ?? "")?.[1] ?? "";
  return [...list.matchAll(/([A-Z][a-z]+ [A-Z][a-z]+) \(/g)].map((m) =>
    (m[1] ?? "").toLowerCase().replace(/ /g, "-")
  );
}

function bundle() {
  const wa = getSpellById("alter-self")?.grants?.find(
    (g): g is Extract<Grant, { type: "while-active" }> => g.type === "while-active"
  );
  const inner = wa?.grants.find(
    (g): g is Extract<Grant, { type: "choice-grant-bundle" }> =>
      g.type === "choice-grant-bundle"
  );
  return { wa, inner };
}

function caster(
  classId: "wizard" | "sorcerer",
  scores: Record<AbilityCode, number>,
  option?: string,
  lit = true
): CharacterDoc {
  return makeCharacterDoc(
    {
      classId,
      level: 5,
      abilityScores: scores,
      spells: [{ srdId: "alter-self", prepared: true }],
      spellcasting: {
        ability: classId === "wizard" ? "INT" : "CHA",
        preparedCaster: true,
        preparedMax: 6,
        saveDCOverride: null,
        attackBonusOverride: null,
      },
    },
    {
      concentration: lit ? concentrationValue("alter-self") : "",
      activeFeatures: lit ? [KEY] : [],
      ...(option ? { grantBundleChoices: { [KEY]: option } } : {}),
    }
  );
}

const WIZARD = { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 };
const SORCERER = { STR: 8, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 18 };

function sheet(doc: CharacterDoc) {
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  const unarmed = resolveActions(doc).find((a) => a.id === "unarmed-strike");
  return { aggregate, unarmed, ...deriveSensesAndSpeeds(aggregate, 30) };
}

describe("Alter Self declares its three options as a Concentration state", () => {
  it("one option per name in the text, behind spell-alter-self", () => {
    const { wa, inner } = bundle();
    expect(getSpellById("alter-self")?.concentration).toBe(true);
    expect(wa?.activeKey).toBe(KEY);
    expect(wa?.duration).toMatchObject({ kind: "timed", minutes: 60 });
    expect(inner?.bundleKey).toBe(KEY);
    expect(optionsFromText()).toEqual([
      "aquatic-adaptation",
      "change-appearance",
      "natural-weapons",
    ]);
    expect(inner?.options.map((o) => o.id)).toEqual(optionsFromText());
  });
});

describe("each option on the sheet", () => {
  it("not lit: no swim speed, no water breathing, the plain Unarmed Strike", () => {
    const off = sheet(caster("wizard", WIZARD, "natural-weapons", false));
    expect(off.speeds.some((s) => s.kind === "swim")).toBe(false);
    expect(off.airAndWaterBreathing).toBe(false);
    expect(off.unarmed?.summary.damageType).toBe("bludgeoning");
  });

  it("Aquatic Adaptation: breathes underwater, swims at its walking speed", () => {
    const on = sheet(caster("wizard", WIZARD, "aquatic-adaptation"));
    expect(on.airAndWaterBreathing).toBe(true);
    expect(on.speeds).toContainEqual({ kind: "swim", rangeFt: 30 });
  });

  it("Change Appearance: nothing on the sheet moves", () => {
    const plain = sheet(caster("wizard", WIZARD, undefined, false));
    const on = sheet(caster("wizard", WIZARD, "change-appearance"));
    expect(on.speeds).toEqual(plain.speeds);
    expect(on.airAndWaterBreathing).toBe(false);
    expect(on.unarmed?.summary).toEqual(plain.unarmed?.summary);
  });

  it("Natural Weapons: 1d6 + the spellcasting modifier, Slashing, Piercing or Bludgeoning", () => {
    // Wizard: INT 18 (+4), PB +3.
    const wizard = sheet(caster("wizard", WIZARD, "natural-weapons"));
    expect(wizard.unarmed?.summary.damage).toBe("1d6+4");
    expect(wizard.unarmed?.summary.attackBonus).toBe(7);
    expect(wizard.unarmed?.summary.damageTypes).toEqual([
      "slashing",
      "piercing",
      "bludgeoning",
    ]);
    // Sorcerer: the same spell rides CHA 18 (+4), never INT 10.
    const sorcerer = sheet(caster("sorcerer", SORCERER, "natural-weapons"));
    expect(sorcerer.unarmed?.summary.damage).toBe("1d6+4");
    expect(sorcerer.unarmed?.summary.attackBonus).toBe(7);
  });

  it("no option chosen yet: the state is lit but changes nothing", () => {
    const on = sheet(caster("wizard", WIZARD));
    expect(
      on.aggregate.grantBundles.find((b) => b.bundleKey === KEY)?.selected
    ).toBeNull();
    expect(on.airAndWaterBreathing).toBe(false);
  });
});

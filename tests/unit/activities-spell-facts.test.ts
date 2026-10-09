/**
 * The spell card and the Compendium's spell facts read `Activity` instead of
 * the flat spell fields: same output for every catalogue spell.
 *
 * The oracle is the presenters as they were before the move
 * (`__helpers__/legacy-spell-card-helpers.ts`, and the legacy Compendium meta
 * below). The `t` used here spells out every key and argument, so equal text
 * means the same catalogue keys with the same values in every locale.
 *
 * What it does not see: custom (homebrew) spells, which have no Activity and
 * keep their own path (covered by the existing spell-card tests).
 */
import { describe, expect, it } from "vitest";
import type { TFunction } from "i18next";

import { spells } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import * as current from "@/features/character/center/tabs/spells/spell-card-helpers";
import { spellSpec } from "@/features/compendium/picker/specs/spell";
import type { PickerCtx } from "@/features/compendium/picker/types";
import { activityFromSpell } from "@/lib/activities";
import { castingTimeI18nKey } from "@/lib/utils";
import type { SpellCardVM } from "@/lib/views/spells-view";
import * as legacy from "./__helpers__/legacy-spell-card-helpers";

/** Every key and argument, verbatim. */
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}${JSON.stringify(options)}` : key) as unknown as TFunction;

function vmFor(data: SrdSpellData, variant: { effectWord: string | null }): SpellCardVM {
  return {
    key: data.id,
    idx: 0,
    kind: "srd",
    data,
    activity: activityFromSpell(data),
    ref: { srdId: data.id },
    name: data.id,
    searchEn: data.id,
    description: "",
    higherLevels: null,
    facts: { range: "60 feet", duration: "1 minute", material: null },
    level: data.level,
    isCantrip: data.level === 0,
    concentration: data.concentration,
    ritual: data.ritual,
    concentratingNow: false,
    isPrepared: true,
    isAlwaysPrepared: false,
    prepLocked: false,
    showPrep: true,
    dimmed: false,
    canRitual: false,
    effectWord: variant.effectWord,
    overrideAbility: null,
    attackBonus: 5,
    saveDC: 13,
    wizardMastery: false,
    wizardSignature: false,
  };
}

function cardFacts(helpers: typeof current, vm: SpellCardVM) {
  return {
    slot: helpers.spellCardSlot(vm),
    outcome: helpers.spellVerdictOutcome(vm),
    verdict: helpers.buildVerdict(vm, t),
    gloss: helpers.buildGloss(vm, t),
    facts: helpers.buildFacts(vm, t),
    material: helpers.buildMaterialCostTag(vm, t),
  };
}

/** The Compendium's spell detail meta, as it read the flat fields before. */
function legacyDetailMeta(spell: SrdSpellData) {
  const meta: Array<{ label: string; value: string; term?: string }> = [
    {
      label: t("spells.castingTime"),
      value: t(`srd.castingTime_${castingTimeI18nKey(spell.castingTime)}`),
    },
    { label: t("spells.range"), value: "range" },
    { label: t("spells.duration"), value: "duration" },
    {
      label: t("spells.components"),
      value: [
        spell.components.v ? "V" : "",
        spell.components.s ? "S" : "",
        spell.components.m ? "M" : "",
      ]
        .filter(Boolean)
        .join(", "),
      term: "components",
    },
  ];
  if (spell.concentration)
    meta.push({
      label: t("spells.concentration"),
      value: t("common.yes"),
      term: "concentration",
    });
  if (spell.ritual)
    meta.push({ label: t("spells.ritual"), value: t("common.yes"), term: "ritual" });
  if (spell.damageType)
    meta.push({
      label: t("spells.damageType"),
      value: t(`srd.damage_${spell.damageType.toLowerCase()}`),
    });
  if (spell.saveAbility)
    meta.push({
      label: t("spells.saveType"),
      value: t(`abilities.${spell.saveAbility}_short`),
      term: "savingThrow",
    });
  return meta;
}

const ctx: PickerCtx = { t, locale: "en", character: null, mode: "browse" };

describe("spell facts read Activity — same output as the flat fields", () => {
  it("covers the catalogue", () => {
    expect(spells.length).toBeGreaterThan(300);
  });

  it("keeps every spell card's slot, verdict, gloss, facts and material chip", () => {
    for (const spell of spells) {
      for (const effectWord of [null, "Charmed"]) {
        const vm = vmFor(spell, { effectWord });
        expect(cardFacts(current, vm), spell.id).toEqual(cardFacts(legacy, vm));
      }
    }
  });

  it("keeps every Compendium spell's detail facts and row line", () => {
    for (const spell of spells) {
      const detail = spellSpec.detail(spell, ctx, { added: true });
      const meta = (detail.meta ?? []).map(({ label, value, term }) => ({
        label,
        // Range and duration are catalogue prose, not mechanics: unchanged.
        value:
          label === "spells.range"
            ? "range"
            : label === "spells.duration"
              ? "duration"
              : value,
        ...(term ? { term } : {}),
      }));
      expect(meta, spell.id).toEqual(legacyDetailMeta(spell));
      const row = spellSpec.row(spell, ctx);
      const line = JSON.stringify(row.meta);
      expect(line, spell.id).toContain(
        `srd.castingTime_${castingTimeI18nKey(spell.castingTime)}`
      );
      expect(line.includes("spells.concentrationShort"), spell.id).toBe(
        spell.concentration
      );
    }
  });
});

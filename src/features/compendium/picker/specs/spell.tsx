/**
 * Spell compendium spec — drives the Spells "Add" modal (add mode) and the
 * Compendium page's Spells facet (browse). Replicates `SpellAddModal` at parity:
 * the level + class facets (the class facet defaults to the character's casting
 * list, with the L10 third-caster school restriction), the cross-class soft
 * warning, the chromatic level-seal row, and the exact `{ srdId }` commit.
 */

import { AlertTriangle, Sparkles } from "lucide-react";
import { spells } from "@/data/spells";
import { primaryClassId, primarySubclassId } from "@/lib/classes";
import { getSubclassSpellcasting } from "@/lib/subclass-spellcasting";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { castingTimeI18nKey, cn } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { Icon } from "@/components/ui/icon";
import { InfoCard } from "@/components/shared/InfoCard";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { FilterChip } from "@/components/sheet/picker-parts";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";
import { ALL_SPELL_SCHOOLS } from "@/data/types";
import type { SrdSpellData, SpellSchool } from "@/data/types";
import type { SrdSpellRef } from "@/types/character";
import {
  defineFilter,
  type CompendiumPickerSpec,
  type PickerCtx,
  type PickerDetailView,
} from "../types";
import { CASTER_CLASSES, classLabel, descriptionSearch, nameCorpus } from "./shared";

/** Resolve a localized SRD string for a spell field (top-level catalogue key). */
const spellText = (s: SrdSpellData, field: string, locale: Locale) =>
  localizeSrd("spell", s.id, field, locale);

/** The subclass spellcasting descriptor for the active character (or undefined). */
function subSpellFor(ctx: PickerCtx) {
  if (!ctx.character) return undefined;
  const charClass = primaryClassId(ctx.character.character);
  return getSubclassSpellcasting(charClass, primarySubclassId(ctx.character.character));
}

/** The class whose spell list the character actually casts from ("" if none). */
function spellListClass(ctx: PickerCtx): string {
  if (!ctx.character) return "";
  const charClass = primaryClassId(ctx.character.character);
  return subSpellFor(ctx)?.spellList ?? charClass;
}

/** Resolve the active class filter: explicit value, else the casting list. */
function effectiveClass(value: string | null, ctx: PickerCtx): string | null {
  return value ?? (spellListClass(ctx) || null);
}

function isCrossClass(spell: SrdSpellData, ctx: PickerCtx): boolean {
  const listClass = spellListClass(ctx);
  return listClass !== "" && !spell.classes.includes(listClass);
}

export const spellSpec: CompendiumPickerSpec<SrdSpellData> = {
  id: "spell",
  label: (t) => t("nav.spells"),
  icon: Sparkles,
  // The codex verdict chip — the spell's school in its OWN enamel hue
  // (`--school-*`, COMPENDIUM-LUX), so 421 spells scan by school colour while
  // the seal keeps the chromatic LEVEL rainbow — one hue vocabulary per fact.
  verdict: (spell, { t }) => ({
    label: t(`srd.school_${spell.school}`),
    tone: `var(--school-${spell.school})`,
  }),
  data: spells,
  getId: (s) => s.id,
  getName: (s, { locale }) => spellText(s, "name", locale),
  nameText: (s, { locale }) => nameCorpus("spell", s.id, spellText(s, "name", locale)),
  searchText: (s, ctx) => [
    ...spellSpec.nameText(s, ctx),
    // Item f — search by what the spell DOES (active locale + EN), both resident.
    ...descriptionSearch("spell", s.id, ctx.locale),
  ],
  searchPlaceholder: (t) => t("spells.searchPlaceholder"),

  filters: [
    defineFilter<SrdSpellData, number | null>({
      id: "level",
      // The codex index rubric reads "LEVEL · CLASS · SCHOOL" — short nouns, not
      // sentences (the long "Filter by spell level" stays with the cockpit list).
      label: (t) => t("common.level"),
      initial: null,
      // Numeral seal chips (C · 1–9), the same vocabulary the rows' level seals
      // teach — the feature spec set the precedent. The reset chip reads short
      // on the compendium's labelled ledger ("All" under LEVEL), long on the
      // cockpit's unlabelled strip ("All levels").
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        return (
          <>
            <FilterChip
              label={ctx.mode === "browse" ? t("common.all") : t("spells.allLevels")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            <FilterChip
              label="C"
              ariaLabel={t("spells.cantrip")}
              active={value === 0}
              onClick={() => setValue(0)}
              small
            />
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
              <FilterChip
                key={lvl}
                label={`${lvl}`}
                ariaLabel={t("spells.level", { level: lvl })}
                active={value === lvl}
                onClick={() => setValue(lvl)}
                small
              />
            ))}
          </>
        );
      },
      predicate: (s, value) => value == null || s.level === value,
    }),

    defineFilter<SrdSpellData, string | null>({
      id: "class",
      // A noun rubric — the "All classes" CHIP already names the reset, so the
      // group label naming it too read as a stutter ("ALL CLASSES · All Classes").
      label: (t) => t("character.class"),
      // null = default to the casting list; "" = explicitly All Classes.
      initial: null,
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        const charClass = ctx.character ? primaryClassId(ctx.character.character) : "";
        const eff = effectiveClass(value, ctx);
        return (
          <>
            <FilterChip
              label={ctx.mode === "browse" ? t("common.allF") : t("spells.allClasses")}
              // Highlight "All Classes" off the same effective-class source the
              // predicate uses (`!eff` = no class filter), so it lights by default
              // in browse mode (eff===null) AND on explicit click (value===""),
              // instead of staying blank when the default value is null (#18).
              active={!eff}
              onClick={() => setValue("")}
            />
            {charClass && (
              <FilterChip
                label={classLabel(charClass, t)}
                active={eff === charClass}
                onClick={() => setValue(eff === charClass ? "" : charClass)}
              />
            )}
            {CASTER_CLASSES.filter((c) => c !== charClass).map((cls) => (
              <FilterChip
                key={cls}
                label={classLabel(cls, t)}
                active={eff === cls}
                onClick={() => setValue(eff === cls ? "" : cls)}
              />
            ))}
          </>
        );
      },
      predicate: (s, value, ctx) => {
        // L10 — third-caster subclasses restrict by school (cantrips exempt).
        const sub = subSpellFor(ctx);
        if (sub?.schools && sub.schools.length > 0) {
          if (s.level !== 0 && !sub.schools.includes(s.school.toLowerCase()))
            return false;
        }
        const eff = effectiveClass(value, ctx);
        return !eff || s.classes.includes(eff);
      },
    }),

    // §2.5 discovery — the school facet, so "every Necromancy spell" is one tap
    // (the verdict chip already speaks school; now it filters too).
    defineFilter<SrdSpellData, SpellSchool | null>({
      id: "school",
      label: (t) => t("spells.school"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.allF")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {ALL_SPELL_SCHOOLS.map((school) => (
            <FilterChip
              key={school}
              label={t(`srd.school_${school}`)}
              active={value === school}
              onClick={() => setValue(value === school ? null : school)}
            />
          ))}
        </>
      ),
      predicate: (s, value) => value == null || s.school === value,
    }),

    // §2.5 discovery — "Which spells require concentration?" is a constitutional
    // example question; Concentration and Ritual are independent TOGGLES (each
    // narrows to spells carrying the mark) that compose with level/class/school.
    defineFilter<SrdSpellData, { conc: boolean; ritual: boolean }>({
      id: "cast",
      // The ledger rubric for the two independent toggles (Concentration ·
      // Ritual) — an unlabelled row read as an orphan on the codex ledger.
      label: (t) => t("spells.properties"),
      initial: { conc: false, ritual: false },
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("spells.concentration")}
            active={value.conc}
            onClick={() => setValue({ ...value, conc: !value.conc })}
          />
          <FilterChip
            label={t("spells.ritual")}
            active={value.ritual}
            onClick={() => setValue({ ...value, ritual: !value.ritual })}
          />
        </>
      ),
      predicate: (s, value) =>
        (!value.conc || s.concentration) && (!value.ritual || s.ritual),
    }),
  ],

  // The "already known" set must read the EFFECTIVE spell list (stored + the
  // always-prepared spells inferred from grants — a Tiefling's Fire Bolt, a
  // subclass's domain spells), not the raw `spells[]`, so a granted spell is
  // shown as owned in the compendium and can't be re-added as a duplicate
  // (single seam: `resolveEffectiveSpells`, same as the Spells tab + combat).
  existingIds: (character) =>
    new Set(
      resolveEffectiveSpells(character.character, character.session)
        .filter((s): s is SrdSpellRef => !("custom" in s))
        .map((s) => s.srdId)
    ),

  row: (spell, ctx) => {
    const { t, locale } = ctx;
    return {
      leading: (
        <span
          className="lvl-seal"
          style={{
            ["--sl" as string]:
              spell.level <= 0 ? "var(--sl-c)" : `var(--sl-${spell.level})`,
            ["--sl-ink" as string]:
              spell.level <= 0 ? "var(--sl-c-ink)" : `var(--sl-${spell.level}-ink)`,
          }}
          aria-hidden
        >
          {spell.level === 0 ? "C" : spell.level}
        </span>
      ),
      name: spellText(spell, "name", locale),
      // The school now reads as the colour-coded verdict chip on the right, so the
      // gloss line carries the level + casting time + concentration (no dup school).
      meta: (
        <>
          {spell.level === 0
            ? t("spells.cantrip")
            : t("spells.levelShort", { level: spell.level })}{" "}
          · {t(`srd.castingTime_${castingTimeI18nKey(spell.castingTime)}`)}
          {spell.concentration && ` · ${t("spells.concentrationShort")}`}
        </>
      ),
      trailing: isCrossClass(spell, ctx) ? (
        <Icon as={AlertTriangle} size="sm" className="text-warning" decorative />
      ) : undefined,
    };
  },

  detail: (spell, ctx, { added }) => {
    const { t, locale } = ctx;
    const charClass = ctx.character ? primaryClassId(ctx.character.character) : "";
    const schoolName = t(`srd.school_${spell.school}`);
    const crossClass = isCrossClass(spell, ctx);

    const meta: NonNullable<PickerDetailView["meta"]> = [
      {
        label: t("spells.castingTime"),
        value: t(`srd.castingTime_${castingTimeI18nKey(spell.castingTime)}`),
      },
      { label: t("spells.range"), value: spellText(spell, "range", locale) },
      { label: t("spells.duration"), value: spellText(spell, "duration", locale) },
      {
        label: t("spells.components"),
        value: [
          spell.components.v ? "V" : "",
          spell.components.s ? "S" : "",
          spell.components.m ? "M" : "",
        ]
          .filter(Boolean)
          .join(", "),
        // P2 — beginner glosses on the jargon-bearing meta labels (the scaffold
        // wraps each flagged label in the shared GlossaryTip).
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
        // D1 — localize the ability code (DEX→DES in IT); the raw code leaked here
        // while the cockpit already used the *_short keys.
        value: t(`abilities.${spell.saveAbility}_short`),
        term: "savingThrow",
      });

    return {
      eyebrow:
        spell.level === 0
          ? `${schoolName} ${t("spells.cantrip").toLowerCase()}`
          : `${t("spells.level", { level: spell.level })} ${schoolName}`,
      warning:
        crossClass && !added
          ? t("spells.crossClassWarning", {
              classes: spell.classes.map((c) => classLabel(c, t)).join(", "),
              charClass: classLabel(charClass, t),
            })
          : undefined,
      meta,
      description: spellText(spell, "description", locale),
      extras: (
        <>
          {spell.components.m &&
            hasSrd("spell", srdKey(spell.id, "components"), "material", locale) && (
              <InfoCard>
                <span className="text-[length:var(--text-micro)] font-bold uppercase text-text-secondary">
                  {t("spells.material")}
                </span>
                <p className="text-xs text-text-primary">
                  {localizeSrd(
                    "spell",
                    srdKey(spell.id, "components"),
                    "material",
                    locale
                  )}
                </p>
              </InfoCard>
            )}
          {hasSrd("spell", spell.id, "higherLevels", locale) && (
            <InfoCard>
              <span className="text-[length:var(--text-micro)] font-bold uppercase text-accent">
                {t("spells.higherLevels")}
              </span>
              {/* Upcast scaling is rules prose — it wears the colour grammar
                  ("the damage increases by 1d6" scans like the description). */}
              <InlineMarkdown
                text={spellText(spell, "higherLevels", locale)}
                className="mt-1 text-xs leading-relaxed text-text-primary"
                highlight={highlightRulesText(locale)}
              />
            </InfoCard>
          )}
          <div className="mt-4 flex flex-wrap gap-1">
            {spell.classes.map((cls) => (
              <span
                key={cls}
                className={cn(
                  "rounded-sm border px-2 py-0.5 text-[length:var(--text-micro)] font-medium",
                  cls === charClass
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border text-text-secondary"
                )}
              >
                {classLabel(cls, t)}
              </span>
            ))}
          </div>
        </>
      ),
    };
  },

  onAdd: (spell, { character }) => {
    if (!character) return;
    const newRef: SrdSpellRef = { srdId: spell.id };
    useCharacterStore.getState().setCharacter({
      ...character,
      character: {
        ...character.character,
        spells: [...character.character.spells, newRef],
      },
    });
  },
};

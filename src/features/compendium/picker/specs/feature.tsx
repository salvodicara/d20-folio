/**
 * Class-feature compendium spec — drives the Features "Add" modal (add mode) and
 * the Compendium page's Features facet (browse). Replicates `FeatureAddModal` at
 * parity: the class facet (defaults to the character's class) + a level facet
 * scoped to that class's available levels, the above-level soft warning, the
 * mechanics detail block, and the exact `{ srdId }` commit.
 */

import { Sparkles, ScrollText } from "lucide-react";
import { classFeatures } from "@/data/classes";
import { primaryClassId, totalLevel } from "@/lib/classes";
import { useCharacterStore } from "@/stores/characterStore";
import { Icon } from "@/components/ui/icon";
import { InfoCard } from "@/components/shared/InfoCard";
import { FilterChip } from "@/components/sheet/picker-parts";
import { localizeSrd } from "@/i18n/resolver";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { srdKey } from "@/i18n/srd-key";
import type { Locale } from "@/lib/locale";
import type { SrdClassFeatureData } from "@/data/types";
import type { SrdFeatureRef } from "@/types/character";
import { localizeSubclassName } from "@/lib/views/srd-i18n";
import { localizeTrackerRecovery, localizeTrackerTotal } from "@/lib/views/tracker-view";
import { defineFilter, type CompendiumPickerSpec, type PickerCtx } from "../types";

/** Resolve a localized SRD string for a class-feature field (top-level key). */
const featureText = (f: SrdClassFeatureData, field: string, locale: Locale) =>
  localizeSrd("class-feature", f.id, field, locale);
import { ALL_CLASSES, classLabel, descriptionSearch } from "./shared";
import { CmpSeal } from "../CmpSeal";

function charClassOf(ctx: PickerCtx): string {
  return ctx.character ? primaryClassId(ctx.character.character) : "";
}

function effectiveClass(value: string | null, ctx: PickerCtx): string | null {
  return value ?? (charClassOf(ctx) || null);
}

function charLevelOf(ctx: PickerCtx): number {
  return ctx.character ? totalLevel(ctx.character.character) : 20;
}

export const featureSpec: CompendiumPickerSpec<SrdClassFeatureData> = {
  id: "feature",
  label: (t) => t("nav.features"),
  icon: ScrollText,
  // The codex verdict — the source class (the at-a-glance classifier on a feature
  // leaf), in the gold "feature" voice the cockpit seal uses.
  verdict: (feature, { t }) => ({
    label: classLabel(feature.class, t),
    tone: "var(--accent-primary)",
  }),
  data: classFeatures,
  getId: (f) => f.id,
  getName: (f, { locale }) => featureText(f, "name", locale),
  // Bilingual feature-name search via the ACTIVE locale + EN (both always loaded:
  // EN is the static facts seed, the active locale is loaded by the i18n bootstrap).
  // The NON-active locale's SRD shard is lazy-loaded per locale (SLICE 8) and may
  // not be resident, so resolving it here would throw. (Subclass names come from the
  // static srd-names BiText map — not a lazy shard — so both locales are safe there.)
  searchText: (f, { locale }) => [
    localizeSrd("class-feature", f.id, "name", locale),
    localizeSrd("class-feature", f.id, "name", "en"),
    f.id,
    // …so a feature is findable by its (localized) subclass too, not just the slug.
    f.subclass ? localizeSubclassName(f.subclass, "en") : undefined,
    f.subclass ? localizeSubclassName(f.subclass, "it") : undefined,
    // Item f — search by what the feature DOES (active locale + EN), both resident.
    ...descriptionSearch("class-feature", f.id, locale),
  ],

  filters: [
    defineFilter<SrdClassFeatureData, string | null>({
      id: "class",
      // A noun rubric — the "All classes" CHIP names the reset; the group label
      // repeating it read as a stutter on the codex facet bar.
      label: (t) => t("character.class"),
      initial: null,
      render: (value, setValue, ctx) => {
        const { t } = ctx;
        const eff = effectiveClass(value, ctx);
        return (
          <>
            <FilterChip
              label={ctx.mode === "browse" ? t("common.allF") : t("spells.allClasses")}
              active={!eff}
              onClick={() => setValue("")}
            />
            {ALL_CLASSES.map((cls) => (
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
      predicate: (f, value, ctx) => {
        const eff = effectiveClass(value, ctx);
        return !eff || f.class === eff;
      },
    }),

    defineFilter<SrdClassFeatureData, number | null>({
      id: "level",
      label: (t) => t("common.level"),
      initial: null,
      render: (value, setValue, ctx, all) => {
        const { t } = ctx;
        // Scope the level chips to the levels present in the chosen class.
        const eff = effectiveClass((all.class as string | null) ?? null, ctx);
        const levels = [
          ...new Set(
            classFeatures.filter((f) => !eff || f.class === eff).map((f) => f.level)
          ),
        ].sort((a, b) => a - b);
        return (
          <>
            <FilterChip
              label={t("common.all")}
              active={value === null}
              onClick={() => setValue(null)}
            />
            {levels.map((lvl) => (
              <FilterChip
                key={lvl}
                label={`${lvl}`}
                active={value === lvl}
                onClick={() => setValue(value === lvl ? null : lvl)}
                small
              />
            ))}
          </>
        );
      },
      predicate: (f, value) => value == null || f.level === value,
    }),
  ],

  existingIds: (character) =>
    new Set(
      character.character.features
        .filter((f): f is SrdFeatureRef => !("custom" in f))
        .map((f) => f.srdId)
    ),

  row: (feature, ctx) => {
    const { t, locale } = ctx;
    const aboveLevel = feature.level > charLevelOf(ctx);
    return {
      leading: (
        <CmpSeal
          icon={ScrollText}
          tone="var(--accent-primary)"
          toneInk="var(--accent-text)"
        />
      ),
      name: featureText(feature, "name", locale),
      // The class now reads as the verdict chip; the gloss carries the subclass +
      // level + tracker mark (the source class is no longer duplicated here).
      meta: (
        <>
          {feature.subclass ? `${localizeSubclassName(feature.subclass, locale)} · ` : ""}
          {t("stats.lvl")} {feature.level}
          {feature.mechanics?.tracker && ` · ${t("combat.hasTracker")}`}
        </>
      ),
      state: aboveLevel ? "warn" : "default",
      trailing: aboveLevel ? (
        <span className="pick-trail" data-tone="warn">
          {t("stats.lvl")} {feature.level}
        </span>
      ) : undefined,
    };
  },

  detail: (feature, ctx) => {
    const { t, locale } = ctx;
    const aboveLevel = feature.level > charLevelOf(ctx);
    const tracker = feature.mechanics?.tracker;
    // The recovery TOKEN localizes through the one shared presenter (it printed
    // the raw "Long-Rest" in both locales); null = honest blank (per-turn).
    const recovery = tracker ? localizeTrackerRecovery(tracker.recovery, t) : null;
    return {
      eyebrow: (
        <span className="inline-flex items-center gap-2">
          <Icon as={Sparkles} size="sm" className="text-accent" decorative />
          {classLabel(feature.class, t)}
          {feature.subclass && ` · ${localizeSubclassName(feature.subclass, locale)}`}
          {` · ${t("common.level")} ${feature.level}`}
        </span>
      ),
      warning: aboveLevel
        ? t("combat.aboveLevelWarning", { level: feature.level })
        : undefined,
      description: featureText(feature, "description", locale),
      extras: feature.mechanics ? (
        <InfoCard>
          <div className="mb-2 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
            {t("combat.mechanics")}
          </div>
          {tracker && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              {[
                {
                  label: t("custom.totalUses"),
                  // Browse has no character to resolve the formula against, so a
                  // scaling total renders as localized prose ("5 × Paladin level")
                  // through the ONE shared presenter — never the raw "level*5"
                  // token. A class feature scopes its "level" term to its class.
                  value: localizeTrackerTotal(
                    tracker.total,
                    t,
                    classLabel(feature.class, t)
                  ),
                },
                ...(recovery ? [{ label: t("custom.recovery"), value: recovery }] : []),
                ...(tracker.die ? [{ label: t("custom.die"), value: tracker.die }] : []),
                ...(tracker.isPool
                  ? [{ label: t("custom.pool"), value: t("common.yes") }]
                  : []),
              ].map((field, i) => (
                <div key={i}>
                  <div className="text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
                    {field.label}
                  </div>
                  <div className="text-[0.78rem] font-medium text-text-primary">
                    {field.value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {feature.mechanics.actions && feature.mechanics.actions.length > 0 && (
            <div>
              <div className="mb-1 text-[length:var(--text-micro)] font-bold uppercase text-text-secondary">
                {t("combat.actions")}
              </div>
              {feature.mechanics.actions.map((action, i) => (
                <div key={i} className="mb-1 text-[0.72rem] text-text-primary">
                  <span className="mr-1.5 rounded bg-bg-tertiary px-1.5 py-0.5 text-[length:var(--text-micro)] font-bold uppercase text-text-secondary">
                    {t(`combat.${action.type}`)}
                  </span>
                  {/* An action summary is rules prose — it wears the colour
                      grammar so its conditions/dice agree with the description
                      above (plain string, no markdown pass needed). */}
                  {highlightRulesText(locale)(
                    localizeSrd(
                      "class-feature",
                      srdKey(feature.id, "mechanics", `actions.${i}`),
                      "description",
                      locale
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </InfoCard>
      ) : undefined,
    };
  },

  onAdd: (feature, { character }) => {
    if (!character) return;
    const newRef: SrdFeatureRef = { srdId: feature.id };
    useCharacterStore.getState().setCharacter({
      ...character,
      character: {
        ...character.character,
        features: [...character.character.features, newRef],
      },
    });
  },
};

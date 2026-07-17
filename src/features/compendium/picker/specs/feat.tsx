/**
 * Feat compendium spec — BROWSE-ONLY (the Compendium page's Feats facet). Feats
 * are taken through guided creation / level-up grant flows, not a free-form
 * "add" modal, so this spec omits `existingIds`/`onAdd`: in browse mode the
 * picker simply reads. Facets by category; the mechanics block mirrors features.
 */

import { Award } from "lucide-react";
import { SRD_FEATS } from "@/data/feats";
import { Icon } from "@/components/ui/icon";
import { InfoCard } from "@/components/shared/InfoCard";
import { FilterChip } from "@/components/sheet/picker-parts";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { srdKey } from "@/i18n/srd-key";
import { localizeTrackerRecovery } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";
import type { SrdFeatData, FeatCategory } from "@/data/types";
import { defineFilter, type CompendiumPickerSpec, type TFn } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch } from "./shared";

/** Resolve a localized SRD string for a feat field (top-level catalogue key). */
const featText = (f: SrdFeatData, field: string, locale: Locale) =>
  localizeSrd("feat", f.id, field, locale);

/** The feat categories actually present in the data (chips never go empty). */
const FEAT_CATEGORIES: FeatCategory[] = [...new Set(SRD_FEATS.map((f) => f.category))];

function categoryLabel(cat: FeatCategory, t: TFn): string {
  return t(`feats.category_${cat}`);
}

export const featSpec: CompendiumPickerSpec<SrdFeatData> = {
  id: "feat",
  label: (t) => t("feats.feats"),
  icon: Award,
  // The codex verdict — the feat category, in the amethyst "feat" voice (matching
  // the seal + the existing `.uc-seal kind[data-kind="feat"]` pigment).
  verdict: (feat, { t }) => ({
    label: categoryLabel(feat.category, t),
    tone: "var(--amethyst-300)",
  }),
  data: SRD_FEATS,
  getId: (f) => f.id,
  getName: (f, { locale }) => featText(f, "name", locale),
  // Bilingual search via the ACTIVE locale + EN (both always loaded: EN is the
  // static facts seed, the active locale is loaded by the i18n bootstrap). The
  // NON-active locale's SRD shard is lazy-loaded per locale (SLICE 8) and may not
  // be resident, so resolving it here would throw — match the active locale, not a
  // hardcoded "it".
  searchText: (f, { locale }) => [
    localizeSrd("feat", f.id, "name", locale),
    localizeSrd("feat", f.id, "name", "en"),
    f.id,
    // Item f — search by what the feat DOES (active locale + EN), both resident.
    ...descriptionSearch("feat", f.id, locale),
  ],

  filters: [
    defineFilter<SrdFeatData, FeatCategory | null>({
      id: "category",
      label: (t) => t("feats.category"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.allF")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {FEAT_CATEGORIES.map((cat) => (
            <FilterChip
              key={cat}
              label={categoryLabel(cat, t)}
              active={value === cat}
              onClick={() => setValue(value === cat ? null : cat)}
            />
          ))}
        </>
      ),
      predicate: (f, value) => value == null || f.category === value,
    }),
  ],

  row: (feat, { t, locale }) => ({
    leading: (
      <CmpSeal icon={Award} tone="var(--amethyst-300)" toneInk="var(--amethyst-ink)" />
    ),
    name: featText(feat, "name", locale),
    // The category now reads as the right-aligned verdict chip; the gloss carries
    // the prerequisite (the next-most-useful at-a-glance fact) + repeatable mark.
    meta: (
      <>
        {hasSrd("feat", feat.id, "prerequisite", locale)
          ? featText(feat, "prerequisite", locale)
          : t("feats.noPrereq")}
        {feat.repeatable && ` · ${t("feats.repeatable")}`}
      </>
    ),
  }),

  detail: (feat, { t, locale }) => {
    const meta = hasSrd("feat", feat.id, "prerequisite", locale)
      ? [
          {
            label: t("feats.prerequisite"),
            value: featText(feat, "prerequisite", locale),
          },
        ]
      : undefined;
    const tracker = feat.mechanics?.tracker;
    // The recovery code localizes through the one shared presenter.
    const recovery = tracker ? localizeTrackerRecovery(tracker.recovery, t) : null;
    return {
      eyebrow: (
        <span className="inline-flex items-center gap-2">
          <Icon as={Award} size="sm" className="text-accent" decorative />
          {categoryLabel(feat.category, t)}
          {feat.repeatable && ` · ${t("feats.repeatable")}`}
        </span>
      ),
      meta,
      description: featText(feat, "description", locale),
      extras: feat.mechanics ? (
        <InfoCard>
          <div className="mb-2 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
            {t("combat.mechanics")}
          </div>
          {tracker && (
            <div className="text-[0.72rem] text-text-primary">
              {t("custom.totalUses")}: {tracker.total}
              {recovery && ` · ${t("custom.recovery")}: ${recovery}`}
            </div>
          )}
          {feat.mechanics.actions && feat.mechanics.actions.length > 0 && (
            <div className="mt-1">
              {feat.mechanics.actions.map((action, i) => (
                <div key={i} className="mb-1 text-[0.72rem] text-text-primary">
                  <span className="mr-1.5 rounded bg-bg-tertiary px-1.5 py-0.5 text-[length:var(--text-micro)] font-bold uppercase text-text-secondary">
                    {t(`combat.${action.type}`)}
                  </span>
                  {/* An action summary is rules prose — it wears the colour
                      grammar so its conditions/dice agree with the description
                      above (plain string, no markdown pass needed). */}
                  {highlightRulesText(locale)(
                    localizeSrd(
                      "feat",
                      srdKey(feat.id, "mechanics", `actions.${i}`),
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
};

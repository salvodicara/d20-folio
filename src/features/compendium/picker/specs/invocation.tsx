/**
 * Invocation compendium spec — BROWSE-ONLY (the Compendium's "Invocations"
 * facet). Warlock Eldritch Invocations are learned through the level-up grant
 * flow / the Features-tab re-picker, not a free-form "add" modal, so this spec
 * omits `existingIds`/`onAdd`. It is also the single source of truth for an
 * invocation's detail view, reused by the Features-tab re-picker's "More"
 * affordance. An invocation's prerequisite renders from the id-keyed SRD
 * catalogue (`invocation.<id>.prerequisite`, EN + IT) — the data
 * `prerequisite` string stays the engine FACT the eligibility gate parses.
 */

import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { Icon } from "@/components/ui/icon";
import { InfoCard } from "@/components/shared/InfoCard";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveFamiliarEnhancements } from "@/lib/compute";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { primaryClassId } from "@/lib/classes";
import { localeDistance } from "@/lib/utils";
import type { Locale } from "@/lib/locale";
import type { SrdEldritchInvocation } from "@/data/invocations";
import type { CharacterDoc } from "@/types/character";
import type { TFn } from "../types";
import type { CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch } from "./shared";

/** The invocation id whose familiar buffs we surface (Pact of the Chain). */
const CHAIN_MASTER_ID = "investment-of-the-chain-master";

/** Resolve a localized SRD string for an invocation field. */
const invText = (i: SrdEldritchInvocation, field: string, locale: Locale) =>
  localizeSrd("invocation", i.id, field, locale);

/**
 * LEG 3 — the merged familiar enhancements callout for Investment of the Chain
 * Master, rendered in the detail `extras` slot when the character actually has
 * the invocation (so the owner's spell save DC is real). Pure render of the
 * already-tested `resolveFamiliarEnhancements` view; display-only — the engine
 * never commands the familiar or spends the Reaction (override-first). Returns
 * `null` in browse mode (no character) or when the buff isn't present.
 */
function familiarEnhancementsExtras(
  character: CharacterDoc,
  t: TFn,
  locale: Locale
): ReactNode {
  // The owner's effective spell save DC — reuse the spells-view presenter so the
  // familiar's "Your Save DC" line can't drift from the sheet (golden rule 6).
  const ownerSaveDc =
    buildSpellsViewModel(character, primaryClassId(character.character), locale, false)
      .castSummary?.saveDC ?? 0;
  const view = resolveFamiliarEnhancements(
    aggregateCharacterGrants(character.character, character.session).familiarEnhancements,
    ownerSaveDc
  );
  if (!view.present) return null;

  const rows: { label: string; value: string }[] = [];
  if (view.extraSpeedFt != null && view.extraSpeedModes.length > 0) {
    rows.push({
      label: view.extraSpeedModes.map((m) => t(`familiar.speedMode_${m}`)).join(" / "),
      value: localeDistance(view.extraSpeedFt, locale),
    });
  }
  if (view.bonusActionAttack) {
    rows.push({
      label: t("familiar.bonusActionAttack"),
      value: t("familiar.bonusActionAttackValue"),
    });
  }
  if (view.damageTypeConversion.length > 0) {
    rows.push({
      label: t("familiar.damageConversion"),
      value: view.damageTypeConversion.map((dt) => t(`srd.damage_${dt}`)).join(" / "),
    });
  }
  if (view.saveDc != null) {
    rows.push({ label: t("familiar.saveDc"), value: String(view.saveDc) });
  }
  if (view.reactionResistance) {
    rows.push({
      label: t("familiar.reactionResistance"),
      value: t("familiar.reactionResistanceValue"),
    });
  }

  return (
    <InfoCard>
      <div className="mb-2 text-[length:var(--text-micro)] font-bold uppercase tracking-wider text-text-secondary">
        {t("familiar.section")}
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 text-[0.72rem] text-text-primary"
          >
            <span className="text-text-secondary">{r.label}</span>
            <span className="font-mono">{r.value}</span>
          </div>
        ))}
      </div>
    </InfoCard>
  );
}

export const invocationSpec: CompendiumPickerSpec<SrdEldritchInvocation> = {
  id: "invocation",
  label: (t) => t("invocations.section"),
  icon: Eye,
  // No codex verdict — this is a single-source facet (every entry is a Warlock
  // Invocation), so a "Warlock" badge only echoes the tab; the freed width lets
  // the prerequisite subtitle (the row's key differentiator) wrap on mobile.
  data: SRD_INVOCATIONS,
  getId: (i) => i.id,
  getName: (i, { locale }) => invText(i, "name", locale),
  // Active locale + EN (both always loaded); never the lazy non-active shard.
  searchText: (i, { locale }) => [
    localizeSrd("invocation", i.id, "name", locale),
    localizeSrd("invocation", i.id, "name", "en"),
    i.id,
    // Item f — search by what the invocation DOES (active locale + EN), both resident.
    ...descriptionSearch("invocation", i.id, locale),
  ],
  searchPlaceholder: (t) => t("levelUp.searchInvocations"),

  filters: [],

  row: (i, { t, locale }) => ({
    leading: (
      <CmpSeal icon={Eye} tone="var(--amethyst-300)" toneInk="var(--amethyst-ink)" />
    ),
    name: invText(i, "name", locale),
    meta: hasSrd("invocation", i.id, "prerequisite", locale)
      ? `${t("feats.prerequisite")}: ${invText(i, "prerequisite", locale)}`
      : t("invocations.eyebrow"),
  }),

  detail: (i, { t, locale, character }) => ({
    eyebrow: (
      <span className="inline-flex items-center gap-2">
        <Icon as={Eye} size="sm" className="text-accent" decorative />
        {t("invocations.eyebrow")}
      </span>
    ),
    meta: hasSrd("invocation", i.id, "prerequisite", locale)
      ? [
          {
            label: t("feats.prerequisite"),
            value: invText(i, "prerequisite", locale),
          },
        ]
      : undefined,
    description: invText(i, "description", locale),
    // LEG 3 — the familiar-enhancement callout, ONLY for Investment of the Chain
    // Master AND only in character context (id branch — golden rule 7; the
    // owner-save-DC line needs a real character, so browse mode skips it).
    extras:
      i.id === CHAIN_MASTER_ID && character
        ? (familiarEnhancementsExtras(character, t, locale) ?? undefined)
        : undefined,
  }),
};

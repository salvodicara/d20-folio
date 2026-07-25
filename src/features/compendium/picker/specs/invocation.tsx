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

import { Eye } from "lucide-react";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { Icon } from "@/components/ui/icon";
import { FamiliarEnhancementsCard } from "@/components/shared/FamiliarEnhancementsCard";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { SrdEldritchInvocation } from "@/data/invocations";
import type { CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch, nameCorpus } from "./shared";

/** The invocation id whose familiar buffs we surface (Pact of the Chain). */
const CHAIN_MASTER_ID = "investment-of-the-chain-master";

/** Resolve a localized SRD string for an invocation field. */
const invText = (i: SrdEldritchInvocation, field: string, locale: Locale) =>
  localizeSrd("invocation", i.id, field, locale);

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
  nameText: (i, { locale }) => nameCorpus("invocation", i.id, invText(i, "name", locale)),
  searchText: (i, ctx) => [
    ...invocationSpec.nameText(i, ctx),
    // Item f — search by what the invocation DOES (active locale + EN), both resident.
    ...descriptionSearch("invocation", i.id, ctx.locale),
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
      i.id === CHAIN_MASTER_ID && character ? (
        <FamiliarEnhancementsCard character={character} locale={locale} />
      ) : undefined,
  }),
};

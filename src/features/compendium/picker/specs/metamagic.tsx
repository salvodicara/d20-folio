/**
 * Metamagic compendium spec — BROWSE-ONLY (the Compendium's "Metamagic" facet).
 * Sorcerer metamagic options are learned through the level-up grant flow / the
 * Features-tab re-picker, not a free-form "add" modal, so this spec omits
 * `existingIds`/`onAdd`. It is also the single source of truth for a metamagic
 * option's detail view, reused by the Features-tab re-picker's "More" affordance.
 * No facets — the 10-option list is short; search covers it.
 */

import { Wand2 } from "lucide-react";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { Icon } from "@/components/ui/icon";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { SrdMetamagicOption } from "@/data/metamagic";
import type { CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch } from "./shared";

/** Resolve a localized SRD string for a metamagic field. */
const mmText = (m: SrdMetamagicOption, field: string, locale: Locale) =>
  localizeSrd("metamagic", m.id, field, locale);

export const metamagicSpec: CompendiumPickerSpec<SrdMetamagicOption> = {
  id: "metamagic",
  label: (t) => t("metamagic.section"),
  icon: Wand2,
  // No codex verdict — this is a single-source facet (every entry is a Sorcerer
  // Metamagic option), so a "Sorcerer" badge only echoes the tab; the subtitle
  // already carries the differentiator (the sorcery-point cost).
  data: SRD_METAMAGIC,
  getId: (m) => m.id,
  getName: (m, { locale }) => mmText(m, "name", locale),
  // Active locale + EN (both always loaded); never the lazy non-active shard.
  searchText: (m, { locale }) => [
    localizeSrd("metamagic", m.id, "name", locale),
    localizeSrd("metamagic", m.id, "name", "en"),
    m.id,
    // Item f — search by what the metamagic DOES (active locale + EN), both resident.
    ...descriptionSearch("metamagic", m.id, locale),
  ],
  searchPlaceholder: (t) => t("levelUp.searchMetamagic"),

  filters: [],

  row: (m, { t, locale }) => ({
    leading: (
      <CmpSeal icon={Wand2} tone="var(--amethyst-300)" toneInk="var(--amethyst-ink)" />
    ),
    name: mmText(m, "name", locale),
    meta: t("levelUp.metamagicCost", { cost: m.cost }),
  }),

  detail: (m, { t, locale }) => ({
    eyebrow: (
      <span className="inline-flex items-center gap-2">
        <Icon as={Wand2} size="sm" className="text-accent" decorative />
        {t("metamagic.eyebrow")}
      </span>
    ),
    meta: [
      {
        label: t("metamagic.costLabel"),
        value: t("levelUp.metamagicCost", { cost: m.cost }),
      },
    ],
    description: mmText(m, "description", locale),
  }),
};

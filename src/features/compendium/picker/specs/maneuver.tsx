/**
 * Maneuver compendium spec — BROWSE-ONLY (the Compendium's "Maneuvers" facet).
 * Fighter maneuvers are learned through the level-up grant flow / the
 * Features-tab re-picker, not a free-form "add" modal, so this spec omits
 * `existingIds`/`onAdd`: in browse mode the picker simply reads. It also serves
 * as the single source of truth for a maneuver's detail view, reused by the
 * Features-tab re-picker's "More" affordance. Faceted by action economy.
 */

import { Swords } from "lucide-react";
import { MANEUVER_SLOTS, SRD_MANEUVERS } from "@/data/maneuvers";
import { Icon } from "@/components/ui/icon";
import { FilterChip } from "@/components/sheet/picker-parts";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import type { SrdManeuver } from "@/data/maneuvers";
import { defineFilter, type CompendiumPickerSpec } from "../types";
import { CmpSeal } from "../CmpSeal";
import { descriptionSearch, nameCorpus } from "./shared";

type Slot = SrdManeuver["slot"];
const SLOTS: readonly Slot[] = [...MANEUVER_SLOTS];

/** Resolve a localized SRD string for a maneuver field. */
const mvText = (m: SrdManeuver, field: string, locale: Locale) =>
  localizeSrd("maneuver", m.id, field, locale);

/** The action-type pigment for a maneuver's slot (matches the cockpit `--at-*`). */
function slotTone(slot: Slot): string {
  return `var(--at-${slot})`;
}

export const maneuverSpec: CompendiumPickerSpec<SrdManeuver> = {
  id: "maneuver",
  label: (t) => t("maneuvers.section"),
  icon: Swords,
  // The codex verdict — the maneuver's action economy, in its action-type colour
  // (bonus = lapis, reaction = vermilion, free = muted), the cockpit convention.
  verdict: (m, { t }) => ({
    label: t(`combat.${m.slot}`),
    tone: slotTone(m.slot),
  }),
  data: SRD_MANEUVERS,
  getId: (m) => m.id,
  getName: (m, { locale }) => mvText(m, "name", locale),
  // Active locale + EN (both always loaded); never the lazy non-active shard.
  nameText: (m, { locale }) => nameCorpus("maneuver", m.id, mvText(m, "name", locale)),
  searchText: (m, ctx) => [
    ...maneuverSpec.nameText(m, ctx),
    // Item f — search by what the maneuver DOES (active locale + EN), both resident.
    ...descriptionSearch("maneuver", m.id, ctx.locale),
  ],
  searchPlaceholder: (t) => t("maneuvers.search"),

  filters: [
    defineFilter<SrdManeuver, Slot | null>({
      id: "slot",
      label: (t) => t("combat.action"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.allF")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {SLOTS.map((slot) => (
            <FilterChip
              key={slot}
              label={t(`combat.${slot}`)}
              active={value === slot}
              onClick={() => setValue(value === slot ? null : slot)}
            />
          ))}
        </>
      ),
      predicate: (m, value) => value == null || m.slot === value,
    }),
  ],

  row: (m, { t, locale }) => ({
    leading: <CmpSeal icon={Swords} tone={slotTone(m.slot)} />,
    name: mvText(m, "name", locale),
    // The slot reads as the verdict chip; the subtitle stays UNIFORM (the source —
    // the subclass name) so the rows don't fork, and a maneuver that forces a save
    // folds it in as a second token rather than replacing the source.
    meta: m.save
      ? `${t("maneuvers.eyebrow")} · ${t("maneuvers.saveLabel")}: ${t(`abilities.${m.save}_short`)}`
      : t("maneuvers.eyebrow"),
  }),

  detail: (m, { t, locale }) => ({
    eyebrow: (
      <span className="inline-flex items-center gap-2">
        <Icon as={Swords} size="sm" className="text-accent" decorative />
        {t("maneuvers.eyebrow")} · {t(`combat.${m.slot}`)}
      </span>
    ),
    meta: m.save
      ? [
          {
            label: t("maneuvers.saveLabel"),
            value: t(`abilities.${m.save}`),
          },
        ]
      : undefined,
    description: mvText(m, "description", locale),
  }),
};

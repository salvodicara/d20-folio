/**
 * Monster compendium spec — BROWSE-ONLY (the Compendium page's Monsters facet).
 * Monsters are display + reference data (no `existingIds`/`onAdd`): in browse mode
 * the picker simply reads. Facets by CR band · size · creature type; the detail
 * leaf mounts the shared {@link MonsterStatBlockCard}.
 *
 * PURE spec module — no side effects, no TLA (D-2): the load-before-render gate
 * (`await ensureSrdKind("monster")`) lives at the two runtime consumers of the
 * specs registry — the compendium route factory (`router.tsx`) and the palette's
 * specs `import()` effect (`CommandPalette.tsx`) — so the lazy `monster` catalogue
 * is resident for every read below. `picker/index.ts` re-exports the concrete specs
 * from their own modules (not the barrel), so the cockpit add-modals never evaluate
 * this graph — the bestiary corpus stays lazy.
 */

import { Skull } from "lucide-react";
import { MONSTERS } from "@/data/monsters";
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { srdKey } from "@/i18n/srd-key";
import { cn, formatCr } from "@/lib/utils";
import { MonsterStatBlockCard } from "@/components/shared/MonsterStatBlockCard";
import { monsterIdentity, monsterRowMeta } from "@/components/shared/monster-identity";
import { FilterChip } from "@/components/sheet/picker-parts";
import { ALL_CREATURE_TYPES, CREATURE_SIZE_ORDER } from "@/data/types";
import type {
  CreatureSize,
  CreatureType,
  MonsterEntry,
  MonsterStatBlock,
} from "@/data/types";
import type { Locale } from "@/lib/locale";
import { defineFilter, type CompendiumPickerSpec } from "../types";
import { nameCorpus } from "./shared";

/** The five browse CR bands (inclusive). Labels are locale-invariant numerals. */
const CR_BANDS: ReadonlyArray<{ id: string; range: [number, number]; label: string }> = [
  { id: "0-half", range: [0, 0.5], label: "0–½" },
  { id: "1-4", range: [1, 4], label: "1–4" },
  { id: "5-10", range: [5, 10], label: "5–10" },
  { id: "11-16", range: [11, 16], label: "11–16" },
  { id: "17-up", range: [17, 30], label: "17+" },
];

const SIZES: readonly CreatureSize[] = [...CREATURE_SIZE_ORDER];
const TYPES: readonly CreatureType[] = [...ALL_CREATURE_TYPES];

/** Resolve a monster's localized display name (top-level catalogue key). */
const monName = (m: MonsterStatBlock, locale: Locale) =>
  localizeSrd("monster", m.id, "name", locale);

/**
 * The statblock PROSE search corpus — every entry's name + text, in the active
 * locale + EN, each `hasSrd`-guarded to the resident-locales-only contract (the
 * `descriptionSearch` pattern applied to the nested entry keys). Lets §2.5's
 * "find a monster by what it does" work — searching *frightened* surfaces a
 * fear-aura monster; the SLICE-8 mocked-registry test passes because every read
 * is guarded.
 */
function monsterProse(m: MonsterStatBlock, locale: Locale): string[] {
  const out: string[] = [];
  const sections: Array<[string, ReadonlyArray<MonsterEntry> | undefined]> = [
    ["traits", m.traits],
    ["actions", m.actions],
    ["bonusActions", m.bonusActions],
    ["reactions", m.reactions],
    ["legendaryActions", m.legendaryActions],
  ];
  const locales: Locale[] = locale === "en" ? ["en"] : [locale, "en"];
  for (const [section, entries] of sections) {
    for (const entry of entries ?? []) {
      const key = srdKey(m.id, section, entry.id);
      for (const loc of locales) {
        for (const field of ["name", "text"] as const) {
          if (hasSrd("monster", key, field, loc)) {
            out.push(localizeSrd("monster", key, field, loc));
          }
        }
      }
    }
  }
  return out;
}

export const monsterSpec: CompendiumPickerSpec<MonsterStatBlock> = {
  id: "monster",
  label: (t) => t("compendium.monsters"),
  icon: Skull,
  // The codex verdict — the CR, in the folio gilt (D-8): CR is a power classifier,
  // not a domain vocabulary, so it wears the one quiet accent chip, never a hue set.
  verdict: (m, { t }) => ({
    label: t("polymorph.crShort", { cr: formatCr(m.cr) }),
    tone: "var(--accent-primary)",
  }),
  data: MONSTERS,
  getId: (m) => m.id,
  getName: (m, { locale }) => monName(m, locale),
  // Bilingual NAME corpus (active locale + always-resident EN + id). EN monster is
  // resident post the consumers' `ensureSrdKind("monster")` gate, so `nameCorpus` holds.
  nameText: (m, { locale }) => nameCorpus("monster", m.id, monName(m, locale)),
  searchText: (m, ctx) => [
    ...monsterSpec.nameText(m, ctx),
    // The creature type in both the active locale and EN (find "dragon" as an IT
    // reader too) — closed-set chrome, always resident.
    ctx.t(`srd.creatureType_${m.type}`),
    ...monsterProse(m, ctx.locale),
  ],
  searchPlaceholder: (t) => t("monster.searchPlaceholder"),

  filters: [
    defineFilter<MonsterStatBlock, [number, number] | null>({
      id: "cr-band",
      label: (t) => t("monster.crRubric"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.all")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {CR_BANDS.map((band) => {
            const active =
              value != null && value[0] === band.range[0] && value[1] === band.range[1];
            return (
              <FilterChip
                key={band.id}
                label={band.label}
                active={active}
                onClick={() => setValue(active ? null : band.range)}
              />
            );
          })}
        </>
      ),
      predicate: (m, value) => value == null || (m.cr >= value[0] && m.cr <= value[1]),
    }),
    defineFilter<MonsterStatBlock, CreatureSize | null>({
      id: "size",
      label: (t) => t("monster.size"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.all")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {SIZES.map((size) => (
            <FilterChip
              key={size}
              label={t(`srd.size_${size.toLowerCase()}`)}
              active={value === size}
              onClick={() => setValue(value === size ? null : size)}
            />
          ))}
        </>
      ),
      predicate: (m, value) => value == null || m.sizes.includes(value),
    }),
    defineFilter<MonsterStatBlock, CreatureType | null>({
      id: "type",
      label: (t) => t("compendium.type"),
      initial: null,
      render: (value, setValue, { t }) => (
        <>
          <FilterChip
            label={t("common.all")}
            active={value === null}
            onClick={() => setValue(null)}
          />
          {TYPES.map((type) => (
            <FilterChip
              key={type}
              label={t(`srd.creatureType_${type}`)}
              active={value === type}
              onClick={() => setValue(value === type ? null : type)}
            />
          ))}
        </>
      ),
      predicate: (m, value) => value == null || m.type === value,
    }),
  ],

  row: (m, { t, locale }) => {
    const crText = formatCr(m.cr);
    return {
      // The CR seal — one THEME-INVARIANT gilt gem (the `.cr-seal` modifier pins
      // the `.lvl-seal` hue pair to fixed gilt tokens: a light-gold gem + the
      // near-black `--gilt-ink` numeral, identical in both themes — owner-directed,
      // so the seal never re-resolves to a dark bronze gem in light). Reused larger
      // on the EntryView masthead (`.cmp-entry-seal`); the folio seal contract.
      // Longer strings (fractions) step the digit down so "1/8" stays inside.
      leading: (
        <span
          className={cn("lvl-seal", "cr-seal", crText.length >= 3 && "mon-seal-sm")}
          aria-hidden
        >
          {crText}
        </span>
      ),
      name: monName(m, locale),
      // The CR reads as the right-aligned verdict chip; the gloss carries size · type.
      meta: monsterRowMeta(m, t),
    };
  },

  detail: (m, { t, locale }) => ({
    // The 2024 identity line — size type (tags), alignment. The card carries the
    // full reading order, so the scaffold meta grid is omitted (one home per fact,
    // §4.15 / golden rule 6).
    eyebrow: monsterIdentity(m, t),
    extras: <MonsterStatBlockCard monster={m} locale={locale} />,
  }),
};

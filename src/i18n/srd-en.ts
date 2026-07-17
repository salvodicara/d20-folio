/**
 * `srdEn` — the pure, English-only canonical-SRD-fact accessor (R3 STAGE 2,
 * docs/ARCHITECTURE.md) — AND the process-wide SRD catalogue registry
 * (R6+R3 SLICE 8).
 *
 * ## Why this exists (and why it is NOT a localization seam)
 *
 * The Grant engine still reads a few canonical English SRD FACTS that have no
 * structured field yet: a handful of presence/value GATES (a spell's `range`, a
 * magic item's `description`, an equipment `name` fallback). (Spell duration is now
 * a STRUCTURED `instantaneous` boolean on every spell — the old prose
 * `duration === "Instantaneous"` branch is retired. Spell damage/heal dice are
 * likewise a STRUCTURED `damageDice`/`healDice` fact — S12 retired the old prose
 * `extractDamageDice`/heal regex — so both the spell card and the combat tab read
 * the SAME field. The reaction-trigger reads are ALSO retired: a reaction action AND a
 * reaction spell now declare a STRUCTURED `trigger`/`reactionTrigger: ReactionTrigger`
 * token the presenter localizes — the old `extractTrigger` (action desc) and
 * `extractSpellTrigger` (spell `castingTime`) English-prose parsers are both gone.)
 * The remaining prose reads are **FACTS encoded as English
 * strings** — the canonical SRD wording is the ground truth the engine parses,
 * exactly as a human reads the rulebook. They are *not* display: the engine never
 * shows them; it extracts numbers/booleans from them.
 *
 * After R3 the translatable SRD strings no longer live in `src/data/**` — they
 * live in `src/i18n/<locale>/srd/<file>.json`. The engine therefore needs a
 * framework-free way to read the **canonical English** catalogue (and ONLY the
 * English one) to keep parsing those facts. That is `srdEn`.
 *
 * ## EN is ALWAYS loaded; other locales load lazily (SLICE 8)
 *
 * The EN catalogues are statically imported here, so they are bundled with the
 * engine and ALWAYS available — they are the canonical FACTS source the Grant
 * engine parses in any active locale. Every OTHER locale's catalogues
 * (`it/srd/*.json`, future languages) are lazy-loaded per the active locale and
 * REGISTERED into the shared registry below via {@link registerSrdCatalogues};
 * the display resolver (`localizeSrd`, UI/views-only) reads the registry. This is
 * the documented EN-facts loading rule: an EN user pays only the EN catalogues; an
 * IT user pays EN (facts, load-bearing) + IT (display) and never the other way —
 * no duplication, the facts copy IS the EN display copy. (ARCHITECTURE.md i18n §.)
 *
 * ## The architectural contract (the narrow, shrinking exemption)
 *
 * `srdEn` is **locale-INDEPENDENT** — it always reads `en`, never the active
 * locale. It is "canonical SRD facts as data", not localization: adding a new app
 * language never touches this module and never changes its output. Because of
 * that, the engine importing `srdEn` does NOT violate "engine-core never reads the
 * active locale" (docs/ARCHITECTURE.md) — the engine still never branches
 * on the user's language.
 *
 * It is, deliberately, the ONE module under `src/i18n/` that engine-core may
 * import. The `architecture-direction.guard` whitelists exactly this path (and
 * `srd-key.ts`) under `@/i18n`: the resolver (`localizeSrd`) stays UI/views-only.
 * The exemption is **tracked and shrinking** — every `srdEn` call site is
 * enumerated in `docs/AUTOMATION_BACKLOG.md → "srdEn shrink-list"`.
 *
 * ## Contract
 *  - PURE: no React, no Zustand, no Firebase, no i18next, no locale. English in.
 *  - Reads the EXACT same `en/srd/<file>.json` catalogues as `localizeSrd`.
 *  - A missing `kind`/`key`/`field` returns `undefined` (the engine's parsers
 *    already handle "no value" — a missing fact is not a render crash). This
 *    differs from `localizeSrd`, which THROWS, because `srdEn` is a fact lookup,
 *    not a display lookup.
 */

import enSpells from "./en/srd/spells.json";
import enFeats from "./en/srd/feats.json";
import enRaces from "./en/srd/races.json";
import enBackgrounds from "./en/srd/backgrounds.json";
import enConditions from "./en/srd/conditions.json";
import enEquipment from "./en/srd/equipment.json";
import enMagicItems from "./en/srd/magic-items.json";
import enManeuvers from "./en/srd/maneuvers.json";
import enMetamagic from "./en/srd/metamagic.json";
import enInvocations from "./en/srd/invocations.json";
import enClasses from "./en/srd/classes.json";
import enSubclasses from "./en/srd/subclasses.json";
import enClassFeatures from "./en/srd/class-features.json";
import enWeaponMasteries from "./en/srd/weapon-masteries.json";
import enLanguages from "./en/srd/languages.json";
import enProficiencies from "./en/srd/proficiencies.json";
import enWeaponProperties from "./en/srd/weapon-properties.json";
import enBeasts from "./en/srd/beasts.json";

import type { Locale } from "@/lib/locale";
import { mergeCatalogue } from "@/lib/pack-merge";
import { packSrdEn, srdOverlay } from "@pack";

/** Every SRD content kind that carries translatable strings. */
export type SrdKind =
  | "spell"
  | "feat"
  | "race"
  | "background"
  | "condition"
  | "equipment"
  | "magic-item"
  | "maneuver"
  | "metamagic"
  | "invocation"
  | "class"
  | "subclass"
  | "class-feature"
  | "weapon-mastery"
  | "language"
  | "proficiency"
  | "weapon-property"
  | "beasts";

/** A leaf catalogue value: either a single string or (condition effects) a list. */
export type SrdLeaf = string | string[];
export type SrdCatalogue = Record<string, Record<string, SrdLeaf>>;
/** A full per-locale catalogue set (one `SrdCatalogue` per kind). */
export type SrdCatalogueSet = Record<SrdKind, SrdCatalogue>;

/** The SRD catalogue kinds, in a stable order — drives lazy loaders + parity. */
export const SRD_KINDS: readonly SrdKind[] = [
  "spell",
  "feat",
  "race",
  "background",
  "condition",
  "equipment",
  "magic-item",
  "maneuver",
  "metamagic",
  "invocation",
  "class",
  "subclass",
  "class-feature",
  "weapon-mastery",
  "language",
  "proficiency",
  "weapon-property",
  "beasts",
];

// EN is statically bundled — it is the canonical FACTS source (always loaded).
// Each kind composes public SRD + the content pack's EN additions + the pack's
// EN overlay patches (PHB display-name/prose restores over public entries);
// without the pack both are empty and the public catalogue passes through.
const PUBLIC_EN: SrdCatalogueSet = {
  spell: enSpells,
  feat: enFeats,
  race: enRaces,
  background: enBackgrounds,
  condition: enConditions,
  equipment: enEquipment,
  "magic-item": enMagicItems,
  maneuver: enManeuvers,
  metamagic: enMetamagic,
  invocation: enInvocations,
  class: enClasses,
  subclass: enSubclasses,
  "class-feature": enClassFeatures,
  "weapon-mastery": enWeaponMasteries,
  language: enLanguages,
  proficiency: enProficiencies,
  "weapon-property": enWeaponProperties,
  beasts: enBeasts,
};

const EN: SrdCatalogueSet = Object.fromEntries(
  SRD_KINDS.map((kind) => [
    kind,
    mergeCatalogue(kind, PUBLIC_EN[kind], packSrdEn[kind], srdOverlay.en?.[kind]),
  ])
) as SrdCatalogueSet;

/**
 * The process-wide SRD catalogue registry. EN is seeded statically (facts, always
 * loaded); every other locale is filled lazily by the bootstrap loader via
 * {@link registerSrdCatalogues}. Both the display resolver (`localizeSrd`) and the
 * all-locale matcher (`srdAllLocaleValues`) read from here, so a locale's strings
 * are available exactly when (and only when) it has been loaded.
 */
const REGISTRY: Partial<Record<Locale, SrdCatalogueSet>> = { en: EN };

/**
 * Register a locale's lazily-loaded SRD catalogue set into the registry. Called by
 * the i18n bootstrap (`ensureLocale`) after it dynamic-imports the locale's
 * `srd/*.json`. Idempotent — re-registering replaces the set.
 */
export function registerSrdCatalogues(locale: Locale, cats: SrdCatalogueSet): void {
  REGISTRY[locale] = cats;
}

/** Has this locale's SRD catalogue set been loaded into the registry? */
export function hasSrdLocale(locale: Locale): boolean {
  return REGISTRY[locale] !== undefined;
}

/**
 * The catalogue set for a loaded locale, or `undefined` when it has not been
 * loaded yet. The display resolver uses this; EN is always present.
 */
export function srdCatalogues(locale: Locale): SrdCatalogueSet | undefined {
  return REGISTRY[locale];
}

/**
 * The canonical English value of `(kind, key, field)`, or `undefined` when the
 * catalogue has no such entry/field. Locale-independent — always English. Used by
 * the engine to parse FACTS out of the canonical SRD wording (damage dice,
 * durations, triggers). For DISPLAY, use `localizeSrd` (UI/views only).
 */
export function srdEn(kind: SrdKind, key: string, field: string): string | undefined {
  const value = EN[kind][key]?.[field];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join("\n") : value;
}

/**
 * EVERY currently-loaded locale's value of `(kind, key, field)` as a deduped
 * array — locale-INDEPENDENT, exactly like {@link srdEn}: it returns the full set
 * across all LOADED languages, never the active-locale one, so the engine never
 * branches on the user's language. Consumed by the bounded read-normalizers that
 * recognise a stored DISPLAY name written in ANY language and conform it to a
 * stable id — `normalize-session-action-ids` (legacy session weapon names) and
 * `reconcile-build` (de-leveled spells). EN is always present; a locale that has
 * not been loaded yet simply contributes no names (every EN-named entity still
 * resolves — a flow needing an IT-named match `ensureLocale("it")` first). Missing
 * entries contribute nothing.
 */
export function srdAllLocaleValues(kind: SrdKind, key: string, field: string): string[] {
  const out: string[] = [];
  // REGISTRY only ever holds DEFINED sets (we never store `undefined`), so
  // `Object.values` yields `SrdCatalogueSet[]`.
  for (const cat of Object.values(REGISTRY)) {
    const value = cat[kind][key]?.[field];
    if (value === undefined) continue;
    out.push(Array.isArray(value) ? value.join("\n") : value);
  }
  return [...new Set(out)];
}

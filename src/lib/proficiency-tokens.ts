/**
 * proficiency-tokens — the single source of truth for weapon/armor proficiency
 * KINDS as STABLE TOKEN IDS (golden rule 7). A proficiency is referenced
 * everywhere — class tables, grants, the override Records, the override pickers —
 * by a kebab {@link ProficiencyToken} (`simple-weapons`, `light-armor`,
 * `longswords`, `pact-weapon`); the localized DISPLAY string lives only in the i18n
 * catalogue (`src/i18n/<locale>/srd/proficiencies.json`) and resolves at the render
 * edge via `localizeSrd("proficiency", token, "name", locale)`. There is NO in-code
 * EN→IT map: an Italian Warlock sees "Arma del patto" because `pact-weapon` resolves
 * from the catalogue, not because the code happened to know the translation.
 *
 * This module is the SOLE minter of the brand ({@link asProficiencyToken}) and owns
 * the override POOLS. The legacy-English → token RESOLVER (`enToProficiencyToken`)
 * lives in the data layer (`@/data/proficiency-vocab`) — it is authoring/migration
 * vocabulary, and keeping its English-name literals out of `lib/**` keeps the GR7
 * leak-guard's runtime scan clean. Engine-layer + pure (no React, no locale): the UI
 * (`ResourceRail`) imports the pools FROM here; this never imports the UI.
 */

import type { ProficiencyToken } from "@/types/ids";

/**
 * Mint a {@link ProficiencyToken} from a kebab token id. The ONE sanctioned cast
 * site for the brand (enforced by `branded-id-minters.guard.test.ts`): the data
 * authoring layer, the grant evaluator's `pact-weapon` union, the override pickers
 * and the codec override-conform boundary all obtain the brand through here, never an
 * `as ProficiencyToken` cast. The caller is responsible for passing a real token —
 * the resolver below produces them from EN forms; raw user input never reaches here.
 */
export function asProficiencyToken(id: string): ProficiencyToken {
  return id as ProficiencyToken;
}

// The legacy EN-form → token resolver ({@link enToProficiencyToken}) lives in the
// DATA layer (`@/data/proficiency-vocab`) — it is authoring/migration vocabulary
// (a table of old English forms → ids), and keeping its EN-name string literals out
// of `lib/**` keeps the GR7 leak-guard's runtime scan clean by construction.

// ── The #68 override pool — the COMPLETE set of proficiency KINDS a character can
// hold (Owner-10), as token ids. The add pickers must offer the WHOLE pool, never
// just the broad categories the class happened to grant, so a player can override-add
// any kind: the two tiers, every weapon-type group the SRD grants à la carte, plus
// armor's four categories. A guard test (proficiency-pool.test.ts) enforces that every
// proficiency token anywhere in the SRD data is covered here, and that each has an IT
// translation, so the pool can never silently fall behind the data.

/** The two broad weapon-proficiency tiers, pinned to the top of the picker. */
export const WEAPON_PROFICIENCY_CATEGORIES: ReadonlyArray<ProficiencyToken> = [
  "simple-weapons",
  "martial-weapons",
].map(asProficiencyToken);

/** Every weapon-TYPE proficiency the SRD grants à la carte (a kind, not a single
 * item): a class/species/feat can make you proficient with all Longswords, all
 * Daggers, etc., independent of the Simple/Martial tiers. */
export const WEAPON_PROFICIENCY_GROUPS: ReadonlyArray<ProficiencyToken> = [
  "clubs",
  "daggers",
  "darts",
  "hand-crossbows",
  "improvised-weapons",
  "javelins",
  "light-crossbows",
  "longbows",
  "longswords",
  "maces",
  "quarterstaffs",
  "rapiers",
  "scimitars",
  "shortbows",
  "shortswords",
  "sickles",
  "slings",
  "spears",
].map(asProficiencyToken);

/** The whole weapon-proficiency pool: the two tiers + every weapon-type group. */
export const WEAPON_PROFICIENCY_POOL: ReadonlyArray<ProficiencyToken> = [
  ...WEAPON_PROFICIENCY_CATEGORIES,
  ...WEAPON_PROFICIENCY_GROUPS,
];

/** The whole armor-proficiency pool — the four categories are the complete set. */
export const ARMOR_PROFICIENCY_POOL: ReadonlyArray<ProficiencyToken> = [
  "light-armor",
  "medium-armor",
  "heavy-armor",
  "shields",
].map(asProficiencyToken);

/**
 * Resolve `choice-language` grants.
 *
 * 2024 origin languages ("Common plus two languages of your choice"),
 * heritage/feat language grants, and any future feature that lets the
 * player pick a language from a constrained pool (empty `options` = any
 * standard language). Picks land on `character.languageIds` as STABLE SRD
 * LANGUAGE IDS, idempotently — never a localized display string (the leak the
 * owner saw on Briox: "gnomico" stored verbatim renders identically in every
 * locale). The DISPLAY name resolves by id in the presenter
 * (`displayLanguages` → `localizeSrd("language", id, …)`), so a tongue reads the
 * SAME canonical name on every surface in the active locale (golden rules
 * 6b/6c/12). Adding a new app language is JUST adding `languages.json`.
 *
 * Pure, locale-AGNOSTIC module — no React/store/i18n deps. The catalogue here is
 * IDS ONLY (no names); the bilingual labels live in
 * `src/i18n/{en,it}/srd/languages.json` keyed by these ids.
 */
import type { Grant } from "@/lib/grants";
import { arePicksComplete } from "@/lib/feat-choices-common";
import type { CharacterData } from "@/types/character";

/**
 * The COMPLETE 2024 SRD 5.2 language roster as STABLE IDS — Standard (10) then
 * Rare (13, incl. Primordial's four elemental dialects — SPEC D-11), the full
 * list from the 2024 ruleset. The single source of truth for
 * BOTH the language pickers and display localization: every surface resolves a
 * held id → its bilingual name via the `language` SRD catalogue
 * (`localizeSrd("language", id, "name", locale)`) — so a held tongue never
 * renders in English on one surface and Italian on another, and a new app
 * language is JUST a new `languages.json`.
 *
 * Override-first: EVERY language is freely pickable, including the secret tongues
 * Druidic and Thieves' Cant. They are AUTO-granted by their class feature
 * (`druid-druidic` / `rogue-thieves-cant` / `bard-moon-primal-lore`), but a player
 * may also add any language by hand from the Bio — automation by default, manual
 * override always. Stable content; pinned by a unit test.
 */
export const SRD_LANGUAGE_IDS: ReadonlyArray<string> = [
  // ── Standard ──────────────────────────────────────────────────────────
  "common",
  "common-sign-language",
  "draconic",
  "dwarvish",
  "elvish",
  "giant",
  "gnomish",
  "goblin",
  "halfling",
  "orc",
  // ── Rare ──────────────────────────────────────────────────────────────
  "abyssal",
  "celestial",
  "deep-speech",
  // Secret tongues — auto-granted by a class feature (Druid / Rogue / Moon Bard),
  // and also freely pickable by hand (override-first).
  "druidic",
  "infernal",
  "primordial",
  // Primordial's four elemental dialects — real 2024 languages (SPEC D-11),
  // pickable like any Rare tongue; monsters reference them as "Primordial (Ignan)".
  "aquan",
  "auran",
  "ignan",
  "terran",
  "sylvan",
  "thieves-cant",
  "undercommon",
];

/**
 * The 2024 STANDARD-languages table as STABLE IDS — the first 10 of the roster
 * (Common … Orc, the "── Standard ──" block). This is the pool the creation
 * origin pick draws from ("Common plus two languages of your choice from the
 * standard languages table"); the Rare + secret tongues are NOT standard and stay
 * out of the guided pick (the Bio editor still offers the full roster). Derived by
 * slice (DRY — the roster's own doc-comment guarantees Standard-10-then-Rare); the
 * 10-membership is pinned by a unit test.
 */
export const STANDARD_LANGUAGE_IDS: ReadonlyArray<string> = SRD_LANGUAGE_IDS.slice(0, 10);

/** The set form of {@link SRD_LANGUAGE_IDS} — the membership test (a known id?). */
export const LANGUAGE_IDS: ReadonlySet<string> = new Set(SRD_LANGUAGE_IDS);

/** Is `id` a known SRD language id? (The single membership test.) */
export function isLanguageId(id: string): boolean {
  return LANGUAGE_IDS.has(id);
}

/** One pending language slot derived from a source's grants. */
export interface LanguageChoiceSlot {
  amount: number;
  slotId: string;
  /** SRD language ids the player may pick from. Empty = any standard language. */
  options: ReadonlyArray<string>;
}

export type LanguageChoicePicks = Record<string, ReadonlyArray<string>>;

/**
 * Walk a source's grants and return one slot per `choice-language` entry.
 */
export function pendingLanguageSlotsForFeat(feat: {
  grants?: ReadonlyArray<Grant>;
}): LanguageChoiceSlot[] {
  const slots: LanguageChoiceSlot[] = [];
  let idx = 0;
  for (const g of feat.grants ?? []) {
    if (g.type === "choice-language") {
      slots.push({ amount: g.amount, slotId: `slot-${idx++}`, options: g.options });
    }
  }
  return slots;
}

/** Each slot must be filled to its required amount. */
export function isLanguagePicksComplete(
  slots: ReadonlyArray<LanguageChoiceSlot>,
  picks: LanguageChoicePicks
): boolean {
  return arePicksComplete(slots, picks);
}

/**
 * The available language IDS for a slot. When `slot.options` is empty ("any
 * language of your choice"), the FULL roster is offered (override-first — no
 * language is gated out). An explicit option list is honored verbatim (a feature
 * may name a specific set). Returns IDS only — the picker UI localizes each via
 * the presenter (`languageOptions`).
 */
export function listAvailableForLanguageSlot(
  slot: LanguageChoiceSlot
): ReadonlyArray<string> {
  if (slot.options.length === 0) return SRD_LANGUAGE_IDS;
  const allowed = new Set(slot.options);
  return SRD_LANGUAGE_IDS.filter((id) => allowed.has(id));
}

/**
 * Append the picked language IDS to `character.languageIds`. Idempotent —
 * languages already present (by id) are skipped. Unknown ids are skipped (only
 * catalogue languages are real picks); the display name is resolved by id in the
 * presenter, never baked here.
 */
export function applyLanguagePicks(
  character: CharacterData,
  picks: LanguageChoicePicks
): CharacterData {
  const allIds = Object.values(picks).flat();
  if (allIds.length === 0) return character;
  const existing = new Set(character.languageIds);
  const added: string[] = [];
  for (const id of allIds) {
    if (!isLanguageId(id)) continue; // only catalogue ids are real picks
    if (existing.has(id) || added.includes(id)) continue;
    added.push(id);
  }
  if (added.length === 0) return character;
  return {
    ...character,
    languageIds: [...character.languageIds, ...added],
  };
}

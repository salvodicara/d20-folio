import type { OriginLanguagePolicy } from "./types";

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

/** Common plus two distinct additional standard languages at creation. */
export const SRD_ORIGIN_LANGUAGES: OriginLanguagePolicy = {
  known: ["common"],
  choice: {
    id: "origin",
    count: 2,
    options: STANDARD_LANGUAGE_IDS.filter((id) => id !== "common"),
  },
};

/**
 * Branded id types — the COMPILE-TIME half of the "stable ids, never display
 * strings" guarantee (golden rule 7 + the owner's directive: everything that is
 * not custom user input is referenced by an ID in the document).
 *
 * A branded id is a `string` the type system refuses to accept a RAW or LOCALIZED
 * string for: a value only becomes a `ConcentrationRef` by passing through its
 * sanctioned minter (`concentrationValue`). So a bare spell NAME can never
 * type-check into `state.concentration`, a `concentration-start/-end` log event, or
 * `setConcentration` — the language-leak / strict-resolver-crash class is caught at
 * `tsc` (BUILD time), not discovered as a runtime crash. The runtime complements are
 * the boundary read-normalization (sanitize, golden rule 10) for not-yet-migrated
 * docs, and a guard test asserting no OTHER site mints the brand.
 */

declare const brand: unique symbol;

/** A `T` string carrying a compile-time `B` tag; assignable only via its minter. */
export type Branded<T extends string, B extends string> = T & { readonly [brand]: B };

/**
 * A stored concentration value: a spell's stable `srdId`, OR a custom spell's name
 * behind the `custom:` marker — NEVER a bare SRD name. Minted ONLY by
 * `concentrationValue` (`lib/views/tracker-view`). The empty string is the separate
 * "not concentrating" sentinel — see {@link StoredConcentration}.
 */
export type ConcentrationRef = Branded<string, "ConcentrationRef">;

/** The persisted concentration field: a {@link ConcentrationRef} or "" (not concentrating). */
export type StoredConcentration = ConcentrationRef | "";

/**
 * A character's species as its stable race `srdId` ("elf", "dragonborn", "goliath") —
 * NEVER the localized display NAME. The display resolves at the render edge via
 * `localizeRaceName` / `localizeSrd("race", id, "name", locale)`. Minted only by
 * `asRaceId` (the codec/SELECT boundary). Single-word species names ("Elf", "Orc")
 * slip past the MULTI-WORD leak-detector, so this brand is the structural guard that
 * keeps a display name out of `CharacterData.race` (golden rule 7).
 */
export type RaceId = Branded<string, "RaceId">;

/**
 * A weapon/armor proficiency KIND as its stable kebab token (`simple-weapons`,
 * `martial-weapons`, `light-armor`, `shields`, `longswords`, `hand-crossbows`,
 * `pact-weapon`) — NEVER the localized display NAME ("Simple weapons" / "Armi
 * semplici"). The display resolves at the render edge via
 * `localizeSrd("proficiency", token, "name", locale)`. Minted ONLY by
 * `asProficiencyToken` (`lib/proficiency-tokens.ts`) — the codec override-conform
 * boundary, the data/grant authoring layer and the override pickers all obtain the
 * brand through it. This is the structural guard that keeps an
 * English label out of a class table's `weaponProficiencies`/`armorProficiencies`, the
 * proficiency-override Records, a `weapon-/armor-proficiency` grant, and the pools
 * (golden rule 7 — it closes the "Pact weapon" leak by construction).
 */
export type ProficiencyToken = Branded<string, "ProficiencyToken">;

/**
 * A character's alignment as its stable id ("chaotic-good", "true-neutral",
 * "unaligned") — NEVER the localized display LABEL ("Chaotic Good" / "Caotico
 * Buono"). The display resolves at the render edge via `t("lore.alignments.<id>")`.
 * Minted only by `asAlignmentId` (`lib/lore-utils.ts` — the codec read edge + the
 * alignment SELECT). The id keeps the in-memory field locale-agnostic so a new
 * language is just a JSON key, never a re-keyed document; the brand is the
 * structural guard that keeps a display LABEL out of `CharacterData.alignment`
 * (golden rule 7).
 */
export type AlignmentId = Branded<string, "AlignmentId">;

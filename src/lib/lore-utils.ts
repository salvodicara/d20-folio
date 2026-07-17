/**
 * Lore utilities — alignment constants and helpers.
 *
 * Kept in src/lib so they can be imported by both the LorePage
 * component and unit tests without triggering React fast-refresh warnings.
 */

import type { AlignmentId } from "@/types/ids";

/** The 10 standard D&D alignment strings (the canonical EN labels). */
export const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
] as const;

export type AlignmentKey = (typeof ALIGNMENTS)[number];

/** Returns true if the given string is one of the standard alignment keys. */
export function isStandardAlignment(value: string): value is AlignmentKey {
  return ALIGNMENTS.includes(value as AlignmentKey);
}

/** "True Neutral" → "true-neutral" (a stable, locale-agnostic alignment id). */
function slugifyAlignment(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "-");
}

/** id → label and label → id lookups, built once from {@link ALIGNMENTS}. */
const ALIGNMENT_ID_TO_LABEL: ReadonlyMap<string, AlignmentKey> = new Map(
  ALIGNMENTS.map((label) => [slugifyAlignment(label), label])
);

/**
 * The 10 standard alignment IDS in canonical order ("lawful-good" … "unaligned") —
 * the stable, locale-agnostic option set the alignment SELECTs bind to and emit. The
 * visible label is DERIVED per-id from i18n (`t("lore.alignments.<id>")`), never the
 * id itself (golden rule 7).
 */
export const ALIGNMENT_IDS: readonly string[] = ALIGNMENTS.map(slugifyAlignment);

/**
 * The stable alignment ID for a (label OR id) string — `"True Neutral"` →
 * `"true-neutral"`, and an already-id input passes through. Alignment IS localized
 * (the BioTab + creation-wizard SELECT show it in EN/IT), so this slugifies the
 * canonical English LABEL to the locale-agnostic id that keys the i18n catalogue.
 * Returns `""` for an empty / unknown value so the codec can omit it. The codec read
 * edge uses this as the golden-rule-10 read-normalizer (a legacy label → its id),
 * then brands the result via {@link asAlignmentId}.
 */
export function alignmentIdByLabel(value: string): string {
  if (typeof value !== "string" || !value) return "";
  if (isStandardAlignment(value)) return slugifyAlignment(value);
  // Tolerate an already-slugged id (idempotent round-trips).
  if (ALIGNMENT_ID_TO_LABEL.has(value)) return value;
  return "";
}

/**
 * Brand a resolved stable alignment id as an {@link AlignmentId} — the boundary
 * minter used at the codec read edge + the alignment SELECT. A trivial tag (the
 * caller has already resolved a real id via {@link alignmentIdByLabel} / the SELECT
 * option ids); the ONE sanctioned way a value becomes an AlignmentId, so a display
 * LABEL can never type-check into `CharacterData.alignment` (golden rule 7).
 */
export function asAlignmentId(id: string): AlignmentId {
  return id as AlignmentId;
}

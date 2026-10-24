/**
 * homebrew-grants — the ONE validator between a homebrew feature's authored
 * mechanics and the engine.
 *
 * A homebrew feature (`CustomFeature.grants`) declares mechanics in the same Grant
 * language as the catalogue, so every kind the catalogue can declare a player can
 * declare too. The stored list stays exactly as written (the character and library
 * codecs carry it verbatim, like a homebrew action), and the engine reads it only
 * through this function: each element is conformed against the exact Grant schema,
 * and an element the schema rejects is left out of play — never repaired, never
 * erased from storage. That keeps a newer client's kind (or field) harmless on an
 * older one: it is preserved, and inert until this client knows it, while its
 * sibling grants keep working.
 */
import { conformGrant, type Grant } from "@/lib/grants";
import type { CustomFeature } from "@/types/character";

const EMPTY: readonly Grant[] = Object.freeze([]);
const cache = new WeakMap<object, readonly Grant[]>();

/** The playable grants of a homebrew feature, in authored order. */
export function homebrewFeatureGrants(
  feature: Pick<CustomFeature, "grants">
): readonly Grant[] {
  const authored: unknown = feature.grants;
  if (!Array.isArray(authored) || authored.length === 0) return EMPTY;
  const hit = cache.get(authored);
  if (hit) return hit;
  const accepted = Object.freeze(
    authored.flatMap((raw: unknown) => {
      const grant = conformGrant(raw);
      return grant ? [grant] : [];
    })
  );
  cache.set(authored, accepted);
  return accepted;
}

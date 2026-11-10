/**
 * The WRITE side of the roster cache: stamp it from a live character with the same
 * grant-aware AC/HP engine the cockpit renders. Kept apart from `character-cache.ts`
 * (the read side the eager persistence layer imports) so the engine stays off first
 * paint; callers load it with `import()` (tests/unit/eager-graph.guard.test.ts).
 */
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";
import { effectiveAC, effectiveMaxHp } from "@/lib/aggregate-character";
import { getClasses } from "@/lib/classes";
import { getEquipment } from "@/data/equipment";
import { shownWalkingSpeedFt } from "@/lib/smart-tracker";
import { nonEmptyString } from "@/lib/non-empty-string";
import {
  cacheToRosterCharacter,
  type CharacterCache,
  type RosterCharacterDoc,
} from "@/lib/character-cache";

/**
 * Stamp the roster cache from a LIVE character + session. AC is the grant-aware
 * `effectiveAC` (override-first), matching the cockpit. A non-finite/0 AC stamps
 * as 0 so the roster renders the honest "—" blank (`displayAc`), never the lie "0".
 * `character.name` is a `NonEmptyString` by type — but a runtime-untrusted live
 * character (a fuzzed test, a future seam) is re-validated through the smart
 * constructor so the stamped cache is provably non-empty. A `null` here is a
 * programmer error (the type was violated), so we surface it.
 */
export function buildCharacterCache(
  character: CharacterData,
  session: SessionState
): CharacterCache {
  const ac = effectiveAC(character, session);
  // D1 — stamp the EFFECTIVE max HP (stored base + hp-flat boons + Aid), the SAME
  // grant-aware derivation the cockpit clamps/heals against, so the roster + party
  // glance can never understate a Draconic / Boon-of-Fortitude / Aided hero (rule 6
  // — one source: the cockpit and the roster both read `effectiveMaxHp`). The raw
  // type-guard is preserved as the floor for a husk the engine can't recompute.
  const hpRaw = (character.hp as { max?: unknown } | undefined)?.max;
  const hpMaxStamp =
    typeof hpRaw === "number" && Number.isFinite(hpRaw)
      ? effectiveMaxHp(character, session)
      : 0;
  const name = nonEmptyString(character.name);
  if (name === null) {
    throw new Error("buildCharacterCache: character.name must be non-empty");
  }
  return {
    name,
    ac: Number.isFinite(ac) && ac > 0 ? ac : 0,
    hpMax: Number.isFinite(hpMaxStamp) && hpMaxStamp > 0 ? hpMaxStamp : 0,
    // The Speed the sheet shows (`shownWalkingSpeedFt`: a hand-set Speed, a form,
    // else the stored base with every bonus), like the stamped effective AC. A
    // character with no speed set stamps "" (the roster reads it as "unknown").
    speed:
      typeof character.speed === "string"
        ? String(
            shownWalkingSpeedFt({ character, session } as CharacterDoc, getEquipment)
          )
        : "",
    // `race` is a `validateCharacterData`-guaranteed non-empty species id (the parse
    // rejects a missing/empty race), so it passes through directly — no "" default.
    raceId: character.race,
    classes: getClasses(character),
  };
}

/**
 * Project a FULL parsed {@link CharacterDoc} down to the SRD-free
 * {@link RosterCharacterDoc} — the same shape `cacheToRosterDoc` streams from
 * Firestore, but built in-memory from a live doc. Used by the dev-bypass roster
 * seed (and tests) so the local preview's roster list carries the EXACT projection
 * type the real subscription does, with no `as unknown` cast. Stamps the cache via
 * {@link buildCharacterCache} (so `ac`/`name`/`classes` match production).
 *
 * HP/conditions/death saves come straight off `doc.session`: under `DEV_BYPASS_AUTH`
 * there is no `combat/state` subdoc, so the live hydrated session IS the combat source
 * (the same values `applyCombatToRosterDoc` would fold from a real subdoc). Dev thus
 * matches prod by construction — the projection divergence that once hid the roster's
 * `0 / N` bug (prod read the stripped parent state; dev read the live session) is gone.
 */
export function rosterProjectionFromDoc(doc: CharacterDoc): RosterCharacterDoc {
  const cache = buildCharacterCache(doc.character, doc.session);
  return {
    id: doc.id,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    portraitUrl: doc.portraitUrl,
    portraitCrop: doc.portraitCrop,
    status: doc.status,
    character: cacheToRosterCharacter(cache, doc.character.background || undefined),
    session: doc.session,
  };
}

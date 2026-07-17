/**
 * Read-time, ONE-WAY conformance of a character's stored `features[]` against the
 * AUTO-GRANTED sources — the bounded untrusted-input normalization golden rule 10
 * sanctions (never written back).
 *
 * THE BAKE IT UNDOES. Race traits (and every class/subclass feature) are
 * AUTO-GRANTED facts: race traits resolve from `character.race`
 * (`resolveGrantSourcesForRace` / the smart-tracker race branches), class features
 * from the class table (`inferFeatures`). They do NOT belong in `features[]` —
 * which holds only genuinely CHOSEN / custom content (chosen feats, homebrew).
 *
 * But the deployed app once BAKED race-trait srdId refs into `character.features`
 * (e.g. `{ srdId: "orc-adrenaline-rush" }`), so a live user's Firestore doc carries
 * the SAME semantic mechanic via TWO paths: the auto-granted race source AND the
 * stored ref. The two paths mint DIFFERENT ids for the one trait —
 * `orc-adrenaline-rush` (the `raceFeatureIndex` id, via the stored-feature loop) and
 * `race:orc:adrenaline-rush` (the `raceTraitSessionId`, via the race loop) — so the
 * by-id dedup `resolveActions`/`resolveTrackers` enforce CANNOT fold them: each
 * surfaces its OWN action card + tracker pip row (the owner's "four Adrenaline Rush
 * cards / each tracker twice" report, Santaera the Orc Barbarian, 2026-06-12).
 *
 * THE FOLD. We DROP a stored SRD feature ref whose srdId duplicates an auto-granted
 * source — recognized by STABLE id (golden rule 7), never a display string:
 *   - a RACE TRAIT the character's race auto-grants (`raceFeatureIndex` → the trait
 *     on `character.race`), OR
 *   - a CLASS/SUBCLASS feature the class table auto-grants (`inferFeatures`).
 * The class/subclass case keys the surviving tracker on the SAME srdId, so no state
 * migration is needed; only race traits need a remap (the surviving id is the
 * `race:<id>:<trait.id>` session id, NOT the stored srdId).
 *
 * ONE mechanism, not two: conforming the character's `features[]` at the read
 * boundary makes EVERY downstream resolver (the grant-source path AND the
 * smart-tracker direct-feature loops) see a clean array — so no per-resolver fold is
 * needed. The companion session migration ({@link remapSessionTrackerIds}) carries a
 * user's spent pips from the dropped id to the survivor so the fold never silently
 * restores spent uses.
 */
import type {
  CharacterData,
  SrdFeatureRef,
  CustomFeature,
  SessionState,
} from "@/types/character";

/** The persisted usage state of one tracker (`session.trackers[id]`). */
type TrackerState = SessionState["trackers"][string];
import {
  getRace,
  raceFeatureIndex,
  rawRaceTraitCatKey,
  type RaceFeatureEntry,
} from "@/data/races";
import type { SrdRaceTrait } from "@/data/types";
import { raceTraitSessionId } from "@/lib/resolve-grant-sources";
import { inferFeatures } from "@/lib/character-infer";
import { srdEn } from "@/i18n/srd-en";

/** A `{ raceId, trait }` pair recovered for a stored race-trait srdId. */
interface RaceTraitMatch {
  raceId: string;
  trait: SrdRaceTrait;
}

/**
 * Resolve a stored feature's srdId to the auto-granted RACE TRAIT it duplicates —
 * the trait on the CHARACTER'S OWN race (`raceFeatureIndex` gives the trait's
 * `raceId`; we confirm it matches the character so a cross-race id is never folded).
 * Returns `undefined` for a non-race-trait id (chosen feat / class feature / unknown).
 */
function matchRaceTrait(
  srdId: string,
  raceId: string | undefined
): RaceTraitMatch | undefined {
  const entry: RaceFeatureEntry | undefined = raceFeatureIndex.get(srdId);
  if (!entry) return undefined;
  const race = raceId ? (getRace(raceId) ?? getRace(raceId.toLowerCase())) : undefined;
  if (!race || race.id !== entry.raceId) return undefined;
  const trait = race.traits.find((t) => `${race.id}-${t.id}` === srdId);
  return trait ? { raceId: race.id, trait } : undefined;
}

/** The result of {@link conformStoredFeatures}. */
export interface ConformedFeatures {
  /** `features[]` with the auto-granted duplicates dropped (referential identity
   *  preserved when nothing was dropped). */
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>;
  /** Dropped-srdId → surviving session tracker id, for the race-trait duplicates
   *  (a class/subclass duplicate keeps the same id, so it is NOT in here). Empty
   *  when nothing needed a remap. */
  trackerIdRemap: Map<string, string>;
}

/**
 * Conform a character's stored `features[]`: drop the SRD refs that duplicate an
 * auto-granted source (a race trait on the character's race, or a class/subclass
 * feature the class table grants), and report the race-trait id remap.
 *
 * Pure + idempotent. Custom features are always kept. A stored ref is dropped ONLY
 * when its srdId resolves to an auto-granted source — an unknown / chosen-feat id is
 * untouched. The auto-granted source remains the SOLE surfacing of the mechanic.
 */
export function conformStoredFeatures(character: {
  race?: CharacterData["race"];
  classes: CharacterData["classes"];
  features: ReadonlyArray<SrdFeatureRef | CustomFeature>;
}): ConformedFeatures {
  const derivedClassIds = new Set(inferFeatures(character.classes).map((f) => f.srdId));
  const trackerIdRemap = new Map<string, string>();

  const features = character.features.filter((f) => {
    if ("custom" in f) return true;
    const raceTrait = matchRaceTrait(f.srdId, character.race);
    if (raceTrait) {
      // The surviving tracker/action id is the race session id, not this srdId.
      trackerIdRemap.set(f.srdId, raceTraitSessionId(raceTrait.raceId, raceTrait.trait));
      return false;
    }
    // The class table re-derives a class/subclass feature under the SAME srdId — no remap.
    return !derivedClassIds.has(f.srdId);
  });

  // Preserve referential identity when nothing was dropped (idempotent re-runs).
  return {
    features:
      features.length === character.features.length ? character.features : features,
    trackerIdRemap,
  };
}

/**
 * Migrate the persisted tracker STATE keyed under a dropped feature id onto the
 * surviving session id (the race-trait fold's companion). A user's spent pips must
 * NOT be silently restored: when BOTH the dropped id and the survivor carry state,
 * keep the HIGHER `used` (the survivor is the canonical id; the dropped row's pips
 * are the user's just as much, so a conservative merge never un-spends a use).
 *
 * Pure — returns a new session only when a remap actually moved state (referential
 * identity preserved otherwise). ONE-WAY: the dropped id is removed; the survivor's
 * state is never written back to the old id.
 */
export function remapSessionTrackerIds(
  session: SessionState,
  remap: Map<string, string>
): SessionState {
  if (remap.size === 0) return session;
  // Only the dropped ids that actually carry state need moving.
  const movers = [...remap].filter(([from]) => session.trackers[from] !== undefined);
  if (movers.length === 0) return session;

  // Drop every orphaned legacy key, then fold its `used` onto the survivor (keeping
  // the higher of the two — never silently un-spend a use).
  const droppedFrom = new Set(movers.map(([from]) => from));
  const next: Record<string, TrackerState> = {};
  for (const [id, state] of Object.entries(session.trackers)) {
    if (!droppedFrom.has(id)) next[id] = state;
  }
  for (const [from, to] of movers) {
    const fromState = session.trackers[from];
    if (fromState === undefined) continue;
    const toState = next[to];
    next[to] =
      toState === undefined
        ? fromState
        : { ...toState, used: Math.max(toState.used, fromState.used) };
  }
  return { ...session, trackers: next };
}

// ════════════════════════════════════════════════════════════════════════════
// Race-trait session-id LEGACY-NAME → id conform (golden rules 7 + 10)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Conform ONE persisted key from the legacy `race:<raceId>:<EN name>[<suffix>]`
 * shape to the id shape `race:<raceId>:<trait.id>[<suffix>]`. The race-trait
 * session id no longer embeds an English display name (golden rule 7 — the
 * code speaks only ids); a doc written before that change stored the EN name as the
 * third segment, so we rewrite it ON READ (golden rule 10 — bounded, one-way; never
 * written back as the name) without losing a user's spent-uses / pinned state.
 *
 * The key is the bare tracker id (`race:orc:Relentless Endurance`), an action id
 * with a `-<actionType>` suffix (`race:orc:Adrenaline Rush-bonus`), the same with a
 * `temphp-` PREFIX (`temphp-race:orc:Adrenaline Rush`), or a per-spell free-cast
 * sourceId with a `:<spellId>` suffix (`race:tiefling:Fiendish Legacy:hellish-rebuke`).
 * We locate `race:<raceId>:` (after any leading non-`race:` prefix), then match the
 * remainder against the race's trait EN NAMES (resolved from the catalogue, never a
 * stripped field) — the LONGEST EN name that is a prefix of the remainder followed by
 * a boundary (end / `:` / `-`) wins (so `"Shape-Shifter"` is matched whole, never
 * split at its hyphen). The matched EN-name run is replaced by the trait id; the
 * suffix is carried verbatim.
 *
 * IDEMPOTENT: a key already in the id form (its third segment === a `trait.id`)
 * matches no EN name, so it passes through unchanged. A key that doesn't contain a
 * resolvable `race:<knownRaceId>:` passes through unchanged.
 */
export function conformRaceTraitKey(key: string): string {
  const marker = "race:";
  const at = key.indexOf(marker);
  if (at < 0) return key;
  // Only a `race:` that is at the start OR directly follows a `-`-terminated prefix
  // (e.g. `temphp-`) is a real session-id boundary — never one inside a word.
  if (at > 0 && key[at - 1] !== "-") return key;

  const afterMarker = at + marker.length;
  const raceEnd = key.indexOf(":", afterMarker);
  if (raceEnd < 0) return key;
  const raceId = key.slice(afterMarker, raceEnd);
  const race = getRace(raceId) ?? getRace(raceId.toLowerCase());
  if (!race) return key;

  const remainder = key.slice(raceEnd + 1); // `<EN name>[<suffix>]`
  // The longest trait EN name that is a prefix of `remainder` at a real boundary.
  let best: { trait: SrdRaceTrait; enLen: number } | undefined;
  for (const trait of race.traits) {
    const en = srdEn("race", rawRaceTraitCatKey(race.id, trait), "name");
    if (!en) continue;
    if (!remainder.startsWith(en)) continue;
    const next = remainder[en.length];
    // A valid boundary: end-of-string, the `:spellId` free-cast separator, or the
    // `-actionType` action-id separator. (Trait NAMES may contain `-`/spaces, but
    // we match the whole name first, so an internal hyphen never trips this.)
    if (next !== undefined && next !== ":" && next !== "-") continue;
    if (!best || en.length > best.enLen) best = { trait, enLen: en.length };
  }
  if (!best) return key; // already id-form (or no match) → idempotent pass-through

  const suffix = remainder.slice(best.enLen);
  return `${key.slice(0, raceEnd + 1)}${best.trait.id}${suffix}`;
}

/**
 * Conform the persisted race-trait session ids across BOTH the session
 * (`trackers` keys + `pinnedActions` + `unpinnedActions`) AND the character's
 * `spells[].freeCastSource.sourceId`, rewriting every legacy
 * `race:<raceId>:<EN name>` form to `race:<raceId>:<trait.id>` (golden rule 7)
 * at the SRD-aware read boundary (golden rule 10 — see {@link conformRaceTraitKey}).
 *
 * Pure + idempotent. Tracker-key collisions (two legacy keys collapsing to one id
 * key — shouldn't happen, name↔id is 1:1, but be safe) fold via `Math.max(used)`,
 * exactly like {@link remapSessionTrackerIds}, so a spent use is never restored.
 * Referential identity is preserved when nothing changed (so a re-read is a no-op
 * and an unchanged doc skips a needless write).
 */
export function conformRaceTraitSessionIds<C extends { spells: CharacterData["spells"] }>(
  character: C,
  session: SessionState
): { character: C; session: SessionState } {
  // ── 1. trackers: rewrite each key, folding on collision ──────────────────────
  let trackersChanged = false;
  const nextTrackers: Record<string, TrackerState> = {};
  for (const [id, state] of Object.entries(session.trackers)) {
    const next = conformRaceTraitKey(id);
    if (next !== id) trackersChanged = true;
    const existing = nextTrackers[next];
    nextTrackers[next] =
      existing === undefined
        ? state
        : { ...existing, used: Math.max(existing.used, state.used) };
  }

  // ── 2 & 3. pinned / unpinned action ids ──────────────────────────────────────
  const conformList = (
    list: ReadonlyArray<string> | undefined
  ): { list: string[] | undefined; changed: boolean } => {
    if (list === undefined) return { list: undefined, changed: false };
    let changed = false;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of list) {
      const next = conformRaceTraitKey(id);
      if (next !== id) changed = true;
      // Two legacy ids collapsing to one (shouldn't happen) → dedupe, keep first.
      if (seen.has(next)) {
        changed = true;
        continue;
      }
      seen.add(next);
      out.push(next);
    }
    return { list: out, changed };
  };
  const pinned = conformList(session.pinnedActions);
  const unpinned = conformList(session.unpinnedActions);

  // ── 4. spells[].freeCastSource.sourceId ──────────────────────────────────────
  // `map` returns the SAME ref for an unchanged spell, so a reference inequality at
  // any index means a free-cast sourceId was rewritten.
  const nextSpells = character.spells.map((s) => {
    if ("custom" in s || !s.freeCastSource) return s;
    const next = conformRaceTraitKey(s.freeCastSource.sourceId);
    if (next === s.freeCastSource.sourceId) return s;
    return { ...s, freeCastSource: { ...s.freeCastSource, sourceId: next } };
  });
  const spellsChanged = nextSpells.some((s, i) => s !== character.spells[i]);

  const sessionChanged = trackersChanged || pinned.changed || unpinned.changed;
  const nextSession: SessionState = sessionChanged
    ? {
        ...session,
        trackers: trackersChanged ? nextTrackers : session.trackers,
        ...(pinned.changed ? { pinnedActions: pinned.list ?? [] } : {}),
        ...(unpinned.changed && unpinned.list !== undefined
          ? { unpinnedActions: unpinned.list }
          : {}),
      }
    : session;
  const nextCharacter = spellsChanged ? { ...character, spells: nextSpells } : character;

  return { character: nextCharacter, session: nextSession };
}

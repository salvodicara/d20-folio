/**
 * character-cache — the SRD-FREE roster/party projection of a persisted character.
 *
 * The unified Firestore document stores the character as the v3 codec envelope
 * (`{ schema, build, state }`, == the export) PLUS a small denormalized `cache`
 * the roster reads WITHOUT rehydrating. Rehydrating a `build` pulls the SRD class
 * tables (`character-codec` → `character-minimal` → `character-infer`), which the
 * always-eager persistence layer (`firestore.ts`) must NEVER value-import — the
 * bundle-budget guard pins that the SRD corpus stays off the cold-start closure.
 * So the roster list reads ONLY these top-level cache fields; never `parseCharacter`.
 *
 * `cache` is a pure DERIVED snapshot (single source of truth, rule 6): the WRITE
 * path stamps it from the live character (`buildCharacterCache`) with the SAME
 * grant-aware `effectiveAC` the cockpit renders, so the roster glance can never
 * disagree with the open sheet. It carries the name, the effective AC, max HP, the
 * speed snapshot, the species id, and the `classes[]` breakdown — exactly what the
 * roster card + the SRD-free helpers (`classes.ts`, identity line) need.
 *
 * Pure + Firebase-free + SRD-free (types + `effectiveAC` only — itself SRD-free):
 * safe for the eager persistence layer and CI-pure unit tests.
 */

import type {
  CharacterData,
  CharacterDoc,
  ClassEntry,
  SessionState,
} from "@/types/character";
import type { CombatState } from "@/types/combat-state";
import { effectiveAC, effectiveMaxHp } from "@/lib/aggregate-character";
import { sanitizeSession } from "@/lib/sanitize-session";
import { applyCombatToSession } from "@/lib/combat-state";
import { getClasses } from "@/lib/classes";
import { nonEmptyString, type NonEmptyString } from "@/lib/non-empty-string";

/**
 * The SRD-free roster/party projection persisted at the top of the character
 * document. Every field is a DERIVED snapshot the WRITE stamps; the read reads it
 * directly (no rehydrate). `ac` is the EFFECTIVE AC (`effectiveAC` honors the
 * override), so the roster never needs the raw `acOverride`.
 */
export interface CharacterCache {
  /** The hero's display name — a {@link NonEmptyString}: the cache cannot carry an
   *  empty name (the write stamps the guaranteed-non-empty `character.name`; an
   *  untrusted read that lacks one is REJECTED, not defaulted). */
  name: NonEmptyString;
  /** The effective AC (`effectiveAC` — honors `acOverride`); 0 marks "unknown"
   *  (the roster blanks it to "—" via `displayAc`, never the lie "AC 0"). */
  ac: number;
  /** Max hit points. */
  hpMax: number;
  /** The speed snapshot (plain number string, e.g. "30"; "" when unknown). */
  speed: string;
  /** The species id/slug (e.g. "elf") — localized at render. */
  raceId: string;
  /** The `classes[]` breakdown (ids + levels) — the class/level source of truth. */
  classes: ClassEntry[];
}

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
    // `speed` is GENUINELY optional (not a `validateCharacterData` must-have) — a
    // character with no speed set stamps "" (the roster reads it as "unknown").
    speed: typeof character.speed === "string" ? character.speed : "",
    // `race` is a `validateCharacterData`-guaranteed non-empty species id (the parse
    // rejects a missing/empty race), so it passes through directly — no "" default.
    raceId: character.race,
    classes: getClasses(character),
  };
}

/**
 * Coerce an untrusted persisted `cache` blob to a well-formed {@link CharacterCache},
 * or `null` when it lacks a valid (non-empty) name — the should-never-fire safety net
 * at the read boundary. Writers now guarantee a non-empty name, so a `null` here means
 * a genuinely corrupt doc; the caller SKIPS it (fault isolation) rather than inventing
 * a placeholder name. Every other field still defaults (a stale `ac`/`speed` is
 * cosmetic; a missing identity is not).
 */
function readCache(raw: unknown): CharacterCache | null {
  const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const name = nonEmptyString(c.name);
  if (name === null) return null;
  return {
    name,
    ac: typeof c.ac === "number" && Number.isFinite(c.ac) ? c.ac : 0,
    hpMax: typeof c.hpMax === "number" && Number.isFinite(c.hpMax) ? c.hpMax : 0,
    // `speed`/`raceId` default here because this is the UNTRUSTED persisted-cache
    // boundary (only a missing NAME is rejected above): a stale/partial cache blob
    // may legitimately lack either field. The defaults are cosmetic (a blank speed,
    // a blank species localizes to nothing) and self-heal on the owner's next save.
    speed: typeof c.speed === "string" ? c.speed : "",
    raceId: typeof c.raceId === "string" ? c.raceId : "",
    // `getClasses` validates ids/levels + guarantees a non-empty array.
    classes: getClasses({ classes: c.classes as ClassEntry[] | undefined }),
  };
}

/**
 * The SRD-free roster/party projection's CHARACTER half — a DISTINCT, narrower type
 * than the full {@link CharacterData} (Layer 2). It carries ONLY the fields the
 * roster card + the campaign attach picker read; the SRD-heavy fields the grant
 * engine aggregates over (`abilityScores`, `equipment`, `spells`, …) are
 * deliberately ABSENT. Because those required fields are missing, a
 * `RosterCharacter` is NOT assignable to `CharacterData`, so a full-character engine
 * function (`effectiveAC` / `aggregateCharacterGrants`) CANNOT be called on it — a
 * COMPILE error, not a runtime guard (that omission is exactly what threw and
 * crashed the attach picker, #115). The `projection: true` discriminant lets a
 * consumer that accepts EITHER shape (`buildMemberSnapshot`) branch type-safely.
 */
export interface RosterCharacter {
  /** Discriminant: this is the SRD-free projection, never a full character. */
  readonly projection: true;
  /** Display name — a {@link NonEmptyString} (carried from the cache, which a corrupt
   *  read REJECTS rather than defaulting), so the roster card never renders a blank or
   *  a fake name. */
  name: NonEmptyString;
  /** Species id/slug (localized at render). */
  race: string;
  /** The `classes[]` breakdown (ids + levels) — class/level source of truth. */
  classes: ClassEntry[];
  /** The stamped EFFECTIVE AC (`displayAc` blanks 0 → "—"); the cache writer applied
   *  any `acOverride` at stamp time, so the projection carries NO separate override
   *  (the roster card reads this value directly). */
  ac: number;
  /** Speed snapshot (plain number string). */
  speed: string;
  /** Max hit points. */
  hp: { max: number };
}

/**
 * The SRD-free roster/party projection DOC — the shape `cacheToRosterDoc` returns
 * and `subscribeToCharacters` streams. It shares the {@link CharacterDoc} metadata +
 * `session` but its `character` is the narrow {@link RosterCharacter}, so the type
 * system distinguishes it from a fully-parsed `CharacterDoc` (Layer 2 — the
 * projection-vs-full distinction is now compile-time, not a runtime `abilityScores`
 * sniff).
 */
export interface RosterCharacterDoc extends Pick<
  CharacterDoc,
  "id" | "createdAt" | "updatedAt" | "portraitUrl" | "portraitCrop" | "shareId" | "status"
> {
  character: RosterCharacter;
  session: SessionState;
}

/**
 * Build the lightweight roster projection from a persisted document's metadata +
 * `cache` ALONE — never parsing the `build` (SRD-free, bundle-budget safe). The
 * roster card reads only `character.{name,race,classes,ac,speed,hp.max}` and
 * `session.{hp.current,deathFail}` (for the fallen-hero state) + `status`, so we
 * populate exactly those from the cache + the persisted `state`, defaulting the
 * rest. The cockpit (NOT this) does the full SRD-coupled `parseCharacter`.
 *
 * Returns the DISTINCT {@link RosterCharacterDoc} (Layer 2): the narrow type makes
 * it a COMPILE error to feed this projection to a full-character engine function,
 * so the #115 attach-picker crash (`effectiveAC` over the absent `abilityScores`)
 * is structurally unreachable.
 *
 * Returns `null` when the cache lacks a valid (non-empty) name — a should-never-fire
 * corrupt doc (writers guarantee non-empty). The subscription SKIPS a `null` so one
 * bad doc never blanks the whole roster and no fake name is ever shown.
 */
export function cacheToRosterDoc(
  id: string,
  data: Record<string, unknown>,
  meta: Pick<
    CharacterDoc,
    "createdAt" | "updatedAt" | "portraitUrl" | "portraitCrop" | "shareId" | "status"
  >
): RosterCharacterDoc | null {
  const cache = readCache(data.cache);
  if (cache === null) return null;
  // Roster combat vitals (current/temp HP + the fallen-hero death-save track) come
  // from the canonical `combat/state` SUBDOC — the SINGLE persisted source every HP
  // reader uses (cockpit sheet, encounter row, DM card) — NOT the parent `state`, which
  // carries no combat trio. The subdoc is NOT in this parent-doc snapshot, so we seed the
  // BASELINE exactly as `applyCombatToSession` handles an ABSENT subdoc — full HP (a
  // genuinely fresh/undamaged hero). The live subdoc overlay (`applyCombatToRosterDoc`,
  // in `useCharacters`) then folds the real HP / conditions / death saves on top —
  // giving live updates on every HP tap.
  const session = applyCombatToSession(sanitizeSession({}), null, cache.hpMax);
  return { id, ...meta, character: cacheToRosterCharacter(cache), session };
}

/**
 * Fold a character's LIVE `combat/state` subdoc onto its roster projection — the
 * roster's half of the ONE hydration seam the cockpit/party already share
 * ({@link applyCombatToSession}), so a tile's current/temp HP + fallen-hero death-save
 * track can never drift from the open sheet. Reads the canonical subdoc, not a copy,
 * so there is nothing to keep in sync (golden rule 6).
 *
 *  - `combat === null` (subdoc ABSENT) or `undefined` (still loading): keep the doc's
 *    BASELINE session — the full-HP baseline `cacheToRosterDoc` already seeded (a
 *    genuinely fresh/undamaged hero).
 *  - a PRESENT subdoc: overlay its HP / conditions / death saves, clamped to the
 *    effective max (`character.hp.max`).
 *
 * Pure; the live per-character subscription lives one layer up in `useCharacters`.
 */
export function applyCombatToRosterDoc(
  doc: RosterCharacterDoc,
  combat: CombatState | null | undefined
): RosterCharacterDoc {
  if (!combat) return doc;
  return {
    ...doc,
    session: applyCombatToSession(doc.session, combat, doc.character.hp.max),
  };
}

/** The {@link RosterCharacter} half from a normalized {@link CharacterCache}. */
function cacheToRosterCharacter(cache: CharacterCache): RosterCharacter {
  return {
    projection: true,
    name: cache.name,
    race: cache.raceId,
    classes: cache.classes,
    ac: cache.ac,
    speed: cache.speed,
    hp: { max: cache.hpMax },
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
    shareId: doc.shareId,
    status: doc.status,
    character: cacheToRosterCharacter(cache),
    session: doc.session,
  };
}

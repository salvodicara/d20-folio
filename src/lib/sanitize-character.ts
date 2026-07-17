/**
 * Read-time character normalization — conform an untrusted boundary document (a
 * Firestore read / hand-edited JSON) to the in-memory `CharacterData` contract.
 *
 * R4 — `classes[]` is the SOLE source of truth for the class breakdown; `getClasses`
 * validates + normalizes the array (always non-empty). The v2→v3 single-class
 * migration is complete (every live doc carries `classes[]`), so there is no
 * legacy `class`/`classId`/`level` synthesis here — that one-way read shim was
 * removed once the migration ran (owner directive 2026-06-14, task #24 part 2).
 *
 * Lives in its own pure module (no Firebase imports) so it can be unit-tested in
 * environments without VITE_FIREBASE_API_KEY (CI). Pure: returns a normalized clone.
 */

// SRD-FREE imports only — this sanitizer runs in the always-eager persistence layer
// (firestore.ts), so it must not pull the class data or compute's SRD deps.
import { getClasses } from "@/lib/classes";
import { abilityModifier } from "@/lib/ability";

/**
 * Infer the initiative-bonus override from a legacy document where the old
 * `initiativeBonus` slot conflated computed value and user override. The
 * heuristic: if the stored value equals the bare DEX modifier (the only thing
 * character creation has ever written there), there was no override — otherwise
 * treat the stored value as a deliberate override.
 *
 * The legacy `initiativeBonus` field was DELETED from `CharacterData` (golden rule
 * 17 — no dead data); this is the lone sanctioned ONE-WAY read-normalization that
 * still recognizes it at the untrusted-input boundary (a Firestore read / hand-edited
 * JSON), folds it into `initiativeBonusOverride`, and NEVER re-emits it. It reads an
 * untyped `Record<string, unknown>`, so it needs no typed field.
 *
 * Returns `null` for "no override" (use the live `computeInitiative`), or the
 * integer override value.
 */
function migrateInitiativeBonus(raw: Record<string, unknown>): number | null {
  if ("initiativeBonusOverride" in raw) {
    const v = raw.initiativeBonusOverride;
    if (v === null || typeof v === "number") return v;
  }
  const stored = typeof raw.initiativeBonus === "number" ? raw.initiativeBonus : null;
  if (stored === null) return null;
  const scores = raw.abilityScores as Record<string, number> | undefined;
  const dex = typeof scores?.DEX === "number" ? scores.DEX : 10;
  const dexMod = abilityModifier(dex);
  return stored === dexMod ? null : stored;
}

export function sanitizeCharacter(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  // `name` is NOT defaulted here: non-nullability is enforced at the codec parse
  // (`validateCharacterData` rejects an empty/whitespace/non-string name) and the
  // branded `CharacterData.name` type. This SRD-free read-shim handles only the
  // legacy/structural fields below; a nameless doc is REJECTED upstream, never
  // tolerated with a placeholder (owner directive 2026-06-15).
  // `skills` must be an id→proficiency MAP; a fuzzed/legacy array or scalar would
  // poison the JoaT fill below and every skill consumer — coerce non-objects to {}.
  if (
    typeof next.skills !== "object" ||
    next.skills === null ||
    Array.isArray(next.skills)
  ) {
    next.skills = {};
  }
  // `classes[]` is the SOLE source of truth — normalize it (validate ids/levels,
  // clone entries, guarantee non-empty). The class-scoped picks ride ON each entry.
  next.classes = getClasses(next);

  // Initiative override: only set the structured field when missing, so explicit
  // nulls from new documents stay null and don't get re-inferred.
  if (!("initiativeBonusOverride" in raw)) {
    next.initiativeBonusOverride = migrateInitiativeBonus(raw);
  }
  // SUPERSEDED feat ids — ONE-WAY read normalization. `skilled-general` existed
  // only to work around the ASI feat picker excluding Origin feats; the picker
  // now offers Origin feats per 2024 RAW ("another feat for which you qualify"),
  // so the duplicate entry was DELETED (golden rule 10). A live doc that stored
  // the old id is conformed to the canonical `skilled` here (never written back).
  if (Array.isArray(next.features)) {
    next.features = next.features.map((f: unknown) =>
      typeof f === "object" &&
      f !== null &&
      "srdId" in f &&
      (f as { srdId: string }).srdId === "skilled-general"
        ? { ...(f as object), srdId: "skilled" }
        : f
    );
  }
  // Jack of All Trades is DERIVED, never stored (#57). The feature grants
  // half-proficiency in every otherwise-unproficient skill through
  // `evaluateGrants` → `mergeSkillProficiencies` at render — so stored `skills`
  // holds ONLY real proficiencies/expertise (the player's actual choices), never
  // a baked `halfProficiency`. ONE-WAY read normalization (rule 10): a live doc
  // that baked `halfProficiency` into all 18 skills (the old migration) is
  // conformed by STRIPPING those entries here — they are re-derived at render and
  // never written back, so no dual representation lingers. Real proficient /
  // expertise entries are untouched. The obsolete `jackOfAllTradesApplied` flag
  // is dropped (it was the old migration's idempotency marker).
  {
    const rawSkills =
      typeof next.skills === "object" && next.skills !== null
        ? (next.skills as Record<string, string>)
        : {};
    const skills: Record<string, string> = {};
    for (const [id, prof] of Object.entries(rawSkills)) {
      if (prof !== "halfProficiency") skills[id] = prof;
    }
    next.skills = skills;
    delete next.jackOfAllTradesApplied;
  }
  // Render-safety: the SRD-free roster reads `hp.max`, `speed`, and DERIVES the
  // class/level from `classes[]` via the SRD-free `classes.ts` helpers. A partial or
  // malformed document can omit `hp`/`speed`; conform them to finite defaults so
  // every consumer can read them without a per-surface guard.
  if (typeof next.speed !== "string") next.speed = "";
  if (!Number.isFinite(next.ac)) next.ac = 0;
  const rawHp = raw.hp as { max?: unknown } | null | undefined;
  next.hp = { max: typeof rawHp?.max === "number" ? rawHp.max : 0 };
  return next;
}

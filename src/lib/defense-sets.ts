/**
 * The set-override seam — one home for "what is this character actually
 * resistant / immune / vulnerable to, and what is it proficient with, right
 * now" (#68 build overrides + the PLAY-NO-EDIT session overlay).
 *
 * It lives in engine-core, not in a presenter: the cockpit rail RENDERS these
 * sets, the damage-intake math APPLIES them, and `combat-projection.ts`
 * projects them onto a table entity — and engine-core may not import
 * `lib/views` (`tests/unit/architecture-direction.guard.test.ts`). Pure: no
 * i18n, no React, no Firebase.
 */

// ─── #68 — set-valued defense & proficiency overrides ───────────────────────

/**
 * Apply a set-valued override map to a computed id set (Constitution #1,
 * override-first). The effective set = `(computed ∪ {keys set true}) \ {keys set
 * false}`, returned sorted + de-duplicated. An absent / empty `override` returns
 * the pure computed set unchanged. This is the single seam every defenses /
 * proficiency consumer (the cockpit rail display AND any combat damage math)
 * routes through, so a player's manual add/remove of a resistance, immunity,
 * vulnerability, condition-immunity or proficiency is honoured uniformly without
 * forking the grant engine. Pure (no Firebase) — safe for CI-pure unit tests.
 */
export function applySetOverride(
  computed: Iterable<string>,
  override: Record<string, boolean> | undefined
): string[] {
  const set = new Set<string>(computed);
  if (override) {
    for (const [id, on] of Object.entries(override)) {
      if (on) set.add(id);
      else set.delete(id);
    }
  }
  return [...set].sort();
}

// ─── PLAY-NO-EDIT — session defense overlay (one kind) ──────────────────────

/**
 * One defense kind's render/effective view after layering the SESSION overlay
 * (defenses gained in play — a potion, a spell, a curse) over the PERMANENT set
 * (grant-computed + the #68 build override map). The single seam for every
 * consumer of "what is this character resistant/immune/vulnerable to right
 * now": the rail renders `permanent` as sheet text and `session` as removable
 * chips; any combat damage math reads `effective`.
 */
export interface DefenseKindView {
  /** The build's set: `applySetOverride(grant-computed, build override map)`. */
  permanent: string[];
  /**
   * The session-added ids actually CONTRIBUTING something — stored entries that
   * duplicate a permanent defense are filtered out (they carry no information;
   * the add picker also refuses already-effective ids, so this only happens
   * when a later build change makes a session chip redundant).
   */
  session: string[];
  /** `permanent ∪ session` — sorted, de-duplicated. */
  effective: string[];
}

/**
 * Layer one kind's session defense list over its permanent set. Pure; both
 * inputs come straight from the stores (`aggregate.* + charData.*Overrides`,
 * `session.sessionDefenses?.[kind]`).
 */
export function deriveDefenseKind(
  computed: Iterable<string>,
  override: Record<string, boolean> | undefined,
  sessionAdds: readonly string[] | undefined
): DefenseKindView {
  const permanent = applySetOverride(computed, override);
  const permanentSet = new Set(permanent);
  const session = [...new Set(sessionAdds ?? [])]
    .filter((id) => !permanentSet.has(id))
    .sort();
  return { permanent, session, effective: [...permanent, ...session].sort() };
}

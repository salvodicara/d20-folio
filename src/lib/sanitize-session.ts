/**
 * Session sanitizer — pure, SRD-FREE.
 *
 * Defensively fills a `Partial<SessionState>` (from an import or an older
 * Firestore doc) with safe defaults so a missing field never propagates
 * `undefined` into HP/rest arithmetic (NaN HP) or silently drops a newer optional
 * field on save (the #81 class of bug).
 *
 * Lives in its own module — NOT `character-io.ts` — because the always-eager
 * persistence layer (`firestore.ts`) needs it, and `character-io` statically pulls
 * the SRD-resolving v2 codec (`character-codec`). Importing the sanitizer from here
 * keeps the ~250 KB-gzip SRD off the initial bundle (#59/#78). `character-io`
 * re-exports it so existing callers are unaffected.
 *
 * NOTE: a new optional `SessionState` field must be enumerated below too — the
 * rebuild is deliberate (not a `...session` spread) so unknown/legacy junk is
 * stripped before any Firestore write.
 */
import type { LogEntry, SessionState } from "@/types/character";
import type { CombatEvent, LogSlot } from "@/types/combat-log";

/** The four economy slots a log row's colour can follow. */
function asSlot(raw: unknown): LogSlot | undefined {
  return raw === "action" || raw === "bonus" || raw === "reaction" || raw === "free"
    ? raw
    : undefined;
}

/**
 * Normalize one action-/combat-log entry to the CURRENT events-as-data shape
 * (`{ event, ts, id }`) — a STRUCTURED {@link CombatEvent} the presenter localizes
 * at render. Two transitional read-normalizations live here (the bounded ONE-WAY
 * untrusted-input boundary, golden rule 10 — never written back as the old shape):
 *
 *  - A PRE-events entry (`{ text, type, slot? }` — or even older `{ msg, t }`) is
 *    converted to a `legacy` event whose frozen `text` renders verbatim, so an
 *    existing user's play history stays visible (in whatever language it was
 *    stored). The engine NEVER emits `legacy`; every new event is structured.
 *  - A current entry is validated (it must carry an object `event` with a string
 *    `kind`); a missing/short id is regenerated.
 *
 * Returns `null` for an unsalvageable entry so the caller drops it.
 */
export function normalizeLogEntry(raw: unknown): LogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const ts =
    typeof r.ts === "number" && Number.isFinite(r.ts)
      ? r.ts
      : typeof r.t === "number" && Number.isFinite(r.t)
        ? r.t
        : 0;
  const id = typeof r.id === "string" && r.id ? r.id : crypto.randomUUID();

  // CURRENT shape: a structured event with a string `kind`.
  if (typeof r.event === "object" && r.event !== null) {
    const ev = r.event as Record<string, unknown>;
    if (typeof ev.kind === "string") {
      // Boundary read-normalization (golden rule 10): a pre-LocText action-use /
      // reaction-use / rider-use event carried localized `actionName` / `riderName`
      // strings. Conform them to a `custom` {@link LocText} so the new LocText view
      // can't crash on a missing `action` / `rider`. SRD-free here, so it can't resolve
      // the proper id — it keeps the legacy label visible; the one-off migration resolves
      // matchable names to real id-refs.
      if (
        (ev.kind === "action-use" ||
          ev.kind === "reaction-use" ||
          ev.kind === "rider-use") &&
        ev.action === undefined &&
        typeof ev.actionName === "string"
      ) {
        ev.action = { custom: ev.actionName };
        delete ev.actionName;
      }
      if (
        ev.kind === "rider-use" &&
        ev.rider === undefined &&
        typeof ev.riderName === "string"
      ) {
        ev.rider = { custom: ev.riderName };
        delete ev.riderName;
      }
      return { event: ev as unknown as CombatEvent, ts, id };
    }
    return null;
  }

  // LEGACY shape: a frozen localized line → a `legacy` event (rendered verbatim).
  const text =
    typeof r.text === "string" ? r.text : typeof r.msg === "string" ? r.msg : "";
  if (!text) return null;
  const legacy: CombatEvent = {
    kind: "legacy",
    text,
    ...(typeof r.type === "string" ? { legacyType: r.type } : {}),
    ...(asSlot(r.slot) ? { slot: asSlot(r.slot) } : {}),
  };
  return { event: legacy, ts, id };
}

export function sanitizeSession(session: Partial<SessionState>): SessionState {
  return {
    hp: {
      current: session.hp?.current ?? 0,
      temp: session.hp?.temp ?? 0,
      // A legacy `hp.aidBonus` is SUPERSEDED by the Aid `while-active` hp-flat grant —
      // one-way read-normalization (golden rule 10): silently dropped, never re-emitted.
    },
    hitDice: { used: session.hitDice?.used ?? 0 },
    trackers: session.trackers ?? {},
    spellSlots: session.spellSlots ?? {},
    currency: {
      pp: session.currency?.pp ?? 0,
      gp: session.currency?.gp ?? 0,
      ep: session.currency?.ep ?? 0,
      sp: session.currency?.sp ?? 0,
      cp: session.currency?.cp ?? 0,
    },
    concentration: session.concentration ?? "",
    initiative: session.initiative ?? "",
    conditions: session.conditions ?? [],
    deathSucc: session.deathSucc ?? 0,
    deathFail: session.deathFail ?? 0,
    inspiration: session.inspiration ?? false,
    exhaustion: session.exhaustion ?? 0,
    pinnedActions: session.pinnedActions ?? [],
    unpinnedActions: session.unpinnedActions ?? [],
    notes: session.notes ?? "",
    logEntries: Array.isArray(session.logEntries)
      ? session.logEntries.map(normalizeLogEntry).filter((e): e is LogEntry => e !== null)
      : [],
    // Preserve every NEWER OPTIONAL session field explicitly (#81). The previous
    // field-by-field rebuild silently DROPPED these, so a reload reset Rage/
    // Bladesong toggles, lineage/Circle choices, companion HP, and manifested/
    // pact-weapon overrides. Enumerated (not a blanket `...session` spread) so the
    // sanitizer still strips unknown/legacy junk — a new optional field added to
    // SessionState must be added here too. `undefined` is dropped by
    // `stripUndefined` before any Firestore write.
    activeFeatures: session.activeFeatures,
    // FRONTIER-S3 — the combat-round countdown for `maxRounds` while-active
    // states (Rage = 100 rounds). Enumerated so it round-trips a reload mid-Rage;
    // absent on every pre-existing doc (back-compat).
    effectTimers: session.effectTimers,
    grantBundleChoices: session.grantBundleChoices,
    companionHp: session.companionHp,
    manifestedWeaponOverrides: session.manifestedWeaponOverrides,
    pactWeaponConfig: session.pactWeaponConfig,
    pactWeaponRiderTypes: session.pactWeaponRiderTypes,
    // S7 — the active Polymorph SELF-transformation. Enumerated so it round-trips a
    // reload mid-form; absent on every non-polymorph doc (back-compat, additive-only).
    polymorphForm: session.polymorphForm,
    // D37 — the HELD Bardic Inspiration die (a die an ally Bard gave this
    // character). Was added to SessionState but NOT here, so the rebuild dropped
    // it on every save → the picked die reset on the next server echo (the #81
    // class of bug). Enumerated so it round-trips.
    bardicInspirationDie: session.bardicInspirationDie,
    // PLAY-NO-EDIT — the session defense overlay (resistances/immunities/
    // vulnerabilities/condition immunities gained in play). Enumerated so it
    // round-trips a reload instead of being dropped by this rebuild (#81).
    sessionDefenses: session.sessionDefenses,
  };
}

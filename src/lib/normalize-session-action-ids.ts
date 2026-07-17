/**
 * Read-time, ONE-WAY normalization of persisted combat-action ids — R6+R3 SLICE
 * 7d (Part 4, normalization "b").
 *
 * SLICE 6 made a weapon's combat-action id key off the weapon's STABLE ENGLISH
 * name (`weapon-<slug(srdEn name)>`) so pinned/spent action state is locale-
 * INDEPENDENT (golden rule 7). An IT user who pinned a weapon BEFORE that change
 * has the action id under the OLD italian-derived slug (`weapon-spada-lunga`
 * instead of `weapon-longsword`). This rewrites those legacy ids to the
 * EN-stable id at read time, so their pinned/unpinned state survives.
 *
 * ONE-WAY: a legacy localized id is rewritten to the canonical EN id; the
 * canonical id is NEVER rewritten back. SRD-aware (needs the equipment catalogue
 * to map a weapon's IT name → its EN name), so it lives in the SRD-coupled read
 * path (alongside `rehydrateCharacter`), NOT the SRD-free `sanitizeSession`.
 *
 * Normalization "a" (race-trait tracker ids `race:<raceId>:<trait.id>`) is a
 * NO-OP here — those ids are stable id-form (no embedded display name); the
 * legacy-EN-name→id conform of a pre-reshape doc is the codec's job
 * (`conformRaceTraitSessionIds`). This module deliberately touches ONLY the
 * weapon-action ids.
 */
import type { CharacterData, SessionState } from "@/types/character";
import { srdEn, srdAllLocaleValues } from "@/i18n/srd-en";

/** The action-id slug for a weapon name (mirrors smart-tracker's construction). */
function weaponActionId(name: string): string {
  return `weapon-${name.toLowerCase().replace(/\s+/g, "-")}`;
}

/**
 * Build the `legacyId → canonicalId` map for every SRD weapon the character
 * carries: each weapon's localized-name-derived id (EN + IT) maps to its
 * EN-stable id. Custom weapons are skipped (their id already keys off locale-free
 * user text). Identity entries (canonical → canonical) are omitted.
 */
function buildWeaponIdRemap(character: CharacterData): Map<string, string> {
  const remap = new Map<string, string>();
  for (const w of character.weapons) {
    if ("custom" in w) continue; // custom weapon — already locale-free
    const en = srdEn("equipment", w.srdId, "name");
    if (!en) continue;
    const canonical = weaponActionId(en);
    // `srdAllLocaleValues` returns the name in EVERY language (locale-FREE — no
    // active-locale read), so the legacy id derived from any language maps here.
    for (const value of srdAllLocaleValues("equipment", w.srdId, "name")) {
      const legacy = weaponActionId(value);
      if (legacy !== canonical) remap.set(legacy, canonical);
    }
  }
  return remap;
}

/** Rewrite a single id through the remap (identity when absent). */
function remapId(id: string, remap: Map<string, string>): string {
  return remap.get(id) ?? id;
}

/**
 * Normalize the persisted weapon-action ids in a session to their EN-stable form,
 * given the character that owns it. Pure — returns a new session only when a
 * rewrite is needed (referential identity preserved otherwise). De-dupes the
 * pinned/unpinned arrays in case a legacy AND canonical id were both stored.
 */
export function normalizeSessionActionIds(
  character: CharacterData,
  session: SessionState
): SessionState {
  const remap = buildWeaponIdRemap(character);
  if (remap.size === 0) return session;

  const dedupe = (ids: readonly string[]): string[] => [
    ...new Set(ids.map((id) => remapId(id, remap))),
  ];

  const pinnedActions = dedupe(session.pinnedActions);
  const unpinnedActions = session.unpinnedActions
    ? dedupe(session.unpinnedActions)
    : session.unpinnedActions;

  // Only return a new object when something actually changed.
  const pinnedChanged =
    pinnedActions.length !== session.pinnedActions.length ||
    pinnedActions.some((id, i) => id !== session.pinnedActions[i]);
  const unpinnedChanged =
    unpinnedActions != null &&
    session.unpinnedActions != null &&
    (unpinnedActions.length !== session.unpinnedActions.length ||
      unpinnedActions.some((id, i) => id !== session.unpinnedActions?.[i]));

  if (!pinnedChanged && !unpinnedChanged) return session;
  return { ...session, pinnedActions, ...(unpinnedActions ? { unpinnedActions } : {}) };
}

/**
 * Defenses gained in play: a resistance, immunity, vulnerability or condition
 * immunity from a potion, a spell or a curse (`SessionState.sessionDefenses`). They
 * layer over the build's permanent defenses without touching them, the play-time
 * mirror of a condition. Pure: the sheet events and the play log replay these.
 */
import type { CharacterDoc, SessionDefenseKind, SessionState } from "@/types/character";

/** The session with `id` added to its `kind` defenses, or null when already there. */
export function addSessionDefense(
  doc: CharacterDoc,
  kind: SessionDefenseKind,
  id: string
): SessionState | null {
  const current = doc.session.sessionDefenses?.[kind] ?? [];
  if (current.includes(id)) return null;
  return {
    ...doc.session,
    sessionDefenses: { ...doc.session.sessionDefenses, [kind]: [...current, id] },
  };
}

/** The session with `id` gone from its `kind` defenses, or null when it wasn't there. */
export function removeSessionDefense(
  doc: CharacterDoc,
  kind: SessionDefenseKind,
  id: string
): SessionState | null {
  const current = doc.session.sessionDefenses?.[kind] ?? [];
  if (!current.includes(id)) return null;
  return {
    ...doc.session,
    sessionDefenses: {
      ...doc.session.sessionDefenses,
      [kind]: current.filter((d) => d !== id),
    },
  };
}

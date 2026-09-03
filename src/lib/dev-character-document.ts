/** Character parent-document projection for the local dev replica. */
import { readDevDocument } from "@/lib/dev-document-store";
import { sanitizeSession } from "@/lib/sanitize-session";
import type { CharacterDoc, SessionState } from "@/types/character";

export const DEV_CHARACTER_COLLECTION = "character-parent";

export type DevCharacterParent = Omit<CharacterDoc, "session"> & {
  session: Partial<SessionState>;
};

export function devCharacterDocumentId(uid: string, characterId: string): string {
  return `${uid}/${characterId}`;
}

/** Mirror production: the play session never lives on the character parent document. */
export function projectDevCharacterParent(doc: CharacterDoc): DevCharacterParent {
  return { ...doc, updatedAt: new Date(), session: {} };
}

/** Overlay parent data onto a seed/current doc while preserving its live combat trio. */
export function mergeDevCharacterParent(
  base: CharacterDoc,
  parent: DevCharacterParent
): CharacterDoc {
  if (Object.keys(parent.session).length > 0) {
    throw new TypeError("Invalid character document: parent-state-not-empty");
  }
  return { ...base, ...parent, id: base.id, session: sanitizeSession(parent.session) };
}

export function readDevCharacter(uid: string, seed: CharacterDoc): CharacterDoc {
  const parent = readDevDocument<DevCharacterParent>(
    DEV_CHARACTER_COLLECTION,
    devCharacterDocumentId(uid, seed.id)
  );
  return parent ? mergeDevCharacterParent(seed, parent) : seed;
}

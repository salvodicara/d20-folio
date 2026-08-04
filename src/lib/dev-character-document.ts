/** Character parent-document projection for the local dev replica. */
import { COMBAT_SESSION_KEYS } from "@/lib/combat-state";
import { readDevDocument } from "@/lib/dev-document-store";
import type { CharacterDoc, SessionState } from "@/types/character";

export const DEV_CHARACTER_COLLECTION = "character-parent";

export type DevCharacterParent = Omit<CharacterDoc, "session"> & {
  session: Partial<SessionState>;
};

export function devCharacterDocumentId(uid: string, characterId: string): string {
  return `${uid}/${characterId}`;
}

/** Mirror production: combat fields never live on the character parent document. */
export function projectDevCharacterParent(doc: CharacterDoc): DevCharacterParent {
  const session = Object.fromEntries(
    Object.entries(doc.session).filter(
      ([key]) => !(COMBAT_SESSION_KEYS as ReadonlyArray<string>).includes(key)
    )
  ) as Partial<SessionState>;
  return { ...doc, updatedAt: new Date(), session };
}

/** Overlay parent data onto a seed/current doc while preserving its live combat trio. */
export function mergeDevCharacterParent(
  base: CharacterDoc,
  parent: DevCharacterParent
): CharacterDoc {
  return {
    ...base,
    ...parent,
    id: base.id,
    session: { ...base.session, ...parent.session },
  };
}

export function readDevCharacter(uid: string, seed: CharacterDoc): CharacterDoc {
  const parent = readDevDocument<DevCharacterParent>(
    DEV_CHARACTER_COLLECTION,
    devCharacterDocumentId(uid, seed.id)
  );
  return parent ? mergeDevCharacterParent(seed, parent) : seed;
}

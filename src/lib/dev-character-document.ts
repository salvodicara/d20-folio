/** Character parent-document projection for the local dev replica. */
import { COMBAT_SESSION_KEYS } from "@/lib/combat-state";
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

/** Mirror production: combat fields never live on the character parent document. */
export function projectDevCharacterParent(doc: CharacterDoc): DevCharacterParent {
  assertPlayStateVersion(doc);
  const session =
    doc.playStateVersion === 1
      ? {}
      : (Object.fromEntries(
          Object.entries(doc.session).filter(
            ([key]) => !(COMBAT_SESSION_KEYS as ReadonlyArray<string>).includes(key)
          )
        ) as Partial<SessionState>);
  return { ...doc, updatedAt: new Date(), session };
}

/** Overlay parent data onto a seed/current doc while preserving its live combat trio. */
export function mergeDevCharacterParent(
  base: CharacterDoc,
  parent: DevCharacterParent
): CharacterDoc {
  assertPlayStateVersion(parent);
  if (parent.playStateVersion === 1 && Object.keys(parent.session).length > 0) {
    throw new TypeError("Marked character parent contains mutable session state");
  }
  return {
    ...base,
    ...parent,
    id: base.id,
    session:
      parent.playStateVersion === 1
        ? sanitizeSession(parent.session)
        : { ...base.session, ...parent.session },
  };
}

function assertPlayStateVersion(value: object): void {
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "playStateVersion") && record.playStateVersion !== 1) {
    throw new TypeError("Invalid character play-state ownership marker");
  }
}

export function readDevCharacter(uid: string, seed: CharacterDoc): CharacterDoc {
  const parent = readDevDocument<DevCharacterParent>(
    DEV_CHARACTER_COLLECTION,
    devCharacterDocumentId(uid, seed.id)
  );
  return parent ? mergeDevCharacterParent(seed, parent) : seed;
}

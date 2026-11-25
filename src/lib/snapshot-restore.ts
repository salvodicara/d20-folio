/**
 * Restore a snapshot, the one way both sheets do it (#1363): the current sheet is
 * saved first as a «before restore» snapshot, so a restore is never a one-way loss.
 * No backup, no restore: a failed save stops here and the sheet stays as it is.
 * The snapshot's data is already in hand, so the backup's pruning of the oldest
 * snapshot can never take the one being restored away from this call.
 */
import { restoreCharacterSnapshot, saveCharacterSnapshot } from "@/lib/firestore";
import type { CharacterData, CharacterDoc, SessionState } from "@/types/character";

export async function restoreWithBackup(
  uid: string,
  doc: CharacterDoc,
  snapshot: { character: CharacterData; session: SessionState }
): Promise<void> {
  await saveCharacterSnapshot(uid, doc.id, {
    character: doc.character,
    session: doc.session,
    reason: "pre-restore",
  });
  await restoreCharacterSnapshot(
    uid,
    doc.id,
    { character: snapshot.character, session: snapshot.session },
    // Compare-and-set base: the generation of the document on screen.
    doc.revision,
    doc
  );
}

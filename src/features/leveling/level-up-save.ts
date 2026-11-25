/**
 * Saving a level-up without waiting for the server (#1276), shared by both wizards.
 *
 * Offline, a Firestore write promise settles only when the server answers, so a wizard
 * that awaited the snapshot and the whole-sheet batch spun forever, and a closed app lost
 * the level-up. Here the only wait is the local codec load; then, in one synchronous
 * turn, the PRE-level snapshot is handed to the SDK, the level is applied on screen, and
 * the whole-sheet write goes through the open sheet's ordered save queue (next
 * generation at send, so an edit still unacknowledged before it is never refused on
 * reconnect). The caller gets `written`, which settles when the server answers.
 *
 * A refusal in this session puts back the play fields the level-up changed (the play
 * writer sends them outside the batch); the parent and the rest are the server's.
 *
 * Known limit: a refusal that arrives in a LATER session (the app closed, the queue
 * replayed at the next start) has no one to report it; the server copy wins.
 */
import { preloadParentWrite } from "@/lib/parent-write-modules";
import { queueCharacterSnapshot } from "@/lib/firestore";
import { diagnosticsLog } from "@/lib/diagnostics";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { sessionToCombatState } from "@/lib/combat-state";
import type { CharacterDoc } from "@/types/character";

export interface QueuedLevelUp {
  /** Settles when the server accepts (resolves) or refuses (rejects) the level-up. */
  written: Promise<void>;
}

/** Apply `after` on screen and queue its writes; throws (applying nothing) when the
 *  sheet is not open or the codec cannot load. */
export async function applyLevelUp(input: {
  uid: string;
  before: CharacterDoc;
  after: CharacterDoc;
}): Promise<QueuedLevelUp> {
  const { uid, before, after } = input;
  const store = useCharacterStore.getState();
  const writer = store.wholeSheetWriter;
  if (!writer) throw new Error("The sheet is not open");
  const modules = await preloadParentWrite();

  // One synchronous turn from here. The snapshot first: no level-up without it.
  const snapshot = queueCharacterSnapshot(uid, before.id, modules, {
    character: before.character,
    session: before.session,
    reason: "level-up",
  });
  void snapshot.written.catch((err: unknown) => {
    // The level-up itself may still land: a lost snapshot is logged, not announced.
    diagnosticsLog("warn", "character.level-up-snapshot-rejected", {
      message: err instanceof Error ? err.message : String(err),
    });
  });
  useCharacterStore.getState().setCharacter(after);
  // A level rewrites the whole sheet: an older undo could restore a sheet that no longer holds.
  useUndoStore.getState().clear();
  // After the play writer's own write of `after` (queued as a microtask by
  // `setCharacter`), so the whole-sheet batch, which resets the fight's ledgers, lands
  // last, as it did when the wizard awaited it.
  const written = new Promise<void>((resolve, reject) => {
    queueMicrotask(() => {
      writer({ character: after.character, session: after.session }, before).then(
        resolve,
        reject
      );
    });
  });
  // Refused (a conflict, a rule): the batch never landed, but the play writer already
  // sent the level-up's play change (its HP, dice, slots). Put back exactly those fields
  // (a patch from the level-up's play state to the old one), so the sheet is never left
  // half levelled. The parent stays the server's; the listener shows it.
  written.catch(() => {
    void import("@/lib/combat-state-io")
      .then(({ writeCombatState }) =>
        writeCombatState(
          uid,
          before.id,
          sessionToCombatState(before.session),
          sessionToCombatState(after.session)
        )
      )
      .catch((err: unknown) =>
        diagnosticsLog("warn", "character.level-up-play-revert-failed", {
          message: err instanceof Error ? err.message : String(err),
        })
      );
  });
  return { written };
}

/** The level-up's undo: `before` on screen, and its whole-sheet write in queue order. */
export function undoLevelUp(before: CharacterDoc): Promise<void> {
  const store = useCharacterStore.getState();
  const writer = store.wholeSheetWriter;
  if (!writer) return Promise.reject(new Error("The sheet is not open"));
  store.setCharacter(before);
  // After the play writer's write of `before`, as for the level-up itself.
  return new Promise<void>((resolve, reject) => {
    queueMicrotask(() => {
      writer({ character: before.character, session: before.session }, before).then(
        resolve,
        reject
      );
    });
  });
}

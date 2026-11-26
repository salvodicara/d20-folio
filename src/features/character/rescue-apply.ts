/**
 * Apply / Discard a rescue copy (#1320): the unsaved edits a tab kept on this device
 * when the server moved to a newer shape.
 *
 * The copy is stored in the shape the OLD client wrote. ADR 0009 deletes compatibility
 * readers after each release, so the new client cannot read an old shape by itself:
 * every shape step (M3–M5) registers ONE pure upgrade function here — the same one its
 * migration script runs — and Apply runs the copy through each step it is behind,
 * then through the normal codec. A copy behind with no step to bring it forward is
 * never guessed at: it cannot be applied.
 *
 * Apply mirrors the level-up ceremony: snapshot the current sheet first (so Apply can
 * be undone from the history), show the result, drop the undo stack, and write once
 * through the whole-sheet writer (revision + the shared sheet's public projection).
 * A whole-sheet copy (unsaved play edits too) replaces BOTH the build and the play
 * state with what the player had on this device; a build-only copy sets just the build
 * and keeps the server's play state (newer than the copy's). The snapshot holds what
 * the server had either way.
 */
import { replaceCharacterState, saveCharacterSnapshot } from "@/lib/firestore";
import {
  dropRescueCopy,
  dropUnackedPlay,
  dropUnackedSave,
  type RescueCopy,
} from "@/lib/local-draft";
import { CHARACTER_SCHEMA, PLAY_STATE_VERSION } from "@/lib/shape-numbers";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";

export interface RescueEnvelope {
  build: Record<string, unknown>;
  state: Record<string, unknown>;
}

/** One shape step's upgrade: from the shape numbered `from` to the next one. */
export interface ShapeStep {
  domain: "character" | "play";
  from: number;
  upgrade: (envelope: RescueEnvelope) => RescueEnvelope;
}

/** The registered shape steps. Empty until the first one (M3) ships with its upgrade. */
export const SHAPE_STEPS: readonly ShapeStep[] = [];

/** The copy in this client's shape, or null when a step to get there is missing. */
export function upgradeRescueCopy(
  copy: RescueCopy,
  steps: readonly ShapeStep[] = SHAPE_STEPS
): RescueEnvelope | null {
  let envelope: RescueEnvelope = { build: copy.build, state: copy.state };
  const climb = (domain: ShapeStep["domain"], from: number, to: number): boolean => {
    for (let at = from; at < to; at++) {
      const step = steps.find((s) => s.domain === domain && s.from === at);
      if (!step) return false;
      envelope = step.upgrade(envelope);
    }
    return true;
  };
  if (copy.schema > CHARACTER_SCHEMA || copy.playVersion > PLAY_STATE_VERSION)
    return null;
  if (!climb("character", copy.schema, CHARACTER_SCHEMA)) return null;
  if (!climb("play", copy.playVersion, PLAY_STATE_VERSION)) return null;
  return envelope;
}

export type ApplyOutcome = "applied" | "unreadable";

/** How long Apply waits for the snapshot's acknowledgement before going on. */
const SNAPSHOT_WAIT_MS = 2_000;

export async function applyRescueCopy(
  uid: string,
  current: CharacterDoc,
  copy: RescueCopy
): Promise<ApplyOutcome> {
  const envelope = upgradeRescueCopy(copy);
  if (!envelope) return "unreadable";
  const { parseCharacterEnvelope } = await import("@/lib/character-codec");
  const parsed = parseCharacterEnvelope(envelope.build, envelope.state);
  if (!parsed.ok) return "unreadable";
  // Snapshot first, so Apply can be undone. Offline, a write settles only when the
  // server answers, so wait for its acknowledgement at most a moment: by then it is in
  // Firestore's ordered queue, ahead of the sheet's own write.
  const snapshot = saveCharacterSnapshot(uid, current.id, {
    character: current.character,
    session: current.session,
    reason: "rescue",
  });
  snapshot.catch(() => undefined);
  await Promise.race([
    snapshot,
    new Promise((resolve) => setTimeout(resolve, SNAPSHOT_WAIT_MS)),
  ]);
  if (copy.part === "build") {
    // Only the build was unsaved: the server's play state is the newer one. The kept
    // build goes out through the ordinary parent save (the sheet hook sends it).
    useCharacterStore
      .getState()
      .setCharacter({ ...current, character: parsed.character });
    useUndoStore.getState().clear();
    dropRescueCopy(uid, current.id);
    dropUnackedSave(uid, current.id);
    dropUnackedPlay(uid, current.id);
    return "applied";
  }
  const after: CharacterDoc = {
    ...current,
    character: parsed.character,
    session: parsed.session,
  };
  useCharacterStore.getState().setCharacter(after);
  useUndoStore.getState().clear();
  // Queued, not awaited: offline it lands when the device is back (the save badge
  // says so), and the snapshot above is ahead of it in the queue. With the sheet open
  // it goes through the sheet's ordered queue (#1276): the next generation at send,
  // after the play writer's own write of `after`, and traced until acknowledged.
  const writer = useCharacterStore.getState().wholeSheetWriter;
  if (writer) {
    queueMicrotask(() => {
      writer({ character: after.character, session: after.session }, current).catch(
        () => undefined
      );
    });
  } else {
    replaceCharacterState(
      uid,
      current.id,
      after.character,
      after.session,
      current.revision,
      current
    ).catch(() => undefined);
  }
  dropRescueCopy(uid, current.id);
  dropUnackedSave(uid, current.id);
  dropUnackedPlay(uid, current.id);
  return "applied";
}

export function discardRescueCopy(uid: string, characterId: string): void {
  dropRescueCopy(uid, characterId);
  // The edit's trace too: a later gate must not bring a discarded edit back.
  dropUnackedSave(uid, characterId);
  dropUnackedPlay(uid, characterId);
}

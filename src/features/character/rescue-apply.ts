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
 * It replaces BOTH the build and the play state with what the player had on this
 * device; the snapshot holds what the server had.
 */
import { replaceCharacterState, saveCharacterSnapshot } from "@/lib/firestore";
import { dropRescueCopy, type RescueCopy } from "@/lib/local-draft";
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
  await saveCharacterSnapshot(uid, current.id, {
    character: current.character,
    session: current.session,
    reason: "rescue",
  });
  const after: CharacterDoc = {
    ...current,
    character: parsed.character,
    session: parsed.session,
  };
  useCharacterStore.getState().setCharacter(after);
  useUndoStore.getState().clear();
  await replaceCharacterState(
    uid,
    current.id,
    after.character,
    after.session,
    current.revision,
    current
  );
  dropRescueCopy(uid, current.id);
  return "applied";
}

export function discardRescueCopy(uid: string, characterId: string): void {
  dropRescueCopy(uid, characterId);
}

/**
 * A level-up's line in the sheet's log («Sale al livello 10 (Bardo)»), persisted with
 * the play state. The session recorder forwards it to the attached campaign's open
 * session; outside a campaign it stays the character's own line, as a solo fight's
 * does. Returns the undo that takes the line back (walkthrough 2026-11-12, M2).
 */
import { useCharacterStore } from "@/stores/characterStore";

export function recordLevelUp(line: {
  from: number;
  to: number;
  classId: string;
}): () => void {
  const store = useCharacterStore.getState();
  const id = store.logEvent({ kind: "level-up", ...line });
  store.persistPlayState();
  return () => {
    const live = useCharacterStore.getState();
    live.removeLogEntry(id);
    live.persistPlayState();
  };
}

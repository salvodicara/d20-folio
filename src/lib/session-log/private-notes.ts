/**
 * A note the author keeps to themself (owner answer 2026-10-24: visible ONLY to its
 * author, not the DM). It is never a line of the campaign's session log, which the
 * whole table reads; it lives in the author's own owner-only store
 * (`users/{uid}/characters/{charId}/privateNotes/{noteId}`, firestore.rules), with the
 * same marks as a shared note and the fight and round it was written in. Only the
 * author's own Diario shows it, among the shared notes by time.
 */
import { parseNote, type NoteLine } from "./notes";
import { NOTE_MAX } from "./encounter-feed";

/** One private note as stored. */
export interface PrivateNote {
  id: string;
  text: string;
  /** When it was written (the author's clock). */
  at: number;
  /** The fight and round it was written in; null outside a fight. */
  encounterId: string | null;
  round: number | null;
}

/** The note to store, trimmed and capped like a shared one; null when blank. */
export function privateNoteDraft(
  text: string,
  at: number,
  where: { encounterId: string; round: number } | null
): Omit<PrivateNote, "id"> | null {
  const trimmed = text.trim().slice(0, NOTE_MAX);
  if (trimmed === "") return null;
  return {
    text: trimmed,
    at,
    encounterId: where?.encounterId ?? null,
    round: where?.round ?? null,
  };
}

export interface PrivateNoteLine extends NoteLine {
  private: true;
}

/** The author's private notes as Diario lines, by time. */
export function privateNoteLines(
  authorUid: string,
  notes: readonly PrivateNote[]
): PrivateNoteLine[] {
  return [...notes]
    .sort((a, b) => a.at - b.at)
    .map((note) => ({
      id: note.id,
      text: note.text,
      by: authorUid,
      at: note.at,
      encounterId: note.encounterId,
      round: note.round,
      corrected: false,
      private: true,
      ...parseNote(note.text),
    }));
}

/** The author's Diario: the shared notes in the story's order, with their own
 *  private notes placed among them by time. */
export function authorDiarioNotes(
  shared: readonly NoteLine[],
  mine: readonly PrivateNoteLine[]
): (NoteLine | PrivateNoteLine)[] {
  if (mine.length === 0) return [...shared];
  const out: (NoteLine | PrivateNoteLine)[] = [];
  let next = 0;
  for (const line of shared) {
    while (next < mine.length && (mine[next]?.at ?? Infinity) < line.at) {
      const own = mine[next++];
      if (own) out.push(own);
    }
    out.push(line);
  }
  return [...out, ...mine.slice(next)];
}

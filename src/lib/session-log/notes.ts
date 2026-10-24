/**
 * Notes written during play (owner direction 2026-10-23, row 11). A note is a `note`
 * event in the session log, so it lands where the server receives it, between the
 * actions of its round, and it is corrected, hidden or moved like any line. Its marks
 * are read from its text, never stored: `@who` names a creature, `#where` a place, and
 * any word starting with `!` marks the note important. So a corrected note always reads
 * its own marks, and an older reader sees the same text.
 */
import type { SessionEntry } from "./fold";
import type { CombatantId } from "./types";

export interface NoteMarks {
  /** The `@` names, each once (first spelling kept), in the order written. */
  mentions: string[];
  /** The `#` places, likewise. */
  places: string[];
  important: boolean;
}

/** A mark starts a word: `@` or `#`, then letters or digits, with `-` / `_` inside. */
const MARK = /(?:^|\s)([@#])([\p{L}\p{N}](?:[\p{L}\p{N}_-]*[\p{L}\p{N}])?)/gu;
/** Any word starting with `!` ("!important", "!!", "!urgent"). */
const IMPORTANT = /(?:^|\s)!/u;

const fold = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function once(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = fold(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function parseNote(text: string): NoteMarks {
  const mentions: string[] = [];
  const places: string[] = [];
  for (const [, sigil, word] of text.matchAll(MARK)) {
    if (word) (sigil === "@" ? mentions : places).push(word);
  }
  return {
    mentions: once(mentions),
    places: once(places),
    important: IMPORTANT.test(text),
  };
}

/**
 * Who each `@` names among the table's creatures: a name, or its first word, matched
 * without case or accents ("@anais" is "Anaïs Vel"). A name no one has keeps `id: null`.
 */
export function resolveMentions(
  mentions: readonly string[],
  creatures: readonly { id: CombatantId; name: string }[]
): { mention: string; id: CombatantId | null }[] {
  return mentions.map((mention) => {
    const wanted = fold(mention);
    const found = creatures.find((creature) => {
      const name = fold(creature.name);
      return name === wanted || name.split(/\s+/)[0] === wanted;
    });
    return { mention, id: found?.id ?? null };
  });
}

/** One note as the Diario shows it: its text and marks, who wrote it, and when. */
export interface NoteLine extends NoteMarks {
  id: string;
  text: string;
  /** The uid of the device's user who wrote it. */
  by: string;
  /** The character it is signed with (a player's note); absent for the DM's. */
  actor?: CombatantId;
  /** When it was written (the writing device's clock, for display). */
  at: number;
  /** The fight and round it was written in; null outside a fight. */
  encounterId: string | null;
  round: number | null;
  corrected: boolean;
}

/** The notes of a folded session, in the story's order. */
export function noteLines(entries: readonly SessionEntry[]): NoteLine[] {
  return entries.flatMap((entry) => {
    const { event } = entry;
    if (event.kind !== "note") return [];
    return [
      {
        id: entry.id,
        text: event.text,
        by: entry.by,
        ...(event.actor ? { actor: event.actor } : {}),
        at: entry.at,
        encounterId: entry.encounterId ?? null,
        round: entry.round ?? null,
        corrected: entry.corrected,
        ...parseNote(event.text),
      },
    ];
  });
}

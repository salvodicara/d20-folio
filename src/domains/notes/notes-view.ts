/**
 * The campaign's Note tab: the table's shared notes, important ones first then the
 * freshest. Each is marked by what it is about: «!» important (pinned), else «@» a
 * person or «#» a place from the first tag it carries. Filters: important, people,
 * places, only mine; the search covers title and text, ignoring case and accents. A
 * player never sees a note the DM keeps hidden (the server already withholds it; this
 * is the second guard).
 */
import type { SharedNote } from "@/types/campaign";

export type NoteFilter = "all" | "important" | "people" | "places" | "mine";
export type NoteKind = "important" | "person" | "place" | "note";

export interface NoteRow extends SharedNote {
  kind: NoteKind;
  /** Every `@person` and `#place` the note carries, in reading order, once each. */
  tags: string[];
}

const TAG = /[@#][\p{L}\p{N}][\p{L}\p{N}_-]*/gu;
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

export function notesView(
  notes: readonly SharedNote[],
  { filter, query }: { filter: NoteFilter; query: string },
  viewer: { uid: string; isDm: boolean }
): NoteRow[] {
  const q = fold(query.trim());
  return notes
    .filter((n) => viewer.isDm || !n.dmOnly)
    .map((n) => {
      const tags = [...new Set(`${n.title} ${n.content}`.match(TAG) ?? [])];
      const first = tags[0]?.[0];
      const kind: NoteKind = n.pinned
        ? "important"
        : first === "@"
          ? "person"
          : first === "#"
            ? "place"
            : "note";
      return { ...n, kind, tags };
    })
    .filter((n) => {
      if (filter === "important" && !n.pinned) return false;
      if (filter === "people" && !n.tags.some((t) => t.startsWith("@"))) return false;
      if (filter === "places" && !n.tags.some((t) => t.startsWith("#"))) return false;
      if (filter === "mine" && n.createdBy !== viewer.uid) return false;
      return !q || fold(`${n.title} ${n.content}`).includes(q);
    })
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
    );
}

/**
 * Chronicle book-reader chapter split (D27) — kept in its own module so the
 * Chronicle component file only exports components (react-refresh friendly).
 */

export interface Chapter {
  title: string | null;
  body: string;
  /**
   * Char offset of the chapter's start (its heading line, or 0 for the untitled
   * prologue) in the ORIGINAL markdown. Lets the editor drop the cursor where the
   * reader was: click Edit on chapter N and you continue writing in chapter N.
   */
  start: number;
}

/**
 * Split a chronicle's markdown into chapters at top-level (`#`/`##`) headings, so a
 * long log reads as a navigable book instead of one ever-growing wall. Text before
 * the first heading is an untitled prologue chapter. Always returns ≥1 chapter.
 */
export function splitChapters(text: string): Chapter[] {
  const chapters: Chapter[] = [];
  let title: string | null = null;
  let body: string[] = [];
  let chapterStart = 0; // offset where the chapter currently being built began
  let cursor = 0; // running char offset as we walk lines
  const flush = () => {
    if (title !== null || body.some((l) => l.trim())) {
      chapters.push({ title, body: body.join("\n").trim(), start: chapterStart });
    }
  };
  for (const line of text.split("\n")) {
    const m = /^#{1,2}\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      title = m[1] ?? null;
      body = [];
      chapterStart = cursor; // this heading's offset starts the new chapter
    } else {
      body.push(line);
    }
    cursor += line.length + 1; // +1 for the "\n" that join used
  }
  flush();
  return chapters.length > 0 ? chapters : [{ title: null, body: text, start: 0 }];
}

/**
 * The Chronicle text without the LAST whole copy of `chapter` (a block that starts the
 * text or follows a blank line, and ends it or precedes one), with its blank-line join;
 * null when no such copy is there. Exact text only: the undo of a fight's end takes back
 * the chapter that end appended and nothing else, and a chapter edited since stays.
 */
export function withoutChronicleChapter(text: string, chapter: string): string | null {
  if (!chapter) return null;
  for (
    let at = text.lastIndexOf(chapter);
    at >= 0;
    at = text.lastIndexOf(chapter, at - 1)
  ) {
    const end = at + chapter.length;
    const startsBlock = at === 0 || text.slice(0, at).endsWith("\n\n");
    const endsBlock = end === text.length || text.slice(end).startsWith("\n\n");
    if (!startsBlock || !endsBlock) {
      if (at === 0) break;
      continue;
    }
    const before = text.slice(0, at).replace(/\n\n$/, "");
    const after = text.slice(end).replace(/^\n\n/, "");
    return before && after ? `${before}\n\n${after}` : before || after;
  }
  return null;
}

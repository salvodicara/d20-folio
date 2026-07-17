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

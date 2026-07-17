/**
 * Block-level markdown parser (D27) — the structural counterpart to `parseInline`.
 *
 * `parseInline` only renders a single line's inline marks (**bold**); long shared
 * prose (the campaign chronicle, session summaries) also needs BLOCK structure:
 * sub-headings, horizontal rules between scenes, and lists. Pulling in a full
 * markdown library is overkill (zero-budget, and the inline renderer already
 * covers SRD descriptions), so this recognises the handful of block constructs a
 * story log actually uses and leaves the inline pass to `parseInline`.
 *
 * Kept as a pure function in its own module so the renderer file exports only a
 * component (react-refresh friendly) and the grammar is unit-testable in isolation.
 */

export type MdBlock =
  | { kind: "heading"; level: 4 | 5 | 6; text: string }
  | { kind: "hr" }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "p"; lines: string[] };

// `# … ######` → a section heading (the text after the hashes).
const HEADING = /^(#{1,6})\s+(.+?)\s*$/;
// A rule line: three or more of the SAME marker (-, *, _), optionally spaced —
// `---`, `***`, `___`, `- - -`. Tested before lists so it never reads as a bullet.
const HR = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
// `- `, `* `, `+ ` then content → an unordered item (the marker requires a space,
// so a bare `---` rule never matches here).
const UL = /^\s{0,3}[-*+]\s+(.+?)\s*$/;
// `1. ` / `1) ` then content → an ordered item.
const OL = /^\s{0,3}\d+[.)]\s+(.+?)\s*$/;

/**
 * Parse block markdown into a flat list of blocks. Blank lines separate
 * paragraphs and close lists; headings and rules always break the current block.
 * A heading's level maps `#`–`###` → h4, `####` → h5, `#####`/`######` → h6 — a
 * chronicle CHAPTER title is already the surrounding h3 (the `#`/`##` consumed by
 * `splitChapters`), so the deepest a body heading should go is h4.
 */
export function parseBlocks(text: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ kind: "p", lines: para });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const flush = () => {
    flushPara();
    flushList();
  };

  for (const line of text.split("\n")) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const hashes = (h[1] ?? "").length;
      const level = hashes <= 3 ? 4 : hashes === 4 ? 5 : 6;
      blocks.push({ kind: "heading", level, text: h[2] ?? "" });
      continue;
    }
    if (HR.test(line)) {
      flush();
      blocks.push({ kind: "hr" });
      continue;
    }
    const ol = OL.exec(line);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1] ?? "");
      continue;
    }
    const ul = UL.exec(line);
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1] ?? "");
      continue;
    }
    // A plain prose line — close any open list, accrue into the paragraph.
    flushList();
    para.push(line);
  }
  flush();
  return blocks;
}

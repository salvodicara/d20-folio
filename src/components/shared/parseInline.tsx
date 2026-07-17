/**
 * Parse a single line's inline markdown into React nodes — the ONE inline
 * processor shared by `InlineMarkdown` (SRD descriptions) and `BlockMarkdown`
 * (the campaign chronicle + session summaries), so every surface renders the same
 * marks identically.
 *
 * Supported (nestable, e.g. `**bold _and italic_**`):
 *   **bold**            → <strong>
 *   *italic* / _italic_ → <em>
 *   `code`              → <code> (literal; inner marks are NOT parsed)
 *   ~~strike~~          → <del>
 *   [label](url)        → <a> (http(s) or root-relative only; opens safely)
 *
 * Extracted as a standalone utility so it can be imported without triggering the
 * react-refresh/only-export-components rule on the renderer component files.
 */

import { isValidElement } from "react";

// Ordered alternation — bold (`**`) is tried before italic (`*`) so `**x**` never
// reads as emphasis; code is first so marks inside a code span stay literal. The
// `_italic_` arm is gated by non-word boundaries so snake_case never italicises.
const INLINE_SRC =
  "(`[^`\\n]+`)|(\\*\\*[\\s\\S]+?\\*\\*)|(~~[\\s\\S]+?~~)|(\\*[^*\\n]+?\\*)|((?<![\\w*])_[^_\\n]+?_(?![\\w*]))|(\\[[^\\]\\n]+?\\]\\((?:https?:\\/\\/|\\/)[^)\\s]+?\\))";

const LINK_RE = /^\[([^\]]+)\]\(([^)]+)\)$/;

export function parseInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  // A FRESH regex per call: parseInline recurses into emphasis/link content, and a
  // shared global regex would have its `lastIndex` clobbered by the inner call,
  // breaking (and potentially looping) the outer scan.
  const re = new RegExp(INLINE_SRC, "g");

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const tok = match[0];
    if (match[1]) {
      parts.push(
        <code key={key++} className="md-code">
          {tok.slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      parts.push(<strong key={key++}>{parseInline(tok.slice(2, -2))}</strong>);
    } else if (match[3]) {
      parts.push(<del key={key++}>{parseInline(tok.slice(2, -2))}</del>);
    } else if (match[4] || match[5]) {
      parts.push(<em key={key++}>{parseInline(tok.slice(1, -1))}</em>);
    } else if (match[6]) {
      const link = LINK_RE.exec(tok);
      if (link) {
        parts.push(
          <a
            key={key++}
            href={link[2]}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="md-link"
          >
            {parseInline(link[1] ?? "")}
          </a>
        );
      } else {
        parts.push(tok);
      }
    }
    lastIndex = match.index + tok.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

/**
 * Flatten a line's inline markdown to PLAIN text (markers removed) — for places
 * that can only carry a string (native `title` tooltips, aria labels). Derived
 * from {@link parseInline}'s own output, so the two can never disagree on what a
 * marker means.
 */
export function stripInline(text: string): string {
  const flatten = (nodes: React.ReactNode): string => {
    if (nodes == null || typeof nodes === "boolean") return "";
    if (typeof nodes === "string" || typeof nodes === "number") return String(nodes);
    if (Array.isArray(nodes)) return nodes.map(flatten).join("");
    if (isValidElement(nodes)) {
      return flatten((nodes.props as { children?: React.ReactNode }).children);
    }
    return "";
  };
  return flatten(parseInline(text));
}

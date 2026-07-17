/**
 * Lightweight inline markdown renderer for SRD descriptions.
 *
 * Block structure here: `\n\n` → paragraph break, `\n` → line break. Each line's
 * inline marks (**bold**, *italic*, `code`, ~~strike~~, links) are rendered by the
 * shared `parseInline` — the SAME processor `BlockMarkdown` uses for the chronicle
 * and sessions, so every surface renders inline markdown identically. For block
 * constructs (headings, rules, lists) use `BlockMarkdown` instead.
 */

import { Fragment, type Ref } from "react";
import { parseInline } from "./parseInline";

interface InlineMarkdownProps {
  text: string;
  className?: string;
  /** Forwarded to the outer container — lets a caller MEASURE the rendered prose
   *  (e.g. `useClampOverflow` gating a "Show more" on real line-clamp overflow). */
  ref?: Ref<HTMLDivElement>;
  /**
   * OPT-IN render-time formatter for the PLAIN text leaves of each line — rules
   * prose passes `highlightRulesText(locale)` (the BG3 colour grammar: damage
   * phrases / condition names / values / Advantage). It receives only string
   * leaves (markdown elements pass through untouched), so marks/code/links are
   * never re-processed. Omitted ⇒ the output is byte-identical to
   * `parseInline(line)` — the shared chronicle/session prose is provably
   * unaffected.
   */
  highlight?: (plain: string) => React.ReactNode;
}

export function InlineMarkdown({ text, className, ref, highlight }: InlineMarkdownProps) {
  const paragraphs = text.split("\n\n");

  return (
    <div ref={ref} className={className}>
      {paragraphs.map((para, i) => {
        const lines = para.split("\n");
        return (
          <p key={i} className="mb-2 last:mb-0">
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {highlight
                  ? parseInline(line).map((node, k) =>
                      typeof node === "string" ? (
                        <Fragment key={`s${k}`}>{highlight(node)}</Fragment>
                      ) : (
                        node
                      )
                    )
                  : parseInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

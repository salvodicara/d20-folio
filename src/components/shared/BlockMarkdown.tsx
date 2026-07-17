/**
 * Block markdown renderer (D27) — renders the constructs `parseBlocks` recognises
 * (sub-headings, horizontal rules, ordered/unordered lists, paragraphs) and defers
 * each line's inline marks to the shared `parseInline`. Use this for long shared
 * prose (the campaign chronicle, session summaries); `InlineMarkdown` stays the
 * lighter renderer for single-paragraph SRD descriptions.
 */

import { Fragment } from "react";
import { parseBlocks } from "./parseBlocks";
import { parseInline } from "./parseInline";

interface BlockMarkdownProps {
  text: string;
  className?: string;
}

export function BlockMarkdown({ text, className }: BlockMarkdownProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "heading": {
            const Tag = `h${b.level}` as const;
            return (
              <Tag key={i} className="bm-heading">
                {parseInline(b.text)}
              </Tag>
            );
          }
          case "hr":
            return <hr key={i} className="bm-rule" />;
          case "list":
            return b.ordered ? (
              <ol key={i} className="bm-list bm-ol">
                {b.items.map((it, j) => (
                  <li key={j}>{parseInline(it)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="bm-list bm-ul">
                {b.items.map((it, j) => (
                  <li key={j}>{parseInline(it)}</li>
                ))}
              </ul>
            );
          case "p":
            return (
              <p key={i} className="bm-p">
                {b.lines.map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {parseInline(line)}
                  </Fragment>
                ))}
              </p>
            );
        }
      })}
    </div>
  );
}

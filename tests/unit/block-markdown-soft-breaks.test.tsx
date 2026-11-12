/**
 * The Diario's chronicle reads as prose (sweep 2026-11-11: a chronicle pasted from a
 * document kept its hard line breaks mid-sentence, «del Frontone / Grigio e…»): with
 * `softBreaks`, a single newline is a space, as Markdown reads it, and only a blank
 * line starts a new paragraph. Without it, a line stays a line (the classic pages).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { BlockMarkdown } from "@/components/shared/BlockMarkdown";

const text =
  "Il gruppo è salito al Frontone\nGrigio e ha accettato il patto.\n\nSecondo paragrafo.";

describe("BlockMarkdown softBreaks", () => {
  it("a single newline wraps as a space; a blank line starts a paragraph", () => {
    const { container } = render(<BlockMarkdown text={text} softBreaks />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(container.querySelectorAll("br")).toHaveLength(0);
    expect(paragraphs[0]?.textContent).toBe(
      "Il gruppo è salito al Frontone Grigio e ha accettato il patto."
    );
  });

  it("without it, a line stays a line", () => {
    const { container } = render(<BlockMarkdown text={text} />);
    expect(container.querySelectorAll("br")).toHaveLength(1);
  });
});

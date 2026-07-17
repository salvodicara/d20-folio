/**
 * parseBlocks (D27) — the block-markdown grammar behind <BlockMarkdown>: headings,
 * scene rules, ordered/unordered lists, and paragraphs. Guards the parsing the
 * owner flagged (separators + sub-headings rendering as literal text).
 */

import { describe, expect, it } from "vitest";
import { parseBlocks } from "@/components/shared/parseBlocks";

describe("parseBlocks", () => {
  it("maps heading levels (#–### → h4, #### → h5, ##### → h6)", () => {
    const blocks = parseBlocks("### Scene\n#### Beat\n##### Aside");
    expect(blocks).toEqual([
      { kind: "heading", level: 4, text: "Scene" },
      { kind: "heading", level: 5, text: "Beat" },
      { kind: "heading", level: 6, text: "Aside" },
    ]);
  });

  it("treats a 3+ marker line as a horizontal rule, not a list", () => {
    expect(parseBlocks("---")).toEqual([{ kind: "hr" }]);
    expect(parseBlocks("***")).toEqual([{ kind: "hr" }]);
    expect(parseBlocks("___")).toEqual([{ kind: "hr" }]);
  });

  it("groups consecutive bullets into one unordered list", () => {
    const blocks = parseBlocks("- one\n- two\n* three");
    expect(blocks).toEqual([
      { kind: "list", ordered: false, items: ["one", "two", "three"] },
    ]);
  });

  it("groups consecutive numbers into one ordered list", () => {
    const blocks = parseBlocks("1. first\n2) second");
    expect(blocks).toEqual([{ kind: "list", ordered: true, items: ["first", "second"] }]);
  });

  it("does NOT read a dashed bullet as a rule (the `- item` vs `---` split)", () => {
    const blocks = parseBlocks("- a real bullet");
    expect(blocks).toEqual([{ kind: "list", ordered: false, items: ["a real bullet"] }]);
  });

  it("keeps a blank line as a paragraph boundary and joins wrapped lines", () => {
    const blocks = parseBlocks("line one\nline two\n\nsecond para");
    expect(blocks).toEqual([
      { kind: "p", lines: ["line one", "line two"] },
      { kind: "p", lines: ["second para"] },
    ]);
  });

  it("switches list kind when ordered follows unordered without a blank line", () => {
    const blocks = parseBlocks("- bullet\n1. number");
    expect(blocks).toEqual([
      { kind: "list", ordered: false, items: ["bullet"] },
      { kind: "list", ordered: true, items: ["number"] },
    ]);
  });

  it("returns no blocks for empty/whitespace text", () => {
    expect(parseBlocks("")).toEqual([]);
    expect(parseBlocks("   \n  ")).toEqual([]);
  });
});

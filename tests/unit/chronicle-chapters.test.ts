/**
 * Chronicle book-reader chapter split (D27).
 *
 * A long chronicle reads as a navigable book: the markdown is split at top-level
 * (`#`/`##`) headings into chapters, with any text before the first heading kept
 * as an untitled prologue. These pin the split so the reader paginates correctly.
 */

import { describe, it, expect } from "vitest";
import { splitChapters } from "@/features/campaigns/chronicle-chapters";

describe("splitChapters", () => {
  it("splits at # and ## headings, carrying the title + trimmed body", () => {
    const ch = splitChapters("# One\nfirst body\n\n## Two\nsecond body\n# Three\nthird");
    expect(ch).toHaveLength(3);
    expect(ch[0]).toMatchObject({ title: "One", body: "first body" });
    expect(ch[1]).toMatchObject({ title: "Two", body: "second body" });
    expect(ch[2]).toMatchObject({ title: "Three", body: "third" });
  });

  it("keeps pre-heading text as an untitled prologue chapter", () => {
    const ch = splitChapters("a prologue line\n\n# Chapter\nbody");
    expect(ch).toHaveLength(2);
    expect(ch[0]).toMatchObject({ title: null, body: "a prologue line" });
    expect(ch[1]?.title).toBe("Chapter");
  });

  it("returns a single untitled chapter when there are no headings", () => {
    const ch = splitChapters("just one block of story, no headings here");
    expect(ch).toHaveLength(1);
    expect(ch[0]?.title).toBeNull();
    expect(ch[0]?.body).toContain("one block");
  });

  it("ignores deeper (###) headings — only top-level chapters", () => {
    const ch = splitChapters("# Top\nintro\n### sub\ndetail");
    expect(ch).toHaveLength(1);
    expect(ch[0]?.title).toBe("Top");
    expect(ch[0]?.body).toContain("### sub");
  });

  it("never returns zero chapters (empty text → one chapter)", () => {
    expect(splitChapters("")).toHaveLength(1);
  });
});

describe("splitChapters — chapter start offsets (for the edit cursor)", () => {
  it("records each chapter's heading offset in the original text", () => {
    const text = "# A\nbody a\n## B\nbody b\n# C\nbody c";
    const ch = splitChapters(text);
    expect(ch[0]?.start).toBe(text.indexOf("# A"));
    expect(ch[1]?.start).toBe(text.indexOf("## B"));
    expect(ch[2]?.start).toBe(text.indexOf("# C"));
  });

  it("an untitled prologue starts at offset 0", () => {
    const text = "loose intro\n# First\nbody";
    const ch = splitChapters(text);
    expect(ch[0]?.start).toBe(0);
    expect(ch[1]?.start).toBe(text.indexOf("# First"));
  });

  it("every chapter's start is the Edit cursor offset (its own heading, all sections)", () => {
    // The editor drops the cursor at `chapter.start` for EVERY section — including
    // the last — so editing always begins at the top of the section you were on.
    const text = "# A\nbody a\n# B\nbody b\n# C\nbody c";
    const ch = splitChapters(text);
    expect(ch.map((c) => c.start)).toEqual([
      text.indexOf("# A"),
      text.indexOf("# B"),
      text.indexOf("# C"),
    ]);
  });
});

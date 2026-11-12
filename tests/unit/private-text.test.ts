/**
 * The scan a PR title, a PR body and a commit message pass before they are published
 * (`scripts/private-text.ts`): a licensed-setting term or a private identity value is
 * refused, and the refusal names where it is, never the term itself.
 */
import { describe, expect, it } from "vitest";

import { PI_TERMS, privateTextHits } from "../../scripts/private-text";

// Stand-in identity values: the real list lives pack-side only.
const IDENTITY = ["Rosalind", "uid-0042", "someone@example.test"];
const scan = (parts: Record<string, string>) => privateTextHits(parts, IDENTITY);
// Terms taken from the lexicon itself, so none is written in a public file.
const oneWord = PI_TERMS.find((t) => /^[a-z]+$/.test(t)) ?? "";
const twoWords = PI_TERMS.find((t) => /^[a-z]+ [a-z]+$/.test(t)) ?? "";
const capital = (t: string) => t.replace(/\b[a-z]/g, (c) => c.toUpperCase());

describe("the private-text scan", () => {
  it("passes plain public text", () => {
    expect(
      scan({ title: "fix(play): the Rage tile counts", body: "Barbarian\nLong Rest" })
    ).toEqual([]);
  });

  it("names the place of a licensed-setting term, never the term", () => {
    const hits = scan({
      title: "ok",
      body: `line one\nmeet the ${capital(oneWord)} here`,
    });
    expect(hits).toEqual(["body:2: licensed-setting term"]);
    expect(hits.join(" ").toLowerCase()).not.toContain(oneWord);
  });

  it("matches a multi-word term across a space and any case", () => {
    expect(scan({ title: `a ${capital(twoWords).replace(" ", "  ")} row` })).toEqual([
      "title:1: licensed-setting term",
    ]);
  });

  it("names the place of an identity value, never the value", () => {
    const hits = scan({ body: "for rosalind's bard", msg: "x\n\nuid-0042 fixed" });
    expect(hits).toEqual(["body:1: identity value", "msg:3: identity value"]);
    expect(hits.join(" ")).not.toMatch(/rosalind|0042/i);
  });

  it("a bare name matches whole words only", () => {
    expect(scan({ body: "Rosalindale and narosalind" })).toEqual([]);
  });

  it("lets the sanctioned design reference through", () => {
    expect(scan({ body: "Pattern source: Baldur's Gate 3 inventory" })).toEqual([]);
  });

  it("carries the guard's lexicon", () => {
    expect(PI_TERMS.length).toBeGreaterThan(60);
  });
});

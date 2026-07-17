/**
 * parseInline — the single inline-markdown processor shared by InlineMarkdown
 * (SRD descriptions) and BlockMarkdown (chronicle + sessions). Owner feedback:
 * "render everything" — bold, italic, code, strikethrough, links — consistently.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { parseInline, stripInline } from "@/components/shared/parseInline";
import { UniversalCardDesc } from "@/components/shared/UniversalCard";
import enFeats from "@/i18n/en/srd/feats.json";

function html(md: string): string {
  const { container } = render(<div>{parseInline(md)}</div>);
  return container.innerHTML;
}

describe("parseInline", () => {
  it("renders **bold** as <strong>", () => {
    expect(html("a **b** c")).toContain("<strong>b</strong>");
  });

  it("renders *italic* and _italic_ as <em>", () => {
    expect(html("a *b* c")).toContain("<em>b</em>");
    expect(html("a _b_ c")).toContain("<em>b</em>");
  });

  it("does NOT italicise mid-word underscores (snake_case safe)", () => {
    expect(html("acid_splash_spell")).not.toContain("<em>");
  });

  it("renders `code` literally (inner marks NOT parsed)", () => {
    const out = html("use `**not bold**` here");
    expect(out).toContain('<code class="md-code">**not bold**</code>');
    expect(out).not.toContain("<strong>");
  });

  it("renders ~~strikethrough~~ as <del>", () => {
    expect(html("a ~~gone~~ b")).toContain("<del>gone</del>");
  });

  it("nests emphasis (bold containing italic)", () => {
    const out = html("**bold _and italic_**");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>and italic</em>");
  });

  it("renders a safe [label](url) link", () => {
    const out = html("see [the wiki](https://dnd2024.wikidot.com)");
    expect(out).toContain('href="https://dnd2024.wikidot.com"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain("the wiki");
  });

  it("does not linkify a non-http(s) target (javascript: stays literal)", () => {
    const out = html("[x](javascript:alert(1))");
    expect(out).not.toContain("<a ");
  });

  it("leaves plain text untouched", () => {
    expect(html("just words")).toContain("just words");
  });

  it("distinguishes **bold** from *italic* at the same scan", () => {
    const out = html("*i* and **b**");
    expect(out).toContain("<em>i</em>");
    expect(out).toContain("<strong>b</strong>");
  });

  it("renders adjacent markers as separate runs", () => {
    const out = html("**a****b**");
    expect(out).toContain("<strong>a</strong>");
    expect(out).toContain("<strong>b</strong>");
  });

  it("leaves an unclosed marker literal", () => {
    const out = html("a **b and on");
    expect(out).not.toContain("<strong>");
    expect(out).toContain("a **b and on");
  });
});

describe("stripInline", () => {
  it("strips markers to plain text (native-tooltip safe)", () => {
    expect(stripInline("**Luck Points.** You have *some* `luck`.")).toBe(
      "Luck Points. You have some luck."
    );
  });

  it("flattens nested emphasis and link labels", () => {
    expect(stripInline("**bold _and italic_** [wiki](https://x.y)")).toBe(
      "bold and italic wiki"
    );
  });

  it("passes plain text through untouched", () => {
    expect(stripInline("just words")).toBe("just words");
  });
});

describe("SRD prose surfaces route through the inline renderer", () => {
  // Owner 2026-06-12: a feat card in the combat tab showed literal
  // "**…**" bold markers. A REAL catalogue string must render <strong>,
  // never raw asterisks, through the shared UniversalCardDesc seam.
  it("renders the Alert feat description with <strong>, no literal **", () => {
    const alert = (enFeats as Record<string, { description?: string }>)["alert"];
    expect(alert?.description).toContain("**Initiative Proficiency.**");
    const { container } = render(
      <UniversalCardDesc>{alert?.description}</UniversalCardDesc>
    );
    expect(container.innerHTML).toContain("<strong>Initiative Proficiency.</strong>");
    expect(container.textContent).not.toContain("**");
  });
});

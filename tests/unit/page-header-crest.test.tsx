/**
 * PageHeader crest — the frontispiece opt-in mechanism (DESIGN.md §13).
 *
 * The engraved brand crest is seated as a whisper-faint frontispiece watermark on
 * the standard-field framed mastheads (DESIGN.md §13). The art-backed campaign hub
 * omits it — its own art is the frontispiece. These pins fix the MECHANISM: `crest`
 * is an explicit opt-in that only takes effect together with `framed`
 * (`withCrest = framed && crest`), so an inner cockpit `PageHeader` (`framed={false}`)
 * never carries it and no masthead paints the crest by accident. The SURFACE-level
 * invariant — the standard-field mastheads opt in, the campaign hub does not — is
 * pinned where those surfaces render (roster.test.tsx opts in;
 * campaign-hub.test.tsx stays out).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PageHeader } from "@/components/shared/PageHeader";

describe("PageHeader crest (frontispiece opt-in)", () => {
  it("renders no .page-head-crest by default — the crest is an explicit opt-in", () => {
    const { container } = render(<PageHeader title="Spellbook" />);
    expect(container.querySelector(".page-head-crest")).toBeNull();
  });

  it("renders .page-head-crest when crest + framed are both set — the seated frontispiece", () => {
    const { container } = render(<PageHeader title="Characters" crest framed />);
    expect(container.querySelector(".page-head-crest")).not.toBeNull();
    expect(container.querySelector(".page-head")).toHaveClass("has-crest");
  });

  it("crest without framed no-ops (withCrest = framed && crest) — inner cockpit headers stay bare", () => {
    const { container } = render(<PageHeader title="Characters" crest framed={false} />);
    expect(container.querySelector(".page-head-crest")).toBeNull();
    expect(container.querySelector(".page-head")).not.toHaveClass("has-crest");
  });
});

describe("PageHeader carries no per-realm accent", () => {
  it("emits no data-realm attribute — every masthead shares the one struck-gold voice", () => {
    const { container } = render(<PageHeader title="Compendio" crest />);
    expect(container.querySelector(".page-head")).not.toHaveAttribute("data-realm");
  });
});

describe("Masthead is static on navigation (owner 2026-07-10 — rock-solid realm switches)", () => {
  // jsdom cannot compute CSS animation, so pin the SOURCE invariant: NO rule
  // animates the masthead or its content blocks. Navigating between realms must
  // read as a solid frame whose words swap instantly — any mount animation on
  // .page-head* reads as the page "refreshing" (the owner's 2026-07-09/10 bug).
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8");

  it("defines no masthead mount animation (the old page-head-settle stays deleted)", () => {
    expect(css).not.toMatch(/page-head-settle/);
  });

  it("no .page-head element carries an animation", () => {
    // Any `animation:` declaration inside a rule whose selector targets .page-head*
    // is a regression. Walk rule blocks: selector (up to `{`) + body (up to `}`).
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    for (const match of css.matchAll(ruleRe)) {
      const selector = match[1] ?? "";
      const body = match[2] ?? "";
      if (selector.includes(".page-head") && /(?:^|[\s;])animation\s*:/.test(body)) {
        throw new Error(`masthead animation reintroduced in rule: ${selector.trim()}`);
      }
    }
  });
});

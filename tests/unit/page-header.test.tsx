/**
 * PageHeader — the one canonical masthead.
 *
 * A masthead is a PLATE and its title: no watermark behind the ink, no per-realm
 * accent, and no mount animation. These pins fix that shape — nothing paints
 * under a header band, every realm shares one struck-gold voice, and navigating
 * between realms reads as a solid frame whose words swap instantly.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PageHeader } from "@/components/shared/PageHeader";

describe("PageHeader carries no per-realm accent", () => {
  it("emits no data-realm attribute — every masthead shares the one struck-gold voice", () => {
    const { container } = render(<PageHeader title="Compendio" />);
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

  it("paints nothing behind a masthead's ink — no watermark, no crest layer", () => {
    expect(css).not.toMatch(/page-head-crest/);
    expect(css).not.toMatch(/\.page-head[^{,]*\.has-crest/);
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

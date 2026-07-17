import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/index.css"), "utf8");

/**
 * D12 regression — every named border TIER must be exposed to Tailwind through a
 * `--color-border-<tier>` mapping in `@theme`. Without it, a `border-border-<tier>`
 * utility is undefined and Tailwind v4 falls back to `currentColor`, painting a
 * light "white" border over a dark surface (the HP-pill bug).
 */
describe("theme border tokens", () => {
  const tiers = ["soft", "medium", "strong", "accent"] as const;

  for (const tier of tiers) {
    it(`exposes --border-${tier} as --color-border-${tier}`, () => {
      // The underlying palette token exists.
      expect(css).toMatch(new RegExp(`--border-${tier}:`));
      // ...and it is mapped for Tailwind's `border-border-${tier}` utility.
      expect(css).toMatch(
        new RegExp(`--color-border-${tier}:\\s*var\\(--border-${tier}\\)`)
      );
    });
  }
});

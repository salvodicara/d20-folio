import { describe, it, expect } from "vitest";
import { extname } from "node:path";
import { SRC_ROOT as srcRoot, srcFiles, readSrc } from "./__helpers__/src-files";

/**
 * Inverted-inset touch-target guard (owner-reported "dead circle" family,
 * 2026-06-11).
 *
 * The project's invisible hit-slop idiom expands a small control to the 44px
 * `--touch-min` floor with an absolutely positioned pseudo-element:
 *
 *   inset: calc((var(--touch-min) - <size>) / -2);
 *
 * The divisor MUST be **-2**: a negative inset grows the box outward by half the
 * deficit on each side. Dividing by **+2** inverts the sign — a positive inset
 * SHRINKS the hit box inward by the same amount, silently making the control
 * harder to hit than its bare visual (the `.search .clear-btn` / `.seg button` /
 * `.fchip` / `.uc-prep` defect this guard was written against). The mistake is
 * invisible in review (the calc reads plausibly) and in axe (no contrast/name
 * failure), so it can only be pinned structurally: any `--touch-min` arithmetic
 * divided by positive 2 in a stylesheet fails here.
 */
describe("touch-target hit-slop insets divide by -2 (never +2)", () => {
  it("no stylesheet computes a --touch-min inset with a positive /2 divisor", () => {
    const cssFiles = srcFiles().filter((f) => extname(f) === ".css");
    expect(cssFiles.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of cssFiles) {
      const css = readSrc(file);
      const lines = css.split("\n");
      lines.forEach((line, i) => {
        // The defect shape: a calc() that references --touch-min and divides by
        // POSITIVE 2 (any whitespace). The correct idiom divides by -2.
        if (/calc\([^;]*var\(--touch-min\)[^;]*\/\s*2\s*\)/.test(line)) {
          offenders.push(`${file.slice(srcRoot.length + 1)}:${i + 1} → ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `inverted hit-slop inset (divide by -2, not 2 — a positive inset SHRINKS the target):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

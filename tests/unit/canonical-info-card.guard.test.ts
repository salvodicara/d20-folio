/// <reference types="node" />
/**
 * Guard: ONE `.info-card` surface component. Every carved inset content panel must
 * be the shared `<InfoCard>` (`components/shared/InfoCard`), never a hand-rolled
 * `<div className="info-card …">` (or `<ul>`/`<li>`/`<p>` …). ~19 sites across the
 * campaign hub, sheet tabs, modals, and the creation wizard were bypassing the
 * component; all migrated so the surface contract (the `flush` modifier, the
 * carved-vellum recipe) lives in one place (owner 2026-06-08, "dedup all the
 * components you can").
 *
 * Scope: RAW HTML elements only. Components that compose the surface on a generic
 * container (`<AutoAnimateHeight className="info-card …">`, the Chronicle reader)
 * or via `cn("info-card", …)` inside their own definition (InfoCard itself,
 * ChoicePickerCard) are legitimate reuse, not hand-rolled cards — they don't match
 * the lowercase-tag pattern below.
 */
import { describe, expect, it } from "vitest";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

// A raw HTML element opening tag carrying a literal `className="info-card…"`.
// Lowercase tag name → only intrinsic elements match; `<InfoCard>` /
// `<AutoAnimateHeight>` (components) and `cn("info-card", …)` do not.
const RAW_INFO_CARD =
  /<(?:div|ul|ol|li|section|article|p|span|aside|header|footer|main|nav|td|th|tr)\b[^>]*\bclassName="info-card(?:["'\s])/;

describe("canonical info-card", () => {
  it("no raw element hand-rolls the `.info-card` surface (use <InfoCard>)", () => {
    const offenders = srcFiles({ exts: [".tsx"] }).filter((f) =>
      RAW_INFO_CARD.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <InfoCard> from @/components/shared/InfoCard (with `flush` / `as` as " +
        "needed), not a hand-rolled `.info-card` element. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});

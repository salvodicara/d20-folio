/// <reference types="node" />
/**
 * Guard: ONE section rubric everywhere. Every `.sec-head` (display-italic title +
 * the fading rule + an optional count/meta) must be rendered by the canonical
 * `<SectionHeader>` atom (`@/components/shared/SectionHeader`) — never a
 * hand-rolled `<div className="sec-head">…`. The markup was re-declared in ~15
 * tabs/modals plus two private `SectionHeader`/`CategoryHeader` copies; all were
 * migrated onto the shared atom so a fix to the rubric propagates everywhere
 * instead of drifting per-surface (owner 2026-06-08, "dedup all the components you
 * can"). `SectionHeader.tsx` itself is the ONE allowed home of the markup;
 * `<Section>` composes it.
 *
 * ANCHOR: the rubric's own class, `sec-head`. It used to be `sec-diamond` — the
 * marker span inside the rubric — but the chrome reset deleted the whole
 * rotated-diamond family, so the guard was probing a class no file could contain
 * and could no longer fire at all. `sec-head` cannot be deleted without deleting
 * the rubric.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CANONICAL = resolve(SRC, "components/shared/SectionHeader.tsx");

/** `className="sec-head …"`, `className={cn("sec-head", …)}` — both spellings. */
const HAND_ROLLED = /className=\{?\s*(?:cn\()?\s*["'`][^"'`]*\bsec-head\b/;

describe("canonical section header", () => {
  it("only SectionHeader.tsx renders the `.sec-head` rubric markup", () => {
    const offenders = srcFiles({ exts: [".ts", ".tsx"] }).filter(
      (f) => f !== CANONICAL && HAND_ROLLED.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <SectionHeader> from @/components/shared/SectionHeader (or <Section>), not a " +
        "hand-rolled `.sec-head` block. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });

  it("…and the canonical atom really is the one that renders it", () => {
    // Non-vacuity: if SectionHeader.tsx stops emitting `sec-head`, the rubric has
    // moved and the offender scan above is guarding an empty class name.
    expect(HAND_ROLLED.test(readSrc(CANONICAL))).toBe(true);
  });
});

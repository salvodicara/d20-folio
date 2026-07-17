/// <reference types="node" />
/**
 * Guard: ONE section rubric everywhere. Every `.sec-head` (gold diamond ◆ +
 * display-italic title + fading rule) must be rendered by the canonical
 * `<SectionHeader>` atom (`@/components/shared/SectionHeader`) — never hand-rolled
 * `<div className="sec-head"><span className="sec-diamond" />…`. The markup was
 * re-declared in ~15 tabs/modals plus two private `SectionHeader`/`CategoryHeader`
 * copies; all were migrated onto the shared atom so a fix to the rubric propagates
 * everywhere instead of drifting per-surface (owner 2026-06-08, "dedup all the
 * components you can"). `SectionHeader.tsx` itself is the ONE allowed home of the
 * markup; `<Section>` composes it.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { SRC_ROOT as SRC, srcFiles, readSrc } from "./__helpers__/src-files";

const CANONICAL = resolve(SRC, "components/shared/SectionHeader.tsx");

describe("canonical section header", () => {
  it("only SectionHeader.tsx renders the hand-rolled `.sec-diamond` markup", () => {
    const offenders = srcFiles({ exts: [".ts", ".tsx"] }).filter(
      (f) => f !== CANONICAL && /className=["']sec-diamond["']/.test(readSrc(f))
    );
    expect(
      offenders,
      "Use <SectionHeader> from @/components/shared/SectionHeader (or <Section>), not a " +
        "hand-rolled `.sec-head`/`.sec-diamond` block. Offending files:\n" +
        offenders.map((f) => "  " + f.replace(SRC, "src")).join("\n")
    ).toEqual([]);
  });
});

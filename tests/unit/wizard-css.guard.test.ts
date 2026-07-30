/// <reference types="node" />
/**
 * Guard: the wizard F morph contract lives in CSS — pin its load-bearing
 * pieces so a style refactor can't silently break the owner-approved commit
 * transition (round-6 binding correction):
 *
 *  1. ONE persistent body: `.wiz-spread` animates ONLY its grid column track
 *     (1fr 0fr → 1.2fr 1fr) — reading→chosen is a width animation on one
 *     layout, never a swapped body.
 *  2. The asks column content is `display: none` while reading (zero height,
 *     unfocusable) and fades via `allow-discrete` + `@starting-style`.
 *  3. Mobile (≤720px) stacks the asks as a 0fr→1fr ROW fold.
 *  4. The list disables native scroll anchoring (`overflow-anchor: none`) so
 *     the pre-paint enthrone counter-scroll owns the no-jump behavior.
 *  5. `prefers-reduced-motion` (the app's `[data-motion="reduced"]` token)
 *     zeroes the morph transitions.
 *  6. The SURF exclusion covers `.lvl-pick` (round-6 finding: chip-internal
 *     ink must not take the on-art backdrop treatment) and the new `.wiz-*`
 *     surfaces.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "../../src/styles/folio.css"), "utf8").replace(
  /\s+/g,
  " "
);

describe("wizard F morph contract (one persistent body)", () => {
  it("the spread's closed state is a zero column track that the open state widens", () => {
    expect(css).toMatch(/\.wiz-spread \{[^}]*grid-template-columns: 1fr 0fr/);
    expect(css).toMatch(
      /\.wiz-spread\[data-asks\] \{[^}]*grid-template-columns: 1\.2fr 1fr/
    );
  });

  it("the column track is TRANSITIONED (the commit animation is the track, not a swap)", () => {
    expect(css).toMatch(/\.wiz-spread \{[^}]*transition:[^}]*grid-template-columns/);
  });

  it("the asks content hides via display:none + allow-discrete + @starting-style", () => {
    expect(css).toMatch(/\.wiz-spread-asks \{[^}]*display: none/);
    expect(css).toMatch(
      /\.wiz-spread-asks \{[^}]*display var\(--m-normal\) allow-discrete/
    );
    expect(css).toMatch(
      /@starting-style \{ \.wiz-spread\[data-asks\] \.wiz-spread-asks \{ opacity: 0/
    );
  });

  it("mobile stacks the asks as a 0fr→1fr row fold", () => {
    expect(css).toMatch(/\.wiz-spread-asks \{[^}]*grid-template-rows: 0fr/);
    expect(css).toMatch(
      /\.wiz-spread\[data-asks\] \.wiz-spread-asks \{[^}]*grid-template-rows: 1fr/
    );
  });

  it("the list owns scroll compensation (native anchoring disabled)", () => {
    expect(css).toMatch(/\.wiz-list \{[^}]*overflow-anchor: none/);
  });

  it("reduced motion zeroes the morph", () => {
    // The fold is a two-way grid-track TRANSITION now (owner 2026-06-11:
    // collapsing must glide too) — reduced motion zeroes the transition.
    expect(css).toMatch(/\[data-motion="reduced"\] \.wiz-fold \{ transition: none/);
    expect(css).toMatch(/\[data-motion="reduced"\] \.wiz-entry,/);
  });

  it("the hint slab reserves two lines and the orbs row is fixed (pixel-stable chrome)", () => {
    expect(css).toMatch(/\.wiz-hint \{[^}]*min-height: calc\(2 \* 1\.5em\)/);
    expect(css).toMatch(/\.wiz-orbs \{[^}]*min-height/);
  });

  it("the fork slot does NOT reserve height (fb3: an empty slab was a void — the chrome→content rhythm is identical on every step)", () => {
    expect(css).not.toMatch(/\.wiz-fork-slot \{[^}]*min-height/);
  });
});

describe("asks-column ledger contract (owner fb3, 2026-06-11)", () => {
  it("the asks list is BOUNDED with internal scrolling (the card never balloons)", () => {
    expect(css).toMatch(/\.wiz-asks \.wiz-list \{[^}]*max-height/);
    expect(css).toMatch(/\.wiz-asks \.wiz-list \{[^}]*overflow-y: auto/);
  });

  it("asks rows are DENSE and width-proof (compact row, small seal, one-line ellipsed name)", () => {
    expect(css).toMatch(/\.wiz-asks \.wiz-list \.wiz-row \{[^}]*min-height: 38px/);
    expect(css).toMatch(/\.wiz-asks \.wiz-list \.wiz-socket \{[^}]*width: 26px/);
    expect(css).toMatch(
      /\.wiz-asks \.wiz-list \.wiz-row-name \{[^}]*text-overflow: ellipsis/
    );
  });

  it("entry state styles are CHILD-SCOPED — an open/chosen entry can never inflate the pick rows NESTED in its asks column (the fb3 fat-slab root cause)", () => {
    // The altar scale applies to the entry's OWN header only…
    expect(css).toMatch(/\.wiz-entry\[data-open\] > \.wiz-row > \.wiz-socket \{/);
    expect(css).toMatch(/\.wiz-entry\[data-open\] > \.wiz-row \.wiz-row-name \{/);
    expect(css).toMatch(/\.wiz-entry\[data-open\] > \.wiz-row \{/);
    // …never through a descendant selector that reaches nested entries.
    expect(css).not.toMatch(/\.wiz-entry\[data-open\] \.wiz-socket \{/);
    expect(css).not.toMatch(/\.wiz-entry\[data-open\] \.wiz-row \{/);
    expect(css).not.toMatch(/\.wiz-entry\[data-open\] \.wiz-row-name \{/);
  });

  it("the hero altar's asks column wears the SAME `.wiz-asks` ledger voice (one source of truth)", () => {
    const gallery = readFileSync(
      resolve(here, "../../src/features/wizard/gallery.tsx"),
      "utf8"
    );
    expect(gallery).toContain('className="wiz-asks wiz-hero-asks"');
  });
});

describe("equal-height enthronement contract (owner fb4, 2026-06-12)", () => {
  // The enthronement block is the LAST pure min-width:721 media query.
  const desktop = css.split("@media (min-width: 721px) {").at(-1) ?? "";

  it("the spread locks to the measured reading height on desktop (`--wiz-spread-h`)", () => {
    expect(desktop).toMatch(/\.wiz-spread \{[^}]*height: var\(--wiz-spread-h, auto\)/);
  });

  it("an asks feat RESERVES the ledger minimum while READING (`data-can-ask`)", () => {
    expect(desktop).toMatch(/\.wiz-spread\[data-can-ask\] \{[^}]*min-height/);
  });

  it("the narrowed prose and the asks ledger scroll WITHIN the lock", () => {
    expect(desktop).toMatch(
      /\.wiz-spread-main > \.wiz-read-prose \{[^}]*overflow-y: auto/
    );
    expect(desktop).toMatch(/\.wiz-spread-asks > \.wiz-asks \{[^}]*overflow-y: auto/);
  });

  it("the act-row fold machinery is GONE — the commit/release row is persistent (rule 10: superseded ⇒ removed)", () => {
    expect(css).not.toMatch(/\.wiz-entry\[data-chosen\] \.wiz-spread-act/);
    expect(css).not.toMatch(/\.wiz-spread-act \{[^}]*grid-template-rows/);
    expect(css).not.toMatch(/\.wiz-spread-act \{[^}]*visibility/);
  });
});

describe("check-medallion contract (owner fb4, 2026-06-12)", () => {
  it("the open-book clearance is :has-scoped — a bookless picked row keeps the normal padding so its check sits at the true right edge", () => {
    expect(css).toMatch(
      /\.wiz-entry:has\(> \.wiz-book\) > \.wiz-row \{[^}]*padding-right: 56px/
    );
    expect(css).toMatch(
      /\.wiz-asks \.wiz-list \.wiz-entry:has\(> \.wiz-book\) > \.wiz-row \{[^}]*padding-right: 40px/
    );
    // The old blanket picked-state clearance (the mid-row-check root cause) is GONE.
    expect(css).not.toMatch(
      /\.wiz-entry\[data-picked\] > \.wiz-row \{[^}]*padding-right/
    );
  });

  it("the check ENTERS deliberately: scale-settle transition + @starting-style + the gold ink bloom keyframes", () => {
    expect(css).toMatch(
      /\.wiz-row-check \{[^}]*transition:[^}]*transform var\(--m-slow\) var\(--ease-settle\)/
    );
    expect(css).toMatch(
      /@starting-style \{ \.wiz-row-check \{ opacity: 0; transform: scale\(0\.4\)/
    );
    expect(css).toMatch(/@keyframes wiz-check-bloom/);
  });

  it("FACT rows keep the medallion mounted (hidden base state + picked/removing reveal) — symmetric on unpick", () => {
    expect(css).toMatch(/\.wiz-row-fact \.wiz-row-check \{[^}]*opacity: 0/);
    expect(css).toMatch(
      /\.wiz-entry\[data-picked\] > \.wiz-row-fact \.wiz-row-check,\s*\.wiz-entry\[data-removing\] > \.wiz-row-fact \.wiz-row-check \{[^}]*opacity: 1/
    );
  });

  it("reduced motion zeroes the check entrance INCLUDING the higher-specificity picked-state bloom", () => {
    expect(css).toMatch(/\[data-motion="reduced"\] \.wiz-row-check,/);
    expect(css).toMatch(
      /\[data-motion="reduced"\] \.wiz-entry\[data-picked\] > \.wiz-row-fact \.wiz-row-check,\s*\[data-motion="reduced"\] \.wiz-entry\[data-removing\] > \.wiz-row-fact \.wiz-row-check \{[^}]*animation: none/
    );
  });
});

describe("fork-card foot single-line contract (fb3, third report)", () => {
  it(".wiz-card-foot never wraps; the eyebrow ellipses as the worst-case net", () => {
    expect(css).toMatch(/\.wiz-card-foot \{[^}]*white-space: nowrap/);
    expect(css).toMatch(
      /\.wiz-card-foot > span:first-child \{[^}]*text-overflow: ellipsis/
    );
  });

  it("the IT card-foot strings are written to FIT (liv. abbreviation — never a wrapped LIVELLO)", () => {
    const shard = JSON.parse(
      readFileSync(resolve(here, "../../src/i18n/it/ui/levelUp.json"), "utf8")
    ) as { levelUp: Record<string, string> };
    const it_ = shard.levelUp;
    expect(it_.newClassL1).toBe("Nuova classe · liv. 1");
    expect(it_.advanceTo).toContain("liv.");
  });
});

describe("wizard pager cluster (fb3 mobile navigation)", () => {
  it("below the gutter breakpoint the NAV is the one fixed cluster and the pills are static children (back can never be overlapped)", () => {
    const sub1359 = css.split("@media (max-width: 1359px)")[1] ?? "";
    expect(sub1359).toMatch(/\.wiz-pager \{[^}]*position: fixed/);
    expect(sub1359).toMatch(/\.wiz-pager-btn \{[^}]*position: static/);
  });

  it("phones lift the cluster above the realm nav and swap to the SHORT caption (no ellipsis)", () => {
    const sub767 = css.split("@media (max-width: 767px)").at(-1) ?? "";
    expect(sub767).toMatch(/\.wiz-pager \{[^}]*var\(--m-nav-h\)/);
    expect(sub767).toMatch(/\.cap-short/);
  });
});

describe("on-art SURF exclusion covers the wizard surfaces", () => {
  it(".lvl-pick is a SURF (chip ink never takes the backdrop treatment)", () => {
    // The flip exclusion `:not(:where(… .lvl-pick …))` must name .lvl-pick.
    expect(css).toMatch(
      /\.on-art-scope :is\([^)]*\.text-text-secondary[^)]*\):not\( :where\([^)]*\.lvl-pick/
    );
  });

  it("the wizard entry/card/hero surfaces are SURFs too", () => {
    for (const cls of [".wiz-entry", ".wiz-card", ".wiz-hero", ".wiz-abil"]) {
      expect(
        new RegExp(
          `\\.on-art-scope :is\\([^)]*\\.text-text-secondary[^)]*\\):not\\( :where\\([^)]*${cls.replace(".", "\\.")}`
        ).test(css),
        `${cls} missing from the SURF exclusion`
      ).toBe(true);
    }
  });
});

describe("review scaling rows are REAL surfaces (owner round-2, 2026-06-11)", () => {
  it("`.lvl-card.lvl-scaling` is the warning-voiced opaque surface — never a translucent tint floating on the art", () => {
    expect(css).toMatch(
      /\.lvl-card\.lvl-scaling \{[^}]*--lvl-accent: var\(--semantic-warning\)/
    );
    const tsx = readFileSync(
      resolve(here, "../../src/components/sheet/level-up/LevelUpFeatureCards.tsx"),
      "utf8"
    );
    expect(tsx).toContain('className="lvl-card lvl-scaling"');
    expect(tsx).not.toContain("bg-warning/10");
  });
});

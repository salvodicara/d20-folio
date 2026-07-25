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

/** The wizard's on-art REGION rule — its capture group is the register list. */
const REGION = /\.wiz\s*:is\(([^)]*)\)\s*\{\s*text-shadow: var\(--on-art-halo\)/;

describe("the wizard column takes the on-art treatment, and its PLAQUES do not", () => {
  // The SURF exclusion these tests used to pin is gone. It was a hand-written list
  // of surface classes subtracted from a blanket flip, and it is what put cream ink
  // on the campaign hub's ivory panels the moment a section was rebuilt on a class
  // nobody remembered to add. The wizard column is loose BY CONSTRUCTION, so its own
  // open-column registers take the treatment from one region rule — and the plaque
  // classes these tests were protecting are simply not in it, which is a fact the
  // rule states positively instead of subtracting.

  it("the open-column registers are named in the region rule", () => {
    const listed = REGION.exec(css)?.[1] ?? "";
    expect(
      listed,
      "MISSING the wizard's on-art region rule (`.wiz :is(<open-column registers>) " +
        "{ text-shadow: var(--on-art-halo) }`). Without it every label, count and " +
        "rubric in creation and level-up loses its ground on the candlelit art."
    ).not.toBe("");
    for (const cls of [
      ".wiz-pick-label",
      ".wiz-count",
      ".wiz-asks-head",
      ".wiz-rubric",
      ".field-label",
      ".field-help",
    ]) {
      expect(
        listed.includes(cls),
        `${cls} is not in the wizard's on-art region rule`
      ).toBe(true);
    }
  });

  it("no PLAQUE class is in it — but that is only HALF the axis (see below)", () => {
    // Membership in the register list was the only thing this file ever checked,
    // and it is the wrong axis on its own: `.wiz-hero` was never IN the list, and
    // the altar ghosted anyway, because the defect is `.wiz-hero` as an ANCESTOR.
    // Kept because a plaque class appearing here would still be a defect; the
    // ancestor case is the describe block that follows.
    const listed = REGION.exec(css)?.[1] ?? "";
    for (const cls of [
      ".lvl-pick",
      ".wiz-entry",
      ".wiz-card",
      ".wiz-hero",
      ".wiz-abil",
    ]) {
      expect(
        listed.includes(cls),
        `${cls} is a SURFACE — it paints a face and grounds the text on it. Putting ` +
          `it in the on-art region rule paints backdrop ink on a plaque, which is the ` +
          `exact defect the old exclusion list existed to prevent and then failed to.`
      ).toBe(false);
    }
  });
});

/**
 * THE ANCESTOR AXIS — a surface stops the treatment.
 *
 * The register-list assertion above passed while the level-up hero altar shipped
 * cream ink on ivory: `.wiz-hero` is not in the list and never was, but it is a
 * PLATE that stands inside the loose column and hosts `.wiz-asks-head`, so the
 * region rule reached the caption THROUGH it (measured 1.04:1 light; the boon
 * panel's `.wiz-asi .wiz-pick-label` measured 1.02:1). The hand-written CSS
 * exclusion the region rewrite deleted had also moved into a hand-written PROBE
 * exclusion — `.wiz` sat in `on-art-ink.spec.ts`'s OPT_IN, so the rendered leak leg
 * skipped the whole wizard and saw none of it.
 *
 * So this block checks the axis that actually failed, and it DERIVES both sides:
 *   · a SURFACE is any rule painting one of the two canonical materials
 *     (`--plate-face`, `--panel-alpha`) — the stylesheet's own definition, not a
 *     list someone maintains;
 *   · a REGISTER is whatever the region rule names.
 * Add a plate, or add a register, and the stop rules must follow or this goes red.
 *
 * WHAT IT CANNOT SEE: CONTAINMENT. Whether a given register ever actually renders
 * inside a given surface is a fact about the rendered tree, not about any selector.
 * That is `on-art-ink.spec.ts`'s job — and the OPT_IN assertion here is what keeps
 * it able to do it.
 */
describe("the treatment stops at a SURFACE (the ancestor axis)", () => {
  /** Every rule in the stylesheet, as `{ sel, body }`. */
  const RULES = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sel: (sel ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").trim(),
    body: body ?? "",
  }));

  /** The class names a `:is(…)` group lists. */
  const classesIn = (group: string): string[] => [
    ...new Set([...group.matchAll(/\.[a-z0-9-]+/g)].map((m) => m[0])),
  ];

  /**
   * The app's SURFACES, derived from the two canonical materials. A rule that
   * paints one of them IS a surface; its leading class is the surface's name.
   */
  const SURFACES = [
    ...new Set(
      RULES.filter((r) => /var\(--plate-face\)|var\(--panel-alpha\)/.test(r.body))
        .map((r) => /^\.[a-z0-9-]+/.exec(r.sel.split(/[\s,>]+/)[0] ?? "")?.[0] ?? "")
        .filter(Boolean)
    ),
  ].sort();

  /** The rules that state the stop: `<surface list> <register list> { … }`. */
  const STOPS = RULES.filter(
    (r) => /:is\([^)]*\.wiz-hero[^)]*\)/.test(r.sel) && /\.modal/.test(r.sel)
  );

  it("the surface list is DERIVED — every material-painting rule is in every stop rule", () => {
    expect(
      SURFACES.length,
      "Derived NO surfaces from folio.css. The materials are `--plate-face` (plate) " +
        "and `--panel-alpha` (the daylight-sibling panel); if they were renamed, this " +
        "derivation — and the law it checks — is reading nothing."
    ).toBeGreaterThan(5);
    expect(
      STOPS.length,
      "MISSING the `THE TREATMENT STOPS AT A SURFACE` rules in folio.css. Without " +
        "them the wizard's region rule reaches every register standing on a plate, " +
        "and light theme paints cream ink on ivory (measured 1.02–1.04:1)."
    ).toBeGreaterThan(0);
    for (const stop of STOPS) {
      const listed = classesIn(/:is\(([^)]*)\)/.exec(stop.sel)?.[1] ?? "");
      const missing = SURFACES.filter((s) => !listed.includes(s));
      expect(
        missing,
        `A rule that paints the plate/panel material is NOT in this stop rule's ` +
          `surface list, so the on-art treatment reaches straight through it:\n  ` +
          `${stop.sel.slice(0, 120)}…\nAdd ${missing.join(", ")} — or, if it is not ` +
          `a surface, stop painting it with the surface material.`
      ).toEqual([]);
    }
  });

  it("every register the region rule names is STOPPED — ground in both themes, ink in light", () => {
    const registers = classesIn(REGION.exec(css)?.[1] ?? "");
    expect(registers.length).toBeGreaterThan(5);
    // `.text-error` rides the same column through its own pair of rules.
    const grounded = registers.concat(".text-error");

    const groundStop = STOPS.find((r) => /text-shadow: none/.test(r.body));
    expect(
      groundStop,
      "MISSING the `{ text-shadow: none }` stop rule — no plate takes the halo off " +
        "the register it hosts."
    ).toBeDefined();
    const groundedBy = classesIn(
      [...(groundStop?.sel ?? "").matchAll(/:is\(([^)]*)\)/g)].at(-1)?.[1] ?? ""
    );
    expect(
      grounded.filter((c) => !groundedBy.includes(c)),
      "This register keeps the on-art HALO when it stands on a plate — a dark outline " +
        "painted around ink that already has a plate behind it. Add it to the " +
        "`{ text-shadow: none }` stop rule."
    ).toEqual([]);

    // Light is the direction that ghosts: the ink flips to the backdrop parchment,
    // which on an ivory plate is cream-on-cream. Every register light flips must be
    // handed its own ink back on a surface.
    const flipped = [
      ...new Set(
        RULES.filter(
          (r) => /^\[data-theme="light"\] \.wiz\s/.test(r.sel) && /color:/.test(r.body)
        ).flatMap((r) => classesIn(r.sel).filter((c) => c !== ".wiz"))
      ),
    ];
    expect(flipped.length).toBeGreaterThan(5);
    const restored = new Set(
      STOPS.filter((r) => /^\[data-theme="light"\]/.test(r.sel)).flatMap((r) =>
        classesIn([...r.sel.matchAll(/:is\(([^)]*)\)/g)].at(-1)?.[1] ?? "").concat(
          // A single-class subject (`… .field-help {`) has no trailing :is().
          classesIn(r.sel.split(")").at(-1) ?? "")
        )
      )
    );
    expect(
      flipped.filter((c) => !restored.has(c)),
      "This register takes light's BACKDROP ink and never gets its own back on a " +
        "surface — cream on ivory. Add it to a `[data-theme=light] <surfaces> … " +
        "{ color: … }` stop rule, restoring the colour its own base rule declares."
    ).toEqual([]);
  });

  it("no rule hands a register the treatment UNDER a surface ancestor", () => {
    const registers = classesIn(REGION.exec(css)?.[1] ?? "");
    const offenders = RULES.filter(
      (r) =>
        /text-shadow: var\(--on-art-halo\)|color: var\(--text-on-backdrop/.test(r.body) &&
        SURFACES.some((s) => new RegExp(`\\${s}\\b[^,{]*\\s`).test(r.sel)) &&
        registers.some((c) => r.sel.includes(c))
    ).map((r) => r.sel.slice(0, 110));
    expect(
      offenders,
      "A rule gives an on-art register the backdrop treatment with a SURFACE in its " +
        "ancestor chain. A plate grounds its own text; this repaints it as if the " +
        "plate were not there:\n  " +
        offenders.join("\n  ")
    ).toEqual([]);
  });

  it("the rendered probe is NOT blindfolded — no region may sit in its OPT_IN", () => {
    // The unit side cannot see containment; the e2e probe can. This is the assertion
    // that keeps it looking. `.wiz` in OPT_IN skipped the entire wizard and is how
    // the altar shipped ghosted with 250 green cells.
    const spec = readFileSync(
      resolve(here, "../../tests/e2e/on-art-ink.spec.ts"),
      "utf8"
    );
    const optIn = /const OPT_IN = "([^"]*)"/.exec(spec)?.[1] ?? "";
    expect(
      optIn,
      'Could not read `const OPT_IN = "…"` out of on-art-ink.spec.ts — this guard ' +
        "is reading nothing (golden rule 13)."
    ).not.toBe("");
    const entries = optIn.split(",").map((s) => s.trim());
    const root =
      /(\.[a-z0-9-]+)\s*:is\([^)]*\)\s*\{\s*text-shadow: var\(--on-art-halo\)/.exec(
        css
      )?.[1];
    expect(root, "Could not derive the region rule's scope root from folio.css.").toBe(
      ".wiz"
    );
    const banned = entries.filter(
      (e) => e === root || e === ".on-art-scope" || SURFACES.includes(e)
    );
    expect(
      banned,
      `${banned.join(", ")} is a REGION (or a surface), not a self-backing object. ` +
        `Listing it in the leak probe's OPT_IN exempts everything inside it — which ` +
        `is how the hand-written CSS exclusion list came back as a hand-written PROBE ` +
        `exclusion, and how the hero altar's cream-on-ivory caption shipped green. ` +
        `Name the individual self-backing controls instead.`
    ).toEqual([]);
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

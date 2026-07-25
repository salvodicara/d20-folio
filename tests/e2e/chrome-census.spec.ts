/**
 * E2E GUARD: THE FRAMED-BOX CENSUS — L1 and the nesting law, measured on the
 * rendered page rather than argued from the stylesheet.
 *
 * **The defect class this kills.** Every wave of work adds one more box. No
 * single addition looks wrong, and no stylesheet-level guard can see the total —
 * a border here, an inset well there, a chip that "just needs to be legible" —
 * until one cockpit route renders 273 framed boxes three levels deep and one
 * compendium route renders 1313, and the app stops reading as a design and starts
 * reading as an accumulation. The reference's densest screen carries four framed
 * box TYPES and never nests them more than two deep.
 *
 * So the census is a BUDGET, checked at CI:
 *
 *   1. **Nesting ≤ 2, everywhere.** A frame means "the container the user is
 *      acting in" or "interactive" (L1). Container → plaque is two. A third level
 *      always means something read-only grew a box, or a grouping surface grew a
 *      frame it does not need.
 *   2. **A per-surface ceiling** on how many framed boxes may be VISIBLE at once.
 *      The ceilings are set just above what each surface ships, so an incidental
 *      addition passes and a new bordered CLASS (a chip family, a row frame, a
 *      re-framed rail) cannot.
 *
 * WHAT COUNTS AS A FRAME. A box the user can SEE an edge on: any side with a
 * non-zero border width, a drawn style, and a colour that is not effectively
 * transparent — or an inset box-shadow (a carved well is the same "this is an
 * object" claim, made with light). Deliberately NOT counted, because the user
 * does not read them as boxes: a declared-transparent border (the geometry-frozen
 * idiom L3 depends on), a painted stripe or underline (a background gradient),
 * the one hairline, and any element under 20×20 (pips, dots, carets).
 *
 * WHAT IS NOT COUNTED AS VISIBLE. Anything clipped away by a collapsed accordion
 * or a scrolled-shut ancestor: it is in the DOM, but the user is not looking at
 * a box. (An earlier version of this probe counted the "Pin to top" verb inside
 * all 38 COLLAPSED action rows and reported the cockpit at 261 boxes when 83
 * were on screen.)
 *
 * WHEN A CEILING FAILS. Raising the number is the last resort, not the fix. The
 * failure message lists the offending classes with their counts; the answer is
 * almost always that a read-only facet took a border it does not need (L1: it is
 * type in an alignment column) or a list row grew a frame at rest (the reference's
 * rows are frameless until the pointer or the selection reaches them). See
 * DESIGN.md §4 "The plate material" and §5 "The ornament vocabulary".
 */

import { test, expect } from "@playwright/test";
import { DESKTOP, seedUI, seedLang, freezeMotion } from "./surfaces";

/** A framed box the probe found, reduced to `tag.class` + how deep it sits. */
interface FramedBox {
  key: string;
  depth: number;
}

interface Census {
  total: number;
  maxDepth: number;
  /** The deepest chain, for the failure message. */
  deepest: string[];
  /** `tag.class → count`, descending. */
  byClass: [string, number][];
}

/**
 * The surfaces the census covers, with their ceiling. These are the app's four
 * densest routes plus the two simplest — between them they exercise every framed
 * family in the chrome (rails · cards · list rows · plaques · dialogs · the leaf).
 *
 * The cockpit's ceiling is the one that needs explaining: 42 of its boxes are the
 * per-action commit CTAs, one for every action the character can take. Those are
 * CONTENT, not chrome — the reference frames its hotbar slots exactly the same
 * way — so the budget below is "the CTAs, plus a chrome allowance in the same
 * range as every other surface".
 *
 * ── A ROUTE IS NOT A SURFACE: SAMPLE THE VARIETY, NOT THE DEFAULT ────────────
 * The census used to visit five bare routes, and every one of them landed on its
 * DEFAULT state. That is the blind spot that let `.cmp-seal` keep a border and a
 * two-line lip right through an unframing phase: `/compendium` opens on Spells,
 * the ONE tab whose leading gem is the already-unframed `.lvl-seal`, while the
 * other eight tabs lead every row with `.cmp-seal` — 509 rows on Features, which
 * measured 49 framed boxes against this file's ceiling of 23 and never ran.
 *
 * So each realm now contributes its VARIETY, not its landing state: the codex
 * samples a `.cmp-seal` tab (Features) as well as Spells; the cockpit samples the
 * tabs that carry a framed family Play does not (Inventory's toolbar, Spells'
 * prepare toggles + school chips, Features' Binder's Fob); and the campaign hub
 * samples its combat sub-view (the inline initiative tracker) as well as the
 * party overview the dev fixture rests on. A cell whose framed inventory is
 * identical to one already covered is NOT added — the point is coverage of
 * FAMILIES, not of URLs, which is why the codex takes one `.cmp-seal` tab rather
 * than all eight.
 *
 * TWO KNOWN BLIND SPOTS, recorded rather than closed (they need their own ruling,
 * not a bigger list of routes):
 *   1. **The 20×20 floor.** Anything smaller is skipped as a pip/dot/caret, which
 *      hides 106 framed sub-20px elements on the cockpit alone — the pips and
 *      bars, `.idp-die` (27×19), `.move-num-in` (24×16). They are real edges the
 *      eye does see; the floor exists because counting every dot drowns the
 *      signal, not because they are exempt from L1.
 *   2. **A ceiling has +5 of slack by design**, so re-framing ONE class of low
 *      cardinality still fits: putting the metal back on `.folio-panel` adds two
 *      boxes and passes here. That case is caught by the unit rail guard
 *      (`chrome-system.guard.test.ts`, "keeps the rail a material"), which is why
 *      the census is a companion to the stylesheet guards and not a replacement.
 */
const SURFACES: {
  slug: string;
  route: string;
  ceiling: number;
  /** Extra seeding for a state a URL cannot express (the running encounter). */
  prepare?: (page: import("@playwright/test").Page) => Promise<void>;
}[] = [
  // Measured, both themes, then + 5 of headroom — tight enough that a re-framed
  // CLASS (a chip family, a row frame, a re-framed rail) cannot fit under it, and
  // loose enough that one new control on a page is not a gate failure.
  { slug: "roster", route: "/characters", ceiling: 13 }, // measured 8
  // The cockpit's five tabs are five different centre panels; `?tab=` addresses
  // them, so each one that carries a framed family Play does not is its own cell.
  { slug: "cockpit", route: "/characters/mock-1", ceiling: 88 }, // measured 83
  // + the inventory toolbar chips and the add/equip verbs.
  { slug: "cockpit-inventory", route: "/characters/mock-1?tab=inventory", ceiling: 37 }, // measured 32
  // + 20 per-spell PREPARE toggles (content, like the cockpit's CTAs) + the 8 school chips.
  { slug: "cockpit-spells", route: "/characters/mock-1?tab=spells", ceiling: 59 }, // measured 54
  // + the Binder's Fob (the management chrome only this tab mounts).
  { slug: "cockpit-features", route: "/characters/mock-1?tab=features", ceiling: 30 }, // measured 25
  { slug: "compendium", route: "/compendium", ceiling: 23 }, // measured 18
  // The Features tab — one of the EIGHT codex tabs that lead every row with
  // `.cmp-seal` rather than the Spells tab's `.lvl-seal`, and the densest of them
  // (509 rows). This is the cell that would have caught the seal keeping its
  // border and its two-line lip through the unframing phase: it measured 49
  // against this file's ceiling of 23 while the suite only ever visited Spells.
  { slug: "compendium-feature", route: "/compendium?type=feature", ceiling: 23 }, // measured 18
  { slug: "campaign-hub", route: "/campaigns/mock-1", ceiling: 46 }, // measured 41
  // The hub's OTHER half: the dev fixture rests on the party overview, so the
  // running-encounter sub-view (the inline initiative tracker + the DM verbs) was
  // never measured — and it is the denser of the two.
  {
    slug: "campaign-hub-encounter",
    route: "/campaigns/mock-1",
    ceiling: 57, // measured 52
    prepare: async (page) => {
      await page.addInitScript(() =>
        window.localStorage.setItem("d20-dev-encounter", "1")
      );
      await page.reload();
      await page
        .getByText(/coralino/i)
        .first()
        .waitFor({ timeout: 8000 })
        .catch(() => {});
    },
  },
  { slug: "settings", route: "/settings", ceiling: 15 }, // measured 10
];

/** The whole census runs in ONE evaluate so the sweep stays fast. */
async function census(page: import("@playwright/test").Page): Promise<Census> {
  return page.evaluate(() => {
    /** Alpha of any serialized colour, via canvas (handles oklab / color-mix). */
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const alphaOf = (css: string): number => {
      if (!ctx) return 1;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return (ctx.getImageData(0, 0, 1, 1).data[3] ?? 0) / 255;
    };

    /** A visible edge on any side, or a carved inset. */
    const framed = (cs: CSSStyleDeclaration): boolean => {
      const side = (w: string, s: string, c: string): boolean =>
        w !== "0px" && s !== "none" && alphaOf(c) > 0.02;
      return (
        side(cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor) ||
        side(cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor) ||
        side(cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor) ||
        side(cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor) ||
        (cs.boxShadow !== "none" && /inset/.test(cs.boxShadow))
      );
    };

    /** Rendered AND not clipped away by a collapsed / scrolled-shut ancestor. */
    const onScreen = (el: Element): boolean => {
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
      const r = el.getBoundingClientRect();
      for (let p = el.parentElement; p && p !== document.documentElement; ) {
        const cs = getComputedStyle(p);
        if (/hidden|clip/.test(cs.overflowY) || /hidden|clip/.test(cs.overflowX)) {
          const pr = p.getBoundingClientRect();
          if (
            r.bottom <= pr.top + 1 ||
            r.top >= pr.bottom - 1 ||
            r.right <= pr.left + 1 ||
            r.left >= pr.right - 1
          ) {
            return false;
          }
        }
        p = p.parentElement;
      }
      return true;
    };

    const key = (el: Element): string => {
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
          : "";
      return el.tagName.toLowerCase() + cls;
    };

    const boxes: Element[] = [];
    for (const el of document.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      if (!framed(getComputedStyle(el))) continue;
      if (!onScreen(el)) continue;
      boxes.push(el);
    }

    const set = new Set(boxes);
    const found: FramedBox[] = [];
    let deepest: string[] = [];
    for (const el of boxes) {
      const chain: string[] = [];
      for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
        if (set.has(p)) chain.unshift(key(p));
      }
      found.push({ key: key(el), depth: chain.length });
      if (chain.length > deepest.length) deepest = chain;
    }
    const counts = new Map<string, number>();
    for (const b of found) counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
    return {
      total: found.length,
      maxDepth: found.reduce((m, b) => Math.max(m, b.depth), 0),
      deepest,
      byClass: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    };
  });
}

for (const { slug, route, ceiling, prepare } of SURFACES) {
  for (const theme of ["dark", "light"] as const) {
    test(`framed-box census: ${slug} [${theme}]`, async ({ page }) => {
      await page.setViewportSize({ width: DESKTOP.width, height: 2400 });
      await seedUI(page, theme, "play");
      await seedLang(page, "en");
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 20000 });
      if (prepare) await prepare(page);
      await freezeMotion(page);
      await page.waitForTimeout(600);

      const { total, maxDepth, deepest, byClass } = await census(page);
      const inventory = byClass.map(([k, n]) => `${k} ×${n}`).join("\n  ");

      expect(
        maxDepth,
        `FRAMED NESTING went ${maxDepth} deep on ${slug} [${theme}]. A frame means ` +
          `"the container the user is acting in" or "interactive" (L1) — container ` +
          `→ plaque is TWO, and the reference never nests further. The deepest ` +
          `chain was:\n  ${deepest.join("\n    > ")}\n` +
          `Something read-only grew a box, or a grouping surface grew a frame it ` +
          `does not need. DESIGN.md §4.`
      ).toBeLessThanOrEqual(2);

      expect(
        total,
        `FRAMED-BOX BUDGET exceeded on ${slug} [${theme}]: ${total} visible framed ` +
          `boxes against a ceiling of ${ceiling}. Raising the ceiling is the last ` +
          `resort — the fix is almost always that a read-only facet took a border ` +
          `(L1: it is type in an alignment column) or a list row grew a frame at ` +
          `rest (rows are frameless until the pointer or the selection reaches ` +
          `them). What is framed here:\n  ${inventory}`
      ).toBeLessThanOrEqual(ceiling);
    });
  }
}

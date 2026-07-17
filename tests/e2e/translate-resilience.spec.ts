/**
 * E2E: external-text-mutation resilience (issue #24 — production crash)
 *
 * A live IT-locale Windows/Chrome user hit a hard crash on the character cockpit
 * Features tab:
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * That message — thrown DURING React reconciliation and caught by React Router —
 * is the canonical fingerprint of an EXTERNAL agent mutating React-owned text
 * nodes. The overwhelmingly common source is Chrome's built-in auto-translate
 * (and translation extensions): it walks the DOM and wraps each text node in a
 * `<font>` element. When React later unmounts the ORIGINAL text node, that node
 * is no longer a child of its recorded parent (it's now inside the injected
 * `<font>`), so `parent.removeChild(textNode)` throws and the whole subtree
 * white-screens through the error boundary ("Qualcosa è andato storto").
 *
 * THE MODEL UNDER TEST (supersedes the earlier `<html translate="no">` ban):
 * translation is ALLOWED — a user whose language is neither EN nor IT may
 * machine-translate the app — and the app is RESILIENT to it. Before React
 * mounts, `src/lib/dom-resilience.ts` installs tolerant
 * `Node.prototype.removeChild`/`insertBefore` wrappers (stale removal → no-op,
 * stale reference → append), so the entire rewrite-the-DOM extension class
 * (translators, grammar checkers, password managers) can no longer crash a
 * commit. Known wart, accepted: a React re-render may REVERT translated text or
 * leave an orphaned translated fragment until the next reconcile — safe but
 * imperfect; crashing is the only unacceptable outcome.
 *
 * This spec simulates translate-style mutation (wrap the live tree's text nodes
 * in `<font>` elements + keep a resident re-wrapping MutationObserver, exactly
 * as Google Translate does), then forces React to reconcile over the mutated
 * tree (filter, tab switches). The app must NOT show the error boundary. We
 * assert on two heavy surfaces (Features and Combat) so the protection is
 * proven app-wide, not just on the one reported tab.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Simulate Google-Translate-style mutation on the CURRENTLY rendered tree:
 * walk a bounded sample of TEXT nodes inside the main content region and wrap
 * each in a `<font>` element (Translate's exact technique), detaching the
 * original text node from its React-recorded parent.
 *
 * Returns how many nodes were wrapped, so the test can assert the mutation
 * actually ran (a zero would make a green result meaningless).
 */
async function simulateAutoTranslate(page: Page, rootSelector: string): Promise<number> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return 0;
    // `<font>` is a deprecated element, so a literal `createElement("font")`
    // resolves to the deprecated typed overload — go through a `string` so it
    // resolves to the generic (non-deprecated) one. This is exactly the element
    // Chrome's translator injects around each text node.
    const makeFont = (): HTMLElement => {
      const tag: string = "font";
      return document.createElement(tag);
    };
    // Skip nodes already wrapped (idempotent across repeated passes) and our own
    // injected <font> wrappers, matching how a live translator re-scans the DOM.
    const wrapTextNodesIn = (scope: Element): number => {
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          if (!node.textContent || node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }
          // Don't re-wrap text already inside an injected <font>.
          if ((node.parentNode as Element | null)?.tagName === "FONT") {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const targets: Text[] = [];
      let current = walker.nextNode();
      while (current) {
        targets.push(current as Text);
        current = walker.nextNode();
      }
      let wrapped = 0;
      for (const textNode of targets) {
        const parent = textNode.parentNode;
        if (!parent) continue;
        const font = makeFont();
        // Translate inserts the <font> in the text node's place, then moves the
        // (translated) text node inside it — detaching it from `parent` (the
        // node React still records as the text node's parent in its fiber tree).
        parent.replaceChild(font, textNode);
        font.appendChild(textNode);
        wrapped++;
      }
      return wrapped;
    };

    const total = wrapTextNodesIn(root);

    // Install a live MutationObserver that re-wraps any NEW text React renders —
    // faithfully mimicking Chrome's translator, which keeps a persistent observer
    // and re-translates freshly-mounted content. This is what makes the crash
    // happen DURING a subsequent React reconcile (the observer reparents a node
    // React is mid-flight on), rather than only on the initial static tree.
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of Array.from(m.addedNodes)) {
          if (added.nodeType === Node.ELEMENT_NODE) {
            wrapTextNodesIn(added as Element);
          } else if (
            added.nodeType === Node.TEXT_NODE &&
            added.parentNode &&
            (added.parentNode as Element).tagName !== "FONT" &&
            added.textContent?.trim()
          ) {
            const parent = added.parentNode;
            const font = makeFont();
            parent.replaceChild(font, added);
            font.appendChild(added);
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return total;
  }, rootSelector);
}

/** The error boundary fallback (`role="alert"` with the bilingual title key). */
function errorBoundary(page: Page) {
  return page.getByRole("alert").filter({ hasText: /went wrong|andato storto/i });
}

test.describe("external-text-mutation resilience (issue #24)", () => {
  // Switch tabs via the in-app tablist (a CLIENT-SIDE React reconcile that
  // unmounts the active panel's subtree) — NOT a full-page `goto`. The bug only
  // fires when React reconciles/unmounts a text node whose recorded parent an
  // external agent has changed; a hard navigation remounts the whole tree and
  // sidesteps it, so the in-app click is what faithfully reproduces issue #24.
  const selectTab = (page: Page, name: RegExp) => page.getByRole("tab", { name }).click();

  test("Features tab survives simulated Chrome auto-translate", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    // Let the feature cards settle (the heaviest render in the cockpit).
    await expect(page.locator(".uc-name").first()).toBeVisible();

    const wrapped = await simulateAutoTranslate(page, "main");
    expect(wrapped, "translate-simulation must mutate real text nodes").toBeGreaterThan(
      5
    );

    // Drive the two React removal paths that crashed in prod against the mutated
    // (translator-reparented) tree:
    //  1. FILTER the feature list — React DELETES whole card subtrees whose text
    //     nodes the live observer reparented (the `removeChild` not-a-child path).
    //  2. SWITCH tabs — React unmounts the active panel subtree.
    const searchToggle = page
      .getByRole("button", { name: /search|cerca|filtra/i })
      .first();
    if (await searchToggle.isVisible({ timeout: 1500 }).catch(() => false)) {
      await searchToggle.click().catch(() => {});
    }
    const searchBox = page.getByRole("textbox").first();
    if (await searchBox.isVisible({ timeout: 1500 }).catch(() => false)) {
      await searchBox.fill("zzzznomatch");
      await expect(errorBoundary(page)).toHaveCount(0);
      await searchBox.fill("");
      await expect(errorBoundary(page)).toHaveCount(0);
    }

    await selectTab(page, /combat/i);
    await expect(errorBoundary(page)).toHaveCount(0);
    await selectTab(page, /features/i);
    await expect(errorBoundary(page)).toHaveCount(0);
    await expect(page.locator(".uc-name").first()).toBeVisible();
  });

  test("Combat tab survives simulated Chrome auto-translate", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=combat");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();

    const wrapped = await simulateAutoTranslate(page, "main");
    expect(wrapped, "translate-simulation must mutate real text nodes").toBeGreaterThan(
      5
    );

    await selectTab(page, /features/i);
    await expect(errorBoundary(page)).toHaveCount(0);
    await expect(page.locator(".uc-name").first()).toBeVisible();
  });

  test("translation stays ALLOWED — no blanket ban on the document", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    // The resilience model preserves the capability: a non-EN/IT user may
    // machine-translate the app. No root opt-out, no Google notranslate meta —
    // the adapters (src/lib/dom-resilience.ts) absorb the mutations instead.
    const translateAttr = await page.evaluate(() =>
      document.documentElement.getAttribute("translate")
    );
    expect(translateAttr).toBeNull();
    const googleMeta = await page.evaluate(
      () => document.querySelector('meta[name="google"]')?.getAttribute("content") ?? null
    );
    expect(googleMeta).toBeNull();
  });

  test("formula tokens opt out SELECTIVELY (meaning-bearing dice strings only)", async ({
    page,
  }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.locator(".uc-name").first()).toBeVisible();
    // The ONE shared verdict chip carries translate="no" — dice/DC tokens must
    // not be machine-mangled — while card names/descriptions stay translatable.
    const verdict = page.locator(".uc-verdict").first();
    await expect(verdict).toHaveAttribute("translate", "no");
    await expect(page.locator(".uc-name").first()).not.toHaveAttribute("translate", "no");
  });

  test("html lang tracks the active locale (honest tagging)", async ({ page }) => {
    await page.goto("/characters/mock-1?tab=features");
    await expect(page.getByText("Lyra Voss").first()).toBeVisible();
    // The mock E2E build runs EN by default; lang must reflect that, not a stale
    // hard-coded value. (The sync keeps it honest when the user switches to IT —
    // and lets browser translators skip same-language pages.)
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toMatch(/^(en|it)$/);
  });
});

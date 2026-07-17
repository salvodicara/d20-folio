/**
 * E2E: the Chronicle reads at content height and edits with a fixed, comfortable,
 * resizable editor (#64).
 *
 * The settled spec (owner, 2026-06):
 *   • the reading view GROWS to its chapter (no inner scroll);
 *   • the EDITOR opens at a FIXED comfortable height, the same regardless of how
 *     tall the section was, and stays freely resizable;
 *   • the cursor lands at the START of the section you were reading (every section,
 *     including the last — jump to the end with a keyboard shortcut), scrolled so
 *     the editor starts at that line;
 *   • resizing the textarea follows the drag INSTANTLY (no sticky lag).
 */

import { test, expect, type Page } from "@playwright/test";
import { openChronicleEditor, openChronicleNav, seedChronicle } from "./ready";

const CH2_HEADING = "# Chapter Two";
const TEXT =
  "# Chapter One\nshort\n\n" +
  `${CH2_HEADING}\nmiddle body\n\n` +
  "# Chapter Three\n" +
  Array.from({ length: 30 }, (_, i) => `tall line ${i + 1}`).join("\n");

async function seed(page: Page) {
  await seedChronicle(page, TEXT, { motion: "auto", width: 1000 });
}

/** Select chapter `index` in the reader, open the editor, read its state. Leaves
 *  the editor OPEN (the caller reads + closes if it needs to). */
async function openEditorAt(page: Page, index: number) {
  // The chapter navigator lives in the section's collapsible detail now — reveal it
  // before paging to the target chapter.
  await openChronicleNav(page);
  await page.getByLabel("Chapter", { exact: true }).selectOption(String(index));
  // Open the editor robustly: a click landing in the post-`selectOption` re-render
  // window can have its React onClick dropped under load — `openChronicleEditor`
  // re-clicks only if the editor didn't open (the #84 root cause; see ready.ts).
  // It resolves once the textarea is visible, which (the editor seeds the caret in
  // a pre-paint layout-effect) means `selectionStart` is already in place to read.
  await openChronicleEditor(page);
  return page.evaluate(() => {
    const ta = document.getElementById("chronicle-text") as HTMLTextAreaElement;
    const cs = getComputedStyle(ta);
    return {
      cursor: ta.selectionStart,
      // The textarea's own rendered height + its CSS `min-height`. The editor is a
      // FIXED comfortable height (`.input.chronicle-text { min-height: clamp(...) }`)
      // that the content scrolls inside — it never GROWS to its section. So a single
      // open of the TALL last section is enough to prove section-independence: the
      // textarea sits AT its min-height (not stretched by the 30-line chapter). We
      // compare the BORDER-box (`offsetHeight`) to `min-height` since `min-height`
      // resolves against the border-box under the app's `box-sizing: border-box`.
      taHeight: Math.round(ta.offsetHeight),
      taMinHeight: Math.round(parseFloat(cs.minHeight)),
    };
  });
}

test("fixed-height editor; the caret wires to the opened section's start", async ({
  page,
}) => {
  // This e2e proves the editor WIRING in a SINGLE open of the TALL LAST section:
  //   • the mount layout-effect drops the caret at that section's `start` (and the
  //     last section is NOT special-cased — it opens at its own heading like any);
  //   • the editor is a FIXED comfortable height the tall content scrolls inside —
  //     the textarea sits AT its CSS min-height (the clamp), NOT stretched to the
  //     30-line chapter — so the editor height can't depend on the section.
  // The exhaustive ENGINE fact (EVERY section's start, incl. the prologue at 0) is
  // pinned far more cheaply in tests/unit/chronicle-chapters.test.ts ("every
  // chapter's start is the Edit cursor offset"). So this e2e does ONE editor cycle,
  // not three — fewer heavy-hub round-trips keep the spec inside its wall-clock
  // budget under full-matrix CPU contention (#84; golden rule 13: the cheapest
  // test that pins the fact + ≥1 thin wiring e2e for the engine→UI seam).
  await seed(page);

  const last = await openEditorAt(page, 2); // tall last section

  // The caret wires to the opened section's start (the last is NOT special-cased).
  expect(last.cursor).toBe(TEXT.indexOf("# Chapter Three"));

  // The editor is its fixed comfortable height: the textarea is AT its min-height
  // (content scrolls inside it — it did NOT grow to the 30-line section), and that
  // height is the generous minimum (> 300px), so the editor height is independent
  // of how tall the section is. (±2px box-model tolerance, as the original cross-
  // section comparison used.)
  expect(last.taMinHeight).toBeGreaterThan(300);
  expect(Math.abs(last.taHeight - last.taMinHeight)).toBeLessThanOrEqual(2);
});

test("the editor scrolls so a deep section starts at the TOP (wrapping-aware)", async ({
  page,
}) => {
  // A long chronicle with WRAPPING prose, so the middle section sits far down and
  // there's plenty below it to scroll up — the caret must land at the viewport top
  // (a plain newline count under-scrolls wrapped lines).
  const para =
    "A long prose paragraph that soft-wraps across many visual lines with no manual breaks and keeps going for a good while indeed.";
  const ch2 = "# Chapter Two";
  const text =
    "# Chapter One\n" +
    Array.from({ length: 5 }, () => para).join("\n\n") +
    `\n\n${ch2}\nthe middle section\n\n# Chapter Three\n` +
    Array.from({ length: 20 }, () => para).join("\n\n");

  await seedChronicle(page, text, { motion: "reduced", width: 760 });

  await openChronicleNav(page); // the navigator is in the collapsible detail now
  await page.getByLabel("Chapter", { exact: true }).selectOption("1"); // middle
  // STATE SIGNAL (full-suite contention incident, 2026-06-12): the editor's
  // mount effect seeds scrollTop from a text-mirror measured with the CURRENT
  // font metrics, and the assertion below re-measures the same way. On a
  // CPU-starved machine the web fonts could still be loading at editor-open, so
  // the seed used fallback-font wrap metrics while the later measurement used
  // the loaded font — a >4px phantom offset. Waiting on document.fonts.ready
  // BEFORE the editor mounts pins both measurements to the same (final) font.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  // Robust open (re-clicks only if the post-select click was dropped — #84) +
  // editor mounted + caret seeded by its layout-effect before we read scrollTop.
  await openChronicleEditor(page);

  const caretViewportY = await page.evaluate(() => {
    const ta = document.getElementById("chronicle-text") as HTMLTextAreaElement;
    const at = ta.selectionStart;
    const cs = getComputedStyle(ta);
    const innerW =
      ta.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const m = document.createElement("div");
    m.style.cssText = `position:absolute;visibility:hidden;left:-9999px;white-space:pre-wrap;overflow-wrap:break-word;width:${innerW}px;font-family:${cs.fontFamily};font-size:${cs.fontSize};line-height:${cs.lineHeight};letter-spacing:${cs.letterSpacing}`;
    m.textContent = ta.value.slice(0, at);
    const span = document.createElement("span");
    m.appendChild(span);
    document.body.appendChild(m);
    const y = Math.round(span.offsetTop - ta.scrollTop);
    m.remove();
    return y;
  });
  // The section's line is at the top of the editor viewport (small tolerance).
  expect(Math.abs(caretViewportY)).toBeLessThanOrEqual(4);
});

test("the editor textarea resizes instantly under a held pointer (no sticky lag)", async ({
  page,
}) => {
  await seed(page);
  // No preceding selectOption here, so the click never drops — but open via the
  // shared robust helper for consistency. Editor mounted + visible before we touch
  // its nodes, THEN let the ENTER animation fully release so we measure the resize
  // transition alone.
  await openChronicleEditor(page);
  await page.waitForTimeout(600);
  const dragHadTransition = await page.evaluate(async () => {
    const wrap = document.querySelector(
      'section[aria-labelledby="chronicle-head"] .info-card'
    )?.parentElement as HTMLElement;
    const ta = document.getElementById("chronicle-text") as HTMLTextAreaElement;
    window.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    ta.style.height = `${ta.offsetHeight + 140}px`;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const had = wrap.style.transition.includes("height");
    window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    return had;
  });
  expect(dragHadTransition).toBe(false);
});

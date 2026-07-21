/**
 * Character-sheet PDF renderer + view-model — the resource ledger (page 3+).
 *
 * The view-model has long computed `trackers` (every consumable pool: class
 * resources + magic-item charges), but the renderer never drew them — the export
 * silently dropped the character's trackers. These tests pin that the ledger is
 * now actually drawn (name + pips/count + recovery cadence reach the page), that
 * a trackerless character gets NO empty page, and — the anti-regression pin —
 * that the previously-dead `vm.trackers` field is consumed by the renderer.
 *
 * The render assertions spy on pdf-lib's `PDFPage.drawText` to inspect the exact
 * strings the renderer places (the caption idiom lowercases titles/cadences via
 * the small-caps face, so those are matched case-insensitively). Fast lane: pure
 * node, no jsdom, no Firebase — the VM + renderer are both pure over the fixtures.
 */
import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import i18n from "@/i18n";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import {
  buildCharacterPdfViewModel,
  type CharacterPdfViewModel,
} from "@/lib/pdf/character-pdf-view";
import { renderCharacterPdf } from "@/lib/pdf/character-pdf";

const t = i18n.getFixedT("en");
function spec(key: keyof typeof DEV_SCENARIOS) {
  const s = DEV_SCENARIOS[key];
  if (!s) throw new Error(`missing dev scenario: ${key}`);
  return s;
}
const vmFor = (
  key: keyof typeof DEV_SCENARIOS,
  locale: "en" | "it" = "en"
): CharacterPdfViewModel =>
  buildCharacterPdfViewModel(
    buildScenario(spec(key)),
    locale,
    locale === "en" ? t : i18n.getFixedT("it")
  );

/** Render a VM, capturing every string the renderer draws + the page count. */
async function render(
  vm: CharacterPdfViewModel
): Promise<{ runs: string[]; lower: string[]; pages: number }> {
  const spy = vi.spyOn(PDFPage.prototype, "drawText");
  try {
    const bytes = await renderCharacterPdf(vm);
    const runs = spy.mock.calls.map((c) => c[0]);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    return { runs, lower: runs.map((s) => s.toLowerCase()), pages };
  } finally {
    spy.mockRestore();
  }
}

describe("character-pdf — resource ledger", () => {
  it("draws one row per tracker (name + recovery) on an appended page", async () => {
    const vm = vmFor("orc-barb-15"); // Rage · Intimidating Presence · Adrenaline Rush · Relentless Endurance
    expect(vm.trackers.length).toBe(4);
    const { runs, lower, pages } = await render(vm);

    // the ledger lives on its own appended page (pages 1–2 are pixel-packed)
    expect(pages).toBe(3);
    // the panel title (small-caps → lowercased by the caption idiom)
    expect(lower).toContain(vm.labels.resources.toLowerCase());
    // every tracker name reaches the page — verbatim (drawn bold, not a caption)
    for (const tr of vm.trackers) expect(runs).toContain(tr.label);
    // the recovery cadences are drawn (lowercased small-caps chips)
    expect(lower).toContain("short rest");
    expect(lower).toContain("long rest");
  });

  it("draws the die badge + a numeric pool count with its unit", async () => {
    const { runs } = await render(vmFor("superior-bard-18")); // Bardic Inspiration d12
    expect(runs).toContain("Bardic Inspiration");
    expect(runs).toContain("d12"); // die badge trailing the name

    const { runs: sorc } = await render(vmFor("font-sorcerer")); // Font of Magic — a 10-pt pool
    expect(sorc).toContain("Font of Magic");
    // a pool (isPool / total > 5) renders as "<remaining> / <total> <unit>", not pips
    expect(sorc.some((s) => /\d+ \/ \d+ pts/.test(s))).toBe(true);
  });

  it("adds NO resources page for a character with no trackers", async () => {
    const empty: CharacterPdfViewModel = { ...vmFor("orc-barb-15"), trackers: [] };
    const { lower, pages } = await render(empty);
    expect(pages).toBe(2);
    expect(lower).not.toContain(empty.labels.resources.toLowerCase());
  });

  it("consumes the trackers VM field — guards against dead-code regression", async () => {
    // The field was computed but never read; this pins that the renderer draws
    // it, so a future refactor can't quietly orphan the ledger again.
    const vm = vmFor("multi-spell-items"); // Bardic Inspiration + 4 magic-item charge pools
    expect(vm.trackers.length).toBeGreaterThan(0);
    const { runs } = await render(vm);
    for (const tr of vm.trackers) expect(runs).toContain(tr.label);
  });
});

describe("character-pdf-view — trackers VM", () => {
  it("exposes used / die / unit / isPool / recovery per tracker", () => {
    const bi = vmFor("superior-bard-18").trackers.find(
      (tr) => tr.label === "Bardic Inspiration"
    );
    expect(bi).toMatchObject({
      total: 5,
      used: 4,
      die: "d12",
      isPool: false,
      recovery: "Short Rest",
    });

    const font = vmFor("font-sorcerer").trackers.find(
      (tr) => tr.label === "Font of Magic"
    );
    expect(font).toMatchObject({ isPool: true, unit: "pts", recovery: "Long Rest" });

    const wand = vmFor("multi-spell-items").trackers.find(
      (tr) => tr.label === "Wand of Binding"
    );
    expect(wand?.recovery).toBe("Dawn"); // print fidelity — a daily item-charge pool
  });

  it("localizes the recovery cadence (no raw token, no English leak) in IT", () => {
    const en = vmFor("orc-barb-15").trackers[0]; // Rage — Short Rest
    const it = vmFor("orc-barb-15", "it").trackers[0];
    expect(en?.recovery).toBe("Short Rest");
    expect(it?.recovery).toBe("Riposo Breve");
    // never the raw engine token
    expect(it?.recovery).not.toBe("short-rest");
  });
});

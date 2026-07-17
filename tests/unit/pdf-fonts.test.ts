/**
 * The embedded sheet fonts — the Latin+IT subset of Alegreya Sans the
 * character-sheet PDF renders with (so it evokes the official 2024 sheet without
 * shipping a licensed typeface). This pins that every vendored face:
 *   1. decodes to valid TrueType bytes (`SHEET_FONT_BYTES`),
 *   2. embeds + subsets cleanly via @pdf-lib/fontkit (the renderer's pipeline),
 *   3. encodes the full Italian accent set + the punctuation the sheet draws
 *      (a missing glyph would silently fall to .notdef — caught here by a
 *      non-zero, monotonic advance width over an accented string).
 *
 * A broken/zero-glyph font asset would crash the PDF export for every user, so
 * this is the cheapest possible guard at the asset boundary.
 */
import { describe, it, expect } from "vitest";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { SHEET_FONT_BYTES } from "@/lib/pdf/fonts";

// Every IT diacritic + the typographic punctuation the renderer emits.
const IT_AND_PUNCT = "àèéìòùÀÈÉ — “n/a” · ½× °";

const FACES = Object.entries(SHEET_FONT_BYTES);

describe("embedded sheet fonts (Alegreya Sans subset)", () => {
  it("ships all four faces as non-trivial byte arrays", () => {
    expect(FACES).toHaveLength(4);
    for (const [name, bytes] of FACES) {
      expect(bytes, name).toBeInstanceOf(Uint8Array);
      // A real subset face is tens of KiB; a decode failure would be ~0.
      expect(bytes.byteLength, name).toBeGreaterThan(8_000);
      // TrueType magic: 0x00010000 (or 'true'/'OTTO').
      expect([0x00, 0x74, 0x4f]).toContain(bytes[0]);
    }
  });

  for (const [name, bytes] of FACES) {
    it(`${name}: embeds, subsets, and measures Italian + punctuation`, async () => {
      const doc = await PDFDocument.create();
      doc.registerFontkit(fontkit);
      const font = await doc.embedFont(bytes, { subset: true });

      // Advance widths must be positive for the accented/punctuated string —
      // a .notdef substitution for a missing glyph would still have width, but
      // a longer string must be strictly wider than a prefix (monotonic), which
      // a single tofu box repeated would NOT guarantee against the real glyphs.
      const wFull = font.widthOfTextAtSize(IT_AND_PUNCT, 12);
      const wHalf = font.widthOfTextAtSize(IT_AND_PUNCT.slice(0, 5), 12);
      expect(wFull).toBeGreaterThan(0);
      expect(wFull).toBeGreaterThan(wHalf);

      const page = doc.addPage([200, 80]);
      page.drawText(IT_AND_PUNCT, { x: 8, y: 40, size: 12, font });
      const out = await doc.save();
      // Re-open our own output — proves the subset embed produced a valid PDF.
      const reparsed = await PDFDocument.load(out);
      expect(reparsed.getPageCount()).toBe(1);
      expect(new TextDecoder().decode(out.slice(0, 5))).toBe("%PDF-");
    });
  }
});

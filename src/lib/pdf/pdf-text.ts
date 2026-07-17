/**
 * WinAnsi-safe text for the PDF renderer.
 *
 * The character-sheet PDF (`character-pdf.ts`) uses pdf-lib's **StandardFonts**
 * (the 14 PDF base fonts — Times/Helvetica), which carry NO embedded font bytes,
 * so the lazy PDF chunk stays tiny and the exported file is small. The trade-off:
 * a base font only encodes **WinAnsi (CP-1252 / Latin-1)** — every IT accent
 * (à è é ì ò ù) is covered, but a handful of typographic glyphs the folio uses
 * are NOT: the U+2212 MINUS SIGN the sheet renders for negative modifiers,
 * curly quotes, and en/em dashes. `WinAnsiEncoding` throws on an unencodable
 * codepoint, which would crash the whole export — so we fold those glyphs to
 * their ASCII (or WinAnsi-present) equivalents BEFORE drawing.
 *
 * This is a presentation concern (the PDF is the only surface that can't show a
 * U+2212), so it lives beside the renderer, never in the engine — the on-screen
 * sheet keeps its typographic minus.
 *
 * The class ranges are written with `\uXXXX` escapes (not literal glyphs) so the
 * source file stays plain-ASCII and never trips the no-irregular-whitespace lint.
 */

/**
 * Replace the few non-WinAnsi glyphs the app emits with WinAnsi-safe equivalents
 * so a StandardFont can draw any string the engine/presenters produce. Idempotent
 * and pure. Everything else (all Latin-1, every IT diacritic) passes through.
 */
export function winAnsi(text: string): string {
  return (
    text
      .replace(/\u2212/g, "-") // MINUS SIGN -> hyphen-minus (negative modifiers)
      .replace(/[\u2018\u2019\u201a\u201b]/g, "'") // single curly quotes -> '
      .replace(/[\u201c\u201d\u201e\u201f]/g, '"') // double curly quotes -> "
      .replace(/[\u2013\u2014]/g, "-") // en/em dash -> hyphen
      .replace(/\u2026/g, "...") // ellipsis -> ...
      .replace(/\u00a0/g, " ") // NBSP -> space
      // Proficiency / prepared MARKERS the renderer emits as geometric shapes that
      // WinAnsi can't encode -> fold to WinAnsi-present glyphs that keep the
      // filled / hollow / partial distinction (bullet \u2022 / ring \u00b0 / one-half \u00bd).
      .replace(/[\u25cf\u25c6]/g, "\u2022") // filled circle/diamond (proficient/on) -> bullet
      .replace(/[\u25cb\u25c7]/g, "\u00b0") // hollow circle/diamond (none/off) -> ring
      .replace(/\u25d0/g, "\u00bd")
  ); // half circle (half-proficiency) -> one-half
}

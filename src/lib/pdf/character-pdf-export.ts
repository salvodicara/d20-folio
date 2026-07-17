/**
 * The user-facing PDF-export facade — the counterpart of `character-io.ts`'s
 * JSON export, for the "Export PDF" action (roster card kebab + the cockpit
 * header). It assembles the localized view-model, reads the portrait through the
 * SAME Storage-SDK path the JSON export uses (8s-capped, degrades to no-portrait,
 * never blocks), renders to PDF bytes (pdf-lib — dynamically imported so the
 * renderer chunk never weighs on the app entry bundle), and triggers the browser
 * download.
 *
 * The portrait contract is byte-identical to the JSON export's: read via
 * `portraitToDataUrl` (the Storage SDK, never an HTTP fetch of the opaque
 * display-cache entry), report `portraitDropped` when the character HAD a
 * portrait the SDK couldn't read — the caller surfaces it (never silent).
 */

import type { CharacterDoc } from "@/types/character";
import type { Locale } from "@/lib/locale";
import type { Translate } from "./character-pdf-view";

/** Slugified `<name>.d20-folio.pdf` — mirrors the JSON export filename scheme. */
function pdfFilename(doc: CharacterDoc): string {
  const slug = doc.character.name.toLowerCase().replace(/\s+/g, "-") || "character";
  return `${slug}.d20-folio.pdf`;
}

/** Decode a `data:<mime>;base64,<data>` URL into raw bytes + mime, or null. */
function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const mime = m[1];
  const binary = atob(m[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, mime };
}

/** The rendered PDF + its filename + whether a portrait dropped. */
export interface CharacterPdfExport {
  filename: string;
  bytes: Uint8Array;
  /** Same semantics as the JSON export's `portraitDropped` — see the module doc. */
  portraitDropped: boolean;
}

/**
 * Build the PDF bytes for one character — the single source for both the roster
 * and the cockpit "Export PDF" actions. The view-model assembly + renderer are
 * lazy-imported here so pdf-lib + the SRD-resolving views never weigh on the
 * roster/cockpit initial bundle (a deliberate click pays the one-time fetch).
 */
export async function buildCharacterPdf(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): Promise<CharacterPdfExport> {
  const [{ buildCharacterPdfViewModel }, { renderCharacterPdf }] = await Promise.all([
    import("./character-pdf-view"),
    import("./character-pdf"),
  ]);

  let portrait: { bytes: Uint8Array; mime: string } | null = null;
  let portraitDropped = false;
  if (doc.portraitUrl) {
    // Read through the Storage SDK (never an HTTP fetch of the opaque display
    // cache) — the exact contract the JSON export uses. 8s-capped inside.
    const dataUrl = await (
      await import("@/lib/storage")
    ).portraitToDataUrl(doc.portraitUrl);
    portrait = dataUrl ? decodeDataUrl(dataUrl) : null;
    portraitDropped = portrait === null;
  }

  const vm = buildCharacterPdfViewModel(doc, locale, t);
  const bytes = await renderCharacterPdf(vm, portrait);
  return { filename: pdfFilename(doc), bytes, portraitDropped };
}

/** Trigger a browser download of `bytes` as `filename` (revokes the object URL). */
function triggerDownload(bytes: Uint8Array, filename: string): void {
  // Re-wrap to a fresh ArrayBuffer-backed view so it's a valid BlobPart.
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Render + download the character-sheet PDF. Returns `{ portraitDropped }` so the
 * caller can warn the user when the character had a portrait that couldn't be
 * read (never silent — same rule as the JSON path). The download itself always
 * fires once the bytes are built.
 */
export async function downloadCharacterPdf(
  doc: CharacterDoc,
  locale: Locale,
  t: Translate
): Promise<{ portraitDropped: boolean }> {
  const { filename, bytes, portraitDropped } = await buildCharacterPdf(doc, locale, t);
  triggerDownload(bytes, filename);
  return { portraitDropped };
}

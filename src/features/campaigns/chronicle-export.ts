/**
 * Chronicle export — download the shared campaign log as a portable `.md` file.
 *
 * The chronicle IS already markdown (the single source of truth the editor stores
 * and the reader renders), so the export is a faithful verbatim mirror — no
 * transformation, no re-statement. The only derived value is the filename, kept
 * pure (and unit-tested) and separate from the DOM side effect; the actual save
 * reuses the one shared {@link triggerDownload} primitive.
 */

import { triggerDownload } from "@/lib/download";

/**
 * Derive a safe `.md` filename for a campaign's chronicle export from its name.
 * Lowercased, diacritics stripped (NFD → drop combining marks, so "à" → "a"),
 * every run of non-alphanumerics collapsed to a single dash, trimmed — so
 * "La Compagnia del Carretto (Siciliano)" →
 * `la-compagnia-del-carretto-siciliano-chronicle.md`. A name that slugs to nothing
 * (empty / symbols only) falls back to `chronicle.md`. Pure.
 */
export function chronicleFilename(campaignName: string): string {
  const slug = campaignName
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // drop combining diacritic marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-chronicle.md` : "chronicle.md";
}

/**
 * Download the chronicle's markdown `text` as a `.md` file named after the
 * campaign. A thin DOM wrapper over {@link triggerDownload}; the caller passes the
 * current chronicle text + campaign name (an event handler, never render).
 */
export function downloadChronicleMarkdown(text: string, campaignName: string): void {
  triggerDownload(
    new Blob([text], { type: "text/markdown" }),
    chronicleFilename(campaignName)
  );
}

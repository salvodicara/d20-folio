/**
 * download — the ONE browser-download primitive.
 *
 * A blob → file "Save as" trigger, extracted here so every exporter (character
 * JSON, the bulk `.zip`, the campaign chronicle `.md`, …) shares the same
 * object-URL-revoking download instead of re-spelling the `<a download>` click.
 * Pure DOM, zero app/firebase deps — safe to import from any layer.
 */

/** Trigger a browser download of `blob` as `filename` (revokes the object URL). */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

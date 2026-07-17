/**
 * Character JSON Export & Import — the user-facing facade over the v3 codec.
 *
 * The single supported import/export format is the v3 portable schema
 * (`{ schema: 3, build, state, meta? }`); all the mapping logic lives in
 * `./character-codec`. This module is the thin I/O shell around it: the single-file
 * download (roster kebab → "Export JSON"), the bulk `.zip` export/import, and the
 * `File`/`ArrayBuffer` plumbing. Only the codec exports the facade's callers
 * actually use are re-exported (`serializeCharacter` / `parseCharacter`, the
 * `ImportResult` / `ImportError` result types, `isRecovery`, `sanitizeSession`),
 * so `from "@/lib/character-io"` stays the single I/O entry point (one source —
 * the codec).
 */

import type { CharacterDoc } from "@/types/character";
import { parseCharacter, serializeCharacter } from "./character-codec";
import { triggerDownload } from "./download";

export {
  serializeCharacter,
  parseCharacter,
  isRecovery,
  sanitizeSession,
  type ImportResult,
  type ImportError,
} from "./character-codec";

/**
 * Parse + validate a v3 character export into a partial `CharacterDoc` ready to be
 * created in Firestore. The single import entry point — delegates to the codec
 * (which rejects pre-v3 files with a friendly sentinel and stamps the real AC).
 */
export const importCharacter = parseCharacter;

// ─── Export ───────────────────────────────────────────────────────────────────

/** The per-character export filename (slugified name + the `.d20-folio.json` suffix). */
function exportFilename(doc: CharacterDoc): string {
  const slug = doc.character.name.toLowerCase().replace(/\s+/g, "-") || "character";
  return `${slug}.d20-folio.json`;
}

/** The portable JSON of one character + its filename + whether a portrait dropped. */
export interface CharacterExport {
  filename: string;
  json: string;
  /**
   * True when the character HAD a `portraitUrl` but the image could not be embedded
   * (the Storage read failed — genuinely offline, signed out, or the object is gone).
   * The export still ships (a faceless character beats a failed export), but the
   * caller MUST surface this — a dropped portrait is never silent (the owner's bug).
   */
  portraitDropped: boolean;
}

/**
 * Single-flight lazy Storage-SDK import: ONE module request even when a bulk
 * export runs many characters concurrently. Besides skipping redundant resolver
 * hits, this keeps the vitest module mock deterministic — concurrent dynamic
 * imports of a mocked module race the mock registry and can evaluate the REAL
 * module (which drags in `./firebase` and throws with no Firebase env, as in
 * the SRD-only public tree's CI).
 */
let storageModule: Promise<typeof import("./storage")> | undefined;
function storageMod(): Promise<typeof import("./storage")> {
  return (storageModule ??= import("./storage").catch((error: unknown) => {
    // Never memoize a rejection: one transient chunk-load failure must not
    // poison every later export until a page reload. Clear the memo and
    // rethrow so the next export retries the import.
    storageModule = undefined;
    throw error;
  }));
}

/**
 * Serialize ONE character to its portable v3 JSON + filename, embedding the
 * portrait. The single source for both the single-file download and the bulk ZIP
 * export, so the exact same payload ships either way (every entry re-imports).
 * The portrait is embedded under `meta.portrait` for portability so a shared
 * character keeps its face.
 *
 * The portrait bytes are read through the Storage SDK (`portraitToDataUrl`) —
 * never an HTTP fetch of the download URL, whose service-worker cache entry is
 * opaque and unreadable (the owner's silently-faceless-export bug). The reader is
 * lazy-imported so this module stays statically Firebase-free (CI-pure unit tests
 * import it with no Firebase env), mirroring the lazy `fflate` import below.
 *
 * Reports `portraitDropped` when the character had a portrait the SDK couldn't
 * read (vs. genuinely having none), so the caller can tell the user instead of
 * silently shipping a faceless export — the exact failure the owner hit.
 */
export async function buildCharacterExport(doc: CharacterDoc): Promise<CharacterExport> {
  const portraitBase64 = doc.portraitUrl
    ? await (await storageMod()).portraitToDataUrl(doc.portraitUrl)
    : null;
  return {
    filename: exportFilename(doc),
    json: serializeCharacter(doc, portraitBase64),
    // Had a URL but got nothing back → the image was dropped (not "never had one").
    portraitDropped: Boolean(doc.portraitUrl) && portraitBase64 === null,
  };
}

/**
 * Trigger a browser download for the exported character — the roster card kebab →
 * "Export JSON". Emits the v3 portable format with the portrait embedded.
 *
 * Returns `{ portraitDropped }` so the caller can warn the user when the character
 * had a portrait that couldn't be read (never silent — the owner's "exported, the
 * face is gone" report). The download itself always fires.
 */
export async function downloadCharacterJSON(
  doc: CharacterDoc
): Promise<{ portraitDropped: boolean }> {
  const { filename, json, portraitDropped } = await buildCharacterExport(doc);
  triggerDownload(new Blob([json], { type: "application/json" }), filename);
  return { portraitDropped };
}

/**
 * Pack several characters into a single ZIP of individual `.json` files — the SAME
 * per-character payload as {@link downloadCharacterJSON}, so every entry re-imports
 * cleanly (the roster's {@link importCharactersFromZip} unpacks them). Filenames are
 * de-duplicated (`name.d20-folio.json`, `name-2.d20-folio.json`, …) so same-named
 * characters never clobber each other inside the archive. `fflate` is dynamically
 * imported so the zip codec loads only when a bulk export actually runs — never on
 * the roster's initial bundle (#59/#78). Returns the raw archive bytes (the DOM
 * download is the caller's concern via {@link downloadCharactersZip}), which keeps
 * this unit-testable without a DOM.
 */
export async function buildCharactersZip(
  docs: readonly CharacterDoc[]
): Promise<{ bytes: Uint8Array; portraitsDropped: number }> {
  const exports = await Promise.all(docs.map((d) => buildCharacterExport(d)));
  const { zipSync, strToU8 } = await import("fflate");
  const used = new Map<string, number>();
  const files: Record<string, Uint8Array> = {};
  let portraitsDropped = 0;
  for (const { filename, json, portraitDropped } of exports) {
    if (portraitDropped) portraitsDropped++;
    const seen = (used.get(filename) ?? 0) + 1;
    used.set(filename, seen);
    const name =
      seen === 1
        ? filename
        : filename.replace(/\.d20-folio\.json$/, `-${seen}.d20-folio.json`);
    files[name] = strToU8(json);
  }
  return { bytes: zipSync(files, { level: 6 }), portraitsDropped };
}

/**
 * Bulk-export the given characters as one dated `.zip` download
 * (`d20-folio-characters-YYYY-MM-DD.zip`). No-op on an empty selection. Returns the
 * count of characters whose portrait could not be embedded, so the caller can warn
 * (never silent — same rule as the single-file path).
 */
export async function downloadCharactersZip(
  docs: readonly CharacterDoc[]
): Promise<{ portraitsDropped: number }> {
  if (docs.length === 0) return { portraitsDropped: 0 };
  const { bytes, portraitsDropped } = await buildCharactersZip(docs);
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  triggerDownload(
    // Re-wrap to a fresh ArrayBuffer-backed view so it's a valid BlobPart (fflate's
    // Uint8Array is typed over the union ArrayBufferLike, which Blob rejects).
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
    `d20-folio-characters-${stamp}.zip`
  );
  return { portraitsDropped };
}

// ─── Import ─────────────────────────────────────────────────────────────────

/**
 * Read a File object and return the parsed import result.
 */
export async function importCharacterFromFile(file: File) {
  if (!file.name.endsWith(".json")) {
    return { success: false as const, error: "File must be a .json file." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { success: false as const, error: "File is too large (max 5MB)." };
  }
  try {
    const text = await file.text();
    return parseCharacter(text);
  } catch {
    return { success: false as const, error: "Could not read file." };
  }
}

/**
 * Unpack a `.zip` of exported characters and parse EACH `.json` entry through the
 * same {@link importCharacter} the single-file path uses, in archive order. Returns
 * one result per character entry — the caller commits the successes and reports the
 * tally. `fflate` is dynamically imported so the zip codec stays off the roster
 * bundle (#59/#78). macOS' `__MACOSX/` resource-fork entries are ignored.
 *
 * Errors that abort the WHOLE archive (too large / unreadable / no character files)
 * are returned as a single `ImportError` element so the caller can surface one
 * specific message.
 */
export async function importCharactersFromZip(file: File) {
  if (file.size > 25 * 1024 * 1024) {
    return [{ success: false as const, error: "ZIP is too large (max 25MB)." }];
  }
  let jsons: string[];
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const { unzipSync, strFromU8 } = await import("fflate");
    const unzipped = unzipSync(buf);
    jsons = Object.entries(unzipped)
      .filter(
        ([name]) => name.toLowerCase().endsWith(".json") && !name.startsWith("__MACOSX/")
      )
      .map(([, bytes]) => strFromU8(bytes));
  } catch {
    return [{ success: false as const, error: "Could not read the ZIP archive." }];
  }
  if (jsons.length === 0) {
    return [{ success: false as const, error: "ZIP contains no character files." }];
  }
  return jsons.map((json) => parseCharacter(json));
}

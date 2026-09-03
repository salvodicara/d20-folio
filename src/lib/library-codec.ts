/**
 * library-codec — the PURE, TOTAL parser for the homebrew-library document.
 *
 * `library-io.ts`'s `writeLibrary` is a FULL-DOC overwrite (never a per-entry write),
 * so a read that silently DROPPED a malformed entry would have it permanently erased
 * by the very next unrelated library write — a rename on an unrelated spell, a portrait
 * upload, anything that calls `saveToLibrary`. That is the exact bug class the
 * character codec's totality already closed (`character-codec.ts`,
 * `session-state-codec.ts`): rather than trimming the offending element, the WHOLE
 * document is QUARANTINED with a typed `CodecFailure` (code + exact `path`) and the
 * caller decides what "quarantined" means (`library-io.ts`: don't hydrate the store —
 * `loaded` stays false, so every write path already refuses with `"unavailable"`).
 *
 * PURE — no Firebase, no i18n — registered in `tests/unit/pure-modules-guard.test.ts`
 * so the parser itself is unit-testable with the API key unset, same as the model it
 * sits beside (`library.ts`).
 */
import { fail, CodecFailureError, type CodecFailure } from "@/lib/codec-failure";
import { isItemInstanceId } from "@/lib/item-resources";
import { LIBRARY_KINDS, type LibraryEntry, type LibraryKind } from "@/lib/library";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse one stored entry at `path` (e.g. `entries[3]`) — throws `CodecFailureError`
 *  on any malformed shape, never trims a field and continues. */
function parseLibraryEntry(raw: unknown, path: string): LibraryEntry {
  if (!isRecord(raw)) fail("malformed-entry", path);
  const kind = raw.kind;
  if (typeof kind !== "string" || !LIBRARY_KINDS.includes(kind as LibraryKind)) {
    fail("malformed-entry", `${path}.kind`);
  }
  if (typeof raw.id !== "string" || raw.id === "") {
    fail("malformed-entry", `${path}.id`);
  }
  if (typeof raw.savedAt !== "number" || !Number.isFinite(raw.savedAt)) {
    fail("malformed-entry", `${path}.savedAt`);
  }
  if (typeof raw.item !== "object" || raw.item === null) {
    fail("malformed-entry", `${path}.item`);
  }
  // Every SHEET kind's item carries its own required, stable `instanceId` (never
  // derived from the display name — the combat-P1 identity work); a monster template
  // has no per-item instanceId of its own, so it alone is exempt. `id` is trusted as
  // stored — an OLDER entry may still carry a UUID `id` distinct from its item's
  // `instanceId` (both are individually stable; Task 5's migration aligns them before
  // the deploy that requires it — ADR-0009), so this does NOT also assert
  // `id === item.instanceId`.
  if (kind !== "monster") {
    const item = raw.item as Record<string, unknown>;
    if (!isItemInstanceId(item.instanceId))
      fail("malformed-entry", `${path}.item.instanceId`);
  }
  // Past the `kind` tag the item shape is our own write; every renderer reads it
  // through the same optional-field types the sheet already tolerates.
  return { id: raw.id, savedAt: raw.savedAt, kind, item: raw.item } as LibraryEntry;
}

export type LibraryEntriesParseResult =
  | { ok: true; entries: LibraryEntry[] }
  | { ok: false; failure: CodecFailure };

/**
 * Parse the stored `entries` array — TOTAL. An absent `entries` field means "no
 * library saved yet" (`ok: true, entries: []`, mirroring the doc-absent case); once
 * the field is PRESENT, it must be an array (`invalid-build` at `"entries"` otherwise)
 * and every element must parse (the first malformed one quarantines the whole
 * document — see the module doc for why a partial drop is unsafe here).
 */
export function parseLibraryEntries(
  data: Record<string, unknown>
): LibraryEntriesParseResult {
  if (data.entries === undefined) return { ok: true, entries: [] };
  if (!Array.isArray(data.entries)) {
    return { ok: false, failure: { code: "invalid-build", path: "entries" } };
  }
  try {
    const entries = data.entries.map((raw, i) => parseLibraryEntry(raw, `entries[${i}]`));
    return { ok: true, entries };
  } catch (error) {
    if (error instanceof CodecFailureError) return { ok: false, failure: error.failure };
    throw error;
  }
}

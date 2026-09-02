/**
 * The codec's shared quarantine + unknown-key primitives.
 *
 * Both halves of the persistence codec — `character-codec.ts` (the `build`) and
 * `session-state-codec.ts` (the compact `state`) — raise and collect failures
 * through THIS module, so there is ONE `CodecFailureError` identity: a failure
 * raised deep inside `stateToSession` is caught by `parseCharacterEnvelope`'s
 * single `catch`, and `parsePersistedPlayStateV1` can recognise the same error.
 * (Two module-local copies would have made `instanceof` silently false.)
 *
 * Pure and dependency-free by construction — no Firebase, no SRD, no i18n.
 */

/**
 * Why a stored / imported document could not be decoded, and exactly WHERE. The
 * codec is total: rather than dropping the offending element (which would write a
 * shorter array / map back over a live user's data), the whole document is
 * quarantined with this typed reason. `path` is a dotted/indexed address into the
 * envelope (`build.equipment[3].charges.recovery`, `state.log[2]`).
 *
 * - `malformed-entry` — an element, or one of its fields, has the wrong shape.
 * - `invalid-build` — an envelope member that must be a collection is not an array.
 * - `invalid-item-resources` — the item-resource ledger failed its own parser.
 * - `validation` — the decoded character is missing a must-have field.
 */
export interface CodecFailure {
  code: "malformed-entry" | "invalid-item-resources" | "invalid-build" | "validation";
  path: string;
  detail?: string;
}

/** Thrown by the parsers, caught by the two envelope decoders — never escapes them. */
export class CodecFailureError extends Error {
  readonly failure: CodecFailure;
  constructor(failure: CodecFailure) {
    super(`${failure.code}:${failure.path}`);
    this.name = "CodecFailureError";
    this.failure = failure;
  }
}

export function fail(code: CodecFailure["code"], path: string, detail?: string): never {
  throw new CodecFailureError(detail ? { code, path, detail } : { code, path });
}

/**
 * The keys the parser consumed; everything else on `obj` is preserved verbatim
 * under `unknown` so a document written by a NEWER app version survives a
 * round-trip through this one. `undefined` when the object is fully known — a
 * canonical document must never grow an empty bucket.
 */
export function leftover(
  obj: Record<string, unknown>,
  known: readonly string[]
): Record<string, unknown> | undefined {
  const knownSet = new Set(known);
  let out: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(obj)) {
    if (knownSet.has(key)) continue;
    (out ??= {})[key] = value;
  }
  return out;
}

import {
  parseDefinition,
  parseEntry,
  libraryPath,
  type LibraryDefinition,
  type LibraryVersion,
} from "../library/model";
import { identityId } from "../identity/model";
export type PortableResult =
  | {
      ok: true;
      definition: LibraryDefinition;
      version: LibraryVersion | null;
      original: string;
    }
  | { ok: false; original: string; error: string };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("incompatible-portable");
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (
    Object.keys(value).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(value, k))
  )
    throw new Error("incompatible-portable");
}
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((x, i) => same(x, b[i]))
    );
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.keys(left).every((k) => Object.hasOwn(right, k) && same(left[k], right[k]))
  );
}
function parseVersion(value: unknown): LibraryVersion {
  const v = object(value);
  exact(v, [
    "schema",
    "ownerUid",
    "entryId",
    "version",
    "definition",
    "provenance",
    "operationId",
  ]);
  if (
    v.schema !== 1 ||
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 1 ||
    typeof v.ownerUid !== "string" ||
    typeof v.entryId !== "string" ||
    typeof v.operationId !== "string"
  )
    throw new Error("incompatible-portable");
  libraryPath({ ownerUid: v.ownerUid, id: v.entryId });
  identityId(v.operationId);
  parseDefinition(v.definition);
  if (v.provenance !== null) {
    const provenance = object(v.provenance);
    const source = object(provenance.source);
    exact(source, ["ownerUid", "id"]);
    if (
      [
        provenance.senderUid,
        provenance.offerId,
        provenance.grantId,
        source.ownerUid,
        source.id,
      ].some((x) => typeof x !== "string")
    )
      throw new Error("incompatible-portable");
  }
  parseEntry({
    schema: 1,
    ownerUid: v.ownerUid,
    id: v.entryId,
    revision: 1,
    draft: v.definition,
    stableVersion: v.version,
    provenance: v.provenance,
    lastOperation: { uid: v.ownerUid, opId: v.operationId },
  });
  return structuredClone(v) as unknown as LibraryVersion;
}
/** Exporting a recorded version requires its actual snapshot, never the current draft. */
export function encodePortable(
  definition: LibraryDefinition,
  version?: LibraryVersion
): string {
  const value = parseDefinition(definition),
    stable = version ? parseVersion(version) : null;
  if (stable && !same(stable.definition, value))
    throw new Error("version-definition-mismatch");
  return JSON.stringify(
    {
      format: "d20-folio-homebrew",
      schema: 1,
      kind: stable ? "stable" : "draft",
      definition: value,
      version: stable,
    },
    null,
    2
  );
}
/** Preview only: the caller explicitly creates a draft and retains original for byte-exact recovery. */
export function decodePortable(original: string): PortableResult {
  try {
    if (original.length > 500000) throw new Error("portable-too-large");
    const raw = object(JSON.parse(original));
    if (!Object.hasOwn(raw, "format"))
      return { ok: true, definition: parseDefinition(raw), version: null, original };
    exact(raw, ["format", "schema", "kind", "definition", "version"]);
    if (
      raw.format !== "d20-folio-homebrew" ||
      raw.schema !== 1 ||
      !["draft", "stable"].includes(String(raw.kind))
    )
      throw new Error("incompatible-portable");
    const definition = parseDefinition(raw.definition),
      version = raw.version === null ? null : parseVersion(raw.version);
    if (
      (raw.kind === "stable") !== (version !== null) ||
      (version && !same(version.definition, definition))
    )
      throw new Error("incompatible-portable");
    return { ok: true, definition, version, original };
  } catch {
    return { ok: false, original, error: "incompatible-portable" };
  }
}

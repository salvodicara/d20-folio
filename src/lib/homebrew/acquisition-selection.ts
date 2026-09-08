import { frozen, identityId } from "../identity/model";
import { parseDefinitionSnapshot, type CatalogueVerifier } from "./sources";
import { isOriginFamily, originRecord } from "./origins";
import type { OriginSelection } from "./origin-build";
function fail(): never {
  throw new Error("incompatible-acquisition");
}
const safeInt = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown) => {
  const value = originRecord(v);
  if (
    !value ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)
  )
    return fail();
  return value;
};
const keys = (v: Record<string, unknown>, expected: string[]) => {
  if (
    Object.keys(v).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(v, key))
  )
    fail();
};
/** Same answer/provenance grammar for distinct origin and class aggregate owners. */
export function parseAcquisitionSelection(
  value: unknown,
  family: "origin" | "class",
  verifyCatalogue?: CatalogueVerifier
): OriginSelection {
  const s = record(value);
  keys(s, [
    "id",
    "ordinal",
    "snapshot",
    "answers",
    "exceptions",
    ...(Object.hasOwn(s, "resolvedChoices") ? ["resolvedChoices"] : []),
    ...(family === "class" ? ["classLevel"] : []),
  ]);
  if (Object.hasOwn(s, "resolvedChoices")) {
    for (const [path, snapshots] of Object.entries(record(s.resolvedChoices))) {
      if (
        !path.startsWith("root/") ||
        path.length > 8192 ||
        !Array.isArray(snapshots) ||
        snapshots.length > 32
      )
        fail();
      snapshots.forEach((snapshot) => parseDefinitionSnapshot(snapshot, verifyCatalogue));
    }
  }
  if (typeof s.id !== "string" || !safeInt(s.ordinal)) fail();
  identityId(s.id);
  const snapshot = parseDefinitionSnapshot(s.snapshot, verifyCatalogue);
  if (
    family === "class"
      ? snapshot.definition.family !== "class" || s.classLevel !== 1
      : !isOriginFamily(snapshot.definition.family)
  )
    fail();
  const answers = record(s.answers);
  if (Object.keys(answers).length > 1024) fail();
  for (const [path, answer] of Object.entries(answers)) {
    if (
      !path.startsWith("root/") ||
      path.length > 8192 ||
      !Array.isArray(answer) ||
      answer.length > 32 ||
      answer.some((a) => typeof a !== "string" || a.length > 200) ||
      new Set(answer).size !== answer.length
    )
      fail();
  }
  if (!Array.isArray(s.exceptions) || s.exceptions.length > 128) fail();
  for (const value of s.exceptions) {
    const e = record(value);
    keys(e, ["path", "code", "reason", "authorUid"]);
    if (
      typeof e.path !== "string" ||
      e.path.length > 8192 ||
      typeof e.code !== "string" ||
      e.code.length > 100 ||
      typeof e.reason !== "string" ||
      !e.reason.trim() ||
      e.reason.length > 2000 ||
      typeof e.authorUid !== "string"
    )
      fail();
    identityId(e.authorUid);
  }

  return frozen(structuredClone(s)) as unknown as OriginSelection;
}

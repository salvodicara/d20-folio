import type { LibraryDefinition, LibraryVersion } from "../library/model";
import type { AuthoringDiagnostic } from "./conformance";
import {
  blankClassLevel,
  conformClassPair,
  decodeClassDefinition,
  type ClassData,
  type ClassLevel,
  type ClassLevelSpellcasting,
  type ClassSpellcasting,
  type SubclassData,
} from "./classes";
import type { OriginDependency } from "./origins";

export type SubclassCastingComposition =
  | { ok: false; original: LibraryDefinition; issues: AuthoringDiagnostic[] }
  | {
      ok: true;
      parent: OriginDependency;
      relationship: SubclassData["castingRelationship"];
      policy: ClassSpellcasting;
      rows: { level: number; counts: ClassLevelSpellcasting }[];
    };

/** Static pinned declarations only: no character levels, slot calculator or authority transfer. */
export function composeSubclassCasting(
  definition: LibraryDefinition,
  selectedParent?: LibraryVersion
): SubclassCastingComposition {
  const decoded = decodeClassDefinition(definition);
  if (!decoded.ok) return { ok: false, original: definition, issues: decoded.issues };
  if (decoded.family !== "subclass")
    return {
      ok: false,
      original: definition,
      issues: [{ path: "family", code: "unsupported-family", severity: "unsupported" }],
    };
  if (selectedParent) {
    const issues = conformClassPair(definition, selectedParent);
    if (issues.length) return { ok: false, original: definition, issues };
  }
  // Complete root decoding checks every flat dependency and all parent relationships.
  // The node retains its real source metadata; no fictitious LibraryVersion receipt is created.
  const child = decoded.data;
  const parent = child.dependencies[child.parentClass.dependency];
  const firstRow = child.progression[0];
  if (!parent || !firstRow)
    return {
      ok: false,
      original: definition,
      issues: [
        { path: "parentClass", code: "invalid-parent-class", severity: "invalid" },
      ],
    };
  const parentData = parent.definition.payload.data as unknown as ClassData;
  const first = firstRow.level;
  const levels = [
    ...new Set([...parentData.progression, ...child.progression].map((r) => r.level)),
  ]
    .filter((level) => level >= first)
    .sort((a, b) => a - b);
  const countsAt = (rows: ClassLevel[], level: number) =>
    rows.findLast((r) => r.level <= level)?.spellcasting ??
    blankClassLevel().spellcasting;
  const rows = levels.map((level) => {
    const inherited = countsAt(parentData.progression, level);
    const local = countsAt(child.progression, level);
    const counts =
      child.castingRelationship === "replace"
        ? local
        : child.castingRelationship === "inherit"
          ? inherited
          : {
              ...inherited,
              cantrips: inherited.cantrips + local.cantrips,
              prepared: inherited.prepared + local.prepared,
              known: inherited.known + local.known,
            };
    return { level, counts };
  });
  return structuredClone({
    ok: true,
    parent,
    relationship: child.castingRelationship,
    policy:
      child.castingRelationship === "replace"
        ? child.spellcasting
        : parentData.spellcasting,
    rows,
  });
}

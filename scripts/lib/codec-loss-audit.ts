/**
 * codec-loss-audit — the PURE half of `scripts/audit-codec-loss.ts` (stage 0 of the
 * stage-1 program, the ADR-0009 dry-run): run one stored document through the SAME
 * reader the app loads it with, write it back through the same writer, and name every
 * key the round-trip would lose. No Firebase, no clock, no filesystem.
 *
 * Verdicts:
 *  - `byte-identical` — the re-serialized JSON text equals the input (portable exports
 *    only; a Firestore map has no byte order).
 *  - `equal` — nothing lost, nothing changed (sorted-key equality).
 *  - `loss` — `lost` names every path present before and absent or different after;
 *    `added` names the paths the writer would materialize (defaults), for information.
 *  - `quarantine` — the reader refused the document, with its typed code.
 */
/// <reference types="vite/client" />
import {
  parseCharacter,
  parseCharacterEnvelope,
  serializeCharacter,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { KNOWN_COMBAT_STATE_KEYS, parseCombatState } from "@/lib/combat-state-codec";
import { parseLibraryEntries } from "@/lib/library-codec";
import type { CharacterDoc } from "@/types/character";

export type DocumentKind = "parent" | "snapshot" | "combat-state" | "library";

export type AuditVerdict =
  | { verdict: "byte-identical" | "equal" }
  | { verdict: "loss"; lost: string[]; added: string[] }
  | { verdict: "quarantine"; code: string; path?: string };

const PARENT = /^users\/[^/]+\/characters\/[^/]+$/;
const SNAPSHOT = /^users\/[^/]+\/characters\/[^/]+\/snapshots\/[^/]+$/;
const COMBAT_STATE = /^users\/[^/]+\/characters\/[^/]+\/combat\/state$/;
const LIBRARY = /^users\/[^/]+\/library\/index$/;

/** The stored family a Firestore path belongs to, or `undefined` for anything else. */
export function classifyPath(path: string): DocumentKind | undefined {
  if (PARENT.test(path)) return "parent";
  if (SNAPSHOT.test(path)) return "snapshot";
  if (COMBAT_STATE.test(path)) return "combat-state";
  if (LIBRARY.test(path)) return "library";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every path present in `before` whose value is missing or different in `after`. */
export function diffPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (Array.isArray(before)) {
    if (!Array.isArray(after)) return [prefix];
    return before.flatMap((item, index) =>
      index < after.length
        ? diffPaths(item, after[index], `${prefix}[${index}]`)
        : [`${prefix}[${index}]`]
    );
  }
  if (isRecord(before)) {
    if (!isRecord(after)) return [prefix];
    return Object.keys(before).flatMap((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return key in after ? diffPaths(before[key], after[key], path) : [path];
    });
  }
  return Object.is(before, after) ? [] : [prefix];
}

function compare(before: unknown, after: unknown): AuditVerdict {
  const lost = diffPaths(before, after);
  if (lost.length === 0) return { verdict: "equal" };
  return { verdict: "loss", lost, added: diffPaths(after, before) };
}

/** Parents and snapshots: the codec owns `build` and `state`; the rest is metadata. */
function auditEnvelope(data: Record<string, unknown>): AuditVerdict {
  if (!isRecord(data.build) || !isRecord(data.state)) {
    return { verdict: "quarantine", code: "invalid-envelope" };
  }
  const parsed = parseCharacterEnvelope(data.build, data.state);
  if (!parsed.ok) {
    return {
      verdict: "quarantine",
      code: parsed.failure.code,
      path: parsed.failure.path,
    };
  }
  const again = serializeCharacterEnvelope({
    character: parsed.character,
    session: parsed.session,
  } as CharacterDoc);
  return compare(
    { build: data.build, state: data.state },
    { build: again.build, state: again.state }
  );
}

/** `combat/state` has no pure writer; its closed world is the key list the writer emits. */
function auditCombatState(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseCombatState(data);
  if (!parsed.ok) return { verdict: "quarantine", code: parsed.reason };
  const known = new Set(KNOWN_COMBAT_STATE_KEYS);
  const lost = Object.keys(data).filter((key) => !known.has(key));
  return lost.length === 0 ? { verdict: "equal" } : { verdict: "loss", lost, added: [] };
}

/** `writeLibrary` overwrites the whole document with `{ entries }`. */
function auditLibrary(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseLibraryEntries(data);
  if (!parsed.ok) {
    return {
      verdict: "quarantine",
      code: parsed.failure.code,
      path: parsed.failure.path,
    };
  }
  if (data.entries === undefined) return { verdict: "equal" };
  return compare({ entries: data.entries }, { entries: parsed.entries });
}

export function auditDocument(
  kind: DocumentKind,
  data: Record<string, unknown>
): AuditVerdict {
  switch (kind) {
    case "parent":
    case "snapshot":
      return auditEnvelope(data);
    case "combat-state":
      return auditCombatState(data);
    case "library":
      return auditLibrary(data);
  }
}

/** A portable `{ schema, build, state, meta? }` export, where byte-identity is measurable. */
export function auditPortableExport(json: string): AuditVerdict {
  const res = parseCharacter(json);
  if (!res.success) return { verdict: "quarantine", code: res.error };
  const doc: CharacterDoc = {
    id: "audit",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...res.doc,
  };
  const again = serializeCharacter(doc, res.portraitBase64);
  if (again === json.trimEnd()) return { verdict: "byte-identical" };
  return compare(JSON.parse(json), JSON.parse(again));
}

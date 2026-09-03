/**
 * codec-loss-audit — the PURE half of `scripts/audit-codec-loss.ts` (stage 0 of the
 * stage-1 program, the ADR-0009 dry-run): run one stored document through the SAME
 * reader the app loads it with, write it back through the same writer, and name every
 * key the round-trip would lose. No Firebase, no clock, no filesystem.
 *
 * Verdicts:
 *  - `byte-identical` — the re-serialized JSON text equals the input (portable exports
 *    only; a Firestore map has no byte order).
 *  - `equal` — nothing lost, nothing changed.
 *  - `conformed` — every changed path is one of the codec's DOCUMENTED read seams
 *    (`CODEC_READ_SEAMS`, `SHED_COMBAT_STATE_KEYS`): a retired key discarded, a legacy
 *    shape conformed. Reported with the seams it hit; not a failure.
 *  - `loss` — at least one changed path is on no documented seam: `lost` names every
 *    path present before and absent or different after, `added` the paths the writer
 *    would materialize (an added path off any seam is also a loss — the next write would
 *    change the document — so `lost` may then be empty). A stage-0 blocker.
 *
 * The readers may normalize a stored row IN PLACE (`normalizeLogEntry`), so every audit
 * parses a deep copy and diffs against the untouched original.
 *  - `quarantine` — the reader refused the document, with its typed code.
 */
/// <reference types="vite/client" />
import {
  CODEC_READ_SEAMS,
  parseCharacter,
  parseCharacterEnvelope,
  serializeCharacter,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import {
  KNOWN_COMBAT_STATE_KEYS,
  SHED_COMBAT_STATE_KEYS,
  parseCombatState,
} from "@/lib/combat-state-codec";
import { parseLibraryEntries } from "@/lib/library-codec";
import type { CharacterDoc } from "@/types/character";

export type DocumentKind = "parent" | "snapshot" | "combat-state" | "library";

export type AuditVerdict =
  | { verdict: "byte-identical" | "equal" }
  | { verdict: "conformed"; seams: string[]; lost: string[]; added: string[] }
  | { verdict: "loss"; lost: string[]; added: string[] }
  | { verdict: "quarantine"; code: string; path?: string };

type Seam = { seam: string; pattern: RegExp };

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

/** Every leaf path under a value that vanished entirely (an empty container is a leaf). */
function leafPaths(value: unknown, path: string): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.flatMap((item, index) => leafPaths(item, `${path}[${index}]`));
  }
  if (isRecord(value) && Object.keys(value).length > 0) {
    return Object.keys(value).flatMap((key) => leafPaths(value[key], `${path}.${key}`));
  }
  return [path];
}

/** Every path present in `before` whose value is missing or different in `after`. */
export function diffPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (Array.isArray(before)) {
    if (!Array.isArray(after)) return leafPaths(before, prefix);
    return before.flatMap((item, index) =>
      index < after.length
        ? diffPaths(item, after[index], `${prefix}[${index}]`)
        : leafPaths(item, `${prefix}[${index}]`)
    );
  }
  if (isRecord(before)) {
    if (!isRecord(after)) return leafPaths(before, prefix);
    return Object.keys(before).flatMap((key) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return key in after
        ? diffPaths(before[key], after[key], path)
        : leafPaths(before[key], path);
    });
  }
  return Object.is(before, after) ? [] : [prefix];
}

/** Equal when nothing changed; conformed when every change sits on a documented seam. */
function classify(before: unknown, after: unknown, seams: readonly Seam[]): AuditVerdict {
  const lost = diffPaths(before, after);
  const added = diffPaths(after, before);
  if (lost.length === 0 && added.length === 0) return { verdict: "equal" };
  const hit = new Set<string>();
  for (const path of [...lost, ...added]) {
    const seam = seams.find(({ pattern }) => pattern.test(path));
    if (!seam) return { verdict: "loss", lost, added };
    hit.add(seam.seam);
  }
  return { verdict: "conformed", seams: [...hit].sort(), lost, added };
}

/** Parents and snapshots: the codec owns `build` and `state`; the rest is metadata. */
function auditEnvelope(data: Record<string, unknown>): AuditVerdict {
  if (!isRecord(data.build) || !isRecord(data.state)) {
    return { verdict: "quarantine", code: "invalid-envelope" };
  }
  const copy = structuredClone({ build: data.build, state: data.state });
  const parsed = parseCharacterEnvelope(copy.build, copy.state);
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
  return classify(
    { build: data.build, state: data.state },
    { build: again.build, state: again.state },
    CODEC_READ_SEAMS
  );
}

const SHED_COMBAT_STATE_SEAMS: readonly Seam[] = SHED_COMBAT_STATE_KEYS.map((key) => ({
  seam: "shed-combat-state-key",
  pattern: new RegExp(`^${key}(\\.|\\[|$)`),
}));

/**
 * `combat/state` has no pure writer (it stamps `serverTimestamp()`): the write-back is
 * modelled as the stored keys the writer emits (`KNOWN_COMBAT_STATE_KEYS`, typed against
 * `CombatState`), with the two nested shapes the writer rebuilds field by field (`hp`,
 * `deathSaves`) projected from the parsed state; every other kept field is proven
 * canonical by the reader itself (`presentFieldIsCanonical`, else quarantine).
 */
function auditCombatState(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseCombatState(structuredClone(data));
  if (!parsed.ok) return { verdict: "quarantine", code: parsed.reason };
  const known = new Set(KNOWN_COMBAT_STATE_KEYS);
  const written = {
    ...Object.fromEntries(Object.entries(data).filter(([key]) => known.has(key))),
    hp: { current: parsed.state.hp.current, temp: parsed.state.hp.temp },
    deathSaves: {
      successes: parsed.state.deathSaves.successes,
      failures: parsed.state.deathSaves.failures,
    },
  };
  return classify(data, written, SHED_COMBAT_STATE_SEAMS);
}

/** `writeLibrary` overwrites the WHOLE document with `{ entries }`: a stray top-level key
 *  and an entry-level key outside `{ id, savedAt, kind, item }` are both losses. */
function auditLibrary(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseLibraryEntries(structuredClone(data));
  if (!parsed.ok) {
    return {
      verdict: "quarantine",
      code: parsed.failure.code,
      path: parsed.failure.path,
    };
  }
  return classify(
    data,
    data.entries === undefined ? {} : { entries: parsed.entries },
    []
  );
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
  return classify(JSON.parse(json), JSON.parse(again), CODEC_READ_SEAMS);
}

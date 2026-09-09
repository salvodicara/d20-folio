# Stage 0 — Data Safety Gate on `v2` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close stage 0 of the stage-1 program on `v2`: the closed-world codec, `instanceId`
identity and per-domain sync are on the branch, and a reproducible dry-run proves that the six
team fixtures round-trip byte-identically and that a production export loses nothing.

**Architecture:** P1 items 1–6 were built, reviewed and integrated on `main` (`664200b`…`7b95f24`,
docs to `9b06b75`) after `v2` forked at `77ea77a`; `v2` receives them by one merge commit. The
missing piece is the dry-run itself: the migrations report their own issues, not codec loss. A
small offline audit (`scripts/audit-codec-loss.ts`) runs every stored document family through the
real codecs (parse → serialize) and classifies each document as byte-identical, equal (zero
loss), loss (with the lost key paths) or quarantine (typed code). It reads portable exports, a
tagged migration-kit directory, or a fresh read-only production export written in that same
tagged format; it prints counts, path hashes and codes only.

**Tech Stack:** Node 24 (`node --import ./scripts/alias-loader.mjs`), strict TypeScript,
Vitest 4 (`fast` project), `firebase-admin` (read-only), `scripts/lib/migration-kit.ts`.

**Spec:** [stage-1 program plan](2026-09-03-new-app-stage-1.md) → stage 0 and "Gates";
[target architecture](../specs/2026-09-02-total-combat-automation-design.md) §5.5;
[migration program](2026-09-02-total-combat-automation-migration.md) §P1 exit gate; ADR-0009;
[P1 plan](2026-09-02-combat-p1-data-safety.md) (what was built).

## Global Constraints

- `main` is production and is never touched; work lands on `origin/v2` only (explicit
  `HEAD:refs/heads/v2`); no deploy, no release.
- Every commit: Conventional Commit, owner sole author, one `.changeset/*.md`, owning document
  reconciled in the same commit; never `--no-verify`.
- Output of any script over live data: counts, path hashes (`pathHash`) and issue codes — never a
  payload, never a raw document path, never a uid or character id.
- Private team fixtures are referred to by role, never by file name, in every public artifact.
- The pack seam is not touched; `just ci-srd-only` is not required. Gates for `v2`: `just ci`,
  `pnpm test:rules`, `pnpm exec vite build && pnpm test:budget`; wall time recorded.
- No RNG, no dice, no UI in this stage.

---

### Task 1: Merge `main` (P1 data safety) into `v2`

**Files:**

- Merge: `origin/main` (`9b06b75`) into `v2` (`deab08e`), no conflicts (`git merge-tree` proven).

**Interfaces:**

- Produces on `v2`: `src/lib/character-codec.ts` (`parseCharacterEnvelope`,
  `serializeCharacterEnvelope`, `serializeCharacter`, `parseCharacter`),
  `src/lib/codec-failure.ts`, `src/lib/library-codec.ts` (`parseLibraryEntries`),
  `src/lib/combat-state-codec.ts` (`parseCombatState`), `src/lib/character-snapshot-reconciler.ts`,
  `scripts/lib/migration-kit.ts`, both migration scripts and their tests.

- [x] **Step 1: Confirm the branch and the clean merge**

```bash
git branch --show-current            # v2
git fetch origin main v2
git merge-tree --write-tree origin/v2 origin/main   # prints a tree id, no "CONFLICT"
```

- [x] **Step 2: Merge**

```bash
git merge --no-ff origin/main -m "chore(v2): merge main (P1 data safety) into v2"
```

The merged commits carry their changesets, so the pre-commit doc-guard passes on the merge.

- [x] **Step 3: Baseline the fast lane and the rules lane on the merged tree**

```bash
pnpm test --run tests/unit/character-codec-totality.test.ts tests/unit/character-codec.test.ts content-pack/tests/unit/team-fixtures-new-export.test.ts
pnpm test:rules
```

Expected: all green; the six-fixture byte-identity test passes unchanged.

### Task 2: The pure codec-loss audit core

**Files:**

- Create: `scripts/lib/codec-loss-audit.ts`
- Modify: `src/lib/combat-state-codec.ts` (export `KNOWN_COMBAT_STATE_KEYS`)
- Test: `tests/unit/codec-loss-audit.test.ts`

**Interfaces:**

- Produces:
  - `type DocumentKind = "parent" | "snapshot" | "combat-state" | "library"`
  - `function classifyPath(path: string): DocumentKind | undefined` — Firestore path → kind.
  - `type AuditVerdict = { verdict: "byte-identical" | "equal" } | { verdict: "loss"; lost: string[]; added: string[] } | { verdict: "quarantine"; code: string; path?: string }`
  - `function auditDocument(kind: DocumentKind, data: Record<string, unknown>): AuditVerdict`
  - `function auditPortableExport(json: string): AuditVerdict` (the `--fixtures` path).
  - `function diffPaths(before: unknown, after: unknown, prefix?: string): string[]` — every
    path present in `before` whose value is absent or different in `after`.
  - `const KNOWN_COMBAT_STATE_KEYS: readonly string[]` (from `combat-state-codec.ts`).

- [x] **Step 1: Write the failing tests**

```ts
// tests/unit/codec-loss-audit.test.ts
import { describe, expect, it } from "vitest";
import {
  auditDocument,
  auditPortableExport,
  classifyPath,
  diffPaths,
} from "../../scripts/lib/codec-loss-audit";
import { MOCK_CHARACTER } from "@/lib/mock";
import { serializeCharacter, serializeCharacterEnvelope } from "@/lib/character-codec";
import { customInstanceId } from "./__helpers__/custom-items";

type Env = {
  schema: number;
  build: Record<string, unknown>;
  state: Record<string, unknown>;
};
const envelope = (): Env =>
  structuredClone(serializeCharacterEnvelope(MOCK_CHARACTER)) as Env;
const parentDoc = (env: Env): Record<string, unknown> => ({
  ...env,
  revision: 3,
  cache: { name: "cached" },
  updatedAt: "meta",
});

describe("classifyPath", () => {
  it("maps the four stored families and nothing else", () => {
    expect(classifyPath("users/u/characters/c")).toBe("parent");
    expect(classifyPath("users/u/characters/c/snapshots/s")).toBe("snapshot");
    expect(classifyPath("users/u/characters/c/combat/state")).toBe("combat-state");
    expect(classifyPath("users/u/library/index")).toBe("library");
    expect(classifyPath("users/u/characters/c/public/sheet")).toBeUndefined();
  });
});

describe("diffPaths", () => {
  it("names every path present in before and missing or different in after", () => {
    expect(
      diffPaths({ a: 1, b: { c: [1, 2], d: "x" }, e: null }, { a: 1, b: { c: [1] } })
    ).toEqual(["b.c[1]", "b.d", "e"]);
    expect(diffPaths({ a: 1 }, { a: 1, z: 2 })).toEqual([]);
  });
});

describe("auditDocument — parent and snapshot envelopes", () => {
  it("a canonical parent with unknown keys at every level is equal (zero loss)", () => {
    const env = envelope();
    env.build.zz_future = { deep: [true] };
    env.state.zz_state = 1;
    const equipment = env.build.equipment as Record<string, unknown>[];
    equipment[0]!.zz_entry = "kept";
    expect(auditDocument("parent", parentDoc(env))).toEqual({ verdict: "equal" });
    expect(auditDocument("snapshot", { ...env, reason: "level-up" })).toEqual({
      verdict: "equal",
    });
  });

  it("a one-way normalization is reported as loss with the exact path", () => {
    const env = envelope();
    env.state.round = 5; // the documented one-way boundary (dropped on re-export)
    expect(auditDocument("parent", parentDoc(env))).toEqual({
      verdict: "loss",
      lost: ["state.round"],
      added: [],
    });
  });

  it("a hostile entry quarantines with the typed code and path", () => {
    const env = envelope();
    (env.build.equipment as unknown[]).push({
      instanceId: customInstanceId("bad"),
      name: 42,
    });
    const verdict = auditDocument("parent", parentDoc(env));
    expect(verdict.verdict).toBe("quarantine");
    if (verdict.verdict !== "quarantine") return;
    expect(verdict.code).toBe("malformed-entry");
    expect(verdict.path).toMatch(/^build\.equipment\[\d+\]/);
  });

  it("a parent without build or state is a quarantine, never a crash", () => {
    expect(auditDocument("parent", { schema: 3 }).verdict).toBe("quarantine");
  });
});

describe("auditDocument — combat state", () => {
  const stored = {
    hp: { current: 10, temp: 0 },
    conditions: [],
    initiativeRoll: null,
    deathSaves: { successes: 0, failures: 0 },
    round: 1,
    recentActions: [],
    bardicInspirationDie: "",
    playState: { version: 1, session: {} },
    updatedAt: "server",
  };
  it("a v1 child with only known keys is equal", () => {
    expect(auditDocument("combat-state", stored)).toEqual({ verdict: "equal" });
  });
  it("a key the reader ignores is a loss", () => {
    expect(auditDocument("combat-state", { ...stored, effectOps: [] })).toEqual({
      verdict: "loss",
      lost: ["effectOps"],
      added: [],
    });
  });
  it("a refused child is a quarantine with the reader's reason", () => {
    expect(auditDocument("combat-state", { hp: {} })).toEqual({
      verdict: "quarantine",
      code: "invalid-combat-state",
    });
  });
});

describe("auditDocument — library", () => {
  const entry = {
    id: customInstanceId("blade"),
    savedAt: 1,
    kind: "weapon",
    item: { instanceId: customInstanceId("blade"), name: "Blade", zz: true },
  };
  it("a stored library round-trips equal, unknown item keys included", () => {
    expect(auditDocument("library", { entries: [entry] })).toEqual({ verdict: "equal" });
    expect(auditDocument("library", {})).toEqual({ verdict: "equal" });
  });
  it("an entry-level key the parser drops is a loss", () => {
    expect(auditDocument("library", { entries: [{ ...entry, zz: 1 }] })).toEqual({
      verdict: "loss",
      lost: ["entries[0].zz"],
      added: [],
    });
  });
  it("a malformed entry quarantines with its path", () => {
    expect(auditDocument("library", { entries: [{ id: "x" }] })).toMatchObject({
      verdict: "quarantine",
      path: "entries[0]",
    });
  });
});

describe("auditPortableExport", () => {
  it("the canonical export is byte-identical; a reordered one is equal", () => {
    const canonical = serializeCharacter(MOCK_CHARACTER);
    expect(auditPortableExport(canonical)).toEqual({ verdict: "byte-identical" });
    const parsed = JSON.parse(canonical) as Env;
    expect(
      auditPortableExport(JSON.stringify({ state: parsed.state, ...parsed }))
    ).toEqual({
      verdict: "equal",
    });
  });
  it("invalid JSON and a pre-v3 file are quarantines", () => {
    expect(auditPortableExport("{").verdict).toBe("quarantine");
    expect(
      auditPortableExport(JSON.stringify({ schema: 2, build: {}, state: {} }))
    ).toEqual({
      verdict: "quarantine",
      code: "schema-2-unsupported",
    });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run tests/unit/codec-loss-audit.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/lib/codec-loss-audit'`.

- [x] **Step 3: Export the known combat-state keys**

In `src/lib/combat-state-codec.ts`, next to `STRICT_V1_FIELDS`:

```ts
/** Every top-level key `combatStateWriteData` emits — the closed world of the
 *  `combat/state` document. A stored key outside this list is ignored by the reader
 *  and shed by the next full overwrite; the codec-loss audit reports it. */
export const KNOWN_COMBAT_STATE_KEYS: readonly string[] = [
  "hp",
  "conditions",
  "bardicInspirationDie",
  "heroicInspiration",
  "initiativeRoll",
  "deathSaves",
  "round",
  "recentActions",
  "activeEffects",
  "appliedEncounterEffects",
  "turnEconomy",
  "pendingConcentrationSaves",
  "playState",
  "updatedAt",
];
```

- [x] **Step 4: Write the audit core**

```ts
// scripts/lib/codec-loss-audit.ts
/**
 * codec-loss-audit — the PURE half of `scripts/audit-codec-loss.ts` (stage 0 of the
 * stage-1 program, ADR-0009 dry-run): run one stored document through the SAME codec
 * the app reads it with, write it back through the same serializer, and name every
 * key the round-trip would lose. No Firebase, no clock, no filesystem.
 *
 * Verdicts:
 *  - `byte-identical` — the re-serialized JSON text equals the input (portable
 *    exports only; Firestore maps have no byte order).
 *  - `equal` — the sorted-key JSON is equal: nothing lost, nothing changed.
 *  - `loss` — `lost` names every path present before and absent/different after;
 *    `added` names paths the writer would materialize (defaults), for information.
 *  - `quarantine` — the reader refused the document with its typed code.
 */
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
  return Object.is(before, after) || (before === undefined && after === undefined)
    ? []
    : [prefix];
}

function compare(before: unknown, after: unknown): AuditVerdict {
  const lost = diffPaths(before, after);
  const added = diffPaths(after, before);
  return lost.length === 0 ? { verdict: "equal" } : { verdict: "loss", lost, added };
}

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

function auditCombatState(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseCombatState(data);
  if (!parsed.ok) return { verdict: "quarantine", code: parsed.reason };
  const known = new Set(KNOWN_COMBAT_STATE_KEYS);
  const lost = Object.keys(data).filter((key) => !known.has(key));
  return lost.length === 0 ? { verdict: "equal" } : { verdict: "loss", lost, added: [] };
}

function auditLibrary(data: Record<string, unknown>): AuditVerdict {
  const parsed = parseLibraryEntries(data);
  if (!parsed.ok) {
    return {
      verdict: "quarantine",
      code: parsed.failure.code,
      path: parsed.failure.path,
    };
  }
  // `writeLibrary` overwrites the whole document with `{ entries }`.
  return compare(
    data.entries === undefined ? {} : { entries: data.entries },
    data.entries === undefined ? {} : { entries: parsed.entries }
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

/** A portable `{ schema, build, state, meta? }` export: byte-identity is measurable. */
export function auditPortableExport(json: string): AuditVerdict {
  const res = parseCharacter(json);
  if (!res.success) return { verdict: "quarantine", code: res.error };
  const doc: CharacterDoc = {
    id: "audit",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...res.doc,
  };
  const again = serializeCharacter(doc, res.doc.portrait ?? null);
  if (again === json.trimEnd()) return { verdict: "byte-identical" };
  return compare(JSON.parse(json), JSON.parse(again));
}
```

Check `ImportResult.doc`'s portrait field name in `src/lib/character-codec.ts` (the pack test
`team-fixtures-new-export.test.ts` calls `serializeCharacter(docA)` with the spread `res.doc`;
mirror exactly what makes that test byte-identical).

- [x] **Step 5: Run the tests to verify they pass**

Run: `pnpm test --run tests/unit/codec-loss-audit.test.ts`
Expected: PASS (12 tests). If the `state.round` case does not report `loss`, read
`tests/unit/character-codec.test.ts` → "a legacy state.round imports cleanly" and use the same
legacy field; the detector must be proven non-vacuous by a real one-way seam.

- [x] **Step 6: Typecheck and lint the new files**

```bash
pnpm typecheck
pnpm exec eslint scripts/lib/codec-loss-audit.ts tests/unit/codec-loss-audit.test.ts src/lib/combat-state-codec.ts --max-warnings 0
```

- [x] **Step 7: Commit**

```bash
cat > .changeset/codec-loss-audit-core.md <<'EOF'
---
---

Add the pure codec-loss audit (`scripts/lib/codec-loss-audit.ts`): every stored document family is run through its real reader and writer and classified as byte-identical, equal, loss (with the lost paths) or quarantine (typed code); `combat-state-codec` exports its closed world of keys.
EOF
git add .changeset/codec-loss-audit-core.md scripts/lib/codec-loss-audit.ts tests/unit/codec-loss-audit.test.ts src/lib/combat-state-codec.ts
git commit -m "feat(scripts): pure codec-loss audit over every stored document family"
```

### Task 3: The CLI — fixtures, tagged directory, read-only production export

**Files:**

- Create: `scripts/audit-codec-loss.ts`
- Test: `tests/unit/audit-codec-loss-cli.test.ts` (option parsing and report shaping only)

**Interfaces:**

- Consumes: Task 2's exports; from `scripts/lib/migration-kit.ts`: `decodeFirestoreValue`,
  `discoverDocuments`, `hashFirestoreDocument`, `pathHash`, `readTargetConfiguration`,
  `writeBackupDirectory`, `isRecord`, `type TaggedFirestoreValue`; from
  `scripts/migrate-character-parents.ts`: `packCompositionRefusal`; from
  `scripts/content-pack-mode.ts`: `contentPackEnabled`.
- Produces: `parseAuditOptions(args): { mode: "fixtures" | "backup" | "export"; directory: string }`,
  `buildReport(mode, rows): AuditReport`, and the CLI.

- [x] **Step 1: Write the failing tests**

```ts
// tests/unit/audit-codec-loss-cli.test.ts
import { describe, expect, it } from "vitest";
import { buildReport, parseAuditOptions } from "../../scripts/audit-codec-loss";

describe("audit-codec-loss options", () => {
  it("accepts exactly one absolute directory mode", () => {
    expect(parseAuditOptions(["--fixtures", "/abs"])).toEqual({
      mode: "fixtures",
      directory: "/abs",
    });
    expect(parseAuditOptions(["--backup", "/abs"])).toEqual({
      mode: "backup",
      directory: "/abs",
    });
    expect(parseAuditOptions(["--export", "/abs/new"])).toEqual({
      mode: "export",
      directory: "/abs/new",
    });
    expect(() => parseAuditOptions([])).toThrow("one of");
    expect(() => parseAuditOptions(["--fixtures", "rel"])).toThrow("absolute");
    expect(() => parseAuditOptions(["--fixtures", "/a", "--backup", "/b"])).toThrow(
      "exactly one"
    );
  });
});

describe("audit-codec-loss report", () => {
  it("counts per kind, lists only hashed findings, and fails on any loss or quarantine", () => {
    const report = buildReport("backup", [
      { path: "users/u/characters/a", kind: "parent", verdict: { verdict: "equal" } },
      {
        path: "users/u/characters/b",
        kind: "parent",
        verdict: { verdict: "loss", lost: ["state.round"], added: [] },
      },
      {
        path: "users/u/library/index",
        kind: "library",
        verdict: { verdict: "quarantine", code: "malformed-entry", path: "entries[2]" },
      },
      { path: "users/u/characters/a/public/sheet", kind: undefined, verdict: undefined },
    ]);
    expect(report.mode).toBe("backup");
    expect(report.counts.parent).toEqual({
      documents: 2,
      byteIdentical: 0,
      equal: 1,
      loss: 1,
      quarantine: 0,
    });
    expect(report.counts.library).toEqual({
      documents: 1,
      byteIdentical: 0,
      equal: 0,
      loss: 0,
      quarantine: 1,
    });
    expect(report.skipped).toBe(1);
    expect(report.findings).toEqual([
      {
        document: expect.stringMatching(/^[0-9a-f]{16}$/),
        kind: "parent",
        verdict: "loss",
        lost: ["state.round"],
        added: [],
      },
      {
        document: expect.stringMatching(/^[0-9a-f]{16}$/),
        kind: "library",
        verdict: "quarantine",
        code: "malformed-entry",
        path: "entries[2]",
      },
    ]);
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain("users/u");
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run tests/unit/audit-codec-loss-cli.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write the CLI**

```ts
#!/usr/bin/env node
// scripts/audit-codec-loss.ts
/**
 * Codec-loss audit — the ADR-0009 dry-run for stage 0 of the stage-1 program: prove
 * that the closed-world codecs lose nothing over the six team fixtures and over a
 * production export. Read-only in every mode; nothing is ever written to Firestore.
 *
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --fixtures /absolute/dir      # portable exports: byte-identity measured
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --backup /absolute/dir        # a migration-kit tagged directory (backup or export)
 *   node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
 *     --export /absolute/fresh/private/dir   # read production (service account), write
 *                                            # the tagged directory, then audit it
 *
 * Output: one JSON report — counts per document family, hashed findings, codes and lost
 * key paths. Never a payload, never a raw path, never a uid or character id. Exit 1 on any
 * loss or quarantine, or when the content pack is not composed (a pack-only id would be
 * misread as unknown and reported as loss).
 */

/// <reference types="node" />

import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import { contentPackEnabled } from "./content-pack-mode.ts";
import {
  auditDocument,
  auditPortableExport,
  classifyPath,
  type AuditVerdict,
  type DocumentKind,
} from "./lib/codec-loss-audit.ts";
import {
  decodeFirestoreValue,
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  pathHash,
  readTargetConfiguration,
  writeBackupDirectory,
  type BackupManifest,
  type TaggedFirestoreValue,
} from "./lib/migration-kit.ts";
import { packCompositionRefusal } from "./migrate-character-parents.ts";

export type AuditMode = "fixtures" | "backup" | "export";
export interface AuditOptions {
  mode: AuditMode;
  directory: string;
}

export function parseAuditOptions(args: readonly string[]): AuditOptions {
  const modes: AuditMode[] = ["fixtures", "backup", "export"];
  let chosen: AuditOptions | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const mode = modes.find((candidate) => arg === `--${candidate}`);
    if (!mode) throw new Error(`Unknown argument: ${String(arg)}`);
    if (chosen) throw new Error("Choose exactly one of --fixtures, --backup, --export");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`--${mode} needs a path`);
    if (!isAbsolute(value)) throw new Error(`--${mode} must name an absolute directory`);
    chosen = { mode, directory: resolve(value) };
    index += 1;
  }
  if (!chosen) throw new Error("Choose one of --fixtures, --backup, --export");
  return chosen;
}

export interface AuditRow {
  path: string;
  kind: DocumentKind | undefined;
  verdict: AuditVerdict | undefined;
}
interface KindCounts {
  documents: number;
  byteIdentical: number;
  equal: number;
  loss: number;
  quarantine: number;
}
export interface AuditReport {
  mode: AuditMode;
  counts: Record<DocumentKind, KindCounts>;
  skipped: number;
  findings: Array<{ document: string; kind: DocumentKind } & Record<string, unknown>>;
  ok: boolean;
}

export function buildReport(mode: AuditMode, rows: readonly AuditRow[]): AuditReport {
  const empty = (): KindCounts => ({
    documents: 0,
    byteIdentical: 0,
    equal: 0,
    loss: 0,
    quarantine: 0,
  });
  const counts: Record<DocumentKind, KindCounts> = {
    parent: empty(),
    snapshot: empty(),
    "combat-state": empty(),
    library: empty(),
  };
  const findings: AuditReport["findings"] = [];
  let skipped = 0;
  for (const row of rows) {
    if (!row.kind || !row.verdict) {
      skipped += 1;
      continue;
    }
    const bucket = counts[row.kind];
    bucket.documents += 1;
    const { verdict, ...rest } = row.verdict;
    if (verdict === "byte-identical") bucket.byteIdentical += 1;
    else if (verdict === "equal") bucket.equal += 1;
    else {
      if (verdict === "loss") bucket.loss += 1;
      else bucket.quarantine += 1;
      findings.push({ document: pathHash(row.path), kind: row.kind, verdict, ...rest });
    }
  }
  return { mode, counts, skipped, findings, ok: findings.length === 0 };
}

async function auditFixtures(directory: string): Promise<AuditRow[]> {
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const rows: AuditRow[] = [];
  for (const name of names) {
    const json = await readFile(join(directory, name), "utf8");
    rows.push({
      path: `fixtures/${name}`,
      kind: "parent",
      verdict: auditPortableExport(json),
    });
  }
  return rows;
}

async function auditTaggedDirectory(directory: string): Promise<AuditRow[]> {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8")
  ) as BackupManifest;
  const rows: AuditRow[] = [];
  for (const entry of manifest.documents) {
    const stored = JSON.parse(await readFile(join(directory, entry.file), "utf8")) as {
      data: TaggedFirestoreValue;
    };
    const data = decodeFirestoreValue(stored.data, {
      reference: (path) => ({ __reference: path }),
    });
    const kind = classifyPath(entry.path);
    rows.push({
      path: entry.path,
      kind,
      verdict: kind && isRecord(data) ? auditDocument(kind, data) : undefined,
    });
  }
  return rows;
}

const DISCOVERY = [
  { collectionGroup: "characters", pattern: /^users\/[^/]+\/characters\/[^/]+$/ },
  {
    collectionGroup: "snapshots",
    pattern: /^users\/[^/]+\/characters\/[^/]+\/snapshots\/[^/]+$/,
  },
  {
    collectionGroup: "combat",
    pattern: /^users\/[^/]+\/characters\/[^/]+\/combat\/state$/,
  },
  { collectionGroup: "library", pattern: /^users\/[^/]+\/library\/index$/ },
];

/** Read every audited family from production (read-only) into a fresh private tagged
 *  directory — the same format the migration backups use — then audit that directory. */
async function exportProduction(directory: string): Promise<void> {
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.error(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    const documents = await discoverDocuments(getFirestore(app), DISCOVERY);
    await writeBackupDirectory({
      directory,
      migration: "codec-loss-audit",
      label: "export",
      documents: documents.map((document) => ({
        plan: {
          path: document.source.path,
          before: document.source.data,
          after: document.source.data,
          beforeHash: hashFirestoreDocument(document.source.data),
          afterHash: hashFirestoreDocument(document.source.data),
          changed: false,
        },
        updateTime: document.updateTime,
      })),
    });
    console.error(`Exported ${documents.length} documents`);
  } finally {
    await deleteApp(app);
  }
}

async function run(): Promise<void> {
  const options = parseAuditOptions(processArgv.slice(2));
  const { packSpells } = (await import("@pack")) as { packSpells: readonly unknown[] };
  const refusal = packCompositionRefusal(contentPackEnabled(), packSpells.length);
  if (refusal) throw new Error(refusal);
  if (options.mode === "export") await exportProduction(options.directory);
  const rows =
    options.mode === "fixtures"
      ? await auditFixtures(options.directory)
      : await auditTaggedDirectory(options.directory);
  const report = buildReport(options.mode, rows);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --run tests/unit/audit-codec-loss-cli.test.ts`
Expected: PASS. If importing the CLI module drags `firebase-admin` into the fast lane and the
existing migration tests already do the same (`tests/unit/migrate-character-parents.test.ts`
imports its script), keep it; otherwise move `parseAuditOptions`/`buildReport` into
`scripts/lib/codec-loss-audit.ts`.

- [x] **Step 5: Run the audit over the six team fixtures (composed)**

```bash
node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
  --fixtures "$PWD/content-pack/fixtures/team"
```

Expected: `counts.parent = { documents: 6, byteIdentical: 6, … }`, `ok: true`, exit 0.
(The `__dumps__` subdirectory holds no `.json` at the top level and is not read.)

- [x] **Step 6: Run the audit over the two production backups of 2026-09-03**

```bash
node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
  --backup "$HOME/Documents/d20-folio-migration-backups/2026-09-03-parents"
node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
  --backup "$HOME/Documents/d20-folio-migration-backups/2026-09-03-identity"
```

Expected for the parents backup (post-identity, pre-cutover): 12 parents `equal`; the 12
legacy children may quarantine with `invalid-v1-play-state` (they had no `playState` before the
cutover — a documented pre-migration shape, not a loss). Expected for the identity backup
(pre-identity): parents/snapshots without `instanceId` quarantine with `malformed-entry`. Record
both outcomes as evidence of the readers failing closed, then take the fresh export (next step)
as the stage-0 production proof.

- [x] **Step 7: Fresh read-only production export and audit**

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/the/d20-folio/service-account-key.json \
node --import ./scripts/alias-loader.mjs scripts/audit-codec-loss.ts \
  --export "$HOME/Documents/d20-folio-migration-backups/$(date +%F)-stage0-export"
```

Expected: every parent, snapshot, combat state and library `equal`, `ok: true`, exit 0. The
export directory is private (0700) and outside the repository. A `loss` finding is a stage-0
blocker: fix the codec (preserve the key) with a failing test first, never widen the audit.

- [x] **Step 8: Typecheck, lint, commit**

```bash
pnpm typecheck && pnpm exec eslint scripts/audit-codec-loss.ts tests/unit/audit-codec-loss-cli.test.ts --max-warnings 0
cat > .changeset/codec-loss-audit-cli.md <<'EOF'
---
---

Add `scripts/audit-codec-loss.ts`, the read-only ADR-0009 dry-run: audits portable exports (byte-identity), a tagged migration directory, or a fresh production export written in that format, and reports counts, hashed findings and lost key paths only.
EOF
git add .changeset/codec-loss-audit-cli.md scripts/audit-codec-loss.ts tests/unit/audit-codec-loss-cli.test.ts
git commit -m "feat(scripts): codec-loss audit CLI over fixtures, backups and a production export"
```

### Task 4: Record the gate, run the `v2` gates, push

**Files:**

- Modify: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 0 status line)
- Modify: `docs/PROGRAM_STATUS.md` (a "`v2` — stage 0" receipt under the re-architecture section)
- Modify: `docs/RELEASE.md` → "Migrate before you deploy" (the dry-run command)
- Modify: `docs/CHARACTER_SCHEMA.md` → "Verification (Definition of Done)" item 1 (the audit)
- Create: `.changeset/stage-0-data-safety-gate.md`

- [x] **Step 1: Write the status lines (counts only, no identifiers)**

Stage-1 plan, under stage 0: `**Status (<date>): closed on v2.** main (9b06b75) merged into v2
(<merge sha>); six fixtures byte-identical (6/6); production export dry-run
<parents/snapshots/combat states/libraries counts> — zero loss, zero quarantine
(scripts/audit-codec-loss.ts, ADR-0009).`

PROGRAM_STATUS, after "Automation direction under re-architecture": a short "`v2` — stage 0"
paragraph with the merge SHA, the audit counts and the gate wall times.

RELEASE.md: one paragraph before the migration commands: the codec-loss audit command with
`--export`, when to run it (before every deploy that reads a stored shape), and that a `loss`
finding blocks the deploy.

CHARACTER_SCHEMA item 1: "…for every v3 fixture, and zero loss over a production export
(`scripts/audit-codec-loss.ts`)".

- [x] **Step 2: Run the `v2` gates and time them**

```bash
time just ci
time pnpm test:rules
time (pnpm exec vite build && pnpm test:budget)
```

Expected: all green. Record the three wall times in PROGRAM_STATUS; a `just ci` above 15 minutes
is flagged as a defect for stage 7 (not fixed here).

- [x] **Step 3: Commit and push to `v2`**

```bash
cat > .changeset/stage-0-data-safety-gate.md <<'EOF'
---
---

Close stage 0 of the stage-1 program on `v2`: P1 data safety merged from `main`, six-fixture byte-identity and a zero-loss production export dry-run recorded, the dry-run command added to the release runbook.
EOF
git add -A docs .changeset/stage-0-data-safety-gate.md
git commit -m "docs(v2): close stage 0 — data safety gate proven on fixtures and a production export"
git push origin HEAD:refs/heads/v2
git ls-remote origin refs/heads/v2   # equals HEAD
```

## Self-review

- Spec coverage: stage 0 = P1 items 1–3 on the branch (Task 1), dry-run over the six fixtures
  (Task 3 step 5) and a production export (Task 3 step 7), exit gate "byte-identical fixtures +
  zero drops" recorded where the program reads it (Task 4).
- Placeholders: none; every step carries its command or code.
- Types: `AuditVerdict`, `DocumentKind`, `AuditRow`, `AuditReport` are used with the same names
  across Tasks 2–4.
- Repository guards: no private fixture file name appears in this plan (the fixtures are named
  by role); no payload, uid or character id.

## Execution record (2026-09-03)

- Task 1: merged at `5d1e640`; baseline codec suites green (154 tests).
- Task 2–3: `scripts/lib/codec-loss-audit.ts`, `scripts/audit-codec-loss.ts` and their tests
  landed (`acfc35d`, `f01ed5a`); the first production run reported 25 changes that were all
  documented one-way read seams, two of which the schema document had not enumerated — the codec
  now exports `CODEC_READ_SEAMS` and `SHED_COMBAT_STATE_KEYS`, and the audit reports a change on
  them as `conformed` (`da70eb0`). Six fixtures 6/6 byte-identical; production export of 53
  documents zero loss, zero quarantine (counts in `docs/PROGRAM_STATUS.md`).
- Task 3 step 6 outcome: the two migration backups hold pre-migration shapes and are refused as
  designed (missing `instanceId`, missing play state); the fresh export is the gate input.
- Review (superpowers requesting-code-review, one reviewer, range `5d1e640..3eb0795`): no critical
  issue; three important ones fixed in `e6f8797` — the audit now parses a deep copy (the reader's
  in-place log normalization had masked the `log-entry-normalize` seam), the tracker / log / unit
  seams are anchored to the exact paths their functions rewrite with a negative test each, and
  the combat-state key list is typed against `CombatState` with `hp` / `deathSaves` projected.
  The `conformed` verdict is a recorded deviation from step 7's "never widen the audit": frozen
  snapshots carry retired keys that no write will ever touch, and every seam is enumerated in the
  codec (`CODEC_READ_SEAMS`) rather than in the audit. Minor items carried as follow-ups in
  `docs/PROGRAM_STATUS.md`: a pure `combatStateWriteData` in the codec (deleting the migration
  script's copy), a `skippedKinds` breakdown in the report.

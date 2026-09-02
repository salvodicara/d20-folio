# Combat P1 — Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every stored character safe before any engine change: a total codec that never drops data silently, a stable `instanceId` on every custom item, per-domain snapshot reconciliation with a revision precondition on the parent write, every live parent cut over to one shape, a zero-cost diagnostics layer, and Firestore character-path rules reduced to identity, ownership and shape.

**Architecture:** Phase 1 of the [migration program](2026-09-02-total-combat-automation-migration.md) (§P1). Nothing in `src/lib/combat` changes. The character parent document keeps its `{ schema, build, state, cache, …meta }` envelope but gains `revision` (a monotonic integer the rules compare-and-set) and loses every "unmarked legacy" reading branch. The codec becomes closed-world: unknown keys are preserved in an `unknown` bucket and written back verbatim; a structural failure quarantines the document with a typed `{ code, path }` and a diagnostics report. Identity is `instanceId` everywhere; nothing is keyed by name. Two owner-gated migration scripts move live data **before** the deploy that needs it (ADR-0009).

**Tech Stack:** React 19, strict TypeScript, Zustand, Firebase 12 (Firestore modular SDK, `@firebase/rules-unit-testing`), Vitest 4 (projects `fast`/`slow`), `firebase-admin` for scripts run through `node --import ./scripts/alias-loader.mjs`.

**Spec:** [target architecture](../specs/2026-09-02-total-combat-automation-design.md) §5.3, §5.4, §5.5, §6, §9 · [migration program](2026-09-02-total-combat-automation-migration.md) §P1 · ADR-0005, ADR-0007, ADR-0008, ADR-0009 · [audit](../status/2026-09-02-combat-automation-audit.md) §2.6, §2.7, §5.3.

## Global Constraints

- No dice, no RNG for game outcomes, no LLM, no visual change (golden rule 25). The admin-inbox addition reuses the existing `Section` + list pattern and is owner-only; report it to the owner as such.
- No deploy, no release, no external publishing, no live `--apply`. Scripts default to read-only; the owner runs `--apply --backup` after reading the dry-run report.
- Every persisted-shape change is migrated live before the deploy that reads it (ADR-0009). This plan orders its integrations so every intermediate public/private pair stays valid (see "Integration order").
- Licensing partition: `src/data` and `src/i18n/*/srd` stay SRD-only; the six team fixtures live in the private `content-pack/fixtures/team/` and are edited only through the paired-worktree protocol in `docs/WORKTREES.md`.
- Bilingual: every new user-visible string (admin inbox labels) ships in `src/i18n/en/ui/*.json` and `src/i18n/it/ui/*.json`.
- Layering: `src/lib/**` never imports `features/**`, `app/**`, `components/**`, `hooks/**`, or i18n (`tests/unit/architecture-direction.guard.test.ts`). New pure modules are registered in `tests/unit/pure-modules-guard.test.ts`.
- Tests (ADR-0007): golden replays, one property test per codec, exhaustiveness, ≤ 120 rules cases across `tests/rules/*.test.ts`. Representation tests die with their representations, each deletion named.
- Commits: Conventional Commits, owner sole author (no co-author or trailer), one `.changeset/<slug>.md` per commit (format: `---\n---\n\n<one paragraph>`), the owning document reconciled in the same commit. Never `--no-verify`.
- Gates before each integration: `just ci`, `pnpm test:rules`; `just ci-srd-only` when the pack seam moves (it does, in Task 4).
- Bundle budgets (`tests/unit/bundle-budget.guard.test.ts`): eager ceiling 844 KB gz, entry 65 KB gz. The diagnostics core must stay small (target < 4 KB gz) and its IndexedDB adapter must be lazy.
- Commands: focused tests `pnpm test --run <path>`; rules `pnpm test:rules`; scripts `node --import ./scripts/alias-loader.mjs scripts/<name>.ts`.

## Decisions taken by this plan (and where they are recorded)

| Decision                                                                                                                                                                                                                           | Why                                                                                                                                                                                                                        | Recorded in                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| The parent-write precondition is a stored integer `revision` checked by the rules (`request.resource.data.revision == resource.data.revision + 1` whenever `build`/`state`/`cache` change), not a `runTransaction` on `updatedAt`. | Transactions do not work offline (ADR-0002 context); a rules CAS rides the offline queue and rejects a stale write on reconnect with `permission-denied`, which the save handle now reports. Design §5.3 names `revision`. | migration program §P1.3 (reconciled in Task 7), `docs/ARCHITECTURE.md` |
| Diagnostics reports live in a top-level `diagnostics/{id}` collection (field `uid`), not `users/{uid}/diagnostics/{id}`.                                                                                                           | The admin inbox needs one ordered query; a per-user subcollection needs a collection-group index deployment that neither `firebase.json` nor `deploy.yml` manages. Same rule shape as `bug_reports`.                       | ADR-0008 amendment (Task 2), design §5.1 and §9                        |
| `playStateVersion: 1` stays as a **dead stored field** after P1; the code and the rules stop reading it. It is deleted from documents by the P3 `combat/state` v2 migration.                                                       | Deleting the field during the migration would make the still-deployed client treat migrated parents as legacy (empty `state`) and write spent resources back as unspent during the migration→deploy window.                | `docs/CHARACTER_SCHEMA.md` appendix, migration program §P3 deletions   |
| `isCampaignDmDetach` (the DM clearing a member's `attachedCampaignId`) stays, isolated, until the P4 lease replaces it.                                                                                                            | `campaign-io.ts:565` (remove member) and `:3511` (delete campaign) write that one field on a member's parent in a transaction; deleting the predicate now breaks both flows. It is membership, not gameplay.               | migration program §P4 deletions                                        |
| A custom entry's `instanceId` is **required** by the codec after Task 4; there is no minting reader.                                                                                                                               | Golden rule 10 (no compatibility shims). Unknown-key preservation from Task 3 is the bridge that keeps every intermediate public/private pair valid.                                                                       | `docs/CHARACTER_SCHEMA.md`                                             |
| Nested authored arrays inside a custom feature (`contentBlocks`, `trackers`, `actions`) are validated as arrays of records in P1, not field-by-field.                                                                              | Their element shapes belong to the mechanics authoring format that P2/P3 replace (ADR-0006); pinning them now would be a representation test.                                                                              | this plan                                                              |

## File structure

| Path                                                    | Responsibility                                                                                                                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/diagnostics/types.ts`                          | `DiagnosticsLevel`, `DiagnosticsContext`, `Breadcrumb`, `DiagnosticsReport` (pure types)                                                                                                    |
| `src/lib/diagnostics/ring.ts`                           | fixed-capacity ring buffer (pure)                                                                                                                                                           |
| `src/lib/diagnostics/redact.ts`                         | email/token/identifier redaction (pure; `features/report/error-log.ts` and `crash-report.ts` import it)                                                                                     |
| `src/lib/diagnostics/logger.ts`                         | the structured logger singleton: context, `log()`, `onErrorReport()` listeners, 500-breadcrumb ring, report assembly ≤ 32 KiB (pure)                                                        |
| `src/lib/diagnostics/idb.ts`                            | IndexedDB persistence of the breadcrumb ring (thin, try/catch, coverage-excluded like `log-persistence.ts`)                                                                                 |
| `src/lib/diagnostics-io.ts`                             | Firestore seam: `installDiagnosticsReporter`, `listDiagnostics`, `purgeDiagnostics`                                                                                                         |
| `src/lib/character-codec.ts`                            | total parsers: typed failures with path, `unknown` buckets, no silent `continue`; `instanceId` required on customs                                                                          |
| `src/lib/session-state-codec.ts`                        | `state.unknown` preservation                                                                                                                                                                |
| `src/lib/character-minimal.ts`                          | `unknown` passthrough on minimize/rehydrate                                                                                                                                                 |
| `src/types/character.ts`                                | `instanceId` on the four custom types, `unknown?` buckets, `CharacterDoc.revision`, `playStateVersion` removed                                                                              |
| `src/lib/library.ts`, `src/stores/libraryStore.ts`      | identity by `instanceId`/`id`; name identity deleted                                                                                                                                        |
| `src/lib/character-snapshot-reconciler.ts`              | per-domain (parent/child) pending-vs-remote reconciliation (pure)                                                                                                                           |
| `src/lib/firestore.ts`                                  | metadata on `subscribeToCharacter`, save callbacks, `revision` on every build write, legacy branches deleted, quarantine → diagnostics                                                      |
| `src/hooks/useCharacterSubscription.ts`                 | reconciler wiring, revision bump, conflict → `SaveStatus="error"`                                                                                                                           |
| `src/lib/combat-state-io.ts`, `src/lib/combat-state.ts` | `includeMetadataChanges`, `playState` required, `PlayStateOwnership` deleted                                                                                                                |
| `scripts/lib/migration-kit.ts`                          | shared migration protocol: target assertion, CLI, hashing, discovery, backup, guarded batch, verify                                                                                         |
| `scripts/migrate-custom-identity.ts`                    | stamps `instanceId` on custom entries of parents, snapshots and library docs; `--fixtures <dir>` mode                                                                                       |
| `scripts/migrate-character-parents.ts`                  | legacy → v1 cutover (state into `combat/state.playState`, child created when absent) + `revision: 0` on every parent                                                                        |
| `firestore.rules`                                       | character paths: owner/admin/co-member, `revision` CAS, `state` empty, literal `combat/state`, diagnostics create-only; `playStateVersion*`, `peerLegacyCoreCreate`, third disjunct deleted |
| `tests/rules/firestore-rules.test.ts`                   | access-matrix suites, ≤ 107 cases (storage suite keeps 13)                                                                                                                                  |
| `src/features/account/AdminPage.tsx`                    | `DiagnosticsInbox` section                                                                                                                                                                  |

## Integration order (two public integrations, one private push)

1. **Integration A (public):** Tasks 1, 2, 3 — diagnostics and the total codec with unknown-key preservation. Old private pack (Talon without `instanceId`) + new public = valid (optional keys, nothing required yet).
2. **Private push:** Task 4b — the Talon fixture gains `"instanceId"` as its **last** key. New private + public A = valid (the unknown bucket serializes last, byte-identity holds).
3. **Integration B (public):** Tasks 4a, 4c, 5, 6, 7, 8 — `instanceId` required, scripts, reconciler, revision, deletions, rules. New public + new private = valid.

Each integration: rebase on fresh `origin/main`, `just ci`, `pnpm test:rules`, `just ci-srd-only` (B only), `git push origin HEAD:main`, poll `git ls-remote origin main` for the SHA.

---

### Task 1: Diagnostics core (pure logger, ring, report)

**Files:**

- Create: `src/lib/diagnostics/types.ts`, `src/lib/diagnostics/ring.ts`, `src/lib/diagnostics/redact.ts`, `src/lib/diagnostics/logger.ts`, `src/lib/diagnostics/idb.ts`, `src/lib/diagnostics/index.ts`
- Modify: `src/features/report/error-log.ts:50-54` (import `redact` from the lib), `src/features/report/crash-report.ts:45-49` (import `redactIdentifiers`), `tests/unit/pure-modules-guard.test.ts:53` (register the pure modules), `vitest.config.ts:139` (coverage-exclude `src/lib/diagnostics/idb.ts`)
- Test: `tests/unit/diagnostics/ring.test.ts`, `tests/unit/diagnostics/logger.test.ts`

**Interfaces:**

- Produces:
  - `type DiagnosticsLevel = "debug" | "info" | "warn" | "error"`
  - `interface DiagnosticsContext { sessionId: string; buildSha: string; appVersion: string; uid?: string; characterId?: string; campaignId?: string; encounterId?: string; actionId?: string }`
  - `interface Breadcrumb { t: number; level: DiagnosticsLevel; event: string; data?: Record<string, unknown>; characterId?: string; campaignId?: string; encounterId?: string; actionId?: string }`
  - `interface DiagnosticsReport { schema: 1; uid: string; level: "error"; event: string; message: string; createdAtMs: number; context: DiagnosticsContext; breadcrumbs: Breadcrumb[] }`
  - `setDiagnosticsContext(patch: Partial<DiagnosticsContext>): void`, `getDiagnosticsContext(): DiagnosticsContext`
  - `diagnosticsLog(level, event, data?): void` — records a breadcrumb; on `level === "error"` builds a report and calls every listener
  - `onErrorReport(listener: (report: DiagnosticsReport) => void): () => void`
  - `breadcrumbSnapshot(): Breadcrumb[]`, `resetDiagnostics(): void` (tests)
  - `buildReport(args): DiagnosticsReport` (exported for tests) — trims oldest breadcrumbs until the JSON is ≤ `REPORT_MAX_BYTES = 32 * 1024`
  - `redact(text: string): string`, `redactIdentifiers(text: string): string`
  - `idb.ts`: `persistBreadcrumbs(list: Breadcrumb[]): Promise<void>`, `loadBreadcrumbs(): Promise<Breadcrumb[] | null>`

- [ ] **Step 1: Write the failing ring + logger tests**

`tests/unit/diagnostics/ring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRing } from "@/lib/diagnostics/ring";

describe("diagnostics ring", () => {
  it("keeps the last `capacity` entries oldest → newest", () => {
    const ring = createRing<number>(3);
    for (const n of [1, 2, 3, 4, 5]) ring.push(n);
    expect(ring.snapshot()).toEqual([3, 4, 5]);
    expect(ring.size()).toBe(3);
  });

  it("snapshot is a defensive copy and clear empties it", () => {
    const ring = createRing<string>(2);
    ring.push("a");
    const snap = ring.snapshot();
    snap.push("zzz");
    expect(ring.snapshot()).toEqual(["a"]);
    ring.clear();
    expect(ring.snapshot()).toEqual([]);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => createRing(0)).toThrow(RangeError);
  });
});
```

`tests/unit/diagnostics/logger.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildReport,
  breadcrumbSnapshot,
  diagnosticsLog,
  getDiagnosticsContext,
  onErrorReport,
  REPORT_MAX_BYTES,
  resetDiagnostics,
  setDiagnosticsContext,
  type DiagnosticsReport,
} from "@/lib/diagnostics";
import { redact, redactIdentifiers } from "@/lib/diagnostics/redact";

beforeEach(() => {
  resetDiagnostics();
  setDiagnosticsContext({
    sessionId: "s1",
    buildSha: "abc",
    appVersion: "1.0.0",
    uid: "u1",
  });
});

describe("diagnostics logger", () => {
  it("stamps every breadcrumb with the correlation ids present at log time", () => {
    setDiagnosticsContext({ characterId: "c1", campaignId: "camp1" });
    diagnosticsLog("info", "sheet.open", { tab: "play" });
    setDiagnosticsContext({ characterId: undefined });
    diagnosticsLog("debug", "sheet.close");
    const [first, second] = breadcrumbSnapshot();
    expect(first).toMatchObject({
      event: "sheet.open",
      characterId: "c1",
      campaignId: "camp1",
      data: { tab: "play" },
    });
    expect(second).toMatchObject({ event: "sheet.close", campaignId: "camp1" });
    expect(second).not.toHaveProperty("characterId");
  });

  it("an error-level event builds a report for every listener and keeps logging", () => {
    const seen: DiagnosticsReport[] = [];
    const off = onErrorReport((r) => seen.push(r));
    diagnosticsLog("warn", "codec.unknown-keys", { path: "build.equipment[2]" });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    off();
    diagnosticsLog("error", "character.quarantine", { code: "x", path: "y" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      schema: 1,
      uid: "u1",
      level: "error",
      event: "character.quarantine",
      message: "malformed-entry at build.spells[0]",
      context: { sessionId: "s1", buildSha: "abc", appVersion: "1.0.0", uid: "u1" },
    });
    expect(seen[0].breadcrumbs.map((b) => b.event)).toEqual([
      "codec.unknown-keys",
      "character.quarantine",
    ]);
  });

  it("does not build a report without a uid (nothing to attribute, nothing to write)", () => {
    setDiagnosticsContext({ uid: undefined });
    let calls = 0;
    onErrorReport(() => calls++);
    diagnosticsLog("error", "boot.failed");
    expect(calls).toBe(0);
    expect(breadcrumbSnapshot()).toHaveLength(1);
  });

  it("holds at most 500 breadcrumbs", () => {
    for (let i = 0; i < 700; i++) diagnosticsLog("debug", `tick.${i}`);
    const snap = breadcrumbSnapshot();
    expect(snap).toHaveLength(500);
    expect(snap[0].event).toBe("tick.200");
  });

  it("caps a report at 32 KiB by dropping the oldest breadcrumbs, never the newest", () => {
    const big = "x".repeat(400);
    for (let i = 0; i < 500; i++) diagnosticsLog("debug", `big.${i}`, { big });
    const report = buildReport({
      uid: "u1",
      event: "e",
      message: "m",
      context: getDiagnosticsContext(),
      breadcrumbs: breadcrumbSnapshot(),
      now: 1,
    });
    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThanOrEqual(
      REPORT_MAX_BYTES
    );
    expect(report.breadcrumbs.at(-1)?.event).toBe("big.499");
    expect(report.breadcrumbs.length).toBeGreaterThan(10);
  });

  it("redacts emails, long tokens and document identifiers in messages and data", () => {
    expect(redact("mail me a@b.io token " + "A".repeat(48))).toBe(
      "mail me [email] token [redacted]"
    );
    expect(redactIdentifiers("denied users/abc123/characters/def456")).toBe(
      "denied users/[uid]/characters/[id]"
    );
    diagnosticsLog("error", "save.denied", { message: "users/u1/characters/c1 a@b.io" });
    expect(breadcrumbSnapshot()[0].data?.message).toBe(
      "users/[uid]/characters/[id] [email]"
    );
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test --run tests/unit/diagnostics/`
Expected: FAIL — `Cannot find module '@/lib/diagnostics/ring'` and `'@/lib/diagnostics'`.

- [ ] **Step 3: Implement the pure core**

`src/lib/diagnostics/types.ts`:

```ts
export type DiagnosticsLevel = "debug" | "info" | "warn" | "error";

/** Correlation ids stamped on every breadcrumb and report (design §9). */
export interface DiagnosticsContext {
  sessionId: string;
  buildSha: string;
  appVersion: string;
  uid?: string;
  characterId?: string;
  campaignId?: string;
  encounterId?: string;
  actionId?: string;
}

export interface Breadcrumb {
  /** Epoch ms. */
  t: number;
  level: DiagnosticsLevel;
  /** Dotted event name, e.g. `character.quarantine`. */
  event: string;
  /** Small, JSON-plain, already redacted. */
  data?: Record<string, unknown>;
  characterId?: string;
  campaignId?: string;
  encounterId?: string;
  actionId?: string;
}

/** What is written to `diagnostics/{id}` on an error-level event. */
export interface DiagnosticsReport {
  schema: 1;
  uid: string;
  level: "error";
  event: string;
  message: string;
  createdAtMs: number;
  context: DiagnosticsContext;
  breadcrumbs: Breadcrumb[];
}
```

`src/lib/diagnostics/ring.ts`:

```ts
export interface Ring<T> {
  push(value: T): void;
  snapshot(): T[];
  size(): number;
  clear(): void;
}

/** Fixed-capacity FIFO: the newest `capacity` values, oldest first on snapshot. */
export function createRing<T>(capacity: number): Ring<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("ring capacity must be a positive integer");
  }
  const slots: T[] = [];
  let start = 0;
  return {
    push(value) {
      if (slots.length < capacity) {
        slots.push(value);
        return;
      }
      slots[start] = value;
      start = (start + 1) % capacity;
    },
    snapshot() {
      return [...slots.slice(start), ...slots.slice(0, start)];
    },
    size() {
      return slots.length;
    },
    clear() {
      slots.length = 0;
      start = 0;
    },
  };
}
```

`src/lib/diagnostics/redact.ts` (the two regexes moved from `features/report/error-log.ts:50-54` and `crash-report.ts:45-49`):

```ts
/** Best-effort hygiene: emails and long token-like runs never reach a report. */
export function redact(text: string): string {
  return text
    .replace(/\b[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted]");
}

/** Document identifiers are correlation data, not report prose. */
export function redactIdentifiers(text: string): string {
  return text
    .replace(/users\/[^/\s]+/g, "users/[uid]")
    .replace(/\/characters\/[^/\s]+/g, "/characters/[id]")
    .replace(/\/campaigns\/[^/\s]+/g, "/campaigns/[id]")
    .replace(/\/join\/[^/\s]+/g, "/join/[code]");
}

export function redactAll(text: string): string {
  return redact(redactIdentifiers(text));
}
```

`src/lib/diagnostics/logger.ts`:

```ts
import { createRing } from "./ring";
import { redactAll } from "./redact";
import type {
  Breadcrumb,
  DiagnosticsContext,
  DiagnosticsLevel,
  DiagnosticsReport,
} from "./types";

export const BREADCRUMB_CAPACITY = 500;
export const REPORT_MAX_BYTES = 32 * 1024;
const MAX_MESSAGE_CHARS = 2000;

let context: DiagnosticsContext = { sessionId: "", buildSha: "", appVersion: "" };
const ring = createRing<Breadcrumb>(BREADCRUMB_CAPACITY);
const listeners = new Set<(report: DiagnosticsReport) => void>();
let clock: () => number = () => Date.now();

export function setDiagnosticsContext(patch: Partial<DiagnosticsContext>): void {
  const next: DiagnosticsContext = { ...context };
  for (const [key, value] of Object.entries(patch) as [
    keyof DiagnosticsContext,
    string | undefined,
  ][]) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  context = next;
}

export function getDiagnosticsContext(): DiagnosticsContext {
  return { ...context };
}

function redactData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = typeof value === "string" ? redactAll(value) : value;
  }
  return out;
}

function messageFor(event: string, data?: Record<string, unknown>): string {
  const code = data?.code ?? data?.message ?? data?.reason;
  const path = data?.path;
  const head = typeof code === "string" ? code : event;
  const text = typeof path === "string" ? `${head} at ${path}` : head;
  return redactAll(text).slice(0, MAX_MESSAGE_CHARS);
}

/** Record a breadcrumb; an error-level event also fans a report out to the listeners. */
export function diagnosticsLog(
  level: DiagnosticsLevel,
  event: string,
  data?: Record<string, unknown>
): void {
  const crumb: Breadcrumb = { t: clock(), level, event };
  if (data) crumb.data = redactData(data);
  for (const key of ["characterId", "campaignId", "encounterId", "actionId"] as const) {
    if (context[key]) crumb[key] = context[key];
  }
  ring.push(crumb);
  if (level !== "error" || !context.uid || listeners.size === 0) return;
  const report = buildReport({
    uid: context.uid,
    event,
    message: messageFor(event, data),
    context: getDiagnosticsContext(),
    breadcrumbs: ring.snapshot(),
    now: clock(),
  });
  for (const listener of listeners) listener(report);
}

export function onErrorReport(listener: (report: DiagnosticsReport) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function breadcrumbSnapshot(): Breadcrumb[] {
  return ring.snapshot();
}

/** Seed the ring from a persisted snapshot (previous page load), oldest first. */
export function seedBreadcrumbs(crumbs: readonly Breadcrumb[]): void {
  for (const crumb of crumbs) ring.push(crumb);
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export function buildReport(args: {
  uid: string;
  event: string;
  message: string;
  context: DiagnosticsContext;
  breadcrumbs: Breadcrumb[];
  now: number;
}): DiagnosticsReport {
  const report: DiagnosticsReport = {
    schema: 1,
    uid: args.uid,
    level: "error",
    event: args.event,
    message: args.message.slice(0, MAX_MESSAGE_CHARS),
    createdAtMs: args.now,
    context: args.context,
    breadcrumbs: [...args.breadcrumbs],
  };
  while (report.breadcrumbs.length > 0 && byteLength(report) > REPORT_MAX_BYTES) {
    // Drop from the oldest end in chunks so a 500-crumb ring trims in a few passes.
    report.breadcrumbs.splice(0, Math.max(1, Math.floor(report.breadcrumbs.length / 8)));
  }
  return report;
}

/** Tests only. */
export function resetDiagnostics(now: () => number = () => Date.now()): void {
  context = { sessionId: "", buildSha: "", appVersion: "" };
  ring.clear();
  listeners.clear();
  clock = now;
}
```

`src/lib/diagnostics/idb.ts` (same shape as `src/lib/log-persistence.ts`; DB `d20-folio-diagnostics`, store `breadcrumbs`, key `"ring"`; every call `try/catch` → no-op):

```ts
import type { Breadcrumb } from "./types";

const DB_NAME = "d20-folio-diagnostics";
const DB_VERSION = 1;
const STORE = "breadcrumbs";
const KEY = "ring";
let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(String(request.error)));
  });
  return dbPromise;
}

export async function persistBreadcrumbs(list: readonly Breadcrumb[]): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put([...list], KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(String(tx.error)));
    });
  } catch {
    // IndexedDB unavailable (private mode, quota) — breadcrumbs stay in memory.
  }
}

export async function loadBreadcrumbs(): Promise<Breadcrumb[] | null> {
  try {
    const db = await getDB();
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () =>
        resolve(Array.isArray(request.result) ? (request.result as Breadcrumb[]) : null);
      request.onerror = () => reject(new Error(String(request.error)));
    });
  } catch {
    return null;
  }
}
```

`src/lib/diagnostics/index.ts` re-exports everything from `types`, `logger`, `redact` (not `idb` — that stays a lazy import for the installer in Task 2).

Then: in `src/features/report/error-log.ts` delete the local `redact` and `import { redact } from "@/lib/diagnostics/redact"`; in `crash-report.ts` replace `redactIdentifiers` with the lib import. Add to `PURE_MODULES` in `tests/unit/pure-modules-guard.test.ts`: `"src/lib/diagnostics/logger.ts"`, `"src/lib/diagnostics/ring.ts"`, `"src/lib/diagnostics/redact.ts"`, `"src/lib/diagnostics/index.ts"`. Add `"src/lib/diagnostics/idb.ts", // IndexedDB wrapper` to the coverage `exclude` list in `vitest.config.ts` next to `log-persistence.ts`.

- [ ] **Step 4: Run the tests and the guards**

Run: `pnpm test --run tests/unit/diagnostics/ tests/unit/pure-modules-guard.test.ts tests/unit/error-log.test.ts tests/unit/architecture-direction.guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cat > .changeset/diagnostics-core.md <<'EOF'
---
---

Add the pure diagnostics core (structured logger with correlation ids, 500-breadcrumb ring, 32 KiB report builder, shared redaction) under `src/lib/diagnostics` (ADR-0008).
EOF
git add src/lib/diagnostics tests/unit/diagnostics src/features/report/error-log.ts src/features/report/crash-report.ts tests/unit/pure-modules-guard.test.ts vitest.config.ts .changeset/diagnostics-core.md
git commit -m "feat(diagnostics): pure logger, breadcrumb ring and report builder"
```

---

### Task 2: Diagnostics IO, `diagnostics/{id}` rule, admin inbox section, error wiring

**Files:**

- Create: `src/lib/diagnostics-io.ts`, `src/i18n/en/ui/diagnostics.json`, `src/i18n/it/ui/diagnostics.json`
- Modify: `firestore.rules` (new `match /diagnostics/{id}` block after `bug_reports`), `src/main.tsx:81` (install after `installErrorLog()`), `src/features/report/error-log.ts` (`record()` also logs an error breadcrumb), `src/features/account/AdminPage.tsx:188-200,523-526` (load + section), `src/lib/firestore.ts` (`saveStatusCallbacks.onError` sites also `diagnosticsLog("error", …)`), `src/hooks/useCharacterSubscription.ts:365` (`quarantine` logs), `src/lib/combat-state-io.ts:602-635` (parse failure logs), `docs/adr/0008-diagnostics-zero-cost.md` (amendment), `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5.1 row + §9, `docs/ARCHITECTURE.md` (new "Diagnostics" subsection under "Persistence + offline")
- Test: `tests/unit/diagnostics-io.test.ts`, `tests/rules/firestore-rules.test.ts` (new describe, 4 cases), `tests/unit/admin-page.test.tsx` (1 case)

**Interfaces:**

- Consumes: `onErrorReport`, `setDiagnosticsContext`, `seedBreadcrumbs`, `breadcrumbSnapshot`, `DiagnosticsReport` from Task 1.
- Produces:
  - `installDiagnosticsReporter(deps: { storage: Pick<Storage, "getItem" | "setItem">; write: (report: DiagnosticsReport) => Promise<void> }): () => void` — subscribes to error reports, enforces `MAX_REPORTS_PER_USER_BUILD = 50` (key `d20-folio-diagnostics:${uid}:${buildSha}`), `MAX_REPORTS_PER_SESSION = 10`, dedupes identical `event+message` within a session, never throws.
  - `writeDiagnosticsReport(report): Promise<void>` — `setDoc(doc(collection(db, "diagnostics")), { ...report, createdAt: serverTimestamp() })`.
  - `installDiagnostics(): void` — production installer used by `main.tsx`: sets `sessionId` (`crypto.randomUUID()`), `buildSha: __GIT_SHA__`, `appVersion: __APP_VERSION__`; subscribes `useAuthStore` to keep `uid` in the context; lazy-loads `idb.ts` to seed the ring and persists it at most once per second.
  - `interface AdminDiagnostic { id: string; uid: string; event: string; message: string; createdAt: Date | null; context: Record<string, unknown>; breadcrumbs: Breadcrumb[] }`
  - `listDiagnostics(max = 50): Promise<AdminDiagnostic[]>`, `purgeDiagnostics(ids: string[]): Promise<number>`

- [ ] **Step 1: Write the failing reporter test**

`tests/unit/diagnostics-io.test.ts` (fast lane; `@/lib/firebase` mocked as `{ db: {} }`, `firebase/firestore` mocked like `tests/unit/play-state-persistence-cutover.test.ts` does):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  diagnosticsLog,
  resetDiagnostics,
  setDiagnosticsContext,
  type DiagnosticsReport,
} from "@/lib/diagnostics";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "d1" }),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: () => "server-ts",
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: class {},
}));

import {
  installDiagnosticsReporter,
  MAX_REPORTS_PER_SESSION,
  MAX_REPORTS_PER_USER_BUILD,
} from "@/lib/diagnostics-io";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

beforeEach(() => {
  resetDiagnostics();
  setDiagnosticsContext({ sessionId: "s", buildSha: "sha1", appVersion: "1", uid: "u1" });
});

describe("diagnostics reporter", () => {
  it("writes one report per distinct error-level event", async () => {
    const written: DiagnosticsReport[] = [];
    installDiagnosticsReporter({
      storage: memoryStorage(),
      write: async (r) => void written.push(r),
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.quarantine", {
      code: "malformed-entry",
      path: "build.spells[0]",
    });
    diagnosticsLog("error", "character.save-rejected", { message: "permission-denied" });
    await Promise.resolve();
    expect(written.map((r) => r.event)).toEqual([
      "character.quarantine",
      "character.save-rejected",
    ]);
  });

  it("caps writes per session and per user+build, and a failed write never throws", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "d20-folio-diagnostics:u1:sha1",
      String(MAX_REPORTS_PER_USER_BUILD - 1)
    );
    const write = vi.fn(() => Promise.reject(new Error("offline")));
    installDiagnosticsReporter({ storage, write });
    for (let i = 0; i < MAX_REPORTS_PER_SESSION + 5; i++)
      diagnosticsLog("error", `e.${i}`);
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(storage.getItem("d20-folio-diagnostics:u1:sha1")).toBe(
      String(MAX_REPORTS_PER_USER_BUILD)
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run tests/unit/diagnostics-io.test.ts`
Expected: FAIL — module `@/lib/diagnostics-io` not found.

- [ ] **Step 3: Implement the IO seam**

`src/lib/diagnostics-io.ts`:

```ts
/**
 * Firestore seam for diagnostics (ADR-0008): automatic error reports written to the
 * top-level `diagnostics/{id}` collection (create-only for the reporting uid, read/delete
 * for the admin), read back by the admin inbox. Keeps `src/lib/diagnostics/*` Firebase-free.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  onErrorReport,
  seedBreadcrumbs,
  breadcrumbSnapshot,
  setDiagnosticsContext,
  type Breadcrumb,
  type DiagnosticsReport,
} from "@/lib/diagnostics";
import { useAuthStore } from "@/stores/authStore";

export const MAX_REPORTS_PER_USER_BUILD = 50;
export const MAX_REPORTS_PER_SESSION = 10;
const STORAGE_PREFIX = "d20-folio-diagnostics";

export function writeDiagnosticsReport(report: DiagnosticsReport): Promise<void> {
  return setDoc(doc(collection(db, "diagnostics")), {
    ...report,
    createdAt: serverTimestamp(),
  });
}

export function installDiagnosticsReporter(deps: {
  storage: Pick<Storage, "getItem" | "setItem">;
  write: (report: DiagnosticsReport) => Promise<void>;
}): () => void {
  let sessionCount = 0;
  const seen = new Set<string>();
  return onErrorReport((report) => {
    const dedupe = `${report.event} ${report.message}`;
    if (seen.has(dedupe) || sessionCount >= MAX_REPORTS_PER_SESSION) return;
    const key = `${STORAGE_PREFIX}:${report.uid}:${report.context.buildSha}`;
    const used = Number(deps.storage.getItem(key) ?? "0");
    if (!Number.isFinite(used) || used >= MAX_REPORTS_PER_USER_BUILD) return;
    seen.add(dedupe);
    sessionCount += 1;
    deps.storage.setItem(key, String(used + 1));
    void deps.write(report).catch(() => {
      // A report about a failure must never become a second failure.
    });
  });
}

/** Production installer — called once from `main.tsx`. */
export function installDiagnostics(): void {
  setDiagnosticsContext({
    sessionId: crypto.randomUUID(),
    buildSha: __GIT_SHA__,
    appVersion: __APP_VERSION__,
    uid: useAuthStore.getState().user?.uid,
  });
  useAuthStore.subscribe((state) => setDiagnosticsContext({ uid: state.user?.uid }));
  installDiagnosticsReporter({ storage: localStorage, write: writeDiagnosticsReport });
  void import("@/lib/diagnostics/idb").then(
    async ({ loadBreadcrumbs, persistBreadcrumbs }) => {
      const previous = await loadBreadcrumbs();
      if (previous) seedBreadcrumbs(previous);
      let scheduled = false;
      onErrorReport(() => undefined); // keep the listener set non-empty so reports build
      setInterval(() => {
        if (scheduled) return;
        scheduled = true;
        void persistBreadcrumbs(breadcrumbSnapshot()).finally(() => {
          scheduled = false;
        });
      }, 1000);
    }
  );
}

export interface AdminDiagnostic {
  id: string;
  uid: string;
  event: string;
  message: string;
  createdAt: Date | null;
  context: Record<string, unknown>;
  breadcrumbs: Breadcrumb[];
}

export async function listDiagnostics(max = 50): Promise<AdminDiagnostic[]> {
  const snap = await getDocs(
    query(collection(db, "diagnostics"), orderBy("createdAt", "desc"), limit(max))
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      uid: String(data.uid ?? ""),
      event: String(data.event ?? ""),
      message: String(data.message ?? ""),
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null,
      context:
        typeof data.context === "object" && data.context !== null
          ? (data.context as Record<string, unknown>)
          : {},
      breadcrumbs: Array.isArray(data.breadcrumbs)
        ? (data.breadcrumbs as Breadcrumb[])
        : [],
    };
  });
}

export async function purgeDiagnostics(ids: readonly string[]): Promise<number> {
  let purged = 0;
  for (const id of ids) {
    try {
      await deleteDoc(doc(db, "diagnostics", id));
      purged++;
    } catch (err) {
      console.warn("diagnostics purge failed (retried on next load):", id, err);
    }
  }
  return purged;
}
```

Note the `setInterval` persists only when the ring changed since the last flush: keep a `lastSize`/`lastNewest` check (`breadcrumbSnapshot().at(-1)?.t`) and skip identical snapshots — a diagnostic layer must not wake the CPU every second on an idle sheet. Implement that check before committing.

Wiring:

- `src/main.tsx` after `installErrorLog();` add `import { installDiagnostics } from "./lib/diagnostics-io";` and `installDiagnostics();`.
- `src/features/report/error-log.ts` `record(source, args)`: after pushing to its own ring, call `diagnosticsLog("error", \`runtime.${source}\`, { message })`(import from`@/lib/diagnostics`). `console.error` chains stay unchanged.
- `src/hooks/useCharacterSubscription.ts` `quarantine(message)`: first line inside the guard → `diagnosticsLog("error", "character.quarantine", { message })`; also `setDiagnosticsContext({ characterId })` when the effect starts and `{ characterId: undefined }` on cleanup.
- `src/lib/firestore.ts` `createDebouncedSave.runWrite` catch: `diagnosticsLog("error", "character.save-rejected", { message: msg })` before `onError`.
- `src/lib/combat-state-io.ts` `subscribeCombatState` parse failure: `diagnosticsLog("error", "combat-state.invalid", { reason: parsed.reason })` before `onError`.
- `src/features/campaigns/campaignStore.ts`: when `campaign` changes, `setDiagnosticsContext({ campaignId: campaign?.id })` (in the `setCampaign` action).

- [ ] **Step 4: Rules + rules tests**

Append to `firestore.rules` after the `bug_reports` block:

```
    // Diagnostics (ADR-0008): automatic client error reports. Create-only for the
    // reporting uid with a bounded shape; the admin inbox reads and purges them.
    match /diagnostics/{id} {
      allow read, delete: if isAdmin();
      allow create: if isNotBlocked()
        && request.resource.data.uid == request.auth.uid
        && request.resource.data.schema == 1
        && request.resource.data.level == "error"
        && request.resource.data.event is string
        && request.resource.data.event.size() > 0
        && request.resource.data.message is string
        && request.resource.data.message.size() <= 2000
        && request.resource.data.context is map
        && request.resource.data.breadcrumbs is list
        && request.resource.data.breadcrumbs.size() <= 500
        && request.resource.data.keys().hasOnly([
          'schema','uid','level','event','message','createdAtMs','context','breadcrumbs','createdAt'
        ]);
      allow update: if false;
    }
```

Add to `tests/rules/firestore-rules.test.ts` (after the `bug_reports` describe):

```ts
function diagnosticDoc(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    schema: 1,
    uid,
    level: "error",
    event: "character.quarantine",
    message: "malformed-entry at build.spells[0]",
    createdAtMs: 1_720_000_000_000,
    context: { sessionId: "s", buildSha: "abc", appVersion: "1" },
    breadcrumbs: [{ t: 1, level: "error", event: "character.quarantine" }],
    createdAt: Timestamp.now(),
    ...overrides,
  };
}

describe("firestore.rules — /diagnostics (ADR-0008 create-only reports)", () => {
  it("a signed-in user creates a well-formed report for themselves; a blocked user cannot", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertSucceeds(
      setDoc(doc(member, "diagnostics", "d1"), diagnosticDoc("member"))
    );
    const blocked = testEnv.authenticatedContext("blocked").firestore();
    await assertFails(
      setDoc(doc(blocked, "diagnostics", "d2"), diagnosticDoc("blocked"))
    );
  });

  it("rejects a spoofed uid, a non-error level, an oversized message and unknown keys", async () => {
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(
      setDoc(doc(member, "diagnostics", "d3"), diagnosticDoc("outsider"))
    );
    await assertFails(
      setDoc(doc(member, "diagnostics", "d4"), diagnosticDoc("member", { level: "info" }))
    );
    await assertFails(
      setDoc(
        doc(member, "diagnostics", "d5"),
        diagnosticDoc("member", { message: "x".repeat(2001) })
      )
    );
    await assertFails(
      setDoc(doc(member, "diagnostics", "d6"), diagnosticDoc("member", { extra: true }))
    );
  });

  it("only the admin reads and deletes; nobody updates", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "diagnostics", "d7"), diagnosticDoc("member"));
    });
    const member = testEnv.authenticatedContext("member").firestore();
    await assertFails(getDoc(doc(member, "diagnostics", "d7")));
    await assertFails(updateDoc(doc(member, "diagnostics", "d7"), { message: "edited" }));
    await assertFails(deleteDoc(doc(member, "diagnostics", "d7")));
    const admin = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(getDoc(doc(admin, "diagnostics", "d7")));
    await assertFails(updateDoc(doc(admin, "diagnostics", "d7"), { message: "edited" }));
    await assertSucceeds(deleteDoc(doc(admin, "diagnostics", "d7")));
  });
});
```

Run: `pnpm test:rules` → expected PASS (3 new cases).

- [ ] **Step 5: Admin inbox section (non-visual reuse of the bug-inbox list)**

In `AdminPage.tsx`: state `const [diagnostics, setDiagnostics] = useState<AdminDiagnostic[] | null>(null);`; in the load effect next to the bug-inbox load: `listDiagnostics().then((list) => alive && setDiagnostics(list)).catch(() => alive && setDiagnostics([]));`. After the bug-inbox `Section`:

```tsx
<Section title={t("admin.diagnostics")}>
  <DiagnosticsInbox reports={diagnostics} />
</Section>
```

`DiagnosticsInbox` mirrors `BugInbox` (same `Spinner`, empty copy `admin.noDiagnostics`, `InfoCard` list sorted by `createdAt` desc, one expandable row rendering `message`, `event`, the `context` key:value lines through the existing `formatDebugValue`, and the last 20 breadcrumbs as `t · level · event` lines). A "purge" button per row calls `purgeDiagnostics([id])` and removes it from the list. Keys in `src/i18n/{en,it}/ui/diagnostics.json`:

```json
{
  "admin": {
    "diagnostics": "Diagnostics",
    "noDiagnostics": "No diagnostics reports.",
    "diagnosticEvent": "Event",
    "diagnosticBreadcrumbs": "Recent breadcrumbs",
    "diagnosticPurge": "Delete report"
  }
}
```

```json
{
  "admin": {
    "diagnostics": "Diagnostica",
    "noDiagnostics": "Nessun report diagnostico.",
    "diagnosticEvent": "Evento",
    "diagnosticBreadcrumbs": "Ultimi eventi",
    "diagnosticPurge": "Elimina report"
  }
}
```

(Keep the file name `diagnostics.json`; the loaders glob picks it up. Run `pnpm i18n:check`.)

`tests/unit/admin-page.test.tsx`: add `listDiagnostics: vi.fn(() => Promise.resolve([{ id: "d1", uid: "u", event: "character.quarantine", message: "malformed-entry at build.spells[0]", createdAt: new Date(), context: {}, breadcrumbs: [] }]))` to the `@/lib/diagnostics-io` mock and one case: the section title and the message render.

- [ ] **Step 6: Docs and ADR amendment**

- `docs/adr/0008-diagnostics-zero-cost.md`: under "Decision" add: _Amendment 2026-09-02 (P1): reports are written to the top-level `diagnostics/{id}` collection with a `uid` field (create-only for that uid, admin read/delete). Evidence: the inbox needs one ordered query; `users/{uid}/diagnostics` would require a collection-group single-field index that `firebase.json`/`deploy.yml` do not manage._
- Design spec §5.1: replace the `users/{uid}/diagnostics/{id}` row with `diagnostics/{id}` (self create-only; admin); §9: same path.
- `docs/ARCHITECTURE.md` → after "Persistence + offline" add "### Diagnostics (zero cost)" describing the two layers, the context ids, the 500-crumb ring, the 32 KiB cap, the caps (50 per user per build, 10 per session, dedupe), the collection and the inbox.

- [ ] **Step 7: Run gates and commit**

Run: `pnpm test --run tests/unit/diagnostics-io.test.ts tests/unit/admin-page.test.tsx tests/unit/use-character-subscription.test.ts tests/unit/i18n-dynamic-key-coverage.guard.test.ts && pnpm i18n:check && pnpm test:rules`
Expected: PASS.

```bash
cat > .changeset/diagnostics-reports.md <<'EOF'
---
---

Automatic diagnostics reports: error-level events (quarantine, rejected save, invalid combat state, runtime errors) are written create-only to `diagnostics/{id}` with breadcrumbs and correlation ids, bounded per session and per user, and read from a new admin inbox section (ADR-0008, amended to a top-level collection).
EOF
git add -A
git commit -m "feat(diagnostics): create-only reports, admin inbox section and error wiring"
```

---

### Task 3: Total codec — typed quarantine, unknown-key preservation, no silent drops

**Files:**

- Modify: `src/lib/character-codec.ts` (`parseCustomSpell/Weapon/Equipment/Feature`, `parseSrdSpellRef/WeaponRef/EquipmentRef/FeatureRef`, `parseSpells/Weapons/Equipment`, features loop in `buildToMin:807-826`, `minToBuild`, `parseCharacterEnvelope`, `parseCharacter`), `src/lib/session-state-codec.ts` (`sessionToState`, `stateToSession`), `src/lib/sanitize-session.ts:102` (`unknown` passthrough), `src/lib/character-minimal.ts` (nothing to drop: `unknown` is not derivable — verify), `src/types/character.ts` (`unknown?` on the four custom types, the four SRD ref types, `CharacterData`, `SessionState`), `src/lib/firestore.ts:692-711` (`parseStoredCharacter` throws the typed failure), `src/lib/character-io.ts` (import surfaces `failure`), `docs/CHARACTER_SCHEMA.md` (Principles §4 wording + codec contract), `docs/ARCHITECTURE.md` "Unified persistence codec"
- Test: `tests/unit/character-codec-totality.test.ts` (new), `tests/unit/character-codec.test.ts:424-468` (the "tolerance" describe is rewritten to "preservation")

**Interfaces:**

- Produces:
  - `interface CodecFailure { code: "malformed-entry" | "invalid-item-resources" | "invalid-build" | "validation"; path: string; detail?: string }`
  - `type ParsedEnvelope = { ok: true; character: CharacterData; session: SessionState } | { ok: false; error: string; failure: CodecFailure }` (the `error` string stays for existing consumers; it becomes `` `${code}:${path}` `` for structural failures and the validation message for `validation`)
  - `ImportError` gains `failure?: CodecFailure`.
  - Every entry type gains `unknown?: Record<string, unknown>`; `CharacterData.unknown?` (unknown `build` keys) and `SessionState.unknown?` (unknown `state` keys). Serialization spreads them back at the end of the object.
  - `export const KNOWN_BUILD_KEYS: readonly string[]` and `export const KNOWN_STATE_KEYS: readonly string[]` (session-state-codec) — the closed worlds.

- [ ] **Step 1: Write the failing property test**

`tests/unit/character-codec-totality.test.ts`:

```ts
/**
 * Codec totality (design §5.5, ADR-0007 "property: codec totality"):
 *  - parse(serialize(x)) ≡ x for generated envelopes carrying unknown keys at every level;
 *  - a hostile entry quarantines the document with a typed path — never a shorter array.
 * Seeded generator, no dependency (same approach as tests/unit/combat/fold.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
  KNOWN_BUILD_KEYS,
} from "@/lib/character-codec";
import { KNOWN_STATE_KEYS } from "@/lib/session-state-codec";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import type { CharacterDoc } from "@/types/character";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const JSON_VALUES: unknown[] = [
  null,
  0,
  -1.5,
  "s",
  "",
  true,
  [],
  [1, "a", null],
  { deep: { k: [true] } },
];
function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)] as T;
}
function unknownKey(rng: () => number, taken: ReadonlySet<string>): string {
  let key = `zz_${Math.floor(rng() * 1e6)}`;
  while (taken.has(key)) key = `${key}_`;
  return key;
}

type Envelope = {
  schema: number;
  build: Record<string, unknown>;
  state: Record<string, unknown>;
};
const BASES: Envelope[] = [
  MOCK_CHARACTER,
  ...Object.values(DEV_SCENARIOS).map(buildScenario),
].map(
  (doc: CharacterDoc) => structuredClone(serializeCharacterEnvelope(doc)) as Envelope
);
const COLLECTIONS = ["spells", "weapons", "equipment"] as const;

function withUnknownKeys(rng: () => number, env: Envelope): Envelope {
  const out = structuredClone(env);
  out.build[unknownKey(rng, new Set(KNOWN_BUILD_KEYS))] = pick(rng, JSON_VALUES);
  out.state[unknownKey(rng, new Set(KNOWN_STATE_KEYS))] = pick(rng, JSON_VALUES);
  for (const coll of COLLECTIONS) {
    const list = out.build[coll];
    if (!Array.isArray(list) || list.length === 0) continue;
    const entry = list[Math.floor(rng() * list.length)] as Record<string, unknown>;
    entry[unknownKey(rng, new Set(Object.keys(entry)))] = pick(rng, JSON_VALUES);
  }
  const customs = out.build.customs as
    | { features?: Record<string, unknown>[] }
    | undefined;
  if (customs?.features?.length)
    customs.features[0][unknownKey(rng, new Set())] = pick(rng, JSON_VALUES);
  return out;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}

describe("codec totality", () => {
  it("round-trips generated envelopes with unknown keys at every level (200 seeds)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = mulberry32(seed);
      const env = withUnknownKeys(rng, pick(rng, BASES));
      const parsed = parseCharacterEnvelope(env.build, env.state);
      expect(parsed.ok, `seed ${seed}: ${parsed.ok ? "" : parsed.error}`).toBe(true);
      if (!parsed.ok) continue;
      const again = serializeCharacterEnvelope({
        ...MOCK_CHARACTER,
        character: parsed.character,
        session: parsed.session,
      });
      expect(sortKeys(again)).toEqual(sortKeys(env));
    }
  });

  it("the canonical fixtures carry no unknown keys (the closed worlds are complete)", () => {
    for (const env of BASES) {
      const parsed = parseCharacterEnvelope(env.build, env.state);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.character.unknown).toBeUndefined();
      expect(parsed.session.unknown).toBeUndefined();
      for (const ref of [
        ...parsed.character.spells,
        ...parsed.character.weapons,
        ...parsed.character.equipment,
        ...parsed.character.features,
      ]) {
        expect((ref as { unknown?: unknown }).unknown).toBeUndefined();
      }
    }
  });

  it("a hostile entry quarantines the document with its path, never a shorter array", () => {
    const hostile: unknown[] = [
      null,
      7,
      "str",
      [],
      {},
      { custom: true },
      { srdId: 3 },
      { custom: true, name: 1 },
      { srdId: "x", quantity: "many" },
    ];
    for (const coll of COLLECTIONS) {
      for (const [i, bad] of hostile.entries()) {
        const env = structuredClone(BASES[0]);
        const list = env.build[coll] as unknown[];
        if (list.length === 0) list.push({ srdId: "dagger", quantity: 1 });
        const at = i % list.length;
        list[at] = bad;
        const parsed = parseCharacterEnvelope(env.build, env.state);
        expect(parsed.ok).toBe(false);
        if (parsed.ok) continue;
        expect(parsed.failure).toEqual({
          code: "malformed-entry",
          path: `build.${coll}[${at}]`,
        });
      }
    }
    const env = structuredClone(BASES[0]);
    env.build.customs = {
      features: [
        { custom: true, title: "T", emoji: "x", source: "s", contentBlocks: [1] },
      ],
    };
    const parsed = parseCharacterEnvelope(env.build, env.state);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok)
      expect(parsed.failure.path).toBe("build.customs.features[0].contentBlocks[0]");
  });

  it("a non-array collection is a build failure with its path", () => {
    const env = structuredClone(BASES[0]);
    env.build.equipment = { not: "an array" };
    const parsed = parseCharacterEnvelope(env.build, env.state);
    expect(parsed).toMatchObject({
      ok: false,
      failure: { code: "invalid-build", path: "build.equipment" },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run tests/unit/character-codec-totality.test.ts`
Expected: FAIL — `KNOWN_BUILD_KEYS` is not exported; hostile entries currently parse `ok: true` with a shorter array.

- [ ] **Step 3: Implement the closed-world parsers**

In `src/lib/character-codec.ts`:

```ts
export interface CodecFailure {
  code: "malformed-entry" | "invalid-item-resources" | "invalid-build" | "validation";
  path: string;
  detail?: string;
}

class CodecFailureError extends Error {
  constructor(readonly failure: CodecFailure) {
    super(`${failure.code}:${failure.path}`);
  }
}
function fail(code: CodecFailure["code"], path: string, detail?: string): never {
  throw new CodecFailureError(detail ? { code, path, detail } : { code, path });
}

/** Keys the parser consumed; everything else on `obj` is preserved verbatim under `unknown`. */
function leftover(
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
```

Each entry parser takes `(obj, path)` and returns the typed entry or calls `fail("malformed-entry", path)`. The key lists are the exact fields each parser reads today (e.g. `CUSTOM_EQUIPMENT_KEYS = ["custom","name","description","emoji","notes","equipped","ac","armorCategory","acBonus","tracked","quantity","recovery","isConsumable","isPotion","potionFormula","isPool","unit","attuned","charges"]`). A field present with the wrong type is a failure, not a silent skip: e.g. in `parseCustomEquipment`, replace `if (typeof obj.description === "string") equip.description = obj.description;` with

```ts
if (obj.description !== undefined) {
  if (typeof obj.description !== "string") fail("malformed-entry", `${path}.description`);
  equip.description = obj.description;
}
```

and the same shape for every optional field (`isRecovery`, `isTrackerUnit`, `isTagArray`, `parseEquipmentCharges`, `parseCustomArmorAc` become `X | fail`). Keep the two documented one-way read-normalizations (`isTrackerUnit` legacy token drop, `normalizeInitiativeAdvantageOverride`) — they are on `build.overrides`, not on entries. At the end of each parser: `const unknown = leftover(obj, CUSTOM_EQUIPMENT_KEYS); if (unknown) equip.unknown = unknown;`.

The three collection parsers and the features loop become total:

```ts
function parseEntries<T>(
  raw: unknown,
  path: string,
  parseOne: (obj: Record<string, unknown>, path: string) => T
): T[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) fail("invalid-build", path);
  return raw.map((item, index) => {
    if (!isRecord(item)) fail("malformed-entry", `${path}[${index}]`);
    return parseOne(item, `${path}[${index}]`);
  });
}

function parseEquipmentEntry(
  obj: Record<string, unknown>,
  path: string
): SrdEquipmentRef | CustomEquipment {
  if (obj.custom === true) return parseCustomEquipment(obj, path);
  if (typeof obj.srdId === "string") return parseSrdEquipmentRef(obj, path);
  return fail("malformed-entry", path);
}
// parseSpellEntry / parseWeaponEntry / parseFeatureEntry follow the same shape.
```

`buildToMin`: `min.spells = parseEntries(build.spells, "build.spells", parseSpellEntry);` etc.; SRD features from `build.features` at `"build.features"`, custom features from `build.customs.features` at `"build.customs.features"`; then `const unknownBuild = leftover(build, KNOWN_BUILD_KEYS); if (unknownBuild) min.unknown = unknownBuild;` where

```ts
export const KNOWN_BUILD_KEYS = [
  "name",
  "player",
  "quote",
  "race",
  "classes",
  "background",
  "alignment",
  "abilities",
  ...BUILD_PASSTHROUGH,
  "combatAlgorithm",
  "asi",
  "originFeats",
  "overrides",
  "features",
  "customs",
  "skills",
  "spells",
  "weapons",
  "equipment",
  "lore",
] as const;
```

`minToBuild`: for each of the four arrays and `customs.features`, emit `flattenEntry(ref)` = `{ ...rest, ...unknown }` where `rest` omits `unknown`; at the end `Object.assign(build, min.unknown)` (unknown build keys last). `parseCustomFeature`: `contentBlocks`, `trackers`, `actions` must be arrays whose elements are records (`fail("malformed-entry", \`${path}.contentBlocks[${i}]\`)` otherwise).

`parseCharacterEnvelope` wraps the whole body in `try { … } catch (e) { if (e instanceof CodecFailureError) return { ok: false, error: e.message, failure: e.failure }; throw e; }`; the existing `invalid-item-resources` return becomes `{ ok: false, error: "invalid-item-resources", failure: { code: "invalid-item-resources", path: "state.itemResources" } }`; the validation return becomes `{ ok: false, error: validation, failure: { code: "validation", path: "build", detail: validation } }`. `parseCharacter` (portable import) forwards `failure` on `ImportError`.

`session-state-codec.ts`: `export const KNOWN_STATE_KEYS = [...]` — every key `sessionToState` can emit (read them off that function: `hp`, `usedHitDice`, `trackers`, `itemResources`, `usedSlots`, `currency`, `conditions`, `deathSucc`, `deathFail`, `inspiration`, `bardicInspirationDie`, `initiative`, `notes`, `log`, `exhaustion`, `world`, … — copy the full list from the function body). `stateToSession` ends with `const unknown = leftover(state, KNOWN_STATE_KEYS); if (unknown) session.unknown = unknown;` and `sessionToState` ends with `if (session.unknown) Object.assign(state, session.unknown);`. `sanitizeSession` copies `unknown: session.unknown` (only when defined). `sessionToPlayStateV1`/`parsePersistedPlayStateV1` need no change (they canonicalize through the same pair; `jsonEquals` sorts keys).

`src/types/character.ts`: add `unknown?: Record<string, unknown>;` (doc comment: _Unknown persisted keys, preserved verbatim by the codec — never read by the app_) to `SrdSpellRef`, `CustomSpell`, `SrdFeatureRef`, `CustomFeature`, `SrdEquipmentRef`, `CustomEquipment`, `SrdWeaponRef`, `CustomWeapon`, `CharacterData`, `SessionState`.

`src/lib/firestore.ts` `parseStoredCharacter`: `if (!parsed.ok) throw new TypeError(\`Invalid character document: ${parsed.error}\`);`(the message reaches`quarantine()` and therefore the diagnostics report from Task 2).

- [ ] **Step 4: Rewrite the old tolerance tests**

In `tests/unit/character-codec.test.ts` replace the describe at :424-468 with:

```ts
describe("codec — preservation (design §5.5)", () => {
  it("unknown top-level, build, state and entry keys survive a round-trip verbatim", () => {
    const env = JSON.parse(serializeCharacter(MOCK_CHARACTER)) as Record<string, unknown>;
    (env.build as Record<string, unknown>).futureBuildField = { a: 1 };
    (env.state as Record<string, unknown>).futureStateField = [1, 2];
    (
      env.build as { equipment: Record<string, unknown>[] }
    ).equipment[0].futureEntryField = "kept";
    const doc = lift(parseCharacter(JSON.stringify(env)));
    const again = JSON.parse(serializeCharacter(doc)) as Record<string, unknown>;
    expect((again.build as Record<string, unknown>).futureBuildField).toEqual({ a: 1 });
    expect((again.state as Record<string, unknown>).futureStateField).toEqual([1, 2]);
    expect(
      (again.build as { equipment: Record<string, unknown>[] }).equipment[0]
        .futureEntryField
    ).toBe("kept");
  });

  it("fills missing optional fields with defaults (bare build = empty session)", () => {
    // keep the existing body of the old test verbatim
  });
});
```

- [ ] **Step 5: Run the codec suites, the pack fixture suites and the persistence suites**

Run: `pnpm test --run tests/unit/character-codec tests/unit/character-io content-pack/tests/unit/team-fixtures tests/unit/play-state-persistence-cutover.test.ts tests/unit/use-character-subscription.test.ts tests/unit/session-state-codec`
Expected: PASS, including the six-fixture byte-identity test (no unknown keys in the fixtures, so the layout is unchanged).

- [ ] **Step 6: Docs**

`docs/CHARACTER_SCHEMA.md` Principles §4: replace "The reader still tolerates unknown future fields (ignored)" with "The reader **preserves** unknown fields verbatim (`unknown` buckets on the character, the session and every entry) and writes them back; a structurally malformed entry **quarantines** the document with a typed `{ code, path }` (`parseCharacterEnvelope` → `ok: false`), never a silent drop." Codec contract section: document `CodecFailure`, `KNOWN_BUILD_KEYS`, `KNOWN_STATE_KEYS`. `docs/ARCHITECTURE.md` "Unified persistence codec": add the totality bullet and the quarantine → diagnostics path.

- [ ] **Step 7: Commit**

```bash
cat > .changeset/codec-totality.md <<'EOF'
---
---

The character codec is total: unknown keys are preserved verbatim at every level and written back, a malformed entry quarantines the document with a typed code and path (reported to diagnostics), and no parser silently skips an entry (design §5.5).
EOF
git add -A
git commit -m "feat(codec): total character codec with unknown-key preservation and typed quarantine"
```

**→ Integration A** (see "Integration order"): rebase, `just ci`, `pnpm test:rules`, push `HEAD:main`, confirm the SHA.

---

### Task 4: Identity — `instanceId` on every custom item, weapon, spell, feature and library entry

Split into 4a (public, types + codec + consumers), 4b (private pack fixture) and 4c (public, name identity deleted). 4a and 4c are one commit each on this worktree; 4b is one commit in the private repository pushed **between Integration A and Integration B**.

#### 4a — types, codec requirement, creation sites, consumers

**Files:**

- Modify: `src/types/character.ts:105,148,212,277` (`instanceId: string` on the four custom types), `src/lib/character-codec.ts` (require it in the four custom parsers; emit it **last** in the constructed object), `src/components/sheet/CustomCreationForms.tsx:109,327,352,375,661,671` (mint on create, keep on edit), `src/lib/library.ts` (`toLibraryEntry` keeps the item's `instanceId`; `entryToCharacterItem(entry, quantity, takenIds)`), `src/components/sheet/CustomTabBody.tsx:88`, `src/lib/views/inventory-view.ts:617,735-739`, `src/lib/views/spells-view.ts:407`, `src/features/character/center/tabs/FeaturesTab.tsx:526`, `src/stores/characterStore.ts:2303,2309`, `src/lib/smart-tracker.ts:728,5127,5154,7183,7201`, `docs/CHARACTER_SCHEMA.md` build table
- Test: `tests/unit/character-codec-totality.test.ts` (one case), `tests/unit/__helpers__/custom-items.ts` (new helper), every test that builds a custom entry (grep `custom: true` under `tests/` and `content-pack/tests/`)

**Interfaces:**

- Produces: `customInstanceId(seed: string): string` test helper (deterministic, valid under `isItemInstanceId`: `` `custom-${seed.toLowerCase().replace(/[^a-z0-9-]/g, "-")}` `` truncated to 64 chars); `entryToCharacterItem(entry, quantity = 1, takenIds: ReadonlySet<string> = new Set()): SheetLibraryDraft`; view-model ids for customs are the `instanceId` (`id: isCustom ? ref.instanceId : ref.srdId`, `rowId: \`equipment-instance:${ref.instanceId}\``), the cost key for custom equipment is the `instanceId`, custom feature action ids are `` `custom-${featureRef.instanceId}-${a.id ?? a.type}` ``, potion action ids `` `item-custom-${itemRef.instanceId}` ``.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/character-codec-totality.test.ts`:

```ts
it("a custom entry without a valid instanceId is a malformed entry", () => {
  const env = structuredClone(BASES[0]);
  (env.build.equipment as unknown[]).push({ custom: true, name: "Boots of Bo" });
  const at = (env.build.equipment as unknown[]).length - 1;
  const parsed = parseCharacterEnvelope(env.build, env.state);
  expect(parsed).toMatchObject({
    ok: false,
    failure: { code: "malformed-entry", path: `build.equipment[${at}].instanceId` },
  });
});

it("instanceId is serialized as the last key of a custom entry (fixture byte-identity)", () => {
  const env = structuredClone(BASES[0]);
  (env.build.weapons as unknown[]).push({
    custom: true,
    name: "Talon",
    quantity: 1,
    damageDie: "1d8",
    damageType: "slashing",
    attackStat: "STR",
    properties: "",
    instanceId: "talon-1",
  });
  const parsed = parseCharacterEnvelope(env.build, env.state);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const again = serializeCharacterEnvelope({
    ...MOCK_CHARACTER,
    character: parsed.character,
    session: parsed.session,
  });
  const talon = (again.build.weapons as Record<string, unknown>[]).at(-1)!;
  expect(Object.keys(talon).at(-1)).toBe("instanceId");
});
```

And a library test in `tests/unit/library.test.ts` (existing file; add):

```ts
it("a library entry keeps the item's instanceId and lands with a fresh one only on collision", () => {
  const item: CustomEquipment = { custom: true, name: "Boots", instanceId: "boots-1" };
  const entry = toLibraryEntry({ kind: "equipment", item }, 1);
  expect(entry.id).toBe("boots-1");
  expect(entryToCharacterItem(entry, 1).item.instanceId).toBe("boots-1");
  const landed = entryToCharacterItem(entry, 1, new Set(["boots-1"]));
  expect(landed.item.instanceId).not.toBe("boots-1");
  expect(isItemInstanceId(landed.item.instanceId)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test --run tests/unit/character-codec-totality.test.ts tests/unit/library.test.ts`
Expected: FAIL (type errors on `instanceId`, missing path failure).

- [ ] **Step 3: Implement**

Types: add `/** Stable identity of this custom entry — never keyed by name. */ instanceId: string;` to `CustomSpell`, `CustomFeature`, `CustomEquipment`, `CustomWeapon` (place it last in the interface so constructed literals mirror the serialized order).

Codec: in each custom parser, after validating the known fields and before the `unknown` bucket:

```ts
if (!isItemInstanceId(obj.instanceId)) fail("malformed-entry", `${path}.instanceId`);
equip.instanceId = obj.instanceId; // assigned last → serialized last
```

(`isItemInstanceId` from `@/lib/item-resources`; add `"instanceId"` to the four key lists.)

Creation: in `CustomCreationForms.tsx` every literal gains `instanceId: seed?.instanceId ?? createItemInstanceId()` (spell `seed`, weapon/armor/gear `seedGear`, feature `seed`) as the last property; the feature tracker id for a NEW feature becomes `` `custom-${built.instanceId}` `` (existing `initTracker?.id` still wins on edit — spent uses are keyed by it).

Library (`src/lib/library.ts`): `toLibraryEntry` uses `const id = draft.kind === "monster" ? crypto.randomUUID() : draft.item.instanceId;`. `entryToCharacterItem(entry, quantity = 1, takenIds = new Set<string>())`: after `structuredClone`, `if (takenIds.has(item.instanceId)) item.instanceId = createItemInstanceId();`. `CustomTabBody.tsx:88` passes the set of ids already on the character (`new Set([...data.spells, ...data.weapons, ...data.equipment, ...data.features].flatMap((r) => ("custom" in r ? [r.instanceId] : [])))`).

Consumers: replace every `custom-${ref.name}` / `custom-${ref.title}` / slugified name with the `instanceId` forms listed under Interfaces; `inventory-view.ts:736-739` becomes `rowId: "custom" in ref ? \`equipment-instance:${ref.instanceId}\` : ref.instanceId !== undefined ? \`equipment-instance:${ref.instanceId}\` : \`equipment-legacy:${idx}\``; `spells-view.ts:407` `key: "custom" in ref ? ref.instanceId : …`(keep the SRD leg as is);`smart-tracker.ts:728` doc comment updated.

Tests: create `tests/unit/__helpers__/custom-items.ts` with `customInstanceId(seed)`; update every custom literal in tests to carry `instanceId: customInstanceId("<name>")` (grep: `grep -rln "custom: true" tests content-pack/tests`). Type errors from `pnpm typecheck` are the checklist.

- [ ] **Step 4: Run**

Run: `pnpm typecheck && pnpm test --run tests/unit/character-codec tests/unit/library tests/unit/inventory-view tests/unit/spells-view tests/unit/smart-tracker tests/unit/character-store tests/unit/custom`
Expected: PASS. The pack suites `content-pack/tests/unit/team-fixtures-*.test.ts` now FAIL on Talon (expected until 4b) — do **not** integrate before 4b lands.

- [ ] **Step 5: Docs + commit**

`docs/CHARACTER_SCHEMA.md` build table: `spells`/`weapons`/`equipment`: "custom entries carry a required stable `instanceId`"; `customs.features` likewise. Library section (if present in `docs/ARCHITECTURE.md` "homebrew library"): entry `id` = the source item's `instanceId`; landing reuses it unless taken.

```bash
cat > .changeset/custom-instance-id.md <<'EOF'
---
---

Every custom spell, weapon, equipment item and feature carries a required stable `instanceId`; the codec rejects an entry without one, the creation forms mint it, and view ids, cost keys and library entries key on it instead of the display name.
EOF
git add -A
git commit -m "feat(identity): required instanceId on custom entries and library ids"
```

#### 4b — private pack: the Talon fixture (paired-worktree protocol)

**Files (private repository `~/Workspace/d20-folio-content`):**

- Modify: `content-pack/fixtures/team/mandorlino-paladin.json:55-75` — append `"instanceId": "talon-mandorlino-1"` as the **last key** of the Talon weapon entry (after `tags`).

- [ ] **Step 1: Write the two-repository charter** (a file in the scratchpad, not in either repo) recording: public base = the Integration A SHA, private base = fresh private `origin/main`, private worktree path (`~/Workspace/Codex/d20-folio-content-combat-p1-identity`, branch `feat/combat-p1-identity`), verifier = this worktree with `content-pack` relinked to that private worktree's `content-pack` directory, compatibility: (old private + public A) valid, (new private + public A) valid, (new private + public B) valid; push order private → public B; rollback = revert commits, never force-push.

- [ ] **Step 2: Create the private worktree and edit the fixture**

```bash
git -C ~/Workspace/d20-folio-content fetch origin main
git -C ~/Workspace/d20-folio-content worktree add -b feat/combat-p1-identity ~/Workspace/Codex/d20-folio-content-combat-p1-identity origin/main
```

Edit the fixture (the entry ends `…"tags": [ { "label": "Arma del gruppo", "color": "purple" } ]` → add `,\n        "instanceId": "talon-mandorlino-1"` after the closing bracket of `tags`, keeping the 2-space indentation the file uses).

- [ ] **Step 3: Relink the verifier and run the composed gate on the pair**

```bash
rm content-pack && ln -s ~/Workspace/Codex/d20-folio-content-combat-p1-identity/content-pack content-pack
pnpm test --run content-pack/tests/unit/team-fixtures-new-export.test.ts content-pack/tests/unit/team-fixtures-legal.test.ts content-pack/tests/unit/team-fixtures-dump.test.ts content-pack/tests/unit/dev-fixtures.test.ts
```

Expected: PASS (byte-identity holds because `instanceId` is the last key in both the file and the serializer).

Also prove the bridge: check out Integration A's SHA in a throwaway public worktree, link the same private worktree, run the same four tests → PASS (the unknown bucket serializes last).

- [ ] **Step 4: Commit in the private repository and push private `main`**

```bash
git -C ~/Workspace/Codex/d20-folio-content-combat-p1-identity commit -am "fix(fixtures): stable instanceId on the Talon custom weapon"
git -C ~/Workspace/Codex/d20-folio-content-combat-p1-identity push origin HEAD:main
git -C ~/Workspace/Codex/d20-folio-content-combat-p1-identity ls-remote origin main
```

Keep the verifier's `content-pack` link pointing at the private worktree until Integration B has landed, then relink it to `~/Workspace/d20-folio-content/content-pack` and remove the private worktree.

#### 4c — delete name-keyed identity

**Files:**

- Modify: `src/lib/library.ts` (delete `normalizeName`, `identityKey`, `isEntryNamed`; `upsertEntry` matches on `entry.id`; `customDraftAt(data, kind, idx)` → `customDraftById(data, kind, instanceId)`), `src/stores/libraryStore.ts` (`syncFromCharacter(data, kind, instanceId)`; delete the `previousName` rename dance and the `updateEntry` collision filter; `saveToLibrary` returns `{ outcome, id }`), callers: `src/features/character/center/tabs/InventoryTab.tsx:354-377`, `src/features/character/center/tabs/SpellsTab.tsx:199-221`, `src/components/sheet/CustomCreationForms.tsx:62-69,706`, `src/features/campaigns/encounter-custom-monsters.tsx:236-250` (use the returned `id`), `src/lib/library-io.ts:32-43` (`parseEntry` validates `item.instanceId` for the four sheet kinds via `isItemInstanceId`; a monster item needs none)
- Test: `tests/unit/library.test.ts`, `tests/unit/library-store.test.ts` (rewrite the rename cases: "editing a custom item updates the entry with the same id; renaming it keeps one entry")

- [ ] **Step 1: Write the failing store test**

```ts
it("a rename keeps exactly one entry, found by instanceId", () => {
  const store = useLibraryStore.getState();
  store.hydrate([], () => undefined);
  const item: CustomEquipment = { custom: true, name: "Boots", instanceId: "boots-1" };
  const data = { ...MOCK_CHARACTER.character, equipment: [item] };
  store.syncFromCharacter(data, "equipment", "boots-1");
  const renamed = { ...data, equipment: [{ ...item, name: "Boots of Bo" }] };
  store.syncFromCharacter(renamed, "equipment", "boots-1");
  const entries = useLibraryStore.getState().entries;
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ id: "boots-1", item: { name: "Boots of Bo" } });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm test --run tests/unit/library-store.test.ts` → FAIL (signature).

- [ ] **Step 3: Implement** the deletions and signature changes listed under Files. `upsertEntry`:

```ts
export function upsertEntry(entries: readonly LibraryEntry[], entry: LibraryEntry) {
  const existing = entries.find((e) => e.id === entry.id);
  if (!existing) return { entries: [...entries, entry], replaced: false };
  return { entries: entries.map((e) => (e === existing ? entry : e)), replaced: true };
}
```

`syncFromCharacter(data, kind, instanceId)`: `const draft = customDraftById(data, kind, instanceId); if (!draft) return; get().saveToLibrary(draft);`. In `InventoryTab`/`SpellsTab`/`CustomCreationForms` pass the edited item's `instanceId` instead of `(idx, previousName)`.

- [ ] **Step 4: Run** `pnpm typecheck && pnpm test --run tests/unit/library tests/unit/library-store tests/unit/custom tests/unit/inventory tests/unit/spells-tab tests/unit/encounter-custom-monsters` → PASS.

- [ ] **Step 5: Commit**

```bash
cat > .changeset/library-id-identity.md <<'EOF'
---
---

The homebrew library identifies entries by id (the item's instanceId) instead of kind + name; the rename-move machinery and every name-keyed lookup are deleted.
EOF
git add -A
git commit -m "refactor(library): identity by instanceId, name-keyed identity deleted"
```

---

### Task 5: Migration kit + `scripts/migrate-custom-identity.ts`

**Files:**

- Create: `scripts/lib/migration-kit.ts`, `scripts/migrate-custom-identity.ts`
- Modify: `scripts/migrate-item-resources.ts` (import the kit; keep its exported names so `tests/unit/migrate-item-resources.test.ts` still passes — re-export from the kit where the test imports them)
- Test: `tests/unit/migration-kit.test.ts`, `tests/unit/migrate-custom-identity.test.ts`

**Interfaces:**

- `scripts/lib/migration-kit.ts` produces (moved verbatim from `migrate-item-resources.ts` unless noted): `TARGET_PROJECT_ID`, `MAX_CHANGED_DOCUMENTS`, `isRecord`, `sha256`, `stableJson`, `sortedJsonValue`, `encodeFirestoreValue`, `decodeFirestoreValue`, `hashFirestoreDocument`, `assertTargetProject`, `readTargetConfiguration`, `parseCliOptions` (extended: `CliOptions` gains `{ mode: "fixtures"; directory: string }` for `--fixtures <abs dir>`), `writeBackupDirectory({ directory, migration: string, label: string, documents })` (manifest `format: "d20-folio-migration-backup-v1"`, fields `migration`, `label`), `discoverDocuments(db, matchers: RegExp[])` → `{ source: { path, data }, ref, updateTime }[]`, `pathHash(path)` = `sha256(path).slice(0, 16)` (reports print hashes, never paths), `MigrationIssue { path: string; code: string; detail: string }`, `runGuardedMigration(args)` — the shared dry-run/check/apply flow: plan → preflight → backup → one guarded batch (`{ lastUpdateTime }` for updates, `create` for absent docs) → reread/verify → global check → idempotency check.
- `scripts/migrate-custom-identity.ts` produces: `deterministicCustomInstanceId(uid, charId, collection, ordinal)` = `` `cu-${sha256(`custom-identity-v1\0${uid}\0${charId}\0${collection}\0${ordinal}`).slice(0, 32)}` ``; `planCustomIdentity(sources): { documents: DocumentPlan[]; changedDocuments; issues; counts: { parents; snapshots; libraries; stampedByCollection: Record<string, number> } }`; `verifyCustomIdentityCorpus(sources): MigrationIssue[]` (zero custom entries without a valid id, zero duplicate ids within a document); `reportFor(plan)` = the JSON printed in every mode.

- [ ] **Step 1: Write the failing planner tests**

`tests/unit/migrate-custom-identity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  deterministicCustomInstanceId,
  planCustomIdentity,
  verifyCustomIdentityCorpus,
} from "../../scripts/migrate-custom-identity";

const parentPath = "users/u1/characters/c1";
const snapshotPath = `${parentPath}/snapshots/s1`;
const libraryPath = "users/u1/library/index";

function envelope(build: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return { schema: 3, build, state, cache: { name: "x" }, futureRoot: { keep: true } };
}

describe("custom identity migration", () => {
  it("stamps a deterministic id on every custom entry lacking one, in every collection, and preserves everything else", () => {
    const build = {
      name: "Bo",
      spells: [{ srdId: "shield" }, { custom: true, name: "Zap", level: 1, future: 1 }],
      weapons: [
        {
          custom: true,
          name: "Talon",
          quantity: 1,
          damageDie: "1d8",
          damageType: "slashing",
          attackStat: "STR",
          properties: "",
        },
      ],
      equipment: [
        { custom: true, name: "Boots" },
        { custom: true, name: "Ring", instanceId: "ring-1" },
      ],
      customs: {
        features: [
          { custom: true, title: "Grit", emoji: "x", source: "s", contentBlocks: [] },
        ],
      },
    };
    const plan = planCustomIdentity([{ path: parentPath, data: envelope(build) }]);
    expect(plan.issues).toEqual([]);
    expect(plan.changedDocuments).toHaveLength(1);
    const after = plan.changedDocuments[0].after.build as typeof build;
    expect(after.spells[1]).toEqual({
      custom: true,
      name: "Zap",
      level: 1,
      future: 1,
      instanceId: deterministicCustomInstanceId("u1", "c1", "spells", 1),
    });
    expect(after.weapons[0].instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "weapons", 0)
    );
    expect(after.equipment[0].instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "equipment", 0)
    );
    expect(after.equipment[1].instanceId).toBe("ring-1");
    expect(after.customs.features[0].instanceId).toBe(
      deterministicCustomInstanceId("u1", "c1", "customs.features", 0)
    );
    expect(plan.changedDocuments[0].after.futureRoot).toEqual({ keep: true });
    expect(plan.counts.stampedByCollection).toEqual({
      spells: 1,
      weapons: 1,
      equipment: 1,
      "customs.features": 1,
    });
  });

  it("is idempotent and reports zero changes on a migrated corpus", () => {
    const first = planCustomIdentity([
      {
        path: parentPath,
        data: envelope({ name: "Bo", equipment: [{ custom: true, name: "Boots" }] }),
      },
    ]);
    const second = planCustomIdentity(
      first.documents.map((d) => ({ path: d.path, data: d.after }))
    );
    expect(second.changedDocuments).toEqual([]);
    expect(
      verifyCustomIdentityCorpus(
        second.documents.map((d) => ({ path: d.path, data: d.after }))
      )
    ).toEqual([]);
  });

  it("stamps snapshots and library entries (entry id first, deterministic fallback)", () => {
    const plan = planCustomIdentity([
      {
        path: snapshotPath,
        data: {
          build: { name: "Bo", weapons: [{ custom: true, name: "Talon" }] },
          state: {},
        },
      },
      {
        path: libraryPath,
        data: {
          entries: [
            {
              id: "boots-1",
              savedAt: 1,
              kind: "equipment",
              item: { custom: true, name: "Boots" },
            },
            {
              id: "NOT VALID",
              savedAt: 1,
              kind: "spell",
              item: { custom: true, name: "Zap" },
            },
            {
              id: "m1",
              savedAt: 1,
              kind: "monster",
              item: { name: "Goblin", ac: 12, maxHp: 7 },
            },
          ],
        },
      },
    ]);
    expect(plan.issues).toEqual([]);
    const snap = plan.changedDocuments.find((d) => d.path === snapshotPath)!;
    expect(
      (snap.after.build as { weapons: { instanceId: string }[] }).weapons[0].instanceId
    ).toBe(deterministicCustomInstanceId("u1", "c1", "snapshots/s1/weapons", 0));
    const lib = plan.changedDocuments.find((d) => d.path === libraryPath)!;
    const entries = lib.after.entries as { id: string; item: { instanceId?: string } }[];
    expect(entries[0]).toMatchObject({ id: "boots-1", item: { instanceId: "boots-1" } });
    expect(entries[1].item.instanceId).toBe(
      deterministicCustomInstanceId("u1", "library", "spell", 1)
    );
    expect(entries[1].id).toBe(entries[1].item.instanceId);
    expect(entries[2].item).not.toHaveProperty("instanceId");
  });

  it("reports duplicate ids inside one document and an unparseable envelope as issues, never a change", () => {
    const dup = envelope({
      name: "Bo",
      equipment: [
        { custom: true, name: "A", instanceId: "same" },
        { custom: true, name: "B", instanceId: "same" },
      ],
    });
    const plan = planCustomIdentity([
      { path: parentPath, data: dup },
      { path: "users/u1/characters/c2", data: { schema: 3, build: "nope", state: {} } },
    ]);
    expect(plan.changedDocuments).toEqual([]);
    expect(plan.issues.map((i) => i.code).sort()).toEqual([
      "duplicate-instance-id",
      "invalid-envelope",
    ]);
  });
});
```

`tests/unit/migration-kit.test.ts`: `parseCliOptions` accepts `--fixtures /abs/dir` alone and rejects it with `--apply`; `pathHash` is 16 hex chars; `writeBackupDirectory` writes a manifest with `migration` and `label` (port the relevant assertions from `tests/unit/migrate-item-resources.test.ts`).

- [ ] **Step 2: Run to verify failure** — `pnpm test --run tests/unit/migrate-custom-identity.test.ts tests/unit/migration-kit.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement the kit by extraction, then the script**

Move the helpers from `scripts/migrate-item-resources.ts` into `scripts/lib/migration-kit.ts` (same code, exported), then make `migrate-item-resources.ts` import them and re-export the names its test imports. `writeBackupDirectory` gains the `migration` argument; `migrate-item-resources.ts` passes `migration: "item-resources", label: catalogue.fingerprint`; update its test's manifest assertion accordingly.

`scripts/migrate-custom-identity.ts` core:

```ts
#!/usr/bin/env node
/**
 * P1 identity migration: every custom spell/weapon/equipment/feature on a character parent,
 * a character snapshot and a library index gains a stable `instanceId` (design §5.5).
 * Read-only by default; `--check` proves the corpus migrated; `--fixtures <dir>` plans over
 * portable exports (the six team fixtures) with no Firebase; `--apply --backup <dir>` writes.
 * Output: counts, hashes, issue codes. Never a payload, never a path.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { argv as processArgv, exit } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  hashFirestoreDocument,
  isRecord,
  MigrationIssue,
  parseCliOptions,
  pathHash,
  runGuardedMigration,
  sha256,
  type MigrationSourceDocument,
} from "./lib/migration-kit";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const SNAPSHOT = /^users\/([^/]+)\/characters\/([^/]+)\/snapshots\/([^/]+)$/;
const LIBRARY = /^users\/([^/]+)\/library\/index$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/; // mirrors src/lib/resources.ts ITEM_INSTANCE_ID_RE
const COLLECTIONS = ["spells", "weapons", "equipment"] as const;
const SHEET_KINDS = new Set(["spell", "feature", "equipment", "weapon"]);

export function deterministicCustomInstanceId(
  uid: string,
  charId: string,
  collection: string,
  ordinal: number
): string {
  if (!Number.isInteger(ordinal) || ordinal < 0)
    throw new RangeError("ordinal must be non-negative");
  return `cu-${sha256(`custom-identity-v1\0${uid}\0${charId}\0${collection}\0${ordinal}`).slice(0, 32)}`;
}

interface Stamped {
  data: Record<string, unknown>;
  stamped: Record<string, number>;
  issues: MigrationIssue[];
}

function stampList(
  list: unknown,
  scope: [string, string, string],
  path: string,
  seen: Set<string>,
  stamped: Record<string, number>,
  issues: MigrationIssue[]
): unknown {
  if (list === undefined) return undefined;
  if (!Array.isArray(list)) {
    issues.push({
      path,
      code: "invalid-envelope",
      detail: `${scope[2]} is not an array`,
    });
    return list;
  }
  return list.map((entry, ordinal) => {
    if (!isRecord(entry) || entry.custom !== true) return entry;
    const existing = entry.instanceId;
    if (ID_RE.test(String(existing))) {
      if (seen.has(String(existing)))
        issues.push({
          path,
          code: "duplicate-instance-id",
          detail: `${scope[2]}[${ordinal}]`,
        });
      seen.add(String(existing));
      return entry;
    }
    const instanceId = deterministicCustomInstanceId(
      scope[0],
      scope[1],
      scope[2],
      ordinal
    );
    seen.add(instanceId);
    stamped[scope[2]] = (stamped[scope[2]] ?? 0) + 1;
    const { instanceId: _drop, ...rest } = entry; // an invalid id is replaced, never kept beside
    void _drop;
    return { ...rest, instanceId };
  });
}

export function stampEnvelope(
  uid: string,
  charId: string,
  prefix: string,
  data: Record<string, unknown>,
  path: string
): Stamped {
  const issues: MigrationIssue[] = [];
  const stamped: Record<string, number> = {};
  if (!isRecord(data.build)) {
    issues.push({ path, code: "invalid-envelope", detail: "build is not a map" });
    return { data, stamped, issues };
  }
  const seen = new Set<string>();
  const build: Record<string, unknown> = { ...data.build };
  for (const coll of COLLECTIONS) {
    const next = stampList(
      build[coll],
      [uid, charId, `${prefix}${coll}`],
      path,
      seen,
      stamped,
      issues
    );
    if (next !== undefined) build[coll] = next;
  }
  if (isRecord(build.customs) && build.customs.features !== undefined) {
    build.customs = {
      ...build.customs,
      features: stampList(
        build.customs.features,
        [uid, charId, `${prefix}customs.features`],
        path,
        seen,
        stamped,
        issues
      ),
    };
  }
  return { data: { ...data, build }, stamped, issues };
}

export function stampLibrary(
  uid: string,
  data: Record<string, unknown>,
  path: string
): Stamped {
  /* entries[].item.instanceId = valid entry.id ?? deterministic(uid, "library", kind, ordinal); entry.id follows the item; monsters untouched */
}

export function planCustomIdentity(sources: readonly MigrationSourceDocument[]) {
  /* classify by path → stampEnvelope / stampLibrary; before/after hashes via hashFirestoreDocument; changed iff hash differs; counts */
}

export function verifyCustomIdentityCorpus(
  sources: readonly MigrationSourceDocument[]
): MigrationIssue[] {
  /* re-plan; any stamp needed or issue → issue */
}

export function reportFor(plan: ReturnType<typeof planCustomIdentity>) {
  return {
    format: "d20-folio-custom-identity-report-v1",
    counts: plan.counts,
    changed: plan.changedDocuments.map((d) => ({
      path: pathHash(d.path),
      before: d.beforeHash,
      after: d.afterHash,
      stamped: d.stamped,
    })),
    issues: plan.issues.map((i) => ({ path: pathHash(i.path), code: i.code })),
  };
}
```

`run()`: `fixtures` mode reads every `*.json` in the directory, wraps each as `{ path: \`fixtures/${name}\`, data: JSON.parse(text) }`(uid`fixtures`, charId = file stem), prints `reportFor(plan)`and exits 1 when`issues.length > 0`; the other modes go through `runGuardedMigration`with`plan`, `verify: verifyCustomIdentityCorpus`, `update: (doc) => ({ build: doc.after.build })`for parents/snapshots and`({ entries: doc.after.entries })`for libraries,`migration: "custom-identity"`.

- [ ] **Step 4: Run** `pnpm test --run tests/unit/migrate-custom-identity.test.ts tests/unit/migration-kit.test.ts tests/unit/migrate-item-resources.test.ts` → PASS. Then the fixtures dry-run:

```bash
node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts --fixtures "$(pwd)/content-pack/fixtures/team"
```

Expected (with 4b applied): `counts.stampedByCollection` empty, `issues: []`. Save the output to the scratchpad for the owner report.

- [ ] **Step 5: Commit**

```bash
cat > .changeset/migrate-custom-identity.md <<'EOF'
---
---

Add the shared migration kit (target assertion, guarded batch, backup, hashed reporting) and the read-only-by-default `migrate-custom-identity` script that stamps deterministic instanceIds on custom entries of parents, snapshots and library indexes (ADR-0009 protocol).
EOF
git add -A
git commit -m "feat(scripts): migration kit and custom-identity migration"
```

---

### Task 6: Legacy parent cutover script `scripts/migrate-character-parents.ts`

**Files:**

- Create: `scripts/migrate-character-parents.ts`
- Test: `tests/unit/migrate-character-parents.test.ts`
- Modify: `docs/CHARACTER_SCHEMA.md` (migration appendix), `docs/RELEASE.md` (the ADR-0009 gate)

**Interfaces:**

- Produces: `planParentCutover(families: CharacterFamily[]): CutoverPlan` where `CharacterFamily = { uid; charId; parent: { path; data }; child?: { path; data } }`; per family the plan emits parent update `{ playStateVersion: 1, state: {}, revision: <existing | 0> }` (only the fields that change) and a child `set`/`update`; `hpMaxOf(parent)` reads `cache.hpMax` (issue `missing-cache-hpmax` when absent); issue codes: `invalid-envelope`, `missing-cache-hpmax`, `marked-parent-missing-child`, `invalid-child`, `invalid-play-state`, `duplicate-document`, `verification-failed`.
- Consumes from `src/lib` through the same direct-URL import pattern `migrate-item-resources.ts` uses (`new URL("../src/lib/…", import.meta.url).href`): `stateToSession`, `sessionToState`, `sessionToPlayStateV1`, `parsePersistedPlayStateV1` (session-state-codec), `sanitizeSession` (sanitize-session), `applyCombatToSession`, `sessionToCombatState`, `omitCombatTrio` (combat-state), `parseCombatState` (combat-state-io — Firebase-bound: import `parseCombatState` only after Task 8 moves it into `src/lib/combat-state-codec.ts`; until then re-author the strict parse locally in the script, then delete the local copy in Task 8 — see Task 8 Step 3), `combatStateWriteData` minus `serverTimestamp` (the script stamps `updatedAt` with `FieldValue.serverTimestamp()` itself).

- [ ] **Step 1: Write the failing planner tests**

```ts
import { describe, expect, it } from "vitest";
import { planParentCutover } from "../../scripts/migrate-character-parents";

const uid = "u1",
  charId = "c1";
const parentPath = `users/${uid}/characters/${charId}`;
const childPath = `${parentPath}/combat/state`;
const legacyParent = (
  state: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) => ({
  schema: 3,
  build: { name: "Bo", classes: [{ classId: "monk", level: 3 }] },
  state,
  cache: { name: "Bo", hpMax: 24, ac: 15 },
  status: "active",
  shared: false,
  ...extra,
});

describe("legacy parent cutover", () => {
  it("moves the noncombat session into combat/state.playState, empties the parent state, marks v1 and stamps revision 0", () => {
    const plan = planParentCutover([
      {
        uid,
        charId,
        parent: {
          path: parentPath,
          data: legacyParent({
            trackers: { "monk-focus": 1 },
            usedSlots: { "1": 2 },
            notes: "n",
          }),
        },
        child: {
          path: childPath,
          data: {
            hp: { current: 9, temp: 0 },
            conditions: ["prone"],
            initiativeRoll: 12,
            deathSaves: { successes: 0, failures: 1 },
            round: 3,
            recentActions: [],
            bardicInspirationDie: "",
          },
        },
      },
    ]);
    expect(plan.issues).toEqual([]);
    const parent = plan.writes.find((w) => w.path === parentPath)!;
    expect(parent).toMatchObject({
      kind: "update",
      data: { playStateVersion: 1, state: {}, revision: 0 },
    });
    const child = plan.writes.find((w) => w.path === childPath)!;
    expect(child.kind).toBe("update");
    expect(child.data.playState).toEqual({
      version: 1,
      state: { trackers: { "monk-focus": 1 }, usedSlots: { "1": 2 }, notes: "n" },
    });
    expect(child.data).not.toHaveProperty("hp"); // the trio stays exactly as stored
  });

  it("creates the child with full HP when a legacy parent has none", () => {
    const plan = planParentCutover([
      {
        uid,
        charId,
        parent: { path: parentPath, data: legacyParent({ exhaustion: 1 }) },
      },
    ]);
    const child = plan.writes.find((w) => w.path === childPath)!;
    expect(child.kind).toBe("create");
    expect(child.data).toMatchObject({
      hp: { current: 24, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
      round: 1,
      playState: { version: 1, state: { exhaustion: 1 } },
    });
  });

  it("a marked parent only gains revision when missing; a marked parent without a child is an issue", () => {
    const marked = legacyParent({}, { playStateVersion: 1 });
    const okPlan = planParentCutover([
      {
        uid,
        charId,
        parent: { path: parentPath, data: marked },
        child: {
          path: childPath,
          data: {
            hp: { current: 1, temp: 0 },
            conditions: [],
            initiativeRoll: null,
            deathSaves: { successes: 0, failures: 0 },
            playState: { version: 1, state: {} },
          },
        },
      },
    ]);
    expect(okPlan.writes).toEqual([
      { kind: "update", path: parentPath, data: { revision: 0 } },
    ]);
    const done = planParentCutover([
      {
        uid,
        charId,
        parent: { path: parentPath, data: { ...marked, revision: 4 } },
        child: okPlan.families[0].child,
      },
    ]);
    expect(done.writes).toEqual([]);
    const bad = planParentCutover([
      { uid, charId, parent: { path: parentPath, data: marked } },
    ]);
    expect(bad.issues.map((i) => i.code)).toEqual(["marked-parent-missing-child"]);
    expect(bad.writes).toEqual([]);
  });

  it("is idempotent: planning the projected corpus yields no writes", () => {
    const first = planParentCutover([
      { uid, charId, parent: { path: parentPath, data: legacyParent({ notes: "n" }) } },
    ]);
    const second = planParentCutover(first.projectedFamilies);
    expect(second.writes).toEqual([]);
    expect(second.issues).toEqual([]);
  });

  it("refuses a legacy parent without cache.hpMax and never invents HP", () => {
    const plan = planParentCutover([
      {
        uid,
        charId,
        parent: { path: parentPath, data: legacyParent({}, { cache: { name: "Bo" } }) },
      },
    ]);
    expect(plan.issues.map((i) => i.code)).toEqual(["missing-cache-hpmax"]);
    expect(plan.writes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — module missing.

- [ ] **Step 3: Implement**

Per family, `planParentCutover`:

1. Parse `parent.data`: `schema === 3`, `build`/`state`/`cache` maps → else `invalid-envelope`.
2. `marked = Object.hasOwn(parent, "playStateVersion")`; if marked and `!== 1` → `invalid-envelope`.
3. Child parse (when present) with the strict rules of `parseCombatState` (hp/deathSaves maps, arrays); `invalid-child` on failure. If marked: child required with a valid `playState` (`parsePersistedPlayStateV1`) → `marked-parent-missing-child` / `invalid-play-state`.
4. Legacy: `hpMax = cache.hpMax` (number ≥ 1) else `missing-cache-hpmax`. `session = sanitizeSession(stateToSession(parent.state))`; `hydrated = applyCombatToSession(session, child ?? null, hpMax, "legacy")` (this signature still exists until Task 8; Task 8 then drops the argument here too); `playState = sessionToPlayStateV1(hydrated.session)`. Child write: existing → `update { playState, updatedAt }`; absent → `create combatStateWriteData(sessionToCombatState(hydrated.session))` with the script's own `updatedAt`. Parent write: `{ playStateVersion: 1, state: {}, ...(typeof parent.revision === "number" ? {} : { revision: 0 }) }`.
5. Marked: parent write `{ revision: 0 }` only when `revision` is not a number.
6. `projectedFamilies` = the families with writes applied (for the idempotency test and the apply-time projected check).

`discover(db)`: `collectionGroup("characters")` filtered by the parent regex, plus `db.doc(\`${path}/combat/state\`).get()`per parent (N reads; the corpus is small — print the count). The dry-run/check/apply flow goes through`runGuardedMigration`(parents and children are ≤ 500 writes; refuse above). Report:`{ format: "d20-folio-parent-cutover-report-v1", counts: { parents, legacy, marked, childrenCreated, childrenUpdated, revisionStamped }, writes: [{ path: pathHash, kind, before, after }], issues: [{ path: pathHash, code }] }`.

- [ ] **Step 4: Run** `pnpm test --run tests/unit/migrate-character-parents.test.ts` → PASS.

- [ ] **Step 5: Docs**

`docs/CHARACTER_SCHEMA.md` migration appendix: replace the `playStateVersion` paragraph with: _P1 cutover (`scripts/migrate-character-parents.ts`): every live parent is v1 (`state: {}`, the play session lives in `combat/state.playState`), every character has a `combat/state` child, every parent carries `revision`. `playStateVersion: 1` remains a dead stored field until the P3 `combat/state` v2 migration deletes it; no code reads it._ `docs/RELEASE.md` "Deploying": add the ADR-0009 gate: _Before deploying a SHA that reads a new persisted shape, run the migration(s) listed under "Pending migrations" in `docs/PROGRAM_STATUS.md` with `--check` green against production; a deploy with a pending migration is refused._

- [ ] **Step 6: Commit**

```bash
cat > .changeset/migrate-character-parents.md <<'EOF'
---
---

Add the read-only-by-default legacy parent cutover script: unmarked parents move their play session into `combat/state.playState` (creating the child at full HP when absent), every parent gains `revision`, and the report carries counts, hashes and issue codes only. `docs/RELEASE.md` gains the ADR-0009 migrate-before-deploy gate.
EOF
git add -A
git commit -m "feat(scripts): legacy parent cutover migration"
```

---

### Task 7: Per-domain reconciliation, snapshot metadata, save callbacks, `revision` CAS, the two replays

**Files:**

- Create: `src/lib/character-snapshot-reconciler.ts`
- Modify: `src/lib/firestore.ts` (`subscribeToCharacter` metadata, `createDebouncedSave` callbacks, `updateCharacterParent`/`setCharacterSharing`/`restoreCharacterSnapshot`/`createCharacter` write `revision`, `readDocMeta` reads it), `src/types/character.ts` (`CharacterDoc.revision: number`), `src/hooks/useCharacterSubscription.ts`, `src/lib/combat-state-io.ts:602-635` (`includeMetadataChanges: true`), `firestore.rules` (character `create`/`update` revision predicate), `src/stores/saveStore.ts` (no change; `markError("conflict")` reuses the existing status), `tests/unit/use-character-subscription.test.ts` (harness + 2 replays), `tests/unit/play-state-persistence-cutover.test.ts` (revision assertions), `tests/rules/firestore-rules.test.ts` (3 cases), `docs/ARCHITECTURE.md` ("Persistence + offline": the reconciler and the revision CAS), migration program §P1.3 (reconcile the wording to `revision`)
- Test: `tests/unit/character-snapshot-reconciler.test.ts`

**Interfaces:**

- `createCharacterSnapshotReconciler<Parent, Child>(equals?)` with `receiveParent(value, meta)`, `receiveChild(value, meta)`, `markParentPending(value)`, `markChildPending(value)`, `acknowledgeParentWrite(value)`, `acknowledgeChildWrite(value)`, `rejectParentWrite(value)`, `rejectChildWrite(value)`, `current(): { parent; child; parentPending; childPending; parentConflict; childConflict }`, `reset()`. `meta = { hasPendingWrites: boolean }`.
- `subscribeToCharacter(uid, charId, cb: (doc: CharacterDoc | null, meta: { hasPendingWrites: boolean }) => void, onError?)`.
- `DebouncedSaveHandle.save(data: CharacterDoc, callbacks?: { onResolved?: (data) => void; onRejected?: (data, error: unknown) => void; onCancelled?: (data) => void })`; `cancel()` reports `onCancelled` for the write it dropped; `save()` called again silently supersedes (no callback).
- `updateCharacterParent` writes `{ …envelope, cache, revision: data.revision, updatedAt }`; the hook sets `payload.revision = base + 1` where `base = max(reconciler.current().parent.revision, lastSentRevision)`.
- Rules predicate (inside `match /users/{uid}/characters/{charId}`):

```
      // P1 — the parent build write is compare-and-set on `revision` (design §5.3):
      // a build/state/cache change must carry exactly resource.revision + 1; a
      // metadata-only write must leave it untouched. Offline writes queue and are
      // rejected on reconnect when stale, which the client surfaces as a conflict.
      function revisionAdvancesWithBuild() {
        let changed = request.resource.data.diff(resource.data).affectedKeys();
        return request.resource.data.revision is int
          && (changed.hasAny(['build', 'state', 'cache'])
              ? request.resource.data.revision == resource.data.revision + 1
              : request.resource.data.revision == resource.data.revision);
      }
```

`create` requires `request.resource.data.revision == 0`.

- [ ] **Step 1: Write the failing reconciler test**

`tests/unit/character-snapshot-reconciler.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createCharacterSnapshotReconciler } from "@/lib/character-snapshot-reconciler";

type Parent = { name: string; equipment: string[] };
type Child = { focus: number };
const server = { hasPendingWrites: false };
const local = { hasPendingWrites: true };

describe("character snapshot reconciler", () => {
  it("publishes the remote pair in either arrival order", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveChild({ focus: 3 }, server);
    expect(r.current().parent).toBeUndefined();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    expect(r.current()).toMatchObject({
      parent: { name: "Bo" },
      child: { focus: 3 },
      parentPending: false,
    });
  });

  it("a dirty parent keeps its local payload while the child snapshot interleaves", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    r.markParentPending({ name: "Bo", equipment: ["Bo's shoes"] });
    r.receiveChild({ focus: 2 }, server);
    expect(r.current().parent).toEqual({ name: "Bo", equipment: ["Bo's shoes"] });
    expect(r.current().parentPending).toBe(true);
  });

  it("a local echo never clears a pending write; a matching server snapshot acknowledges it", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    const pending = { name: "Bo", equipment: ["Bo's shoes"] };
    r.markParentPending(pending);
    r.receiveParent({ name: "Bo", equipment: ["Bo's shoes"] }, local);
    expect(r.current().parentPending).toBe(true);
    r.receiveParent({ name: "Bo", equipment: ["Bo's shoes"] }, server);
    expect(r.current()).toMatchObject({
      parentPending: false,
      parentConflict: false,
      parent: pending,
    });
  });

  it("a differing server snapshot marks a conflict but the local payload still shows until rejected", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    const pending = { name: "Bo", equipment: ["Bo's shoes"] };
    r.markParentPending(pending);
    r.receiveParent({ name: "Bo", equipment: ["other device"] }, server);
    expect(r.current()).toMatchObject({ parentConflict: true, parent: pending });
    r.rejectParentWrite(pending);
    expect(r.current()).toMatchObject({
      parentPending: false,
      parentConflict: false,
      parent: { equipment: ["other device"] },
    });
  });

  it("acknowledging or rejecting a superseded payload is a no-op for the newer pending one", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    const first = { name: "Bo", equipment: ["a"] };
    const second = { name: "Bo", equipment: ["a", "b"] };
    r.markParentPending(first);
    r.markParentPending(second);
    r.acknowledgeParentWrite(first);
    r.rejectParentWrite(first);
    expect(r.current()).toMatchObject({ parentPending: true, parent: second });
  });

  it("the child domain is symmetric and reset clears both", () => {
    const r = createCharacterSnapshotReconciler<Parent, Child>();
    r.receiveChild({ focus: 3 }, server);
    r.markChildPending({ focus: 2 });
    r.receiveParent({ name: "Bo", equipment: [] }, server);
    expect(r.current().child).toEqual({ focus: 2 });
    r.acknowledgeChildWrite({ focus: 2 });
    expect(r.current().childPending).toBe(false);
    r.reset();
    expect(r.current()).toEqual({
      parent: undefined,
      child: undefined,
      parentPending: false,
      childPending: false,
      parentConflict: false,
      childConflict: false,
    });
  });
});
```

- [ ] **Step 2: Write the two failing replays** in `tests/unit/use-character-subscription.test.ts`

Harness changes first: `subscribeMock`'s `cb` type gains `meta`; add `function snapshotCb(meta = { hasPendingWrites: false })` that wraps like `combatCb`; `debouncedSave` mock records `(payload, callbacks)`; add `function monkFocusDoc(): CharacterDoc` (monk 3, `features: [{ srdId: "monk-focus" }]`, `session.trackers = { "monk-focus": { used: 0 } }`, `revision: 4`) and `doc()` gains `revision: 4`.

```ts
it("REPLAY I2 — a custom item added while a combat snapshot interleaves stays in the store and in the pending payload", async () => {
  renderHook(() => useCharacterSubscription("char1"));
  await act(async () => {
    snapshotCb()(doc());
    combatCb()(sessionToCombatState(doc().session));
  });
  const boots: CustomEquipment = {
    custom: true,
    name: "Bo's shoes",
    equipped: true,
    instanceId: "bo-shoes",
  };
  act(() => {
    const cur = useCharacterStore.getState().character!;
    useCharacterStore.getState().setCharacter({
      ...cur,
      character: { ...cur.character, equipment: [...cur.character.equipment, boots] },
    });
  });
  const [payload] = debouncedSave.mock.calls.at(-1)!;
  expect(payload.character.equipment).toContainEqual(boots);
  expect(payload.revision).toBe(5);
  // the remote child snapshot arrives before the parent write is acknowledged
  await act(async () => {
    combatCb()(sessionToCombatState(doc().session));
  });
  expect(useCharacterStore.getState().character?.character.equipment).toContainEqual(
    boots
  );
  // the local echo of our own write
  await act(async () => {
    snapshotCb({ hasPendingWrites: true })({ ...payload });
  });
  expect(useCharacterStore.getState().character?.character.equipment).toContainEqual(
    boots
  );
  // the server confirms; nothing changes, nothing re-saves
  const saves = debouncedSave.mock.calls.length;
  await act(async () => {
    snapshotCb()({ ...payload });
  });
  expect(useCharacterStore.getState().character?.character.equipment).toContainEqual(
    boots
  );
  expect(debouncedSave.mock.calls.length).toBe(saves);
});

it("REPLAY I3 — a Focus spend survives an interleaving parent snapshot and lands in the pending child", async () => {
  renderHook(() => useCharacterSubscription("char1"));
  const monk = monkFocusDoc();
  await act(async () => {
    snapshotCb()(monk);
    combatCb()({
      ...sessionToCombatState(monk.session),
      playState: sessionToPlayStateV1(monk.session),
    });
  });
  let release!: () => void;
  writeCombatStateMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      })
  );
  act(() => {
    useCharacterStore.getState().useTracker("monk-focus", 1);
  });
  await flushPlayWrite();
  const [, , pendingChild] = writeCombatStateMock.mock.calls.at(-1)!;
  expect(pendingChild.playState?.state.trackers?.["monk-focus"]).toBe(1);
  // a parent snapshot (e.g. the DM detach or another tab's metadata write) arrives now
  await act(async () => {
    snapshotCb()({ ...monk, revision: 5 });
  });
  expect(
    useCharacterStore.getState().character?.session.trackers["monk-focus"]?.used
  ).toBe(1);
  await act(async () => {
    release();
    await Promise.resolve();
    combatCb()(pendingChild);
  });
  expect(
    useCharacterStore.getState().character?.session.trackers["monk-focus"]?.used
  ).toBe(1);
});

it("a rejected parent write surfaces SaveStatus=error and republishes the remote", async () => {
  renderHook(() => useCharacterSubscription("char1"));
  await act(async () => {
    snapshotCb()(doc());
    combatCb()(sessionToCombatState(doc().session));
  });
  act(() => {
    const cur = useCharacterStore.getState().character!;
    useCharacterStore
      .getState()
      .setCharacter({ ...cur, character: { ...cur.character, quote: "local" } });
  });
  const [payload, callbacks] = debouncedSave.mock.calls.at(-1)!;
  await act(async () => {
    snapshotCb()({
      ...doc(),
      revision: 5,
      character: { ...doc().character, quote: "other device" },
    });
  });
  expect(useCharacterStore.getState().character?.character.quote).toBe("local");
  act(() => {
    callbacks.onRejected(payload, new Error("permission-denied"));
  });
  expect(useCharacterStore.getState().character?.character.quote).toBe("other device");
  expect(useSaveStore.getState().status).toBe("error");
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test --run tests/unit/character-snapshot-reconciler.test.ts tests/unit/use-character-subscription.test.ts`
Expected: the reconciler file is missing; REPLAY I2 fails at "the remote child snapshot arrives" (the store reverts to `doc()`), REPLAY I3 fails at the parent-snapshot assertion (`used` back to 0). Record both failure messages in the commit body.

- [ ] **Step 4: Implement**

`src/lib/character-snapshot-reconciler.ts` (pure; register in `PURE_MODULES`):

```ts
/**
 * Per-domain reconciliation of the two character listeners (design §5.3; audit F7).
 * The parent (build + metadata) and the child (`combat/state`) arrive independently. A
 * domain with a pending local write keeps materializing that payload until the server
 * acknowledges it (a snapshot without `hasPendingWrites` that equals it, or the write
 * promise resolving); a sibling snapshot can therefore never republish an older remote
 * value over a local edit. A server value that differs from the pending one is a
 * conflict: recorded, still hidden behind the local payload, resolved when the write is
 * rejected (the rules' revision CAS) or acknowledged.
 */
export interface SnapshotMeta {
  hasPendingWrites: boolean;
}

interface Domain<V> {
  remote: V | null | undefined;
  pending: V | undefined;
  conflict: boolean;
}

export interface Reconciliation<P, C> {
  parent: P | null | undefined;
  child: C | null | undefined;
  parentPending: boolean;
  childPending: boolean;
  parentConflict: boolean;
  childConflict: boolean;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    );
  }
  return value;
}
export function canonicalJsonEquals(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

export function createCharacterSnapshotReconciler<P, C>(
  equals: (a: unknown, b: unknown) => boolean = canonicalJsonEquals
) {
  const empty = <V>(): Domain<V> => ({
    remote: undefined,
    pending: undefined,
    conflict: false,
  });
  let parent = empty<P>();
  let child = empty<C>();
  const receive = <V>(d: Domain<V>, value: V | null, meta: SnapshotMeta): void => {
    if (meta.hasPendingWrites && d.pending !== undefined) return; // our own echo
    d.remote = value;
    if (d.pending === undefined) {
      d.conflict = false;
      return;
    }
    if (equals(d.pending, value)) {
      d.pending = undefined;
      d.conflict = false;
      return;
    }
    d.conflict = true;
  };
  const settle = <V>(d: Domain<V>, value: V, ack: boolean): void => {
    if (d.pending === undefined || !equals(d.pending, value)) return;
    if (ack) d.remote = value;
    d.pending = undefined;
    d.conflict = false;
  };
  return {
    receiveParent: (v: P | null, m: SnapshotMeta) => receive(parent, v, m),
    receiveChild: (v: C | null, m: SnapshotMeta) => receive(child, v, m),
    markParentPending: (v: P) => {
      parent.pending = v;
      parent.conflict = false;
    },
    markChildPending: (v: C) => {
      child.pending = v;
      child.conflict = false;
    },
    acknowledgeParentWrite: (v: P) => settle(parent, v, true),
    acknowledgeChildWrite: (v: C) => settle(child, v, true),
    rejectParentWrite: (v: P) => settle(parent, v, false),
    rejectChildWrite: (v: C) => settle(child, v, false),
    current(): Reconciliation<P, C> {
      return {
        parent: parent.pending ?? parent.remote,
        child: child.pending ?? child.remote,
        parentPending: parent.pending !== undefined,
        childPending: child.pending !== undefined,
        parentConflict: parent.conflict,
        childConflict: child.conflict,
      };
    },
    reset() {
      parent = empty<P>();
      child = empty<C>();
    },
  };
}
```

Parent equality in the hook compares `serializeCharacterEnvelope(doc)` plus `revision` (metadata such as `updatedAt` differs by construction): pass `equals = (a, b) => canonicalJsonEquals(parentKey(a), parentKey(b))` with `parentKey = (d: CharacterDoc) => ({ env: serializeCharacterEnvelope(d), revision: d.revision, shared: d.shared, status: d.status })`.

`src/lib/firestore.ts`:

- `readDocMeta`: `if (typeof data.revision !== "number" || !Number.isInteger(data.revision) || data.revision < 0) throw new TypeError("Invalid character document: invalid-revision");` → `revision: data.revision`.
- `subscribeToCharacter`: `onSnapshot(charDoc(uid, charId), { includeMetadataChanges: true }, (snap) => { const meta = { hasPendingWrites: snap.metadata.hasPendingWrites }; … callback(doc, meta) })`.
- `createDebouncedSave`: `pendingWrite: { data; callbacks } | null`; `runWrite` → `updateCharacterParent(...).then(() => { onSaved(); callbacks?.onResolved?.(data); }, (err) => { diagnosticsLog("error", "character.save-rejected", { message }); onError(msg); callbacks?.onRejected?.(data, err); })`; `cancel()` → `callbacks?.onCancelled?.(data)`.
- `updateCharacterParent(uid, charId, data)`: the batch update carries `revision: data.revision` (the hook already bumped it). `createCharacter`: `revision: 0`. `setCharacterSharing(uid, source, shared)`: transaction reads `raw.revision`, requires `raw.revision === source.revision`, writes `revision: source.revision + 1`. `restoreCharacterSnapshot(uid, charId, snapshot, baseRevision: number)`: writes `revision: baseRevision + 1`; `replaceCharacterState` forwards `useCharacterStore` doc's revision from its callers (level-up: `characterStore.ts` call sites pass `character.revision`).

`src/hooks/useCharacterSubscription.ts` (production branch): create the reconciler per activation; `lastParent`/`lastCombat` deleted; `publishResolvedPair` reads `reconciler.current()`; parent listener `(doc, meta) => { reconciler.receiveParent(doc, meta); publishResolvedPair(); }`; combat listener keeps the undo fence, then `reconciler.receiveChild(combat, meta)`; `writeCompletePlayState` does `reconciler.markChildPending(state)` and `.then(() => reconciler.acknowledgeChildWrite(state), (e) => { reconciler.rejectChildWrite(state); publishResolvedPair(); logWrite(e); })`; the store subscriber builds the payload with `revision: Math.max(reconciler.current().parent?.revision ?? 0, lastSentRevision) + 1`, `lastSentRevision = payload.revision`, `reconciler.markParentPending(payload)`, `save(payload, { onResolved: ack, onRejected: (d) => { reconciler.rejectParentWrite(d); lastSentRevision = 0; saveStatusCallbacks.onError("conflict"); publishResolvedPair(); }, onCancelled: (d) => { reconciler.rejectParentWrite(d); publishResolvedPair(); } })`. `quarantine` → `reconciler.reset()`. The dev-bypass branch mirrors the same shape with `projectDevCharacterParent`.

`combat-state-io.ts` `subscribeCombatState`: add `{ includeMetadataChanges: true }`.

Rules: add `revisionAdvancesWithBuild()` and use it in `allow update: if isNotBlocked() && ((request.auth.uid == uid && validPlayStateVersionOnUpdate() && revisionAdvancesWithBuild()) || isCampaignDmDetach()) && …`; `allow create` adds `&& request.resource.data.revision == 0`. (Task 8 removes `validPlayStateVersionOnUpdate`.) Rules tests, in the character-reads describe (fixtures gain `revision: 3`):

```ts
it("a build write must carry revision + 1; a stale revision is denied; metadata leaves it alone", async () => {
  const owner = testEnv.authenticatedContext("member").firestore();
  const ref = doc(owner, "users", "member", "characters", "char-member");
  await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 3 }));
  await assertFails(updateDoc(ref, { build: { name: "Mara II" }, revision: 5 }));
  await assertSucceeds(updateDoc(ref, { build: { name: "Mara II" }, revision: 4 }));
  await assertFails(updateDoc(ref, { status: "retired", revision: 5 }));
  await assertSucceeds(updateDoc(ref, { status: "retired" }));
});

it("a character is born at revision 0", async () => {
  const owner = testEnv.authenticatedContext("member").firestore();
  await assertFails(
    setDoc(doc(owner, "users", "member", "characters", "new-1"), {
      status: "active",
      build: {},
      state: {},
      cache: {},
      revision: 1,
    })
  );
  await assertSucceeds(
    setDoc(doc(owner, "users", "member", "characters", "new-2"), {
      status: "active",
      build: {},
      state: {},
      cache: {},
      revision: 0,
    })
  );
});
```

- [ ] **Step 5: Run**

Run: `pnpm typecheck && pnpm test --run tests/unit/character-snapshot-reconciler.test.ts tests/unit/use-character-subscription.test.ts tests/unit/use-member-character-subscription.test.ts tests/unit/play-state-persistence-cutover.test.ts tests/unit/pure-modules-guard.test.ts && pnpm test:rules`
Expected: PASS; both replays green.

- [ ] **Step 6: Docs**

`docs/ARCHITECTURE.md` "Persistence + offline": describe the reconciler (dirty domain wins until acknowledged; conflict → `SaveStatus="error"`, remote republished, diagnostics `character.save-rejected`), `revision` (integer, bumped on every build/state/cache write, CAS in the rules, offline-safe). Migration program §P1.3: replace "precondition on `updatedAt` (transaction)" with "precondition on `revision` (rules CAS)" and note why.

- [ ] **Step 7: Commit**

```bash
cat > .changeset/snapshot-reconciler-revision.md <<'EOF'
---
---

Character persistence reconciles the parent and `combat/state` listeners per domain (a pending local write is never republished over by a sibling snapshot), the debounced save reports resolve/reject/cancel, and every build write is compare-and-set on a stored `revision` enforced by the rules; a conflict surfaces as a save error instead of clobbering. Two replays pin the reported losses (custom item vanishing, Focus reverting).
EOF
git add -A
git commit -m "fix(persistence): per-domain snapshot reconciliation and revision compare-and-set"
```

---

### Task 8: Legacy cutover in code, character-path rules simplification, test-portfolio trim, document reconciliation

**Files:**

- Modify (deletions): `src/types/character.ts:523-529` (`playStateVersion` removed), `src/lib/firestore.ts` (`readDocMeta` marker branch, `toStoredPayload` marker branches → always `state: {}`, `updateCharacterParent` conditional projection, `setCharacterSharing` marker check, `restoreCharacterSnapshot` marker, `hydrateCompleteCharacter` legacy branch → a missing or `playState`-less child throws `"Invalid character document: missing-combat-state"`), `src/lib/combat-state.ts:166-193` (`PlayStateOwnership` deleted; `applyCombatToSession(session, combat, effectiveMax)`: `combat === null` → fresh defaults (export/fixture/roster baseline), a present combat must carry a valid `playState`), `src/lib/combat-state-io.ts` (`CombatStateParseResult.ownership` deleted, `playState` required; move the Firebase-free parse into `src/lib/combat-state-codec.ts` and re-export — the codec extraction the audit credits to the Codex branch, re-authored here), `src/hooks/useCharacterSubscription.ts` (`marked` branches; `persistPlayState` always), `src/features/campaigns/useMemberCharacterSubscription.ts:60-210`, `src/features/campaigns/campaign-io.ts:829-837,846,1060,1080` (`storedPlayStateOwnership` deleted), `src/lib/character-cache.ts:237-239,273`, `src/features/campaigns/party-stats.ts:266`, `src/hooks/useCharacters.ts:98`, `src/lib/dev-fixtures.ts:55`, `src/stores/characterStore.ts:868-890,1253,1288,3133` (`writeTurnEconomy` seam deleted with `writeCombatTurnEconomy`), `scripts/migrate-character-parents.ts` (drop the ownership argument; import `parseCombatState` from the codec)
- Modify (rules): `firestore.rules:34-89,131-248,306-483` per the block below
- Modify (tests): `tests/unit/play-state-persistence-cutover.test.ts` → renamed `tests/unit/character-parent-persistence.test.ts` with the v1-only contract (≤ 6 cases), `tests/unit/use-character-subscription.test.ts`, `tests/unit/use-member-character-subscription.test.ts`, `tests/unit/character-store.test.ts`, `tests/unit/campaign-io.test.ts`, `tests/unit/party-stats.test.ts`, `tests/unit/public-character-projection.test.ts`, `tests/unit/dev-document-store.test.ts`, `tests/unit/combat-state-io-roundtrip.test.ts`, `tests/rules/firestore-rules.test.ts`
- Modify (docs): `docs/CHARACTER_SCHEMA.md`, `docs/ARCHITECTURE.md` ("Combat-mutable state lives in a per-character subdoc": v1 only), `docs/TEST_PORTFOLIO.md` (rules counts), migration program §P1 (deletions executed), `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5.4 (what the rules contain after P1)

- [ ] **Step 1: Delete the marker from the type and let the compiler enumerate the work**

Remove `playStateVersion?: 1;` from `CharacterDoc`; run `pnpm typecheck`; every error is a site in the Files list. Also `grep -rn "playStateVersion\|\"legacy\"" src scripts tests --include='*.ts' --include='*.tsx'` — the `"legacy"` hits in `combat-log`/`rest-world-boundary`/`sanitize-session`/`combat-log-view` are unrelated (log-row kind, rest outcome) and stay.

- [ ] **Step 2: Write the failing v1-only persistence contract** (`tests/unit/character-parent-persistence.test.ts`, the same `firebase/firestore` harness as the old file):

```ts
it("the parent autosave writes an empty state, the cache and the bumped revision; the play session goes to the child", async () => {
  const doc = { ...makeCharacterDoc(), revision: 7 };
  await updateCharacterParent("u1", doc.id, doc); // exported for the test
  const parent = harness.operations.find(
    (op) => op.path === `users/u1/characters/${doc.id}`
  )!;
  expect(parent.data).toMatchObject({ state: {}, revision: 7, updatedAt: "server-ts" });
  expect(parent.data).not.toHaveProperty("playStateVersion");
});

it("hydration fails closed on a missing child or a child without playState", async () => {
  await expect(hydrateCompleteCharacter(parsedParent, null)).rejects.toThrow(
    "missing-combat-state"
  );
  await expect(
    hydrateCompleteCharacter(parsedParent, {
      hp: { current: 1, temp: 0 },
      conditions: [],
      initiativeRoll: null,
      deathSaves: { successes: 0, failures: 0 },
    })
  ).rejects.toThrow("invalid-v1-play-state");
});
```

plus the surviving cases from the old file (restore writes parent + child atomically with `revision + 1`; sharing CAS on `revision`; `createCharacter` seeds `revision: 0` and the child). Delete: "legacy spell-slot edit stays on parent", "shared legacy parent autosaves without projection", "rejects a missing marked child but retains legacy contract", "cannot publish the marker as metadata" — each named in the commit body as dying with the unmarked-legacy representation.

- [ ] **Step 3: Implement the code deletions** listed under Files. Key shapes:

`applyCombatToSession(session, combat, effectiveMax)`:

```ts
export function applyCombatToSession(
  session: SessionState,
  combat: CombatState | null,
  effectiveMax: number
): CombatSessionHydrationResult {
  const parsedPlayState = combat ? parsePersistedPlayStateV1(combat.playState) : null;
  if (combat && (!parsedPlayState || !parsedPlayState.ok))
    return { ok: false, reason: "invalid-v1-play-state" };
  const baseSession = parsedPlayState?.ok
    ? {
        ...parsedPlayState.session,
        ...(session.encounterEffects
          ? { encounterEffects: session.encounterEffects }
          : {}),
      }
    : session;
  // …the existing trio clamp/default block, unchanged…
}
```

`hydrateCompleteCharacter(parent, rawCombat)`: `if (!combat) throw new TypeError("Invalid character document: missing-combat-state");` then `applyCombatToSession(hydrationBase, combat, max)`; `!ok` → `throw new TypeError(\`Invalid character document: ${reason}\`)`.

`toStoredPayload`: `const state = {};` always (the legacy `omitCombatTrio(envelope.state)` branch and `marksPlayStateV1` deleted; `omitCombatTrio` stays exported for the portable export if still used, else deleted).

`src/lib/combat-state-codec.ts`: move `isRecord`, `isPlainJson`, `sameJson`, `presentFieldIsCanonical`, `presentFieldIsPlainJson`, `STRICT_V1_FIELDS`, `parsePendingConcentrationSaves`, `parseTurnEconomy`, `parseAppliedEncounterEffects`, `parseRecentActions`, `parseLocText`, `CombatStateParseResult`, `parseCombatState` verbatim from `combat-state-io.ts`; `parseCombatState` returns `{ ok: false, reason: "invalid-v1-play-state" }` when `playState` is absent or invalid; register the codec in `PURE_MODULES`; `combat-state-io.ts` re-exports it; the migration script imports it by URL and deletes its local copy.

`characterStore.ts`: `persistCombatRound` → always `persistCombat(get)`; delete `CombatPersistence.writeTurnEconomy` and `writeCombatTurnEconomy` (+ its test cases, named).

`useCharacterSubscription.ts`: `marked` is gone — `parentChanged = buildChanged || cacheChanged`; `if (sessionChanged) state.persistPlayState();`; `writeCompletePlayState` always coalesces.

- [ ] **Step 4: Rewrite the character-path rules**

Replace `firestore.rules:131-248` with:

```
    match /users/{uid}/characters/{charId} {
      function attachedCampaign() {
        return get(/databases/$(database)/documents/campaigns/$(resource.data.attachedCampaignId)).data;
      }
      function isCurrentCampaignAttachment() {
        let campaign = attachedCampaign();
        return request.auth.uid in campaign.members
          && uid in campaign.members
          && campaign.get('memberDetails', {}).get(uid, {}).get('characterId', '') == charId;
      }
      // The parent never carries a play session: the play owner is combat/state (P1).
      function parentStateEmptyAfter() {
        return request.resource.data.state is map && request.resource.data.state.size() == 0;
      }
      function publicSheetMatchesAfter() {
        let sheetPath = /databases/$(database)/documents/users/$(uid)/characters/$(charId)/public/sheet;
        return (request.resource.data.get('shared', false) == true
                && existsAfter(sheetPath)
                && isExactPublicCharacterSheet(getAfter(sheetPath).data, request.resource.data))
          || (request.resource.data.get('shared', false) != true && !existsAfter(sheetPath));
      }
      function revisionAdvancesWithBuild() { …as in Task 7… }
      // Membership, not gameplay: the DM releases a removed member's character. Dies with
      // the P4 lease (`table:leave`), which makes the owner's client clear the attachment.
      function isCampaignDmDetach() { …unchanged body… }
      allow read:  if (isNotBlocked() && request.auth.uid == uid)
        || isAdmin()
        || (isNotBlocked() && resource.data.get("attachedCampaignId", "") != "" && isCurrentCampaignAttachment());
      allow create: if isNotBlocked()
        && request.auth.uid == uid
        && request.resource.data.revision == 0
        && parentStateEmptyAfter()
        && publicSheetMatchesAfter();
      allow update: if isNotBlocked()
        && ((request.auth.uid == uid && revisionAdvancesWithBuild()) || isCampaignDmDetach())
        && parentStateEmptyAfter()
        && publicSheetMatchesAfter();
      allow delete: if isNotBlocked()
        && request.auth.uid == uid
        && !existsAfter(/databases/$(database)/documents/users/$(uid)/characters/$(charId)/public/sheet);
    }
```

`isExactPublicCharacterSheet`: delete the line `&& character.playStateVersion == 1`. Replace the `combat/{stateId}` match with a literal `match /users/{uid}/characters/{charId}/combat/state` whose `allow create` is `isNotBlocked() && (request.auth.uid == uid || isAdmin())` (the `peerLegacyCoreCreate` disjunct and function deleted, with `validPeerConditions([], …)` only if no longer referenced elsewhere — it is still used by `peerEffectUpdate`, keep it); `read`/`update`/`delete` unchanged; the whole peer block carries the comment _P4 deletion: `isAttachedPeer`, `peerEffectUpdate` and its validators die with the encounter document_. Delete `hasV1CombatOwnerAfter`, `validPlayStateVersionOnCreate`, `playStateVersionUnchanged`, `validPlayStateVersionOnUpdate`, `validV1ParentStateAfter`.

- [ ] **Step 5: Trim the rules suite to ≤ 120 cases**

Budget (current → target): `/users` 9 → 6; `/campaigns` access 25 → 18; turn pointer 10 → 5; player applies effects 22 → 8 (one accept + one deny per operation kind; the arity 2–8 unrolled batch cases collapse to one accept at 2 and one deny at 9); character reads 24 → 10 (owner/admin/co-member/outsider/blocked read; owner create at revision 0; revision CAS accept+deny; DM detach accept+deny; delete with/without sheet); public projection 14 → 8 (exact sheet accept; every mismatch family in one case; anonymous read exact/inexact; revoke; delete); combat/state 25 → 8 (owner/admin/peer/outsider/blocked read; peer 7-field patch accept; peer create denied; owner create); encounterInit 13 → 6; subcollections 1; notes 9 → 6; bug_reports 7 → 5; library 5 → 4; encounters 5; diagnostics 3. Total 98 + storage 13 = 111. Every deleted case is named in the commit body with the representation it dies with (the `playStateVersion` marker, the unmarked-legacy escape hatch, `peerLegacyCoreCreate`, arity unrolling).

- [ ] **Step 6: Run everything**

Run: `pnpm typecheck && pnpm test && pnpm test:rules && pnpm lint --max-warnings 0`
Expected: PASS; `grep -c "^\s*it(" tests/rules/firestore-rules.test.ts` ≤ 107.

- [ ] **Step 7: Docs**

- `docs/CHARACTER_SCHEMA.md`: the Firestore envelope table gains `revision`; the `state` row reads "always `{}` in Firestore (the play session is `combat/state.playState`); the portable export still carries the compact session"; appendix per Task 6.
- `docs/ARCHITECTURE.md` "Combat-mutable state lives in a per-character subdoc": delete the legacy/held-snapshot paragraphs; the subdoc is the sole play owner; `writeTurnEconomy` gone.
- `docs/TEST_PORTFOLIO.md`: rules files/cases line; note the P1 deletions.
- Migration program §P1: mark each bullet with its commit; "Deletions" line reads "executed 2026-09-02 (see commits …)"; §P3 deletions gain "`playStateVersion` stored field (dead since P1)"; §P4 deletions gain "`isCampaignDmDetach`".
- Design spec §5.4 "What `firestore.rules` will contain": add "after P1: character paths are owner/admin/co-member + revision CAS + shape; the encounter/peer semantic predicates remain until P4".

- [ ] **Step 8: Commit**

```bash
cat > .changeset/legacy-parent-cutover-code.md <<'EOF'
---
---

Every character parent is v1: the unmarked-legacy readers, the `playStateVersion` marker and the legacy `combat/state` shapes are gone from the client; the character-path Firestore rules enforce owner/admin/co-member access, an empty parent state, the revision compare-and-set and the exact public sheet only (`playStateVersion*`, `peerLegacyCoreCreate` and the legacy escape hatch deleted); the rules suite shrinks to access matrices (≤ 120 cases).
EOF
git add -A
git commit -m "refactor(persistence): delete unmarked-legacy readers and simplify character-path rules"
```

**→ Integration B**: rebase on fresh `origin/main`, `just ci`, `pnpm test:rules`, `just ci-srd-only`, push `HEAD:main`, confirm the SHA.

---

### Task 9: Read-only migration reports, program status, handoff (orchestrator)

**Files:**

- Modify: `docs/PROGRAM_STATUS.md` ("Automation direction under re-architecture": P1 integrated SHAs, **Pending migrations** list with the exact commands, owner gate), `docs/superpowers/plans/2026-09-02-total-combat-automation-migration.md` (P1 exit-gate status)
- Create: `docs/superpowers/plans/2026-09-02-next-session-handoff.md` (rewritten for Phase 2; same format as the P1 handoff)

- [ ] **Step 1: Produce the fixture reports** (no Firebase):

```bash
node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts --fixtures "$(pwd)/content-pack/fixtures/team"
```

and a parent-cutover fixture plan (`--fixtures` treats each export as an unmarked parent with no child): expected `legacy: 6, childrenCreated: 6, issues: []`.

- [ ] **Step 2: Write the owner report** (chat, Italian): counts, hashes, issue codes; the two production commands the owner runs with the service-account credential:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/abs/sa.json node --import ./scripts/alias-loader.mjs scripts/migrate-custom-identity.ts
GOOGLE_APPLICATION_CREDENTIALS=/abs/sa.json node --import ./scripts/alias-loader.mjs scripts/migrate-character-parents.ts
```

then, on the owner's word, `--apply --backup /abs/fresh/dir` for each, `--check` for each, and only then the deploy. **Stop there; never apply.**

- [ ] **Step 3: PROGRAM_STATUS + handoff + worktree removal** per the session brief.

## Self-review

- **Spec coverage:** §P1.1 codec → Task 3; §P1.2 identity + script → Tasks 4, 5; §P1.3 reconciler, metadata, callbacks, precondition, replays → Task 7; §P1.4 cutover script + deletions + escape hatch → Tasks 6, 8; §P1.5 diagnostics → Tasks 1, 2; §P1.6 rules → Tasks 7, 8; exit gate (fixtures + export dry-run, replays, ≤ 120 rules cases, gates) → Tasks 5, 6, 7, 8, 9. Not in P1 by written reason: `memberDetails[uid].role` and the peer write paths (P4), the `isCampaignDmDetach` predicate (P4), nested authored-array validation (P2/P3), deletion of the dead `playStateVersion` field from documents (P3).
- **Type consistency:** `CodecFailure`/`ParsedEnvelope` (Task 3) are what `parseStoredCharacter` throws on (Task 3) and what diagnostics receives (Task 2); `instanceId: string` (Task 4a) is what the scripts stamp (Task 5) and the library keys (Task 4c); `revision` (Task 7) is what the cutover stamps (Task 6) and the rules check (Tasks 7, 8); `applyCombatToSession(session, combat, max)` (Task 8) is the final signature the script uses after Task 8.
- **Placeholder scan:** the two `/* … */` bodies in Task 5 (`stampLibrary`, `planCustomIdentity`, `verifyCustomIdentityCorpus`) are specified by the tests above them and by `stampEnvelope`; `isCampaignDmDetach` "unchanged body" is quoted verbatim in the audit report and the current `firestore.rules:215-232`.

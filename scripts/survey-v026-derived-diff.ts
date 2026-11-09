#!/usr/bin/env node
/**
 * READ-ONLY deploy check: every stored character's derived sheet under the deployed
 * release and under this tree, compared. The same probe (`scripts/lib/derived-probe.ts`)
 * runs twice: here, and inside a checkout of the deployed release (`--baseline-root`),
 * where it loads that release's own engine. A field that differs is «expected» when it
 * maps to a merged rules fix named in `EXPECTED`, «unexpected» otherwise: every
 * unexpected one is a bug to look at before the deploy.
 *
 * Output: counts only — characters compared, identical, differing, unreadable; diffs by
 * field pattern (catalogue ids folded to `*`) and by tag. Never a name, an id or a value.
 *
 * It never writes: Firestore is reached only through `readOnlyFirestore`, which exposes
 * one call, `collectionGroup(name).get()`; the corpus copy for the baseline lives in a
 * fresh private temp directory and is removed at the end.
 *
 * `--detail` adds, per field pattern, the catalogue ids involved and how many
 * characters each (user-made ids folded to `<homebrew>`), to trace a pattern to a fix.
 *
 * Run with (the baseline tree: `scripts/setup-v025-baseline.sh`):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-v026-derived-diff.ts \
 *     --baseline-root /absolute/path/to/v025-baseline
 */
/// <reference types="node" />
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { contentPackEnabled } from "./content-pack-mode.ts";
import { discoverDocuments, readTargetConfiguration } from "./lib/migration-kit.ts";
import { probeCorpus, type ProbeResult, type ProbeSource } from "./lib/derived-probe.ts";

const PARENT = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHILD = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;
export const DISCOVERY = [
  { collectionGroup: "characters", pattern: PARENT },
  { collectionGroup: "combat", pattern: CHILD },
];

// ── Expected diffs: each names the merged rules fix that explains it ─────────────

export interface ExpectedRule {
  /** The fix that explains the diff ("#905"). */
  readonly fix: string;
  /** The field paths it moves (full path, catalogue ids included). */
  readonly path: RegExp;
}

/** Rules fixes merged since the deployed release that move a derived number. A diff
 *  outside these is unexpected. Extend with the fix's PR when a new one lands. */
export const EXPECTED: readonly ExpectedRule[] = [
  // A lineage's once-a-day spell waits for the level its spell is learned at.
  {
    fix: "#905",
    path: /^resources\.[^.]*(elf|tiefling|lineage|legacy)[^.]*:[a-z-]+\.total$/,
  },
  // Magical Discoveries offers the right spells (the Lore Bard's prepared list).
  { fix: "#868", path: /^spells\.bard\./ },
];

// ── The pure comparison ───────────────────────────────────────────────────────

/** A value that changed, or a field only the current release has (added) or only the
 *  deployed one has (removed): a model change rather than a different number. */
export type DiffKind = "changed" | "added" | "removed";

export interface DerivedDiffSurvey {
  format: "d20-folio-v026-derived-diff-v1";
  characters: number;
  identical: number;
  differing: number;
  /** A character the baseline or the current engine could not read, by side+reason. */
  unreadable: Record<string, number>;
  /** Field pattern → { expected, unexpected } diff counts (characters). */
  byField: Record<
    string,
    Partial<Record<DiffKind, { expected: number; unexpected: number }>>
  >;
  /** Fix → characters with at least one diff it explains. */
  byFix: Record<string, number>;
  /** Characters with at least one unexpected CHANGED value. */
  withUnexpected: number;
  /** With `--detail` only: per `pattern [kind]`, the catalogue ids involved (a
   *  resource, an action, a class) and how many characters each. A user-made id
   *  (homebrew, an uuid) is folded to `<homebrew>`; no name, note or value. */
  detail?: Record<string, Record<string, number>>;
}

/** The catalogue id a path names (`resources.<id>.total`, `actions.<id>.…`,
 *  `spells.<classId>.…`), or null for a sheet-wide field. */
export function contentIdOf(path: string): string | null {
  const [head, id] = path.split(".");
  if (!id || !(head === "resources" || head === "actions" || head === "spells"))
    return null;
  return safeContentId(id);
}

/** A catalogue id as is; anything a player could have typed (homebrew, custom, an
 *  uuid, odd characters) folded to `<homebrew>`. */
export function safeContentId(id: string): string {
  if (/homebrew|custom|user|[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) return "<homebrew>";
  return /^[a-z0-9][a-z0-9:_-]{0,80}$/.test(id) ? id : "<homebrew>";
}

/** A path with its catalogue ids folded: `resources.drow-x:faerie-fire.total` →
 *  `resources.*.total`; ids never reach the report. */
export function fieldPattern(path: string): string {
  const [head, ...rest] = path.split(".");
  if (head === "ac" || head === "hpMax") return head;
  if (head === "resources" || head === "actions")
    return [head, "*", ...rest.slice(1)].join(".");
  if (head === "spells")
    return [
      head,
      "*",
      ...rest.slice(1).map((p) => (/^[a-z-]+[:-]/.test(p) && p.length > 12 ? "*" : p)),
    ].join(".");
  return [head, ...rest.map((p) => (/^\d+$/.test(p) ? "[]" : p))].join(".");
}

function changedPaths(
  a: Record<string, number | string>,
  b: Record<string, number | string>
): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((key) => a[key] !== b[key]).sort();
}

export function surveyDerivedDiff(
  baseline: readonly ProbeResult[],
  current: readonly ProbeResult[],
  expected: readonly ExpectedRule[] = EXPECTED,
  options: { detail?: boolean } = {}
): DerivedDiffSurvey {
  if (baseline.length !== current.length)
    throw new Error("the two probes read different corpora");
  const survey: DerivedDiffSurvey = {
    format: "d20-folio-v026-derived-diff-v1",
    characters: current.length,
    identical: 0,
    differing: 0,
    unreadable: {},
    byField: {},
    byFix: {},
    withUnexpected: 0,
    ...(options.detail ? { detail: {} } : {}),
  };
  const detailSeen = new Set<string>();
  baseline.forEach((before, index) => {
    const after = current[index];
    if (!after) return;
    if (!before.ok || !after.ok) {
      const key = !before.ok
        ? `baseline:${before.reason}`
        : `current:${after.ok ? "" : after.reason}`;
      survey.unreadable[key] = (survey.unreadable[key] ?? 0) + 1;
      return;
    }
    const paths = changedPaths(before.stats, after.stats);
    if (paths.length === 0) {
      survey.identical += 1;
      return;
    }
    survey.differing += 1;
    // Per field pattern and kind: unexpected if any of its paths is.
    const fields = new Map<string, "expected" | "unexpected">();
    const fixes = new Set<string>();
    for (const path of paths) {
      const rule = expected.find((r) => r.path.test(path));
      if (rule) fixes.add(rule.fix);
      const kind: DiffKind = !(path in before.stats)
        ? "added"
        : !(path in after.stats)
          ? "removed"
          : "changed";
      const key = `${fieldPattern(path)}|${kind}`;
      const id = survey.detail ? contentIdOf(path) : null;
      if (survey.detail && id) {
        const row = (survey.detail[`${fieldPattern(path)} [${kind}]`] ??= {});
        // Per character: one count per id however many of its paths moved.
        const seen = `${index}|${id}`;
        if (!detailSeen.has(`${key}|${seen}`)) {
          detailSeen.add(`${key}|${seen}`);
          row[id] = (row[id] ?? 0) + 1;
        }
      }
      if (fields.get(key) !== "unexpected")
        fields.set(key, rule ? "expected" : "unexpected");
    }
    let unexpectedChange = false;
    for (const [key, tag] of fields) {
      const cut = key.lastIndexOf("|");
      const pattern = key.slice(0, cut);
      const kind = key.slice(cut + 1) as DiffKind;
      const row = ((survey.byField[pattern] ??= {})[kind] ??= {
        expected: 0,
        unexpected: 0,
      });
      row[tag] += 1;
      if (tag === "unexpected" && kind === "changed") unexpectedChange = true;
    }
    for (const fix of fixes) survey.byFix[fix] = (survey.byFix[fix] ?? 0) + 1;
    // Only a CHANGED number is a regression to chase; a field only one release has is
    // a model change, shown in `byField` but not counted here.
    if (unexpectedChange) survey.withUnexpected += 1;
  });
  return survey;
}

// ── Both sides composed the same way ───────────────────────────────────────────

/** Whether the private pack takes part on each side (`content-pack/index.ts` linked
 *  and not switched off). */
export interface Composition {
  current: boolean;
  baseline: boolean;
}

/** Refuse a lopsided run: an engine without the pack reads every pack feature as
 *  missing, so the diff would be all false removals (2026-11-09: a checkout with no
 *  `content-pack` link reported pack trackers and actions as «removed»). */
export function assertSameComposition(composition: Composition): void {
  if (composition.current !== composition.baseline) {
    throw new Error(
      `composed: current ${String(composition.current)}, baseline ${String(composition.baseline)}. ` +
        "Link content-pack on both sides (the pack's origin/main here, the release's pack there) or on neither."
    );
  }
}

// ── Read-only Firestore ───────────────────────────────────────────────────────

/** The one read the survey needs, and nothing else: any other property (a doc ref, a
 *  batch, a transaction, `set`, `update`…) throws. */
export function readOnlyFirestore(db: {
  collectionGroup: (name: string) => { get: () => Promise<unknown> };
}): unknown {
  const facade = {
    collectionGroup: (name: string) => {
      const query = db.collectionGroup(name);
      return new Proxy(
        { get: () => query.get() },
        {
          get(target, key) {
            if (key === "get") return target.get;
            throw new Error(`read-only survey: ${String(key)} is not allowed`);
          },
        }
      );
    },
  };
  return new Proxy(facade, {
    get(target, key) {
      if (key === "collectionGroup") return target.collectionGroup;
      throw new Error(`read-only survey: ${String(key)} is not allowed`);
    },
  });
}

// ── The run ───────────────────────────────────────────────────────────────────

const run$ = promisify(execFile);

/** The baseline probe: this probe copied into the release tree, run with its loader. */
async function probeBaseline(
  root: string,
  corpusFile: string,
  outFile: string
): Promise<ProbeResult[]> {
  const probe = join(root, "scripts/lib/derived-probe.ts");
  const hooks = join(root, "scripts/lib/vite-env-hooks.mjs");
  await copyFile(new URL("./lib/derived-probe.ts", import.meta.url), probe);
  await copyFile(new URL("./lib/vite-env-hooks.mjs", import.meta.url), hooks);
  try {
    await run$(
      process.execPath,
      ["--import", join(root, "scripts/alias-loader.mjs"), probe, corpusFile, outFile],
      {
        cwd: root,
        maxBuffer: 64 * 1024 * 1024,
      }
    );
    return JSON.parse(await readFile(outFile, "utf8")) as ProbeResult[];
  } finally {
    await rm(probe, { force: true });
    await rm(hooks, { force: true });
  }
}

async function run(): Promise<void> {
  const rootIndex = processArgv.indexOf("--baseline-root");
  const root = rootIndex > 0 ? processArgv[rootIndex + 1] : undefined;
  if (!root)
    throw new Error("--baseline-root /absolute/path/to/the/deployed/release is required");
  const target = await readTargetConfiguration();
  const [{ initializeApp, applicationDefault, deleteApp }, { getFirestore }] =
    await Promise.all([import("firebase-admin/app"), import("firebase-admin/firestore")]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  const composition: Composition = {
    current: contentPackEnabled(),
    baseline: existsSync(join(resolve(root), "content-pack", "index.ts")),
  };
  assertSameComposition(composition);
  console.log(`composed: ${String(composition.current)} (both sides)`);
  const dir = await mkdtemp(join(tmpdir(), "folio-derived-diff-"));
  try {
    const db = readOnlyFirestore(getFirestore(app)) as Parameters<
      typeof discoverDocuments
    >[0];
    const sources: ProbeSource[] = (await discoverDocuments(db, DISCOVERY)).map(
      (d) => d.source
    );
    const corpus = join(dir, "corpus.json");
    await writeFile(corpus, JSON.stringify(sources), { mode: 0o600 });
    const baseline = await probeBaseline(
      resolve(root),
      corpus,
      join(dir, "baseline.json")
    );
    const current = await probeCorpus(sources);
    const detail = processArgv.includes("--detail");
    console.log(
      JSON.stringify(surveyDerivedDiff(baseline, current, EXPECTED, { detail }), null, 2)
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
    await deleteApp(app);
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

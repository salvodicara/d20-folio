#!/usr/bin/env node
/**
 * READ-ONLY preflight for the v0.26.0 deploy: does every stored document still load?
 * Each document runs through the app's own v0.26 read path, the exact functions the
 * app calls:
 *   - characters: `hydrateStoredCharacter` (`@/lib/character-read`), with the
 *     `combat/state` child;
 *   - campaigns, with their encounter, table rules and clock: `toCampaignDoc`
 *     (`campaign-codec`);
 *   - kept fights: `parseEncounterState`;
 *   - roster and DM roster entries: `parseRosterEntry` and `parseDmRosterEntry`;
 *   - session logs: `isLogItem`.
 * `VITE_COMBAT_EFFECTS_V26` gates writers only; none of these readers looks at it
 * (a test pins that). The existing guards run too:
 *   - the role claims (`planRoleClaims`);
 *   - the item-resource migration (`planItemResourceMigration`, behind the catalogue
 *     fingerprint).
 *
 * Per document kind it reports:
 *   - `ok`: read as stored;
 *   - `defaulted`: read, but the reader filled, dropped or fixed a field;
 *   - `rejected`: by reason code;
 *   - `rewrites`: the field paths a v0.26 writer would change on the next save, with
 *     how many documents each touches.
 * Counts only: never an id, a name or any content. A map keyed by an id (members,
 * roster links) shows `*` for the key.
 *
 * It never writes: it imports no writer, and a test asserts that. Reads are capped
 * (`READ_CAP` per collection group, `ACCOUNT_CAP` accounts); a capped group is listed
 * under `truncated`.
 *
 * Run with (the operator provides GOOGLE_APPLICATION_CREDENTIALS):
 *   node --import ./scripts/alias-loader.mjs scripts/survey-v026-compat.ts
 * `--detail` adds, per rewritten character field, the rewrite's shape («number →
 * different number», «absent → number»…) and how many documents: shapes, no values.
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  isRecord,
  readTargetConfiguration,
  stableJson,
  type MigrationSourceDocument,
  type RawMap,
} from "./lib/migration-kit.ts";
import { planRoleClaims, type AccountClaims } from "./backfill-role-claims.ts";
import {
  loadMigrationCatalogue,
  planItemResourceMigration,
  type MigrationCatalogueItem,
} from "./migrate-item-resources.ts";

export const READ_CAP = 200;
export const ACCOUNT_CAP = 200;

const USER = /^users\/([^/]+)$/;
const CHARACTER = /^users\/([^/]+)\/characters\/([^/]+)$/;
const CHARACTER_COMBAT = /^users\/([^/]+)\/characters\/([^/]+)\/combat\/state$/;
const SNAPSHOT = /^users\/([^/]+)\/characters\/([^/]+)\/snapshots\/([^/]+)$/;
const CAMPAIGN = /^campaigns\/([^/]+)$/;
const KEPT_FIGHT = /^campaigns\/([^/]+)\/combat\/ended$/;
const ROSTER = /^campaigns\/([^/]+)\/roster\/([^/]+)$/;
const DM_ROSTER = /^campaigns\/([^/]+)\/dmRoster\/([^/]+)$/;
const SESSION_LOG = /^campaigns\/([^/]+)\/sessionLogs\/([^/]+)$/;
const SESSION_LOG_ITEM = /^campaigns\/([^/]+)\/sessionLogs\/([^/]+)\/items\/([^/]+)$/;

/** Each collection group the survey reads, and the path shapes it keeps. */
export const DISCOVERY = [
  { collectionGroup: "users", patterns: [USER] },
  { collectionGroup: "characters", patterns: [CHARACTER] },
  { collectionGroup: "combat", patterns: [CHARACTER_COMBAT, KEPT_FIGHT] },
  { collectionGroup: "snapshots", patterns: [SNAPSHOT] },
  { collectionGroup: "campaigns", patterns: [CAMPAIGN] },
  { collectionGroup: "roster", patterns: [ROSTER] },
  { collectionGroup: "dmRoster", patterns: [DM_ROSTER] },
  { collectionGroup: "sessionLogs", patterns: [SESSION_LOG] },
  { collectionGroup: "items", patterns: [SESSION_LOG_ITEM] },
] as const;

// ── The engine seam (structural, so the scripts project never type-imports the app) ──

interface Engine {
  hydrateStoredCharacter: (
    id: string,
    parent: RawMap,
    combat: unknown
  ) => Promise<{
    character: unknown;
    session: unknown;
  }>;
  serializeCharacterEnvelope: (doc: unknown) => { build: RawMap };
  sessionToPlayStateV1: (session: unknown) => unknown;
  toCampaignDoc: (id: string, data: RawMap) => RawMap;
  parseEncounterState: (value: unknown) => RawMap;
  parseRosterEntry: (raw: unknown) => RawMap | null;
  parseDmRosterEntry: (raw: unknown) => RawMap;
  isLogItem: (value: unknown) => boolean;
  parseCombatState: (data: unknown) => { ok: true } | { ok: false; where: string };
  canonicalCombatField: (key: string, value: unknown) => unknown;
}

async function engineFunction(file: string, name: string): Promise<unknown> {
  const module: unknown = await import(new URL(`../src/${file}`, import.meta.url).href);
  if (!isRecord(module) || typeof module[name] !== "function") {
    throw new TypeError(`${file} does not export ${name}`);
  }
  return module[name];
}

const engine = {
  hydrateStoredCharacter: await engineFunction(
    "lib/character-read.ts",
    "hydrateStoredCharacter"
  ),
  serializeCharacterEnvelope: await engineFunction(
    "lib/character-codec.ts",
    "serializeCharacterEnvelope"
  ),
  sessionToPlayStateV1: await engineFunction(
    "lib/session-state-codec.ts",
    "sessionToPlayStateV1"
  ),
  toCampaignDoc: await engineFunction(
    "features/campaigns/campaign-codec.ts",
    "toCampaignDoc"
  ),
  parseEncounterState: await engineFunction(
    "lib/play/encounter.ts",
    "parseEncounterState"
  ),
  parseRosterEntry: await engineFunction(
    "lib/play/campaign-roster.ts",
    "parseRosterEntry"
  ),
  parseDmRosterEntry: await engineFunction(
    "lib/play/campaign-roster.ts",
    "parseDmRosterEntry"
  ),
  isLogItem: await engineFunction("lib/session-log-io.ts", "isLogItem"),
  parseCombatState: await engineFunction("lib/combat-state-codec.ts", "parseCombatState"),
  canonicalCombatField: await engineFunction(
    "lib/combat-state-codec.ts",
    "canonicalCombatField"
  ),
} as Engine;

// ── The pure survey ──────────────────────────────────────────────────────────

export type DocKind =
  | "user"
  | "character"
  | "campaign"
  | "keptFight"
  | "roster"
  | "dmRoster"
  | "sessionLog"
  | "sessionLogItem";

export interface KindReport {
  read: number;
  ok: number;
  defaulted: number;
  rejected: Record<string, number>;
  /** Per reason, which check refused it (`<step>:<field>`), and how often. */
  rejectedWhere: Record<string, Record<string, number>>;
  /** For a field refused as not canonical: the key paths where it differs. */
  rejectedPaths: Record<string, number>;
  /** Field path → how many documents the reader changes it on (filled, dropped, fixed). */
  changedOnRead: Record<string, number>;
  /** Field path → how many documents a v0.26 writer would rewrite it on (next save). */
  rewrites: Record<string, number>;
  /** With `--detail` only: per rewritten path, the rewrite's shape (`rewriteShape`) and
   *  how many documents. Shapes only: never a value or an id. */
  rewriteShapes?: Record<string, Record<string, number>>;
}

export interface V026CompatSurvey {
  format: "d20-folio-v026-compat-survey-v1";
  /** The catalogue the readers ran with: `composed` (the content pack linked) or
   *  `srd-only`. Prod data must be read `composed`. */
  catalogue: string;
  kinds: Record<DocKind, KindReport>;
  /** v0.25 shapes still in the data, read fine by v0.26 (for the release notes). */
  legacy: {
    encountersWithoutRosterLinks: number;
    charactersWithPotionAftereffectKeys: number;
  };
  claims: {
    accounts: number;
    userDocs: number;
    toChange: number;
    docsWithoutAccount: number;
  };
  itemResources: {
    catalogue: string;
    documentsToChange: number;
    issues: Record<string, number>;
  };
  /** Collection groups that hit the read cap: the survey saw only part of them. */
  truncated: string[];
}

export interface V026Corpus {
  documents: readonly MigrationSourceDocument[];
  accounts: readonly AccountClaims[];
  catalogue: {
    items: readonly MigrationCatalogueItem[];
    fingerprint: string;
    mode?: string;
  };
  truncated?: readonly string[];
}

/** Id-keyed maps: their keys are replaced by `*` in a reported path. */
const ID_KEYED = new Set(["memberDetails", "rosterLinks", "members"]);
const MAX_DEPTH = 3;

/** A stored value made comparable: timestamps and dates as ISO strings. */
function plain(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (isRecord(value) && typeof value.toDate === "function") {
    return (value.toDate as () => Date)().toISOString();
  }
  if (Array.isArray(value)) return value.map(plain);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, plain(v)])
    );
  }
  return value;
}

/** The dotted paths where `before` and `after` differ, at most `MAX_DEPTH` deep. */
export function changedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  const a = plain(before);
  const b = plain(after);
  if (stableJson(a) === stableJson(b)) return [];
  const depth = prefix === "" ? 0 : prefix.split(".").length;
  if (!isRecord(a) || !isRecord(b) || depth >= MAX_DEPTH) return [prefix || "(root)"];
  const parent = prefix.split(".").at(-1) ?? "";
  const out: string[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const segment = ID_KEYED.has(parent) ? "*" : key;
    const path = prefix ? `${prefix}.${segment}` : segment;
    for (const p of changedPaths(a[key], b[key], path)) {
      if (!out.includes(p)) out.push(p);
    }
  }
  return out;
}

function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * The shape of one rewrite, from the stored value to the written one, with no value in
 * it: «absent → number», «number → same number», «number → different number», «string →
 * same number» (a "30" stored as text)… What a deploy reader needs to tell a harmless
 * normalisation from a value a player would see change.
 */
export function rewriteShape(before: unknown, after: unknown): string {
  if (before === undefined) return `absent → ${kindOf(after)}`;
  if (after === undefined) return `${kindOf(before)} → absent`;
  const from = kindOf(before);
  const to = kindOf(after);
  if (from === "number" && to === "number")
    return before === after ? "number → same number" : "number → different number";
  if (from === "string" && to === "number" && Number(before) === after)
    return "string → same number";
  if (from === to) return `${from} → different ${to}`;
  return `${from} → ${to}`;
}

/** The value at a dotted path under `root` (`build.speed` under the build), or
 *  undefined; a `*` segment (an id-keyed map) is not followed. */
function valueAt(root: unknown, path: string, prefix: string): unknown {
  const rest = path.startsWith(`${prefix}.`) ? path.slice(prefix.length + 1) : null;
  if (rest === null) return undefined;
  let value: unknown = plain(root);
  for (const key of rest.split(".")) {
    if (key === "*" || !isRecord(value)) return undefined;
    value = value[key];
  }
  return value;
}

/** The reason code a reader's thrown quarantine carries. */
function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = /:\s*([a-z][a-z0-9-]*)/i.exec(message)?.[1];
  return code ?? "unreadable";
}

const POTION_AFTEREFFECT = /^potion:.+:aftereffect$/;

function emptyReport(): KindReport {
  return {
    read: 0,
    ok: 0,
    defaulted: 0,
    rejected: {},
    rejectedWhere: {},
    rejectedPaths: {},
    changedOnRead: {},
    rewrites: {},
  };
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** Why a character's combat child is refused: the check, and for a field that is not
 *  in its canonical form, the key paths where it differs (keys only). */
function combatFault(combat: unknown): [string, string[]] {
  if (combat === null) return ["parent-or-missing-combat-state", []];
  const parsed = engine.parseCombatState(combat);
  if (parsed.ok) return ["parent", []];
  const field = /^canonical:(\w+)$/.exec(parsed.where)?.[1];
  if (!field || !isRecord(combat)) return [parsed.where, []];
  const stored = combat[field];
  return [
    parsed.where,
    changedPaths(stored, engine.canonicalCombatField(field, stored), field),
  ];
}

/** Survey the corpus. Pure: no credentials, no Firebase. */
export async function surveyV026Compat(
  corpus: V026Corpus,
  options: { detail?: boolean } = {}
): Promise<V026CompatSurvey> {
  const kinds = {
    user: emptyReport(),
    character: emptyReport(),
    campaign: emptyReport(),
    keptFight: emptyReport(),
    roster: emptyReport(),
    dmRoster: emptyReport(),
    sessionLog: emptyReport(),
    sessionLogItem: emptyReport(),
  } satisfies Record<DocKind, KindReport>;
  const legacy = {
    encountersWithoutRosterLinks: 0,
    charactersWithPotionAftereffectKeys: 0,
  };
  const read = (kind: KindReport, changed: string[], rewrites: string[] = changed) => {
    kind.read += 1;
    if (changed.length === 0) kind.ok += 1;
    else kind.defaulted += 1;
    for (const path of changed) bump(kind.changedOnRead, path);
    for (const path of rewrites) bump(kind.rewrites, path);
  };
  const reject = (
    kind: KindReport,
    reason: string,
    where?: string,
    paths: string[] = []
  ) => {
    kind.read += 1;
    bump(kind.rejected, reason);
    if (where) bump((kind.rejectedWhere[reason] ??= {}), where);
    for (const path of paths) bump(kind.rejectedPaths, path);
  };

  const byPath = new Map(corpus.documents.map((d) => [d.path, d.data] as const));
  const sorted = [...corpus.documents].sort((a, b) => a.path.localeCompare(b.path));
  for (const { path, data } of sorted) {
    if (USER.test(path)) {
      read(kinds.user, []);
    } else if (CHARACTER.test(path)) {
      const combat = byPath.get(`${path}/combat/state`) ?? null;
      const playState =
        isRecord(combat) && isRecord(combat.playState) ? combat.playState : null;
      const features = isRecord(playState?.state)
        ? playState.state.activeFeatures
        : undefined;
      if (
        Array.isArray(features) &&
        features.some((f) => POTION_AFTEREFFECT.test(String(f)))
      ) {
        legacy.charactersWithPotionAftereffectKeys += 1;
      }
      try {
        const doc = await engine.hydrateStoredCharacter("x", data, combat);
        const build = engine.serializeCharacterEnvelope(doc).build;
        const writtenPlay = engine.sessionToPlayStateV1(doc.session);
        const rewrites = [
          ...changedPaths(data.build, build, "build"),
          ...changedPaths(playState, writtenPlay, "playState"),
        ];
        read(kinds.character, [], rewrites);
        if (options.detail) {
          const shapes = (kinds.character.rewriteShapes ??= {});
          for (const path of rewrites) {
            const [root, written, prefix] = path.startsWith("build")
              ? [data.build, build, "build"]
              : [playState, writtenPlay, "playState"];
            bump(
              (shapes[path] ??= {}),
              rewriteShape(valueAt(root, path, prefix), valueAt(written, path, prefix))
            );
          }
        }
      } catch (error) {
        const [where, paths] = combatFault(combat);
        reject(kinds.character, reasonOf(error), where, paths);
      }
    } else if (CAMPAIGN.test(path)) {
      try {
        const { id: _id, ...campaign } = engine.toCampaignDoc("x", data);
        void _id;
        if (isRecord(data.encounter) && data.encounter.rosterLinks === undefined) {
          legacy.encountersWithoutRosterLinks += 1;
        }
        read(kinds.campaign, changedPaths(data, campaign));
      } catch (error) {
        reject(kinds.campaign, reasonOf(error));
      }
    } else if (KEPT_FIGHT.test(path)) {
      try {
        const fight = engine.parseEncounterState(data.fight);
        if (fight.ended) read(kinds.keptFight, changedPaths(data.fight, fight, "fight"));
        else reject(kinds.keptFight, "not-ended");
      } catch (error) {
        reject(kinds.keptFight, reasonOf(error));
      }
    } else if (ROSTER.test(path)) {
      const entry = engine.parseRosterEntry(data);
      if (entry) read(kinds.roster, changedPaths(data, entry));
      else reject(kinds.roster, "invalid-roster-entry");
    } else if (DM_ROSTER.test(path)) {
      read(kinds.dmRoster, changedPaths(data, engine.parseDmRosterEntry(data)));
    } else if (SESSION_LOG.test(path)) {
      const log = Array.isArray(data.log) ? data.log : [];
      const dropped = log.filter((item) => !engine.isLogItem(item)).length;
      read(kinds.sessionLog, dropped > 0 ? ["log"] : [], []);
      for (const item of log) {
        if (engine.isLogItem(item)) read(kinds.sessionLogItem, [], []);
        else reject(kinds.sessionLogItem, "invalid-log-item");
      }
    } else if (SESSION_LOG_ITEM.test(path)) {
      const { serverAt: _serverAt, ...item } = data;
      void _serverAt;
      if (engine.isLogItem(item)) read(kinds.sessionLogItem, [], []);
      else reject(kinds.sessionLogItem, "invalid-log-item");
    }
  }

  const userDocs = corpus.documents.flatMap((d) => {
    const uid = USER.exec(d.path)?.[1];
    return uid ? [{ uid, data: d.data }] : [];
  });
  const claims = planRoleClaims(userDocs, corpus.accounts);

  const characterFamily = corpus.documents.filter(
    (d) => CHARACTER.test(d.path) || SNAPSHOT.test(d.path)
  );
  const items = planItemResourceMigration(characterFamily, corpus.catalogue.items);
  const issues: Record<string, number> = {};
  for (const issue of items.issues) bump(issues, issue.code);

  return {
    format: "d20-folio-v026-compat-survey-v1",
    catalogue: corpus.catalogue.mode ?? "unknown",
    kinds,
    legacy,
    claims: {
      accounts: claims.counts.accounts,
      userDocs: claims.counts.userDocs,
      toChange: claims.counts.toChange,
      docsWithoutAccount: claims.notices.length,
    },
    itemResources: {
      catalogue: corpus.catalogue.fingerprint,
      documentsToChange: items.changedDocuments.length,
      issues,
    },
    truncated: [...(corpus.truncated ?? [])].sort(),
  };
}

// ── The capped, read-only reader ────────────────────────────────────────────

async function run(): Promise<void> {
  // Prod characters carry pack content: read without it, they would fail for the
  // wrong reason. Refuse unless asked for explicitly.
  const catalogue = await loadMigrationCatalogue();
  console.log(`Catalogue: ${catalogue.mode} ${catalogue.fingerprint}`);
  if (catalogue.mode !== "composed" && !processArgv.includes("--allow-srd-only")) {
    throw new Error(
      "The content pack is not linked (srd-only). Link it, or pass --allow-srd-only."
    );
  }
  const target = await readTargetConfiguration();
  const [
    { initializeApp, applicationDefault, deleteApp },
    { getFirestore },
    { getAuth },
  ] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/firestore"),
    import("firebase-admin/auth"),
  ]);
  const app = initializeApp({
    projectId: target.projectId,
    ...(target.emulator ? {} : { credential: applicationDefault() }),
  });
  console.log(
    `Target: ${target.projectId} (${target.emulator ? "explicit emulator" : "production read"})`
  );
  try {
    const db = getFirestore(app);
    const documents: MigrationSourceDocument[] = [];
    const truncated: string[] = [];
    for (const group of DISCOVERY) {
      const snapshot = await db
        .collectionGroup(group.collectionGroup)
        .limit(READ_CAP + 1)
        .get();
      if (snapshot.size > READ_CAP) truncated.push(group.collectionGroup);
      for (const doc of snapshot.docs.slice(0, READ_CAP)) {
        if (group.patterns.some((pattern) => pattern.test(doc.ref.path))) {
          documents.push({ path: doc.ref.path, data: doc.data() });
        }
      }
    }
    const page = await getAuth(app).listUsers(ACCOUNT_CAP);
    if (page.pageToken) truncated.push("accounts");
    const accounts = page.users.map((user) => ({
      uid: user.uid,
      customClaims: user.customClaims ?? {},
    }));
    const survey = await surveyV026Compat(
      { documents, accounts, catalogue, truncated },
      { detail: processArgv.includes("--detail") }
    );
    console.log(JSON.stringify(survey, null, 2));
  } finally {
    await deleteApp(app);
  }
}

if (processArgv[1] && import.meta.url === pathToFileURL(resolve(processArgv[1])).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

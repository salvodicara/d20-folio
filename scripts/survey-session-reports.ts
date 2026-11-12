#!/usr/bin/env node
/**
 * READ-ONLY survey: what the automatic session report is built from, for the session
 * report diagnosis (2026-11-12). It reads every campaign's play sessions (the head's
 * `log` array and the per-event `items`) and counts, per session and in total:
 *   - the lines by kind (an event's kind, or the correction's type);
 *   - fights: `encounter-start` markers, how many reach an `encounter-end`, rounds;
 *   - where event lines land: inside a marked fight, or outside any fight (by position,
 *     as the report places them, unless the line carries its own fight stamp);
 *   - lines the report cannot complete on its own: damage with no attacker (still
 *     waiting for "Who struck?"), an action on targets with no outcome;
 *   - who wrote: the number of distinct writers and the fewest and most lines one of
 *     them wrote (a player whose device recorded nothing shows as a low count);
 *   - corrections, retractions, hides and moves;
 *   - (v2) whom the damage lines hit (a character, a monster) and whether the hurt
 *     player recorded it, how many declared hits on monsters could claim a damage line,
 *     how many lines carry their own fight stamp, and the time gaps between combat
 *     lines (bucketed): enough to tell a fight nobody started from one whose markers
 *     the DM's closed page never wrote.
 * It never writes.
 *
 * Output: counts only. Never a name, an id, a path or any text: sessions are listed
 * anonymously, sorted by their counts.
 *
 * Run with:
 *   node --import ./scripts/alias-loader.mjs scripts/survey-session-reports.ts
 */

/// <reference types="node" />

import { resolve } from "node:path";
import process, { argv as processArgv } from "node:process";
import { pathToFileURL } from "node:url";
import {
  discoverDocuments,
  isRecord,
  readTargetConfiguration,
  type MigrationSourceDocument,
} from "./lib/migration-kit.ts";

const HEAD = /^campaigns\/([^/]+)\/sessionLogs\/([^/]+)$/;
const ITEM = /^campaigns\/([^/]+)\/sessionLogs\/([^/]+)\/items\/([^/]+)$/;

export interface SessionReportRow {
  lines: number;
  events: number;
  fights: number;
  fightsClosed: number;
  rounds: number;
  eventsInFight: number;
  eventsOutsideFight: number;
  damageWithoutAttacker: number;
  actionsWithoutOutcome: number;
  writers: number;
  fewestLinesByAWriter: number;
  mostLinesByAWriter: number;
  /** Lines stamped with the fight their device saw, and how many distinct fights. */
  stampedLines: number;
  stampedFights: number;
  damageToCharacter: number;
  damageToMonster: number;
  damageWithoutTarget: number;
  /** Damage to a character recorded by that character's own player. */
  damageRecordedByTheHurt: number;
  /** Declared hits (hit, critical, failed, saved) naming a monster: what could claim
   *  a nameless damage line on that monster. */
  landedOnMonsters: number;
  /** Gaps between consecutive combat lines (action, damage, heal, condition,
   *  concentration, death save), by the recording device's clock. */
  combatGaps: Record<GapBucket, number>;
}

type GapBucket = "<1m" | "1-5m" | "5-15m" | "15-60m" | ">60m";
const GAP_BUCKETS: GapBucket[] = ["<1m", "1-5m", "5-15m", "15-60m", ">60m"];
const COMBAT_KINDS = new Set([
  "action",
  "damage",
  "heal",
  "condition",
  "concentration",
  "death-save",
]);
const LANDED = new Set(["hit", "critical", "failed", "saved"]);

function gapBucket(ms: number): GapBucket {
  const minutes = ms / 60_000;
  if (minutes < 1) return "<1m";
  if (minutes < 5) return "1-5m";
  if (minutes < 15) return "5-15m";
  if (minutes < 60) return "15-60m";
  return ">60m";
}

const emptyGaps = (): Record<GapBucket, number> =>
  Object.fromEntries(GAP_BUCKETS.map((b) => [b, 0])) as Record<GapBucket, number>;

export interface SessionReportsSurvey {
  format: "d20-folio-session-reports-survey-v2";
  sessions: number;
  lines: number;
  byKind: Record<string, number>;
  fights: number;
  fightsNeverClosed: number;
  eventsOutsideFight: number;
  damageWithoutAttacker: number;
  actionsWithoutOutcome: number;
  sessionsWithoutMarkers: number;
  /** Sessions with no marker whose lines still carry a fight stamp: a fight was
   *  running, but no device wrote its markers. */
  unmarkedSessionsWithStamps: number;
  stampedLines: number;
  damageToCharacter: number;
  damageToMonster: number;
  damageWithoutTarget: number;
  damageRecordedByTheHurt: number;
  landedOnMonsters: number;
  combatGaps: Record<string, number>;
  unreadable: number;
  perSession: SessionReportRow[];
}

const MARKERS = new Set(["encounter-start", "encounter-end", "round-start"]);

interface Line {
  type: string;
  by: string;
  at: number | null;
  event: Record<string, unknown> | null;
  seenFight: string | null;
}

function readLine(value: unknown): Line | null {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.by !== "string")
    return null;
  const event = isRecord(value.event) ? value.event : null;
  const seen = isRecord(value.seen) ? value.seen : null;
  return {
    type: value.type,
    by: value.by,
    at: typeof value.at === "number" ? value.at : null,
    event,
    seenFight: typeof seen?.encounterId === "string" ? seen.encounterId : null,
  };
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/** One session's lines, in the report's order (the head's array, then the items). */
function surveySession(lines: Line[], byKind: Record<string, number>): SessionReportRow {
  const row: SessionReportRow = {
    lines: lines.length,
    events: 0,
    fights: 0,
    fightsClosed: 0,
    rounds: 0,
    eventsInFight: 0,
    eventsOutsideFight: 0,
    damageWithoutAttacker: 0,
    actionsWithoutOutcome: 0,
    writers: 0,
    fewestLinesByAWriter: 0,
    mostLinesByAWriter: 0,
    stampedLines: 0,
    stampedFights: 0,
    damageToCharacter: 0,
    damageToMonster: 0,
    damageWithoutTarget: 0,
    damageRecordedByTheHurt: 0,
    landedOnMonsters: 0,
    combatGaps: emptyGaps(),
  };
  const stamped = new Set<string>();
  let lastCombatAt: number | null = null;
  const perWriter = new Map<string, number>();
  let inFight = false;
  for (const line of lines) {
    perWriter.set(line.by, (perWriter.get(line.by) ?? 0) + 1);
    const eventKind = line.event?.kind;
    const kind =
      line.type !== "event"
        ? line.type
        : typeof eventKind === "string"
          ? eventKind
          : "unknown";
    bump(byKind, kind);
    if (line.type !== "event" || !line.event) continue;
    if (kind === "encounter-start") {
      row.fights += 1;
      inFight = true;
      continue;
    }
    if (kind === "encounter-end") {
      if (inFight) row.fightsClosed += 1;
      inFight = false;
      continue;
    }
    if (kind === "round-start") {
      row.rounds += 1;
      continue;
    }
    if (MARKERS.has(kind)) continue;
    row.events += 1;
    if (line.seenFight !== null) {
      row.stampedLines += 1;
      stamped.add(line.seenFight);
    }
    if (COMBAT_KINDS.has(kind) && line.at !== null) {
      if (lastCombatAt !== null)
        row.combatGaps[gapBucket(Math.abs(line.at - lastCombatAt))] += 1;
      lastCombatAt = line.at;
    }
    if (inFight || line.seenFight !== null) row.eventsInFight += 1;
    else row.eventsOutsideFight += 1;
    const e = line.event;
    if (kind === "damage" && e.actor === undefined && e.unattributed !== true)
      row.damageWithoutAttacker += 1;
    if (kind === "damage") {
      const target = typeof e.target === "string" ? e.target : null;
      if (target === null) row.damageWithoutTarget += 1;
      else if (target.startsWith("pc-")) {
        row.damageToCharacter += 1;
        if (target === `pc-${line.by}`) row.damageRecordedByTheHurt += 1;
      } else row.damageToMonster += 1;
    }
    if (
      kind === "action" &&
      typeof e.outcome === "string" &&
      LANDED.has(e.outcome) &&
      Array.isArray(e.targets) &&
      e.targets.some((t) => typeof t === "string" && !t.startsWith("pc-"))
    )
      row.landedOnMonsters += 1;
    if (
      kind === "action" &&
      Array.isArray(e.targets) &&
      e.targets.length > 0 &&
      e.outcome === undefined
    )
      row.actionsWithoutOutcome += 1;
  }
  row.stampedFights = stamped.size;
  const counts = [...perWriter.values()];
  row.writers = counts.length;
  row.fewestLinesByAWriter = counts.length ? Math.min(...counts) : 0;
  row.mostLinesByAWriter = counts.length ? Math.max(...counts) : 0;
  return row;
}

export function surveySessionReports(
  documents: readonly MigrationSourceDocument[]
): SessionReportsSurvey {
  const survey: SessionReportsSurvey = {
    format: "d20-folio-session-reports-survey-v2",
    sessions: 0,
    lines: 0,
    byKind: {},
    fights: 0,
    fightsNeverClosed: 0,
    eventsOutsideFight: 0,
    damageWithoutAttacker: 0,
    actionsWithoutOutcome: 0,
    sessionsWithoutMarkers: 0,
    unmarkedSessionsWithStamps: 0,
    stampedLines: 0,
    damageToCharacter: 0,
    damageToMonster: 0,
    damageWithoutTarget: 0,
    damageRecordedByTheHurt: 0,
    landedOnMonsters: 0,
    combatGaps: emptyGaps(),
    unreadable: 0,
    perSession: [],
  };
  const sessions = new Map<
    string,
    { head: unknown[]; items: { at: number; line: unknown }[] }
  >();
  for (const doc of documents) {
    const head = HEAD.exec(doc.path);
    const item = ITEM.exec(doc.path);
    const key = head ? `${head[1]}/${head[2]}` : item ? `${item[1]}/${item[2]}` : null;
    if (!key) continue;
    const session = sessions.get(key) ?? { head: [], items: [] };
    sessions.set(key, session);
    if (head) session.head = Array.isArray(doc.data.log) ? doc.data.log : [];
    else {
      const serverAt = doc.data.serverAt;
      const at =
        isRecord(serverAt) && typeof serverAt.toMillis === "function"
          ? (serverAt.toMillis as () => number)()
          : Number.MAX_SAFE_INTEGER;
      session.items.push({ at, line: doc.data });
    }
  }
  for (const session of sessions.values()) {
    const raw = [
      ...session.head,
      ...session.items.sort((a, b) => a.at - b.at).map((entry) => entry.line),
    ];
    const lines: Line[] = [];
    for (const value of raw) {
      const line = readLine(value);
      if (line) lines.push(line);
      else survey.unreadable += 1;
    }
    const row = surveySession(lines, survey.byKind);
    survey.sessions += 1;
    survey.lines += row.lines;
    survey.fights += row.fights;
    survey.fightsNeverClosed += row.fights - row.fightsClosed;
    survey.eventsOutsideFight += row.eventsOutsideFight;
    survey.damageWithoutAttacker += row.damageWithoutAttacker;
    survey.actionsWithoutOutcome += row.actionsWithoutOutcome;
    if (row.fights === 0) {
      survey.sessionsWithoutMarkers += 1;
      if (row.stampedLines > 0) survey.unmarkedSessionsWithStamps += 1;
    }
    survey.stampedLines += row.stampedLines;
    survey.damageToCharacter += row.damageToCharacter;
    survey.damageToMonster += row.damageToMonster;
    survey.damageWithoutTarget += row.damageWithoutTarget;
    survey.damageRecordedByTheHurt += row.damageRecordedByTheHurt;
    survey.landedOnMonsters += row.landedOnMonsters;
    for (const bucket of GAP_BUCKETS)
      survey.combatGaps[bucket] =
        (survey.combatGaps[bucket] ?? 0) + row.combatGaps[bucket];
    survey.perSession.push(row);
  }
  survey.perSession.sort(
    (a, b) => b.lines - a.lines || b.fights - a.fights || b.writers - a.writers
  );
  return survey;
}

export const DISCOVERY = [
  { collectionGroup: "sessionLogs", pattern: HEAD },
  { collectionGroup: "items", pattern: ITEM },
];

async function run(): Promise<void> {
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
  try {
    const found = await discoverDocuments(getFirestore(app), DISCOVERY);
    console.log(
      JSON.stringify(surveySessionReports(found.map((d) => d.source)), null, 2)
    );
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

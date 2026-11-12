/**
 * A sandbox player's character in the stored shape live data has after the ADR-0009
 * parent cutover: the parent (`revision: 0`, empty `state`, `playStateVersion: 1`)
 * and the `combat/state` child that owns play. Built by the parent-cutover
 * migration's own planner from the portable fixture, so the emulator sandbox can
 * never drift from what a real character looks like.
 */

import type { Timestamp } from "firebase-admin/firestore";

import { planParentCutover } from "../migrate-character-parents.ts";
import { isRecord } from "./migration-kit.ts";

type RawMap = Record<string, unknown>;

// ── The engine seam (structural, so the scripts project never type-imports the app) ──
// The roster's stored `cache` is built by the app's own builder from the parsed sheet.

type ParsedEnvelope =
  | { ok: true; character: unknown; session: unknown }
  | { ok: false; error: string };

async function engineFunction(file: string, name: string): Promise<unknown> {
  const module: unknown = await import(
    new URL(`../../src/lib/${file}`, import.meta.url).href
  );
  if (!isRecord(module) || typeof module[name] !== "function") {
    throw new TypeError(`${file} does not export ${name}`);
  }
  return module[name];
}

const parseCharacterEnvelope = (await engineFunction(
  "character-codec.ts",
  "parseCharacterEnvelope"
)) as (build: RawMap, state: RawMap) => ParsedEnvelope;
const buildCharacterCache = (await engineFunction(
  "character-cache-build.ts",
  "buildCharacterCache"
)) as (character: unknown, session: unknown) => RawMap;

export function sandboxCharacterDocuments(
  uid: string,
  charId: string,
  envelope: RawMap,
  parentFields: RawMap,
  updatedAt: Timestamp
): { parent: RawMap; child: RawMap } {
  const path = `users/${uid}/characters/${charId}`;
  const plan = planParentCutover(
    [{ uid, charId, parent: { path, data: { ...envelope, ...parentFields } } }],
    updatedAt
  );
  if (plan.issues.length > 0) {
    throw new Error(
      `Sandbox character ${charId} does not cut over: ${plan.issues.map((i) => i.code).join(", ")}`
    );
  }
  const parent = plan.documents.find((document) => document.role === "parent")?.after;
  const child = plan.documents.find((document) => document.role === "child")?.after;
  if (!parent || !child)
    throw new Error(`Sandbox character ${charId} has no planned pair`);
  // The roster reads only the stored `cache`, which every app write stamps; a portable
  // fixture carries none, so the seed stamps it the same way.
  const parsed = parseCharacterEnvelope(
    envelope.build as RawMap,
    (envelope.state ?? {}) as RawMap
  );
  if (!parsed.ok)
    throw new Error(`Sandbox character ${charId} does not parse: ${parsed.error}`);
  return {
    parent: { ...parent, cache: buildCharacterCache(parsed.character, parsed.session) },
    child,
  };
}

/**
 * The campaign's copy of a sandbox hero (`memberDetails[uid].character`), the one the
 * DM's party card reads. Whatever (re)seeds a hero writes this too, so the campaign
 * never shows a hero an earlier seed left.
 */
export function sandboxMemberCharacter(envelope: {
  build: { name?: unknown; race?: unknown; classes?: unknown };
}): RawMap {
  const { name, race, classes } = envelope.build;
  return {
    name,
    ...(race ? { race } : {}),
    ...(classes ? { classes } : {}),
    portraitUrl: null,
  };
}

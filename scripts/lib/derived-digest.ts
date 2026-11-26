/**
 * The before/after derived-sheet harness (ADR-0010, step M0): every stored character
 * family (the parent document and its `combat/state` child, as Firestore holds them)
 * goes through the real read path (`hydrateStoredCharacter`) and the real derived
 * sheet (`deriveCharacter`, the trackers, the actions and the spells views), and comes
 * out as a short hash per derived section. Two digests of the same sheets, taken on two
 * commits, are compared section by section: a migration step that must not move a
 * number shows zero changed sections.
 *
 * Pure reads: no Firebase, no network, no writes. The CLI is `scripts/derived-digest.ts`.
 *
 * A digest is deterministic by construction: keys sorted by code unit, Sets sorted,
 * rows with an id keyed by it, display text, Dates and functions left out, a fixed
 * document id, no timestamp. A digest of live sheets is PRIVATE (a hash of a small
 * section such as AC can be guessed back): never commit one, keep it owner-only.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// ── The engine seam ───────────────────────────────────────────────────────────
// Loaded at run time and typed structurally, like the derived-sheet probe: the
// scripts project never type-imports the app (its graph needs the DOM library).

type RawMap = Record<string, unknown>;
/** The stored character as the read path returns it (`CharacterDoc`). */
interface StoredSheet {
  character: { classes: ReadonlyArray<{ classId: string }> };
}
interface Engine {
  hydrateStoredCharacter: (
    id: string,
    parent: RawMap,
    combat: unknown
  ) => Promise<StoredSheet>;
  deriveCharacter: (doc: StoredSheet) => RawMap;
  resolveTrackers: (doc: StoredSheet) => unknown[];
  resolveActions: (doc: StoredSheet) => Array<{ summary: RawMap }>;
  buildSpellsViewModel: (
    doc: StoredSheet,
    classId: string,
    locale: string,
    isEdit: boolean
  ) => unknown;
}

async function engineFunction(file: string, name: string): Promise<unknown> {
  const module = (await import(
    new URL(`../../src/lib/${file}.ts`, import.meta.url).href
  )) as RawMap;
  if (typeof module[name] !== "function") throw new TypeError(`${file} has no ${name}`);
  return module[name];
}

let engine: Promise<Engine> | undefined;

/** The real read path and derived sheet, loaded once. */
export function loadEngine(): Promise<Engine> {
  engine ??= (async () => ({
    hydrateStoredCharacter: (await engineFunction(
      "character-read",
      "hydrateStoredCharacter"
    )) as Engine["hydrateStoredCharacter"],
    deriveCharacter: (await engineFunction(
      "views/derive-character",
      "deriveCharacter"
    )) as Engine["deriveCharacter"],
    resolveTrackers: (await engineFunction(
      "smart-tracker",
      "resolveTrackers"
    )) as Engine["resolveTrackers"],
    resolveActions: (await engineFunction(
      "smart-tracker",
      "resolveActions"
    )) as Engine["resolveActions"],
    buildSpellsViewModel: (await engineFunction(
      "views/spells-view",
      "buildSpellsViewModel"
    )) as Engine["buildSpellsViewModel"],
  }))();
  return engine;
}

export const DIGEST_FORMAT = "d20-folio-derived-digest-v1";

/** The derived sections, in report order. `other` catches any sheet field a later
 *  engine adds before this list names it, so nothing is silently left out. */
export const SECTIONS = [
  "level",
  "abilities",
  "saves",
  "skills",
  "passives",
  "ac",
  "hp",
  "initiative",
  "speed",
  "senses",
  "spellcasting",
  "conditions",
  "defenses",
  "resources",
  "attacks",
  "actions",
  "spells",
  "other",
] as const;
export type Section = (typeof SECTIONS)[number];

/** Which section each `deriveCharacter` field (`CharacterSheet`) belongs to. */
const SHEET_SECTION: Readonly<Partial<Record<string, Section>>> = {
  level: "level",
  proficiencyBonus: "level",
  abilities: "abilities",
  saves: "saves",
  skills: "skills",
  passives: "passives",
  ac: "ac",
  hp: "hp",
  initiativeBonus: "initiative",
  walkingSpeedFt: "speed",
  speeds: "speed",
  senses: "senses",
  unlimitedSenses: "senses",
  detections: "senses",
  spellcasting: "spellcasting",
  conditions: "conditions",
  suppressedConditions: "conditions",
  defenses: "defenses",
  conditionImmunities: "defenses",
  sourceConditionImmunities: "defenses",
};

export type SheetDigest =
  | { sheet: string; sections: Record<Section, string> }
  | { unreadable: string };

export interface Digest {
  format: typeof DIGEST_FORMAT;
  /** Whether the private pack took part: two digests compare only when equal. */
  composed: boolean;
  sheets: Record<string, SheetDigest>;
}

// ── Canonical form ────────────────────────────────────────────────────────────

/** Display text (labels, names, descriptions, notes): a copy edit is not a rules
 *  change. Ids, enums and numbers stay. */
const TEXT_KEY =
  /^(label|name|nameEn|title|subtitle|description|text|tooltip|hint|notes?|emoji|icon)$|(Label|Text|Tooltip|Hint|Description)$/;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value as plain, order-stable JSON, or `undefined` for what a sheet does not
 *  show (functions, Dates, `undefined`, display text). */
export function canonical(value: unknown, seen = new Set<object>()): Json | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value !== "object" || value instanceof Date) return undefined;
  if (seen.has(value)) return "[cycle]";
  seen.add(value);
  try {
    if (value instanceof Set) {
      const items = [...(value as Set<unknown>)].map((item) => canonical(item, seen));
      return items
        .filter((item): item is Json => item !== undefined)
        .sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)));
    }
    if (value instanceof Map)
      return canonical(Object.fromEntries(value as Map<unknown, unknown>), seen);
    if (Array.isArray(value)) {
      // Rows with an id are keyed by it (a repeated id gets `#2`, `#3`…).
      if (
        value.length > 0 &&
        value.every((row) => isRecord(row) && typeof row.id === "string")
      ) {
        const keyed: Record<string, unknown> = {};
        for (const row of value as Array<{ id: string }>) {
          let key = row.id;
          for (let n = 2; key in keyed; n += 1) key = `${row.id}#${n}`;
          keyed[key] = row;
        }
        return canonical(keyed, seen);
      }
      return value.map((item) => canonical(item, seen) ?? null);
    }
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value).sort(compareText)) {
      if (TEXT_KEY.test(key)) continue;
      const child = canonical((value as Record<string, unknown>)[key], seen);
      if (child !== undefined) out[key] = child;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/** Code-unit order: independent of the machine's locale. */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function hashOf(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value) ?? null))
    .digest("hex")
    .slice(0, 16);
}

/** A report or digest as JSON text: every key sorted, two-space indented,
 *  newline-terminated. Nothing is dropped (unlike {@link canonical}). */
export function stableText(value: unknown): string {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sorted)
      : isRecord(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort(compareText)
              .map((key) => [key, sorted(v[key])])
          )
        : v;
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

// ── The derived sheet, by section ─────────────────────────────────────────────

/** The derived sheet of one character, grouped by section (plain values). */
export function derivedSections(
  engine: Engine,
  doc: StoredSheet
): Record<Section, unknown> {
  const sections = Object.fromEntries(SECTIONS.map((section) => [section, {}])) as Record<
    Section,
    RawMap
  >;
  for (const [field, value] of Object.entries(engine.deriveCharacter(doc)))
    sections[SHEET_SECTION[field] ?? "other"][field] = value;
  sections.resources.trackers = engine.resolveTrackers(doc);
  const actions = engine.resolveActions(doc);
  const isAttack = (a: { summary: RawMap }) => typeof a.summary.attackBonus === "number";
  sections.attacks.rows = actions.filter(isAttack);
  sections.actions.rows = actions.filter((a) => !isAttack(a));
  for (const { classId } of doc.character.classes)
    sections.spells[classId] = engine.buildSpellsViewModel(doc, classId, "en", false);
  return sections;
}

/** The stable reason a family could not be read: a short code, never a message. */
export function unreadableReason(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const code = /^Invalid (?:character document|combat state): ([a-z0-9-]{1,40})$/.exec(
    message
  )?.[1];
  return code ?? "threw";
}

export async function digestFamily(
  parent: RawMap,
  combat: unknown
): Promise<SheetDigest> {
  const run = await loadEngine();
  let doc: StoredSheet;
  try {
    // A fixed id: the derived sheet never depends on which document it came from.
    doc = await run.hydrateStoredCharacter("sheet", parent, combat ?? null);
  } catch (error) {
    return { unreadable: unreadableReason(error) };
  }
  try {
    const derived = derivedSections(run, doc);
    const sections = Object.fromEntries(
      SECTIONS.map((section) => [section, hashOf(derived[section])])
    ) as Record<Section, string>;
    return { sheet: hashOf(sections), sections };
  } catch {
    return { unreadable: "derive-threw" };
  }
}

// ── The stored sheets on disk ─────────────────────────────────────────────────

/** One stored Firestore document: its path and its data. */
export interface StoredDocument {
  path: string;
  data: Record<string, unknown>;
}

export interface Family {
  /** The parent document's path: `users/<uid>/characters/<id>`. */
  key: string;
  parent: Record<string, unknown>;
  combat: Record<string, unknown> | undefined;
}

const PARENT = /^users\/[^/]+\/characters\/[^/]+$/;
const CHILD = /^(users\/[^/]+\/characters\/[^/]+)\/combat\/state$/;

/** Parents with their `combat/state` child, by path; other documents are ignored. */
export function familiesOf(documents: readonly StoredDocument[]): Family[] {
  const children = new Map<string, Record<string, unknown>>();
  for (const { path, data } of documents) {
    const parent = CHILD.exec(path)?.[1];
    if (parent) children.set(parent, data);
  }
  return documents
    .filter(({ path }) => PARENT.test(path))
    .map(({ path, data }) => ({ key: path, parent: data, combat: children.get(path) }))
    .sort((a, b) => compareText(a.key, b.key));
}

function isStoredDocument(value: unknown): value is StoredDocument {
  return isRecord(value) && typeof value.path === "string" && isRecord(value.data);
}

/** Every `*.json` file in `directory`: one stored document `{path, data}` or a list of
 *  them (a fixture family, or a whole collection-group dump). */
export async function readStoredDocuments(directory: string): Promise<StoredDocument[]> {
  const files = (await readdir(directory)).filter((f) => f.endsWith(".json")).sort();
  const documents: StoredDocument[] = [];
  for (const file of files) {
    const parsed: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
    const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      // The file is named by its index, never by its name: a live dump's file
      // names can carry ids.
      if (!isStoredDocument(item))
        throw new TypeError(`file #${files.indexOf(file) + 1} holds a non-document`);
      documents.push(item);
    }
  }
  return documents;
}

export async function digestDocuments(
  documents: readonly StoredDocument[],
  composed: boolean
): Promise<Digest> {
  const sheets: Record<string, SheetDigest> = {};
  for (const family of familiesOf(documents))
    sheets[family.key] = await digestFamily(family.parent, family.combat);
  return { format: DIGEST_FORMAT, composed, sheets };
}

// ── The comparison ────────────────────────────────────────────────────────────

export interface Comparison {
  sheets: number;
  unchanged: number;
  /** Sheet → the sections whose hash moved. */
  changed: Record<string, Section[]>;
  onlyBefore: string[];
  onlyAfter: string[];
  /** Sheets unreadable on at least one side, with each side's reason (null: read). */
  unreadable: Record<string, { before: string | null; after: string | null }>;
}

export function parseDigest(value: unknown): Digest {
  if (!isRecord(value) || value.format !== DIGEST_FORMAT || !isRecord(value.sheets))
    throw new TypeError(`not a ${DIGEST_FORMAT} file`);
  if (typeof value.composed !== "boolean")
    throw new TypeError("digest has no composed flag");
  return value as unknown as Digest;
}

export function compareDigests(before: Digest, after: Digest): Comparison {
  if (before.composed !== after.composed)
    throw new Error(
      `composed: before ${String(before.composed)}, after ${String(after.composed)}. ` +
        "Digest both sides with the pack linked, or both without it."
    );
  const keys = [
    ...new Set([...Object.keys(before.sheets), ...Object.keys(after.sheets)]),
  ].sort(compareText);
  const result: Comparison = {
    sheets: keys.length,
    unchanged: 0,
    changed: {},
    onlyBefore: [],
    onlyAfter: [],
    unreadable: {},
  };
  for (const key of keys) {
    const a = before.sheets[key];
    const b = after.sheets[key];
    if (!a) {
      result.onlyAfter.push(key);
      continue;
    }
    if (!b) {
      result.onlyBefore.push(key);
      continue;
    }
    if ("unreadable" in a || "unreadable" in b) {
      result.unreadable[key] = {
        before: "unreadable" in a ? a.unreadable : null,
        after: "unreadable" in b ? b.unreadable : null,
      };
      if ("unreadable" in a && "unreadable" in b && a.unreadable === b.unreadable)
        result.unchanged += 1;
      continue;
    }
    const moved = SECTIONS.filter(
      (section) => a.sections[section] !== b.sections[section]
    );
    if (moved.length === 0) result.unchanged += 1;
    else result.changed[key] = moved;
  }
  return result;
}

/** True when the two digests differ in any way the harness reports. */
export function hasChanges(comparison: Comparison): boolean {
  return comparison.unchanged !== comparison.sheets;
}

/** The named report: which sheet, which sections. For fixtures and owner-only runs. */
export function namedReport(comparison: Comparison): string {
  const lines = [
    `derived sheets: ${comparison.sheets}, unchanged ${comparison.unchanged}, ` +
      `changed ${Object.keys(comparison.changed).length}, only before ${comparison.onlyBefore.length}, ` +
      `only after ${comparison.onlyAfter.length}, unreadable ${Object.keys(comparison.unreadable).length}`,
  ];
  for (const [key, sections] of Object.entries(comparison.changed))
    lines.push(`changed      ${key}: ${sections.join(", ")}`);
  for (const key of comparison.onlyBefore) lines.push(`only before  ${key}`);
  for (const key of comparison.onlyAfter) lines.push(`only after   ${key}`);
  for (const [key, { before, after }] of Object.entries(comparison.unreadable))
    lines.push(
      `unreadable   ${key}: before ${before ?? "read"}, after ${after ?? "read"}`
    );
  return `${lines.join("\n")}\n`;
}

export interface CountsReport {
  sheets: number;
  unchanged: number;
  changed: number;
  onlyBefore: number;
  onlyAfter: number;
  /** Sheets unreadable before / after, and those whose readability or reason moved. */
  unreadableBefore: number;
  unreadableAfter: number;
  unreadableChanged: number;
  /** Section → sheets whose section moved (every section listed, zeros included). */
  bySection: Record<Section, number>;
}

/** The counts-only report for live sheets: numbers only, never a key, a hash, a
 *  reason or a value. */
export function countsReport(comparison: Comparison): CountsReport {
  const unreadable = Object.values(comparison.unreadable);
  const bySection = Object.fromEntries(SECTIONS.map((s) => [s, 0])) as Record<
    Section,
    number
  >;
  for (const sections of Object.values(comparison.changed))
    for (const section of sections) bySection[section] += 1;
  return {
    sheets: comparison.sheets,
    unchanged: comparison.unchanged,
    changed: Object.keys(comparison.changed).length,
    onlyBefore: comparison.onlyBefore.length,
    onlyAfter: comparison.onlyAfter.length,
    unreadableBefore: unreadable.filter((u) => u.before !== null).length,
    unreadableAfter: unreadable.filter((u) => u.after !== null).length,
    unreadableChanged: unreadable.filter((u) => u.before !== u.after).length,
    bySection,
  };
}

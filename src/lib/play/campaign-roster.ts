/**
 * The creatures the DM keeps between fights (edge-case M19,
 * docs/architecture/2026-11-dm-state-and-roster.md): a hireling, a recurring villain,
 * a rescued prisoner. What the party knows lives in `campaigns/{c}/roster/{id}`
 * (members read, the DM writes); what only the DM knows in `dmRoster/{id}`. An
 * encounter takes an entry by id (never a copy), so damage taken in a fight persists
 * after it. Pure: the entry shapes and their bounded parsers.
 */
import type { CreatureType } from "@/data/types";
import type { CreatureLocation } from "@/lib/familiar";

/** What the party knows of a creature the DM keeps. */
export interface RosterEntry {
  name: string;
  /** Its catalogue stat block, when it has one. */
  monsterId?: string;
  creatureType?: CreatureType;
  hp?: { current: number; max: number; temp?: number };
  /** Where it is (a plane, or inside an extradimensional space). */
  location?: CreatureLocation;
}

/** What only the DM knows of it. */
export interface DmRosterEntry {
  notes?: string;
}

const MAX_NAME = 200;
const MAX_NOTES = 20000;
const MAX_ID = 128;

const record = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
const count = (raw: unknown): number | undefined =>
  typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : undefined;
const id = (raw: unknown): string | undefined =>
  typeof raw === "string" && raw && raw.length <= MAX_ID ? raw : undefined;

function parseLocation(raw: unknown): CreatureLocation | undefined {
  const r = record(raw);
  if (!r) return undefined;
  const plane = id(r.plane);
  const inside = id(r.inside);
  return plane || inside
    ? { ...(plane ? { plane } : {}), ...(inside ? { inside } : {}) }
    : undefined;
}

/** A stored `roster` entry, bounded; null without a name. */
export function parseRosterEntry(raw: unknown): RosterEntry | null {
  const r = record(raw);
  const name = typeof r?.name === "string" ? r.name.slice(0, MAX_NAME).trim() : "";
  if (!r || !name) return null;
  const monsterId = id(r.monsterId);
  const creatureType = id(r.creatureType) as CreatureType | undefined;
  const hpRaw = record(r.hp);
  const current = count(hpRaw?.current);
  const max = count(hpRaw?.max);
  const temp = count(hpRaw?.temp);
  const location = parseLocation(r.location);
  return {
    name,
    ...(monsterId ? { monsterId } : {}),
    ...(creatureType ? { creatureType } : {}),
    ...(current !== undefined && max !== undefined && max > 0
      ? { hp: { current: Math.min(current, max), max, ...(temp ? { temp } : {}) } }
      : {}),
    ...(location ? { location } : {}),
  };
}

/** A stored `dmRoster` entry, bounded. */
export function parseDmRosterEntry(raw: unknown): DmRosterEntry {
  const r = record(raw);
  return typeof r?.notes === "string" && r.notes
    ? { notes: r.notes.slice(0, MAX_NOTES) }
    : {};
}

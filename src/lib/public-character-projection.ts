import type { CharacterCache } from "@/lib/character-cache";
import { normalizePortraitCrop } from "@/lib/portrait-crop";
import type { CharacterDoc, ClassEntry, PortraitCrop } from "@/types/character";

export const PUBLIC_CHARACTER_SCHEMA = 1 as const;

const PROJECTION_KEYS = [
  "publicSchema",
  "schema",
  "build",
  "cache",
  "status",
  "hasPortrait",
  "portraitCrop",
  "sourceUpdatedAt",
] as const;

const CACHE_KEYS = ["name", "ac", "hpMax", "speed", "raceId", "classes"] as const;

const CLASS_KEYS = [
  "classId",
  "subclassId",
  "level",
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const;

const CLASS_ARRAY_KEYS = [
  "weaponMasteries",
  "metamagicChoices",
  "invocationChoices",
  "maneuverChoices",
  "fightingStyles",
] as const satisfies ReadonlyArray<keyof ClassEntry>;

type CharacterStatus = CharacterDoc["status"];

/** The complete, deliberately narrow document stored at `public/sheet`. */
export interface PublicCharacterProjection {
  publicSchema: typeof PUBLIC_CHARACTER_SCHEMA;
  schema: number;
  build: Record<string, unknown>;
  cache: CharacterCache;
  status: CharacterStatus;
  hasPortrait: boolean;
  portraitCrop: PortraitCrop | null;
  /** A Firestore server timestamp on remote writes; a Date in the local replica. */
  sourceUpdatedAt: unknown;
}

export interface PublicProjectionMetadataPatch {
  status?: CharacterStatus;
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): boolean {
  const keys = Object.keys(record);
  return (
    required.every((key) => Object.hasOwn(record, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function copyStringArray(value: unknown): string[] | undefined {
  return stringArray(value) ? [...value] : undefined;
}

function isStatus(value: unknown): value is CharacterStatus {
  return (
    value === "active" || value === "retired" || value === "dead" || value === "archived"
  );
}

function readProjectionDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (!isRecord(value) || typeof value.toDate !== "function") return null;
  try {
    const date = (value.toDate as () => unknown)();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}

function cloneClassEntry(entry: ClassEntry): ClassEntry {
  return {
    classId: entry.classId,
    level: entry.level,
    ...(entry.subclassId === undefined ? {} : { subclassId: entry.subclassId }),
    ...(entry.weaponMasteries === undefined
      ? {}
      : { weaponMasteries: [...entry.weaponMasteries] }),
    ...(entry.metamagicChoices === undefined
      ? {}
      : { metamagicChoices: [...entry.metamagicChoices] }),
    ...(entry.invocationChoices === undefined
      ? {}
      : { invocationChoices: [...entry.invocationChoices] }),
    ...(entry.maneuverChoices === undefined
      ? {}
      : { maneuverChoices: [...entry.maneuverChoices] }),
    ...(entry.fightingStyles === undefined
      ? {}
      : { fightingStyles: [...entry.fightingStyles] }),
  };
}

function cloneCache(cache: CharacterCache): CharacterCache {
  return {
    name: cache.name,
    ac: cache.ac,
    hpMax: cache.hpMax,
    speed: cache.speed,
    raceId: cache.raceId,
    classes: cache.classes.map(cloneClassEntry),
  };
}

/**
 * Construct a projection from an already-persisted canonical parent without
 * rehydrating its intentionally absent play state. The stored cache is the exact
 * live derivation the parent owns; copying it is required for metadata-only writes.
 */
export function buildPublicCharacterProjectionFromStoredParent(
  raw: unknown,
  patch: PublicProjectionMetadataPatch,
  sourceUpdatedAt: unknown
): PublicCharacterProjection {
  if (!isRecord(raw)) throw new TypeError("Invalid character parent");
  if (!isRecord(raw.state) || Object.keys(raw.state).length !== 0) {
    throw new TypeError("Canonical character parent must not contain play state");
  }
  if (raw.schema !== 3 || !isRecord(raw.build)) {
    throw new TypeError("Invalid character parent envelope");
  }
  const cache = parseCache(raw.cache);
  if (cache === null) throw new TypeError("Invalid character parent cache");
  const status = patch.status ?? raw.status;
  if (!isStatus(status)) throw new TypeError("Invalid character status");
  const portraitUrl = Object.hasOwn(patch, "portraitUrl")
    ? patch.portraitUrl
    : raw.portraitUrl;
  if (portraitUrl !== null && typeof portraitUrl !== "string") {
    throw new TypeError("Invalid character portrait URL");
  }
  const rawCrop = Object.hasOwn(patch, "portraitCrop")
    ? patch.portraitCrop
    : raw.portraitCrop;
  const crop =
    rawCrop === null || rawCrop === undefined ? null : normalizePortraitCrop(rawCrop);
  if (
    rawCrop !== null &&
    rawCrop !== undefined &&
    (crop === null || !jsonEqual(crop, rawCrop))
  ) {
    throw new TypeError("Invalid character portrait crop");
  }
  const hasPortrait = typeof portraitUrl === "string" && portraitUrl.trim().length > 0;
  return {
    publicSchema: PUBLIC_CHARACTER_SCHEMA,
    schema: raw.schema,
    build: { ...raw.build },
    cache: cloneCache(cache),
    status,
    hasPortrait,
    portraitCrop: hasPortrait ? crop : null,
    sourceUpdatedAt,
  };
}

function parseClassEntry(value: unknown): ClassEntry | null {
  if (!isRecord(value)) return null;
  if (
    !hasExactKeys(
      value,
      ["classId", "level"],
      CLASS_KEYS.filter((key) => key !== "classId" && key !== "level")
    )
  ) {
    return null;
  }
  if (!nonEmptyString(value.classId)) return null;
  if (
    typeof value.level !== "number" ||
    !Number.isInteger(value.level) ||
    value.level < 1
  ) {
    return null;
  }
  if (value.subclassId !== undefined && !nonEmptyString(value.subclassId)) return null;
  for (const key of CLASS_ARRAY_KEYS) {
    if (value[key] !== undefined && !stringArray(value[key])) return null;
  }
  const weaponMasteries = copyStringArray(value.weaponMasteries);
  const metamagicChoices = copyStringArray(value.metamagicChoices);
  const invocationChoices = copyStringArray(value.invocationChoices);
  const maneuverChoices = copyStringArray(value.maneuverChoices);
  const fightingStyles = copyStringArray(value.fightingStyles);
  return {
    classId: value.classId,
    level: value.level,
    ...(typeof value.subclassId === "string" ? { subclassId: value.subclassId } : {}),
    ...(weaponMasteries ? { weaponMasteries } : {}),
    ...(metamagicChoices ? { metamagicChoices } : {}),
    ...(invocationChoices ? { invocationChoices } : {}),
    ...(maneuverChoices ? { maneuverChoices } : {}),
    ...(fightingStyles ? { fightingStyles } : {}),
  };
}

function parseCache(value: unknown): CharacterCache | null {
  if (!isRecord(value) || !hasExactKeys(value, CACHE_KEYS)) return null;
  if (
    !nonEmptyString(value.name) ||
    !finiteNonNegative(value.ac) ||
    !finiteNonNegative(value.hpMax) ||
    typeof value.speed !== "string" ||
    typeof value.raceId !== "string" ||
    !Array.isArray(value.classes) ||
    value.classes.length === 0
  ) {
    return null;
  }
  const classes = value.classes.map(parseClassEntry);
  if (classes.some((entry) => entry === null)) return null;
  return {
    name: value.name as CharacterCache["name"],
    ac: value.ac,
    hpMax: value.hpMax,
    speed: value.speed,
    raceId: value.raceId,
    classes: classes as ClassEntry[],
  };
}

function jsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && jsonEqual(left[key], right[rightKeys[index] ?? ""])
    )
  );
}

/**
 * Construct the only public read model from a complete private in-memory document.
 * Every output key is named explicitly; no private parent field can hitch a ride.
 */
export async function buildPublicCharacterProjection(
  source: CharacterDoc,
  sourceUpdatedAt: unknown
): Promise<PublicCharacterProjection> {
  if (!isStatus(source.status)) throw new TypeError("Invalid character status");
  const [{ serializeCharacterEnvelope }, { buildCharacterCache }] = await Promise.all([
    import("@/lib/character-codec"),
    import("@/lib/character-cache"),
  ]);
  const envelope = serializeCharacterEnvelope(source);
  // This is the same live derivation `toStoredPayload` stamps on the private parent.
  // Rules/functions cross-check byte-for-byte equality; the public parser only shape-
  // validates it because active session effects are intentionally absent here.
  const cache = buildCharacterCache(source.character, source.session);
  const hasPortrait =
    typeof source.portraitUrl === "string" && source.portraitUrl.trim().length > 0;
  return {
    publicSchema: PUBLIC_CHARACTER_SCHEMA,
    schema: envelope.schema,
    build: envelope.build,
    cache: cloneCache(cache),
    status: source.status,
    hasPortrait,
    portraitCrop: hasPortrait ? normalizePortraitCrop(source.portraitCrop) : null,
    sourceUpdatedAt,
  };
}

/** Same-origin by construction: no persisted URL is ever accepted by a public read. */
export function publicPortraitPath(uid: string, charId: string): string {
  if (!nonEmptyString(uid) || !nonEmptyString(charId)) {
    throw new TypeError("Invalid public character path");
  }
  return `/og/portrait/${encodeURIComponent(uid)}/${encodeURIComponent(charId)}.jpeg`;
}

/** Strictly parse `public/sheet` and derive the read-only in-memory sheet model. */
export async function parsePublicCharacterProjection(
  uid: string,
  charId: string,
  raw: unknown
): Promise<CharacterDoc> {
  if (!isRecord(raw) || !hasExactKeys(raw, PROJECTION_KEYS)) {
    throw new TypeError("Invalid public character projection shape");
  }
  if (raw.publicSchema !== PUBLIC_CHARACTER_SCHEMA) {
    throw new TypeError("Unsupported public character projection schema");
  }
  if (!isRecord(raw.build) || !isStatus(raw.status)) {
    throw new TypeError("Invalid public character projection facts");
  }
  if (typeof raw.hasPortrait !== "boolean") {
    throw new TypeError("Invalid public character portrait marker");
  }
  const crop = raw.portraitCrop === null ? null : normalizePortraitCrop(raw.portraitCrop);
  if (
    (raw.portraitCrop !== null &&
      (crop === null || !jsonEqual(crop, raw.portraitCrop))) ||
    (!raw.hasPortrait && raw.portraitCrop !== null)
  ) {
    throw new TypeError("Invalid public character portrait crop");
  }
  const updatedAt = readProjectionDate(raw.sourceUpdatedAt);
  if (updatedAt === null) throw new TypeError("Invalid public character timestamp");
  const storedCache = parseCache(raw.cache);
  if (storedCache === null) throw new TypeError("Invalid public character cache");

  const [{ SCHEMA_VERSION, parseCharacterEnvelope }, aggregate] = await Promise.all([
    import("@/lib/character-codec"),
    import("@/lib/aggregate-character"),
  ]);
  if (raw.schema !== SCHEMA_VERSION) {
    throw new TypeError("Unsupported public character source schema");
  }
  const parsed = parseCharacterEnvelope(raw.build, {});
  if (!parsed.ok) throw new TypeError(`Invalid public character: ${parsed.error}`);
  const max = aggregate.effectiveMaxHp(parsed.character, parsed.session);
  const session = {
    ...parsed.session,
    hp: { current: max, temp: 0 },
  };
  const character = {
    ...parsed.character,
    ac: aggregate.effectiveAC(parsed.character, session),
  };
  return {
    id: charId,
    createdAt: updatedAt,
    updatedAt,
    portraitUrl: raw.hasPortrait ? publicPortraitPath(uid, charId) : null,
    portraitCrop: crop,
    shared: true,
    // The projection deliberately carries no private generation; an anonymous read is
    // never a write base, so the read-only doc reports the neutral 0.
    revision: 0,
    status: raw.status,
    character,
    session,
  };
}

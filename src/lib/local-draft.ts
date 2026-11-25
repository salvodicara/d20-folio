/**
 * Drafts that survive a reload (E4; the D&D Beyond Quickbuilder keeps a build after a
 * refresh): the creation wizard's in-progress draft and the level-up screen's answers.
 * Device-local working state, never a stored character until «Create» / «Save», so it
 * lives in localStorage per account, never in Firestore. A small schema version drops
 * an older client's draft instead of misreading it; every read and write is guarded,
 * so private mode or blocked storage only loses the convenience. Cleared on a
 * successful create or level-up and on sign-out. Distinct from the offline outbox's
 * finished builds awaiting the server (`folio.pendingCreates.<uid>`).
 */
// Type-only: this module is imported by sign-out (the eager bundle), so it must never
// pull the creation engine in at runtime.
import type { CreationDraft } from "@/lib/creation/draft";

const VERSION = 1;
const creationKey = (uid: string) => `folio.creationDraft.${uid}`;
const levelUpPrefix = (uid: string) => `folio.levelUpDraft.${uid}.`;
const levelUpKey = (uid: string, characterId: string) =>
  `${levelUpPrefix(uid)}${characterId}`;

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const box = parsed as { v?: unknown; draft?: unknown };
    return box.v === VERSION ? (box.draft ?? null) : null;
  } catch {
    return null;
  }
}

function write(key: string, draft: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: VERSION, draft }));
  } catch {
    // Blocked or full storage: the draft simply does not survive a reload.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

/** The account's saved creation draft (the caller completes it with today's
 *  defaults, so a field added since is never missing); null when none. */
export function loadCreationDraft(uid: string): Partial<CreationDraft> | null {
  const stored = read(creationKey(uid));
  return typeof stored === "object" && stored !== null ? stored : null;
}

export function saveCreationDraft(uid: string, draft: CreationDraft): void {
  write(creationKey(uid), draft);
}

export function clearCreationDraft(uid: string): void {
  remove(creationKey(uid));
}

export interface LevelUpDraft<A = unknown> {
  /** The total level the character had when the answers were given. */
  fromLevel: number;
  classId: string;
  answers: A;
}

/** A character's level-up answers, only for the level they were given at. */
export function loadLevelUpDraft<A = unknown>(
  uid: string,
  characterId: string,
  fromLevel: number
): Omit<LevelUpDraft<A>, "fromLevel"> | null {
  const stored = read(levelUpKey(uid, characterId)) as LevelUpDraft<A> | null;
  if (!stored || stored.fromLevel !== fromLevel || typeof stored.classId !== "string")
    return null;
  return { classId: stored.classId, answers: stored.answers };
}

export function saveLevelUpDraft<A>(
  uid: string,
  characterId: string,
  draft: LevelUpDraft<A>
): void {
  write(levelUpKey(uid, characterId), draft);
}

export function clearLevelUpDraft(uid: string, characterId: string): void {
  remove(levelUpKey(uid, characterId));
}

// ─── The rescue copy (#1320) ─────────────────────────────────────────────────

/**
 * A sheet's unsaved local document, kept on this device when the server holds a newer
 * shape (a migration ran while this tab had edits the server will refuse). Stored in
 * the shape this client wrote (`schema`, `playVersion`): after the reload the new
 * client upgrades it through each shape step, then offers «Apply / Discard».
 */
export interface RescueCopy {
  savedAt: number;
  schema: number;
  playVersion: number;
  build: Record<string, unknown>;
  state: Record<string, unknown>;
}

/** A rescue copy is offered for 30 days, then dropped. */
export const RESCUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const rescuePrefix = (uid: string) => `folio.rescue.${uid}.`;
const rescueKey = (uid: string, characterId: string) =>
  `${rescuePrefix(uid)}${characterId}`;

function isRescueCopy(value: unknown): value is RescueCopy {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.savedAt === "number" &&
    typeof c.schema === "number" &&
    typeof c.playVersion === "number" &&
    typeof c.build === "object" &&
    c.build !== null &&
    typeof c.state === "object" &&
    c.state !== null
  );
}

/** Keep the copy. Returns whether it was REALLY written: a caller may only tell the
 *  player "your changes are kept on this device" on `true`. */
export function keepRescueCopy(
  uid: string,
  characterId: string,
  copy: RescueCopy
): boolean {
  try {
    localStorage.setItem(
      rescueKey(uid, characterId),
      JSON.stringify({ v: VERSION, draft: copy })
    );
    return true;
  } catch {
    return false;
  }
}

/** The character's rescue copy, or null (none, malformed, or older than 30 days, which
 *  is then removed). */
export function readRescueCopy(
  uid: string,
  characterId: string,
  now: number
): RescueCopy | null {
  const stored = read(rescueKey(uid, characterId));
  if (!isRescueCopy(stored)) return null;
  if (now - stored.savedAt > RESCUE_TTL_MS) {
    remove(rescueKey(uid, characterId));
    return null;
  }
  return stored;
}

export function dropRescueCopy(uid: string, characterId: string): void {
  remove(rescueKey(uid, characterId));
}

/** Sign-out: every draft of this account, and no other's. */
export function clearAccountDrafts(uid: string): void {
  clearCreationDraft(uid);
  try {
    const prefixes = [levelUpPrefix(uid), rescuePrefix(uid)];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

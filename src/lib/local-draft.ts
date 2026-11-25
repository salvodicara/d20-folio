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

/** Sign-out: every draft of this account, and no other's. */
export function clearAccountDrafts(uid: string): void {
  clearCreationDraft(uid);
  try {
    const prefix = levelUpPrefix(uid);
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // Nothing to clear when storage is blocked.
  }
}

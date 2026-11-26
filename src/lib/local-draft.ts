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
  /** Which part was unsaved: the build only (a refused or traced build save — its play
   *  state is not newer than the server's), or the whole sheet (unsaved play edits too).
   *  Absent reads as "all" (the copy holds a whole sheet). */
  part?: "build" | "all";
  /** The generation the lost write was sent at (#1276): a stored sheet at or past it
   *  shows the write landed after all, and the copy is dropped. */
  revision?: number;
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

const rescueListeners = new Set<() => void>();

/** Called when a rescue copy is kept or dropped in this tab: an open banner re-reads. */
export function subscribeRescueCopies(listener: () => void): () => void {
  rescueListeners.add(listener);
  return () => rescueListeners.delete(listener);
}

function rescueChanged(): void {
  for (const listener of rescueListeners) listener();
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
  } catch {
    return false;
  }
  rescueChanged();
  return true;
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
  rescueChanged();
}

/**
 * The last build save that left this tab and has not been acknowledged yet (#1320).
 * Firestore keeps its own offline queue, but a tab that opens again ONLINE sends that
 * queue before any listener can see it: if the server refuses it (a newer shape), the
 * edit is gone without a trace. This copy is the trace. Written when a build save
 * leaves, removed when the server acknowledges it or a stored sheet at or past its
 * generation shows it landed; the shape gate rescues it.
 */
export interface UnackedSave {
  character: unknown;
  session: unknown;
  /** The generation it was sent at: a stored sheet at or past it has taken it. */
  revision: number;
  /** When it was sent (compared with the play trace's time). */
  at?: number;
  /** A whole-sheet write (a level-up, its undo, #1276): build AND play state. */
  whole?: boolean;
}
const unackedPrefix = (uid: string) => `folio.unacked.${uid}.`;
const unackedKey = (uid: string, characterId: string) =>
  `${unackedPrefix(uid)}${characterId}`;

export function keepUnackedSave(
  uid: string,
  characterId: string,
  save: UnackedSave
): void {
  write(unackedKey(uid, characterId), save);
}

export function readUnackedSave(uid: string, characterId: string): UnackedSave | null {
  const stored = read(unackedKey(uid, characterId));
  if (typeof stored !== "object" || stored === null) return null;
  const s = stored as Record<string, unknown>;
  return "character" in s && "session" in s && typeof s.revision === "number"
    ? {
        character: s.character,
        session: s.session,
        revision: s.revision,
        ...(typeof s.at === "number" ? { at: s.at } : {}),
        ...(s.whole === true ? { whole: true } : {}),
      }
    : null;
}

export function dropUnackedSave(uid: string, characterId: string): void {
  remove(unackedKey(uid, characterId));
}

/**
 * The last PLAY write that left this tab and has not been acknowledged yet (#1320):
 * the whole sheet at that moment (play edits are whole-sheet facts). Same reason as
 * {@link UnackedSave}: a reopened tab sends the queued play patch before any listener
 * sees it, and after a play-shape migration the fence refuses it. Removed when the
 * write is acknowledged, or when a server play state equal to it shows it landed.
 */
export interface UnackedPlay {
  character: unknown;
  session: unknown;
  /** When it was sent (the later of the two traces is the newer sheet). */
  at: number;
}
const unackedPlayPrefix = (uid: string) => `folio.unackedPlay.${uid}.`;
const unackedPlayKey = (uid: string, characterId: string) =>
  `${unackedPlayPrefix(uid)}${characterId}`;

export function keepUnackedPlay(
  uid: string,
  characterId: string,
  play: UnackedPlay
): void {
  write(unackedPlayKey(uid, characterId), play);
}

export function readUnackedPlay(uid: string, characterId: string): UnackedPlay | null {
  const stored = read(unackedPlayKey(uid, characterId));
  if (typeof stored !== "object" || stored === null) return null;
  const s = stored as Record<string, unknown>;
  return "character" in s && "session" in s && typeof s.at === "number"
    ? { character: s.character, session: s.session, at: s.at }
    : null;
}

export function dropUnackedPlay(uid: string, characterId: string): void {
  remove(unackedPlayKey(uid, characterId));
}

/** Sign-out: every draft of this account, and no other's. */
export function clearAccountDrafts(uid: string): void {
  clearCreationDraft(uid);
  try {
    const prefixes = [
      levelUpPrefix(uid),
      rescuePrefix(uid),
      unackedPrefix(uid),
      unackedPlayPrefix(uid),
    ];
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

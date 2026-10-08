import type { LogItem, PlayEvent } from "./types";

/** The newest session of a table: its id and when its last item was appended. */
export interface SessionHead {
  id: string;
  lastAt: number;
}

/**
 * Where session logs live. Two adapters: Firestore (`session-log-io.ts`, one document per
 * session appended with `arrayUnion`) and memory (tests). Appends must preserve send order.
 */
export interface SessionLogStore {
  latest(): Promise<SessionHead | null>;
  /** The newest sessions first, with their items (a one-shot read). */
  recent(limit: number): Promise<Array<SessionHead & { items: LogItem[] }>>;
  append(sessionId: string, item: LogItem): Promise<void>;
  subscribe(
    sessionId: string,
    onItems: (items: LogItem[]) => void,
    onError?: (error: unknown) => void
  ): () => void;
}

/** A session closes by itself after this much silence; the next gesture opens a new one. */
export const SESSION_GAP_MS = 6 * 60 * 60 * 1000;

function localDay(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The session a gesture at `now` belongs to: the open one, or a new one named after the
 *  local day (`2026-10-08`, then `2026-10-08-2` for a second session that day). Every
 *  device computes the same id, so two first gestures land in the same document. */
export function nextSessionId(head: SessionHead | null, now: Date): string {
  if (head && now.getTime() - head.lastAt < SESSION_GAP_MS) return head.id;
  const day = localDay(now);
  if (!head || !head.id.startsWith(day)) return day;
  const n = Number(head.id.slice(day.length + 1)) || 1;
  return `${day}-${n + 1}`;
}

/** `id` lets a caller derive a deterministic item id (idempotent re-recording). */
interface ItemOptions {
  id?: string;
}

export interface SessionRecorder {
  /** Record a gesture; returns its id so it can be corrected or retracted later. */
  record(event: PlayEvent, options?: ItemOptions): Promise<string>;
  correct(target: string, event: PlayEvent, options?: ItemOptions): Promise<string>;
  retract(target: string, options?: ItemOptions): Promise<string>;
}

type Draft =
  | { type: "event"; event: PlayEvent }
  | { type: "correct"; target: string; event: PlayEvent }
  | { type: "retract"; target: string };

export function createSessionRecorder(deps: {
  store: SessionLogStore;
  uid: string;
  now?: () => Date;
  newId?: () => string;
}): SessionRecorder {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const append = async (draft: Draft, options?: ItemOptions): Promise<string> => {
    const at = now();
    const sessionId = nextSessionId(await deps.store.latest(), at);
    const id = options?.id ?? newId();
    const item: LogItem = { ...draft, id, by: deps.uid, at: at.getTime() };
    await deps.store.append(sessionId, item);
    return item.id;
  };
  return {
    record: (event, options) => append({ type: "event", event }, options),
    correct: (target, event, options) =>
      append({ type: "correct", target, event }, options),
    retract: (target, options) => append({ type: "retract", target }, options),
  };
}

/** In-memory adapter: the reference behaviour the Firestore adapter must match. */
export function createMemorySessionLogStore(): SessionLogStore & {
  items(sessionId: string): LogItem[];
} {
  const logs = new Map<string, { items: LogItem[]; lastAt: number }>();
  const listeners = new Map<string, Set<(items: LogItem[]) => void>>();
  return {
    latest() {
      let head: SessionHead | null = null;
      for (const [id, log] of logs) {
        if (!head || log.lastAt >= head.lastAt) head = { id, lastAt: log.lastAt };
      }
      return Promise.resolve(head);
    },
    recent(limit) {
      const heads = [...logs].map(([id, log]) => ({
        id,
        lastAt: log.lastAt,
        items: [...log.items],
      }));
      heads.sort((a, b) => b.lastAt - a.lastAt);
      return Promise.resolve(heads.slice(0, limit));
    },
    append(sessionId, item) {
      const log = logs.get(sessionId) ?? { items: [], lastAt: 0 };
      if (!log.items.some((existing) => existing.id === item.id)) log.items.push(item);
      log.lastAt = Math.max(log.lastAt, item.at);
      logs.set(sessionId, log);
      for (const listener of listeners.get(sessionId) ?? []) listener([...log.items]);
      return Promise.resolve();
    },
    subscribe(sessionId, onItems) {
      const set = listeners.get(sessionId) ?? new Set();
      set.add(onItems);
      listeners.set(sessionId, set);
      onItems([...(logs.get(sessionId)?.items ?? [])]);
      return () => set.delete(onItems);
    },
    items: (sessionId) => [...(logs.get(sessionId)?.items ?? [])],
  };
}

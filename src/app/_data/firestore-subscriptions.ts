/**
 * firestore-subscriptions — THE single Firestore real-time listener abstraction
 * (ARCHITECTURE.md — ARCHITECTURE.md (free-tier NFR) → "on-demand, scoped, detachable
 * listeners only").
 *
 * Every Firestore listener in the app — the character subscription and all new
 * campaign / compendium subscriptions — is meant to flow through this ONE hook so
 * the free-tier discipline lives in a single place and can never silently rot:
 *
 *   • a listener opens ONLY when both an owner uid AND a document id are present;
 *   • exactly ONE listener is bound to one document at a time;
 *   • it DETACHES on unmount and RE-SUBSCRIBES when the document id changes — no
 *     background subscription survives an inactive route (the leak the Phase-5
 *     gate forbids);
 *   • on teardown the pending debounced write is FLUSHED first (so an edit made
 *     inside the ~2 s debounce window is never lost on navigate-away / tab close)
 *     and ONLY THEN is the listener detached;
 *   • an incoming server snapshot is applied behind a loop guard so it can never
 *     echo back out as a save (the classic snapshot → save → snapshot loop);
 *   • `DEV_BYPASS_AUTH` opens no real listener at all.
 *
 * It is deliberately generic and Firebase-free: the caller injects the
 * document-specific `subscribe` / `createSave` boundary (a thin wrapper over
 * `firebase/firestore`) and the store-specific `applySnapshot` / `selectSave`
 * wiring. `useCharacterSubscription` predates this module and is a faithful
 * hand-rolled instance of the same discipline; routing it through here is a
 * tracked follow-up — it carries bespoke extras (IndexedDB log restore,
 * mock-character dev load) and sits on the most-used surface, so it is not
 * migrated in the same change that introduces the abstraction.
 */

import { useCallback, useEffect, useRef } from "react";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";

/** A debounced writer bound to one document: schedule writes, flush on demand. */
export interface DebouncedWriter<T> {
  /** Schedule a debounced write of the latest payload (coalesces rapid edits). */
  save: (data: T) => void;
  /**
   * Write the latest pending payload immediately and resolve when it completes.
   * Safe to call with nothing pending (resolves immediately).
   */
  flush: () => Promise<void>;
}

/**
 * Build a debounced writer around an async `write`. Mirrors the proven character
 * `createDebouncedSave` discipline: coalesce rapid edits within `delayMs`, and
 * `flush()` writes the latest pending payload now. A failed write is swallowed
 * (logged, never an unhandled rejection) — last-write-wins means the next edit
 * re-attempts it anyway.
 */
export function createDebouncedWriter<T>(
  write: (data: T) => Promise<void>,
  delayMs = 2000
): DebouncedWriter<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;
  let inflight: Promise<void> = Promise.resolve();

  function run(data: T): Promise<void> {
    return write(data).catch((err: unknown) => {
      console.error("Debounced Firestore write failed", err);
    });
  }

  return {
    save(data) {
      if (timer) clearTimeout(timer);
      pending = data;
      timer = setTimeout(() => {
        const payload = pending;
        pending = null;
        timer = null;
        if (payload !== null) inflight = run(payload);
      }, delayMs);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      const payload = pending;
      pending = null;
      if (payload !== null) inflight = run(payload);
      return inflight;
    },
  };
}

/**
 * Configuration for {@link useDocumentSubscription}. The hook owns the listener
 * lifecycle, the loop guard, the debounced-writer handle, and the flush-on-close
 * behaviour; the caller injects the document-specific + store-specific wiring.
 *
 * @typeParam TDoc   - the document shape delivered by the listener
 * @typeParam TState - the backing store's state shape
 * @typeParam TSave  - the payload shape persisted by the debounced writer
 */
export interface DocumentSubscriptionConfig<TDoc, TState, TSave> {
  /** Owner uid — the listener opens ONLY when this AND `docId` are present. */
  uid: string | undefined;
  /** Document id — the listener opens only when present; re-subscribes on change. */
  docId: string | undefined;
  /** Open exactly ONE realtime listener for (uid, docId). Returns its unsubscribe. */
  subscribe: (
    uid: string,
    docId: string,
    onData: (doc: TDoc | null) => void,
    onError: (err: Error) => void
  ) => () => void;
  /**
   * Build the debounced writer bound to this one document. OPTIONAL: a READ-ONLY
   * subscription (one whose local edits persist through a dedicated atomic path,
   * not this debounced writer — the chronicle) omits it, along with `selectSave` /
   * `storeSubscribe`, and no writer is created.
   */
  createSave?: (uid: string, docId: string) => DebouncedWriter<TSave>;
  /**
   * Apply an incoming server snapshot (a document, or `null` = "not found") to
   * the store. Always runs INSIDE the loop guard, so it must never itself try to
   * persist — it only writes store state.
   */
  applySnapshot: (doc: TDoc | null) => void;
  /**
   * Quietly clear store state — used on teardown and when not subscribed (no
   * uid / docId). Must NOT trigger a save.
   */
  reset: () => void;
  /** Optional: called right before a listener is (re)opened — e.g. set loading. */
  onSubscribeStart?: () => void;
  /** Optional: surface a listener error (permission denied / offline). */
  onError?: (err: Error) => void;
  /**
   * Subscribe to the backing store (e.g. `useXStore.subscribe`). The hook routes
   * each transition to the autosave path behind the loop guard. MUST be a stable
   * reference (a store's `.subscribe` is) so the autosave is wired exactly once.
   * OPTIONAL — paired with `selectSave`; a read-only subscription omits both.
   */
  storeSubscribe?: (listener: (state: TState, prev: TState) => void) => () => void;
  /**
   * Pure: given a store transition, return the payload to persist, or `null` to
   * skip (no relevant change). MUST be a stable reference. OPTIONAL — a read-only
   * subscription (no debounced writer) omits it and the autosave path is inert.
   */
  selectSave?: (state: TState, prev: TState) => TSave | null;
  /** Optional: dev-bypass loader — called instead of opening any real listener. */
  loadDevBypass?: () => void;
}

/**
 * The single Firestore-listener hook (§7.1). See the module header for the full
 * discipline. All callbacks in `config` (other than `uid` / `docId`) MUST be
 * stable references — pass store actions or `useCallback`-wrapped closures — so
 * the listener is not torn down and re-opened on every render.
 */
export function useDocumentSubscription<TDoc, TState, TSave>(
  config: DocumentSubscriptionConfig<TDoc, TState, TSave>
): void {
  const {
    uid,
    docId,
    subscribe,
    createSave,
    applySnapshot,
    reset,
    onSubscribeStart,
    onError,
    storeSubscribe,
    selectSave,
    loadDevBypass,
  } = config;

  const writerRef = useRef<DebouncedWriter<TSave> | null>(null);
  /** True only while a server snapshot is being applied — see the loop guard. */
  const isFromServerRef = useRef(false);

  /** Flush whatever the live writer has pending (used by teardown + page close). */
  const flushPending = useCallback(() => {
    const writer = writerRef.current;
    if (writer) void writer.flush();
  }, []);

  // ── Listener + writer lifecycle ────────────────────────────────────────────
  useEffect(() => {
    if (DEV_BYPASS_AUTH) {
      // Dev bypass opens NO real listener.
      loadDevBypass?.();
      return;
    }
    if (!uid || !docId) {
      reset();
      return;
    }

    onSubscribeStart?.();
    writerRef.current = createSave ? createSave(uid, docId) : null;

    const unsubscribe = subscribe(
      uid,
      docId,
      (doc) => {
        // Loop guard: applying a server snapshot must NOT be seen as a local
        // edit by the autosave subscriber — else snapshot → save → snapshot.
        isFromServerRef.current = true;
        applySnapshot(doc);
        isFromServerRef.current = false;
      },
      (err) => {
        onError?.(err);
      }
    );

    return () => {
      // 1. Flush the pending debounced write FIRST — an edit made inside the
      //    debounce window must survive navigate-away / unmount.
      flushPending();
      // 2. Detach the single listener — no background subscription survives.
      unsubscribe();
      // 3. Drop the writer + clear store state quietly.
      writerRef.current = null;
      reset();
    };
  }, [
    uid,
    docId,
    subscribe,
    createSave,
    applySnapshot,
    reset,
    onSubscribeStart,
    onError,
    loadDevBypass,
    flushPending,
  ]);

  // ── Autosave: a LOCAL store change → debounced write (guarded) ─────────────
  // Inert for a read-only subscription (no `storeSubscribe` / `selectSave`).
  useEffect(() => {
    if (!storeSubscribe || !selectSave) return;
    return storeSubscribe((state, prev) => {
      if (isFromServerRef.current) return; // server-sourced → skip (loop guard)
      if (DEV_BYPASS_AUTH) return; // no real persistence in dev bypass
      const payload = selectSave(state, prev);
      if (payload !== null && writerRef.current) writerRef.current.save(payload);
    });
  }, [storeSubscribe, selectSave]);

  // ── Flush on tab close / reload / navigate-away ────────────────────────────
  // `pagehide` fires more reliably than `beforeunload` on mobile Safari.
  useEffect(() => {
    window.addEventListener("pagehide", flushPending);
    window.addEventListener("beforeunload", flushPending);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      window.removeEventListener("beforeunload", flushPending);
    };
  }, [flushPending]);
}

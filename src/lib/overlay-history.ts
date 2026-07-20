/**
 * overlay-history — the ONE mechanism that makes the hardware / gesture Back
 * button (and desktop Alt-←) close an open overlay instead of leaving the page.
 *
 * When an overlay opens it pushes a sentinel history entry that CLONES the
 * current `history.state` (so React Router — which keys locations by
 * `history.state.key` — sees NO location change and never re-renders the route).
 * A single popstate listener consumes that entry on Back and closes the topmost
 * overlay. Closing the overlay any other way (Esc / scrim / a close button)
 * removes the sentinel with one silent `history.back()` so the forward stack
 * never accumulates dead entries.
 *
 * Stacking is LIFO: each open overlay tier owns one entry, so Back peels tiers
 * one at a time. This is the SHARED primitive behind `useOverlayBack` — every
 * ModalShell / Dialog / lightbox inherits it; no overlay hand-rolls its own.
 *
 * THE SERIALIZATION INVARIANT: a sentinel-retiring `history.back()` is an ASYNC
 * traversal, and any history mutation issued while it is in flight is destroyed
 * when it lands — a `pushState` (a navigation, or a NEW overlay's sentinel) gets
 * rewound right back off (the mobile palette-tap "did nothing" bug; hardware
 * Back exiting the page instead of closing a freshly raised sheet — including
 * via StrictMode's setup→cleanup→setup remount, whose second sentinel push used
 * to land inside its own cleanup's in-flight back()). So EVERY history mutation
 * this module performs — and every caller-supplied continuation — is queued
 * behind the pending traversal and flushed on its popstate, the traversal's one
 * deterministic completion signal. Nothing here ever touches history on a
 * wall-clock guess.
 */

interface OverlayEntry {
  id: number;
  close: () => void;
}

let stack: OverlayEntry[] = [];
let nextId = 1;
/** True while OUR sentinel-retiring `history.back()` traversal is in flight. */
let retireInFlight = false;
/** Ops serialized behind the in-flight traversal, flushed on its popstate. */
let afterRetire: (() => void)[] = [];
let listening = false;

/**
 * SELF-HEALING WATCHDOG — the pending fallback timer armed alongside `retireInFlight`.
 *
 * `retireInFlight` is cleared ONLY by the traversal's popstate (`handlePop`). If that
 * popstate is ever MISSED — a backgrounded/frozen tab, a browser that coalesces or drops
 * a same-document traversal — the flag would stick true forever and `runAfterRetire`
 * would queue every later overlay op into `afterRetire` with nothing to ever flush it:
 * the palette / Back deadlock only a page refresh cleared. This timer is the deterministic
 * recovery: if it still finds `retireInFlight` true when it fires, it does EXACTLY what the
 * missed `handlePop` would have — clears the flag and drains the queue. The real popstate
 * cancels it (`handlePop` clears the ref), so the healthy path is byte-for-byte unchanged
 * and there is never a double-flush. Tuned so a normal traversal (sub-frame) always wins.
 */
let retireWatchdog: ReturnType<typeof setTimeout> | null = null;
/** Watchdog interval — an order of magnitude beyond any real traversal, so only a
 *  genuinely dropped/coalesced popstate (never a merely slow one) ever trips it. */
const RETIRE_WATCHDOG_MS = 1000;

/** Cancel any pending watchdog (the popstate landed, or the singleton is resetting). */
function cancelRetireWatchdog(): void {
  if (retireWatchdog !== null) {
    clearTimeout(retireWatchdog);
    retireWatchdog = null;
  }
}

/**
 * Set `retireInFlight` and arm the self-healing watchdog — the ONE seam both
 * traversal-starting sites route through, so a missed popstate can never strand the
 * queue. Idempotent: a fresh call cancels the prior pending timer first (there is only
 * ever one traversal in flight, so only one watchdog is ever pending).
 */
function beginRetire(): void {
  retireInFlight = true;
  if (typeof window === "undefined") return;
  cancelRetireWatchdog();
  retireWatchdog = setTimeout(() => {
    retireWatchdog = null;
    if (!retireInFlight) return; // a popstate already landed and drained — nothing to heal
    // The traversal's popstate was missed — do exactly what `handlePop` would have.
    retireInFlight = false;
    flushAfterRetire();
  }, RETIRE_WATCHDOG_MS);
}

/** Run `op` now — or, if a retirement traversal is in flight, once it lands. */
function runAfterRetire(op: () => void): void {
  if (retireInFlight) afterRetire.push(op);
  else op();
}

/**
 * Run the queued ops in order — stopping if one of them starts a NEW traversal
 * (`retireInFlight` flips back on); its own popstate resumes the flush.
 */
function flushAfterRetire(): void {
  try {
    while (!retireInFlight) {
      const op = afterRetire.shift();
      if (op === undefined) break;
      op();
    }
  } finally {
    // A THROWING op (a Safari pushState rate-limit SecurityError, a throwing
    // caller continuation) must not strand the remainder of the queue to
    // replay on a later, UNRELATED traversal. Unless a new traversal now owns
    // the remainder (its popstate resumes the flush), drop it: a dropped
    // sentinel push is harmless (the overlay's cleanup sees `pushed === false`
    // and no-ops), whereas a stale op firing under a different traversal is
    // the bug.
    if (!retireInFlight) afterRetire.length = 0;
  }
}

function handlePop(): void {
  if (retireInFlight) {
    // OUR traversal landed — cancel the self-healing watchdog (the healthy path, so no
    // double-flush), swallow the pop, and flush the ops queued behind it.
    cancelRetireWatchdog();
    retireInFlight = false;
    flushAfterRetire();
    return;
  }
  // A user Back consumed the top sentinel → close the topmost overlay.
  const top = stack.pop();
  if (top) top.close();
}

function ensureListening(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("popstate", handlePop);
}

/**
 * Register an open overlay. Pushes its sentinel entry and returns a cleanup that
 * retires the entry when the overlay closes by any non-Back path. Call once per
 * open (see `useOverlayBack`).
 */
export function pushOverlayEntry(close: () => void): () => void {
  ensureListening();
  const id = nextId++;
  stack.push({ id, close });
  let pushed = false;
  let cancelled = false;
  let href = "";
  // The sentinel push is serialized behind any in-flight retirement (invariant
  // above): a push landing inside that traversal's path would be consumed when
  // it lands — the StrictMode remount signature (setup₂'s push racing cleanup₁'s
  // back()), after which hardware Back exits the page instead of closing.
  runAfterRetire(() => {
    if (cancelled) return; // unmounted before the traversal landed — never existed
    href = window.location.href;
    // Clone the live state so RR's key/idx/usr survive — same location, no re-render.
    window.history.pushState({ ...window.history.state, folioOverlay: id }, "");
    pushed = true;
  });
  return () => {
    const idx = stack.findIndex((e) => e.id === id);
    if (idx === -1) return; // already retired by a Back press — nothing to undo
    stack.splice(idx, 1);
    if (!pushed) {
      // The sentinel never reached the history (its push is still queued behind
      // an in-flight traversal) — cancel the queued push; nothing to rewind.
      cancelled = true;
      return;
    }
    // The retire itself also serializes behind any in-flight traversal, and its
    // guards re-check against the LIVE history at execution time:
    runAfterRetire(() => {
      // Only retire our sentinel if we're STILL on the page that pushed it. If
      // the URL changed, a real navigation buried the sentinel — a `back()` here
      // would undo that navigation, so leave the (harmless, same-key) entry.
      if (window.location.href !== href) return;
      // ROBUSTNESS: only rewind if the LIVE history entry is actually THIS
      // cleanup's sentinel. A remount (React StrictMode / Offscreen / Fast
      // Refresh) or a raced double-retire can leave the browser sitting on a
      // DIFFERENT entry than the one this cleanup means to retire — same URL, so
      // the href guard above passes. A blind `history.back()` then rewinds a
      // REAL page entry and navigates the user off the surface (the
      // dialog-cancel "bounce off the sheet"). The sentinel stamps its
      // `folioOverlay` id into `history.state`; if the current entry doesn't
      // carry OUR id, we are not on our sentinel, so no-op instead of
      // overshooting. Failing toward "don't traverse" is always the safe
      // direction — a stale same-URL sentinel is harmless; a stray navigation is
      // the bug.
      const live = window.history.state as { folioOverlay?: number } | null;
      if (live?.folioOverlay !== id) return;
      beginRetire();
      window.history.back();
    });
  };
}

/**
 * Retire the TOPMOST overlay's sentinel NOW and run `then` once the
 * `history.back()` traversal has actually LANDED (its popstate) — the race-free
 * way to navigate, or to raise ANOTHER overlay, right after closing one.
 *
 * `history.back()` is an async traversal: a `pushState` issued while it is still
 * in flight gets rewound when the traversal finally lands — silently undoing a
 * navigation (the mobile palette-tap bug: a wall-clock deferral like two rAFs
 * races it and LOSES under mobile frame timing) or consuming a freshly raised
 * overlay's own sentinel (hardware Back then exits the page instead of closing
 * it). The popstate is the traversal's one deterministic completion signal, so
 * callers hand their continuation here instead of guessing.
 *
 * The entry is removed from the stack immediately, so the overlay's own cleanup
 * (which runs later, on unmount) finds it already retired and no-ops. This does
 * NOT call the overlay's `close` — the caller drives its own close (it is the
 * overlay acting on itself). If there is no sentinel to retire — or the browser
 * is not sitting on it (already consumed by a user Back, or buried) — there is
 * no new traversal to wait for and `then` runs synchronously (or, behind an
 * already-pending traversal, once that lands).
 */
export function retireTopOverlayThen(then: () => void): void {
  const top = stack[stack.length - 1];
  const live =
    typeof window === "undefined"
      ? null
      : (window.history.state as { folioOverlay?: number } | null);
  if (!top || live?.folioOverlay !== top.id) {
    runAfterRetire(then);
    return;
  }
  stack.pop();
  beginRetire();
  afterRetire.push(then);
  window.history.back();
}

/** Test-only reset of the module singleton. */
export function __resetOverlayHistory(): void {
  stack = [];
  nextId = 1;
  retireInFlight = false;
  afterRetire = [];
  cancelRetireWatchdog();
}

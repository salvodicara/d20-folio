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
 */

interface OverlayEntry {
  id: number;
  close: () => void;
}

let stack: OverlayEntry[] = [];
let nextId = 1;
/** True while WE call `history.back()` to retire a sentinel — swallow that pop. */
let programmaticPop = false;
let listening = false;

function handlePop(): void {
  if (programmaticPop) {
    programmaticPop = false;
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
  const href = window.location.href;
  // Clone the live state so RR's key/idx/usr survive — same location, no re-render.
  window.history.pushState({ ...window.history.state, folioOverlay: id }, "");
  return () => {
    const idx = stack.findIndex((e) => e.id === id);
    if (idx === -1) return; // already retired by a Back press — nothing to undo
    stack.splice(idx, 1);
    // Only retire our sentinel if we're STILL on the page that pushed it. If the
    // URL changed, a real navigation buried the sentinel — a `back()` here would
    // undo that navigation, so leave the (harmless, same-key) entry in place.
    if (window.location.href !== href) return;
    // ROBUSTNESS: only rewind if the LIVE history entry is actually THIS cleanup's
    // sentinel. A setup→cleanup→setup remount (React StrictMode / Offscreen / Fast
    // Refresh) or a raced double-retire can leave the browser sitting on a DIFFERENT
    // entry than the one this cleanup means to retire — same URL, so the href guard
    // above passes. A blind `history.back()` then rewinds a REAL page entry and
    // navigates the user off the surface (the dialog-cancel "bounce off the sheet").
    // The sentinel stamps its `folioOverlay` id into `history.state`; if the current
    // entry doesn't carry OUR id, we are not on our sentinel, so no-op instead of
    // overshooting. Failing toward "don't traverse" is always the safe direction —
    // a stale same-URL sentinel is harmless; a stray navigation is the bug.
    const live = window.history.state as { folioOverlay?: number } | null;
    if (live?.folioOverlay !== id) return;
    programmaticPop = true;
    window.history.back();
  };
}

/** Test-only reset of the module singleton. */
export function __resetOverlayHistory(): void {
  stack = [];
  nextId = 1;
  programmaticPop = false;
}

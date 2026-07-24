/**
 * transitionBackdrop — the app-wide backdrop crossfade (the atmosphere mandate,
 * owner 2026-07-23; DESIGN.md §13 "Per-route backdrop override").
 *
 * `--app-bg-art` is the ONE backdrop seam: the `body::after` painter reads it,
 * and a route swaps it on mount/unmount (useRealmBackdrop / useCampaignBackdrop).
 * A bare var swap HARD-CUTS the whole viewport's art — at the raised presence
 * that cut reads as a flash, off the settling motion grammar. This module makes
 * every swap a CROSSFADE without adding a second painter to the steady state:
 *
 *   1. The FIRST swap in a task snapshots the painter's COMPUTED state (image,
 *      position, transform, filter, mask, opacity — so custom-art veils, crop
 *      focal/zoom, and the light mask dissolve all ride along for free).
 *   2. Every swap in that task applies immediately (mutate) — a route change is
 *      an unmount-clear + mount-set pair, and coalescing on a microtask means
 *      the ghost always shows the PRE-navigation scene, never the intermediate
 *      default (microtasks drain before the next paint, so nothing flashes).
 *   3. At flush, a fixed GHOST div painting the old scene mounts at the
 *      painter's own z-plane; `data-bg-swap` on <html> drops the painter one
 *      plane down (tree order keeps it above the vellum grain), and the ghost
 *      fades out on `--ease-standard`, dissolving the old scene into the new.
 *
 * Reduced motion (`data-motion="reduced"` — the app's OS mirror) keeps the
 * hard cut: the swap applies with no ghost, exactly the pre-crossfade behavior.
 * A swap arriving mid-fade keeps the live ghost (the fade simply reveals the
 * newer scene); scene-identical swaps (remounting the same realm) spawn no
 * ghost at all.
 */

/**
 * The ghost's opacity-fade duration. This is a CROSS-BOUNDARY fact: the actual
 * transition lives in CSS (`.bg-ghost { transition: opacity 480ms … }`,
 * src/index.css) — this constant only mirrors it so the removal fallback can
 * outlast the CSS fade. The two are pinned equal by backdrop-transition.test.ts.
 */
export const FADE_MS = 480;
/** Removal fallback — the fade duration plus a scheduling cushion. */
export const END_MS = FADE_MS + 140;

interface PainterSnapshot {
  backgroundImage: string;
  backgroundPosition: string;
  transformOrigin: string;
  transform: string;
  filter: string;
  maskImage: string;
  opacity: string;
}

let pending: PainterSnapshot | null = null;
let ghost: HTMLDivElement | null = null;
let endTimer: number | undefined;
/**
 * Has the seam ever committed a scene? The FIRST commit is cold-load's initial
 * backdrop set (a realm route mounting on a fresh page) — there the painter's
 * own one-shot `app-bg-fade` entry animation is already running, so a crossfade
 * ghost would DOUBLE the entrance. The first commit therefore spawns no ghost;
 * every subsequent route-to-route change dissolves scene-into-scene.
 */
let committed = false;

function readPainter(): PainterSnapshot {
  const cs = getComputedStyle(document.body, "::after");
  return {
    backgroundImage: cs.backgroundImage,
    backgroundPosition: cs.backgroundPosition,
    transformOrigin: cs.transformOrigin,
    transform: cs.transform,
    filter: cs.filter,
    // Chromium serves the standard property; the -webkit- alias reads the same.
    maskImage: cs.maskImage,
    opacity: cs.opacity,
  };
}

function end(): void {
  window.clearTimeout(endTimer);
  ghost?.remove();
  ghost = null;
  document.documentElement.removeAttribute("data-bg-swap");
}

function flush(): void {
  const snap = pending;
  pending = null;
  if (!snap) return;
  // A ghost already mid-fade keeps fading — it simply reveals the newer scene.
  if (ghost) return;
  const now = readPainter();
  // Scene-identical swap (same plate, same framing) — nothing to dissolve.
  if (
    now.backgroundImage === snap.backgroundImage &&
    now.backgroundPosition === snap.backgroundPosition &&
    now.transform === snap.transform
  ) {
    return;
  }
  // Nothing was painted before (art disabled) — nothing to dissolve.
  if (snap.backgroundImage === "none" || snap.backgroundImage === "") return;

  // First-ever backdrop commit (cold load landing directly on a realm route):
  // the painter's own `app-bg-fade` entry animation is still running, so a ghost
  // here would double the entrance. Skip the crossfade for the first commit only.
  if (!committed) {
    committed = true;
    return;
  }

  ghost = document.createElement("div");
  ghost.className = "bg-ghost";
  ghost.setAttribute("aria-hidden", "true");
  const s = ghost.style;
  s.backgroundImage = snap.backgroundImage;
  s.backgroundPosition = snap.backgroundPosition;
  s.transformOrigin = snap.transformOrigin;
  s.transform = snap.transform;
  s.filter = snap.filter;
  // The standard property covers every supported engine (Chromium 120+,
  // Safari 15.4+); Chromium serializes the computed mask on it directly.
  s.maskImage = snap.maskImage;
  s.opacity = snap.opacity;
  document.body.appendChild(ghost);
  document.documentElement.setAttribute("data-bg-swap", "");
  // Commit the starting opacity, then fade — the transition lives in .bg-ghost.
  void ghost.offsetWidth;
  s.opacity = "0";
  ghost.addEventListener("transitionend", end, { once: true });
  endTimer = window.setTimeout(end, END_MS);
}

/**
 * Apply a backdrop mutation (a `--app-bg-art` / focal / zoom write on the
 * document root) as a crossfade. Every backdrop-swapping seam routes through
 * here so route changes dissolve scene-into-scene instead of hard-cutting.
 */
export function transitionBackdrop(mutate: () => void): void {
  if (
    typeof document === "undefined" ||
    document.documentElement.dataset.motion === "reduced"
  ) {
    mutate();
    return;
  }
  if (!pending) {
    pending = readPainter();
    queueMicrotask(flush);
  }
  mutate();
}

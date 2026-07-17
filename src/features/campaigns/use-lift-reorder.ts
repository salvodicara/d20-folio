/**
 * use-lift-reorder — the LIFT-&-FOLLOW drag-reorder mechanic for the encounter combat
 * list, built on POINTER EVENTS (one code path for mouse + touch + pen — HTML5 native
 * `draggable` never fires on touch) with NO new dependency.
 *
 * The feel (owner's confirmed prototype, "Panel A — Lift & follow"):
 *   • Press the grip → the grabbed card LIFTS into a floating, gilt-ringed clone that
 *     FOLLOWS the pointer; its original slot stays as a faded GAP placeholder so the
 *     list never collapses.
 *   • As the pointer crosses the OTHER cards' vertical midpoints the preview order
 *     updates and those cards FLIP-slide apart to open the landing slot — React state
 *     drives the order (keyed rows MOVE, never remount); a FLIP transform animates the
 *     visual delta. The list is never DOM-reordered by hand.
 *   • Release → the clone glides into the open slot, then the new order COMMITS through
 *     `onCommit` (the existing DM-only `reorderCombatant` transaction). A drop-in-place is
 *     a no-op (the reducer guards it).
 *
 * RE-RENDER-PROOF EVENT WIRING (the freeze fix): the live pointer stream (move / up /
 * cancel) is listened for on `document`, NOT on the grip's React handlers. The grip only
 * STARTS the drag (`onGripPointerDown`); from then on `startDrag` attaches imperative
 * `document` listeners that read ONLY refs and write the clone position directly. This is
 * what makes the follow survive a React re-render AND a DOM move: every preview reorder
 * repositions the lifted `<li>` (which holds the grip) via `insertBefore`, and moving the
 * capturing element in the DOM makes some engines implicitly fire `lostpointercapture` —
 * after which the grip stops receiving `pointermove`, freezing the clone. Document
 * listeners never detach when the card moves/re-renders and still receive the bubbling
 * pointer stream with or without capture, so the clone follows `clientY` unconditionally.
 * `setPointerCapture` is kept purely as a TOUCH nicety (it lets `touch-action: none` on
 * the grip suppress page scroll for the gesture); the drag no longer DEPENDS on it.
 *
 * The floating clone is a transient VISUAL snapshot (`cloneNode`) positioned imperatively
 * — kept OUT of React so the pointer-follow never re-renders the heavy combatant cards
 * (only the few real order changes do). The real card stays mounted in the list as the
 * gap, so a card's live subscription / disclosure state is never torn down mid-drag.
 *
 * The card elements are found by querying the list (`data-combatant-id`), never held in a
 * tracked ref — so the inline-style writes the FLIP needs stay React-Compiler-safe
 * (mutate only nodes captured from a null-initial ref, never a ref read in render).
 *
 * Reduced motion (`prefers-reduced-motion`): the FLIP slide is skipped (cards snap to
 * their new slots) and the lift is minimized (no scale / landing animation) — still fully
 * functional, just without the motion. The grip's ArrowUp/ArrowDown keyboard reorder
 * (WCAG 2.1.1 — drag is never the ONLY path) lives in the caller and is unaffected.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/** The FLIP / clone-landing timing — a single short ease shared by both. */
const FLIP_MS = 190;
const FLIP_EASE = "cubic-bezier(.2, .8, .2, 1)";

/** Does the OS ask for reduced motion? Read live (cheap) at each interaction edge. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Snapshot the list's cards into an id→element map (cards carry `data-combatant-id`).
 *  Queried fresh each time, so the elements are never stored in a tracked ref. */
function collectCards(list: HTMLElement | null): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  if (!list) return map;
  for (const el of list.querySelectorAll<HTMLElement>("[data-combatant-id]")) {
    const id = el.dataset.combatantId;
    if (id) map.set(id, el);
  }
  return map;
}

/** The per-row pointer-drag props the grip spreads on. Only the START lives on the grip;
 *  the live move/up/cancel stream is owned by `document` listeners (see the module note),
 *  so the follow survives the FLIP re-renders. The keyboard reorder (`onMoveUp` /
 *  `onMoveDown`) is supplied separately by the caller. */
export interface LiftReorderRow {
  /** This row is the one being held — its card renders as the faded gap placeholder. */
  isLifted: boolean;
  onGripPointerDown: (e: ReactPointerEvent) => void;
}

export interface UseLiftReorder {
  /** Attach to the combatant `<ul>` — the drag queries it for `data-combatant-id` cards. */
  listRef: RefObject<HTMLUListElement | null>;
  /** The combatant ids in current DISPLAY order — the live preview while dragging, else
   *  the input `ids`. The caller sorts its rows by this. */
  order: string[];
  /** Build the pointer-drag props for one row. */
  row: (id: string) => LiftReorderRow;
}

/** The live-drag scratch — held in a NULL-initial ref so its contents (the clone node,
 *  the FLIP "before" tops) are freely mutable without tripping React-Compiler immutability. */
interface DragState {
  id: string;
  pointerId: number;
  grabOffsetY: number;
  base: string[];
  prevTops: Map<string, number>;
}

/**
 * The lift-&-follow reorder engine. `ids` is the natural display order (the frozen turn
 * order, visible rows); `enabled` gates the whole interaction (DM + turns-begun only);
 * `onCommit(movedId, beforeId)` persists a settled drop (insert-before-id semantics,
 * `null` = to the end — exactly the existing `reorderCombatant` contract).
 */
export function useLiftReorder(opts: {
  ids: string[];
  enabled: boolean;
  onCommit: (movedId: string, beforeId: string | null) => void;
}): UseLiftReorder {
  const { ids, enabled, onCommit } = opts;

  // The lifted row + the live preview order (null = idle → display the natural `ids`).
  const [liftedId, setLiftedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);

  const listRef = useRef<HTMLUListElement>(null);
  const previewRef = useRef<string[] | null>(null);
  const drag = useRef<DragState | null>(null);
  // The floating clone — held in its OWN ref so it survives past the drop (it animates in
  // for ~190ms after the drag state is cleared) and is always reachable for teardown.
  const cloneRef = useRef<HTMLElement | null>(null);
  const landTimer = useRef<number | null>(null);
  // Detaches the active drag's `document` listeners — set by `startDrag`, called on settle
  // and on unmount. A no-op until a drag begins (and after it ends).
  const stopRef = useRef<() => void>(() => {});
  // The LATEST `onCommit`, mirrored through a ref so the settle (a `document` listener
  // bound once at drag start) never fires a STALE commit if the caller re-creates the
  // callback mid-drag (every preview reorder re-renders the caller).
  const onCommitRef = useRef(onCommit);
  useLayoutEffect(() => {
    onCommitRef.current = onCommit;
  });

  const order = preview ?? ids;

  /** The preview order with the lifted id inserted before the first OTHER card whose
   *  vertical midpoint is below the pointer (else appended). The non-lifted cards keep
   *  their stable relative order — only the lifted id moves. */
  const computeOrder = useCallback((clientY: number, d: DragState): string[] => {
    const cards = collectCards(listRef.current);
    const others = d.base.filter((id) => id !== d.id);
    let at = others.length;
    for (let i = 0; i < others.length; i++) {
      const otherId = others[i];
      if (otherId === undefined) continue;
      const el = cards.get(otherId);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        at = i;
        break;
      }
    }
    return [...others.slice(0, at), d.id, ...others.slice(at)];
  }, []);

  // The live pointer-follow — a STABLE `document` listener (reads only refs). Repositions
  // the floating clone every move and, when the pointer crosses a midpoint, recomputes the
  // preview order (FLIP-sliding the other cards). Immune to React re-renders + DOM moves.
  const moveDrag = useCallback(
    (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      // Follow the pointer imperatively — no React render for the held card.
      if (cloneRef.current) cloneRef.current.style.top = `${e.clientY - d.grabOffsetY}px`;
      const next = computeOrder(e.clientY, d);
      const cur = previewRef.current ?? d.base;
      if (cur.length === next.length && cur.every((id, i) => id === next[i])) return;
      // FLIP "before": snapshot every card's current top (DOM is still the old order
      // until the re-render commits `next`).
      const tops = d.prevTops;
      tops.clear();
      for (const [id, el] of collectCards(listRef.current))
        tops.set(id, el.getBoundingClientRect().top);
      previewRef.current = next;
      setPreview(next);
    },
    [computeOrder]
  );

  // Settle a drag — STABLE `document` listener for both pointerup (a real drop) and
  // pointercancel (a genuine system cancel; the move-follow survives capture-loss on its
  // own, so only a true cancel ends the drag here). Detaches the listeners first, glides
  // the clone home, then commits the settled order.
  const endDrag = useCallback((e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    drag.current = null;
    stopRef.current();
    stopRef.current = () => {};

    const finalOrder = previewRef.current ?? d.base;
    const idx = finalOrder.indexOf(d.id);
    const beforeId = idx >= 0 ? (finalOrder[idx + 1] ?? null) : null;

    const clone = cloneRef.current;
    const land = () => {
      landTimer.current = null;
      cloneRef.current?.remove();
      cloneRef.current = null;
      previewRef.current = null;
      setPreview(null);
      setLiftedId(null);
      // Clear any residual FLIP transforms so a later non-drag render is clean.
      for (const el of collectCards(listRef.current).values()) {
        el.style.transition = "";
        el.style.transform = "";
      }
    };

    const gapEl = collectCards(listRef.current).get(d.id);
    if (clone && gapEl && !prefersReducedMotion()) {
      // Glide the clone into the open slot, then drop it + un-fade the real card.
      const r = gapEl.getBoundingClientRect();
      clone.style.transition = `top ${FLIP_MS}ms ${FLIP_EASE}, left ${FLIP_MS}ms ${FLIP_EASE}, transform ${FLIP_MS}ms ${FLIP_EASE}, box-shadow ${FLIP_MS}ms ${FLIP_EASE}`;
      clone.style.top = `${r.top}px`;
      clone.style.left = `${r.left}px`;
      clone.classList.add("combatant-lift-landing");
      landTimer.current = window.setTimeout(land, FLIP_MS + 20);
    } else {
      land();
    }

    // Commit the settled order (idempotent — a drop-in-place is a reducer no-op). Read the
    // LATEST commit via the ref so a callback re-created mid-drag is never stale.
    onCommitRef.current(d.id, beforeId);
  }, []);

  const startDrag = useCallback(
    (id: string, e: ReactPointerEvent) => {
      if (!enabled || e.button !== 0 || drag.current) return;
      const el = collectCards(listRef.current).get(id);
      if (!el) return;
      e.preventDefault();
      if (landTimer.current != null) {
        clearTimeout(landTimer.current);
        landTimer.current = null;
      }
      const rect = el.getBoundingClientRect();
      // The floating clone — a static snapshot lifted off the list, positioned imperatively.
      const clone = el.cloneNode(true) as HTMLElement;
      clone.classList.add("combatant-lift-clone");
      clone.removeAttribute("data-lifted");
      clone.removeAttribute("data-combatant-id");
      clone.style.position = "fixed";
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.width = `${rect.width}px`;
      clone.style.margin = "0";
      document.body.appendChild(clone);
      cloneRef.current = clone;
      // A TOUCH nicety only: capture + the grip's `touch-action: none` suppress page scroll
      // for the gesture. Event DELIVERY no longer depends on it (the `document` listeners
      // below own the live stream), so a capture loss mid-drag never freezes the follow.
      const grip = e.currentTarget as HTMLElement;
      try {
        grip.setPointerCapture(e.pointerId);
      } catch {
        /* jsdom / unsupported — capture is a nicety; the document listeners still fire */
      }
      drag.current = {
        id,
        pointerId: e.pointerId,
        grabOffsetY: e.clientY - rect.top,
        base: ids,
        prevTops: new Map(),
      };
      // Own the live pointer stream on `document` — survives the lifted card moving in the
      // DOM (insertBefore on every preview reorder) and any `lostpointercapture` it causes.
      document.addEventListener("pointermove", moveDrag);
      document.addEventListener("pointerup", endDrag);
      document.addEventListener("pointercancel", endDrag);
      stopRef.current = () => {
        document.removeEventListener("pointermove", moveDrag);
        document.removeEventListener("pointerup", endDrag);
        document.removeEventListener("pointercancel", endDrag);
      };
      previewRef.current = ids;
      setLiftedId(id);
      setPreview(ids);
    },
    [enabled, ids, moveDrag, endDrag]
  );

  // FLIP: after the preview commits the new DOM order, slide every NON-lifted card from
  // its "before" top to its new one. The lifted card (the gap) is excluded — it snaps to
  // its preview slot instantly while the clone floats (the prototype's feel).
  useLayoutEffect(() => {
    const d = drag.current;
    if (d === null || liftedId === null || prefersReducedMotion()) return;
    for (const [id, el] of collectCards(listRef.current)) {
      if (id === liftedId) continue;
      const prev = d.prevTops.get(id);
      if (prev === undefined) continue;
      const newTop = el.getBoundingClientRect().top;
      const dy = prev - newTop;
      if (dy === 0) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight; // reflow so the start frame sticks
      el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASE}`;
      el.style.transform = "";
    }
  }, [order, liftedId]);

  // Tear down a dangling drag (its document listeners), clone, and timer if the list
  // unmounts mid-drag OR during the post-drop landing window (the clone lives on `<body>`,
  // outside React's tree).
  useEffect(
    () => () => {
      stopRef.current();
      stopRef.current = () => {};
      if (landTimer.current != null) clearTimeout(landTimer.current);
      cloneRef.current?.remove();
      cloneRef.current = null;
    },
    []
  );

  const row = useCallback(
    (id: string): LiftReorderRow => ({
      isLifted: liftedId === id,
      onGripPointerDown: (e) => startDrag(id, e),
    }),
    [liftedId, startDrag]
  );

  return { listRef, order, row };
}

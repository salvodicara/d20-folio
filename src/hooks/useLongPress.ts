/**
 * useLongPress — fire a callback when the pointer is held still on an element for
 * a beat, and let the caller swallow the click that follows.
 *
 * The native mobile gesture for "enter selection mode" (iOS Photos / Android): a
 * press-and-hold. Returns pointer handlers to spread on the target plus `consume()`
 * — call it at the top of the element's `onClick` and bail if it returns true, so
 * the tap that ends a long-press doesn't ALSO fire the normal click (navigate /
 * toggle). A drag beyond `moveTolerance` cancels the press (it was a scroll/swipe).
 *
 * React-rules clean: timers + flags live in refs read only inside handlers (never
 * during render); no state, no `Date.now()` in render.
 */

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";

export interface UseLongPressOptions {
  /** Disable the gesture (e.g. once already in selection mode). */
  enabled?: boolean;
  /** Hold duration before it fires (ms). */
  delayMs?: number;
  /** Movement (px) that cancels the press as a drag/scroll. */
  moveTolerance?: number;
}

export interface LongPressHandlers {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}

export function useLongPress(
  onLongPress: () => void,
  { enabled = true, delayMs = 470, moveTolerance = 10 }: UseLongPressOptions = {}
): { handlers: LongPressHandlers; consume: () => boolean } {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  // Never leave a timer running across unmount.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled) return;
      // Primary button only for mouse; touch/pen always count.
      if (e.pointerType === "mouse" && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, delayMs);
    },
    [enabled, delayMs, onLongPress]
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > moveTolerance) clear();
    },
    [clear, moveTolerance]
  );

  const consume = useCallback(() => {
    if (fired.current) {
      fired.current = false;
      return true;
    }
    return false;
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
    consume,
  };
}

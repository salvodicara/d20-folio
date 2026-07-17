/**
 * useCardMenuGuard — the controlled open-state PLUS the no-navigate dismiss guard
 * shared by every `.ch-card` tile (roster characters + campaign cards) that carries
 * a <CardOverflowMenu>. Lives in its own file so the component module only exports
 * components (react-refresh / fast-refresh stays happy).
 *
 * The stretched `.ch-open` button must not navigate on the trailing click that
 * dismisses an open menu. Radix dismisses on `pointerdown` and React re-enables
 * `.ch-open` before the `click`, so `disabled` alone can't stop that trailing
 * click — snapshot "was the menu open when this press started" on the (never-
 * disabled) article in the capture phase, then swallow only the trailing click
 * that lands on `.ch-open`.
 */

import { useRef, useState, type MouseEvent, type RefObject } from "react";

export interface CardMenuGuard {
  /** Controlled menu open state (pass to <CardOverflowMenu open>). */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Attach to the stretched `.ch-open` button so the guard can target it. */
  openBtnRef: RefObject<HTMLButtonElement | null>;
  /** Spread on the `.ch-card` <article>: the capture-phase no-navigate guard. */
  guardProps: {
    onPointerDownCapture: () => void;
    onClickCapture: (e: MouseEvent<HTMLElement>) => void;
  };
}

export function useCardMenuGuard(): CardMenuGuard {
  const [open, setOpen] = useState(false);
  const openBtnRef = useRef<HTMLButtonElement>(null);
  const armedRef = useRef(false);
  return {
    open,
    setOpen,
    openBtnRef,
    guardProps: {
      onPointerDownCapture: () => {
        armedRef.current = open;
      },
      onClickCapture: (e: MouseEvent<HTMLElement>) => {
        if (armedRef.current && openBtnRef.current?.contains(e.target as Node)) {
          // The tail of a dismiss interaction landing on the stretched
          // open-button — swallow it so it can't navigate.
          e.preventDefault();
          e.stopPropagation();
        }
        armedRef.current = false;
      },
    },
  };
}

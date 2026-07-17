/**
 * AutoAnimateHeight — a container that GROWS to fit its content and GLIDES between
 * heights when that content changes, so it never clips AND never jumps.
 *
 * The problem it solves: a region whose content can swap to a different height in
 * place (the Chronicle card toggling its reader for its editor; any expand /
 * collapse) is caught between two bad options — a FIXED height clips/scrolls the
 * content, while a natural height SNAPS and shoves everything below it (the
 * owner-reported "jump"). This gives both: the box is always exactly its content's
 * height (no scroll, no clip), and a height change animates instead of snapping.
 *
 * How (and why it can't glitch): a ResizeObserver watches the CONTENT's natural
 * height. On every real change it reads the wrapper's CURRENT rendered height live
 * off the DOM (never a value cached on a prior React render — the bug that made an
 * earlier FLIP jump intermittently) and transitions the wrapper from that height
 * to the new one, then releases back to `auto`. The content never resizes — only
 * the wrapper clips during the transition — so an inner textarea never reflows
 * mid-animation, and the observer (on the content, not the animated wrapper) can't
 * feed back on itself. Honors the OS prefers-reduced-motion setting: when the
 * user prefers reduced motion it resizes instantly. Drop it around any
 * height-changing region.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";

interface Props {
  className?: string;
  children: ReactNode;
}

const DURATION_MS = 300;

export function AutoAnimateHeight({ className, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const content = contentRef.current;
    if (!wrap || !content) return;

    // `last` is the PREVIOUS content height — the animation's "from". We can't read
    // it live off the wrapper: it's `height: auto`, so by the time the observer
    // fires it has already grown to the new height (reading it then animates
    // next→next = nothing). While a transition is in flight the wrapper IS pinned,
    // so then the live rect is the true interrupt point.
    let last = content.offsetHeight;
    let animating = false;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;

    // While a pointer is held, height changes are a DRAG (resizing an inner
    // textarea, etc.) — follow them INSTANTLY so the box never lags behind the
    // cursor (the "sticky/slow" feel). Only a deliberate, pointer-up change (a
    // toggle, an expand) animates.
    let pointerDown = false;
    const onDown = () => (pointerDown = true);
    const onUp = () => (pointerDown = false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);

    const release = () => {
      wrap.style.height = "";
      wrap.style.transition = "";
      wrap.style.overflow = "";
      animating = false;
    };

    const observer = new ResizeObserver(() => {
      const next = content.offsetHeight;
      const from = animating ? wrap.getBoundingClientRect().height : last;
      last = next;
      if (Math.abs(next - from) < 1) return;

      const reduced =
        pointerDown ||
        (typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      if (reduced) {
        if (releaseTimer) clearTimeout(releaseTimer);
        release();
        return;
      }

      if (releaseTimer) clearTimeout(releaseTimer);
      // Pin the start height with no transition, force a reflow to commit it (the
      // observer fires before paint, so the start height paints first — no flash),
      // then transition to the target. Clip only for the duration so nothing spills.
      animating = true;
      wrap.style.overflow = "hidden";
      wrap.style.transition = "none";
      wrap.style.height = `${from}px`;
      void wrap.offsetHeight;
      wrap.style.transition = `height ${DURATION_MS}ms var(--ease-standard)`;
      wrap.style.height = `${next}px`;
      // Release back to auto so the box keeps fitting later content. A timer (not
      // transitionend) so an interrupted/again-changed height can't strand it.
      releaseTimer = setTimeout(release, DURATION_MS + 40);
    });

    observer.observe(content);
    return () => {
      observer.disconnect();
      if (releaseTimer) clearTimeout(releaseTimer);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, []);

  return (
    <div ref={wrapRef}>
      <div ref={contentRef} className={className}>
        {children}
      </div>
    </div>
  );
}

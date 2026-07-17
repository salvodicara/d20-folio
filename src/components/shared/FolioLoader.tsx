/**
 * FolioLoader — the ONE loading idiom for the whole app (owner 2026-06-07).
 *
 * A solid, three-dimensional gilt d20 that tumbles like a thrown die (approved take
 * "2B"), used for EVERY content/page wait — auth bootstrap, lazy-route chunks, and
 * data fetches (sheet, roster, campaigns). One visual everywhere, so the boot-splash
 * d20 flows into it with no competing spinner.
 *
 * Speed + feel: the rotation is FRAME-RATE-INDEPENDENT (angular velocity in rad/second
 * driven by `dt`), so it's identical on 60/120Hz and never strobes; numbers are FIXED
 * per face (no slot-machine flicker); the first frame is drawn synchronously (no blank
 * pop). It appears after a short `delay` so the common warm/sub-second load shows
 * NOTHING (no flash), then fades in. Under `prefers-reduced-motion` it renders a single
 * STATIC solid frame (no loop). `role="status"` + a localized label for AT.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { drawD20, D20_REST } from "./d20-icosahedron";

/** 2B's energy as angular velocity (rad/second): a lively "thrown" tumble. */
const SPIN_X = 1.2;
const SPIN_Y = 2.0;

function D20Spinner({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      2
    );
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.scale(dpr, dpr);

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // A still, solid die at a pleasing 3/4 angle — no motion.
      drawD20(ctx, size, D20_REST.ax, D20_REST.ay);
      return;
    }

    let ax = D20_REST.ax;
    let ay = 0;
    let raf = 0;
    let last: number | null = null;
    const tick = (t: number) => {
      const dt = last === null ? 0 : Math.min((t - last) / 1000, 0.05);
      last = t;
      ax += SPIN_X * dt;
      ay += SPIN_Y * dt;
      drawD20(ctx, size, ax, ay);
      raf = requestAnimationFrame(tick);
    };
    drawD20(ctx, size, ax, ay); // synchronous first frame — no blank flash
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <canvas
      ref={ref}
      className="d20-loader"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

export interface FolioLoaderProps {
  /**
   * `region` (default) fills the content area below the shell; `fullscreen` covers the
   * viewport (auth bootstrap — continues the boot splash).
   */
  variant?: "region" | "fullscreen";
  /**
   * ms to wait before appearing, so fast/warm loads show nothing (no flash). Default
   * 250. Pass 0 for the auth bootstrap so it continues the boot-splash d20 with no gap.
   */
  delay?: number;
  /** Accessible label; defaults to "Loading…". */
  label?: string;
  /** Die size in px (defaults by variant). */
  size?: number;
}

export function FolioLoader({
  variant = "region",
  delay = 250,
  label,
  size,
}: FolioLoaderProps) {
  const { t } = useTranslation();
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const id = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(id);
  }, [delay]);

  const px = size ?? (variant === "fullscreen" ? 84 : 72);
  // The WRAPPER mounts immediately (only the die waits out the delay): it reserves
  // the region height from the first frame and is the "content is settling" marker
  // the shell reads to keep the SiteFooter hidden until the page composes — so the
  // footer can never paint mid-viewport under a load, then get shoved off when the
  // real content lands (the deep-link footer jump). Warm/sub-second loads still
  // show NOTHING (no die, no flash).
  return (
    <div
      className={cn(
        "folio-loader",
        variant === "fullscreen" ? "fl-fullscreen" : "fl-region"
      )}
      role="status"
      aria-live="polite"
    >
      {show && <D20Spinner size={px} />}
      <span className="sr-only">{label ?? t("common.loading")}</span>
    </div>
  );
}

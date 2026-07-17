/**
 * HoverTip — wrap a glyph-only masthead control in the app's branded folio
 * Tooltip on FINE pointers only (the shared quiet-icon idiom): the discreet hover
 * label for the Rest medallion / Level-Up chip / the Undo · Redo commands, whose
 * accessible name lives on the control's own `aria-label`. On a coarse (touch)
 * pointer there is no hover, so the control renders bare — the aria-label still
 * names it for AT, and the control IS the affordance. `delayDuration={200}` + the
 * default top side match every other quiet folio tooltip; each provider is local
 * so no global ancestor is required.
 *
 * `show` gates the whole wrapper (typically `!coarsePointer && hasLabel`); when
 * false the children render as-is. `content` is any node — a single localized
 * string, or a composed two-line label (an act name over a keyboard hint).
 * `side` picks the tooltip edge (default top) — edge-docked chrome (the
 * Binder's Fob at the viewport's right) opens toward the content instead.
 */

import type { ReactNode } from "react";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

export function HoverTip({
  show,
  content,
  side,
  children,
}: {
  show: boolean;
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip content={content} side={side}>
        {children}
      </Tooltip>
    </TooltipProvider>
  );
}

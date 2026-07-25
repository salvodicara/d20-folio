/**
 * Kbd — the ONE keyboard-key recipe: a key NAME, set in the numeric face.
 *
 * A key hint is read-only information, and read-only information is type (L1) —
 * so it carries no frame. It also always sits INSIDE something else (the topbar's
 * Ask button, the palette foot, a tooltip), and a box here was the third framed
 * level on every screen in the app: topbar → button → keycap.
 *
 * Shared by every place that names a key: the topbar ⌘K hint, the palette footer
 * legend + its `?` chip, the EditingPill's ⌘E tip, the encounter turn tooltips, and
 * the shortcuts sheet. One element so a tweak lands everywhere at once.
 */

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "px-1 py-0.5 font-mono text-xs tracking-wide text-text-muted",
        className
      )}
      {...props}
    />
  );
}

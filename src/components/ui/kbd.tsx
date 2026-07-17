/**
 * Kbd — the ONE keyboard-key chip recipe (a hairline mono pill).
 *
 * Shared by every place that names a key: the topbar ⌘K hint, the palette footer
 * legend + its `?` chip, the EditingPill's ⌘E tip, the encounter turn tooltips, and
 * the shortcuts sheet. One element so a tweak to the chip lands everywhere at once.
 */

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "rounded-md border border-border-subtle px-1.5 py-0.5 font-mono text-xs",
        className
      )}
      {...props}
    />
  );
}

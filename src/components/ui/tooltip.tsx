/**
 * Tooltip — folio "Branded" overlay (§ Tooltip+Popover A), on Radix Tooltip.
 *
 * 2px gold top accent + gold halo + carved elevation (the `.tooltip` recipe).
 * Radix supplies hover/focus triggering, portal, positioning, and the ESC /
 * pointer-leave dismissal. Wrap the app (or a subtree) in <TooltipProvider> once.
 *
 *   <TooltipProvider>
 *     <Tooltip content="Proficiency bonus">
 *       <button>PB</button>
 *     </Tooltip>
 *   </TooltipProvider>
 */

import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider(
  props: ComponentPropsWithoutRef<typeof RadixTooltip.Provider>
) {
  return <RadixTooltip.Provider {...props} />;
}

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: RadixTooltip.TooltipContentProps["side"];
  align?: RadixTooltip.TooltipContentProps["align"];
  /** Open delay in ms (default inherits the provider). */
  delayDuration?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  delayDuration,
  className,
}: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          className={cn("tooltip", className)}
          side={side}
          align={align}
          sideOffset={6}
        >
          {content}
          <RadixTooltip.Arrow className="tooltip-arrow" width={11} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

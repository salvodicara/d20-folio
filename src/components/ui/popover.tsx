/**
 * Popover — folio "Branded" overlay (§ Tooltip+Popover A), on Radix Popover.
 *
 * Diamond-rubric display-italic head + carved elevation (`.popover`/`.pop-head`).
 * Radix supplies focus management, portal, outside-click + ESC dismissal, and
 * positioning. Compose:
 *
 *   <Popover>
 *     <PopoverTrigger asChild><button>HP</button></PopoverTrigger>
 *     <PopoverContent rubric="Hit Points">…</PopoverContent>
 *   </Popover>
 */

import * as RadixPopover from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Popover(props: ComponentPropsWithoutRef<typeof RadixPopover.Root>) {
  return <RadixPopover.Root {...props} />;
}

export function PopoverTrigger(
  props: ComponentPropsWithoutRef<typeof RadixPopover.Trigger>
) {
  return <RadixPopover.Trigger {...props} />;
}

export function PopoverClose(props: ComponentPropsWithoutRef<typeof RadixPopover.Close>) {
  return <RadixPopover.Close {...props} />;
}

export function PopoverAnchor(
  props: ComponentPropsWithoutRef<typeof RadixPopover.Anchor>
) {
  return <RadixPopover.Anchor {...props} />;
}

export interface PopoverContentProps extends ComponentPropsWithoutRef<
  typeof RadixPopover.Content
> {
  /** Optional branded rubric head (mono uppercase, diamond prefix). */
  rubric?: ReactNode;
  children: ReactNode;
}

export function PopoverContent({
  rubric,
  children,
  className,
  sideOffset = 8,
  ...props
}: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        className={cn("popover", className)}
        sideOffset={sideOffset}
        {...props}
      >
        {rubric ? (
          <div className="pop-head">
            <span className="pop-rubric">{rubric}</span>
          </div>
        ) : null}
        <div className="pop-body">{children}</div>
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}

/**
 * Dialog — folio modal shell (§ overlays), on Radix Dialog.
 *
 * The canonical accessible modal: scrim + carved `.modal` card with a branded
 * diamond-rubric head, scrollable body, and footer for actions. Radix gives the
 * focus trap, portal to body at the modal z-layer, ESC + outside-click close,
 * and the `aria-labelledby`/`aria-describedby` wiring (Title/Description).
 *
 * Width tiers: sm (24rem) · md (32rem, default) · lg (46rem). On narrow
 * viewports the card already fills width with `--sp-4` gutters via `.scrim`.
 *
 *   <Dialog open={open} onOpenChange={setOpen}>
 *     <DialogContent rubric="Add Spell" title="Choose a spell" size="lg">
 *       …body…
 *       <DialogFooter>…buttons…</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 *
 * (Existing pre-folio modals still use shared/ModalShell; they migrate to this
 * primitive in a later milestone.)
 */

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useOverlayBack } from "@/hooks/useOverlayBack";
import { ModalHead, ModalBody, ModalFoot } from "./modal-head";

export function Dialog(props: ComponentPropsWithoutRef<typeof RadixDialog.Root>) {
  // Hardware / gesture Back closes a CONTROLLED dialog and stays on the page
  // (uncontrolled dialogs — no `open` — keep Radix's own dismissal only).
  useOverlayBack(props.open ?? false, () => props.onOpenChange?.(false));
  return <RadixDialog.Root {...props} />;
}

export function DialogTrigger(
  props: ComponentPropsWithoutRef<typeof RadixDialog.Trigger>
) {
  return <RadixDialog.Trigger {...props} />;
}

export function DialogClose(props: ComponentPropsWithoutRef<typeof RadixDialog.Close>) {
  return <RadixDialog.Close {...props} />;
}

export type DialogSize = "sm" | "md" | "lg";

export interface DialogContentProps extends Omit<
  ComponentPropsWithoutRef<typeof RadixDialog.Content>,
  "title" | "aria-describedby"
> {
  /** Mono uppercase eyebrow with a diamond prefix (the branded head). */
  rubric?: ReactNode;
  /** Display-font title — also becomes the dialog's accessible name. */
  title: ReactNode;
  /** Visually-hidden description for AT (optional but recommended). */
  description?: ReactNode;
  size?: DialogSize;
  /** Accessible label for the close button (bilingual copy from caller). */
  closeLabel?: string;
  /**
   * Extra class on the scrim/overlay — for callers that need to change how the
   * modal is positioned within the viewport (the default is centered). The command
   * palette + the snapshots history use `scrim-top` to top-anchor themselves so
   * they grow downward only (the anti-jump recipe).
   */
  overlayClassName?: string;
  /**
   * Mark the overlay with `data-html2canvas-ignore` so the in-app bug-report
   * screenshot (html2canvas) skips this dialog — used by the command palette so a
   * report triggered from it photographs the screen behind, not the palette itself.
   */
  excludeFromCapture?: boolean;
  children: ReactNode;
}

export function DialogContent({
  rubric,
  title,
  description,
  size = "md",
  closeLabel = "Close",
  className,
  overlayClassName,
  excludeFromCapture,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className={cn("scrim", overlayClassName)}
        {...(excludeFromCapture ? { "data-html2canvas-ignore": "true" } : {})}
      >
        <RadixDialog.Content
          className={cn("modal", size === "sm" && "sm", size === "lg" && "lg", className)}
          {...props}
        >
          <ModalHead title={title} rubric={rubric} closeLabel={closeLabel} />
          {description ? (
            <RadixDialog.Description className="sr-only">
              {description}
            </RadixDialog.Description>
          ) : null}
          {children}
        </RadixDialog.Content>
      </RadixDialog.Overlay>
    </RadixDialog.Portal>
  );
}

/** The shared `.modal-body` scroll region, aliased into the Dialog namespace. */
export const DialogBody = ModalBody;

/** The shared `.modal-foot` action row, aliased into the Dialog namespace. */
export const DialogFooter = ModalFoot;

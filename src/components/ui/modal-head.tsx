/**
 * Modal chrome parts — the ONE branded head · body · foot shared by both modal
 * primitives (the controlled `ModalShell` and `ui/dialog.tsx` `DialogContent`)
 * over the same Radix engine, so the chrome markup lives in one place instead of
 * being re-declared in each. `ui/dialog.tsx` re-exports `ModalBody`/`ModalFoot` as
 * `DialogBody`/`DialogFooter`.
 *
 * - `ModalHead` — diamond `.modal-rubric` eyebrow + Cinzel `.modal-title` (the
 *   Radix `Dialog.Title`, i.e. the accessible name) + `.modal-close` glyph. Must
 *   render inside a `RadixDialog.Root` (both primitives provide it). Close modes:
 *     • `onClose` provided → a plain button driving the caller's controlled close
 *       (ModalShell flips `open` false; Radix then restores focus).
 *     • `onClose` omitted   → a `Dialog.Close` (DialogContent leans on Radix).
 * - `ModalBody` — the `.modal-body` scroll region; forwards native props (e.g. the
 *   command palette routes its ↑↓/Enter `onKeyDown` here).
 * - `ModalFoot` — the `.modal-foot` action row.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export interface ModalHeadProps {
  /** Display-font title — also the Radix `Dialog.Title` (the accessible name). */
  title: ReactNode;
  /** Diamond-prefixed mono eyebrow (the branded `.modal-rubric`). */
  rubric?: ReactNode;
  /** Optional subtitle line below the title. */
  subtitle?: ReactNode;
  /** Slot for left-side content (e.g. a back button). */
  leading?: ReactNode;
  /** Accessible label for the close button (bilingual copy from the caller). */
  closeLabel?: string;
  /**
   * Controlled close → renders a plain button calling this. Omit to render a
   * `RadixDialog.Close` instead (uncontrolled / Radix-owned open state).
   */
  onClose?: () => void;
}

export function ModalHead({
  title,
  rubric,
  subtitle,
  leading,
  closeLabel = "Close",
  onClose,
}: ModalHeadProps) {
  return (
    <div className="modal-head">
      {leading}
      <div className="min-w-0 flex-1">
        {rubric ? <span className="modal-rubric">{rubric}</span> : null}
        {/* A dialog's name must be fully legible at every width — titles WRAP,
            never ellipsize (owner, 2026-06-11: "Abbandonare il passaggio di
            liv…" cut the one line that says what the dialog does). */}
        <RadixDialog.Title className="modal-title">{title}</RadixDialog.Title>
        {subtitle ? (
          <p className="mt-0.5 truncate font-mono text-xs text-text-secondary">
            {subtitle}
          </p>
        ) : null}
      </div>
      {onClose ? (
        // Plain button (not Dialog.Close) so it drives the controlled onClose
        // exactly once; flipping `open` false lets Radix restore focus.
        <button
          type="button"
          onClick={onClose}
          className="modal-close"
          aria-label={closeLabel}
        >
          <Icon as={X} size="lg" decorative />
        </button>
      ) : (
        <RadixDialog.Close className="modal-close" aria-label={closeLabel} type="button">
          <Icon as={X} size="lg" decorative />
        </RadixDialog.Close>
      )}
    </div>
  );
}

/**
 * ModalBody — the `.modal-body` scroll region. Forwards native div props so a body
 * can own keyboard behaviour (the command palette routes its ↑↓/Enter nav here).
 */
export function ModalBody({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    // `.modal-body` is a max-height scroll region; when its content overflows it
    // must be keyboard-reachable so non-pointer users can scroll it (WCAG 2.1 /
    // axe `scrollable-region-focusable`). The tabIndex is unconditional — the
    // least-code correct form: the rule fires on any scrollable region, and a
    // non-scrolling body costing one extra tab stop is harmless. Callers may
    // still override it via `...rest` (e.g. a body that manages its own focus).
    <div className={cn("modal-body", className)} tabIndex={0} {...rest}>
      {children}
    </div>
  );
}

/** ModalFoot — the `.modal-foot` action row at the bottom of a modal. */
export function ModalFoot({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn("modal-foot", className)} {...rest}>
      {children}
    </div>
  );
}

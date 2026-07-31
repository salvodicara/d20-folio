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
 * - `ModalScrollColumn` — the same scroll region for `ModalShell`'s tall flex card
 *   (`flex-1` instead of `.modal-body`'s fixed max-height).
 * - `ModalFoot` — the `.modal-foot` action row.
 */

import {
  useCallback,
  useRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
} from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useOverflowFadeY } from "@/hooks/useOverflowFade";
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
    <ModalScroll className={cn("modal-body", className)} tabIndex={0} {...rest}>
      {children}
    </ModalScroll>
  );
}

/**
 * ModalScroll — THE one dialog scroll primitive (owner, 2026-07-31: every
 * dialog scrolls the same way, no exceptions). Carries the vertical
 * edge-dissolve (content melts before the modal's binding corners, same
 * observer as the tab ribbons) and inherits the frame's-margin law
 * (`.modal .scroll-dissolve`, folio.css). `ModalBody` and `ModalScrollColumn`
 * compose it; any bespoke dialog body must use one of the three — the
 * modal-scroll guard test enforces it.
 */
export function ModalScroll({
  className,
  children,
  ref: refProp,
  ...rest
}: ComponentPropsWithoutRef<"div"> & { ref?: Ref<HTMLDivElement> }) {
  const inner = useRef<HTMLDivElement | null>(null);
  const fade = useOverflowFadeY(inner);
  // Merge the caller's ref (e.g. the picker's scroll memory) with the
  // observer's — STABLE, so a re-render never re-attaches the caller's ref
  // (a re-attach lets a scroll-memory ref restore its saved position).
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      inner.current = el;
      if (typeof refProp === "function") refProp(el);
      else if (refProp) refProp.current = el;
    },
    [refProp]
  );
  return (
    <div
      ref={setRef}
      className={cn("scroll-dissolve overflow-y-auto overscroll-contain", className)}
      data-fade={fade || undefined}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * ModalScrollColumn — `ModalShell`'s scroll region. `ModalShell` is a tall flex
 * CARD (`h-[88vh] flex-col`), so its body grows with `flex-1` rather than
 * `.modal-body`'s fixed `max-height: 64vh` — same a11y contract, different
 * layout, hence a sibling part and not a copy at each call site.
 *
 * `tabIndex={0}` is that contract: a long, interaction-free body (a monster
 * statblock) is a scrollable region with NO focusable child, so a non-pointer
 * user cannot reach it to arrow-scroll (WCAG 2.1 / axe
 * `scrollable-region-focusable`, serious). Unconditional, like `ModalBody`'s —
 * one harmless tab stop beats a rule that fires whenever content happens to
 * overflow. `overscroll-contain` keeps momentum out of the page chain.
 */
export function ModalScrollColumn({
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"div">) {
  return (
    <ModalScroll
      tabIndex={0}
      className={cn(
        "flex-1 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-accent",
        className
      )}
      {...rest}
    >
      {children}
    </ModalScroll>
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

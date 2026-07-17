/**
 * ModalShell — reusable modal container, skinned with the folio `.modal` recipe.
 *
 * Backed by Radix `Dialog` (the SAME engine as `components/ui/dialog.tsx`) so it
 * gets the one accessible-modal contract for free: a focus trap, initial focus on
 * open + focus restore on close, ESC + outside-click dismissal, body scroll-lock,
 * a portal at the modal z-layer, and the `aria-labelledby` wiring (the
 * `.modal-title` is the Radix `Dialog.Title`, so it names the dialog). Radix is
 * the single trap owner — this primitive no longer hand-rolls `role`/`aria-modal`
 * without the behaviour behind them.
 *
 * It keeps its own fixed-height flex API on top of Radix: the `.modal` Content is
 * a flex column at a fixed height so a child results region with
 * `flex-1 overflow-y-auto` scrolls correctly (the plain `Dialog` scrolls its whole
 * `.modal-body` instead) — that's why this primitive stays distinct from `Dialog`.
 * It renders the SAME owner-approved overlay vocabulary (carved `.modal` card,
 * gold-gradient `.modal-head` with a diamond `.modal-rubric` + Cinzel
 * `.modal-title`, `.modal-close` glyph) so every consumer reads as one Illuminated
 * Folio surface.
 *
 * Usage:
 *   <ModalShell open={x} onClose={fn} title="Add Spell">
 *     ...content...
 *   </ModalShell>
 */

import type { ReactNode } from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ModalHead } from "@/components/ui/modal-head";
import { useOverlayBack } from "@/hooks/useOverlayBack";

/** Width tiers mirror the folio `.modal` recipe (sm 24rem · md 32rem · lg 46rem). */
export type ModalSize = "sm" | "md" | "lg";

interface ShellProps {
  open: boolean;
  onClose: () => void;
  /** If provided, renders the standard folio header. Omit for custom headers. */
  title?: string;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /**
   * Mono uppercase eyebrow with a diamond prefix (the branded `.modal-rubric`).
   * Defaults to the localized "Add" rubric when a `title` is shown.
   */
  rubric?: ReactNode;
  children: ReactNode;
  /** Width tier — defaults to the wide `lg` card these list/detail modals use. */
  size?: ModalSize;
  /**
   * Content-sized height instead of the fixed tall flex column. Use for short
   * dialogs (confirm prompts, single-field forms) that should hug their content
   * rather than stretch to 88vh. Still capped at max-h-[88vh].
   */
  compact?: boolean;
  /**
   * Extra class on the `.scrim` backdrop — e.g. a higher z-index utility for a
   * nested modal that must stack above another. Defaults to the `.scrim` token.
   */
  scrimClassName?: string;
  /**
   * Whether the hardware / gesture Back button dismisses this overlay (the
   * `overlay-history` sentinel). Defaults to `true` for navigable overlays
   * (add-modals, lightboxes, the command palette). Confirm-tier dialogs opt OUT
   * (`false`): they are transient modals OWNED by a flow, not navigable
   * surfaces, and are frequently opened BY a navigation guard (React Router
   * `useBlocker`). Pushing a sentinel for them means retiring it fires a stray
   * `history.back()` that races the flow's own `proceed()`/`reset()`, corrupting
   * the guarded navigation — so the confirm never participates in Back at all.
   */
  backDismiss?: boolean;
}

export function ModalShell({
  open,
  onClose,
  title,
  subtitle,
  rubric,
  children,
  size = "lg",
  compact = false,
  scrimClassName,
  backDismiss = true,
}: ShellProps) {
  const { t } = useTranslation();
  // Hardware / gesture Back closes this overlay and stays on the page — unless
  // it opted out (confirm-tier dialogs; see `backDismiss`).
  useOverlayBack(open && backDismiss, onClose);
  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        {/* The `.scrim` centres the card (display:grid place-items:center) and
            carries the backdrop — same structure as `ui/dialog.tsx`. */}
        <RadixDialog.Overlay className={cn("scrim", scrimClassName)}>
          <RadixDialog.Content
            className={cn(
              // `.modal` brings the carved frame, gold-gradient head ground, accent
              // border, modal elevation + lapidary radius; these layout utilities add
              // the tall flex column the list/detail bodies (`flex-1 overflow-y-auto`)
              // scroll inside — capped so it never exceeds the viewport. `compact`
              // drops the fixed height so short dialogs hug their content.
              "modal flex w-full flex-col max-h-[88vh]",
              !compact && "h-[88vh]",
              size === "sm" && "sm",
              size === "lg" && "lg"
            )}
            // The visible `.modal-title` (a Dialog.Title) names the dialog; no
            // separate description is needed for these list/detail surfaces.
            aria-describedby={undefined}
          >
            {title && (
              <ModalHead
                onClose={onClose}
                title={title}
                subtitle={subtitle}
                // The add-modals always carry the branded rubric; default to the
                // localized "Add" eyebrow when the caller doesn't pass one.
                rubric={rubric ?? t("common.add")}
                closeLabel={t("common.close")}
              />
            )}
            {children}
          </RadixDialog.Content>
        </RadixDialog.Overlay>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

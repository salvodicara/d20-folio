/**
 * PortraitLightbox
 *
 * Full-screen overlay that shows the character portrait at maximum size.
 * Displays the compressed original (portraitUrl) — the CSS crop applied in the
 * header/lore circle is intentionally NOT applied here so the full image shows.
 *
 * UX:
 *   - Click backdrop, image, or the × button to close
 *   - Escape key closes
 *   - Image is constrained to the viewport (object-contain)
 *   - Character name shown as a caption at the bottom
 *   - Subtle fade-in animation; respects prefers-reduced-motion
 *
 * Backed by Radix `Dialog` — the SAME primitive every other overlay uses
 * (ModalShell / ui `Dialog`) — so it shares the ONE ref-counted body scroll-lock
 * (react-remove-scroll), focus trap, ESC dismissal, and body portal instead of
 * hand-rolling a competing `document.body.style.overflow` lock. That hand-rolled
 * lock was NOT ref-counted, so it fought the shared one (a golden-rule-6
 * one-source-of-truth violation): opening/closing the lightbox while a dialog was
 * also open could strand the body scroll state and freeze the page. The lightbox
 * now NEVER writes `document.body.style.overflow` directly.
 */

import * as RadixDialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useOverlayBack } from "@/hooks/useOverlayBack";

interface Props {
  open: boolean;
  /** Original uncropped portrait URL (preferred) */
  src: string;
  /** Character name for the caption */
  name: string;
  onClose: () => void;
}

export function PortraitLightbox({ open, src, name, onClose }: Props) {
  const { t } = useTranslation();
  // Only a real, sourced portrait is lightboxed (the lettered fallback isn't).
  const isOpen = open && Boolean(src);
  // Hardware / gesture Back closes the lightbox and stays on the page.
  useOverlayBack(isOpen, onClose);

  return (
    <RadixDialog.Root
      open={isOpen}
      onOpenChange={(next) => {
        // Radix drives close on ESC + outside interaction; funnel both to onClose.
        if (!next) onClose();
      }}
    >
      <RadixDialog.Portal>
        {/* D21 — the Content IS the full-screen backdrop, portalled to <body> on the
            folio modal z-layer so no local stacking context can bury it. Radix wraps
            it in the shared react-remove-scroll (ref-counted body lock) + focus trap.
            A backdrop click closes; the image stops propagation so clicking it does
            not. */}
        <RadixDialog.Content
          className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--scrim-heavy)] motion-safe:animate-[fadeIn_150ms_ease]"
          style={{ zIndex: "var(--z-modal)" }}
          onClick={onClose}
          // The visible caption + the sr-only Title name the dialog; no separate
          // description is needed for a single-image surface.
          aria-describedby={undefined}
        >
          {/* Accessible name for the dialog (visually hidden — the portrait carries
              the same name as its alt text + the visible caption). */}
          <RadixDialog.Title className="sr-only">{name}</RadixDialog.Title>

          {/* Close button — stop propagation so the click isn't double-counted by the
              backdrop's own onClick (one logical close = one onClose). */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
            aria-label={t("common.close")}
          >
            <X className="h-5 w-5" />
          </button>

          {/* Portrait — stop propagation so clicking image doesn't double-close */}
          <img
            src={src}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85dvh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
            draggable={false}
          />

          {/* Caption */}
          {name && (
            <p className="mt-4 font-display text-base font-semibold text-white/80">
              {name}
            </p>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

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
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";
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
  // Hardware / gesture Back closes the lightbox and stays on the page.
  useOverlayBack(open, onClose);
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !src) return null;

  // D21 — render through a PORTAL to <body> and sit on the folio modal z-layer.
  // Inline `z-[200]` inside the Bio DOM was trapped by an ancestor stacking
  // context (and sat below `--z-modal` = 2000), so app chrome painted ABOVE the
  // lightbox ("things show above it"). A body portal escapes every local stacking
  // context; `--z-modal` clears the sticky topbar / overlays beneath it.
  return createPortal(
    /* Backdrop */
    <div
      className="fixed inset-0 flex flex-col items-center justify-center bg-[var(--scrim-heavy)] motion-safe:animate-[fadeIn_150ms_ease]"
      style={{ zIndex: "var(--z-modal)" }}
      onClick={onClose}
    >
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
        <p className="mt-4 font-display text-base font-semibold text-white/80">{name}</p>
      )}
    </div>,
    document.body
  );
}

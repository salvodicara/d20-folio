/**
 * Undo Toasts — the cornerstone feedback of the immediate-commit combat model
 * and the safety net for destructive edits. Rendered on the folio `.toast` /
 * `.toast-region` recipe (lapidary radius, 2px gold top accent, carved
 * elevation, the folio display/numeric type) with a live countdown ring — NOT the old
 * rounded-full Tailwind pill. Centralized as the single toast surface for
 * combat, spells, and trackers.
 *
 * Exit animation wiring: the store sets `toast.leaving = true` ~160 ms before
 * actually removing the toast from the list. The component reads that flag and
 * adds `data-leaving="true"` so the CSS `toast-out` keyframe fires while the
 * element is still mounted.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToastStore } from "@/stores/toastStore";
import { useToasts } from "@/hooks/useToasts";
import { X } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";

export function UndoToasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);
  const undoToast = useToastStore((s) => s.undoToast);
  const { toastMessage } = useToasts();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toastMessage(toast)}
          createdAt={toast.createdAt}
          duration={toast.duration}
          hasUndo={typeof toast.onUndo === "function"}
          leaving={toast.leaving ?? false}
          onDismiss={dismissToast}
          onUndo={undoToast}
        />
      ))}
    </div>
  );
}

interface ToastItemProps {
  id: string;
  message: string;
  createdAt: number;
  duration: number;
  hasUndo: boolean;
  /** Mirrors store's `leaving` flag — triggers the CSS exit keyframe. */
  leaving: boolean;
  onDismiss: (id: string) => void;
  onUndo: (id: string) => void;
}

const RING_R = 8;
const RING_C = 2 * Math.PI * RING_R;

function ToastItem({
  id,
  message,
  createdAt,
  duration,
  hasUndo,
  leaving,
  onDismiss,
  onUndo,
}: ToastItemProps) {
  const { t } = useTranslation();
  const [fraction, setFraction] = useState(() =>
    Math.max(0, Math.min(1, 1 - (Date.now() - createdAt) / duration))
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, Math.min(1, 1 - (Date.now() - createdAt) / duration));
      setFraction(left);
      if (left <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [createdAt, duration]);

  const remaining = Math.ceil((fraction * duration) / 1000);

  return (
    <div
      // No data-type="success" — undo toasts are neutral acknowledgements, not
      // success events. The folio default 2px gold top accent is appropriate.
      className="toast"
      data-leaving={leaving ? "true" : undefined}
    >
      {/* Dismiss button: folio hdr-icon style (icon-only, gold on hover). The
          glyph is an X (close) — a Check would read as "confirm", contradicting
          the aria-label. */}
      <IconButton
        className="t-dismiss"
        aria-label={t("common.close")}
        onClick={() => onDismiss(id)}
      >
        <Icon as={X} size="sm" decorative />
      </IconButton>
      <span className="t-txt">{message}</span>
      {hasUndo && (
        <Button variant="ghost" size="sm" className="t-undo" onClick={() => onUndo(id)}>
          {t("common.undo")}
        </Button>
      )}
      <svg
        className="t-ring"
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden
        focusable="false"
      >
        <circle
          cx="11"
          cy="11"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="2"
        />
        <circle
          cx="11"
          cy="11"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - fraction)}
          transform="rotate(-90 11 11)"
        />
        <text
          x="11"
          y="11"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-numeric)"
          fontSize="8"
          fontWeight="700"
          fill="currentColor"
        >
          {remaining}
        </text>
      </svg>
    </div>
  );
}

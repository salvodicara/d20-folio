/**
 * PortraitEditMenu — the shared portrait-edit popover (Re-crop · Upload new ·
 * Remove), on the folio `.popover` vocabulary so the Bio editor and the cockpit
 * hero seal offer the SAME three actions with the SAME chrome (D21).
 *
 * Presentational only: the parent owns open state, positioning, and outside-click
 * dismissal (both call sites already manage a ref + a menu-open flag). The actual
 * upload / re-crop / remove logic lives in the shared `usePortraitCrop` hook.
 */

import { useTranslation } from "react-i18next";
import { Camera, Upload, Trash2 } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface PortraitEditMenuProps {
  onRecrop: () => void;
  onReplace: () => void;
  onRemove: () => void;
  /** Positioning utility classes for the absolutely-placed popover. */
  className?: string;
}

export function PortraitEditMenu({
  onRecrop,
  onReplace,
  onRemove,
  className,
}: PortraitEditMenuProps) {
  const { t } = useTranslation();
  return (
    <div className={cn("settings-pop popover absolute z-[300] w-44", className)}>
      <div className="pop-body" role="menu" aria-label={t("portrait.menu.edit")}>
        <button type="button" role="menuitem" className="menu-item" onClick={onRecrop}>
          <Icon as={Camera} decorative />
          {t("portrait.menu.recrop")}
        </button>
        <button type="button" role="menuitem" className="menu-item" onClick={onReplace}>
          <Icon as={Upload} decorative />
          {t("portrait.menu.replace")}
        </button>
        <div className="menu-div" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="menu-item danger"
          onClick={onRemove}
        >
          <Icon as={Trash2} decorative />
          {t("portrait.menu.remove")}
        </button>
      </div>
    </div>
  );
}

/**
 * ModalTabSwitcher — the shared SRD / Custom two-tab strip every "Add-X" modal
 * wears (spell · feature · the encounter picker). Generic modal chrome: it owns
 * only the two-button switch, so it lives beside `ModalShell` rather than inside
 * any one modal's body (a consumer's chunk would otherwise drag the others in).
 *
 * `labels` overrides the two tab captions; it defaults to the cockpit's
 * `custom.srdTab` / `custom.customTab`, so the five cockpit Add-X modals read
 * unchanged and a surface with a different first pool (the encounter's Bestiary)
 * passes its own captions.
 */

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export function ModalTabSwitcher({
  activeTab,
  onTabChange,
  labels,
}: {
  activeTab: "srd" | "custom";
  onTabChange: (tab: "srd" | "custom") => void;
  labels?: { srd: string; custom: string };
}) {
  const { t } = useTranslation();
  const srdLabel = labels?.srd ?? t("custom.srdTab");
  const customLabel = labels?.custom ?? t("custom.customTab");

  return (
    <div className="flex border-b border-border-subtle">
      <button
        onClick={() => onTabChange("srd")}
        className={cn(
          "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
          activeTab === "srd"
            ? "border-b-2 border-accent text-accent"
            : "text-text-secondary hover:text-text-primary"
        )}
      >
        {srdLabel}
      </button>
      <button
        onClick={() => onTabChange("custom")}
        className={cn(
          "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
          activeTab === "custom"
            ? "border-b-2 border-accent text-accent"
            : "text-text-secondary hover:text-text-primary"
        )}
      >
        {customLabel}
      </button>
    </div>
  );
}

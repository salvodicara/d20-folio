/**
 * AddItemModal — unified "Add Item" picker that covers all item categories in
 * one flow: SRD Equipment (weapons / armor / gear / tools / packs), Magic Items,
 * and Custom homebrew.
 *
 * Design rationale (E14/E15): magic items ARE equipment in D&D 2024 — they are
 * just items with special properties. Surfacing them as a separate top-level
 * button was a UX misstep that presented the inventory as two silos. This modal
 * unifies the trigger: one "Add Item" button opens one modal with three tabs.
 *
 * Approach: thin wrapper that composes the `EquipmentAddBody` (SRD Equipment tab)
 * and `MagicItemAddBody` (Magic Items tab) browse views as inner panels — the heavy
 * browser + filter logic lives in each dedicated file and is NOT duplicated. A third
 * "Custom" tab shows the `CustomEquipmentForm`. (The old standalone `EquipmentAddModal`
 * / `MagicItemAddModal` wrappers were deleted — this is now the only add-item entry.)
 *
 * Tab switcher mirrors `ModalTabSwitcher` from CustomCreationForms but with three
 * tabs; the existing two-tab version is kept as-is for callers that still want it.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { ModalShell } from "@/components/shared/ModalShell";
import { CustomEquipmentForm } from "./CustomCreationForms";
import { EquipmentAddBody } from "./EquipmentAddModal";
import { MagicItemAddBody } from "./MagicItemAddModal";

type ItemTab = "equipment" | "magic" | "custom";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddItemModal({ open, onClose }: AddItemModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ItemTab>("equipment");
  // Track whether a detail view is open inside Equipment or Magic tabs so the
  // modal title can reflect it. Each body component manages its own selected
  // state internally; we only need a flag here for the header title.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  // Reset detail title when switching tabs
  function handleTabChange(tab: ItemTab) {
    setActiveTab(tab);
    setDetailTitle(null);
  }

  const modalTitle =
    detailTitle ??
    (activeTab === "equipment"
      ? t("equipment.tabEquipment")
      : activeTab === "magic"
        ? t("equipment.tabMagicItems")
        : t("equipment.tabCustom"));

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={modalTitle}
      rubric={t("equipment.addItem")}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Three-tab switcher */}
        <div className="flex shrink-0 border-b border-border-subtle">
          <TabButton
            label={t("equipment.tabEquipment")}
            active={activeTab === "equipment"}
            onClick={() => handleTabChange("equipment")}
          />
          <TabButton
            label={t("equipment.tabMagicItems")}
            active={activeTab === "magic"}
            onClick={() => handleTabChange("magic")}
          />
          <TabButton
            label={t("equipment.tabCustom")}
            active={activeTab === "custom"}
            onClick={() => handleTabChange("custom")}
          />
        </div>

        {/* Tab bodies — each is flex-1 so they fill remaining height */}
        {activeTab === "equipment" && (
          <EquipmentAddBody onClose={onClose} onDetailTitle={setDetailTitle} />
        )}
        {activeTab === "magic" && (
          <MagicItemAddBody onClose={onClose} onDetailTitle={setDetailTitle} />
        )}
        {activeTab === "custom" && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <CustomEquipmentForm onCreated={onClose} />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 py-2 text-center text-[0.7rem] font-semibold transition-colors",
        active
          ? "border-b-2 border-accent text-accent"
          : "text-text-secondary hover:text-text-primary"
      )}
    >
      {label}
    </button>
  );
}

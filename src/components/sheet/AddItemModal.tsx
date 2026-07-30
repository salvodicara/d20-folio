/**
 * AddItemModal — unified "Add Item" picker that covers all item categories in
 * one flow: SRD Equipment (weapons / armor / gear / tools / packs), Magic Items, and
 * Custom (the player's own item library — list + create).
 *
 * Design rationale (E14/E15): magic items ARE equipment in D&D 2024 — they are
 * just items with special properties. Surfacing them as a separate top-level
 * button was a UX misstep that presented the inventory as two silos. This modal
 * unifies the trigger: one "Add Item" button opens one modal with its tabs.
 *
 * Approach: thin wrapper that composes the `EquipmentAddBody` (SRD Equipment tab)
 * and `MagicItemAddBody` (Magic Items tab) browse views as inner panels — the heavy
 * browser + filter logic lives in each dedicated file and is NOT duplicated. The
 * "Custom" tab is the shared `CustomTabBody` over the two item kinds (equipment +
 * weapon): the saved homebrew list plus the `CustomEquipmentForm` behind it. (The old
 * standalone `EquipmentAddModal` / `MagicItemAddModal` wrappers were deleted — this is
 * now the only add-item entry.)
 *
 * The tab strip is the shared `ModalTabSwitcher` (its private three-tab copy was
 * deleted when the switcher went N-tab — golden rule 6).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalTabSwitcher } from "@/components/shared/ModalTabSwitcher";
import { CustomEquipmentForm } from "./CustomCreationForms";
import { EquipmentAddBody } from "./EquipmentAddModal";
import { MagicItemAddBody } from "./MagicItemAddModal";
import { CustomTabBody, type LibraryEditRequest } from "./CustomTabBody";

type ItemTab = "equipment" | "magic" | "custom";

interface AddItemModalProps {
  open: boolean;
  onClose: () => void;
}

/** Both item kinds land here — a saved weapon and a saved gear/armor entry alike. */
const KINDS = ["equipment", "weapon"] as const;

/**
 * Narrow a tab edit request to THIS modal's form: the item form serves both item
 * kinds, so the two-arm check hands it a `CustomEquipment | CustomWeapon` with no
 * cast (a spell/feature entry could never reach here — the tab lists only `KINDS`).
 */
function itemEdit(edit?: LibraryEditRequest) {
  if (!edit) return undefined;
  const { entry, onSave } = edit;
  return entry.kind === "equipment" || entry.kind === "weapon"
    ? { item: entry.item, onSave }
    : undefined;
}

export function AddItemModal({ open, onClose }: AddItemModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<ItemTab>("equipment");
  // Track whether a detail view is open inside Equipment or Magic tabs so the
  // modal title can reflect it. Each body component manages its own selected
  // state internally; we only need a flag here for the header title.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  const tabs = [
    { id: "equipment" as const, label: t("equipment.tabEquipment") },
    { id: "magic" as const, label: t("equipment.tabMagicItems") },
    { id: "custom" as const, label: t("custom.customTab") },
  ];

  const modalTitle = detailTitle ?? tabs.find((tab) => tab.id === activeTab)?.label ?? "";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={modalTitle}
      rubric={t("equipment.addItem")}
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        <ModalTabSwitcher
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setDetailTitle(null);
          }}
          tabs={tabs}
        />

        {/* Tab bodies — each is flex-1 so they fill remaining height */}
        {activeTab === "equipment" && (
          <EquipmentAddBody onClose={onClose} onDetailTitle={setDetailTitle} />
        )}
        {activeTab === "magic" && (
          <MagicItemAddBody onClose={onClose} onDetailTitle={setDetailTitle} />
        )}
        {activeTab === "custom" && (
          <CustomTabBody
            kinds={KINDS}
            createLabel={t("custom.createEquipment")}
            renderForm={(edit) => (
              <CustomEquipmentForm onCreated={onClose} libraryEdit={itemEdit(edit)} />
            )}
            onAdded={onClose}
            onDetailTitle={setDetailTitle}
          />
        )}
      </div>
    </ModalShell>
  );
}

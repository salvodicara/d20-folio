/**
 * AddItemModal — the unified "Add Item" picker. TWO tabs:
 *   • Items  — ONE searchable browser over BOTH corpora (mundane SRD equipment:
 *              weapons / armor / gear / tools / packs, AND magic items), driven by
 *              the unified `itemsSpec` with a smart facet rail (Magic lens · Kind ·
 *              Rarity · Attunement). Replaces the old separate Equipment + Magic
 *              Items tabs — magic items ARE equipment in D&D 2024, and a single
 *              list is how D&D Beyond surfaces them (owner-greenlit 2026-08-01).
 *   • Custom — the player's own item library (list + create). Kept as its own tab
 *              because it is create-not-browse (the shared `CustomTabBody` over the
 *              equipment + weapon kinds, behind the `CustomEquipmentForm`).
 *
 * Thin wrapper: the heavy browser + filter logic lives in the shared
 * `CompendiumPicker` + `itemsSpec`, never duplicated here. The tab strip is the
 * shared `ModalTabSwitcher`.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalStage } from "@/components/ui/modal-head";
import { ModalTabSwitcher } from "@/components/shared/ModalTabSwitcher";
import { CustomEquipmentForm } from "./CustomCreationForms";
import { ItemAddBody } from "./ItemAddModal";
import { CustomTabBody, type LibraryEditRequest } from "./CustomTabBody";

type ItemTab = "items" | "custom";

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
  const [activeTab, setActiveTab] = useState<ItemTab>("items");
  // Track whether a detail view is open inside the Items tab so the modal title
  // can reflect it. Each body component manages its own selected state internally;
  // we only need a flag here for the header title.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  const tabs = [
    { id: "items" as const, label: t("items.tab") },
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
      <ModalStage>
        <ModalTabSwitcher
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setDetailTitle(null);
          }}
          tabs={tabs}
        />

        {/* Tab bodies — each is flex-1 so they fill remaining height */}
        {activeTab === "items" && (
          <ItemAddBody onClose={onClose} onDetailTitle={setDetailTitle} />
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
      </ModalStage>
    </ModalShell>
  );
}

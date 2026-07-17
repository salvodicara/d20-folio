/**
 * SRD Feature Addition Modal — now a thin wrapper over the shared
 * `CompendiumPicker` primitive (Phase 5). The browse logic (class facet
 * defaulting to the character's class + a class-scoped level facet, the
 * above-level soft warning, the mechanics detail block, the `{ srdId }` commit)
 * lives in `featureSpec` (`features/compendium/picker/specs/feature`). This file
 * owns only the `ModalShell` chrome + the SRD / Custom tab switcher. Behavior is
 * unchanged.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { CompendiumPicker, featureSpec } from "@/features/compendium/picker";
import { ModalTabSwitcher, CustomFeatureForm } from "./CustomCreationForms";
import type { CustomFeature } from "@/types/character";

interface FeatureAddModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * When set, the modal skips the SRD/Custom switcher and opens straight into the
   * custom-feature editor for this existing entry (U6 — edit a homebrew feature
   * after creation), writing back to `features[editIndex]`.
   */
  editFeature?: CustomFeature;
  editIndex?: number;
}

export function FeatureAddModal({
  open,
  onClose,
  editFeature,
  editIndex,
}: FeatureAddModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"srd" | "custom">("srd");
  const [detailTitle, setDetailTitle] = useState<string | null>(null);
  const editing = editFeature != null && editIndex != null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      rubric={editing ? t("common.edit") : undefined}
      title={editing ? t("custom.editFeature") : (detailTitle ?? t("nav.addFeature"))}
    >
      {editing ? (
        <CustomFeatureForm
          onCreated={onClose}
          editFeature={editFeature}
          editIndex={editIndex}
        />
      ) : (
        <>
          <ModalTabSwitcher
            activeTab={activeTab}
            onTabChange={(tab) => {
              setActiveTab(tab);
              setDetailTitle(null);
            }}
          />
          {activeTab === "custom" ? (
            <CustomFeatureForm onCreated={onClose} />
          ) : (
            <CompendiumPicker
              spec={featureSpec}
              mode="add"
              onClose={onClose}
              onDetailTitle={setDetailTitle}
              autoFocus
            />
          )}
        </>
      )}
    </ModalShell>
  );
}

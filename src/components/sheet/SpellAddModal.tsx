/**
 * SRD Spell Addition Modal — now a thin wrapper over the shared `CompendiumPicker`
 * primitive (Phase 5). The browse logic (level + class facets with the casting-
 * list default and the L10 third-caster school restriction, the cross-class soft
 * warning, the chromatic level-seal row + detail, the `{ srdId }` commit) lives
 * in `spellSpec` (`features/compendium/picker/specs/spell`). This file owns only
 * the `ModalShell` chrome + the SRD / Library / Custom tab switcher (the pools
 * first, authoring last).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { CompendiumPicker, spellSpec } from "@/features/compendium/picker";
import { ModalTabSwitcher } from "@/components/shared/ModalTabSwitcher";
import { CustomSpellForm } from "./CustomCreationForms";
import { LibraryPickerBody } from "./LibraryPickerBody";

interface SpellAddModalProps {
  open: boolean;
  onClose: () => void;
}

const LIBRARY_KINDS = ["spell"] as const;

export function SpellAddModal({ open, onClose }: SpellAddModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"srd" | "library" | "custom">("srd");
  // The picker reports the open entry's name so the shell title reflects it.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  return (
    <ModalShell open={open} onClose={onClose} title={detailTitle ?? t("spells.addSpell")}>
      <ModalTabSwitcher
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setDetailTitle(null);
        }}
        tabs={[
          { id: "srd", label: t("custom.srdTab") },
          { id: "library", label: t("custom.libraryTab") },
          { id: "custom", label: t("custom.customTab") },
        ]}
      />
      {activeTab === "custom" ? (
        <CustomSpellForm onCreated={onClose} />
      ) : activeTab === "library" ? (
        <LibraryPickerBody kinds={LIBRARY_KINDS} onAdded={onClose} />
      ) : (
        <CompendiumPicker
          spec={spellSpec}
          mode="add"
          onClose={onClose}
          onDetailTitle={setDetailTitle}
          autoFocus
        />
      )}
    </ModalShell>
  );
}

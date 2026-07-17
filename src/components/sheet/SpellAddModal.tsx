/**
 * SRD Spell Addition Modal — now a thin wrapper over the shared `CompendiumPicker`
 * primitive (Phase 5). The browse logic (level + class facets with the casting-
 * list default and the L10 third-caster school restriction, the cross-class soft
 * warning, the chromatic level-seal row + detail, the `{ srdId }` commit) lives
 * in `spellSpec` (`features/compendium/picker/specs/spell`). This file owns only
 * the `ModalShell` chrome + the SRD / Custom tab switcher. Behavior is unchanged.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { CompendiumPicker, spellSpec } from "@/features/compendium/picker";
import { ModalTabSwitcher, CustomSpellForm } from "./CustomCreationForms";

interface SpellAddModalProps {
  open: boolean;
  onClose: () => void;
}

export function SpellAddModal({ open, onClose }: SpellAddModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"srd" | "custom">("srd");
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
      />
      {activeTab === "custom" ? (
        <CustomSpellForm onCreated={onClose} />
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

/**
 * SRD Spell Addition Modal — now a thin wrapper over the shared `CompendiumPicker`
 * primitive (Phase 5). The browse logic (level + class facets with the casting-
 * list default and the L10 third-caster school restriction, the cross-class soft
 * warning, the chromatic level-seal row + detail, the `{ srdId }` commit) lives
 * in `spellSpec` (`features/compendium/picker/specs/spell`). This file owns only
 * the `ModalShell` chrome + the SRD / Custom tab switcher (the Custom tab is the
 * player's own spell library — list + create; see `CustomTabBody`).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/shared/ModalShell";
import { ModalStage } from "@/components/ui/modal-head";
import { CompendiumPicker, spellSpec } from "@/features/compendium/picker";
import { ModalTabSwitcher } from "@/components/shared/ModalTabSwitcher";
import { CustomSpellForm } from "./CustomCreationForms";
import { CustomTabBody } from "./CustomTabBody";

interface SpellAddModalProps {
  open: boolean;
  onClose: () => void;
}

const KINDS = ["spell"] as const;

export function SpellAddModal({ open, onClose }: SpellAddModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"srd" | "custom">("srd");
  // The picker reports the open entry's name so the shell title reflects it.
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  return (
    <ModalShell open={open} onClose={onClose} title={detailTitle ?? t("spells.addSpell")}>
      <ModalStage>
        <ModalTabSwitcher
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setDetailTitle(null);
          }}
          tabs={[
            { id: "srd", label: t("custom.srdTab") },
            { id: "custom", label: t("custom.customTab") },
          ]}
        />
        {activeTab === "custom" ? (
          <CustomTabBody
            kinds={KINDS}
            createLabel={t("custom.createSpell")}
            renderForm={(edit) => (
              <CustomSpellForm
                onCreated={onClose}
                // The kind check NARROWS the entry to a spell — no cast, and a
                // mismatched kind simply opens the blank create form.
                libraryEdit={
                  edit?.entry.kind === "spell"
                    ? { item: edit.entry.item, onSave: edit.onSave }
                    : undefined
                }
              />
            )}
            onAdded={onClose}
            onDetailTitle={setDetailTitle}
          />
        ) : (
          <CompendiumPicker
            spec={spellSpec}
            mode="add"
            onClose={onClose}
            onDetailTitle={setDetailTitle}
            autoFocus
          />
        )}
      </ModalStage>
    </ModalShell>
  );
}

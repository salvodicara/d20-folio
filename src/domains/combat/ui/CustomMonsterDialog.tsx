/**
 * The DM's own monster on the new fight screen (the classic custom-monster form, in
 * short; D&D Beyond's encounter builder has a manual entry for the same): a name,
 * Armor Class, maximum HP, an optional Challenge Rating and notes, kept in the DM's
 * library so «Aggiungi mostri» lists it first. One «Salva».
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  customMonsterFromForm,
  customMonsterToForm,
  type CustomMonsterForm,
} from "@/domains/combat/custom-monster-form";
import type { CustomMonster } from "@/types/campaign";
import { Button, Dialog, Field, TextArea } from "@/ui";

export function CustomMonsterDialog({
  initial,
  onSave,
  onClose,
}: {
  /** The template being edited; absent for a new one. */
  initial?: CustomMonster;
  onSave: (monster: CustomMonster) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<CustomMonsterForm>(() => customMonsterToForm(initial));
  const monster = customMonsterFromForm(form, initial);
  const set = (key: keyof CustomMonsterForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={initial ? initial.name : t("fight.custom.new")}
      closeLabel={t("common.close")}
      actions={
        <Button
          kind="primary"
          wide
          disabled={!monster}
          onClick={() => {
            if (!monster) return;
            onSave(monster);
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="f-ask">
        <Field
          label={t("campaignHub.encounterMonsterName")}
          autoComplete="off"
          autoFocus
          maxLength={60}
          value={form.name}
          onChange={(e) => set("name")(e.target.value)}
        />
      </div>
      <div className="f-ask f-two-fields">
        <Field
          label={t("stats.ac")}
          inputMode="numeric"
          autoComplete="off"
          value={form.ac}
          onChange={(e) => set("ac")(e.target.value)}
        />
        <Field
          label={t("campaignHub.encounterMonsterMaxHp")}
          inputMode="numeric"
          autoComplete="off"
          value={form.maxHp}
          onChange={(e) => set("maxHp")(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <Field
          label={t("fight.dm.crLabel")}
          help={t("fight.custom.crHelp")}
          autoComplete="off"
          value={form.cr}
          onChange={(e) => set("cr")(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <TextArea
          label={t("campaignHub.encounterMonsterNotes")}
          rows={3}
          value={form.notes}
          onChange={(e) => set("notes")(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

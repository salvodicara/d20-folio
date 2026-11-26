/**
 * «Oggetto personalizzato», the custom tab of «Aggiungi un oggetto» (#1230). Pattern
 * source: D&D Beyond's «Manage Inventory» → custom item (name, quantity, weight, cost,
 * notes). The item is the classic sheet's homebrew gear (`customGearFromDraft`) and
 * lands through the shared create move, kept in the library, with the 5 s undo.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { addCustomEquipmentUndoable } from "@/features/character/custom-entry-commands";
import {
  customGearFromDraft,
  type CustomGearDraft,
  type CustomGearErrors,
} from "@/lib/custom-item";
import { usesMetric, type Locale } from "@/lib/locale";
import { Button, Field, Stepper, TextArea } from "@/ui";

const EMPTY: CustomGearDraft = {
  name: "",
  quantity: 1,
  weight: "",
  cost: "",
  description: "",
};

export function PlayCustomItem({
  locale,
  onAdded,
}: {
  locale: Locale;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(EMPTY);
  // errors show once the player has tried to add, then follow the fields
  const [tried, setTried] = useState(false);
  const out = customGearFromDraft(draft, locale);
  const errors: CustomGearErrors = tried && !out.ok ? out.errors : {};
  const set = (patch: Partial<CustomGearDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const numberError = t("play.inv.customNumber");
  const add = () => {
    setTried(true);
    if (!out.ok) return;
    addCustomEquipmentUndoable(
      out.item,
      t("play.inv.addedToast", { name: draft.name.trim() }),
      t
    );
    onAdded();
  };
  return (
    <form
      className="f-stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <Field
        label={t("common.name")}
        autoComplete="off"
        required
        value={draft.name}
        error={errors.name ? t("common.nameRequired") : undefined}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className="f-field">
        <span className="f-lbl">{t("common.quantity")}</span>
        <Stepper
          value={draft.quantity}
          min={1}
          max={999}
          label={t("common.quantity")}
          less={t("play.inv.oneLess")}
          more={t("play.inv.oneMore")}
          onChange={(quantity) => set({ quantity })}
        />
      </div>
      <div className="f-form-pair">
        <Field
          label={t("play.inv.customWeight", { unit: usesMetric(locale) ? "kg" : "lb" })}
          inputMode="decimal"
          autoComplete="off"
          value={draft.weight}
          help={t("play.inv.optional")}
          error={errors.weight ? numberError : undefined}
          onChange={(e) => set({ weight: e.target.value })}
        />
        <Field
          label={t("play.inv.customCost")}
          inputMode="decimal"
          autoComplete="off"
          value={draft.cost}
          help={t("play.inv.optional")}
          error={errors.cost ? numberError : undefined}
          onChange={(e) => set({ cost: e.target.value })}
        />
      </div>
      <TextArea
        label={t("common.description")}
        rows={3}
        value={draft.description}
        onChange={(e) => set({ description: e.target.value })}
      />
      <Button kind="primary" type="submit">
        {t("play.inv.customAdd")}
      </Button>
    </form>
  );
}

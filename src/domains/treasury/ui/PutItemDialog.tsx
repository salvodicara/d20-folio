import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Dialog, Field } from "@/ui";

/** «Metti un oggetto»: an object by name, how many, and an optional note. */
export function PutItemDialog({
  onClose,
  onPut,
}: {
  onClose: () => void;
  onPut: (item: { name: string; quantity: number; note: string }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const n = Math.floor(Number(quantity));
  const valid = name.trim().length > 0 && n >= 1;
  return (
    <Dialog
      open
      onClose={onClose}
      color="tes"
      title={t("treasury.putItem")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => onPut({ name: name.trim(), quantity: n, note: note.trim() })}
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-stack">
        <Field
          label={t("treasury.itemName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label={t("treasury.amount")}
          type="number"
          inputMode="numeric"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <Field
          label={t("treasury.note")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Dialog>
  );
}

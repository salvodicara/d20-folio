import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Dialog, Field } from "@/ui";

/** Type the d20 you rolled at the table; the sheet's bonus is added for the order. */
export function RollDialog({
  bonus,
  onClose,
  onRoll,
}: {
  bonus: number;
  onClose: () => void;
  onRoll: (d20: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const d20 = Number(value);
  const valid = Number.isInteger(d20) && d20 >= 1 && d20 <= 20;
  const sign = bonus >= 0 ? "+" : "−";
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("campaignHub.encounterRollInitiative")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="quiet" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => {
              onRoll(d20);
              onClose();
            }}
          >
            {t("common.confirm")}
          </Button>
        </>
      }
    >
      <Field
        label={t("fight.rollLabel")}
        help={
          valid
            ? t("fight.rollTotal", {
                bonus: `${sign}${Math.abs(bonus)}`,
                total: d20 + bonus,
              })
            : t("fight.rollHelp", { bonus: `${sign}${Math.abs(bonus)}` })
        }
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </Dialog>
  );
}

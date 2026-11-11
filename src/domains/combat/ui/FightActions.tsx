import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Chip, Dialog, Field, Icon } from "@/ui";

/** Type the d20 you rolled at the table; the sheet's bonus is added for the order. */
export function RollDialog({
  bonus,
  onClose,
  onRoll,
  roll,
}: {
  bonus: number;
  onClose: () => void;
  onRoll: (d20: number) => void;
  /** The sheet's roll (D&D Beyond's roll with Advantage, BG3's roll modifiers): with
   *  Advantage or Disadvantage both d20s are asked and the higher or lower counts;
   *  Surprise lights Disadvantage. Absent: one d20. */
  roll?: {
    mode: "advantage" | "disadvantage" | "none";
    surprised: boolean;
    onSurprise: () => void;
  };
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [second, setSecond] = useState("");
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 20;
  const two = roll !== undefined && roll.mode !== "none";
  const first = Number(value);
  const other = Number(second);
  const d20 = two
    ? roll.mode === "advantage"
      ? Math.max(first, other)
      : Math.min(first, other)
    : first;
  const valid = ok(first) && (!two || ok(other));
  const sign = bonus >= 0 ? "+" : "−";
  const helpText = valid
    ? t("fight.rollTotal", {
        bonus: `${sign}${Math.abs(bonus)}`,
        total: d20 + bonus,
      })
    : t("fight.rollHelp", { bonus: `${sign}${Math.abs(bonus)}` });
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
      {roll && (
        <div className="f-ask">
          <div className="f-chips">
            <Chip pressed={roll.surprised} onClick={roll.onSurprise}>
              {roll.surprised && <Icon name="u-check" />}
              {t("play.roll.surprised")}
            </Chip>
          </div>
          {roll.mode !== "none" && (
            <p className="f-quiet">{t(`combat.rollMode.${roll.mode}`)}</p>
          )}
        </div>
      )}
      <Field
        label={two ? t("combat.d20FirstAria") : t("fight.rollLabel")}
        {...(two ? {} : { help: helpText })}
        type="number"
        inputMode="numeric"
        min={1}
        max={20}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {two && (
        <Field
          label={t("combat.d20SecondAria")}
          type="number"
          inputMode="numeric"
          min={1}
          max={20}
          value={second}
          help={helpText}
          onChange={(e) => setSecond(e.target.value)}
        />
      )}
    </Dialog>
  );
}

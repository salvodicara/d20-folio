import { useState } from "react";
import { useTranslation } from "react-i18next";

import { withPaidAdvantage } from "@/domains/play/roll-dialog-state";
import { Button, Chip, Dialog, Field, Icon } from "@/ui";

/** Type the d20 you rolled at the table; the sheet's bonus is added for the order. */
export function RollDialog({
  bonus,
  onClose,
  onRoll,
  roll,
}: {
  /** The roller's initiative bonus; null while it is not known yet (the party's sheets
   *  still loading): the dialog says so and «Conferma» waits, so a roll is never ordered
   *  or reported without it. */
  bonus: number | null;
  onClose: () => void;
  onRoll: (d20: number) => void;
  /** The sheet's roll (D&D Beyond's roll with Advantage, BG3's roll modifiers): with
   *  Advantage or Disadvantage both d20s are asked and the higher or lower counts;
   *  Surprise lights Disadvantage. Absent: one d20. */
  roll?: {
    mode: "advantage" | "disadvantage" | "none";
    surprised: boolean;
    onSurprise: () => void;
    /** A paid Advantage the sheet holds (a Luck Point), as the save entries offer
     *  it: chosen, the roll gains Advantage and `onPay` spends it on confirm. */
    paidAdvantage?: {
      options: ReadonlyArray<{ id: string; name: string }>;
      onPay: (id: string) => void;
    };
  };
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [second, setSecond] = useState("");
  const [paid, setPaid] = useState<string | null>(null);
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= 20;
  const mode = roll ? (paid ? withPaidAdvantage(roll.mode) : roll.mode) : "none";
  const two = mode !== "none";
  const first = Number(value);
  const other = Number(second);
  const d20 = two
    ? mode === "advantage"
      ? Math.max(first, other)
      : Math.min(first, other)
    : first;
  const valid = ok(first) && (!two || ok(other));
  const known = bonus !== null;
  const sign = (bonus ?? 0) >= 0 ? "+" : "−";
  const shown = `${sign}${Math.abs(bonus ?? 0)}`;
  const helpText = !known
    ? t("fight.rollWaiting")
    : valid
      ? t("fight.rollTotal", { bonus: shown, total: d20 + bonus })
      : t("fight.rollHelp", { bonus: shown });
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
            disabled={!valid || !known}
            onClick={() => {
              if (paid) roll?.paidAdvantage?.onPay(paid);
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
            {roll.mode !== "advantage" &&
              roll.paidAdvantage?.options.map((option) => (
                <Chip
                  key={option.id}
                  pressed={paid === option.id}
                  onClick={() => setPaid((on) => (on === option.id ? null : option.id))}
                >
                  {paid === option.id && <Icon name="u-check" />}
                  {option.name}
                </Chip>
              ))}
          </div>
          {mode !== "none" && <p className="f-quiet">{t(`combat.rollMode.${mode}`)}</p>}
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

/**
 * The DM's «Iniziativa» on the Scontro tab, opened from a monster line's number (D&D
 * Beyond's combat tracker: the initiative is typed in place and the list re-sorts). A
 * group line moves as one: every creature on it takes the new number. On a hero's line
 * the DM types the d20 a player rolled without the app (the classic InitVital), and the
 * total shows with the hero's bonus. «Su» / «Giù» move the line one place, for a tie.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { parseInitiative } from "@/domains/combat/initiative-edit";
import { Button, Dialog, Field } from "@/ui";

/** A d20 roll: a whole number from 1 to 20. */
function parseD20(text: string): number | null {
  const s = text.trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 20 ? n : null;
}

export function InitiativeDialog({
  name,
  count,
  value,
  hero,
  onSave,
  onUp,
  onDown,
  onClose,
}: {
  name: string;
  /** The creatures on the line: a group moves together. */
  count: number;
  value: number | null;
  /** A hero's line: `value` is their d20, and the total adds this bonus. */
  hero?: { bonus: number };
  onSave: (value: number) => void;
  /** Move the line one place up or down (absent: nowhere to go). */
  onUp?: () => void;
  onDown?: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value === null ? "" : String(value));
  const next = hero ? parseD20(text) : parseInitiative(text);
  const signed = (n: number) => (n >= 0 ? `+${String(n)}` : String(n));
  const ready = next !== null && next !== value;
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("fight.dm.initTitle", { name })}
      closeLabel={t("common.close")}
      actions={
        <Button
          kind="primary"
          wide
          disabled={!ready}
          onClick={() => {
            if (next === null) return;
            onSave(next);
            onClose();
          }}
        >
          {t("common.save")}
        </Button>
      }
    >
      <div className="f-ask">
        <Field
          label={hero ? t("fight.dm.heroRollLabel") : t("monster.initiative")}
          help={
            hero
              ? t("fight.dm.heroRollTotal", {
                  bonus: signed(hero.bonus),
                  total: next === null ? "—" : next + hero.bonus,
                })
              : count > 1
                ? t("fight.dm.initGroup", { count })
                : undefined
          }
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="f-in f-in-big"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="f-quiet f-ask">
        {t(hero ? "fight.dm.heroRollHelp" : "fight.dm.initHelp")}
      </p>
      {(onUp || onDown) && (
        <div className="f-ask f-chips">
          {onUp && (
            <Button
              icon="u-expand"
              data-icon-up=""
              onClick={() => {
                onUp();
                onClose();
              }}
            >
              {t("common.moveUp")}
            </Button>
          )}
          {onDown && (
            <Button
              icon="u-expand"
              onClick={() => {
                onDown();
                onClose();
              }}
            >
              {t("common.moveDown")}
            </Button>
          )}
        </div>
      )}
    </Dialog>
  );
}

/**
 * The DM's «Iniziativa» on the Scontro tab, opened from a monster line's number (D&D
 * Beyond's combat tracker: the initiative is typed in place and the list re-sorts). A
 * group line moves as one: every creature on it takes the new number.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { parseInitiative } from "@/domains/combat/initiative-edit";
import { Button, Dialog, Field } from "@/ui";

export function InitiativeDialog({
  name,
  count,
  value,
  onSave,
  onClose,
}: {
  name: string;
  /** The creatures on the line: a group moves together. */
  count: number;
  value: number | null;
  onSave: (value: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(value === null ? "" : String(value));
  const next = parseInitiative(text);
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
          label={t("monster.initiative")}
          help={count > 1 ? t("fight.dm.initGroup", { count }) : undefined}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="f-in f-in-big"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <p className="f-quiet f-ask">{t("fight.dm.initHelp")}</p>
    </Dialog>
  );
}

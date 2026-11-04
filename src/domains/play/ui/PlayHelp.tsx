/**
 * The Help action in a fight on the Play screen: «Su chi?», an enemy (the next
 * attack against it has Advantage) or an ally (its next ability check does), the
 * rule in one line for the side picked; «Aiuta» uses the action and writes the
 * effect (`giveHelp`, which picks the form by side), with an undo toast.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { HelpView } from "@/domains/play/help-view";
import { Button, Chip, Dialog } from "@/ui";

export function PlayHelp({
  view,
  onHelp,
  onClose,
}: {
  view: HelpView;
  onHelp: (targetId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const only = [...view.enemies, ...view.allies];
  const [target, setTarget] = useState<string | null>(
    only.length === 1 ? (only[0]?.id ?? null) : null
  );
  // Each side says what Help does to it: the attack form, or the ability-check form.
  const group = (label: string, rule: string, list: HelpView["enemies"]) =>
    list.length > 0 && (
      <div className="f-ask">
        <span className="f-lbl">{label}</span>
        <p className="f-help">{rule}</p>
        <div className="f-chips">
          {list.map((c) => (
            <Chip key={c.id} pressed={target === c.id} onClick={() => setTarget(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
    );
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("play.help.title")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!target}
            onClick={() => target && onHelp(target)}
          >
            {t("play.help.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        {group(t("play.help.enemies"), t("play.help.hint"), view.enemies)}
        {group(t("play.help.allies"), t("play.help.hintAlly"), view.allies)}
      </div>
    </Dialog>
  );
}

/**
 * The Help action in a fight on the Play screen: «Su chi?» (the enemy) and the rule
 * in one line; «Aiuta» uses the action and writes the effect (`giveHelp`), with an
 * undo toast.
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
  onHelp: (enemyId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [enemy, setEnemy] = useState<string | null>(
    view.enemies.length === 1 ? (view.enemies[0]?.id ?? null) : null
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
          <Button kind="primary" disabled={!enemy} onClick={() => enemy && onHelp(enemy)}>
            {t("play.help.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("campaignHub.encounterActionOnWhom")}</span>
        <p className="f-help">{t("play.help.hint")}</p>
        <div className="f-chips">
          {view.enemies.map((c) => (
            <Chip key={c.id} pressed={enemy === c.id} onClick={() => setEnemy(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

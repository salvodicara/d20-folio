/**
 * The Help action in a fight on the Play screen: «Su chi?» (the enemy), then «Per
 * chi?» (the ally whose next attack against it has Advantage); «Aiuta» uses the action
 * and writes the effect (`giveHelp`).
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
  onHelp: (enemyId: string, allyId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [enemy, setEnemy] = useState<string | null>(
    view.enemies.length === 1 ? (view.enemies[0]?.id ?? null) : null
  );
  const [ally, setAlly] = useState<string | null>(
    view.allies.length === 1 ? (view.allies[0]?.id ?? null) : null
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
            disabled={!enemy || !ally}
            onClick={() => enemy && ally && onHelp(enemy, ally)}
          >
            {t("play.help.confirm")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("campaignHub.encounterActionOnWhom")}</span>
        <div className="f-chips">
          {view.enemies.map((c) => (
            <Chip key={c.id} pressed={enemy === c.id} onClick={() => setEnemy(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="f-ask">
        <span className="f-lbl">{t("play.help.forWhom")}</span>
        <p className="f-help">{t("play.help.hint")}</p>
        <div className="f-chips">
          {view.allies.map((c) => (
            <Chip key={c.id} pressed={ally === c.id} onClick={() => setAlly(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

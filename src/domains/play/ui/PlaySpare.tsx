/**
 * «Chi risparmi?» on the Play screen: before a zone that spares whom its caster
 * designates (Spirit Guardians), the creatures it could catch, the allies already
 * ticked; the cast carries the pick (`executeAction(action, { spared })`).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SpareView } from "@/domains/play/spare-view";
import { Button, Chip, Dialog } from "@/ui";

export function PlaySpare({
  spellName,
  view,
  onCast,
  onClose,
}: {
  spellName: string;
  view: SpareView;
  onCast: (spared: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [spared, setSpared] = useState<ReadonlySet<string>>(() => new Set(view.spared));
  const toggle = (id: string) =>
    setSpared((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      // Glue the name's last two words so a narrow title never ends on one word.
      title={t("play.ask.castTitle", { name: spellName.replace(/ (\S+)$/, " $1") })}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            onClick={() =>
              onCast(view.choices.map((c) => c.id).filter((id) => spared.has(id)))
            }
          >
            {t("spells.cast")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <span className="f-lbl">{t("play.spare.which")}</span>
        <p className="f-help">{t("play.spare.hint")}</p>
        <div className="f-chips">
          {view.choices.map((c) => (
            <Chip key={c.id} pressed={spared.has(c.id)} onClick={() => toggle(c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

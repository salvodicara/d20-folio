/**
 * «Gestisci incantesimi» on the Play screen: the levelled spells a prepared caster
 * chooses among, by level, each a choice that flips prepared (`togglePrepared`, the
 * one rule), with how many are prepared against the most. A spell a subclass always
 * prepares stays on and says so; going over the limit is allowed and noted.
 */
import { useTranslation } from "react-i18next";

import { prepareList } from "@/domains/play/play-spells-view";
import type { Locale } from "@/lib/locale";
import { togglePrepared } from "@/lib/play/spell-prep";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Choice, Dialog } from "@/ui";

export function PlayPrepare({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const list = prepareList(doc, locale);
  const flip = (idx: number) => {
    const store = useCharacterStore.getState();
    const live = store.character;
    const next = live ? togglePrepared(live, idx) : null;
    if (next) store.setCharacter(next);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={t("play.spells.manage")}
      closeLabel={t("common.close")}
      actions={
        <Button kind="primary" onClick={onClose}>
          {t("common.done")}
        </Button>
      }
    >
      <div className="f-ask">
        <p className="f-note" data-c="res" role="status">
          {t("play.spells.prepared", { count: list.count, max: list.max })}
          {list.overLimit ? ` ${t("play.spells.overLimit")}` : ""}
        </p>
      </div>
      {list.levels.map(({ level, spells }) => (
        <div key={level} className="f-ask">
          <span className="f-lbl">{t("spells.level", { level })}</span>
          <div className="f-choices">
            {spells.map((s) => (
              <Choice
                key={s.idx}
                on={s.prepared}
                disabled={s.always}
                onClick={() => flip(s.idx)}
              >
                <span className="f-choice-main">
                  <span className="f-row-t">{s.name}</span>
                  {s.always && (
                    <span className="f-choice-s">{t("play.spells.always")}</span>
                  )}
                </span>
              </Choice>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  );
}

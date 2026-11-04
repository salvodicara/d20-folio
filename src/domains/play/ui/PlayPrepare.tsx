/**
 * «Gestisci incantesimi» on the Play screen: the levelled spells a prepared caster
 * chooses among, by level, each a choice that flips prepared (`togglePrepared`, the
 * one rule), with how many are prepared against the most. A spell a subclass always
 * prepares stays on and says so; going over the limit is allowed and noted.
 */
import { useTranslation } from "react-i18next";

import { prepareList } from "@/domains/play/play-spells-view";
import type { Locale } from "@/lib/locale";
import { setViaClass, togglePrepared } from "@/lib/play/spell-prep";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Choice, Dialog } from "@/ui";

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
  const via = (idx: number, classId: string) => {
    const store = useCharacterStore.getState();
    const live = store.character;
    const next = live ? setViaClass(live, idx, classId) : null;
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
              <div key={s.idx} className="f-prep">
                <Choice on={s.prepared} disabled={s.always} onClick={() => flip(s.idx)}>
                  <span className="f-choice-main">
                    <span className="f-row-t">{s.name}</span>
                    {s.always && (
                      <span className="f-choice-s">{t("play.spells.always")}</span>
                    )}
                  </span>
                </Choice>
                {/* A spell two of the classes share: which one it comes through (its
                    casting ability). None picked: the sheet decides. */}
                {s.via && (
                  <div
                    className="f-chips"
                    role="group"
                    aria-label={`${t("play.spells.via")}: ${s.name}`}
                  >
                    <span className="f-lbl">{t("play.spells.via")}</span>
                    {s.via.options.map((o) => (
                      <Chip
                        key={o.classId}
                        pressed={s.via?.current === o.classId}
                        onClick={() => via(s.idx, o.classId)}
                      >
                        {o.label}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </Dialog>
  );
}

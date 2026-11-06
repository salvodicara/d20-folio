/**
 * «Gestisci incantesimi» on the Play screen: the levelled spells a prepared caster
 * chooses among, by level, each a choice that flips prepared (`togglePrepared`, the
 * one rule), with how many are prepared against the most. A spell a subclass always
 * prepares stays on and says so; going over the limit is allowed and noted.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { canFlipInStep, type LongRestChange } from "@/domains/play/long-rest-change";

import { prepareList } from "@/domains/play/play-spells-view";
import { ActionGlyph } from "@/domains/play/ui/ActionIcon";
import { spellPickRows } from "@/domains/spells/spell-pick-rows";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import type { Locale } from "@/lib/locale";
import { setViaClass, togglePrepared } from "@/lib/play/spell-prep";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Choice, Dialog } from "@/ui";

export function PlayPrepare({
  doc,
  locale,
  onClose,
  longRest,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
  /** After a Long Rest: «Cambia incantesimi preparati», within the class's limit. */
  longRest?: LongRestChange;
}) {
  const { t } = useTranslation();
  const list = prepareList(doc, locale);
  // each spell's level line and effect tag, as the spell picks show them
  const pick = new Map(
    spellPickRows(
      list.levels.flatMap((g) => g.spells.flatMap((x) => (x.spellId ? [x.spellId] : []))),
      locale
    ).map((r) => [
      r.id,
      {
        levelLine: `${r.level === 0 ? t("spells.cantrip") : t("spells.level", { level: r.level })} · ${r.school}`,
        effect: r.effect,
      },
    ])
  );
  const preparedNow = new Set(
    list.levels.flatMap((g) =>
      g.spells.filter((s) => s.prepared && !s.always).map((s) => s.idx)
    )
  );
  // the prepared spells the step opened with: the limit counts changes against them
  const [start] = useState(preparedNow);
  const canFlip = (idx: number) =>
    !longRest || canFlipInStep(longRest, start, preparedNow, idx);
  const flip = (idx: number) => {
    const store = useCharacterStore.getState();
    const live = store.character;
    const next = live ? togglePrepared(live, idx) : null;
    if (next) store.setCharacter(next);
  };
  // «Tieni così»: the prepared spells go back to how the step found them
  const keep = () => {
    for (const idx of [...start, ...preparedNow])
      if (start.has(idx) !== preparedNow.has(idx)) flip(idx);
    onClose();
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
      title={t(longRest ? "play.rest.changePrepared" : "play.spells.manage")}
      closeLabel={t("common.close")}
      actions={
        <>
          {longRest && (
            <Button kind="quiet" onClick={keep}>
              {t("play.rest.keepPrepared")}
            </Button>
          )}
          <Button kind="primary" onClick={onClose}>
            {t("common.done")}
          </Button>
        </>
      }
    >
      {/* the limit, then the count against the most (the level-up's «1/1») */}
      <div className="f-pick-title f-prep-head" role="status">
        <span className="f-help">
          {longRest
            ? t(longRest === "one" ? "play.rest.changeOne" : "play.rest.changeAny")
            : t("play.spells.preparedLabel")}
          {list.overLimit ? ` ${t("play.spells.overLimit")}` : ""}
        </span>
        <span
          className="f-lvl-count"
          data-state={list.overLimit ? undefined : "done"}
          aria-label={t("play.spells.prepared", { count: list.count, max: list.max })}
        >
          {`${String(list.count)}/${String(list.max)}`}
        </span>
      </div>
      {list.levels.map(({ level, spells }) => (
        <div key={level} className="f-ask">
          <span className="f-lbl">{t("spells.level", { level })}</span>
          <div className="f-choices">
            {spells.map((s) => (
              <div key={s.idx} className="f-prep">
                <Choice
                  on={s.prepared}
                  disabled={s.always || !canFlip(s.idx)}
                  onClick={() => flip(s.idx)}
                >
                  <span className="f-act-slot" data-painted="" aria-hidden="true">
                    {s.spellId && s.school ? (
                      <SpellArt id={s.spellId} school={s.school} size="fill" />
                    ) : (
                      <ActionGlyph icon={{ kind: "spell" }} />
                    )}
                  </span>
                  <span className="f-choice-main">
                    <span className="f-row-t">{s.name}</span>
                    <span className="f-choice-s">
                      {pick.get(s.spellId ?? "")?.levelLine}
                    </span>
                    {s.always && (
                      <span className="f-choice-s">{t("play.spells.always")}</span>
                    )}
                  </span>
                  {pick.get(s.spellId ?? "")?.effect && (
                    <span className="f-prep-eff">
                      {pick.get(s.spellId ?? "")?.effect}
                    </span>
                  )}
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

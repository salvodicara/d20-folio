/**
 * «Condizioni» on the Play header (approved prototype x-play-cond): the chip opens a
 * panel with each condition and what it does, «Togli», and «Aggiungi una condizione».
 * A source-gated condition (Frightened) whose sight the sheet can't derive asks
 * «Non vedo la fonte» (`needsSeesAnswer`, the `set-sees-source` event). On a phone the
 * panel is a sheet from the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SRD_CONDITIONS } from "@/data/conditions";
import { useConditionEncounter } from "@/features/character/condition-encounter";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { hasSrd, localizeSrd, localizeSrdList } from "@/i18n/resolver";
import { conditionSourceInstances, needsSeesAnswer } from "@/lib/condition-sources";
import type { Locale } from "@/lib/locale";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Panel } from "@/ui";

export function PlayConditions({
  doc,
  locale,
  count,
}: {
  doc: CharacterDoc;
  locale: Locale;
  count: number;
}) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const encounter = useConditionEncounter(doc.id);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const active = doc.session.conditions;
  const asks = conditionSourceInstances(doc, encounter).filter(needsSeesAnswer);
  const name = (id: string) => localizeSrd("condition", id, "name", locale);
  const effect = (id: string) =>
    hasSrd("condition", id, "effects", locale)
      ? (localizeSrdList("condition", id, "effects", locale)[0] ?? "")
      : "";
  const addable = SRD_CONDITIONS.map((c) => c.id).filter((id) => !active.includes(id));
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip kind="cond" pressed={open} onClick={() => setOpen((o) => !o)}>
        {`⚠ ${t("combat.effectReview.conditions")}`}
        {count > 0 && <span className="f-chip-n">{count}</span>}
      </Chip>
      {open && (
        <div
          className="f-condpop"
          role="dialog"
          aria-label={t("combat.effectReview.conditions")}
        >
          <Panel color="cond" title={t("combat.effectReview.conditions")}>
            {active.length === 0 && (
              <p className="f-quiet">{t("character.noConditions")}</p>
            )}
            {active.map((id) => {
              const ask = asks.find((a) => a.conditionId === id);
              return (
                <div key={id} className="f-cond-row">
                  <div className="f-cond-main">
                    <span className="f-row-t">{name(id)}</span>
                    {effect(id) && <span className="f-row-s">{effect(id)}</span>}
                    {ask && !readonly && (
                      <div className="f-chips">
                        <Chip
                          pressed={ask.seesSource === false}
                          onClick={() =>
                            useCharacterStore.getState().dispatch({
                              kind: "set-sees-source",
                              key: ask.key,
                              sees: ask.seesSource === false ? null : false,
                            })
                          }
                        >
                          {t("play.conditions.cantSeeSource")}
                        </Chip>
                      </div>
                    )}
                  </div>
                  {!readonly && (
                    <Button
                      onClick={() => useCharacterStore.getState().removeCondition(id)}
                    >
                      {t("common.remove")}
                    </Button>
                  )}
                </div>
              );
            })}
            {!readonly &&
              (adding ? (
                <div className="f-chips f-cond-add">
                  {addable.map((id) => (
                    <Chip
                      key={id}
                      onClick={() => {
                        useCharacterStore.getState().addCondition(id);
                        setAdding(false);
                      }}
                    >
                      {name(id)}
                    </Chip>
                  ))}
                </div>
              ) : (
                <Button kind="quiet" icon="u-add" onClick={() => setAdding(true)}>
                  {t("character.addCondition")}
                </Button>
              ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

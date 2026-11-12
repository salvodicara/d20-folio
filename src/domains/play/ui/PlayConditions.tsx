/**
 * «Condizioni» on the Play header (approved prototype x-play-cond): the chip opens a
 * panel with each condition and what it does, «Rimuovi», Exhaustion as a level 1–6,
 * and «Aggiungi condizione». A source-gated condition (Frightened) whose sight the
 * sheet can't derive asks «Non vedo la fonte»; Grappled, Frightened and Charmed added
 * by hand ask «Da chi?» among the fight's other combatants (or skip). On a phone the
 * panel is a sheet from the bottom.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { asksSource, conditionsPanelView } from "@/domains/play/play-conditions-view";
import { useNamedConditionEncounter } from "@/features/character/condition-encounter";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { extinguish, setOnFire, type Extinguish } from "@/lib/play/environment";
import { localeDistance } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import type { CharacterDoc, SessionState } from "@/types/character";
import { Button, Chip, Panel, Stepper } from "@/ui";

export function PlayConditions({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  /** A condition waiting for «Da chi?». */
  const [pending, setPending] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const encounter = useNamedConditionEncounter(doc.id);
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
  const view = conditionsPanelView(doc, locale, encounter);
  if (readonly && view.count === 0 && !doc.session.burning) return null;
  const store = () => useCharacterStore.getState();
  // Exhaustion changed by hand writes its report line («Indebolimento 1 → 2»).
  const setExhaustion = (level: number) => {
    const was = store().character?.session.exhaustion ?? 0;
    store().changeResourceByHand(
      () => store().setExhaustion(level),
      () => store().setExhaustion(was)
    );
  };
  // Burning (SRD 5.2.1): set by hand, put out by rolling on the ground (the Action,
  // then Prone) or from outside; each with its undo.
  const burning = Boolean(doc.session.burning);
  // The whole session is replaced (a merge could not take `burning` away).
  const replaceSession = (next: SessionState) =>
    useCharacterStore.setState((st) =>
      st.readonly || !st.character
        ? st
        : { character: { ...st.character, session: next } }
    );
  const withUndo = (next: SessionState, message: string) => {
    const before = store().character?.session;
    if (!before) return;
    const apply = () => replaceSession(next);
    apply();
    registerUndoableResult(
      { message },
      () => {
        replaceSession(before);
        return true;
      },
      apply
    );
  };
  // Holding breath and choking (SRD 5.2.1 Suffocation) are the engine's sheet events:
  // each End Turn counts the air down (`breath-turn-end`); breathing again takes back
  // the Exhaustion it gave.
  const breath = doc.session.breath;
  const breathEvent = (
    event: { kind: "hold-breath"; choking?: boolean } | { kind: "breathe-again" },
    label: string
  ) => {
    const undo = store().dispatch(event);
    if (undo)
      registerUndoableResult({ message: t(label) }, undo, () => store().dispatch(event));
  };
  const catchFire = () => {
    const next = setOnFire(doc);
    if (next) withUndo(next, t("play.fire.caught"));
  };
  const putOut = (how: Extinguish) => {
    const out = extinguish(doc, how);
    if (!out) return;
    withUndo(out.session, t(how === "roll" ? "play.fire.rolled" : "play.fire.putOut"));
  };
  const add = (id: string, sourceId?: string) => {
    if (id === "exhaustion") setExhaustion(1);
    else store().addCondition(id, sourceId ? { sourceId } : undefined);
    setPending(null);
    setAdding(false);
  };
  const pick = (id: string) =>
    asksSource(id) && view.sources.length > 0 ? setPending(id) : add(id);
  const name = (id: string) => localizeSrd("condition", id, "name", locale);
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip kind="cond" pressed={open} onClick={() => setOpen((o) => !o)}>
        {`⚠ ${t("combat.effectReview.conditions")}`}
        {/* burning counts as one more state on the character */}
        {view.count + (doc.session.burning ? 1 : 0) > 0 && (
          <span className="f-chip-n">{view.count + (doc.session.burning ? 1 : 0)}</span>
        )}
      </Chip>
      {open && (
        <div
          className="f-condpop"
          role="dialog"
          aria-label={t("combat.effectReview.conditions")}
        >
          <Panel color="cond" title={t("combat.effectReview.conditions")}>
            {view.count === 0 && <p className="f-quiet">{t("character.noConditions")}</p>}
            {view.exhaustion.level > 0 && (
              <div className="f-cond-row">
                <div className="f-cond-main">
                  <span className="f-row-t">{name("exhaustion")}</span>
                  <span className="f-row-s">
                    {view.exhaustion.level >= view.exhaustion.max
                      ? t("play.conditions.exhaustionDeath", {
                          level: view.exhaustion.max,
                        })
                      : t("play.conditions.exhaustionLevel", {
                          level: view.exhaustion.level,
                          d20: view.exhaustion.d20,
                          speed: localeDistance(view.exhaustion.speedFt, locale),
                        })}
                  </span>
                  {!readonly && (
                    <Stepper
                      value={view.exhaustion.level}
                      min={1}
                      max={view.exhaustion.max}
                      label={`${name("exhaustion")} · ${t("common.level")}`}
                      less={t("common.decrease")}
                      more={t("common.increase")}
                      onChange={(level) => setExhaustion(level)}
                    />
                  )}
                </div>
                {!readonly && (
                  <Button onClick={() => setExhaustion(0)}>{t("common.remove")}</Button>
                )}
              </div>
            )}
            {view.rows.map((row) => (
              <div key={row.id} className="f-cond-row">
                <div className="f-cond-main">
                  <span className="f-row-t">
                    {row.source
                      ? t("play.conditions.withSource", {
                          name: row.name,
                          source: row.source,
                        })
                      : row.name}
                  </span>
                  {row.effect && <span className="f-row-s">{row.effect}</span>}
                  {row.ask && !readonly && (
                    <div className="f-chips">
                      <Chip
                        pressed={row.ask.pressed}
                        onClick={() =>
                          store().dispatch({
                            kind: "set-sees-source",
                            key: row.ask?.key ?? "",
                            sees: row.ask?.pressed ? null : false,
                          })
                        }
                      >
                        {t("play.conditions.cantSeeSource")}
                      </Chip>
                    </div>
                  )}
                </div>
                {!readonly && (
                  <Button onClick={() => store().removeCondition(row.id)}>
                    {t("common.remove")}
                  </Button>
                )}
              </div>
            ))}
            {burning && (
              <div className="f-cond-row" data-fire="">
                <div className="f-cond-main">
                  <span className="f-row-t">{t("play.fire.name")}</span>
                  <span className="f-row-s">{t("play.fire.note", { dice: "1d4" })}</span>
                  {!readonly && (
                    <div className="f-chips">
                      <Chip onClick={() => putOut("roll")}>{t("play.fire.roll")}</Chip>
                      <Chip onClick={() => putOut("doused")}>{t("play.fire.out")}</Chip>
                    </div>
                  )}
                </div>
              </div>
            )}
            {breath && (
              <div className="f-cond-row">
                <div className="f-cond-main">
                  <span className="f-row-t">
                    {t(breath.choking ? "play.breath.choking" : "play.breath.name")}
                  </span>
                  <span className="f-row-s">
                    {breath.roundsLeft > 0
                      ? t("play.breath.left", { count: breath.roundsLeft })
                      : t("play.breath.out")}
                  </span>
                </div>
                {!readonly && (
                  <Button
                    onClick={() =>
                      breathEvent({ kind: "breathe-again" }, "play.breath.again")
                    }
                  >
                    {t("play.breath.again")}
                  </Button>
                )}
              </div>
            )}
            {!readonly && (!burning || !breath) && (
              <div className="f-ask">
                <span className="f-lbl">{t("play.fire.situations")}</span>
                <div className="f-chips">
                  {!burning && (
                    <Chip pressed={false} onClick={catchFire}>
                      {t("play.fire.name")}
                    </Chip>
                  )}
                  {!breath && (
                    <Chip
                      pressed={false}
                      onClick={() =>
                        breathEvent({ kind: "hold-breath" }, "play.breath.name")
                      }
                    >
                      {t("play.breath.name")}
                    </Chip>
                  )}
                  {!breath && (
                    <Chip
                      pressed={false}
                      onClick={() =>
                        breathEvent(
                          { kind: "hold-breath", choking: true },
                          "play.breath.choking"
                        )
                      }
                    >
                      {t("play.breath.choking")}
                    </Chip>
                  )}
                </div>
              </div>
            )}
            {!readonly &&
              (pending ? (
                <div className="f-cond-add">
                  <p className="f-row-t">
                    {t("play.conditions.fromWhom", { name: name(pending) })}
                  </p>
                  <div className="f-chips">
                    {view.sources.map((s) => (
                      <Chip key={s.id} onClick={() => add(pending, s.id)}>
                        {s.name}
                      </Chip>
                    ))}
                    <Chip onClick={() => add(pending)}>{t("common.skip")}</Chip>
                  </div>
                </div>
              ) : adding ? (
                <div className="f-chips f-cond-add">
                  {view.addable.map((id) => (
                    <Chip key={id} onClick={() => pick(id)}>
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

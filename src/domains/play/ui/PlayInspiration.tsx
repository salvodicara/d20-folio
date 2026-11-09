/**
 * «Ispirazione» on the Play header (BG3's status icon with its count; D&D Beyond's
 * Inspiration toggle): the chip turns gold while the character holds Heroic Inspiration
 * or an ally's Bardic Inspiration die, and opens a panel with each one, what it does,
 * and «Ricevuta» / «Usa». A die received is picked by its size; every spend has an undo.
 * The same popover as «Effetti» and «Condizioni».
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  INSPIRATION_DICE,
  playInspirationView,
} from "@/domains/play/play-inspiration-view";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Art, Button, Chip, Panel } from "@/ui";
import { ActionGlyph } from "./ActionIcon";

export function PlayInspiration({ doc }: { doc: CharacterDoc }) {
  const { t } = useTranslation();
  const readonly = useSheetReadonly();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  const view = playInspirationView(doc);
  if (readonly && view.count === 0) return null;
  const store = () => useCharacterStore.getState();
  const spendHeroic = () =>
    registerUndoableToast(
      { message: t("character.heroicInspirationSpent") },
      () => {
        store().setHeroicInspiration(false);
        return () => store().setHeroicInspiration(true);
      },
      { turnScoped: false }
    );
  const spendDie = (die: string) =>
    registerUndoableToast(
      { message: t("character.inspirationDieSpent", { die }) },
      () => {
        store().setBardicInspirationDie("");
        return () => store().setBardicInspirationDie(die);
      },
      { turnScoped: false }
    );
  const slot = (art: string, kind: "feature") => (
    <span className="f-act-slot" data-painted="" aria-hidden="true">
      <Art kind={kind} id={art} fallback={<ActionGlyph icon={{ kind: "feature" }} />} />
    </span>
  );
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip
        kind={view.count > 0 ? "insp" : undefined}
        pressed={open}
        onClick={() => setOpen((o) => !o)}
      >
        {`✧ ${t("character.inspiration")}`}
        {view.count > 0 && <span className="f-chip-n">{view.count}</span>}
      </Chip>
      {open && (
        <div className="f-condpop" role="dialog" aria-label={t("character.inspiration")}>
          <Panel color="res" title={t("character.inspiration")}>
            <div className="f-cond-row f-fx-row f-insp-row">
              {slot("fighter-champion-heroic-warrior", "feature")}
              <div className="f-cond-main">
                <span className="f-row-t">{t("character.heroicInspiration")}</span>
                <span className="f-fx-gist">{t("play.insp.heroicGist")}</span>
                <span className="f-row-s">
                  {view.heroic ? t("play.insp.held") : t("play.insp.fromDm")}
                </span>
              </div>
              {!readonly &&
                (view.heroic ? (
                  <Button kind="primary" onClick={spendHeroic}>
                    {t("common.use")}
                  </Button>
                ) : (
                  <Button onClick={() => store().setHeroicInspiration(true)}>
                    {t("play.insp.received")}
                  </Button>
                ))}
            </div>
            <div className="f-cond-row f-fx-row f-insp-row">
              {slot("bard-bardic-inspiration", "feature")}
              <div className="f-cond-main">
                <span className="f-row-t">
                  {view.die
                    ? t("play.insp.bardicDie", { die: view.die })
                    : t("play.insp.bardic")}
                </span>
                <span className="f-fx-gist">{t("play.insp.bardicGist")}</span>
                {view.die ? (
                  <span className="f-row-s">{t("play.insp.held")}</span>
                ) : (
                  !readonly && (
                    <div
                      className="f-chips"
                      role="group"
                      aria-label={t("play.insp.receivedDie")}
                    >
                      {INSPIRATION_DICE.map((die) => (
                        <Chip
                          key={die}
                          pressed={false}
                          ariaLabel={t("character.inspirationDieSet", { die })}
                          onClick={() => store().setBardicInspirationDie(die)}
                        >
                          {die}
                        </Chip>
                      ))}
                    </div>
                  )
                )}
              </div>
              {!readonly && view.die && (
                <Button kind="primary" onClick={() => spendDie(view.die ?? "")}>
                  {t("common.use")}
                </Button>
              )}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

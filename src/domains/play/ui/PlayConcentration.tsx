/**
 * The Concentration chip on the Play header (the classic StatusLedge's concentration
 * row, on the rules lane's `concentration-model`): it opens the same popover as
 * «Effetti», with the spell, the rounds it still holds, the condition that breaks it
 * (Incapacitated) as a warning, and «Interrompi concentrazione», with the store's undo.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  concentrationModel,
  dropConcentration,
} from "@/domains/play/concentration-model";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Panel } from "@/ui";

export function PlayConcentration({
  doc,
  locale,
}: {
  doc: CharacterDoc;
  locale: Locale;
}) {
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
  const model = concentrationModel(doc, locale);
  if (!model.spell) return null;
  return (
    <div className="f-condwrap" ref={ref}>
      <Chip kind="conc" pressed={open} onClick={() => setOpen((o) => !o)}>
        {/* it says what it is: a beginner reads «Trama Ipnotica» alone as an effect */}
        {`◉ ${t("combat.concentration")} · ${model.spell.name}`}
      </Chip>
      {open && (
        <div className="f-condpop" role="dialog" aria-label={model.spell.name}>
          <Panel color="res" title={t("play.concentration")}>
            <div className="f-cond-row">
              <div className="f-cond-main">
                <span className="f-row-t">{model.spell.name}</span>
                {model.roundsLeft !== null && (
                  <span className="f-row-s">
                    {t("play.effectsRounds", { count: model.roundsLeft })}
                  </span>
                )}
              </div>
            </div>
            {model.blockedBy && (
              <p className="f-note" data-c="cond" role="status">
                {t("combat.concentrationBlockedNote", {
                  condition: model.blockedBy.name,
                })}
              </p>
            )}
            {!readonly && (
              <div className="f-acts">
                <Button
                  kind={model.blockedBy ? "primary" : "ghost"}
                  onClick={() => {
                    dropConcentration();
                    setOpen(false);
                  }}
                >
                  {t("combat.clearConcentration")}
                </Button>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

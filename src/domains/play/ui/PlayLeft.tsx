/**
 * The Play screen's left column (approved prototype x-play): «Risorse», each pool with
 * what is left of it as pips (numbers alone past eight), and «Abilità», the six skills
 * worth seeing at a glance with all 18 one tap away.
 */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  playLeftView,
  resourceSpend,
  type PlayResource,
} from "@/domains/play/play-left-view";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { hasSrd, localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { hitDiceLabel, hitDicePool } from "@/lib/play/hit-dice";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Panel } from "@/ui";

const MAX_PIPS = 8;
const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayLeft({
  doc,
  locale,
  rests,
}: {
  doc: CharacterDoc;
  locale: Locale;
  /** The rest buttons, drawn here on a phone (the header carries them on a laptop). */
  rests?: ReactNode;
}) {
  const { t } = useTranslation();
  const view = playLeftView(doc, locale);
  const readonly = useSheetReadonly();
  const [all, setAll] = useState(false);
  const skills = all ? view.allSkills : view.topSkills;
  const label = (r: PlayResource) => {
    const row = r.row;
    if (row.kind === "spell-slot")
      return t(row.pact ? "play.pactSlot" : "play.slot", { level: row.level });
    if (row.kind === "class-resource") return row.name;
    if (row.kind === "hit-dice")
      return `${t("character.health.hitDice")} (${hitDiceLabel(hitDicePool(doc.character)).sizes})`;
    const name = hasSrd("magic-item", row.itemId, "name", locale)
      ? localizeSrd("magic-item", row.itemId, "name", locale)
      : row.itemId;
    return row.copyNumber ? `${name} ${String(row.copyNumber)}` : name;
  };
  return (
    <div className="f-stack">
      {rests && <div className="f-rest-phone">{rests}</div>}
      {view.resources.length > 0 && (
        <Panel color="res" title={t("character.hud.resources")}>
          {view.resources.map((r) => {
            const body = (
              <>
                <span className="f-res-t">{label(r)}</span>
                {r.max > 1 && r.max <= MAX_PIPS && (
                  <span className="f-pips" aria-hidden="true">
                    {Array.from({ length: r.max }, (_, i) => (
                      <i key={i} data-on={i < r.left || undefined} />
                    ))}
                  </span>
                )}
                <span className="f-res-n">{`${String(r.left)}/${String(r.max)}`}</span>
              </>
            );
            // A pool with something left spends one on a tap (prototype «Tocca per
            // spendere»), with its undo toast.
            const spend = readonly ? null : resourceSpend(r);
            return spend ? (
              <button
                key={r.id}
                type="button"
                className="f-res"
                data-kind={r.row.kind}
                aria-label={t("play.res.spendLabel", {
                  name: label(r),
                  left: r.left,
                  max: r.max,
                })}
                onClick={() =>
                  registerUndoableToast(
                    {
                      message: t("play.res.spent", {
                        name: label(r),
                        left: r.left - 1,
                        max: r.max,
                      }),
                    },
                    () => {
                      // By hand: the spend writes its report line; the undo removes it.
                      let undo: (() => void) | null = null;
                      return useCharacterStore.getState().changeResourceByHand(
                        () => {
                          undo = useCharacterStore.getState().dispatch(spend);
                        },
                        () => undo?.()
                      );
                    },
                    { turnScoped: false }
                  )
                }
              >
                {body}
              </button>
            ) : (
              <div key={r.id} className="f-res" data-kind={r.row.kind}>
                {body}
              </div>
            );
          })}
        </Panel>
      )}
      <Panel color="abi" title={t("character.skills")}>
        {skills.map((s) => (
          <div key={s.id} className="f-skill" data-prof={s.proficient || undefined}>
            <span className="f-lbl">{t(`abilities.${s.ability}_short`)}</span>
            <span className="f-skill-t">{t(`skills.${s.id}`)}</span>
            <b>{signed(s.bonus)}</b>
          </div>
        ))}
        <Button kind="quiet" onClick={() => setAll(!all)}>
          {all
            ? t("play.fewerSkills")
            : t("play.allSkills", { count: view.allSkills.length })}
        </Button>
      </Panel>
    </div>
  );
}

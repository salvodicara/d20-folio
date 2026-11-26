/**
 * The Play screen's left column (approved prototype x-play): «Risorse», each pool with
 * what is left of it as pips (numbers alone past eight), and «Abilità», the six skills
 * worth seeing at a glance with all 18 one tap away; a skill opens its pane.
 */
import { useState } from "react";
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

import { PlayProficiencies } from "./PlayFeatures";
import { PlayNumberPane } from "./PlayNumberPane";
import { PlaySenses } from "./PlaySenses";

const MAX_PIPS = 8;
const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayLeft({ doc, locale }: { doc: CharacterDoc; locale: Locale }) {
  const { t } = useTranslation();
  const view = playLeftView(doc, locale);
  const readonly = useSheetReadonly();
  const [all, setAll] = useState(false);
  const [skillOpen, setSkillOpen] = useState<string | null>(null);
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
      {view.resources.length > 0 && (
        <Panel color="res" title={t("character.hud.resources")}>
          {view.resources.map((r) => {
            const body = (
              <>
                <span className="f-res-t">{label(r)}</span>
                {r.max <= MAX_PIPS && (
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
            // A spell slot refills one spent use (Font of Inspiration), as the classic
            // rail's «Spend a slot →».
            const refill =
              r.slotRecover && !readonly ? (
                <Button
                  key={`${r.id}-refill`}
                  kind="quiet"
                  onClick={() =>
                    registerUndoableToast(
                      {
                        message: t("combat.slotToTrackerRecoverToast", {
                          name: label(r),
                        }),
                      },
                      () =>
                        useCharacterStore.getState().recoverTrackerFromSpellSlot(r.id),
                      { turnScoped: false }
                    )
                  }
                >
                  {t("combat.slotToTrackerRecover", { name: label(r) })}
                </Button>
              ) : null;
            const row = spend ? (
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
            return refill ? [row, refill] : row;
          })}
        </Panel>
      )}
      <Panel color="abi" title={t("character.skills")}>
        {/* A tap opens the skill's pane: where the bonus comes from, «Personalizza». */}
        {skills.map((s) => (
          <button
            key={s.id}
            type="button"
            className="f-skill"
            data-prof={s.proficient || undefined}
            aria-haspopup="dialog"
            onClick={() => setSkillOpen(s.id)}
          >
            <span className="f-lbl">{t(`abilities.${s.ability}_short`)}</span>
            <span className="f-skill-t">{t(`skills.${s.id}`)}</span>
            <b>{signed(s.bonus)}</b>
          </button>
        ))}
        <Button kind="quiet" onClick={() => setAll(!all)}>
          {all
            ? t("play.fewerSkills")
            : t("play.allSkills", { count: view.allSkills.length })}
        </Button>
      </Panel>
      {/* D&D Beyond's Senses box under the skills: the passives and the senses */}
      <PlaySenses doc={doc} locale={locale} readonly={readonly} />
      {/* D&D Beyond's box under the skills; on a phone its own «Sezioni» tile */}
      <PlayProficiencies doc={doc} locale={locale} />
      {skillOpen && (
        <PlayNumberPane
          key={skillOpen}
          numberKey={{ kind: "skill", id: skillOpen }}
          doc={doc}
          locale={locale}
          readonly={readonly}
          onClose={() => setSkillOpen(null)}
        />
      )}
    </div>
  );
}

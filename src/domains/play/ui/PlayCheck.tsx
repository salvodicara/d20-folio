/**
 * Board 2b, D5b: the check an action asks for (Hide, escaping a grapple, Search /
 * Study / Influence), as BG3's check screen lays it out: the Difficulty Class on top
 * (the header's own hexagon badge), the skill and its bonus, then the d20 the player
 * rolled at the table (the app never rolls), the total and the verdict said live.
 * «Applica» uses the action and applies the outcome through the rules lane's seams
 * (`applyHideCheck`, `applyEscapeCheck`, `withCheckResult`), each undoable.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  applyEscapeCheck,
  applyHideCheck,
  type CheckEntry,
} from "@/domains/play/check-entry";
import { useTurnEconomy } from "@/features/character/center/useTurnEconomy";
import { TYPICAL_DCS, withCheckResult } from "@/lib/play/checks";
import type { CombatAction } from "@/lib/views/combat-action-view";
import { Button, Chip, Dialog, Field, StatBadge } from "@/ui";
import { useLocale } from "@/hooks/useLocale";
import { keptFace, paidAdvantageFor } from "@/domains/play/paid-advantage";
import { useCharacterStore } from "@/stores/characterStore";

const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);
/** «14 + 5 = 19», with a true minus for a penalty. */
const sum = (face: number, bonus: number) =>
  `${String(face)} ${bonus >= 0 ? "+" : "−"} ${String(Math.abs(bonus))} = ${String(face + bonus)}`;

/** The escape DC the dialog opens on: the commonest in the SRD stat blocks. */
const ESCAPE_DC = 13;

export function PlayCheck({
  action,
  entries,
  onClose,
}: {
  action: CombatAction;
  entries: CheckEntry[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { executeAction } = useTurnEconomy();
  const entry = entries[0];
  const [faceText, setFaceText] = useState("");
  const [skill, setSkill] = useState(entry?.kind === "check" ? entry.skills[0]?.id : "");
  const [dc, setDc] = useState<number | undefined>(
    entry?.kind === "hide" ? entry.dc : entry?.kind === "escape" ? ESCAPE_DC : undefined
  );
  const [dcText, setDcText] = useState(String(ESCAPE_DC));
  const [secondText, setSecondText] = useState("");
  const [paid, setPaid] = useState<string | null>(null);
  const { language: locale } = useLocale();
  const doc = useCharacterStore((st) => st.character);
  if (!entry) return null;
  // A paid Advantage the sheet holds (a Luck Point), as the save entries offer it.
  const paidAdvantage = doc
    ? paidAdvantageFor(doc, locale, t, "check", "play.roll.paidAdvantageCheck")
    : undefined;
  const faceOf = (text: string) =>
    /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 20
      ? Number(text.trim())
      : null;
  const first = faceOf(faceText);
  const second = faceOf(secondText);
  const valid = first !== null && (paid === null || second !== null);
  const face = first === null ? null : keptFace(first, second ?? first, paid !== null);
  const bonus =
    entry.kind === "check"
      ? (entry.skills.find((s) => s.id === skill)?.bonus ?? 0)
      : entry.bonus;
  const skillId = entry.kind === "check" ? (skill ?? "") : entry.skill;
  const total = valid && face !== null ? face + bonus : null;
  const passed = total !== null && dc !== undefined ? total >= dc : undefined;
  const verdict =
    total === null || face === null
      ? null
      : `${sum(face, bonus)}: ${
          passed === undefined
            ? t("play.check.noDc")
            : !passed
              ? t("play.check.fail", { dc })
              : entry.kind === "hide"
                ? t("play.check.hideOk", { total })
                : entry.kind === "escape"
                  ? t("play.check.escapeOk")
                  : t("play.check.ok", { dc })
        }`;
  const apply = () => {
    if (!valid || face === null) return;
    if (paid) paidAdvantage?.onPay(paid);
    if (entry.kind === "check") {
      executeAction(withCheckResult(action, { skill: skillId, face, bonus }, dc));
    } else {
      executeAction(action);
      if (entry.kind === "hide") applyHideCheck(face, { dc: entry.dc, bonus }, t);
      else if (dc !== undefined) applyEscapeCheck(face, dc, bonus, t);
    }
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="res"
      title={action.name}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            kind="primary"
            disabled={!valid || (entry.kind === "escape" && dc === undefined)}
            onClick={apply}
          >
            {t("combat.apply")}
          </Button>
        </>
      }
    >
      {entry.kind === "check" ? (
        <>
          <div className="f-ask">
            <span className="f-lbl">{t("combat.checkSkillLabel")}</span>
            <div className="f-chips">
              {entry.skills.map((s) => (
                <Chip key={s.id} pressed={skill === s.id} onClick={() => setSkill(s.id)}>
                  {`${t(`skills.${s.id}`)} ${signed(s.bonus)}`}
                </Chip>
              ))}
            </div>
          </div>
          <div className="f-ask">
            <span className="f-lbl">{t("combat.checkDcLabel")}</span>
            <div className="f-chips">
              <Chip pressed={dc === undefined} onClick={() => setDc(undefined)}>
                {t("abilities.none")}
              </Chip>
              {TYPICAL_DCS.map((v) => (
                <Chip key={v} pressed={dc === v} onClick={() => setDc(v)}>
                  {`${t("stats.dc")} ${String(v)}`}
                </Chip>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="f-ask f-ask-row">
          {dc !== undefined && (
            <StatBadge shape="hex" value={String(dc)} label={t("stats.dc")} />
          )}
          <div>
            <div className="f-row-t">{`${t(`skills.${skillId}`)} ${signed(bonus)}`}</div>
            <div className="f-row-s">
              {entry.kind === "hide"
                ? t("play.check.hideWhat")
                : t("play.check.escapeWhat")}
            </div>
          </div>
        </div>
      )}
      <div className="f-ask f-ask-row">
        {entry.kind === "escape" && (
          <Field
            label={t("combat.escapeDcField")}
            inputMode="numeric"
            autoComplete="off"
            className="f-in f-in-big f-in-short"
            value={dcText}
            onChange={(e) => {
              setDcText(e.target.value);
              const n = /^\d{1,2}$/.test(e.target.value.trim())
                ? Number(e.target.value.trim())
                : undefined;
              setDc(n);
            }}
          />
        )}
        <Field
          label={t("play.check.face")}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="f-in f-in-big f-in-short"
          value={faceText}
          onChange={(e) => setFaceText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
        {paid && (
          <Field
            label={t("combat.d20SecondAria")}
            inputMode="numeric"
            autoComplete="off"
            className="f-in f-in-big f-in-short"
            value={secondText}
            onChange={(e) => setSecondText(e.target.value)}
          />
        )}
      </div>
      {paidAdvantage && (
        <div className="f-ask">
          <div className="f-chips" role="group" aria-label={t("play.down.addAfter")}>
            {paidAdvantage.options.map((option) => (
              <Chip
                key={option.id}
                pressed={paid === option.id}
                onClick={() => setPaid((on) => (on === option.id ? null : option.id))}
              >
                {option.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {verdict && (
        <p className="f-note f-ask" data-c="res" role="status">
          {verdict}
        </p>
      )}
      {entry.kind !== "check" && (
        <p className="f-help f-ask">
          {entry.kind === "hide" ? t("combat.hideEndsHint") : t("combat.escapeHint")}
        </p>
      )}
    </Dialog>
  );
}

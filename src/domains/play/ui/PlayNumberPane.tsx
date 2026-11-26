/**
 * A sheet number's pane (#1230, gap map E2). Pattern source: D&D Beyond's sheet, where
 * a tap on any number (Armor Class, Initiative, Speed, an ability, a save, a skill)
 * opens its pane: the number, where it comes from, and «Customize» with an override.
 *
 * - The number large, «Impostato a mano» when it is hand-set.
 * - The rule the number follows, in one plain sentence from the glossary (DDB's pane
 *   opens with it); rule words inside it open their own explanation.
 * - Where it comes from, a line each (the same lines the classic sheet's tips show;
 *   a hand-set number keeps them and adds «Correzione manuale»).
 * - «Personalizza»: a fixed value replaces the computed one, «Usa il calcolo» puts
 *   the computed one back. Both undoable. Speed is typed in the player's units (metres
 *   in Italian) and stored in feet. A read-only sheet shows the number alone.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { playNumberView, type SheetNumberKey } from "@/domains/play/play-number-view";
import { renderBreakdownLineLabel } from "@/components/shared/breakdown-line";
import type { GlossaryTermId } from "@/components/shared/GlossaryTip";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { setNumberOverride } from "@/features/character/number-overrides";
import { maxHpWithoutBonus } from "@/lib/aggregate-character";
import type { Locale } from "@/lib/locale";
import { localeDistance, speedFromLocaleValue, speedToLocaleValue } from "@/lib/utils";
import { usesMetric } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";
import { Button, Dialog, Field } from "@/ui";

const signed = (n: number) => (n >= 0 ? `+${String(n)}` : `−${String(Math.abs(n))}`);

export function PlayNumberPane({
  numberKey,
  doc,
  locale,
  readonly,
  onClose,
}: {
  numberKey: SheetNumberKey;
  doc: CharacterDoc;
  locale: Locale;
  readonly: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const view = playNumberView(doc, locale, numberKey);
  const speed = numberKey.kind === "speed";
  const toInput = (v: number) => (speed ? speedToLocaleValue(v, locale) : String(v));
  const [draft, setDraft] = useState(view.stored === null ? "" : toInput(view.stored));
  const name = numberName(numberKey, t);
  const shown =
    numberKey.kind === "ac" || numberKey.kind === "ability" || numberKey.kind === "maxHp"
      ? String(view.total)
      : speed
        ? localeDistance(view.total, locale)
        : signed(view.total);
  const parsed = parseDraft(draft, speed, locale);
  // Max HP is stored as a correction over the derived max (#1315), not a fixed value:
  // the pane says so, with the correction the typed max would save.
  const maxHp = numberKey.kind === "maxHp";
  const correction =
    maxHp && parsed !== null ? parsed - maxHpWithoutBonus(doc.character) : null;
  const apply = (value: number | null) => {
    setNumberOverride(
      numberKey,
      value,
      value === null
        ? t("play.number.resetToast", { name })
        : maxHp
          ? t("play.number.maxHpSetToast", { name })
          : t("play.number.setToast", { name })
    );
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      color="abi"
      title={name}
      closeLabel={t("common.close")}
    >
      <div className="f-stack f-num-pane">
        <p className="f-num-total">
          <b>{shown}</b>
          {view.stored !== null && (
            <span className="f-num-tag">
              {t(maxHp ? "play.number.maxHpTag" : "play.number.handSet")}
            </span>
          )}
        </p>
        <p className="f-num-rule">
          {highlightRulesText(locale, { tappable: true })(
            t(`glossary.term.${numberTerm(numberKey)}`)
          )}
        </p>
        {view.parts && view.parts.length > 0 && (
          <ul className="f-ab-parts" aria-label={t("breakdown.rubric")}>
            {view.parts.map((line, i) => (
              <li key={i}>
                <span>{renderBreakdownLineLabel(line, t)}</span>
                <b>{speed ? speedLine(line.value, locale) : line.value}</b>
              </li>
            ))}
          </ul>
        )}
        {!readonly && (
          <section className="f-stack f-num-custom" aria-label={t("common.customize")}>
            <h3 className="f-lbl">{t("common.customize")}</h3>
            <Field
              label={
                speed
                  ? `${t("play.number.override")} (${usesMetric(locale) ? "m" : "ft"})`
                  : maxHp
                    ? t("play.number.maxHpField")
                    : t("play.number.override")
              }
              help={
                !maxHp
                  ? t("play.number.overrideHelp")
                  : correction !== null && correction !== 0
                    ? t("play.number.maxHpHelp", { bonus: signed(correction) })
                    : t("play.number.maxHpHelpPlain")
              }
              type="text"
              inputMode={speed && usesMetric(locale) ? "decimal" : "numeric"}
              autoComplete="off"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="f-num-acts">
              <Button
                kind="primary"
                disabled={parsed === null || parsed === view.stored}
                onClick={() => parsed !== null && apply(parsed)}
              >
                {t("common.save")}
              </Button>
              {view.stored !== null && (
                <Button kind="ghost" onClick={() => apply(null)}>
                  {t("play.number.useComputed")}
                </Button>
              )}
            </div>
          </section>
        )}
      </div>
    </Dialog>
  );
}

/** A speed part («+30», feet) in the player's units, as the total is («+9 m»). */
function speedLine(value: string, locale: Locale): string {
  const feet = Number(value.replace("−", "-"));
  if (!Number.isFinite(feet)) return value;
  return `${feet < 0 ? "−" : "+"}${localeDistance(Math.abs(feet), locale)}`;
}

/** The typed value as stored (feet for speed), or null when it is not a number. */
function parseDraft(draft: string, speed: boolean, locale: Locale): number | null {
  const text = draft.trim().replace("−", "-");
  if (!/^[-+]?\d+([.,]\d+)?$/.test(text)) return null;
  const value = speed
    ? parseInt(speedFromLocaleValue(text, locale), 10)
    : Math.round(Number(text.replace(",", ".")));
  return Number.isFinite(value) ? value : null;
}

/** The glossary term that explains the rule behind a number. */
function numberTerm(key: SheetNumberKey): GlossaryTermId {
  switch (key.kind) {
    case "ac":
      return "armorClass";
    case "initiative":
      return "initiative";
    case "speed":
      return "speed";
    case "proficiency":
      return "proficiencyBonus";
    case "maxHp":
      return "hitPoints";
    case "ability":
      return "abilityScores";
    case "save":
      return "savingThrow";
    case "skill":
      return "skillCheck";
  }
}

function numberName(
  key: SheetNumberKey,
  t: ReturnType<typeof useTranslation>["t"]
): string {
  switch (key.kind) {
    case "ac":
      return t("character.armorClass");
    case "initiative":
      return t("character.vitals.initAria");
    case "speed":
      return t("character.speed");
    case "proficiency":
      return t("play.proficiency");
    case "maxHp":
      return t("character.health.maxHp");
    case "ability":
      return t(`abilities.${key.ability}`);
    case "save":
      return `${t("abilities.savingThrowHead")} · ${t(`abilities.${key.ability}`)}`;
    case "skill":
      return t(`skills.${key.id}`);
  }
}

/**
 * «Danni e cure» (approved prototype x-play-hp), opened from the header's Hit Points:
 * how many, the damage type when it matters (the common three, the ones the character
 * defends against, «Altro tipo» for the rest), Danni or Cura, a note that says what
 * the damage will do (`hpEntryNote`, the same path Danni commits), and the temporary
 * Hit Points, which don't add up. Every change goes through `useHpControls`, with its
 * undo toast.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { hpEntryNote } from "@/domains/play/hp-entry-view";
import { useHpControls } from "@/features/character/molecules/use-hp-controls";
import type { Locale } from "@/lib/locale";
import { concentrationLabel } from "@/lib/views/concentration-label";
import type { CharacterDoc } from "@/types/character";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import { Button, Chip, Dialog, Field } from "@/ui";

/** The types a hit at the table most often has, offered first. */
const COMMON: readonly DamageType[] = ["slashing", "piercing", "bludgeoning"];

export function PlayHp({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const hp = useHpControls();
  const [text, setText] = useState("");
  const [type, setType] = useState<DamageType | undefined>(undefined);
  // At 0 HP a Critical Hit is two death-save failures (the classic HP popover's toggle).
  const [crit, setCrit] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const [tempText, setTempText] = useState(String(hp.temp));
  const amount = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
  const shown = allTypes
    ? DAMAGE_TYPES
    : [...COMMON, ...hp.defendedTypes.filter((d) => !COMMON.includes(d))];
  const note = amount ? hpEntryNote(doc, amount, type, hp.defenses) : null;
  const tempValue = /^\d+$/.test(tempText.trim()) ? Number(tempText.trim()) : null;
  const lines = note
    ? [
        note.defense ? t(`play.hp.${note.defense}`, { net: note.net }) : null,
        note.absorbed > 0 ? t("play.hp.absorbed", { amount: note.absorbed }) : null,
        note.net === 0
          ? null
          : note.fromTemp > 0 && note.to === note.from
            ? t("play.hp.tempOnly", { from: note.from })
            : note.fromTemp > 0
              ? t("play.hp.fromTemp", {
                  temp: note.fromTemp,
                  from: note.from,
                  to: note.to,
                })
              : t("play.hp.plain", { from: note.from, to: note.to }),
        note.concentrationDc > 0
          ? t("play.hp.concentration", {
              spell: concentrationLabel(doc.session.concentration, locale),
              dc: note.concentrationDc,
            })
          : null,
      ].filter(Boolean)
    : [];
  return (
    <Dialog
      open
      onClose={onClose}
      color="ini"
      title={t("play.hp.title")}
      closeLabel={t("common.close")}
    >
      <div className="f-ask">
        <Field
          label={t("play.hp.amount")}
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="f-in f-in-big"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <div className="f-chips">
          {shown.map((d) => (
            <Chip
              key={d}
              pressed={type === d}
              onClick={() => setType(type === d ? undefined : d)}
            >
              {t(`srd.damage_${d}`)}
            </Chip>
          ))}
          {!allTypes && (
            <Chip pressed={false} onClick={() => setAllTypes(true)}>
              {t("play.hp.otherType")}
            </Chip>
          )}
        </div>
      </div>
      {hp.atZero && !hp.dead && (
        <div className="f-ask">
          <div className="f-chips">
            <Chip pressed={crit} onClick={() => setCrit((on) => !on)}>
              {t("combat.critHit")}
            </Chip>
          </div>
          {crit && <p className="f-quiet">{t("play.hp.critAtZero")}</p>}
        </div>
      )}
      <div className="f-hp-acts f-ask">
        <Button
          kind="danger"
          wide
          disabled={!amount || hp.dead}
          onClick={() => {
            if (!amount) return;
            hp.handleApplyDamage([{ amount, ...(type ? { type } : {}) }], {
              crit: hp.atZero && crit,
            });
            onClose();
          }}
        >
          {t("mechanics.cast.optionDamage")}
        </Button>
        <Button
          kind="primary"
          wide
          disabled={!amount || hp.dead}
          onClick={() => {
            if (!amount) return;
            hp.applyHeal(amount);
            onClose();
          }}
        >
          {t("combat.heal")}
        </Button>
      </div>
      {lines.length > 0 && (
        <p className="f-note f-ask" data-c="ini" role="status">
          {lines.join(" ")}
        </p>
      )}
      <div className="f-ask f-field">
        <span className="f-lbl">{t("play.hp.temp")}</span>
        <div className="f-ask-row">
          <input
            className="f-in f-in-big f-in-short"
            inputMode="numeric"
            aria-label={t("play.hp.temp")}
            value={tempText}
            onChange={(e) => setTempText(e.target.value)}
          />
          <span className="f-help">{t("play.hp.tempHelp")}</span>
          <Button
            kind="ghost"
            disabled={tempValue === null || tempValue === hp.temp}
            onClick={() => {
              if (tempValue === null) return;
              if (tempValue === 0) hp.clearTemp();
              else hp.applyTemp(tempValue);
            }}
          >
            {t("play.hp.setTemp")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

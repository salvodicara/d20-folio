/**
 * The d20 entry of a save the app judges (death, Concentration), with what the player
 * may add after the roll (2024 D20 Test reactions; BG3's roll-modifier toggles, D&D
 * Beyond's roll with Advantage): a held Bardic Inspiration die («+ Ispirazione Bardica
 * (d8)», then its face) and a paid Advantage («Fortunato: Vantaggio», then the second
 * d20). A save the sheet already rolls with Advantage or Disadvantage asks both d20s.
 * The caller commits `entry()`: the faces, the use for the resolver, and the payment.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BARDIC_INSPIRATION_DIE_SOURCE,
  postRollSources,
  type PostRollUse,
} from "@/lib/character-d20-tests";
import { useLocale } from "@/hooks/useLocale";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";
import { Chip, Field } from "@/ui";

export interface PostRollCommit {
  faces: number[];
  use: PostRollUse;
  spend?: { trackerId: string; amount: number };
}

const inRange = (text: string, max: number) =>
  /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= max;

export function usePostRollEntry(
  doc: CharacterDoc,
  /** 2 when the sheet already rolls this save with Advantage or Disadvantage. */
  sheetFaces: 1 | 2,
  labels: { face: string; hint?: string }
) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [dieFace, setDieFace] = useState("");
  const [withDie, setWithDie] = useState(false);
  const [advantage, setAdvantage] = useState<string | null>(null);
  const actions = useMemo(() => localizeActions(doc, locale), [doc, locale]);
  const sources = postRollSources(doc, actions);
  const die = doc.session.bardicInspirationDie ?? "";
  const lucky = actions.filter(
    (a) => sources.advantageOptIns.includes(a.id) && (a.summary.uses?.current ?? 1) > 0
  );
  const twoFaces = sheetFaces === 2 || advantage !== null;
  const valid =
    inRange(first, 20) &&
    (!twoFaces || inRange(second, 20)) &&
    (!withDie || inRange(dieFace, Number(die.replace(/^d/, ""))));

  const reset = () => {
    setFirst("");
    setSecond("");
    setDieFace("");
    setWithDie(false);
    setAdvantage(null);
  };

  const entry = (): PostRollCommit => {
    const paid = lucky.find((a) => a.id === advantage);
    const spend = paid ? bareActionSpend(doc.character.spellSlots, paid) : null;
    return {
      faces: twoFaces ? [Number(first), Number(second)] : [Number(first)],
      use: {
        ...(withDie
          ? {
              enteredModifierFaces: {
                [BARDIC_INSPIRATION_DIE_SOURCE]: [Number(dieFace)],
              },
            }
          : {}),
        ...(paid ? { advantage: { sourceId: paid.id, actions } } : {}),
      },
      ...(spend?.kind === "tracker"
        ? { spend: { trackerId: spend.trackerId, amount: spend.amount } }
        : {}),
    };
  };

  const fields = (
    <div className="f-roll-entry">
      <Field
        label={twoFaces ? t("combat.d20FirstAria") : labels.face}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        className="f-in f-in-big f-in-short"
        value={first}
        {...(labels.hint && !twoFaces ? { help: labels.hint } : {})}
        onChange={(e) => setFirst(e.target.value)}
      />
      {twoFaces && (
        <Field
          label={t("combat.d20SecondAria")}
          inputMode="numeric"
          autoComplete="off"
          className="f-in f-in-big f-in-short"
          value={second}
          onChange={(e) => setSecond(e.target.value)}
        />
      )}
      {(sources.enteredModifiers.length > 0 || lucky.length > 0) && (
        <div className="f-ask">
          <span className="f-lbl">{t("play.down.addAfter")}</span>
          <div className="f-chips" role="group" aria-label={t("play.down.addAfter")}>
            {sources.enteredModifiers.length > 0 && (
              <Chip pressed={withDie} onClick={() => setWithDie((on) => !on)}>
                {t("play.down.addBardic", { die })}
              </Chip>
            )}
            {sheetFaces === 1 &&
              lucky.map((a) => (
                <Chip
                  key={a.id}
                  pressed={advantage === a.id}
                  onClick={() => setAdvantage((on) => (on === a.id ? null : a.id))}
                >
                  {t("play.down.paidAdvantage", { name: a.name })}
                </Chip>
              ))}
          </div>
        </div>
      )}
      {withDie && (
        <Field
          label={t("play.down.dieFace", { die })}
          inputMode="numeric"
          autoComplete="off"
          className="f-in f-in-big f-in-short"
          value={dieFace}
          onChange={(e) => setDieFace(e.target.value)}
        />
      )}
    </div>
  );

  return { fields, valid, entry, reset };
}

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
  type CharacterEnteredD20Result,
  type PostRollUse,
} from "@/lib/character-d20-tests";
import { useLocale } from "@/hooks/useLocale";
import { bareActionSpend } from "@/lib/play/cast-payment";
import { localizeActions } from "@/lib/views/combat-action-view";
import type { CharacterDoc } from "@/types/character";
import { Chip, Field, Icon } from "@/ui";
import { recordedD20Faces } from "@/lib/play/tracker-rolls";
import { grantSourceLabel } from "@/lib/views/tracker-view";

export interface PostRollCommit {
  faces: number[];
  use: PostRollUse;
  spend?: { trackerId: string; amount: number };
  /** A recorded d20 used as the roll (Portent): the caller spends exactly this one. */
  foretold?: { trackerId: string; index: number };
}

const inRange = (text: string, max: number) =>
  /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= max;

export function usePostRollEntry(
  doc: CharacterDoc,
  /** 2 when the sheet already rolls this save with Advantage or Disadvantage. */
  sheetFaces: 1 | 2,
  labels: { face: string; hint?: string },
  /** The save resolved without committing (the same resolver the store calls), for the
   *  running total and verdict shown before «Conferma» (BG3's roll result line). */
  preview?: (faces: number[], use: PostRollUse) => CharacterEnteredD20Result | null
) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [dieFace, setDieFace] = useState("");
  const [withDie, setWithDie] = useState(false);
  const [advantage, setAdvantage] = useState<string | null>(null);
  // A recorded d20 put in place of the roll (Portent: «replace that roll with one of
  // your foretelling rolls»); typing another face drops it.
  const [foretold, setForetold] = useState<{ trackerId: string; index: number } | null>(
    null
  );
  const recorded = recordedD20Faces(doc);
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
    setForetold(null);
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
      ...(foretold && !twoFaces ? { foretold } : {}),
    };
  };

  const outcome = (() => {
    if (!valid || !preview) return null;
    const e = entry();
    try {
      return preview(e.faces, e.use);
    } catch {
      return null;
    }
  })();
  const face = outcome?.effectiveFace ?? outcome?.selectedNaturalFace ?? null;
  const sum = (() => {
    if (!outcome || face === null || outcome.total === null) return null;
    const added = [
      ...(outcome.deterministicModifier !== 0
        ? [
            `${outcome.deterministicModifier > 0 ? "+" : "−"} ${String(
              Math.abs(outcome.deterministicModifier)
            )}`,
          ]
        : []),
      ...(outcome.enteredModifierTotal !== 0
        ? [`+ ${String(outcome.enteredModifierTotal)}`]
        : []),
    ];
    // Two d20s (Advantage or Disadvantage): which one counted.
    const faces = entry().faces;
    const kept = faces.length === 2 ? `${faces.join(" / ")} → ` : "";
    return added.length > 0
      ? `${kept}${[String(face), ...added].join(" ")} = ${String(outcome.total)}`
      : `${kept}${String(outcome.total)}`;
  })();
  const passed = outcome?.reviewedOutcome.status === "success";
  const pressedMark = <Icon name="u-check" />;

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
        onChange={(e) => {
          setFirst(e.target.value);
          setForetold(null);
        }}
      />
      {!twoFaces && recorded.length > 0 && (
        <div className="f-ask">
          <span className="f-lbl">{t("play.down.foretold")}</span>
          <div className="f-chips" role="group" aria-label={t("play.down.foretold")}>
            {recorded.map((r) => {
              const on =
                foretold?.trackerId === r.trackerId && foretold.index === r.index;
              return (
                <Chip
                  key={`${r.trackerId}:${String(r.index)}`}
                  pressed={on}
                  onClick={() => {
                    setFirst(String(r.face));
                    setForetold(on ? null : { trackerId: r.trackerId, index: r.index });
                  }}
                >
                  {on && pressedMark}
                  {`${grantSourceLabel(r.trackerId, locale)} ${String(r.face)}`}
                </Chip>
              );
            })}
          </div>
        </div>
      )}
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
                {withDie && pressedMark}
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
                  {advantage === a.id && pressedMark}
                  {a.name}
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
      {sum && (
        <p className="f-note f-roll-sum" data-c={passed ? "cmp" : "dng"} role="status">
          <b>{sum}</b>
          {` · ${passed ? t("combat.damageTray.succeeded") : t("combat.atZeroHpSaveFailed")}`}
        </p>
      )}
    </div>
  );

  return { fields, valid, entry, reset };
}

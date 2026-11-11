/**
 * At 0 Hit Points on the Play screen (approved prototype x-play-down, on the rules
 * lane's `down-model`). At 0 HP the HP spot becomes the death-save tracker in place (D&D
 * Beyond's tracker, BG3's downed ring): successes and failures as pips against the
 * table's limits, and «Tira il dado» (both d20s when the save has Advantage or
 * Disadvantage), with what the player adds after the roll (`usePostRollEntry`). A
 * feature that keeps the character up (Relentless Endurance, Relentless Rage, Undying
 * Sentinel) is a short prompt, BG3's «use it?»: what it does, one primary use (its save
 * entered first when it asks one), and what the fall brings while it is undecided
 * (Disintegrate: dust). Once Stable, how long; once dead, the verdict and why.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { applyZeroHpSaver, downView, recordDeathSave } from "@/domains/play/down-model";
import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { localizeSrd } from "@/i18n/resolver";
import { resolveCharacterDeathSave } from "@/lib/character-d20-tests";
import { vitalExhaustion } from "@/lib/character-vitals";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";
import { Button, Dialog } from "@/ui";
import { usePostRollEntry } from "./PostRollEntry";

export function PlayDown({ doc }: { doc: CharacterDoc }) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const readonly = useSheetReadonly();
  const [rolling, setRolling] = useState(false);
  const down = downView(doc);
  const roll = usePostRollEntry(
    doc,
    down.d20.faceCount,
    { face: t("play.down.face"), hint: t("play.down.faceHint") },
    (faces, use) => resolveCharacterDeathSave(doc, faces, [], use)
  );
  if (down.state === "up") return null;
  const close = () => {
    roll.reset();
    setRolling(false);
  };
  const pips = (n: number, of: number, kind: "succ" | "fail") => (
    <span className="f-pips" data-kind={kind} aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <i key={i} data-on={i < n || undefined} />
      ))}
    </span>
  );
  const { successes, failures, limit } = down.deathSaves;

  if (down.state === "dead") {
    const why =
      down.deadReason === "exhaustion"
        ? `${t("character.exhaustion")} ${String(vitalExhaustion(doc.session))}`
        : down.deadReason === "disintegrated"
          ? t("play.down.dust")
          : down.deadReason === "death-saves"
            ? t("play.down.threeFailures", { count: limit.failures })
            : null;
    return (
      <div className="f-down f-dead" role="status" aria-live="assertive">
        <p className="f-down-verdict">{t("character.deadLabel")}</p>
        {why && <p className="f-help">{why}</p>}
      </div>
    );
  }

  return (
    <div className="f-down" role="group" aria-label={t("play.down.title")}>
      <p className="f-help">
        {down.state === "stable"
          ? down.stableMinutes !== null
            ? t("play.down.stableFor", { minutes: down.stableMinutes })
            : t("play.down.stable")
          : t("play.down.title")}
      </p>
      <div className="f-down-row">
        <span className="f-lbl">{t("deathSaves.successes")}</span>
        {pips(successes, limit.successes, "succ")}
        <span className="f-sr">{`${String(successes)}/${String(limit.successes)}`}</span>
      </div>
      <div className="f-down-row">
        <span className="f-lbl">{t("deathSaves.failures")}</span>
        {pips(failures, limit.failures, "fail")}
        <span className="f-sr">{`${String(failures)}/${String(limit.failures)}`}</span>
      </div>
      {down.state === "dying" && !readonly && (
        <Button kind="primary" aria-haspopup="dialog" onClick={() => setRolling(true)}>
          {t("play.down.roll")}
        </Button>
      )}
      {!readonly &&
        down.zeroHpSavers.map((saver) => (
          <Saver key={saver.sourceId} saver={saver} locale={locale} />
        ))}
      {down.fallConsequence && (
        <p className="f-help" role="status">
          {t(`combat.zeroHpPending_${down.fallConsequence.kind}`, {
            source: down.fallConsequence.sourceId
              ? localizeSrd("spell", down.fallConsequence.sourceId, "name", locale)
              : "",
          })}
        </p>
      )}
      {rolling && (
        <Dialog
          open
          onClose={close}
          color="ini"
          title={t("play.down.rollTitle")}
          closeLabel={t("common.close")}
          actions={
            <>
              <Button kind="ghost" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                kind="primary"
                disabled={!roll.valid}
                onClick={() => {
                  const entry = roll.entry();
                  recordDeathSave(entry.faces, t, entry.use, entry.spend);
                  close();
                }}
              >
                {t("common.confirm")}
              </Button>
            </>
          }
        >
          {down.d20.mode && (
            <p className="f-quiet">{t(`combat.rollMode.${down.d20.mode}`)}</p>
          )}
          {roll.fields}
        </Dialog>
      )}
    </div>
  );
}

/** A feature that keeps the character up: one use, its save first when it asks one. */
function Saver({
  saver,
  locale,
}: {
  saver: ReturnType<typeof downView>["zeroHpSavers"][number];
  locale: ReturnType<typeof useLocale>["language"];
}) {
  const { t } = useTranslation();
  const source = grantSourceLabel(saver.sourceId, locale);
  return (
    <div className="f-note f-save-due" data-c="cmp" role="group" aria-label={source}>
      <p>
        {saver.save
          ? t("combat.atZeroHpSave", {
              source,
              ability: t(`abilities.${saver.save.ability}_short`),
              dc: saver.save.dc,
            })
          : t("combat.atZeroHpApply", { source, hp: saver.hitPoints })}
      </p>
      <div className="f-acts">
        {saver.save ? (
          <>
            <Button
              kind="primary"
              onClick={() => applyZeroHpSaver(saver.sourceId, "success", t, locale)}
            >
              {t("combat.atZeroHpSavePassed", { hp: saver.hitPoints })}
            </Button>
            <Button
              kind="ghost"
              onClick={() => applyZeroHpSaver(saver.sourceId, "failure", t, locale)}
            >
              {t("combat.atZeroHpSaveFailed")}
            </Button>
          </>
        ) : (
          <Button
            kind="primary"
            onClick={() => applyZeroHpSaver(saver.sourceId, undefined, t, locale)}
          >
            {t("common.use")}
          </Button>
        )}
      </div>
    </div>
  );
}

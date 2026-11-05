/**
 * «Sali di livello», over the Play screen (prototype level-1/2/3): Punti ferita
 * (the average or the player's roll) → Novità (only what this level asks, as
 * chips) → Riepilogo (before → after, read from the character the commit would
 * save). Confirming saves a snapshot first, then the level; the toast's «Annulla»
 * puts the snapshot back. Levels this screen cannot draw yet (a new class, Spell
 * Mastery, Signature Spells) open the classic wizard.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import {
  levelUpReview,
  type ReviewNumber,
} from "@/domains/leveling/level-up-review-view";
import { getClasses, primaryClassId } from "@/lib/classes";
import { abilityModifier } from "@/lib/compute";
import {
  replaceCharacterState,
  restoreCharacterSnapshot,
  saveCharacterSnapshot,
} from "@/lib/firestore";
import { commitLevelUp } from "@/lib/level-up-commit";
import { HIT_DIE_AVG } from "@/lib/level-up-plan";
import { eligibleNewClasses } from "@/lib/multiclass";
import type { Locale } from "@/lib/locale";
import { className } from "@/lib/views/level-up-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Choice, Dialog, Stepper } from "@/ui";

type Step = "hp" | "news" | "summary";

export function LevelUpDialog({
  doc,
  locale,
  onClose,
}: {
  doc: CharacterDoc;
  locale: Locale;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const uid = useAuthStore((s) => s.user?.uid);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const c = doc.character;
  const owned = getClasses(c);
  const [classId, setClassId] = useState(() => primaryClassId(c));
  const [answers, setAnswers] = useState<LevelUpAnswers>(NO_ANSWERS);
  const [step, setStep] = useState<Step>("hp");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asks = levelUpAsks(doc, classId, answers, locale);
  const { plan } = asks;
  const steps: Step[] = asks.rows.length ? ["hp", "news", "summary"] : ["hp", "summary"];
  const at = steps.indexOf(step);
  const STEP_LABEL: Record<Step, string> = {
    hp: t("roster.hp"),
    news: t("levelUp.screen.stepNews"),
    summary: t("levelUp.screen.stepSummary"),
  };

  // The character the commit would save, and what changes against today's.
  const after = (() => {
    try {
      return commitLevelUp(doc, asks.picks);
    } catch {
      return null;
    }
  })();
  const review = after ? levelUpReview(doc, after, locale) : null;

  const conMod = abilityModifier(c.abilityScores.CON);
  const classic = `/characters/${doc.id}/level-up/classic`;
  if (!asks.supported) return <Navigate to={classic} replace />;
  // «5 + 2», «d8 − 1»: the die, then the CON modifier every level adds.
  const plusCon = conMod >= 0 ? `+ ${String(conMod)}` : `− ${String(-conMod)}`;

  async function confirm() {
    if (!after || !uid || !asks.complete) return;
    setSaving(true);
    setError(null);
    const before = doc;
    try {
      await saveCharacterSnapshot(uid, doc.id, {
        character: c,
        session: doc.session,
        reason: "level-up",
      });
      setCharacter(after);
      // A level rewrites the whole sheet: an older undo could restore a sheet that no longer holds.
      useUndoStore.getState().clear();
      await replaceCharacterState(
        uid,
        doc.id,
        after.character,
        after.session,
        doc.revision
      );
      onClose();
      useToastStore.getState().showToast({
        message: t("levelUp.screen.done", { name: c.name, level: plan.newLevel }),
        duration: 8000,
        onUndo: () => {
          setCharacter(before);
          void restoreCharacterSnapshot(
            uid,
            doc.id,
            { character: before.character, session: before.session },
            doc.revision + 1
          ).catch((e: unknown) => {
            // The sheet stays levelled when the old one cannot be put back.
            setCharacter(after);
            useToastStore.getState().showToast({
              message: t("levelUp.saveFailed", {
                error: e instanceof Error ? e.message : t("common.unknownError"),
              }),
              duration: 6000,
            });
          });
        },
      });
    } catch (e) {
      setCharacter(before);
      setError(
        t("levelUp.saveFailed", {
          error: e instanceof Error ? e.message : t("common.unknownError"),
        })
      );
      setSaving(false);
    }
  }

  const last = at === steps.length - 1;
  const canNext = step === "news" ? asks.complete : true;
  const actions = (
    <>
      {error && (
        <span className="f-err" role="alert">
          {error}
        </span>
      )}
      <Button
        kind="ghost"
        onClick={() => (at === 0 ? onClose() : setStep(steps[at - 1] ?? "hp"))}
      >
        {at === 0 ? t("common.cancel") : t("common.back")}
      </Button>
      {last ? (
        <Button
          kind="primary"
          disabled={!asks.complete || saving || !after}
          onClick={() => void confirm()}
        >
          {t("levelUp.screen.confirm", { level: plan.newLevel })}
        </Button>
      ) : (
        <Button
          kind="primary"
          disabled={!canNext}
          onClick={() => setStep(steps[at + 1] ?? "summary")}
        >
          {t("common.next")}
        </Button>
      )}
    </>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title={t("levelUp.screen.title", { name: c.name, level: plan.newLevel })}
      closeLabel={t("common.close")}
      actions={actions}
    >
      <ol className="f-steps stp" aria-label={t("levelUp.title")}>
        {steps.map((s, i) => (
          <li key={s} aria-current={i === at ? "step" : undefined}>
            <button
              type="button"
              disabled={i > at}
              onClick={() => setStep(s)}
              aria-label={`${String(i + 1)}. ${STEP_LABEL[s]}`}
            >
              <span className="f-step-n">{i + 1}</span>
              <span className="f-step-l">{STEP_LABEL[s]}</span>
            </button>
          </li>
        ))}
        <li className="f-step-of" aria-hidden="true">
          {t("create.screen.of", { total: steps.length })}
        </li>
      </ol>

      {step === "hp" && (
        <div className="f-ask">
          {owned.length > 1 && (
            <div className="f-ask">
              <span className="f-lbl">{t("levelUp.screen.whichClass")}</span>
              <div className="f-chips">
                {owned.map((e) => (
                  <Chip
                    key={e.classId}
                    pressed={e.classId === classId}
                    onClick={() => {
                      setClassId(e.classId);
                      setAnswers(NO_ANSWERS);
                    }}
                  >
                    {`${className(e.classId, locale)} ${String(e.level)}`}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <span className="f-lbl">{t("levelUp.screen.hpQuestion")}</span>
          <div className="f-slots">
            <Choice
              tile
              on={answers.rolled === null}
              onClick={() => setAnswers({ ...answers, rolled: null })}
            >
              <b className="f-lvl-hp-n">{`${String(HIT_DIE_AVG[plan.hitDie] ?? 5)} ${plusCon}`}</b>
              <span className="f-row-s">{t("levelUp.screen.hpAverage")}</span>
            </Choice>
            <Choice
              tile
              on={answers.rolled !== null}
              onClick={() =>
                setAnswers({
                  ...answers,
                  rolled: answers.rolled ?? HIT_DIE_AVG[plan.hitDie] ?? 5,
                })
              }
            >
              <b className="f-lvl-hp-n">{`d${String(plan.hitDie)} ${plusCon}`}</b>
              <span className="f-row-s">{t("levelUp.screen.hpRoll")}</span>
            </Choice>
          </div>
          {answers.rolled !== null && (
            <div className="f-lvl-roll">
              <span className="f-lbl">
                {t("levelUp.screen.hpRolled", { die: plan.hitDie })}
              </span>
              <Stepper
                value={answers.rolled}
                min={1}
                max={plan.hitDie}
                label={t("levelUp.screen.hpRolled", { die: plan.hitDie })}
                less={t("levelUp.screen.less")}
                more={t("levelUp.screen.more")}
                onChange={(rolled) => setAnswers({ ...answers, rolled })}
              />
            </div>
          )}
          {review && (
            <>
              <span className="f-lbl">{t("levelUp.screen.changes")}</span>
              <Numbers rows={review.numbers} />
            </>
          )}
          {eligibleNewClasses(c).length > 0 && (
            <p className="f-help">
              <Link to={classic}>{t("levelUp.screen.otherClass")}</Link>
            </p>
          )}
        </div>
      )}

      {step === "news" &&
        asks.rows.map((row) => (
          <div key={row.key} className="f-ask">
            <p className="f-help">
              {row.title}
              {row.count > 1 && (
                <span className="f-lvl-count">{` ${String(row.picked.length)}/${String(row.count)}`}</span>
              )}
            </p>
            {groups(row.options).map(([level, options]) => (
              <div key={level ?? "all"} className="f-lvl-group">
                {level !== undefined && (
                  <span className="f-lbl">{t("spells.level", { level })}</span>
                )}
                <div className="f-chips">
                  {options.map((o) => (
                    <Chip
                      key={o.id}
                      pressed={row.picked.includes(o.id)}
                      onClick={() => setAnswers(toggleAnswer(answers, row, o.id))}
                    >
                      {o.label}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}

      {step === "summary" && review && (
        <div className="f-ask">
          <span className="f-lbl">{t("levelUp.screen.changes")}</span>
          <Numbers rows={review.numbers} />
          {review.gained.length > 0 && (
            <>
              <span className="f-lbl">{t("levelUp.screen.gained")}</span>
              <div className="f-chips">
                {review.gained.map((g) => (
                  <Chip key={`${g.kind}:${g.id}`}>{g.name}</Chip>
                ))}
              </div>
            </>
          )}
          <p className="f-help">{t("levelUp.screen.rest")}</p>
        </div>
      )}
    </Dialog>
  );
}

/** Options by their group (a spell's level), in order; one group when none is set. */
function groups<T extends { group?: number }>(
  options: readonly T[]
): Array<[number | undefined, T[]]> {
  const by = new Map<number | undefined, T[]>();
  for (const o of options) by.set(o.group, [...(by.get(o.group) ?? []), o]);
  return [...by.entries()].sort(([a], [b]) => (a ?? 0) - (b ?? 0));
}

/** Before → after, the new value in bold: Hit Points, proficiency, slots, uses. */
function Numbers({ rows }: { rows: readonly ReviewNumber[] }) {
  const { t } = useTranslation();
  const label = (r: ReviewNumber) =>
    r.kind === "hp"
      ? t("levelUp.screen.hp")
      : r.kind === "pb"
        ? t("levelUp.screen.pb")
        : r.kind === "slot"
          ? t(r.pact ? "levelUp.screen.pactSlot" : "play.slot", { level: r.level })
          : r.name;
  return (
    <dl className="f-lvl-nums">
      {rows.map((r) => (
        <div key={r.id} data-same={r.before === r.after || undefined}>
          <dt>{label(r)}</dt>
          <dd>
            {r.before !== r.after && (
              <>
                <span>{r.before}</span>
                <span className="f-lvl-arrow" aria-hidden="true">
                  →
                </span>
              </>
            )}
            <b>{r.after}</b>
          </dd>
        </div>
      ))}
    </dl>
  );
}

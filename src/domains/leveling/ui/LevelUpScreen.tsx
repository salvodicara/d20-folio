/**
 * «Sali di livello» as a moment, not a form (owner's pick 2026-11-05, mockup A
 * «Momento BG3»; references: BG3's level-up and subclass screens). One full-height
 * page over the Play route:
 *
 *   - the step rail (left): Hit Points, then each question, with ✓ when answered,
 *     a red «!» while owed, «–» when optional; a tap scrolls to the question;
 *   - the hero: the class crest and «9 → Livello 10»;
 *   - what the level gives, as tiles with an icon and a before → after number;
 *   - the questions: Hit Points (average or the player's roll), then each pick as a
 *     grid of icons (painted art, else the school's glyph) with a gold frame and a
 *     tick when chosen, and an inspect card for the last spell touched;
 *   - the live summary (right; a sticky bar on phone): the character the commit
 *     would save, the choices still owed, and «Conferma».
 *
 * Confirming saves a snapshot first, then the level; the toast's «Annulla» puts the
 * snapshot back. Levels this screen cannot draw yet open the classic wizard.
 */
import { createElement, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router";

import {
  FolioBookIcon,
  FolioFeatIcon,
  FolioFocusIcon,
  FolioSupportIcon,
} from "@/components/shared/folio-icons";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskRow,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import {
  levelUpSteps,
  levelUpSummary,
  type LevelUpStep,
} from "@/domains/leveling/level-up-moment-view";
import {
  levelUpReview,
  type ReviewNumber,
} from "@/domains/leveling/level-up-review-view";
import { SpellArt } from "@/domains/spells/ui/SpellArt";
import { getClasses, primaryClassId } from "@/lib/classes";
import { abilityModifier } from "@/lib/compute";
import {
  replaceCharacterState,
  restoreCharacterSnapshot,
  saveCharacterSnapshot,
} from "@/lib/firestore";
import { commitLevelUp } from "@/lib/level-up-commit";
import { HIT_DIE_AVG } from "@/lib/level-up-plan";
import type { Locale } from "@/lib/locale";
import { eligibleNewClasses } from "@/lib/multiclass";
import { className } from "@/lib/views/level-up-view";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import { Button, Chip, Choice, Room, Stepper, type ArtKind } from "@/ui";

import type { InfoKind } from "@/domains/spells/option-info";
import { PickGrid } from "@/domains/spells/ui/PickGrid";
import { tieLast } from "@/lib/text-ties";

import { ClassCrest } from "./ClassCrest";

/** The questions whose options are catalogue entries with painted art. */
/** What the inspect card reads each question's options as. */
const ROW_INFO: Partial<Record<string, InfoKind>> = {
  feat: "feat",
  fightingStyle: "feat",
  invocations: "invocation",
  metamagic: "metamagic",
  maneuvers: "maneuver",
  weaponMasteries: "weapon",
  expertise: "skill",
  mcSkills: "skill",
};
/** Questions whose options are skills: chips, like the sheet's skill list. */
const SKILL_ROWS = new Set(["expertise", "mcSkills"]);
const ROW_ART: Partial<Record<string, ArtKind>> = {
  subclass: "subclass",
  feat: "feat",
  fightingStyle: "feat",
  weaponMasteries: "equipment",
};

export function LevelUpScreen({
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const asks = levelUpAsks(doc, classId, answers, locale);
  const { plan } = asks;
  const steps = levelUpSteps(asks);
  const owed = steps.filter((s) => s.state === "owed").length;
  // The character the commit would save, and what changes against today's.
  const after = (() => {
    try {
      return commitLevelUp(doc, asks.picks);
    } catch {
      return null;
    }
  })();
  const review = after ? levelUpReview(doc, after, locale) : null;
  const summary = levelUpSummary(after ?? doc, locale);

  const classic = `/characters/${doc.id}/level-up/classic`;
  if (!asks.supported) return <Navigate to={classic} replace />;
  const conMod = abilityModifier(c.abilityScores.CON);
  // «5 + 2», «d8 − 1»: the die, then the CON modifier every level adds.
  const plusCon = conMod >= 0 ? `+ ${String(conMod)}` : `− ${String(-conMod)}`;
  const classLine = `${className(classId, locale)}\u00a0${String(plan.newClassLevel)}`;

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

  const toggle = (row: AskRow, id: string) => setAnswers(toggleAnswer(answers, row, id));
  const confirmLabel = t("levelUp.screen.confirm", { level: plan.newLevel });
  const owedLabel = t("levelUp.screen.owed", { count: owed });
  const canConfirm = asks.complete && !saving && after !== null;

  return (
    <>
      <Room room="study" band />
      <main id="main" className="f-page f-lvl">
        <div
          className="f-lvl-rail"
          role="navigation"
          aria-label={t("levelUp.screen.steps")}
        >
          {steps.map((s) => (
            <a
              key={s.key}
              href={`#lvl-${s.key}`}
              className="f-lvl-step"
              data-state={s.state}
            >
              <StepMark state={s.state} />
              <span>
                {tieLast(s.key === "hp" ? t("roster.hp") : s.title)}
                <small>
                  {s.key === "hp"
                    ? answers.rolled === null
                      ? t("levelUp.screen.hpAverage")
                      : t("levelUp.screen.hpRoll")
                    : s.state === "optional"
                      ? t("levelUp.screen.optional")
                      : s.picked.join(", ")}
                </small>
              </span>
            </a>
          ))}
        </div>

        <div className="f-lvl-main">
          <header className="f-lvl-hero" data-identity>
            <ClassCrest classId={classId} />
            <div>
              <h1>
                <span className="f-lvl-from">{plan.newLevel - 1}</span>
                <span className="f-lvl-arrow" aria-hidden="true">
                  →
                </span>
                {tieLast(t("spells.level", { level: plan.newLevel }))}
              </h1>
              <p>
                {c.name}
                {"\u00a0· "}
                {classLine}
                {owned.length === 1 && eligibleNewClasses(c).length > 0 && (
                  <>
                    {"\u00a0· "}
                    <Link className="f-link" to={classic}>
                      {t("levelUp.screen.otherClass")}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <Button kind="quiet" icon="u-close" onClick={onClose}>
              {t("common.close")}
            </Button>
          </header>

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

          {review && <Gains numbers={review.numbers} gained={review.gained} />}

          <section id="lvl-hp" className="f-lvl-sec">
            <h2>
              {createElement(FolioSupportIcon, { "aria-hidden": true })}
              {t("levelUp.screen.hpQuestion")}
            </h2>
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
          </section>

          {asks.rows.map((row) => (
            <Question
              key={row.key}
              row={row}
              step={steps.find((s) => s.key === row.key)}
              locale={locale}
              onToggle={(id) => toggle(row, id)}
            />
          ))}
          <p className="f-help">{t("levelUp.screen.rest")}</p>
        </div>

        <aside className="f-lvl-sum" aria-label={t("levelUp.screen.summary")}>
          <div className="f-lvl-sum-h">
            <ClassCrest classId={classId} size="sm" />
            <div>
              <b>{c.name}</b>
              <span>{classLine}</span>
            </div>
          </div>
          <dl className="f-lvl-abil">
            {summary.abilities.map((a) => (
              <div key={a.id}>
                <dt>{t(`abilities.${a.id}_short`)}</dt>
                <dd>{a.score}</dd>
              </div>
            ))}
          </dl>
          <div className="f-lvl-badges">
            <span>
              {createElement(FolioSupportIcon, { "aria-hidden": true })}
              <b>{summary.hp}</b>
              {t("units.hp")}
            </span>
            <span>
              <b>{summary.ac}</b>
              {t("character.armorClassShort")}
            </span>
          </div>
          <KnownRow
            label={t("levelUp.screen.cantripsKnown", { count: summary.cantrips.length })}
            known={summary.cantrips}
            owed={steps.some((s) => s.key === "newCantrips" && s.state === "owed")}
          />
          <KnownRow
            label={t("levelUp.screen.spellsKnown", { count: summary.spells.length })}
            known={summary.spells}
            owed={steps.some((s) => s.key === "newSpells" && s.state === "owed")}
          />
          {error && (
            <p className="f-err" role="alert">
              {error}
            </p>
          )}
          {owed > 0 && <p className="f-lvl-owed">{owedLabel}</p>}
          <Button kind="primary" disabled={!canConfirm} onClick={() => void confirm()}>
            {confirmLabel}
          </Button>
        </aside>

        <div className="f-lvl-bar">
          <ClassCrest classId={classId} size="sm" />
          <span>
            <b>
              {createElement(FolioSupportIcon, { "aria-hidden": true })}
              {summary.hp}
            </b>
            {owed > 0 && <small>{owedLabel}</small>}
          </span>
          <Button kind="primary" disabled={!canConfirm} onClick={() => void confirm()}>
            {t("common.confirm")}
          </Button>
        </div>
      </main>
    </>
  );
}

function StepMark({ state }: { state: LevelUpStep["state"] }) {
  return (
    <span className="f-lvl-mark" data-state={state} aria-hidden="true">
      {state === "done" ? "✓" : state === "owed" ? "!" : "–"}
    </span>
  );
}

/** What the level gives: before → after numbers, then each new feature, as tiles. */
function Gains({
  numbers,
  gained,
}: {
  numbers: readonly ReviewNumber[];
  gained: ReturnType<typeof levelUpReview>["gained"];
}) {
  const { t } = useTranslation();
  const label = (r: ReviewNumber) =>
    r.kind === "hp"
      ? t("roster.hp")
      : r.kind === "pb"
        ? t("levelUp.screen.pb")
        : r.kind === "slot"
          ? t(r.pact ? "levelUp.screen.pactSlot" : "play.slot", { level: r.level })
          : r.kind === "table"
            ? t(`levelUp.screen.table.${r.key}`)
            : r.name;
  const icon = (r: ReviewNumber): ReactNode =>
    r.kind === "hp" ? (
      <span className="f-lvl-ic" data-tone="hp">
        {createElement(FolioSupportIcon)}
      </span>
    ) : r.kind === "slot" ? (
      <span className="f-lvl-ic" data-tone="slot">
        <span className="f-lvl-pip" />
      </span>
    ) : r.kind === "table" ? (
      <span className="f-lvl-ic f-lvl-ic-v">{r.after}</span>
    ) : (
      <span className="f-lvl-ic">{createElement(FolioFocusIcon)}</span>
    );
  const features = gained.filter((g) => g.kind === "feature" || g.kind === "subclass");
  return (
    <ul className="f-lvl-gains">
      {numbers.map((r) => (
        <li key={r.id}>
          {icon(r)}
          <span className="f-lvl-gain-l">{tieLast(label(r))}</span>
          <span className="f-lvl-gain-v">
            {r.before !== null && r.before !== r.after && (
              <>
                <s>{r.before}</s>
                <span className="f-lvl-arrow" aria-hidden="true">
                  →
                </span>
              </>
            )}
            <b>{r.after}</b>
          </span>
        </li>
      ))}
      {features.map((g) => (
        <li key={`${g.kind}:${g.id}`}>
          <span className="f-lvl-ic">{createElement(FolioBookIcon)}</span>
          <span className="f-lvl-gain-l">{tieLast(g.name)}</span>
          <span className="f-lvl-new">{t("levelUp.screen.new")}</span>
        </li>
      ))}
    </ul>
  );
}

/** One question: its options as an icon grid; spells carry an inspect card. */
function Question({
  row,
  step,
  locale,
  onToggle,
}: {
  row: AskRow;
  step: LevelUpStep | undefined;
  locale: Locale;
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <section id={`lvl-${row.key}`} className="f-lvl-sec">
      <h2>
        {createElement(row.spell ? FolioBookIcon : FolioFeatIcon, {
          "aria-hidden": true,
        })}
        {row.title}
        {row.count > 0 && (
          <span className="f-lvl-count" data-state={step?.state}>
            {`${String(row.picked.length)}/${String(row.count)}`}
          </span>
        )}
      </h2>
      <PickGrid
        label={row.title}
        options={row.options}
        picked={row.picked}
        spells={row.spell}
        art={ROW_ART[row.key]}
        info={ROW_INFO[row.key]}
        chips={SKILL_ROWS.has(row.key)}
        count={row.count}
        locale={locale}
        onToggle={onToggle}
      />
      {row.count === 0 && <p className="f-help">{t("levelUp.screen.optionalHint")}</p>}
    </section>
  );
}

function KnownRow({
  label,
  known,
  owed,
}: {
  label: string;
  known: ReturnType<typeof levelUpSummary>["spells"];
  owed: boolean;
}) {
  if (known.length === 0 && !owed) return null;
  return (
    <div className="f-lvl-known">
      <span className="f-lbl">{label}</span>
      <div>
        {/* BG3 names every icon on hover; a tap names it on a phone. */}
        {known.map((s) => (
          <button key={s.id} type="button" className="f-known" aria-label={s.name}>
            <SpellArt id={s.id} school={s.school} size="sm" />
            <span className="f-slot-tip" aria-hidden="true">
              <b>{s.name}</b>
            </span>
          </button>
        ))}
        {owed && (
          <span className="f-lvl-missing" aria-hidden="true">
            ?
          </span>
        )}
      </div>
    </div>
  );
}

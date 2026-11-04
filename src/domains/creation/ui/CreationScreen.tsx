/**
 * «Nuovo personaggio» on the new frame (approved prototypes create-1…6): the armoury
 * above the page, six guided steps, and the «Personaggio» summary beside the step
 * (below it on a phone). This version holds steps 1 (Classe) and 2 (Background); the
 * others follow. The form state is the core draft (`useCreationDraft`), its facts
 * `creationFacts`: the screen keeps only which step is open.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  backgroundRows,
  classCards,
  creationSummary,
  signed,
  suggestedBonus,
  suggestedScores,
  type ClassCard,
} from "@/domains/creation/creation-view";
import {
  AbilitiesStep,
  SpeciesStep,
  type AbilityMethod,
} from "@/domains/creation/ui/CreationSteps";
import { useCreationDraft } from "@/features/creation/use-creation-draft";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLocale } from "@/hooks/useLocale";
import { creationFacts } from "@/lib/creation/draft";
import { Button, Choice, Field, Icon, Panel, Room } from "@/ui";

const STEPS = [
  "create.stepClass",
  "create.stepBackground",
  "create.stepRace",
  "create.stepAbilities",
  "create.stepEquipment",
  "levelUp.stepReview",
] as const;

export function CreationScreen() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  useDocumentTitle(t("create.screen.title"));
  const [draft, dispatch] = useCreationDraft();
  const facts = creationFacts(draft);
  const summary = creationSummary(draft, facts, locale);
  const [step, setStep] = useState(0);
  const cards = useMemo(() => classCards(locale), [locale]);
  const backgrounds = useMemo(() => backgroundRows(locale), [locale]);
  const card = cards.find((c) => c.id === draft.classId);
  // The draft opens on a ready build, but a background is the player's to pick: until
  // they do, it shows as «—» and the step waits (never a silent default).
  const [bgPicked, setBgPicked] = useState(false);
  const background = bgPicked ? summary.background : null;
  // The pack brings dozens of backgrounds: a search narrows them (name, skill, feat).
  const [bgQuery, setBgQuery] = useState("");
  const shownBackgrounds = useMemo(() => {
    const q = fold(bgQuery.trim());
    return q
      ? backgrounds.filter((bg) =>
          fold([bg.name, ...bg.skills, bg.feat].join(" ")).includes(q)
        )
      : backgrounds;
  }, [backgrounds, bgQuery]);
  // A species is the player's pick too (never a silent default), with its own choices.
  const [speciesPicked, setSpeciesPicked] = useState(false);
  const speciesReady =
    speciesPicked && facts.lineageComplete && (!facts.isHuman || draft.humanFeat !== "");
  // How the scores are set; «Valori consigliati» seeds the class's ready-made scores
  // the first time the step opens for that class.
  const [method, setMethod] = useState<AbilityMethod>("suggested");
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  const applySuggested = () => {
    dispatch({ type: "setUsePointBuy", usePointBuy: false });
    const scores = suggestedScores(draft.classId);
    dispatch({ type: "setAbilityScores", abilityScores: scores });
    // An unplaced bonus goes where the suggested build wants it; one placed stays.
    if (Object.keys(draft.bgAsiChoices).length === 0 && facts.backgroundData) {
      dispatch({ type: "switchAbilityBonusMode", mode: "+2/+1" });
      for (const code of suggestedBonus(scores, facts.backgroundData.abilityOptions))
        dispatch({ type: "toggleAbilityBonus", code });
    }
    setSuggestedFor(draft.classId);
  };
  const abilitiesReady =
    facts.abilityBonusValid && (method !== "pointBuy" || facts.pointsRemaining >= 0);
  const go = (to: number) => {
    if (to === 3 && method === "suggested" && suggestedFor !== draft.classId)
      applySuggested();
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const blocked =
    (step === 1 && !bgPicked) ||
    (step === 2 && !speciesReady) ||
    (step === 3 && !abilitiesReady);
  const blockedHint =
    step === 1
      ? t("create.screen.pickBackground")
      : step === 2
        ? !speciesPicked
          ? t("create.screen.pickSpecies")
          : !facts.lineageComplete
            ? t("create.lineageRequired")
            : t("create.needHumanFeat")
        : !facts.abilityBonusValid
          ? t("create.screen.pickAbilities")
          : t("create.screen.overBudget");
  const nav = (
    <>
      {step > 0 && <Button onClick={() => go(step - 1)}>{t("common.back")}</Button>}
      {blocked && <span className="f-help">{blockedHint}</span>}
      {step < STEPS.length - 1 && (
        <Button kind="primary" disabled={blocked} onClick={() => go(step + 1)}>
          {t("common.next")}
        </Button>
      )}
    </>
  );
  return (
    <>
      <Room room="armoury" />
      <main id="main" className="f-page f-create">
        <header className="f-ph">
          <div>
            <h1>{t("create.screen.title")}</h1>
            <p>{t("create.screen.subtitle")}</p>
          </div>
        </header>
        <ol className="f-steps stp" aria-label={t("create.screen.steps")}>
          {STEPS.map((key, i) => (
            <li key={key} aria-current={i === step ? "step" : undefined}>
              <button
                type="button"
                disabled={i > step}
                onClick={() => go(i)}
                aria-label={`${String(i + 1)}. ${t(key)}`}
              >
                <span className="f-step-n">{i + 1}</span>
                <span className="f-step-l">{t(key)}</span>
              </button>
            </li>
          ))}
          <li className="f-step-of" aria-hidden="true">
            {t("create.screen.of", { total: STEPS.length })}
          </li>
        </ol>
        <div className="f-create-grid">
          <Panel
            color="res"
            title={t(STEPS[step] ?? STEPS[0])}
            foot={nav}
            className="f-create-step"
          >
            {step === 0 ? (
              <ClassStep
                cards={cards}
                current={card}
                onPick={(classId) => dispatch({ type: "selectClass", classId })}
              />
            ) : step === 1 ? (
              <div className="f-ask">
                <Field
                  label={t("create.screen.searchBackground")}
                  type="search"
                  autoComplete="off"
                  value={bgQuery}
                  onChange={(e) => setBgQuery(e.target.value)}
                />
                <div className="f-choices f-create-list">
                  {shownBackgrounds.map((bg) => (
                    <Choice
                      key={bg.id}
                      on={bgPicked && draft.backgroundId === bg.id}
                      onClick={() => {
                        setBgPicked(true);
                        dispatch({ type: "selectBackground", backgroundId: bg.id });
                      }}
                    >
                      <span className="f-row-main">
                        <span className="f-row-t">{bg.name}</span>
                        <span className="f-row-s">
                          {[
                            new Intl.ListFormat(locale, { type: "conjunction" }).format(
                              bg.skills
                            ),
                            t("create.screen.featLine", { feat: bg.feat }),
                          ].join(" · ")}
                        </span>
                      </span>
                    </Choice>
                  ))}
                </div>
                {background && (
                  <blockquote className="f-create-pitch">
                    <b>{background}</b>
                    <p>{t("create.screen.backgroundHint")}</p>
                  </blockquote>
                )}
              </div>
            ) : step === 2 ? (
              <SpeciesStep
                draft={draft}
                facts={facts}
                picked={speciesPicked}
                locale={locale}
                onPick={(raceId) => {
                  setSpeciesPicked(true);
                  dispatch({ type: "selectRace", raceId });
                }}
                dispatch={dispatch}
              />
            ) : step === 3 ? (
              <AbilitiesStep
                draft={draft}
                facts={facts}
                method={method}
                className={summary.className}
                backgroundName={summary.background ?? ""}
                onMethod={(m) => {
                  setMethod(m);
                  if (m === "suggested") applySuggested();
                  else
                    dispatch({ type: "setUsePointBuy", usePointBuy: m === "pointBuy" });
                }}
                dispatch={dispatch}
              />
            ) : (
              <p className="f-help">{t("create.screen.soon")}</p>
            )}
          </Panel>
          <Panel
            color="grp"
            title={t("create.screen.character")}
            className="f-create-sum"
          >
            <div className="f-create-who">
              <span className="f-medal medal" aria-hidden="true">
                {card && <Icon name={card.art.icon} size={56} />}
              </span>
              <b>
                {t("create.screen.classLevel", {
                  name: summary.className,
                  level: summary.level,
                })}
              </b>
            </div>
            <dl className="f-create-facts">
              <div>
                <dt className="f-lbl">{t("stats.hitDie")}</dt>
                <dd>{summary.hitDie}</dd>
              </div>
              <div>
                <dt className="f-lbl">{t("create.screen.primaryAbility")}</dt>
                <dd>{summary.primaryAbility}</dd>
              </div>
              {summary.armor && (
                <div>
                  <dt className="f-lbl">{t("equipment.armor")}</dt>
                  <dd>{summary.armor}</dd>
                </div>
              )}
              <div>
                <dt className="f-lbl">{t("create.backgroundLabel")}</dt>
                <dd>{background ?? "—"}</dd>
              </div>
              <div>
                <dt className="f-lbl">{t("create.speciesLabel")}</dt>
                <dd>{speciesPicked ? summary.species : "—"}</dd>
              </div>
              {step >= 3 && summary.primaryScore && (
                <div>
                  <dt className="f-lbl">{t(`abilities.${summary.primaryScore.code}`)}</dt>
                  <dd>{`${String(summary.primaryScore.score)} (${signed(summary.primaryScore.mod)})`}</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
      </main>
    </>
  );
}

function ClassStep({
  cards,
  current,
  onPick,
}: {
  cards: ClassCard[];
  current: ClassCard | undefined;
  onPick: (classId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="f-ask">
      <div className="f-class-grid">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            className={current?.id === c.id ? "f-class-card cc on" : "f-class-card cc"}
            aria-pressed={current?.id === c.id}
            onClick={() => onPick(c.id)}
          >
            <span className="f-medal medal" aria-hidden="true">
              <Icon name={c.art.icon} size={40} />
            </span>
            <span className="f-class-name">{c.name}</span>
          </button>
        ))}
      </div>
      {current && (
        <blockquote className="f-create-pitch">
          <b>{current.name}</b>
          <p>
            {t(`create.tip_${current.id}`)}{" "}
            <strong>{t(`create.screen.goodIf.${current.id}`)}</strong>
          </p>
        </blockquote>
      )}
    </div>
  );
}

/** Lower case without accents, for a forgiving search. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

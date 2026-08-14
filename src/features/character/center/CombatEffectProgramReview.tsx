/**
 * Review-only edge for one fixed combat-effect invocation.
 *
 * The engine owns question derivation, answer validation, artifact immutability,
 * and interpretation. This component only records physical/table facts in the
 * authored order and previews the returned plan. No live state adapter reaches
 * this boundary: Apply hands the immutable plan back to the caller explicitly.
 */

import { useId, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/input";
import { ModalBody, ModalFoot } from "@/components/ui/modal-head";
import { RadioGroup, RadioGroupItem } from "@/components/ui/selection";
import { ModalShell } from "@/components/shared/ModalShell";
import type { CombatEffectProgram } from "@/data/types";
import { DAMAGE_TYPES as CANONICAL_DAMAGE_TYPES } from "@/types/damage";
import { useLocale } from "@/hooks/useLocale";
import { enteredD20FaceCount } from "@/lib/character-d20-tests";
import {
  createReviewedCombatEffectArtifact,
  deriveCombatEffectRequirements,
  interpretCombatEffectArtifact,
  type CombatEffectConsequence,
  type CombatEffectDiceFact,
  type CombatEffectEntityRef,
  type CombatEffectEvent,
  type CombatEffectExecution,
  type CombatEffectPlan,
  type CombatEffectPlanningState,
  type CombatEffectProvidedAnswer,
  type CombatEffectRequirement,
  type CombatEffectStateView,
} from "@/lib/combat-effect-program";
import { evaluateEnteredCombatD20Test } from "@/lib/combat-test-context";
import { evaluateIntegerExpression } from "@/lib/integer-expression";
import { abilityLabel } from "@/lib/views/level-up-view";
import { conditionLabel } from "@/lib/views/tracker-view";
import type { Locale } from "@/lib/locale";
import type { D20TestResult } from "@/types/d20-test";
import { EnteredD20Faces } from "../molecules/EnteredD20Faces";

export interface CombatEffectProgramReviewProps {
  open: boolean;
  /** Fixed for the lifetime of this open review. */
  program: CombatEffectProgram;
  /** Fully constructed, locale-free invocation context. */
  execution: CombatEffectExecution;
  /** Snapshot boundary whose drafts are disposable by contract. */
  planningState: CombatEffectPlanningState;
  /** Presentation seam for source/target identities; never used for engine logic. */
  resolveEntityLabel: (ref: CombatEffectEntityRef) => string;
  /** Presentation seam for authored choice/effect/resource/layer ids. */
  resolveFactLabel: (id: string) => string;
  onApply: (plan: Readonly<CombatEffectPlan>) => void;
  onCancel: () => void;
}

interface ReviewReady {
  kind: "ready";
  plan: Readonly<CombatEffectPlan>;
  requirements: ReadonlyArray<CombatEffectRequirement>;
}

interface ReviewAnswering {
  kind: "answering";
  requirement: CombatEffectRequirement;
  requirements: ReadonlyArray<CombatEffectRequirement>;
}

interface ReviewError {
  kind: "error";
}

type ReviewState = ReviewReady | ReviewAnswering | ReviewError;

interface PreviewChange {
  label: string;
  before: string;
  after: string;
}

interface PreviewRow {
  title: string;
  detail?: string;
  changes: ReadonlyArray<PreviewChange>;
}

const DAMAGE_TYPES = new Set<string>(CANONICAL_DAMAGE_TYPES);

function formula(
  requirement: Extract<CombatEffectRequirement, { kind: "roll" | "table-roll" }>
) {
  const { count, sides, bonus } = requirement.roll;
  return `${count}d${sides}${bonus === 0 ? "" : bonus > 0 ? ` + ${bonus}` : ` − ${Math.abs(bonus)}`}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function joined(values: ReadonlyArray<string>, none: string): string {
  return values.length === 0 ? none : values.join(", ");
}

function booleanLabel(value: boolean, t: TFunction): string {
  return t(value ? "common.yes" : "common.no");
}

function stateChanges(
  before: CombatEffectStateView,
  after: CombatEffectStateView,
  t: TFunction,
  locale: Locale,
  resolveFactLabel: (id: string) => string
): PreviewChange[] {
  const changes: PreviewChange[] = [];
  const add = (label: string, prior: string | number, next: string | number) => {
    if (prior !== next)
      changes.push({ label, before: String(prior), after: String(next) });
  };
  add(t("character.hitPoints"), before.hp, after.hp);
  add(t("abilities.hpMaxLabel"), before.maxHp, after.maxHp);
  add(t("combat.temp"), before.tempHp, after.tempHp);
  add(
    t("combat.effectReview.stable"),
    booleanLabel(before.stable, t),
    booleanLabel(after.stable, t)
  );
  add(
    t("deathSaves.title"),
    t("combat.effectReview.deathSaveTrack", before.deathSaves),
    t("combat.effectReview.deathSaveTrack", after.deathSaves)
  );
  if (!sameJson(before.conditions, after.conditions)) {
    changes.push({
      label: t("combat.effectReview.conditions"),
      before: joined(
        before.conditions.map((condition) => conditionLabel(condition, locale)),
        t("abilities.none")
      ),
      after: joined(
        after.conditions.map((condition) => conditionLabel(condition, locale)),
        t("abilities.none")
      ),
    });
  }
  if (!sameJson(before.standing, after.standing)) {
    changes.push({
      label: t("combat.effectReview.activeEffects"),
      before: joined(before.standing.map(resolveFactLabel), t("abilities.none")),
      after: joined(after.standing.map(resolveFactLabel), t("abilities.none")),
    });
  }
  const resourceIds = [
    ...new Set([...Object.keys(before.resources), ...Object.keys(after.resources)]),
  ].sort();
  for (const resourceId of resourceIds) {
    const prior = before.resources[resourceId];
    const next = after.resources[resourceId];
    if (prior === undefined || next === undefined) {
      throw new TypeError("Combat-effect resource receipt changed its schema");
    }
    add(resolveFactLabel(resourceId), prior, next);
  }
  const stateFlagIds = [
    ...new Set([...Object.keys(before.stateFlags), ...Object.keys(after.stateFlags)]),
  ].sort();
  for (const stateFlagId of stateFlagIds) {
    const prior = before.stateFlags[stateFlagId];
    const next = after.stateFlags[stateFlagId];
    if (prior === undefined || next === undefined) {
      throw new TypeError("Combat-effect state-flag receipt changed its schema");
    }
    add(resolveFactLabel(stateFlagId), booleanLabel(prior, t), booleanLabel(next, t));
  }
  return changes;
}

function requiredAppliedAmount(consequence: CombatEffectConsequence): number {
  if (!("appliedAmount" in consequence) || consequence.appliedAmount === undefined) {
    throw new TypeError("Combat-effect receipt omitted its applied amount");
  }
  return consequence.appliedAmount;
}

function assertStabilizeConsequence(
  consequence: CombatEffectConsequence
): asserts consequence is Extract<CombatEffectConsequence, { kind: "stabilize" }> {
  if (consequence.kind !== "stabilize") {
    throw new TypeError("Unknown combat-effect consequence");
  }
}

function consequenceRows(
  consequence: CombatEffectConsequence,
  t: TFunction,
  locale: Locale,
  resolveEntityLabel: (ref: CombatEffectEntityRef) => string,
  resolveFactLabel: (id: string) => string
): PreviewRow[] {
  if (consequence.kind === "counter") {
    return [
      {
        title: resolveFactLabel(consequence.counterId),
        changes: [
          {
            label: resolveFactLabel(consequence.counterId),
            before: String(consequence.before),
            after: String(consequence.after),
          },
        ],
      },
    ];
  }
  if (consequence.kind === "end-program") {
    return [{ title: t("combat.effectReview.endEffect"), changes: [] }];
  }

  const recipient = resolveEntityLabel(consequence.recipient);
  const changes = stateChanges(
    consequence.before,
    consequence.after,
    t,
    locale,
    resolveFactLabel
  );
  const persistent = consequence.persistentConsequences;
  if (persistent) {
    for (const occurrence of persistent.occurrenceChanges) {
      const fact = occurrence.descriptor
        ? occurrence.descriptor.kind === "condition"
          ? conditionLabel(occurrence.descriptor.condition, locale)
          : resolveFactLabel(occurrence.descriptor.effectId)
        : resolveFactLabel(occurrence.effectId);
      changes.push({
        label: `${resolveEntityLabel(occurrence.recipient)} · ${fact}`,
        before: booleanLabel(occurrence.expectedActive, t),
        after: booleanLabel(occurrence.active, t),
      });
    }
  }

  let row: PreviewRow;
  if (consequence.kind === "damage") {
    const applied = consequence.appliedComponents;
    if (applied === undefined || applied.length !== consequence.components.length) {
      throw new TypeError("Combat-effect damage receipt omitted component totals");
    }
    const detail = consequence.components
      .map((component, index) => {
        const result = applied[index];
        if (!result || result.stepId !== component.stepId) {
          throw new TypeError("Combat-effect damage receipt reordered its components");
        }
        return `${result.appliedAmount} ${t(`srd.damage_${component.damageType}`)}`;
      })
      .join(" + ");
    row = {
      title: `${recipient} · ${t("combat.damage")} · ${requiredAppliedAmount(consequence)}`,
      detail,
      changes,
    };
  } else if (consequence.kind === "resolved-damage") {
    row = {
      title: `${recipient} · ${t("combat.effectReview.transferredDamage")} · ${requiredAppliedAmount(consequence)}`,
      detail: resolveFactLabel(consequence.sourceEffectId),
      changes,
    };
  } else if (consequence.kind === "state-flag") {
    const label = resolveFactLabel(consequence.stateKey);
    row = {
      title: `${recipient} · ${
        consequence.operation === "deactivate"
          ? t("combat.effectReview.consumedState", { name: label })
          : `${t("common.add")} ${label}`
      }`,
      changes,
    };
  } else if (consequence.kind === "heal") {
    row = {
      title: `${recipient} · ${t("combat.heal")} · ${requiredAppliedAmount(consequence)}`,
      changes,
    };
  } else if (consequence.kind === "temp-hp") {
    row = {
      title: `${recipient} · ${t("combat.temp")} · ${requiredAppliedAmount(consequence)}`,
      changes,
    };
  } else if (consequence.kind === "condition") {
    row = {
      title: `${recipient} · ${t(
        consequence.operation === "apply" ? "common.add" : "common.remove"
      )} ${conditionLabel(consequence.condition, locale)}`,
      changes,
    };
  } else if (consequence.kind === "standing") {
    row = {
      title: `${recipient} · ${t(
        consequence.operation === "start" ? "common.add" : "common.remove"
      )} ${resolveFactLabel(consequence.effectId)}`,
      changes,
    };
  } else if (consequence.kind === "resource") {
    row = {
      title: `${recipient} · ${t(
        consequence.operation === "spend" ? "common.remove" : "common.add"
      )} ${consequence.amount} ${resolveFactLabel(consequence.resourceId)}`,
      changes,
    };
  } else if (consequence.kind === "damage-reduction") {
    row = {
      title: `${recipient} · ${t("abilities.damageReductionLabel")} · ${requiredAppliedAmount(consequence)}`,
      changes,
    };
  } else {
    assertStabilizeConsequence(consequence);
    row = {
      title: `${recipient} · ${t("combat.resolveStabilize")}`,
      changes,
    };
  }

  return [row];
}

function diceTrail(fact: CombatEffectDiceFact): string {
  const trails = fact.dice.map((die) =>
    [die.initialFace, ...die.replacements.map((replacement) => replacement.face)].join(
      " → "
    )
  );
  return `${trails.join(" + ")} = ${fact.total}`;
}

function eventRow(
  event: CombatEffectEvent,
  t: TFunction,
  resolveEntityLabel: (ref: CombatEffectEntityRef) => string,
  resolveFactLabel: (id: string) => string
): PreviewRow {
  if (event.kind === "layer") {
    return {
      title: resolveFactLabel(event.layerId),
      changes: [
        {
          label: resolveFactLabel(event.layerId),
          before: t(`combat.effectReview.layerState_${event.before}`),
          after: t(`combat.effectReview.layerState_${event.after}`),
        },
      ],
    };
  }
  if (event.kind === "area-state") {
    return {
      title: `${t(event.operation === "apply" ? "common.add" : "common.remove")} ${resolveFactLabel(event.fact)}`,
      changes: [
        {
          label: resolveFactLabel(event.fact),
          before: booleanLabel(event.before, t),
          after: booleanLabel(event.after, t),
        },
      ],
    };
  }
  const recipient = resolveEntityLabel(event.recipient);
  const destination =
    event.destination.kind === "manual"
      ? t("combat.effectReview.manualDestination")
      : diceTrail(event.destination.roll);
  return {
    title: t(`combat.effectReview.relocation_${event.mode}`, { name: recipient }),
    detail: destination,
    changes: [],
  };
}

function requirementTitle(
  requirement: CombatEffectRequirement,
  t: TFunction,
  locale: Locale,
  resolveFactLabel: (id: string) => string
): string {
  if (requirement.kind === "attack") return t("combat.resolveAttackRoll");
  if (requirement.kind === "save") {
    if (requirement.context.kind !== "saving-throw") {
      throw new TypeError("Reviewed save requirement has the wrong D20 context");
    }
    const dc = evaluateIntegerExpression(requirement.context.difficultyClass, {});
    if (dc === null) {
      throw new TypeError("Reviewed save requirement has an unresolved DC");
    }
    return t("combat.resolveSave", {
      ability: abilityLabel(requirement.ability, locale),
      dc,
    });
  }
  if (requirement.kind === "check") {
    return t(
      requirement.skill
        ? "combat.effectReview.skillCheck"
        : "combat.effectReview.abilityCheck",
      {
        ability: abilityLabel(requirement.ability, locale),
        dc: requirement.dc,
        skill: requirement.skill ? resolveFactLabel(requirement.skill) : undefined,
      }
    );
  }
  if (requirement.kind === "choice") return t("combat.effectReview.chooseOne");
  return t(
    requirement.kind === "table-roll"
      ? "combat.effectReview.tableRoll"
      : "combat.effectReview.physicalRoll",
    { formula: formula(requirement) }
  );
}

function choiceLabel(
  id: string,
  t: TFunction,
  locale: Locale,
  resolveFactLabel: (id: string) => string
): string {
  if (DAMAGE_TYPES.has(id)) return t(`srd.damage_${id}`);
  const ability = id.toUpperCase();
  if (["STR", "DEX", "CON", "INT", "WIS", "CHA"].includes(ability)) {
    return abilityLabel(ability, locale);
  }
  return resolveFactLabel(id);
}

function answerSummary(
  answer: CombatEffectProvidedAnswer,
  requirement: CombatEffectRequirement,
  t: TFunction,
  locale: Locale,
  resolveFactLabel: (id: string) => string
): string {
  if (requirement.kind === "choice") {
    if (typeof answer.value !== "string") {
      throw new TypeError("Reviewed choice answer is not a choice id");
    }
    return choiceLabel(answer.value, t, locale, resolveFactLabel);
  }
  if (requirement.kind === "roll" || requirement.kind === "table-roll") {
    if (typeof answer.value !== "object" || !("dice" in answer.value)) {
      throw new TypeError("Reviewed roll answer is not a dice fact");
    }
    return diceTrail(answer.value);
  }
  const value = answer.value as D20TestResult;
  const attack = value.outcome.kind === "attack" ? value.outcome : undefined;
  const outcome = attack
    ? t(
        attack.critical
          ? "combat.critHit"
          : attack.hit
            ? "combat.declareHit"
            : "combat.declareMiss"
      )
    : value.outcome.status === "success"
      ? t("deathSaves.successes")
      : value.outcome.status === "failure"
        ? t("deathSaves.failures")
        : (() => {
            throw new TypeError("Reviewed gate answer has no resolvable outcome");
          })();
  return value.total === null
    ? `${t("combat.resolveAutomaticResult")} · ${outcome}`
    : `${value.total} · ${outcome}`;
}

function D20Answer({
  requirement,
  onAnswer,
  onFailure,
}: {
  requirement: Extract<CombatEffectRequirement, { kind: "attack" | "save" | "check" }>;
  onAnswer: (value: D20TestResult) => void;
  onFailure: () => void;
}) {
  const { t } = useTranslation();
  const [first, setFirst] = useState(10);
  const [second, setSecond] = useState(10);
  const rollRules = requirement.context.rollRules;
  const automatic = requirement.context.resolution.kind === "automatic";
  const faceCount = automatic ? 0 : enteredD20FaceCount(rollRules);
  const rollMode =
    rollRules.advantageSourceIds.length > 0 &&
    rollRules.disadvantageSourceIds.length === 0
      ? "advantage"
      : rollRules.disadvantageSourceIds.length > 0 &&
          rollRules.advantageSourceIds.length === 0
        ? "disadvantage"
        : null;

  const record = () => {
    const faces = faceCount === 0 ? [] : faceCount === 2 ? [first, second] : [first];
    const result = evaluateEnteredCombatD20Test(requirement.context, { faces });
    if (result) onAnswer(result);
    else onFailure();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {rollMode ? (
        <span className="rounded-sm border border-border-subtle px-2 py-1 font-mono text-xs text-text-secondary">
          {t(`combat.rollMode.${rollMode}`)}
        </span>
      ) : null}
      {faceCount === 0 ? (
        <p className="m-0 flex-1 text-sm text-text-secondary">
          {t("combat.resolveAutomaticResult")}
        </p>
      ) : (
        <EnteredD20Faces
          faceCount={faceCount}
          first={first}
          second={second}
          onFirstChange={setFirst}
          onSecondChange={setSecond}
          singleAriaLabel={t("combat.effectReview.d20Aria")}
          firstAriaLabel={t("combat.d20FirstAria")}
          secondAriaLabel={t("combat.d20SecondAria")}
          decrementLabel={t("common.decrease")}
          incrementLabel={t("common.increase")}
        />
      )}
      <Button size="sm" variant="secondary" onClick={record}>
        {t("common.continue")}
      </Button>
    </div>
  );
}

function RollAnswer({
  programId,
  requirement,
  onAnswer,
}: {
  programId: string;
  requirement: Extract<CombatEffectRequirement, { kind: "roll" | "table-roll" }>;
  onAnswer: (value: CombatEffectDiceFact) => void;
}) {
  const { t } = useTranslation();
  const [trails, setTrails] = useState<number[][]>(() =>
    Array.from({ length: requirement.roll.count }, () => [1])
  );
  const rerollValues = new Set(requirement.rerollValues ?? []);
  const needsReroll = trails.map((trail) => {
    const last = trail.at(-1);
    if (last === undefined) throw new TypeError("Physical die trail is empty");
    return rerollValues.has(last);
  });
  const updateFace = (dieIndex: number, faceIndex: number, face: number) => {
    setTrails((current) =>
      current.map((trail, index) =>
        index === dieIndex
          ? trail
              .slice(0, faceIndex + 1)
              .map((value, step) => (step === faceIndex ? face : value))
          : trail
      )
    );
  };
  const addReroll = (dieIndex: number) => {
    setTrails((current) =>
      current.map((trail, index) => (index === dieIndex ? [...trail, 1] : trail))
    );
  };
  const record = () => {
    const dice = trails.map((trail, dieIndex) => {
      const initialFace = trail[0];
      if (initialFace === undefined) throw new TypeError("Physical die trail is empty");
      return {
        dieId: `${requirement.key}:die:${dieIndex + 1}`,
        initialFace,
        replacements: trail.slice(1).map((face) => ({
          sourceId: `${programId}:${requirement.refId}:reroll`,
          face,
        })),
      };
    });
    const total = dice.reduce((sum, die) => {
      const replacement = die.replacements.at(-1);
      return sum + (replacement?.face ?? die.initialFace);
    }, requirement.roll.bonus);
    onAnswer({ dice, consumedResourceIds: [], total });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-text-secondary">
        {requirement.rerollValues?.length
          ? t("combat.effectReview.tableRerollHint", {
              faces: requirement.rerollValues.join(", "),
            })
          : t("combat.effectReview.rollHint")}
      </p>
      <div className="flex flex-col gap-2">
        {trails.map((trail, dieIndex) => (
          <div
            key={`${requirement.key}:die:${dieIndex + 1}`}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="min-w-14 font-mono text-xs text-text-secondary">
              d{requirement.roll.sides} {dieIndex + 1}
            </span>
            {trail.map((face, faceIndex) => (
              <NumberStepper
                key={`${requirement.key}:die:${dieIndex + 1}:face:${faceIndex + 1}`}
                value={face}
                onChange={(next) => updateFace(dieIndex, faceIndex, next)}
                min={1}
                max={requirement.roll.sides}
                digits={String(requirement.roll.sides).length}
                compact
                ariaLabel={t(
                  faceIndex === 0
                    ? "combat.effectReview.dieFaceAria"
                    : "combat.effectReview.rerollFaceAria",
                  {
                    die: dieIndex + 1,
                    reroll: faceIndex,
                    sides: requirement.roll.sides,
                  }
                )}
                decrementLabel={t("common.decrease")}
                incrementLabel={t("common.increase")}
              />
            ))}
            {needsReroll[dieIndex] ? (
              <Button size="sm" variant="ghost" onClick={() => addReroll(dieIndex)}>
                {t("combat.effectReview.enterReroll")}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Button
        className="self-end"
        size="sm"
        variant="secondary"
        disabled={needsReroll.some(Boolean)}
        onClick={record}
      >
        {t("common.continue")}
      </Button>
    </div>
  );
}

function ChoiceAnswer({
  requirement,
  locale,
  resolveFactLabel,
  onAnswer,
}: {
  requirement: Extract<CombatEffectRequirement, { kind: "choice" }>;
  locale: Locale;
  resolveFactLabel: (id: string) => string;
  onAnswer: (value: string) => void;
}) {
  const { t } = useTranslation();
  const groupId = useId();
  const [selected, setSelected] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <RadioGroup
        value={selected}
        onValueChange={setSelected}
        className="flex flex-col gap-2"
        aria-label={t("combat.effectReview.chooseOne")}
      >
        {requirement.options.map((option, index) => {
          const id = `${groupId}-${index}`;
          return (
            <div
              key={option}
              className="flex min-h-11 items-center gap-3 rounded-sm border border-border-subtle px-3 py-2"
            >
              <RadioGroupItem id={id} value={option} />
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer text-sm">
                {choiceLabel(option, t, locale, resolveFactLabel)}
              </label>
            </div>
          );
        })}
      </RadioGroup>
      <Button
        className="self-end"
        size="sm"
        variant="secondary"
        disabled={selected.length === 0}
        onClick={() => onAnswer(selected)}
      >
        {t("common.continue")}
      </Button>
    </div>
  );
}

function RequirementAnswer({
  programId,
  requirement,
  locale,
  resolveFactLabel,
  onAnswer,
  onFailure,
}: {
  programId: string;
  requirement: CombatEffectRequirement;
  locale: Locale;
  resolveFactLabel: (id: string) => string;
  onAnswer: (value: CombatEffectProvidedAnswer["value"]) => void;
  onFailure: () => void;
}) {
  if (
    requirement.kind === "attack" ||
    requirement.kind === "save" ||
    requirement.kind === "check"
  ) {
    return (
      <D20Answer requirement={requirement} onAnswer={onAnswer} onFailure={onFailure} />
    );
  }
  if (requirement.kind === "choice") {
    return (
      <ChoiceAnswer
        requirement={requirement}
        locale={locale}
        resolveFactLabel={resolveFactLabel}
        onAnswer={onAnswer}
      />
    );
  }
  return (
    <RollAnswer programId={programId} requirement={requirement} onAnswer={onAnswer} />
  );
}

function ReviewSession({
  program,
  execution,
  planningState,
  resolveEntityLabel,
  resolveFactLabel,
  onApply,
  onCancel,
}: Omit<CombatEffectProgramReviewProps, "open">) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [answers, setAnswers] = useState<ReadonlyArray<CombatEffectProvidedAnswer>>([]);
  const [inputFailed, setInputFailed] = useState(false);
  const review = useMemo<ReviewState>(() => {
    if (inputFailed) return { kind: "error" };
    try {
      const requirements = deriveCombatEffectRequirements(program, execution, answers);
      answers.forEach((answer, index) => {
        if (requirements[index]?.key !== answer.key) {
          throw new TypeError("Reviewed answers no longer match authored order");
        }
      });
      const requirement = requirements[answers.length];
      if (requirement) {
        if (
          (requirement.kind === "attack" ||
            requirement.kind === "save" ||
            requirement.kind === "check") &&
          requirement.context.resolution.kind === "ineligible"
        ) {
          throw new TypeError("Ineligible D20 gates cannot produce an effect artifact");
        }
        return { kind: "answering", requirement, requirements };
      }
      const artifact = createReviewedCombatEffectArtifact(program, execution, answers);
      const plan = interpretCombatEffectArtifact(artifact, planningState);
      return { kind: "ready", plan, requirements };
    } catch {
      return { kind: "error" };
    }
  }, [answers, execution, inputFailed, planningState, program]);

  let previewRows: PreviewRow[] = [];
  if (review.kind === "ready") {
    try {
      previewRows = [
        ...review.plan.consequences.flatMap((consequence) =>
          consequenceRows(consequence, t, locale, resolveEntityLabel, resolveFactLabel)
        ),
        ...(review.plan.events ?? []).map((event) =>
          eventRow(event, t, resolveEntityLabel, resolveFactLabel)
        ),
      ];
    } catch {
      return <ReviewErrorModal t={t} onCancel={onCancel} />;
    }
  }

  return (
    <ModalShell
      open
      compact
      size="md"
      onClose={onCancel}
      rubric={t("combat.effectReview.rubric")}
      title={t("combat.effectReview.title")}
      subtitle={t("combat.effectReview.subtitle")}
    >
      {review.kind === "error" ? (
        <>
          <ModalBody
            role="alert"
            aria-labelledby="effect-review-error-title"
            className="flex flex-col gap-2"
          >
            <h3
              id="effect-review-error-title"
              className="m-0 font-display text-lg text-text-primary"
            >
              {t("combat.effectReview.errorTitle")}
            </h3>
            <p className="m-0 max-w-[65ch] text-sm text-text-secondary">
              {t("combat.effectReview.errorBody")}
            </p>
          </ModalBody>
          <ModalFoot>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("common.close")}
            </Button>
          </ModalFoot>
        </>
      ) : (
        <>
          <ModalBody className="flex flex-col gap-5">
            {answers.length > 0 ? (
              <section aria-labelledby="effect-review-completed">
                <h3
                  id="effect-review-completed"
                  className="mb-2 font-display text-base text-text-primary"
                >
                  {t("combat.effectReview.reviewedInputs")}
                </h3>
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {answers.map((answer, index) => {
                    const requirement = review.requirements[index];
                    if (!requirement) {
                      throw new TypeError("Reviewed requirement is missing");
                    }
                    const title = requirementTitle(
                      requirement,
                      t,
                      locale,
                      resolveFactLabel
                    );
                    return (
                      <li
                        key={answer.key}
                        className="flex min-h-11 flex-wrap items-center gap-2 rounded-sm border border-border-subtle px-3 py-2"
                      >
                        <span className="min-w-0 flex-1">
                          <strong className="block text-sm text-text-primary">
                            {title}
                          </strong>
                          <span className="font-mono text-xs text-text-secondary">
                            {answerSummary(
                              answer,
                              requirement,
                              t,
                              locale,
                              resolveFactLabel
                            )}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("combat.effectReview.changeAnswer", {
                            label: title,
                          })}
                          onClick={() => setAnswers((current) => current.slice(0, index))}
                        >
                          {t("common.edit")}
                        </Button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ) : null}

            {review.kind === "answering" ? (
              <section
                key={review.requirement.key}
                data-testid="combat-effect-requirement"
                data-requirement-key={review.requirement.key}
                aria-labelledby="effect-review-current"
                className="flex flex-col gap-3 rounded-sm border border-border-accent bg-surface-2 p-3"
              >
                <div>
                  <h3
                    id="effect-review-current"
                    className="m-0 font-display text-lg text-text-primary"
                  >
                    {requirementTitle(review.requirement, t, locale, resolveFactLabel)}
                  </h3>
                  {review.requirement.target ? (
                    <p className="m-0 mt-1 font-mono text-xs text-text-secondary">
                      {t("combat.effectReview.forTarget", {
                        name: resolveEntityLabel({
                          kind: "target",
                          target: review.requirement.target,
                        }),
                      })}
                      {review.requirement.instance === undefined
                        ? ""
                        : ` · ${t("combat.resolveInstanceNumber", {
                            n: review.requirement.instance + 1,
                          })}`}
                    </p>
                  ) : null}
                </div>
                <RequirementAnswer
                  programId={program.id}
                  requirement={review.requirement}
                  locale={locale}
                  resolveFactLabel={resolveFactLabel}
                  onFailure={() => setInputFailed(true)}
                  onAnswer={(value) =>
                    setAnswers((current) => [
                      ...current,
                      { key: review.requirement.key, value },
                    ])
                  }
                />
              </section>
            ) : (
              <section aria-labelledby="effect-review-preview" aria-live="polite">
                <h3
                  id="effect-review-preview"
                  className="mb-2 font-display text-lg text-text-primary"
                >
                  {t("combat.effectReview.exactConsequences")}
                </h3>
                {previewRows.length === 0 ? (
                  <p className="m-0 text-sm text-text-secondary">
                    {t("combat.effectReview.noChanges")}
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-3 p-0">
                    {previewRows.map((row, index) => (
                      <li
                        key={`${row.title}:${index}`}
                        className="rounded-sm border border-border-subtle bg-surface-2 px-3 py-2"
                      >
                        <strong className="block text-sm text-text-primary">
                          {row.title}
                        </strong>
                        {row.detail ? (
                          <span className="mt-0.5 block font-mono text-xs text-text-secondary">
                            {row.detail}
                          </span>
                        ) : null}
                        {row.changes.length === 0 ? null : (
                          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-xs">
                            {row.changes.map((change) => (
                              <div key={change.label} className="contents">
                                <dt className="min-w-0 text-text-secondary">
                                  {change.label}
                                </dt>
                                <dd className="m-0 whitespace-nowrap font-mono text-text-primary">
                                  {change.before} → {change.after}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </ModalBody>
          <ModalFoot>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={review.kind !== "ready"}
              onClick={() => {
                if (review.kind === "ready") onApply(review.plan);
              }}
            >
              {t("combat.apply")}
            </Button>
          </ModalFoot>
        </>
      )}
    </ModalShell>
  );
}

function ReviewErrorModal({ t, onCancel }: { t: TFunction; onCancel: () => void }) {
  return (
    <ModalShell
      open
      compact
      size="md"
      onClose={onCancel}
      rubric={t("combat.effectReview.rubric")}
      title={t("combat.effectReview.title")}
    >
      <ModalBody
        role="alert"
        aria-labelledby="effect-review-error-title"
        className="flex flex-col gap-2"
      >
        <h3
          id="effect-review-error-title"
          className="m-0 font-display text-lg text-text-primary"
        >
          {t("combat.effectReview.errorTitle")}
        </h3>
        <p className="m-0 max-w-[65ch] text-sm text-text-secondary">
          {t("combat.effectReview.errorBody")}
        </p>
      </ModalBody>
      <ModalFoot>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t("common.close")}
        </Button>
      </ModalFoot>
    </ModalShell>
  );
}

export function CombatEffectProgramReview(props: CombatEffectProgramReviewProps) {
  if (!props.open) return null;
  return (
    <ReviewSession
      key={`${props.program.id}:${props.execution.phaseId}:${props.execution.occurrenceId}`}
      program={props.program}
      execution={props.execution}
      planningState={props.planningState}
      resolveEntityLabel={props.resolveEntityLabel}
      resolveFactLabel={props.resolveFactLabel}
      onApply={props.onApply}
      onCancel={props.onCancel}
    />
  );
}

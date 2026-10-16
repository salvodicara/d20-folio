/**
 * CharacterStatusRow — every state the character is in, ONCE, under the name in
 * the identity band (owner 2026-10-16: "no useless redundancy"; BG3 keeps the
 * statuses under the portrait). Concentration, each condition, exhaustion, lit
 * feature states (Rage, Bless on me) and lasting statuses (a fading D20 penalty)
 * render as badges through the ONE badge component (`StatusLedge`); tapping a
 * badge explains it in plain words (the glossary line), lists what it does this
 * turn, and ends or removes it. A single "+" lights a new state: a condition, a
 * feature toggle, exhaustion, a rest-time variant.
 *
 * It replaced three homes that showed the same facts: the turn meter's status
 * ledge and the right rail's Active and Status sections.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Plus, X, Skull } from "lucide-react";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useToastStore } from "@/stores/toastStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { useGlobalCombat } from "@/features/campaigns/global-combat-context";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { effectsForTarget } from "@/lib/combat-effects";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { vitalConcentration, vitalExhaustion } from "@/lib/character-vitals";
import { isBloodied } from "@/lib/smart-tracker";
import { exhaustionPenalty } from "@/lib/compute";
import { FADING_PENALTIES } from "@/lib/play/fading-penalties";
import { composeTurnLimiters } from "@/lib/views/combat-action-view";
import { activatableToggles, conditionChips } from "@/lib/views/tracker-view";
import {
  concentrationRoundsLeft,
  concentrationStatusKeys,
  deriveStatuses,
  statusRoundCounts,
} from "@/lib/status";
import { localizeSrd } from "@/i18n/resolver";
import { Icon } from "@/components/ui/icon";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { GrantBundleSelector } from "@/components/sheet/GrantBundleSelector";
import { StatusLedge } from "../center/StatusLedge";
import { useAttackRollView, useBaseAttackChips } from "../center/use-attack-roll";
import { ConditionEditor } from "./ConditionEditor";

export function CharacterStatusRow() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const readonly = useSheetReadonly();
  const globalCombat = useGlobalCombat();
  const showToast = useToastStore((s) => s.showToast);
  const spellSlotCasts = useCombatStore((s) => s.spellSlotCastsThisTurn);
  const attackRoll = useAttackRollView(useBaseAttackChips());

  const aggregate = useMemo(
    () =>
      character ? aggregateCharacterGrants(character.character, character.session) : null,
    [character]
  );
  const statuses = useMemo(
    () => (character ? deriveStatuses(character) : []),
    [character]
  );

  if (!character || !aggregate) return null;
  const { session } = character;
  const conditions = effectiveSessionConditions(session);
  const exhaustion = vitalExhaustion(session);
  const concentration = vitalConcentration(session);
  const concentrationRounds = concentration
    ? concentrationRoundsLeft(statuses)
    : undefined;
  const conditionEffects = resolveConditionEffects(conditions);
  const concBlockedReason = conditionEffects.breaksConcentration
    ? (conditions.find((id) => resolveConditionEffects([id]).breaksConcentration) ?? null)
    : null;
  const limiters = composeTurnLimiters({
    conditions,
    attackRollState: attackRoll.state,
    exhaustion,
    spellSlotCasts,
  });
  // A held spell shows ONCE (owner 2026-10-09): its concentration badge stands for
  // the state it lights on me, so that toggle is not repeated.
  const toggles = activatableToggles(
    aggregate.activatableGroups,
    locale,
    statusRoundCounts(statuses),
    // S5 — gate the Bloodied boon toggles on the SAME `isBloodied` predicate every
    // surface reads; an unmet gate hints (override-first, never hard-locks).
    isBloodied(character)
  ).filter((toggle) => !concentrationStatusKeys(concentration).includes(toggle.key));
  // REST-frequency variant bundles (re-chosen each rest per RAW) — the
  // creation-frequency ones (lineages) are owned by the Bio tab.
  const restBundles = aggregate.grantBundles.filter((b) => b.choiceFrequency === "rest");
  const sheetCombat = globalCombat?.characterId === character.id ? globalCombat : null;
  const toggleFeature = (key: string) =>
    useCharacterStore.getState().toggleActiveFeature(key);

  const toggleCondition = (id: string): void => {
    const store = useCharacterStore.getState();
    if (!conditions.includes(id)) {
      store.addCondition(id);
      return;
    }
    store.removeCondition(id);
    if (!sheetCombat) return;
    const effectIds = effectsForTarget(
      sheetCombat.encounter.effectOps,
      sheetCombat.myId
    ).flatMap((effect) =>
      effect.payload.kind === "condition" && effect.payload.conditionId === id
        ? [effect.id]
        : []
    );
    if (effectIds.length === 0) return;
    void import("@/features/campaigns/campaign-io")
      .then(async ({ revokePersistentCombatEffect }) => {
        for (const effectId of effectIds) {
          await revokePersistentCombatEffect(sheetCombat.campaignId, effectId);
        }
      })
      .catch((error: unknown) => {
        console.error("Combat condition override failed", error);
        showToast({ message: t("campaignHub.combatWriteFailed"), duration: 6000 });
      });
  };

  // A fading D20 Test penalty (Raise Dead) is lit from the same menu and shows as a
  // badge counting down each Long Rest.
  const fading = Object.entries(FADING_PENALTIES).map(([id, def]) => {
    const name = localizeSrd(def.ref.kind, def.ref.key, "name", locale);
    const amount = session.fadingPenalties?.[id];
    return {
      id,
      option: t("character.fadingPenaltyOption", { name, n: def.start }),
      ...(amount ? { chip: t("character.fadingPenaltyChip", { n: amount }) } : {}),
      hint: t("character.fadingPenaltyHint", { name }),
    };
  });
  const toggleFading = (id: string): void => {
    const store = useCharacterStore.getState();
    const running = store.character?.session.fadingPenalties?.[id] !== undefined;
    const ref = FADING_PENALTIES[id]?.ref;
    const name = ref ? localizeSrd(ref.kind, ref.key, "name", locale) : id;
    registerUndoableToast(
      {
        message: running
          ? t("combatLog.fadingPenaltyEnd", { name })
          : t("character.fadingPenaltyStartToast", {
              name,
              n: FADING_PENALTIES[id]?.start ?? 0,
            }),
      },
      () => (running ? store.endFadingPenalty(id) : store.startFadingPenalty(id)),
      { turnScoped: false }
    );
  };

  const offToggles = toggles.filter((toggle) => !toggle.active);
  const addExtra =
    offToggles.length > 0 || exhaustion <= 0 || restBundles.length > 0 ? (
      <div className="status-add-extra">
        {offToggles.length > 0 && (
          <div
            className="status-add-group"
            role="group"
            aria-label={t("character.activeFeatures")}
          >
            {offToggles.map((toggle) => (
              <button
                key={toggle.key}
                type="button"
                className="co-pick-item"
                aria-pressed={false}
                title={
                  toggle.bloodiedGateUnmet
                    ? t("character.health.bloodiedRequired")
                    : t("character.activeFeaturesHint")
                }
                onClick={() => toggleFeature(toggle.key)}
              >
                {toggle.label}
                {toggle.bloodiedGateUnmet && ` · ${t("character.health.bloodied")}`}
              </button>
            ))}
          </div>
        )}
        {exhaustion <= 0 && <ExhaustionTrack value={0} />}
        {restBundles.length > 0 && (
          <GrantBundleSelector
            bundles={restBundles}
            locale={locale}
            onSelect={(key, optionId) =>
              useCharacterStore.getState().setGrantBundleChoice(key, optionId)
            }
          />
        )}
      </div>
    ) : undefined;

  return (
    <div className="char-status-row">
      {aggregate.healingBlocked && (
        <p className="char-status-note">{t("combat.resolveHealingBlocked")}</p>
      )}
      <StatusLedge
        limiters={limiters}
        concentration={concentration || null}
        concentrationRounds={concentrationRounds}
        concBlockedConditionId={concBlockedReason}
        readonly={readonly}
        conditions={conditionChips(conditions, locale)}
        onRemoveCondition={toggleCondition}
        hiddenDc={session.hiddenDc}
        exhaustionControl={exhaustion > 0 ? <ExhaustionTrack value={exhaustion} /> : null}
        activeStates={toggles
          .filter((toggle) => toggle.active)
          .map((toggle) => ({
            key: toggle.key,
            label: toggle.label,
            roundsLeft: toggle.roundsLeft,
          }))}
        onEndActiveState={toggleFeature}
        lastingStatuses={fading.flatMap((f) =>
          f.chip ? [{ id: f.id, label: f.chip, hint: f.hint }] : []
        )}
        onEndLastingStatus={toggleFading}
        addMenu={
          <ConditionEditor
            conditions={conditions}
            hiddenDc={session.hiddenDc}
            emptyLabel={t("character.noConditions")}
            onToggle={toggleCondition}
            statuses={fading}
            onToggleStatus={toggleFading}
            showChips={false}
            addLabel={t("character.addState")}
            extra={addExtra}
          />
        }
      />
    </div>
  );
}

/** Exhaustion 6-pip stepper (amber → crimson); at 0, the one "mark level 1" entry. */
function ExhaustionTrack({ value }: { value: number }) {
  const { t } = useTranslation();
  const setExhaustion = useCharacterStore((s) => s.setExhaustion);

  // D34 — clicking a pip sets exhaustion to EXACTLY that level (raise or lower);
  // clearing is the explicit × button below. The store action is the ONE
  // exhaustion mutation seam.
  function setLevel(target: number) {
    setExhaustion(target);
  }

  // #16 — at zero the entry point is the same `.co-add` affordance the
  // conditions use; clicking it marks level 1 and the full track appears.
  if (value <= 0) {
    return (
      <button type="button" className="co-add" onClick={() => setLevel(1)}>
        <Icon as={Plus} size="xs" decorative />
        {t("character.exhaustion")}
      </button>
    );
  }
  return (
    <div className="co-ex">
      <div className="co-ex-head">
        <span className="co-ex-label">
          {/* P2 — "Exhaustion" glosses its 2024 rules on demand. */}
          <GlossaryTip term="exhaustion" rubric={t("character.exhaustion")} />
        </span>
        <span
          className="co-ex-lvl"
          style={{ ["--ex-current" as string]: `var(--ex-${value})` }}
        >
          {value}/6
        </span>
        <button
          type="button"
          className="co-ex-clear"
          aria-label={t("character.exhaustionClear")}
          title={t("character.exhaustionClear")}
          onClick={() => setLevel(0)}
        >
          <Icon as={X} size="xs" decorative />
        </button>
      </div>
      <div className="co-ex-track" role="group" aria-label={t("character.exhaustion")}>
        {Array.from({ length: 6 }).map((_, i) => {
          const lvl = i + 1;
          const on = lvl <= value;
          return (
            <button
              key={lvl}
              type="button"
              className="co-ex-pip"
              data-lvl={lvl}
              data-on={on}
              aria-pressed={on}
              aria-label={`${t("character.exhaustion")} ${lvl}`}
              title={t("character.exhaustionSet", { lvl })}
              onClick={() => setLevel(lvl)}
            >
              {lvl}
            </button>
          );
        })}
      </div>
      {value >= 6 ? (
        // RA-21 — Exhaustion 6 IS death: the SHARED "Dead" verdict.
        <div className="co-ex-eff co-ex-death">
          <Icon as={Skull} size="sm" decorative />
          <span>{t("character.deadLabel")}</span>
        </div>
      ) : (
        // 2024: −2 to every d20 Test per level, read off the ONE engine formula.
        <div className="co-ex-eff">
          {t("character.exhaustionEffect", {
            n: Math.abs(exhaustionPenalty(value)),
          })}
        </div>
      )}
    </div>
  );
}

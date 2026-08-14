/**
 * PlayTab — the cockpit's Play domain (blueprint §2.4): the live-play surface —
 * everything usable this turn (attacks + castable spells + usable features),
 * action-economy-aware — plus the combat helper (the user's combat-strategy
 * playbook, folded in as the closing section).
 *
 * This tab is the COMMIT surface: tapping an action card deducts its resource
 * immediately (a 5s undo toast appears) and fills the matching economy slot in
 * the `ThisTurnTracker` meter pinned at the top of this tab — both talk to the
 * SAME shared `useTurnEconomy()` provider, so a commit here lights the meter
 * there. The turn meter (round · initiative · economy tokens · movement · End
 * Turn · concentration banner) lives at the TOP of this tab, carrying the solo
 * End Combat, so combat is self-contained on the surface the player acts from.
 *
 * Combat model — immediate-commit-per-action-with-undo (see `combatStore` +
 * `useTurnEconomy`), under the ONE CTA grammar (`combatCtaState`, owner-ratified
 * 2026-07-11): **a CTA states usability now; the undo system owns reversal.**
 * - Tap a card → the action's resource is deducted RIGHT THEN (a spell with
 *   upcast / free-cast options opens the cast-level picker first; a variable
 *   pool prompts for the amount), the card fills its economy slot, and a 5s
 *   undo toast appears. Once the token is spent, every card that needs it
 *   DISABLES and reads "Used" (the committed occupant keeps the gold ring).
 * - Reversal is EXCLUSIVELY the session undo system (the 5s toast, the masthead
 *   Undo/Redo, ⌘Z) — no inline cancel affordance exists on any card.
 * - Reactions commit immediately too (their own section, same grammar).
 */

import { lazy, Suspense, useCallback, useState, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Layers } from "lucide-react";
import { localizeSrd } from "@/i18n/resolver";
import { CollapsibleSearch } from "@/components/shared/CollapsibleSearch";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Button } from "@/components/ui/button";
import { InfoCard } from "@/components/shared/InfoCard";
import { NumberStepper } from "@/components/ui/input";
import { weaponSealIcon, magicItemSealIcon } from "@/components/shared/item-icons";
import { getMagicItem } from "@/data/magic-items";
import { ThisTurnTracker } from "../ThisTurnTracker";
import { tempHpRollFormula } from "@/lib/combat-resolution";
import { CombatAlgorithm } from "./CombatAlgorithm";
import { SituationalRules } from "./SituationalRules";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore, type EconomySlot } from "@/stores/combatStore";
import { registerUndoableResult } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { formatModifier, localeDistance } from "@/lib/utils";
import { matchesSearch } from "@/lib/search";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { slotUsageKey } from "@/lib/cast-options";
import {
  canCastSpellWithSlots,
  resolveSpellCastOptions,
} from "@/lib/views/spell-cast-sources";
import { economyActionCategory } from "@/lib/combat-economy";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import {
  attackScopeReachesCard,
  deriveAdvantageChips,
  deriveAttackRollView,
  NO_ATTACK_ROLL,
  type AttackRollView,
  type RollState,
  type ResolvedActionSource,
} from "@/lib/views/sheet-view";
import { deriveSavesAndChecks } from "@/lib/views/saves-checks-view";
import { useToastStore } from "@/stores/toastStore";
import {
  UniversalCard,
  UniversalCardFacts,
  UniversalCardDesc,
  UniversalCardHigher,
  UniversalCardFoot,
  type UniversalCardKind,
} from "@/components/shared/UniversalCard";
import { ActionLog } from "@/features/character/molecules/ActionLog";
import {
  resolveTrackers,
  resolveCunningStrikeOptions,
  resolveReplaceAttackWithCast,
  armorDisadvantageClauses,
  isSpellcastingBlocked,
  resolveActiveStateBlocker,
  type ResolvedAction,
} from "@/lib/smart-tracker";

import { uiText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import { CunningStrikeOptions } from "@/components/shared/CunningStrikeOptions";
import {
  buildCunningStrikeOptions,
  type CunningStrikeVM,
} from "@/lib/views/cunning-strike-view";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { WeaponFacts } from "@/components/shared/WeaponFacts";
import { ActionRiders, RiderSummary } from "@/components/shared/ActionRiders";
import type { RiderVM } from "@/lib/views/rider-view";
import type { GatedSlot, ResolvedConditionEffects } from "@/lib/condition-effects";
import type { Locale } from "@/lib/locale";
// D4/D8/D9 — presentation-layer view helpers extracted to a pure lib module so
// this route file only exports a component (React Fast-Refresh) and the helpers
// stay unit-testable in isolation.
import {
  localizeActions,
  sortActions,
  attacksRemainingInAction,
  isPipAttackAction,
  maxReplaceAttackSpellLevel,
  type CombatAction,
} from "@/lib/views/combat-action-view";
import {
  actionHigherLevels,
  conditionLabel,
  localizeTrackerUnit,
} from "@/lib/views/tracker-view";
import { useTurnEconomy, getEconomySlot } from "../useTurnEconomy";
import { combatOutcomePrerequisiteMet } from "@/lib/combat-outcomes";
// Engine dual-dispatch (rollout bridge): the deterministic-runtime side of the
// actions surface. The gate transcribes on tap; the flow mounts lazily.
import { useSheetCombat } from "../turn-state";
import { useAuthStore } from "@/stores/authStore";
import { totalLevel } from "@/lib/classes";
import { getSrdFeatureSource } from "@/lib/srd-feature-lookup";
import { transcribeFeatureAction } from "@/lib/mechanics-transcription";
import { characterWeaponAttackCapability } from "@/lib/mechanics-world-store";
import type { FeatureActionContext } from "@/lib/mechanics-transcription";
import type { SrdActionDef } from "@/data/types";
import type { EngineActionDispatch } from "./EngineActionFlow";
// The verdict composers live in the sibling helpers module (the same pattern as
// spell-card-helpers) so the chip-budget guard walks the REAL composer.
import {
  combatVerdict,
  combatVerdictOutcome,
  blockedReasonFor,
  combatCtaState,
  committedOffHandId,
} from "./combat-card-helpers";

// The engine action flow joins the deterministic runtime, so it rides a lazy
// leaf mounted only when an engine-executable action is used (the exact
// pattern SpellsTab uses for EngineCastFlow).
const EngineActionFlow = lazy(() =>
  import("./EngineActionFlow").then((m) => ({ default: m.EngineActionFlow }))
);

type FilterType = "all" | "action" | "bonus" | "reaction" | "free";

/** Stable empty conditions array — keeps the `conditionEffects` memo dep stable
 *  when no character is loaded (a fresh `[]` each render would thrash the memo). */
const EMPTY_CONDITIONS: ReadonlyArray<string> = [];

/** The Rogue Sneak Attack feature's stable srdId — its once-per-turn use tracker
 *  is what a Cunning Strike option debits (golden rule 7 — a stable id). */
const SNEAK_ATTACK_ID = "rogue-sneak-attack";

/** The Cunning Strike bundle threaded to every action card (weapon attack rows
 *  render the picker; other rows ignore it) — the catalogue + the apply handler. */
interface CunningStrikeBundle {
  options: CunningStrikeVM[];
  onApply: (action: ResolvedAction, option: CunningStrikeVM) => void;
}

/** Map a resolved action's source to the UniversalCard seal kind. Spells carry
 *  a chromatic level seal instead, so the kind glyph only shows for the rest. */
function combatKind(action: ResolvedAction): UniversalCardKind {
  if (action.source === "weapon") return "weapon";
  if (action.id.startsWith("base-")) return "base";
  if (action.source === "spell") return "spell";
  return "feature";
}

/**
 * PS-J — the ONE word for a netted d20 posture. The third polarity is the point:
 * a scoped clause that CANCELS the card's verdict (Reckless Attack's Strength
 * Advantage under Prone's Disadvantage) must read as the straight roll it is,
 * never as a second contradictory claim beside the verdict.
 */
function rollStateWord(state: RollState, t: TFunction): string {
  if (state === "advantage") return t("abilities.advantage");
  if (state === "disadvantage") return t("abilities.disadvantage");
  return t("abilities.straightRoll");
}

/**
 * The quiet mono gloss sub-line (range · to-hit / save · trigger · duration ·
 * uses-left) — the secondary, decision-useful facts that don't fit the verdict.
 */
function combatGloss(
  summary: ResolvedAction["summary"],
  t: TFunction,
  locale: Locale,
  concentrating: boolean,
  attackRoll: AttackRollView = NO_ATTACK_ROLL,
  /** The card's own kind — drops a scope this card's rolls can never be in (a
   *  Sorcerer-spell clause on a weapon swing, an ability-scoped one on a spell
   *  attack). Defaults to the permissive case for the non-attack callers. */
  cardSource: ResolvedActionSource = "feature"
): string {
  const parts: string[] = [];
  if (summary.range) parts.push(summary.range);
  // Grant-derived range increase (Eldritch Spear) — annotates the printed range.
  if (summary.rangeBonusFt) {
    parts.push(
      t("combat.rangeBonus", { distance: localeDistance(summary.rangeBonusFt, locale) })
    );
  }
  if (summary.attackBonus != null) {
    parts.push(`${formatModifier(summary.attackBonus)} ${t("srd.toHit")}`);
    // Inline modifier — the engine-derived advantage / disadvantage on THIS
    // attack roll (active conditions like Frightened + grant clauses, netted RAW
    // by `netRollState`). Display of engine truth only — no roll, no RNG.
    if (attackRoll.state !== "none") parts.push(rollStateWord(attackRoll.state, t));
    // PS-J — a clause whose reach the sheet cannot resolve (per-target: the vowed
    // creature, the marked creature; per-roll: Strength attacks, Sorcerer spell
    // attacks) never becomes the verdict above: it STATES its scope, the same
    // "polarity + scope phrase" grammar the marked-target damage riders use
    // ("+1d6 Force vs marked target"). The player owns the one fact the app can't
    // know — which creature this swing is aimed at. Each line is already netted
    // against the verdict (`deriveAttackRollView`), so a scoped Advantage under a
    // blanket Disadvantage reads "Straight roll on …" and the card never asserts
    // both at once.
    for (const c of attackRoll.scoped) {
      if (!attackScopeReachesCard(c.scope, cardSource)) continue;
      parts.push(`${rollStateWord(c.state, t)} ${t(`combat.attackScope_${c.scope}`)}`);
    }
  }
  if (summary.saveDC != null && summary.saveAbility) {
    parts.push(
      `${t("stats.dc")} ${summary.saveDC} ${t(`abilities.${summary.saveAbility}_short`)}`
    );
  }
  // Expanded crit range (Champion Improved/Superior Critical) — "crit 19-20".
  if (summary.critRange) {
    parts.push(t("combat.critRange", { range: `${summary.critRange}-20` }));
  }
  // On-crit movement rider (Champion Remarkable Athlete).
  if (summary.onCritMoveFt) {
    parts.push(
      t("combat.onCritMove", {
        distance: localeDistance(summary.onCritMoveFt, locale),
      })
    );
  }
  if (summary.trigger) parts.push(summary.trigger);
  // Component waiver (Great Old One Psychic Spells) — the caster MAY drop these
  // components for this spell (e.g. cast while Silenced). V/S/M are the same
  // letters in EN + IT; only the lead word is localized.
  if (summary.componentsWaived && summary.componentsWaived.length > 0) {
    parts.push(
      t("combat.castWithout", {
        components: summary.componentsWaived.map((c) => c.toUpperCase()).join("/"),
      })
    );
  }
  // Forced-movement rider (Repelling Blast) — the on-hit shove, with the max
  // creature size it can move (decision-useful mid-combat).
  if (summary.forcedMovement) {
    const fm = summary.forcedMovement;
    parts.push(
      t(fm.direction === "push" ? "combat.forcedMovePush" : "combat.forcedMovePull", {
        distance: localeDistance(fm.distanceFt, locale),
        size: t(`srd.size_${fm.maxTargetSize.toLowerCase()}`),
      })
    );
  }
  // G24 — a spell whose damage RE-APPLIES on a self-side cadence (Moonbeam /
  // Spirit Guardians per-turn area save, Flaming Sphere bonus-action move, Call
  // Lightning re-fire) surfaces a "when it recurs" note. The stable token (golden
  // rule 7) localizes to the short cadence chip the Spells card also shows.
  if (summary.recurrence) parts.push(t(`spells.recurrence_${summary.recurrence}`));
  if (summary.recurringUse) parts.unshift(t("combat.activeSpellUse"));
  // G23 — Tactical Mind: "+1d10 to a failed check" (refunded on a fail). A
  // decision-useful gloss fact; the refund clause appends only when RAW grants it.
  if (summary.checkBonus) {
    parts.push(
      t(
        summary.checkBonus.refundOnFail ? "combat.checkBonusRefund" : "combat.checkBonus",
        { dice: summary.checkBonus.dice }
      )
    );
  }
  // G19 — Lay On Hands cure options: spend pool HP to neutralize a condition. All
  // entries share the same per-condition HP cost, so the gloss reads "cure N HP:
  // Poisoned, Frightened, …" — compact at low level (one condition), complete at
  // L14 (Restoring Touch's full set behind the accordion).
  if (summary.cureOptions && summary.cureOptions.length > 0) {
    const cost = summary.cureOptions[0]?.costHp ?? 0;
    parts.push(
      t("combat.cureConditions", {
        cost,
        conditions: summary.cureOptions
          .map((c) => conditionLabel(c.condition, locale))
          .join(", "),
      })
    );
  }
  // The effect SENTENCE belongs here (left-aligned mono gloss), not crammed into
  // the verdict chip — mirrors the p01-combat mock where Dash's "Double your
  // movement this turn" is the gloss. Only added when no structured fact (range
  // / to-hit / save / trigger) already describes the action, so we don't double
  // up — e.g. a damage spell keeps its "60 ft · CON save" gloss.
  if (summary.effect && parts.length === 0) parts.push(summary.effect);
  // Rolled action Temporary HP is additive to the action gloss; the resolver asks
  // for the roll and applies every deterministic bonus/multiplier after review.
  if (summary.tempHpRoll) {
    parts.push(t("combat.tempHpRoll", { dice: tempHpRollFormula(summary.tempHpRoll) }));
  }
  if (concentrating) parts.push(t("combat.concentration"));
  if (summary.uses) {
    const { current, total, unit } = summary.uses;
    const unitLabel = localizeTrackerUnit(unit, t);
    parts.push(`${current}/${total}${unitLabel ? ` ${unitLabel}` : ""}`);
  }
  return parts.join(" · ");
}

export function PlayTab() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const character = useCharacterStore((s) => s.character);
  const selected = useCombatStore((s) => s.selected);
  const budget = useCombatStore((s) => s.budget);
  const attackBudget = useCombatStore((s) => s.attackBudget);
  const attacksUsed = useCombatStore((s) => s.attacksUsed);
  // CTA grammar — the OCCUPANT ledgers (which card keeps the gold ring once its
  // group's token is spent): the Attack group's swung-card ids, and the id of
  // the reaction that spent the round's Reaction. Consistent with the Action /
  // Bonus slots' `selected` occupancy so all three groups mark identically.
  const attackSwings = useCombatStore((s) => s.attackSwings);
  const attackSwingIds = useMemo(
    () => attackSwings.map(({ actionId }) => actionId),
    [attackSwings]
  );
  const reactionUsed = useCombatStore((s) => s.reactionUsed);
  const reactionUsedId = useCombatStore((s) => s.reactionUsedId);
  const outcomeReceipts = useCombatStore((s) => s.outcomeReceipts);
  const round = useCombatStore((s) => s.round);
  const nextAttackAdvantage = useCombatStore((s) => s.nextAttackAdvantage);
  const movementUsedFt = useCombatStore((s) => s.movementUsedFt);
  const togglePinnedAction = useCharacterStore((s) => s.togglePinnedAction);
  // The shared turn-economy owner: commit / undo (one source of the per-slot
  // undo refs), used by BOTH these cards and the center ThisTurnTracker.
  const {
    executeAction: commitAction,
    spendRider,
    applyCunningStrike,
  } = useTurnEconomy();

  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  // Single-open accordion across the whole board (one expanded action card at a
  // time), matching the Spells / Inventory / Features tabs — opening one card
  // collapses the previously-open one. Keyed by the unique action id (pinned,
  // board, base and reaction lists never share an id).
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Engine dual-dispatch (rollout bridge): outside an encounter, an
  // engine-executable feature action or single-attack weapon row resolves
  // through the deterministic runtime; everything else keeps the legacy commit
  // loop until its own cutover wave deletes it (the SpellsTab pattern).
  const sheetCombat = useSheetCombat();
  const [engineDispatch, setEngineDispatch] = useState<EngineActionDispatch | null>(null);

  // Resolve all combat actions from SRD data (engine is locale-free; the view
  // localizes each row at the edge).
  const allActions = useMemo(
    () => (character ? localizeActions(character, locale) : []),
    [character, locale]
  );

  // RAW 2024 Two-Weapon Fighting: the off-hand bonus attack only becomes
  // available AFTER you take the Attack action with a Light weapon. Separation of
  // concerns — the engine TAGS the off-hand rows (`offhand`) and the Light main
  // attacks (`lightWeapon`); the UI ENFORCES the turn-state prerequisite here by
  // surfacing the off-hand rows only while a committed Light main-hand attack
  // exists this turn. Undo that attack and the off-hand options retract again.
  //
  // A committed Light MAIN-HAND attack surfaces through TWO ledgers depending on
  // whether the character has Extra Attack:
  //   · budget 1 — the lone attack claims the Action slot as its own
  //     `selected.action` occupant (the id IS the weapon card's).
  //   · Extra Attack (budget > 1) — the swing rides the Attack action and is
  //     recorded by weapon-card id in `attackSwingIds`; `selected.action` holds
  //     only the anonymous "attack-group" entry, so it never matches a weapon id.
  // Reading `selected.action` alone hid the off-hand for EVERY Extra-Attack
  // dual-wielder (the common case). Recognize a committed Light main attack in
  // EITHER ledger — filtered to a `lightWeapon` main-hand card, so only a
  // committed Light swing opens the gate (an uncommitted or non-Light one does not).
  const lightAttackCommitted = useMemo(() => {
    const isLightMain = (id: string) =>
      allActions.some((a) => a.id === id && a.lightWeapon);
    // B6 — a slot holds a LIST; the off-hand opens once ANY committed action is a
    // Light-weapon attack (Action-slot occupant OR Extra-Attack swing).
    return (
      selected.action.some((sel) => isLightMain(sel.id)) ||
      attackSwingIds.some(isLightMain)
    );
  }, [selected.action, attackSwingIds, allActions]);

  const visibleActions = useMemo(
    () => (lightAttackCommitted ? allActions : allActions.filter((a) => !a.offhand)),
    [allActions, lightAttackCommitted]
  );

  // RA-12 — the live skill bonus for a card's flat-DC check (the Hide action's
  // Dexterity (Stealth) vs DC 15), composed from the ONE shared skills
  // derivation (`deriveSavesAndChecks`, the same rows the Skills panel and the
  // LeftHud render) so the roll-entry and the sheet can never disagree
  // (golden rule 6). Override-aware by construction (`row.bonus`).
  const skillRows = useMemo(
    () =>
      character
        ? deriveSavesAndChecks(character.character, {
            exhaustion: character.session.exhaustion,
            activeFeatures: character.session.activeFeatures,
            conditions: effectiveSessionConditions(character.session),
            grantBundleChoices: character.session.grantBundleChoices,
          }).skills
        : [],
    [character]
  );
  const skillCheckBonusFor = useCallback(
    (skillId: string) => skillRows.find((r) => r.id === skillId)?.bonus ?? 0,
    [skillRows]
  );

  /**
   * The engine gate: decide on TAP whether this row is engine-executable. A
   * conservative allowlist — rows whose legacy commit carries semantics the
   * engine does not model yet (activation toggles, turn prerequisites, per-turn
   * caps, alternate costs, equipment costs, use-applies, riders, ammo) stay
   * legacy so the two runtimes never split a truth. Solo combat itself never
   * forces legacy: an Extra-Attack weapon swing rides the engine too, mirrored
   * onto the attack-pips ledger, while a swing that could not open (every
   * Attack action already spent) keeps the legacy path and its feedback.
   */
  const engineDispatchFor = useCallback(
    (action: ResolvedAction): EngineActionDispatch | null => {
      if (sheetCombat || !character) return null;
      if (
        action.type === "reaction" ||
        action.activatesKey !== undefined ||
        action.maintainsActiveKey !== undefined ||
        action.alternateCost !== undefined ||
        action.requiresActionThisTurn !== undefined ||
        action.requiresOutcomeThisTurn !== undefined ||
        action.requiresActionCategoryThisTurn !== undefined ||
        action.maxUsesPerTurn !== undefined ||
        (action.useEffects?.length ?? 0) > 0 ||
        action.costEquipment !== undefined ||
        action.standingEffect !== undefined ||
        action.effectProgram !== undefined
      ) {
        return null;
      }
      // A condition-blocked economy slot keeps the legacy path: its commit
      // loop owns the block and the "slot blocked" feedback (rule 6 — one
      // truth), so the engine can never spend through Incapacitated.
      const blockedSlots = resolveConditionEffects(
        effectiveSessionConditions(character.session)
      ).blockedSlots;
      const slot = getEconomySlot(action);
      if (slot !== "free" && blockedSlots.has(slot)) return null;
      const uid = useAuthStore.getState().user?.uid;
      if (uid === undefined) return null;
      if (action.source === "weapon") {
        if (
          action.offhand === true ||
          action.formAttack === true ||
          action.summary.ammo !== undefined ||
          (action.summary.extraDamage?.length ?? 0) > 0 ||
          (action.summary.dieModifiers?.length ?? 0) > 0 ||
          action.summary.onHitHeal !== undefined
        ) {
          return null;
        }
        // Extra Attack (attack-pips): the swing must be able to claim or ride
        // an Attack action right now; otherwise legacy owns the "spent" story.
        const swing = attackBudget > 1;
        if (swing) {
          const combat = useCombatStore.getState();
          const midAction = combat.attacksUsed % combat.attackBudget !== 0;
          if (!midAction && combat.selected.action.length >= combat.budget.action) {
            return null;
          }
        }
        const capability = characterWeaponAttackCapability(character, uid, action.id, {
          maxHp: character.character.hp.max,
        });
        if (!capability) return null;
        return {
          actionName: action.name,
          economyCategory: economyActionCategory(action),
          kind: "weapon",
          legacyActionId: action.id,
          nameLoc: action.nameLoc,
          swing,
        };
      }
      if (action.source !== "feature" || action.id.startsWith("custom-")) return null;
      // Recover the owning SRD feature + authored action from the stable row id
      // (`<featureId>-<actionId|type>` — the resolver's own construction).
      for (const ref of character.character.features) {
        if ("custom" in ref) continue;
        const srdFeature = getSrdFeatureSource(ref.srdId);
        const authoredActions = srdFeature?.mechanics?.actions;
        if (!srdFeature || !authoredActions) continue;
        for (const [ordinal, authored] of authoredActions.entries()) {
          const override =
            ref.actionOverrides?.find(
              (candidate) => candidate.id !== undefined && candidate.id === authored.id
            ) ?? ref.actionOverrides?.[ordinal];
          const merged = { ...authored, ...override } as SrdActionDef;
          if (`${srdFeature.id}-${merged.id ?? merged.type}` !== action.id) continue;
          // The OWNING class's level for a class feature (the B2 lesson), the
          // total level otherwise — the same scaling the resolver's dice use.
          const owningClass =
            "class" in srdFeature
              ? character.character.classes.find(
                  (entry) => entry.classId === srdFeature.class
                )
              : undefined;
          const scalingLevel = owningClass?.level ?? totalLevel(character.character);
          // The resolved attack dice/flat come from the ROW's own summary (the
          // one resolver seam), never re-derived: "2d8+3" carries the resolved
          // count and the folded additive term.
          const damageFormula = action.summary.damage ?? "";
          const parsedCount = /^(\d+)d\d+/.exec(damageFormula);
          const parsedFlat = /\+(\d+)$/.exec(damageFormula);
          const scaledDice =
            merged.attack !== undefined &&
            (merged.attack.diceCount !== undefined ||
              merged.attack.diceByLevel !== undefined);
          if (scaledDice && parsedCount === null) return null;
          const featureBonus =
            merged.attack !== undefined
              ? Number(parsedFlat?.[1] ?? 0)
              : (action.summary.healApply?.bonus ?? 0);
          const context: FeatureActionContext = {
            ...(srdFeature.mechanics?.tracker ? { trackerId: srdFeature.id } : {}),
            ...(action.costTrackerIsPool === true && action.summary.die !== undefined
              ? { poolDie: action.summary.die }
              : {}),
            scalingLevel,
            ...(merged.attack?.damageTypeFromBundle !== undefined &&
            action.summary.damageType !== undefined
              ? { attackDamageType: action.summary.damageType }
              : {}),
          };
          const transcription = transcribeFeatureAction(
            srdFeature.id,
            merged,
            ordinal,
            context
          );
          if (!transcription.program) return null;
          return {
            action: merged,
            actionName: action.name,
            context,
            derived: {
              featureBonus,
              saveDc: action.summary.saveDC ?? 8,
              ...(scaledDice && parsedCount !== null
                ? { attackDiceCount: Number(parsedCount[1]) }
                : {}),
              ...(merged.attackType !== undefined
                ? { attackBonus: action.summary.attackBonus ?? 0 }
                : {}),
            },
            economyCategory: economyActionCategory(action),
            economySlot: getEconomySlot(action),
            featureId: srdFeature.id,
            hasAttackRoll: merged.attackType !== undefined,
            kind: "feature",
            legacyActionId: action.id,
            nameLoc: action.nameLoc,
            ordinal,
            triggersAttack:
              action.summary.attackBonus != null || action.summary.saveAbility != null,
          };
        }
      }
      return null;
    },
    [attackBudget, character, sheetCombat]
  );

  /** One commit grammar for every non-reaction card: engine when executable,
   *  the legacy loop otherwise. */
  const dispatchAction = useCallback(
    (action: ResolvedAction) => {
      const dispatch = engineDispatchFor(action);
      if (dispatch) setEngineDispatch(dispatch);
      else commitAction(action);
    },
    [commitAction, engineDispatchFor]
  );

  // Inline-modifier state — the engine-derived advantage / disadvantage on the
  // character's ATTACK rolls right now, netted (RAW): grant clauses
  // (`deriveAdvantageChips` over the aggregate) merged with the active
  // conditions' self-side clauses (`resolveConditionEffects`, e.g. Frightened →
  // Disadvantage on attacks). Display of engine truth — no new modifier math.
  // One character-level value applied to every attack-roll card's gloss.
  const attackRoll = useMemo<AttackRollView>(() => {
    if (!character) return NO_ATTACK_ROLL;
    const aggregate = aggregateCharacterGrants(character.character, character.session);
    const cond = resolveConditionEffects(effectiveSessionConditions(character.session));
    // S13 — wearing armor the class lacks proficiency with imposes Disadvantage on
    // STR/DEX attacks (+ checks/saves); merged like the condition clauses so it
    // nets into the attack-roll state alongside Frightened/Poisoned/etc.
    const armorDis = armorDisadvantageClauses(character);
    const attackChips = deriveAdvantageChips(aggregate, {
      advantages: cond.advantages,
      disadvantages: [...cond.disadvantages, ...armorDis],
    })
      .filter((c) => c.rollType === "attack")
      // FRONTIER-S3 — a `round1` clause (Assassinate's first-round attack
      // advantage) applies ONLY in combat round 1, then auto-clears from round 2+.
      // A permanent clause has no `round1` flag and always applies.
      .filter((c) => !c.round1 || round === 1);
    if (nextAttackAdvantage) {
      attackChips.push({
        sourceId: "turn-next-attack-advantage",
        mode: "advantage",
        rollType: "attack",
        vs: "next-attack",
        description: { lit: { en: "Next attack", it: "Prossimo attacco" } },
      });
    }
    // PS-J — ONLY a blanket clause (no `scope`) may become the card's verdict; a
    // scoped one is netted against that verdict and stated with its scope instead
    // (`combatGloss`), because the sheet models no enemies and cannot know whether
    // it applies to this swing.
    return deriveAttackRollView(attackChips);
  }, [character, round, nextAttackAdvantage]);

  // BG3 grammar (owner ruling 2026-07-10) — Extra Attack's "attacks remaining"
  // carries NO standing text ANYWHERE: while swings remain, every attack-capable
  // CTA turns STRUCK GOLD (the app's one "lit, tap me" material) and that alone is
  // the signal; the count is discoverable on hover + for screen readers only.
  // Nothing lives on the Action coin (which spends fully on the first swing like
  // any action) and nothing on the group headers (owner order 2026-07-10). ONE
  // derivation (golden rule 6): `attacksRemainingInAction` yields the swings left
  // in the OPEN Attack action (null when there is nothing to count — no Extra
  // Attack, or no action mid-swing), feeding the card CTA state + its on-demand
  // count. `warMagicMax` gates which spell cards are attack-capable (the SAME pure
  // predicate the economy provider commits through). The guard case
  // (`attackBudget <= 1`) makes every read inert.
  const warMagicMax = useMemo(
    () =>
      character
        ? maxReplaceAttackSpellLevel(resolveReplaceAttackWithCast(character))
        : -1,
    [character]
  );
  const attacksLeft = attacksRemainingInAction(attacksUsed, attackBudget);
  const actionSlotFull = selected.action.length >= budget.action;
  const bonusSlotFull = selected.bonus.length >= budget.bonus;

  // Extra Attack — a pip-attack card is LIVE while swings remain in the open
  // Attack action: its CTA turns struck gold with NO standing label, and the
  // "N of M attacks remaining" count (returned here) surfaces only via the
  // CTA's hover title + its sr-only status. `null` = not live (no Extra Attack,
  // a non-attack card, or no action mid-swing) — the fully-swung case then
  // falls out of the ONE slot-full rule below like any other spent action.
  const attackCountFor = useCallback(
    (action: ResolvedAction): string | null => {
      if (attackBudget <= 1 || !isPipAttackAction(action, warMagicMax)) return null;
      if (attacksLeft == null) return null;
      return t("combat.attacksRemainingStatus", {
        remaining: attacksLeft,
        total: attackBudget,
      });
    },
    [attackBudget, warMagicMax, attacksLeft, t]
  );

  // RA-13 — the TWF once-per-turn off-hand cap. The Light property grants ONE
  // extra off-hand attack per turn; Nick only moves it into the (uncapped) free
  // economy, so a mixed free+bonus off-hand pair can't be capped by the slot
  // budget alone. All `offhand` rows are ONE mutually-exclusive resource: the
  // first committed (in either slot) claims the id below, and `slotFullFor`
  // marks every OTHER off-hand row spent ("Used"). Undo clears it → all restore.
  const offHandCommittedId = useMemo(
    () =>
      committedOffHandId(
        allActions,
        new Set([...selected.free, ...selected.bonus].map((s) => s.id))
      ),
    [allActions, selected.free, selected.bonus]
  );

  // CTA grammar — is the card's economy slot at budget? Feeds `combatCtaState`
  // (spent ⇒ disabled "Used" CTA, the reaction contract generalized). The free
  // slot is uncapped, so free actions never spend out — EXCEPT an off-hand row
  // once another off-hand has already spent the turn's one extra attack.
  const slotFullFor = useCallback(
    (action: ResolvedAction): boolean => {
      if (
        action.offhand &&
        offHandCommittedId != null &&
        offHandCommittedId !== action.id
      ) {
        return true;
      }
      return action.type === "action"
        ? actionSlotFull
        : action.type === "bonus"
          ? bonusSlotFull
          : false;
    },
    [actionSlotFull, bonusSlotFull, offHandCommittedId]
  );

  // CTA grammar — did THIS attack-capable card ride a swing of the (Extra-Attack)
  // Attack action this turn? Only true at `attackBudget > 1`: at budget 1 a lone
  // attack claims the Action slot through the ordinary economy and is its own
  // `selected.action` occupant. Once the Attack action is fully swung, the swung
  // card(s) keep the gold ring like any other spent group's occupant.
  const attackOccupantFor = useCallback(
    (action: ResolvedAction): boolean => attackSwingIds.includes(action.id),
    [attackSwingIds]
  );

  // D13 — clean section partition so every action lands in EXACTLY one section
  // (no double-render) and the active filter can govern each one uniformly:
  //   · Pinned       = pinned, non-reaction (a reaction can't be pinned — no pin
  //                    affordance on ReactionCard — and reactions own their own
  //                    economy/section, so we keep them out of the promoted strip).
  //   · Reactions    = ALL reaction-type actions (pinned or not, bespoke or base
  //                    like the Opportunity Attack) — their single home.
  //   · Regular/Base = unpinned, non-reaction on-turn / universal SRD actions.
  const pinnedActions = useMemo(
    () => visibleActions.filter((a) => a.pinned && a.type !== "reaction"),
    [visibleActions]
  );
  const reactionActions = useMemo(
    () => visibleActions.filter((a) => a.type === "reaction"),
    [visibleActions]
  );
  // Unpinned, non-reaction actions, split into character actions (the on-turn
  // economy board) and base SRD actions (Dash/Dodge/Grapple — bottom section).
  const unpinnedRegular = useMemo(
    () =>
      visibleActions.filter(
        (a) => !a.pinned && a.type !== "reaction" && !a.id.startsWith("base-")
      ),
    [visibleActions]
  );
  const unpinnedBase = useMemo(
    () =>
      visibleActions.filter(
        (a) => !a.pinned && a.type !== "reaction" && a.id.startsWith("base-")
      ),
    [visibleActions]
  );

  // Helpers to apply filter + search to a list
  function applyFilter(list: CombatAction[], f: FilterType, q: string) {
    let result = list;
    if (f !== "all") result = result.filter((a) => a.type === f);
    if (q.trim()) {
      // Bilingual: an IT player typing "dash" still finds "Scatto" (and v.v.).
      result = result.filter((a) => matchesSearch(q, a.name, a.nameEn));
    }
    return result;
  }

  // The active filter + search govern EVERY section uniformly (D13), incl. Pinned
  // (so it hides when nothing pinned matches the chosen type) and Reactions.
  const filteredRegular = useMemo(
    () => applyFilter(unpinnedRegular, filter, search),
    [unpinnedRegular, filter, search]
  );
  const filteredBase = useMemo(
    () => applyFilter(unpinnedBase, filter, search),
    [unpinnedBase, filter, search]
  );
  // Reactions: shown under the All + Reaction filters; search applies, type is fixed.
  const filteredReactions = useMemo(
    () => applyFilter(reactionActions, "reaction", search),
    [reactionActions, search]
  );
  // Pinned, with the active filter + search applied — the filter narrows the
  // promoted strip to the matching type and empties it when none match.
  const filteredPinned = useMemo(
    () => applyFilter(pinnedActions, filter, search),
    [pinnedActions, filter, search]
  );

  // D8 — every direct list (single-type board, Base, Reactions, Pinned) routes
  // through the SAME `sortActions` comparator the ALL-board groups use.
  const sortedRegular = useMemo(() => sortActions(filteredRegular), [filteredRegular]);
  const sortedBase = useMemo(() => sortActions(filteredBase), [filteredBase]);
  const sortedReactions = useMemo(
    () => sortActions(filteredReactions),
    [filteredReactions]
  );
  const sortedPinned = useMemo(() => sortActions(filteredPinned), [filteredPinned]);

  // ALL-filter board partition (folio_design p01-combat §.agroup): segment the
  // flat regular list into per-economy-slot groups so the board reads as
  // Actions / Bonus / Free Actions sections (scannability + progressive
  // disclosure) instead of one undifferentiated 20-row column.
  const regularGroups = useMemo(() => {
    const order: EconomySlot[] = ["action", "bonus", "free"];
    return order
      .map((slot) => {
        const raw = filteredRegular.filter((a) => {
          if (slot === "action") return a.type === "action";
          if (slot === "bonus") return a.type === "bonus";
          return a.type !== "action" && a.type !== "bonus";
        });
        // D8 — sort within each group through the ONE shared comparator:
        // weapons → cantrips → leveled spells (asc by level) → features → other.
        return { slot, actions: sortActions(raw) };
      })
      .filter((g) => g.actions.length > 0);
  }, [filteredRegular]);

  // Per-slot section titles for the segmented ALL board (free reuses the
  // economy-type label; "free" is a regular action-economy term).
  const groupTitle: Record<EconomySlot, { key: string; fallback: string }> = {
    action: { key: "combat.groupAction", fallback: "Actions" },
    bonus: { key: "combat.groupBonus", fallback: "Bonus Actions" },
    free: { key: "combat.groupFree", fallback: "Free Actions" },
  };

  // Check if an action is currently committed in its slot (B6 — a slot holds a
  // LIST under Action Surge / Haste, so test membership).
  function isSelected(action: ResolvedAction): boolean {
    const slot = getEconomySlot(action);
    return selected[slot].some((a) => a.id === action.id);
  }

  // Check if an action's resource is fully depleted (grey out the card)
  const isDepletedAction = useCallback(
    (action: ResolvedAction): boolean => {
      if (!character) return false;
      // Feature/custom with tracker: uses.current is already clamped to 0
      if (action.summary.uses != null) return action.summary.uses.current <= 0;
      // Spell costing a slot: check remaining slots of that level. A spell with
      // NO slot left is still castable when a free-cast / at-will / item-charge
      // source remains (Magic Initiate, a Wand of Magic Missiles' charges, …) —
      // so depletion is resolved from the SAME `resolveSpellCastOptions` seam
      // the cast picker uses (S9 — single source: a charged-item spell is never
      // greyed out while it has charges, even on a non-slot caster). Cantrips
      // (level 0) never deplete.
      if (action.costsSlot && action.slotLevel != null && action.spellId) {
        const opts = resolveSpellCastOptions(
          character,
          action.spellId,
          action.slotLevel,
          true,
          locale,
          {
            mastery: t("spellPrep.spellMasteryBadge"),
            signature: t("spellPrep.signatureSpellBadge"),
          }
        );
        return opts.length === 0; // depleted only when NO cast route remains
      }
      return false;
    },
    [character, locale, t]
  );

  // The tracker ids whose backing resource is fully spent — a consumable rider
  // (Psionic Strike → a Psionic Energy Die) on a depleted tracker renders
  // disabled, so the player can't spend what's gone. Read from the ONE engine
  // (`resolveTrackers`); cheap (one pass) and re-derives on a session change.
  const depletedTrackers = useMemo(() => {
    const out = new Set<string>();
    if (!character) return out;
    for (const tr of resolveTrackers(character)) {
      if (!tr.isPool && tr.used >= tr.total) out.add(tr.id);
    }
    return out;
  }, [character]);

  // S6 — the Rogue Cunning Strike catalogue (Poison/Trip/Withdraw + adders), built
  // ONCE at the board root (it is character-level, not per-card) and rendered on
  // weapon attack cards beside their riders. The legality reads the live Sneak
  // Attack use + dice budget so an unaffordable option renders disabled. Empty for
  // non-Rogues / pre-L5 Rogues → the strip never appears.
  const cunningStrikeOptions = useMemo<CunningStrikeVM[]>(() => {
    if (!character) return [];
    const { options } = resolveCunningStrikeOptions(character);
    if (options.length === 0) return [];
    const sneak = resolveTrackers(character).find((tr) => tr.id === SNEAK_ATTACK_ID);
    const sneakAttackAvailable = sneak ? sneak.total - sneak.used > 0 : false;
    // The Rogue's Sneak Attack dice budget (⌈Rogue level/2⌉) — the parsed die
    // count from the resolved tracker's scaling die ("3d6" → 3); the dice cost of
    // an option must fit this budget. Falls back to 0 when no die is resolved.
    const sneakAttackDice = sneak?.die ? parseInt(sneak.die, 10) || 0 : 0;
    return buildCunningStrikeOptions(
      options,
      { sneakAttackAvailable, sneakAttackDice },
      locale
    );
  }, [character, locale]);

  // S6 — apply a Cunning Strike option (debit the Sneak Attack use + undo). Bound
  // once here so every weapon attack card threads the SAME handler.
  const onApplyCunningStrike = useCallback(
    (action: ResolvedAction, option: CunningStrikeVM) =>
      applyCunningStrike(action, option),
    [applyCunningStrike]
  );
  // ONE bundle threaded to every card (weapon attack rows render it; others ignore
  // it) — the catalogue + the bound apply handler.
  const cunningStrike = useMemo(
    () => ({ options: cunningStrikeOptions, onApply: onApplyCunningStrike }),
    [cunningStrikeOptions, onApplyCunningStrike]
  );

  // B2 — the single self-side condition resolver read ONCE at the board root, so
  // every card knows its condition-blocked state BEFORE a tap (today the toast
  // only fires AFTER a wasted tap). Memoized on the session's conditions.
  const conditions = character
    ? effectiveSessionConditions(character.session)
    : EMPTY_CONDITIONS;
  const conditionEffects: ResolvedConditionEffects = useMemo(
    () => resolveConditionEffects(conditions),
    [conditions]
  );

  // B2 — why a card's CTA is unavailable right now, as a PERSISTENT inline reason
  // (dimmed CTA + quiet line) the player reads at a glance — never a hard lock
  // (the post-tap toast stays the backstop; the card stays tappable). Maps the
  // pure `blockedReasonFor` reason to its localized line: a condition-blocked slot
  // names the FIRST active condition that blocks it (the B1 naming pattern); the
  // depleted reason is self-naming. `null` → freely usable. A SPENT economy
  // token is NOT a reason line — spent-ness reads on the CTA itself (the
  // disabled "Used" state, the CTA grammar).
  // RA-14 — weapon-row ADVISORIES, dimmed-but-tappable (adjudicable, never a
  // hard block — override-first): an empty TRACKED quiver, and Loading's
  // one-shot-per-action cap once this weapon already fired a swing while swings
  // remain in the open Attack action (the only moment a second shot could
  // illegally happen). Untracked ammo / attackBudget 1 stay inert.
  const weaponAdvisoryFor = useCallback(
    (action: ResolvedAction): string | null => {
      if (action.source !== "weapon") return null;
      const ammo = action.summary.ammo;
      if (ammo && ammo.remaining === 0) {
        return t("combat.outOfAmmoReason", {
          item: localizeSrd("equipment", ammo.itemId, "name", locale),
        });
      }
      if (
        action.summary.loading &&
        attacksLeft != null &&
        attackSwingIds.includes(action.id)
      ) {
        return t("combat.loadingOneShotReason");
      }
      return null;
    },
    [t, locale, attacksLeft, attackSwingIds]
  );

  const blockedReasonFor_ = useCallback(
    (action: ResolvedAction, depleted: boolean): string | null => {
      const committed = Object.values(selected).flat();
      if (
        action.requiresActionThisTurn &&
        !committed.some((entry) => entry.id === action.requiresActionThisTurn)
      ) {
        return t("combat.blockedReasonPrerequisiteAction");
      }
      if (
        action.requiresOutcomeThisTurn &&
        !combatOutcomePrerequisiteMet(action.requiresOutcomeThisTurn, outcomeReceipts)
      ) {
        return t("combat.blockedReasonSuccessfulPrerequisiteAction");
      }
      if (
        action.requiresActionCategoryThisTurn &&
        !committed.some(
          (entry) => entry.economyCategory === action.requiresActionCategoryThisTurn
        )
      ) {
        return t("combat.blockedReasonPrerequisiteCategory");
      }
      if (
        action.maxUsesPerTurn !== undefined &&
        committed.filter((entry) => entry.id === action.id).length >=
          action.maxUsesPerTurn
      ) {
        return t("combat.blockedReasonPerTurnLimit");
      }
      if (action.locksMovement && movementUsedFt > 0) {
        return t("combat.blockedReasonAlreadyMoved");
      }
      if (character) {
        if (action.source === "spell" && isSpellcastingBlocked(character)) {
          return t("combat.blockedReasonSpellcasting");
        }
        switch (resolveActiveStateBlocker(character, action)) {
          case "heavy-armor":
            return t("combat.blockedReasonHeavyArmor");
          case "incapacitated":
            return t("combat.blockedReasonIncapacitated");
        }
      }
      // The card's TRUE economy kind is `action.type` (action/bonus/reaction/free)
      // — `getEconomySlot` folds reactions into "free", so it can't be used for
      // the condition gate. A "free" action is never condition-blocked or spent.
      if (action.type === "free") {
        return depleted ? t("combat.blockedReasonNoUses") : weaponAdvisoryFor(action);
      }
      const slot: GatedSlot = action.type;
      const reason = blockedReasonFor({
        slot,
        blockedSlots: conditionEffects.blockedSlots,
        depleted,
      });
      // RA-14 — with no harder reason, a weapon row may still carry an
      // ammunition/Loading advisory line.
      if (!reason) return weaponAdvisoryFor(action);
      switch (reason.kind) {
        case "depleted":
          return t("combat.blockedReasonNoUses");
        case "condition": {
          // Name the first active condition forbidding this slot (B1 pattern).
          const culprit = conditions.find((id) =>
            resolveConditionEffects([id]).blockedSlots.has(reason.slot)
          );
          return culprit ? conditionLabel(culprit, locale) : null;
        }
      }
    },
    [
      character,
      conditionEffects,
      conditions,
      t,
      locale,
      weaponAdvisoryFor,
      movementUsedFt,
      selected,
      outcomeReceipts,
    ]
  );

  // Chromatic slot pips beside the CTA for a slot-costing spell: { level, total,
  // used } drives the UniversalCard's diamond pips (coloured via the --sl-* token
  // — no hex). Omitted (undefined) for non-slot actions so no pips render.
  const slotPipsFor = useCallback(
    (
      action: ResolvedAction
    ): { level: number; total: number; used: number } | undefined => {
      if (
        !character ||
        !action.costsSlot ||
        action.slotLevel == null ||
        !action.spellId ||
        !canCastSpellWithSlots(character, action.spellId)
      )
        return undefined;
      const slotData = character.character.spellSlots.find(
        (s) => s.level === action.slotLevel
      );
      if (!slotData) return undefined;
      const used = character.session.spellSlots[slotUsageKey(slotData)]?.used ?? 0;
      return { level: action.slotLevel, total: slotData.total, used };
    },
    [character]
  );

  // D9 — "At Higher Levels" upcast copy resolver (closure over the active locale),
  // threaded into the cards as a prop the SAME way `slotPipsFor` / `isDepletedAction`
  // are, so the card components stay locale-free (the only locale read for this seam
  // lives here, at the tab root — golden rules 5/6).
  const higherLevelsFor = useCallback(
    (action: ResolvedAction): string | null => actionHigherLevels(action, locale),
    [locale]
  );

  // The OFF-LIST reaction (owner verdict 2026-06-11) — a synthetic, cost-free
  // reaction "action" backing the Mark-used row, so a verbally-resolved reaction
  // (opportunity attack, readied action) commits through the SAME
  // `handleUseReaction` engine path as every listed reaction: condition gates,
  // the action log, the 5s undo toast, and the meter's dimming disc all behave
  // identically. View-layer data only — it consumes no resource and models no
  // SRD mechanic.
  const offListReaction = useMemo<ResolvedAction>(() => {
    // This off-list reaction is a view-synthesized row whose label is a CHROME key
    // (not SRD content, not user text). Its `nameLoc` is a `ui` REF to the ONE
    // `ui/combat.json` key — never a frozen both-locale string (golden rule 7).
    // The combat LOG stores this ref, so the logged row re-localizes on a language
    // switch like every other; `nameEn` (the search FACT) and the active `name`
    // both DERIVE from it (no cross-locale i18n fetch in the feature — the EN
    // canonical resolves through the presenter, which always has EN `common` loaded).
    const otherReactionLoc = uiText("combat.otherReactionName");
    return {
      id: "manual-reaction",
      name: t("combat.otherReactionName"),
      nameEn: localizeText(otherReactionLoc, "en"),
      nameLoc: otherReactionLoc,
      type: "reaction",
      source: "feature",
      spellLevel: null,
      concentration: false,
      summary: {},
      costsSlot: false,
      pinned: false,
      defaultPinned: false,
    };
  }, [t]);

  if (!character) return null;

  // Reactions render under the All + Reaction filters only. `viewEmpty` lets ONE
  // honest empty state replace the old per-section "no actions" copies (D13).
  // The reaction-filtered view always carries the off-list "Mark used" row, so
  // it is never empty.
  const reactionsVisible = filter === "all" || filter === "reaction";
  const viewEmpty =
    filter !== "reaction" &&
    sortedPinned.length === 0 &&
    filteredRegular.length === 0 &&
    filteredBase.length === 0 &&
    (!reactionsVisible || sortedReactions.length === 0);

  return (
    <div>
      {/* Combat command group — the top of the Play scroll surface. The carved,
          gold-accented `.turn` meter (round · initiative · economy tokens ·
          movement · End Turn · concentration banner) IS the deliberate folio
          element here: it carries its own embossed frame, so it needs no
          competing wrapper background/border/shadow around it (a flat backing
          rectangle would read as a cheap double-frame). Extra Attack is no longer a
          static "Attacks ×N" / War-Magic badge row above it — nor a segmented ring
          on the coin (BG3 grammar, owner ruling 2026-07-10): the Action coin spends
          fully on the first swing like any action, and the attack cards' CTAs turn
          struck gold (no standing label) while swings remain — the count
          discoverable on hover + for screen readers. It scrolls naturally with the
          action cards (NOT sticky): the in-progress turn is owned by the persistent
          `useTurnEconomy` provider, so it survives leaving Play without needing to
          pin the meter to the viewport. The meter reads/dispatches the SAME shared
          combatStore + useTurnEconomy as the cards below: a card commit lights this
          meter; End Turn clears the turn. */}
      <div className="mb-4">
        {/* Item e — the meter's economy tokens double as board filters, wired to the
            SAME `filter` state the fchips drive (one source of truth): tapping an OPEN
            token narrows the board to that type, tapping the active one clears to "all"
            (a SPENT token re-arms its slot instead). Solo, the meter also carries the
            "End Combat" control beside End Turn (owner-ratified 2026-07-03). */}
        <ThisTurnTracker
          activeFilter={filter}
          onFilterByType={(type) => setFilter((f) => (f === type ? "all" : type))}
          attackRollState={attackRoll.state}
        />
        {/* NO separate encounter Prev/Next controls here (removed 2026-08-02): in an
            encounter the meter's gilded End Turn IS the shared advance (`turn-state`'s
            `endTurn` → the SAME `advanceEncounterTurn` transaction), so a duplicate
            "Next turn" was a second path that skipped the local end-of-turn
            finalization, and "Previous turn" is the DM's correction tool (it lives in
            the hub's EncounterTurnControls — golden rule 6, one control per job). */}
      </div>

      {/* Filter bar — folio .filters/.fchip system (4px lapidary facet radius,
          tonal aria-pressed state, carved search input) — same recipe as Spells.
          Only shows types that have at least 1 action. */}
      <div className="filters">
        <div className="fchip-group" role="group" aria-label={t("combat.filterByType")}>
          {(["all", "action", "bonus", "reaction", "free"] as FilterType[])
            // Availability + count span the VISIBLE actions (so a hidden off-hand
            // doesn't inflate a chip's count) — a type chip stays reachable when its
            // only member is pinned, and the count reflects what the filter surfaces.
            .filter((f) => f === "all" || visibleActions.some((a) => a.type === f))
            .map((f) => {
              const filterLabels: Record<FilterType, string> = {
                all: t("common.all"),
                action: t("combat.action"),
                bonus: t("combat.bonus"),
                reaction: t("combat.reaction"),
                free: t("combat.free"),
              };
              const count =
                f === "all"
                  ? visibleActions.length
                  : visibleActions.filter((a) => a.type === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  className="fchip"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {filterLabels[f]}
                  <span className="fc-count" aria-hidden>
                    {count}
                  </span>
                </button>
              );
            })}
        </div>
        {/* D19/D49 — the combat search is the SAME collapsible lens→field as every
            other tab (one shared component), with its own contextual hint. It
            right-aligns in the filter row (margin-left:auto via `.filters .csearch`)
            and drops to the lens at rest so the chips own the row. */}
        <CollapsibleSearch
          value={search}
          onChange={setSearch}
          placeholder={t("combat.searchActions")}
        />
      </div>

      {/* ── Pinned ──────────────────────────────────────────────────
          Promoted across types; honors the active filter + search (D13) — hidden
          when nothing pinned matches the chosen type, and narrowed to that type
          when one is active (e.g. Bonus → only pinned bonus actions). */}
      {sortedPinned.length > 0 && (
        <div className="agroup">
          <SectionHeader tight title={t("common.pinned")} />
          <div className="uc-stack">
            {sortedPinned.map((action) => (
              <CombatActionCard
                key={action.id}
                action={action}
                pinned
                selected={isSelected(action)}
                depleted={isDepletedAction(action)}
                blockedReason={blockedReasonFor_(action, isDepletedAction(action))}
                slotFull={slotFullFor(action)}
                attackCount={attackCountFor(action)}
                attackOccupant={attackOccupantFor(action)}
                slotData={slotPipsFor(action)}
                attackRoll={attackRoll}
                higherLevelsFor={higherLevelsFor}
                onSpendRider={spendRider}
                depletedTrackers={depletedTrackers}
                cunningStrike={cunningStrike}
                skillCheckBonusFor={skillCheckBonusFor}
                open={expandedId === action.id}
                onOpenChange={(o) => setExpandedId(o ? action.id : null)}
                onCommit={() => dispatchAction(action)}
                onPin={() => togglePinnedAction(action.id, action.defaultPinned)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── On-turn economy board ────────────────────────────────────
          ALL filter → segment into per-slot .agroup sections (Actions / Bonus /
          Free), each a pure rubric (diamond + title + rule — the turn-meter
          COINS alone carry availability; a header availability label duplicated
          them, owner order 2026-07-10). A specific type filter → the SAME
          ActionGroup for that one slot, so the header ALWAYS names the active
          filter (D13 — no more a generic "All Actions" over a bonus-only list).
          Reactions + base render in their own sections below. */}
      {filter === "all"
        ? regularGroups.map((group) => (
            <ActionGroup
              key={group.slot}
              slot={group.slot}
              title={t(groupTitle[group.slot].key, groupTitle[group.slot].fallback)}
              actions={group.actions}
              isSelected={isSelected}
              isDepletedAction={isDepletedAction}
              blockedReasonFor={blockedReasonFor_}
              slotFullFor={slotFullFor}
              attackCountFor={attackCountFor}
              attackOccupantFor={attackOccupantFor}
              slotPipsFor={slotPipsFor}
              attackRoll={attackRoll}
              higherLevelsFor={higherLevelsFor}
              onSpendRider={spendRider}
              depletedTrackers={depletedTrackers}
              cunningStrike={cunningStrike}
              expandedId={expandedId}
              onExpand={setExpandedId}
              onCommit={dispatchAction}
              onPin={(action) => togglePinnedAction(action.id, action.defaultPinned)}
            />
          ))
        : filter !== "reaction" &&
          sortedRegular.length > 0 && (
            <ActionGroup
              slot={filter}
              title={t(groupTitle[filter].key, groupTitle[filter].fallback)}
              actions={sortedRegular}
              isSelected={isSelected}
              isDepletedAction={isDepletedAction}
              blockedReasonFor={blockedReasonFor_}
              slotFullFor={slotFullFor}
              attackCountFor={attackCountFor}
              attackOccupantFor={attackOccupantFor}
              slotPipsFor={slotPipsFor}
              attackRoll={attackRoll}
              higherLevelsFor={higherLevelsFor}
              onSpendRider={spendRider}
              depletedTrackers={depletedTrackers}
              cunningStrike={cunningStrike}
              expandedId={expandedId}
              onExpand={setExpandedId}
              onCommit={dispatchAction}
              onPin={(action) => togglePinnedAction(action.id, action.defaultPinned)}
            />
          )}

      {/* ── Reactions ────────────────────────────────────────────────
          Shown under the All + Reaction filters; their own header + off-turn
          economy (ReactionCard). Hidden when none match the search (D13) —
          except under the Reaction filter, where the section always renders to
          carry the off-list "Mark used" row (the meter's reaction token is a
          pure filter; spending lives HERE, owner verdict 2026-06-11). */}
      {reactionsVisible && (sortedReactions.length > 0 || filter === "reaction") && (
        <>
          {/* Pure rubric — the turn-meter Reaction coin alone carries
              availability (a header chip duplicated it, owner order
              2026-07-10); the spent state also reads on every card's CTA. */}
          <SectionHeader tight data-econ="reaction" title={t("combat.reactions")} />
          <p className="mb-2 px-1 text-[0.7rem] italic text-text-secondary">
            {t("combat.reactionsNote")}
          </p>
          <div className="uc-stack">
            {sortedReactions.map((action) => (
              <ReactionCard
                key={action.id}
                action={action}
                disabled={reactionUsed}
                committed={reactionUsedId === action.id}
                blockedReason={blockedReasonFor_(action, false)}
                slotData={slotPipsFor(action)}
                attackRoll={attackRoll}
                higherLevelsFor={higherLevelsFor}
                open={expandedId === action.id}
                onOpenChange={(o) => setExpandedId(o ? action.id : null)}
                onUse={() => commitAction(action)}
              />
            ))}
            {/* Off-list reaction bookkeeping — ONE clear "Mark used" row for a
                reaction resolved verbally at the table (an opportunity attack,
                a readied action). Commits through the SAME handleUseReaction
                engine path as every reaction card (immediate-commit + the 5s
                undo toast), so the meter's reaction disc dims identically. */}
            {filter === "reaction" && (
              <OffListReactionRow
                disabled={reactionUsed}
                committed={reactionUsedId === offListReaction.id}
                onUse={() => commitAction(offListReaction)}
              />
            )}
          </div>
        </>
      )}

      {/* ── Base Actions — universal SRD actions, under any non-reaction filter ── */}
      {filter !== "reaction" && filteredBase.length > 0 && (
        <>
          <SectionHeader tight data-econ="action" title={t("combat.baseActions")} />
          <div className="uc-stack">
            {sortedBase.map((action) => (
              <CombatActionCard
                key={action.id}
                action={action}
                selected={isSelected(action)}
                depleted={isDepletedAction(action)}
                blockedReason={blockedReasonFor_(action, isDepletedAction(action))}
                slotFull={slotFullFor(action)}
                attackCount={attackCountFor(action)}
                attackOccupant={attackOccupantFor(action)}
                slotData={slotPipsFor(action)}
                attackRoll={attackRoll}
                higherLevelsFor={higherLevelsFor}
                onSpendRider={spendRider}
                depletedTrackers={depletedTrackers}
                cunningStrike={cunningStrike}
                skillCheckBonusFor={skillCheckBonusFor}
                open={expandedId === action.id}
                onOpenChange={(o) => setExpandedId(o ? action.id : null)}
                onCommit={() => dispatchAction(action)}
                onPin={() => togglePinnedAction(action.id, action.defaultPinned)}
              />
            ))}
          </div>
        </>
      )}

      {/* Engine dual-dispatch (rollout bridge): the lazy engine flow for an
          engine-executable feature action or weapon attack. */}
      {engineDispatch !== null && (
        <Suspense fallback={null}>
          <EngineActionFlow
            dispatch={engineDispatch}
            onClose={() => setEngineDispatch(null)}
          />
        </Suspense>
      )}

      {/* ── Empty state — one honest message when the filter surfaces nothing ── */}
      {viewEmpty && (
        <InfoCard className="p-4 text-center text-sm text-text-secondary">
          {t("combat.noActions")}
        </InfoCard>
      )}

      {/* Action Log (low priority, below cards) */}
      <div className="mt-6">
        <ActionLog maxEntries={30} />
      </div>

      {/* Combat helper — the user's combat-strategy playbook (blueprint §2.4
          "the combat helper"), folded in from the standalone Algorithm page. */}
      <CombatAlgorithm />

      {/* Rules Reference — the SRD situational-combat + travel facts a player
          looks up at the table (Cover · Mounted · Underwater · Travel Pace). */}
      <SituationalRules />
    </div>
  );
}

/** Slot pips passed to the combat CTA (chromatic, --sl-* driven). */
type SlotPips = { level: number; total: number; used: number };

/** The accordion detail facts grid for a combat action — shared by both the
 *  action and reaction cards. Honest blanks (UniversalCardFacts drops empties). */
function combatFacts(
  summary: ResolvedAction["summary"],
  t: TFunction,
  locale: Locale
): { label: ReactNode; value: string }[] {
  return [
    summary.range
      ? {
          label: t("spells.range"),
          value: summary.rangeBonusFt
            ? `${summary.range} (${t("combat.rangeBonus", { distance: localeDistance(summary.rangeBonusFt, locale) })})`
            : summary.range,
        }
      : null,
    summary.attackBonus != null
      ? {
          // P2 — same attack-roll gloss as the inventory WeaponCard (uniform).
          label: <GlossaryTip term="attackRoll" rubric={t("srd.toHit")} />,
          value: formatModifier(summary.attackBonus),
        }
      : null,
    summary.saveDC != null && summary.saveAbility
      ? {
          label: t("spells.save"),
          value: `${t(`abilities.${summary.saveAbility}_short`)} · ${t("stats.dc")} ${summary.saveDC}`,
        }
      : null,
    summary.damage && summary.damageType
      ? {
          // Non-weapon damage rows (spells / feature actions) carry no per-source
          // weapon breakdown — weapon rows render through the shared `WeaponFacts`
          // component, which attaches the `BreakdownTip` to its own damage
          // label from `weaponFacts.breakdown` (issue #27 dogfood: "+3 STR · +2
          // Rage…"). This branch stays a plain label.
          label: t("combat.damage"),
          value: [
            `${summary.damage} ${t(`srd.damage_${summary.damageType}`)}`,
            summary.oneRollDamageBonus
              ? t("combat.resolveOneRollBonus", {
                  bonus: summary.oneRollDamageBonus,
                })
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    summary.healing ? { label: t("combat.heal"), value: summary.healing } : null,
    summary.forcedMovement
      ? {
          label: t("combat.forcedMoveLabel"),
          value: t(
            summary.forcedMovement.direction === "push"
              ? "combat.forcedMovePush"
              : "combat.forcedMovePull",
            {
              distance: localeDistance(summary.forcedMovement.distanceFt, locale),
              size: t(`srd.size_${summary.forcedMovement.maxTargetSize.toLowerCase()}`),
            }
          ),
        }
      : null,
    summary.duration ? { label: t("spells.duration"), value: summary.duration } : null,
    summary.trigger ? { label: t("combat.reaction"), value: summary.trigger } : null,
    // G23 — Tactical Mind's "+1d10 to a failed check" as a labeled accordion fact.
    summary.checkBonus
      ? {
          label: t("combat.checkBonusLabel"),
          value: t(
            summary.checkBonus.refundOnFail
              ? "combat.checkBonusRefund"
              : "combat.checkBonus",
            { dice: summary.checkBonus.dice }
          ),
        }
      : null,
    // G19 — Lay On Hands cure options as a labeled accordion fact (the full
    // Restoring-Touch set lives here at L14; the gloss carries the same line).
    summary.cureOptions && summary.cureOptions.length > 0
      ? {
          label: t("combat.cureConditionsLabel"),
          value: t("combat.cureConditions", {
            cost: summary.cureOptions[0]?.costHp ?? 0,
            conditions: summary.cureOptions
              .map((c) => conditionLabel(c.condition, locale))
              .join(", "),
          }),
        }
      : null,
    // Rolled Temporary HP as a labeled accordion fact (the gloss carries it too).
    summary.tempHpRoll
      ? {
          label: t("combat.tempHpRollLabel"),
          value: t("combat.tempHpRoll", {
            dice: tempHpRollFormula(summary.tempHpRoll),
          }),
        }
      : null,
  ].filter((f): f is { label: string; value: string } => f != null);
}

/**
 * Action-type group section for the ALL-filter board — the folio `.agroup`
 * (folio_design p01-combat): an action-type-accented header (`data-slot` → the
 * verdigris / lapis / muted accent via app.css) over the card stack — a pure
 * rubric, no availability text (the turn-meter coins alone carry that state;
 * owner order 2026-07-10). Segmenting the flat board into Actions / Bonus /
 * Free sections restores scannability + progressive disclosure on the page
 * that matters most in live play. The per-row callbacks/derivations arrive as
 * props so the card map stays a single render level (React-Compiler clean).
 */
function ActionGroup({
  slot,
  title,
  actions,
  isSelected,
  isDepletedAction,
  blockedReasonFor,
  slotFullFor,
  attackCountFor,
  attackOccupantFor,
  slotPipsFor,
  attackRoll,
  higherLevelsFor,
  onSpendRider,
  depletedTrackers,
  cunningStrike,
  expandedId,
  onExpand,
  onCommit,
  onPin,
}: {
  slot: EconomySlot;
  title: string;
  actions: CombatAction[];
  isSelected: (action: ResolvedAction) => boolean;
  isDepletedAction: (action: ResolvedAction) => boolean;
  blockedReasonFor: (action: ResolvedAction, depleted: boolean) => string | null;
  slotFullFor: (action: ResolvedAction) => boolean;
  attackCountFor: (action: ResolvedAction) => string | null;
  attackOccupantFor: (action: ResolvedAction) => boolean;
  slotPipsFor: (action: ResolvedAction) => SlotPips | undefined;
  attackRoll: AttackRollView;
  higherLevelsFor: (action: ResolvedAction) => string | null;
  onSpendRider: (action: ResolvedAction, rider: RiderVM) => void;
  depletedTrackers: ReadonlySet<string>;
  cunningStrike: CunningStrikeBundle;
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onCommit: (action: ResolvedAction) => void;
  onPin: (action: ResolvedAction) => void;
}) {
  return (
    <section className="agroup" data-slot={slot}>
      <div className="ag-head">
        <span className="ag-diamond" aria-hidden />
        <h3 className="ag-title">{title}</h3>
        <span className="ag-rule" aria-hidden />
      </div>
      <div className="uc-stack">
        {actions.map((action) => (
          <CombatActionCard
            key={action.id}
            action={action}
            selected={isSelected(action)}
            depleted={isDepletedAction(action)}
            blockedReason={blockedReasonFor(action, isDepletedAction(action))}
            slotFull={slotFullFor(action)}
            attackCount={attackCountFor(action)}
            attackOccupant={attackOccupantFor(action)}
            slotData={slotPipsFor(action)}
            attackRoll={attackRoll}
            higherLevelsFor={higherLevelsFor}
            onSpendRider={onSpendRider}
            depletedTrackers={depletedTrackers}
            cunningStrike={cunningStrike}
            open={expandedId === action.id}
            onOpenChange={(o) => onExpand(o ? action.id : null)}
            onCommit={() => onCommit(action)}
            onPin={() => onPin(action)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Combat action card — the folio UniversalCard in `combat-CTA` mode. The CTA verb
 * is Cast (spell) / Attack (weapon) / Use (feature/base); the CTA states
 * usability under the ONE grammar (`combatCtaState`): a spent economy token
 * disables it to "Used" (the committed occupant keeps the recessed treatment +
 * the card's gold ring), reversal lives on the undo system. The 3px left
 * border carries the action-type colour (data-slot → --at-c, no hex); spell rows
 * carry a chromatic level seal + slot pips. Whole row toggles the accordion when
 * a description exists (progressive disclosure).
 */
function CombatActionCard({
  action,
  pinned,
  selected,
  depleted,
  blockedReason,
  slotFull,
  attackCount,
  attackOccupant,
  slotData,
  attackRoll,
  higherLevelsFor,
  onSpendRider,
  depletedTrackers,
  cunningStrike,
  skillCheckBonusFor,
  open,
  onOpenChange,
  onCommit,
  onPin,
}: {
  action: CombatAction;
  pinned?: boolean;
  selected: boolean;
  depleted: boolean;
  /** Localized "why you can't use this" line (B2) — null when freely usable. */
  blockedReason: string | null;
  /** CTA grammar — the card's economy slot is at budget (spent ⇒ disabled "Used"). */
  slotFull: boolean;
  /** BG3 grammar — the "N of M attacks remaining" count while this pip-attack
   *  card is LIVE (struck-gold CTA; count on hover + sr-only). Null = not live. */
  attackCount: string | null;
  /** CTA grammar — this attack card rode a swing of the (Extra-Attack) Attack
   *  action this turn, so once that action is fully swung (spent) it keeps the
   *  gold ring as the group's occupant (see `attackSwingIds`). */
  attackOccupant: boolean;
  slotData?: SlotPips;
  attackRoll: AttackRollView;
  higherLevelsFor: (action: ResolvedAction) => string | null;
  /** Spend a consumable on-hit rider on this card (debit + undo toast). */
  onSpendRider: (action: ResolvedAction, rider: RiderVM) => void;
  /** Tracker ids whose backing resource is depleted (disables those tokens). */
  depletedTrackers: ReadonlySet<string>;
  /** S6 — the Cunning Strike catalogue + apply handler (weapon attack rows only). */
  cunningStrike: CunningStrikeBundle;
  /** RA-12 — live skill bonus for a flat-DC check roll-entry (the Hide card's
   *  Stealth), from the ONE shared skills derivation. Optional: cards rendered
   *  through groups that never carry `summary.skillCheck` omit it. */
  skillCheckBonusFor?: (skillId: string) => number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommit: () => void;
  onPin: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const kind = combatKind(action);

  // S9 — the item→multi-spell-pool cast card: it CASTS a
  // spell from the item's shared charge pool, so it reads with the spell "Cast"
  // vocabulary (verb + descriptive aria) and its OWN magic-item-type seal glyph
  // (Wand of Binding → wand, Ring of Animal Influence → ring, Staff of Charming →
  // staff) instead of the generic class-feature Gem — the "cast a spell FROM this
  // item" intent made legible without a new card type (golden rule 3). Catalogue
  // identity is explicit; the runtime action id may contain an instance UUID.
  const itemPoolItem = action.castPoolItemId
    ? getMagicItem(action.castPoolItemId)
    : undefined;
  const isItemPoolCast = action.castPoolItemId !== undefined;
  const itemPoolSeal = itemPoolItem ? magicItemSealIcon(itemPoolItem.type) : undefined;

  // Item g — two-hand wield stance for a Versatile weapon. The engine surfaces
  // `versatileDamage` (the two-handed formula, same versatile die the inventory
  // WeaponCard parses); the card lets the player toggle the stance, swapping the
  // damage the verdict + facts show. Display-only (no resource/economy effect).
  const [twoHanded, setTwoHanded] = useState(false);
  const versatileDamage = action.summary.versatileDamage;
  const effectiveSummary =
    versatileDamage && twoHanded
      ? { ...action.summary, damage: versatileDamage }
      : action.summary;

  const verdict = combatVerdict({ ...action, summary: effectiveSummary }, t);
  const verdictOutcome = combatVerdictOutcome(effectiveSummary);
  const gloss = combatGloss(
    effectiveSummary,
    t,
    locale,
    action.concentration,
    attackRoll,
    action.source
  );
  const facts = combatFacts(effectiveSummary, t, locale);

  // D9 — "At Higher Levels" upcast text via the tracker presenter (mirrors the
  // Spells page); null for cantrips, weapons, and features.
  const higherLevels = higherLevelsFor(action);

  // #87 rider-render — the ALWAYS-VISIBLE collapsed-face on-hit rider summary.
  // The SAME riders the expanded strip renders (weapon rows carry them on
  // `weaponFacts.riders`, non-weapon rows on `riders`), condensed into ONE bounded
  // pill beside the base-damage verdict (the worst-case readability gate). DRY —
  // it reads the engine's rider list, never a second renderer.
  const collapsedRiders = action.weaponFacts?.riders ?? action.riders ?? [];

  // The ONE CTA grammar (`combatCtaState`): spent ⇒ disabled "Used" (the
  // reaction contract generalized — the committed occupant keeps the recessed
  // treatment + the card's gold ring); a LIVE pip-attack card stays enabled +
  // struck gold while swings remain (the count is hover/sr-only); a depleted
  // pool hard-disables with its reason line; a condition-blocked card dims but
  // stays tappable (override-first). Reversal is the undo system's alone.
  const cta = combatCtaState({
    committed: selected,
    slotFull,
    attackLive: attackCount != null,
    depleted,
    conditionBlocked: blockedReason != null && !depleted,
  });
  // The group's OCCUPANT for the gold ring + recessed chip: a committed
  // Action/Bonus card (its own `selected.action/bonus` entry) OR — under Extra
  // Attack, where swings ride a synthetic Attack-group entry, not this card's id
  // — an attack card that rode a swing once the Attack action is fully SPENT.
  // Mid-swings the card wears the struck-gold emphasis instead of the ring
  // (`cta.spent` is false while `attackLive`), so exactly one signal shows at a time.
  const occupant = selected || (cta.spent && attackOccupant);
  // CTA verb by source — the explicit commit affordance (the flagship gesture).
  // An item-pool cast casts a spell (from the item's charges), so it takes the
  // spell "Cast" verb + a descriptive aria ("Cast a spell from <item>") — the
  // bare "Use: <item>" read as "use the wand", not "cast a spell from it".
  const ctaVerb = cta.spent
    ? t("combat.used")
    : action.source === "spell" || isItemPoolCast
      ? t("combat.cast")
      : action.source === "weapon"
        ? t("combat.attack")
        : t("common.use");
  const baseAriaLabel =
    isItemPoolCast && !cta.spent
      ? t("combat.itemPoolCastCta", { item: action.name })
      : `${ctaVerb}: ${action.name}`;
  const ctaAriaLabel =
    cta.emphasis && attackCount ? `${baseAriaLabel} — ${attackCount}` : baseAriaLabel;
  const pinLabel = pinned ? t("combat.unpin") : t("combat.pinToTop");

  // RA-12 — apply an entered Hide check d20 (SRD "Hide [Action]": DC 15
  // Dexterity (Stealth); success = the Invisible condition, your total = the DC
  // to find you). The player rolls the d20 IN REAL LIFE and enters the face
  // (golden rule 21); the app folds the live Stealth bonus, judges the DC, and
  // applies the consequence in one undoable unit (`applyHiddenState`). A failed
  // check changes nothing — a plain notice, no undo entry. Override-first: the
  // Invisible chip stays hand-editable on the rail like any condition.
  function applyHideCheck(face: number) {
    const sc = effectiveSummary.skillCheck;
    if (!sc) return;
    const total = face + (skillCheckBonusFor?.(sc.skill) ?? 0);
    if (total < sc.dc) {
      useToastStore.getState().showToast({
        message: t("combat.hideFailToast", { total, dc: sc.dc }),
        duration: 4000,
      });
      return;
    }
    const undo = useCharacterStore.getState().applyHiddenState(total);
    if (!undo) return;
    registerUndoableResult(
      { message: t("combat.hideSuccessToast", { total }) },
      undo,
      () => applyHideCheck(face)
    );
  }

  return (
    <UniversalCard
      mode="combat-CTA"
      kind={kind}
      sealIcon={
        itemPoolSeal ??
        (action.source === "weapon" ? weaponSealIcon(action.weaponId) : undefined)
      }
      name={action.name}
      slot={action.type}
      spellLevel={action.source === "spell" ? (action.spellLevel ?? 0) : undefined}
      cantripSealLabel={t("spells.cantripSeal")}
      magical={action.source === "spell" && kind !== "spell"}
      concentration={action.concentration}
      concentrationTitle={t("combat.concentration")}
      gloss={gloss}
      verdict={verdict}
      verdictOutcome={verdictOutcome}
      riderSummary={
        collapsedRiders.length > 0 ? <RiderSummary riders={collapsedRiders} /> : undefined
      }
      verdictBreakdown={
        effectiveSummary.healingBreakdown
          ? { flavor: "heal", lines: effectiveSummary.healingBreakdown }
          : undefined
      }
      active={occupant}
      ctaLabel={ctaVerb}
      ctaAriaLabel={ctaAriaLabel}
      // The committed occupant — the recessed "Used" treatment + the card's
      // gold ring, so WHICH card spent the token stays legible while disabled.
      ctaCommitted={occupant}
      // The grammar's hard stops: a spent economy token (this card committed,
      // slot at budget, Attack action fully swung) and a depleted pool are both
      // DISABLED — never a tap that toasts "already used". Reversal lives on
      // the undo system (5s toast · masthead · ⌘Z), not on the card.
      ctaDisabled={cta.disabled}
      // B2 — the persistent inline "why you can't use this" line (Stunned / No
      // uses left), never shown on a spent card (the "Used" label says it). A
      // condition-blocked card DIMS but stays tappable (the toast guard is the
      // backstop, override-first); a depleted card is hard-disabled.
      // BG3 grammar — a LIVE pip-attack card carries NO standing label: its CTA
      // turns struck gold (`ctaEmphasis`) + the count rides hover/sr-only
      // (`ctaTitle`).
      ctaReason={!cta.spent ? (blockedReason ?? undefined) : undefined}
      ctaEmphasis={cta.emphasis}
      ctaTitle={cta.emphasis ? (attackCount ?? undefined) : undefined}
      ctaDimmed={cta.dimmed}
      onCommit={onCommit}
      slotPips={slotData}
      open={open}
      onOpenChange={onOpenChange}
      ariaExpandLabel={t("common.expand")}
    >
      {/* Pin/unpin lives in the detail foot (progressive disclosure) — the
          flagship row gesture is the Cast/Attack/Use CTA, so the secondary
          "keep this at top" control doesn't compete in the collapsed row. */}
      {action.weaponFacts ? (
        // The ONE shared weapon facts block (damage / to-hit / range + the
        // glossed category / property / owned-mastery chips) — identical to
        // the inventory WeaponCard by construction. Combat keeps its extras:
        // the Versatile wield-stance toggle (between grid and chips) and the
        // pin action (in the chip foot). The on-hit rider strip rides inside
        // `WeaponFacts` from `weaponFacts.riders` (no double-render).
        <WeaponFacts
          facts={action.weaponFacts}
          // RA-14 — the live TRACKED-ammunition count as one more fact row
          // ("Arrows · 18"), present only when the player carries the matching
          // ammo item (the engine stamps nothing otherwise). Debited by the
          // attack commit; reads straight from the inventory (rule 6).
          extraFacts={
            effectiveSummary.ammo
              ? [
                  {
                    label: localizeSrd(
                      "equipment",
                      effectiveSummary.ammo.itemId,
                      "name",
                      locale
                    ),
                    value: String(effectiveSummary.ammo.remaining),
                    icon: Layers,
                  },
                ]
              : undefined
          }
          footExtra={<PinAction pinned={pinned} label={pinLabel} onPin={onPin} />}
          onSpendRider={(rider) => onSpendRider(action, rider)}
          depletedTrackers={depletedTrackers}
        >
          {/* Item g — Versatile stance toggle: swaps the damage the VERDICT
              chip shows (the facts grid prints both labelled rows). */}
          {versatileDamage && (
            <WieldStance twoHanded={twoHanded} onChange={setTwoHanded} />
          )}
          {/* S6 — the Rogue Cunning Strike picker rides a weapon ATTACK (the
              effect is added to a Sneak Attack hit), reusing the shared
              `.rider-strip` register beside the on-hit riders. */}
          {action.type === "action" && cunningStrike.options.length > 0 && (
            <CunningStrikeOptions
              options={cunningStrike.options}
              onApply={(option) => cunningStrike.onApply(action, option)}
            />
          )}
        </WeaponFacts>
      ) : (
        <>
          <UniversalCardFacts facts={facts} />
          {/* RA-12 — the Hide check roll-entry (d20 + live Stealth bonus vs the
              flat DC 15): the outcome APPLIES (Invisible + the remembered
              find-DC), never just informs. The end-conditions hint teaches when
              the hidden state breaks (progressive disclosure — expanded only). */}
          {effectiveSummary.skillCheck && (
            <>
              <HideCheckEntry
                dc={effectiveSummary.skillCheck.dc}
                bonus={skillCheckBonusFor?.(effectiveSummary.skillCheck.skill) ?? 0}
                onApply={applyHideCheck}
              />
              <p className="mt-1 px-1 text-[0.7rem] italic text-text-secondary">
                {t("combat.hideEndsHint")}
              </p>
            </>
          )}
          {/* A non-weapon action row (a weapon-attack cantrip) surfaces its
              riders through the SAME shared strip — weapon rows render it inside
              `WeaponFacts` from `weaponFacts.riders` (no double-render). */}
          {action.riders && action.riders.length > 0 && (
            <ActionRiders
              riders={action.riders}
              onSpend={(rider) => onSpendRider(action, rider)}
              depletedTrackers={depletedTrackers}
            />
          )}
        </>
      )}
      {action.description && <UniversalCardDesc>{action.description}</UniversalCardDesc>}
      {/* D9 — "At Higher Levels" callout for leveled spells (mirrors Spells page). */}
      {higherLevels && (
        <UniversalCardHigher title={t("spells.atHigherLevels")}>
          {higherLevels}
        </UniversalCardHigher>
      )}
      {!action.weaponFacts && (
        <UniversalCardFoot>
          <PinAction pinned={pinned} label={pinLabel} onPin={onPin} />
        </UniversalCardFoot>
      )}
    </UniversalCard>
  );
}

/**
 * RA-12 — the Hide check roll-entry: enter the d20 FACE the player rolled in
 * real life (golden rule 21 — the app never rolls); the label carries the live
 * formula ("d20 + your Stealth vs DC 15") and Apply hands the face to the
 * outcome seam (`applyHideCheck`), which folds the bonus, judges the DC, and
 * applies Invisible + the find-DC on a success. Reuses the `.heal-roll-entry`
 * register (the ONE roll-entry recipe — DyingBanner's d20, Second Wind's heal).
 */
function HideCheckEntry({
  dc,
  bonus,
  onApply,
}: {
  dc: number;
  bonus: number;
  onApply: (face: number) => void;
}) {
  const { t } = useTranslation();
  const [face, setFace] = useState(10);
  return (
    <div className="heal-roll-entry">
      <span className="heal-roll-label">
        {t("combat.hideRollLabel", { bonus: formatModifier(bonus), dc })}
      </span>
      <NumberStepper
        value={face}
        onChange={setFace}
        min={1}
        max={20}
        digits={2}
        compact
        ariaLabel={t("combat.hideRollField")}
        decrementLabel={t("combat.healRollDec")}
        incrementLabel={t("combat.healRollInc")}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onApply(face);
          setFace(10);
        }}
      >
        {t("combat.apply")}
      </Button>
    </div>
  );
}

/** The pin/unpin foot action — ONE recipe whether it sits in the weapon chip
 *  foot or a non-weapon card's plain foot. */
function PinAction({
  pinned,
  label,
  onPin,
}: {
  pinned?: boolean;
  label: string;
  onPin: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={(e) => {
        e.stopPropagation();
        onPin();
      }}
      aria-pressed={!!pinned}
    >
      {pinned ? "★" : "☆"} {label}
    </Button>
  );
}

/**
 * WieldStance (item g) — the one-handed / two-handed stance toggle for a Versatile
 * weapon's combat card. A two-segment `.fchip` group (the same recipe the filter
 * bar uses) so it reads as a familiar tonal toggle; switching it swaps the damage
 * the card's verdict + facts show. Purely display (no resource/economy effect) —
 * the player taps the stance they're actually wielding.
 */
function WieldStance({
  twoHanded,
  onChange,
}: {
  twoHanded: boolean;
  onChange: (twoHanded: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="wield-stance">
      <span className="wield-stance-label">{t("combat.wieldStance")}</span>
      <div className="fchip-group" role="group" aria-label={t("combat.wieldStance")}>
        <button
          type="button"
          className="fchip"
          aria-pressed={!twoHanded}
          onClick={(e) => {
            e.stopPropagation();
            onChange(false);
          }}
        >
          {t("combat.oneHanded")}
        </button>
        <button
          type="button"
          className="fchip"
          aria-pressed={twoHanded}
          onClick={(e) => {
            e.stopPropagation();
            onChange(true);
          }}
        >
          {t("combat.twoHanded")}
        </button>
      </div>
    </div>
  );
}

/**
 * Reaction card — the folio UniversalCard in `combat-CTA` mode with a "React"
 * CTA (immediate-commit on another creature's turn). Once this round's reaction
 * is spent every reaction CTA disables to "Used" (the CTA grammar's spent
 * state); the trigger reads in the gloss + the accordion facts.
 */
function ReactionCard({
  action,
  disabled,
  committed,
  blockedReason,
  slotData,
  attackRoll,
  higherLevelsFor,
  open,
  onOpenChange,
  onUse,
}: {
  action: CombatAction;
  disabled: boolean;
  /** CTA grammar — this reaction is the one that SPENT the round's Reaction, so
   *  it keeps the recessed chip + gold ring as the group's occupant while every
   *  other reaction card merely greys to "Used" (`reactionUsedId === action.id`). */
  committed: boolean;
  /** B2 — the condition line ("Stunned") when a condition soft-blocks the
   *  reaction slot: dims the CTA but keeps it tappable (the CTA grammar's
   *  condition state, same as the action cards). Null when freely usable. */
  blockedReason: string | null;
  slotData?: SlotPips;
  attackRoll: AttackRollView;
  higherLevelsFor: (action: ResolvedAction) => string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const kind = combatKind(action);
  const verdict = combatVerdict(action, t);
  const verdictOutcome = combatVerdictOutcome(action.summary);
  const gloss = combatGloss(
    action.summary,
    t,
    locale,
    action.concentration,
    attackRoll,
    action.source
  );
  const facts = combatFacts(action.summary, t, locale);
  // D9 — an upcastable reaction spell (Counterspell, Shield, Absorb Elements, …)
  // shows the SAME "At Higher Levels" callout as the action card / Spells page.
  const higherLevels = higherLevelsFor(action);
  const hasDetail =
    !!action.description ||
    facts.length > 0 ||
    action.weaponFacts != null ||
    higherLevels != null;
  // The CTA grammar's spent state — the SAME "Used" label every spent-economy
  // CTA reads (the round's one Reaction is spent, so every reaction card
  // disables together; reversal via the undo system).
  const ctaVerb = disabled ? t("combat.used") : t("combat.react");

  return (
    <UniversalCard
      mode="combat-CTA"
      kind={kind}
      sealIcon={action.source === "weapon" ? weaponSealIcon(action.weaponId) : undefined}
      name={action.name}
      slot="reaction"
      spellLevel={action.source === "spell" ? (action.spellLevel ?? 0) : undefined}
      cantripSealLabel={t("spells.cantripSeal")}
      magical={action.source === "spell" && kind !== "spell"}
      concentration={action.concentration}
      concentrationTitle={t("combat.concentration")}
      gloss={gloss}
      verdict={verdict}
      verdictOutcome={verdictOutcome}
      verdictBreakdown={
        action.summary.healingBreakdown
          ? { flavor: "heal", lines: action.summary.healingBreakdown }
          : undefined
      }
      // The occupant keeps the gold ring + recessed chip so WHICH reaction spent
      // the round's Reaction stays legible while the whole group greys to "Used".
      active={committed}
      ctaLabel={ctaVerb}
      // Accessible name mirrors the visible label (WCAG 2.5.3 label-in-name):
      // spent reads "Used: <name>", live reads "React: <name>".
      ctaAriaLabel={`${ctaVerb}: ${action.name}`}
      ctaDisabled={disabled}
      ctaCommitted={committed}
      // The grammar's condition state — dimmed + the condition line, still
      // tappable (override-first; the toast guard is the backstop). Never
      // shown on a spent card (the "Used" label says it).
      ctaReason={!disabled ? (blockedReason ?? undefined) : undefined}
      ctaDimmed={!disabled && blockedReason != null}
      onCommit={onUse}
      slotPips={slotData}
      open={open}
      onOpenChange={onOpenChange}
      ariaExpandLabel={t("common.expand")}
    >
      {hasDetail && (
        <>
          {action.weaponFacts ? (
            <WeaponFacts facts={action.weaponFacts} />
          ) : (
            <UniversalCardFacts facts={facts} />
          )}
          {action.description && (
            <UniversalCardDesc>{action.description}</UniversalCardDesc>
          )}
          {/* D9 — "At Higher Levels" callout for an upcastable reaction spell
              (mirrors the action card + Spells page). */}
          {higherLevels && (
            <UniversalCardHigher title={t("spells.atHigherLevels")}>
              {higherLevels}
            </UniversalCardHigher>
          )}
        </>
      )}
    </UniversalCard>
  );
}

/**
 * Off-list reaction row — the ONE bookkeeping affordance in the reaction-filtered
 * board for a reaction resolved OUTSIDE the list (an opportunity attack called
 * verbally, a readied action). Reuses the combat action-row recipe (UniversalCard
 * in combat-CTA mode, reaction voice); committing routes through the shared
 * `handleUseReaction` path, so the undo toast + the meter's dimming reaction
 * disc behave exactly like a listed reaction card. Owner verdict 2026-06-11:
 * the meter's reaction circle is a pure filter; spending lives here.
 */
function OffListReactionRow({
  disabled,
  committed,
  onUse,
}: {
  disabled: boolean;
  /** CTA grammar — this "Mark used" row is the occupant when the round's Reaction
   *  was spent verbally (off-list), so it keeps the ring while every listed
   *  reaction card greys to "Used" (`reactionUsedId === "manual-reaction"`). */
  committed: boolean;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  return (
    <UniversalCard
      mode="combat-CTA"
      kind="base"
      name={t("combat.otherReactionName")}
      slot="reaction"
      gloss={t("combat.otherReactionGloss")}
      active={committed}
      ctaLabel={disabled ? t("combat.used") : t("combat.markReactionUsed")}
      ctaAriaLabel={`${disabled ? t("combat.used") : t("combat.markReactionUsed")}: ${t("combat.otherReactionName")}`}
      ctaDisabled={disabled}
      ctaCommitted={committed}
      onCommit={onUse}
    />
  );
}

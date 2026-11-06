/**
 * What each action's button can do right now, from the turn the caller passes in:
 * its verb (Attack · Cast · Use · React), whether it is spent, live (Extra Attack
 * swings left), depleted or dimmed by a condition, and why. One rule for every screen
 * that commits actions (the old sheet's Play tab, the new Play screen): the CTA
 * grammar (owner-ratified 2026-07-11) says what is usable NOW, and the session undo
 * owns every reversal. Pure: no store reads; the conditions arrive already resolved,
 * so every screen passes the same list.
 */
import type {
  ConditionFacts,
  GatedSlot,
  ResolvedConditionEffects,
} from "@/lib/condition-effects";
import { resolveConditionEffects } from "@/lib/condition-effects";
import type { ActionEconomyCategory } from "@/data/types";
import {
  resolveActiveStateBlocker,
  spellcastingBlocker,
  type ResolvedAction,
} from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";
import { localizeSrd } from "@/i18n/resolver";
import type { Locale } from "@/lib/locale";
import { isActionDepleted } from "./action-row-view";
import { attacksRemainingInAction, isPipAttackAction } from "./combat-action-view";
import { conditionLabel } from "./tracker-view";

/** The button's verb, as a stable id; each screen renders the label. */
export type ActionCtaVerb = "attack" | "cast" | "use" | "react";

/** Why a button is not freely usable now (a reason line, never a hard lock). */
export type ActionBlockReason =
  | {
      kind:
        | "no-uses"
        | "prerequisite-action"
        | "prerequisite-category"
        | "per-turn-limit"
        | "already-moved"
        | "heavy-armor"
        | "incapacitated"
        | "loading"
        /** A state (Rage) or the assumed form (Wild Shape) keeps the spell from being cast. */
        | "spellcasting-blocked"
        | "in-form";
    }
  /** A condition forbids the slot; `condition` names the first one that does. */
  | { kind: "condition"; condition: string | undefined }
  | { kind: "out-of-ammo"; itemId: string };

/** This turn, as the combat store holds it. */
export interface ActionTurnState {
  selected: Readonly<
    Record<
      "action" | "bonus" | "free",
      ReadonlyArray<{ id: string; economyCategory?: ActionEconomyCategory }>
    >
  >;
  budget: { action: number; bonus: number };
  attackBudget: number;
  attacksUsed: number;
  /** The weapon-card ids that rode a swing of an Attack action this turn. */
  attackSwingIds: ReadonlyArray<string>;
  reactionUsed: boolean;
  reactionUsedId: string | null;
  movementUsedFt: number;
  /** The highest spell level War Magic may swap for an attack (-1 = none). */
  warMagicMax: number;
}

/** The character's effective conditions and what they resolve to. */
export interface ActionConditions {
  list: ReadonlyArray<string>;
  effects: ResolvedConditionEffects;
  /** The facts `effects` was resolved with (`conditionFactsFor`). */
  facts: ConditionFacts;
}

/** The CTA grammar's four states (see {@link combatCtaState}). */
export interface CombatCtaState {
  /** The CTA reads the "Used" label instead of its verb. */
  spent: boolean;
  disabled: boolean;
  emphasis: boolean;
  dimmed: boolean;
}

/**
 * The combat-CTA grammar — ONE rule across every combat card:
 *  - `spent`    — the card's economy token is spent (this card committed it, its
 *                 slot is at budget, the Attack action is fully swung, or the
 *                 Reaction is used) → disabled, label "Used". Mid-Attack-action
 *                 (`attackLive`) the Action slot is full but swings remain, so spent
 *                 does NOT apply.
 *  - `disabled` — spent OR depleted (no uses / no cast route).
 *  - `emphasis` — Extra Attack swings remain → the live CTA.
 *  - `dimmed`   — condition-soft-blocked → dimmed with its reason, still tappable
 *                 (override-first; the post-tap toast is the backstop).
 */
export function combatCtaState(args: {
  committed: boolean;
  slotFull: boolean;
  attackLive: boolean;
  depleted: boolean;
  conditionBlocked: boolean;
}): CombatCtaState {
  const spent = (args.committed || args.slotFull) && !args.attackLive;
  return {
    spent,
    disabled: spent || args.depleted,
    emphasis: args.attackLive && !args.depleted,
    dimmed: !spent && !args.depleted && args.conditionBlocked,
  };
}

/** A card's condition gate: a depleted resource first, then a blocked slot. */
export type BlockedReason = { kind: "depleted" } | { kind: "condition"; slot: GatedSlot };

export function blockedReasonFor(args: {
  slot: GatedSlot;
  blockedSlots: ReadonlySet<GatedSlot>;
  depleted: boolean;
}): BlockedReason | null {
  if (args.depleted) return { kind: "depleted" };
  if (args.blockedSlots.has(args.slot)) return { kind: "condition", slot: args.slot };
  return null;
}

/**
 * The Two-Weapon Fighting once-per-turn off-hand cap: every `offhand` row is one
 * per-turn resource, so the first committed (free or bonus slot) claims it and the
 * others read spent. Returns that off-hand's id, or null while none is committed.
 */
export function committedOffHandId(
  actions: ReadonlyArray<{ id: string; offhand?: boolean }>,
  committedIds: ReadonlySet<string>
): string | null {
  return actions.find((a) => a.offhand && committedIds.has(a.id))?.id ?? null;
}

/** A spell (or an item's spell pool) never spends an economy token of its own. */
const castsSpell = (action: ResolvedAction) =>
  action.source === "spell" || action.castPoolSourceId !== undefined;

/** The economy slot an action occupies (free actions take neither A nor B). */
const slotOf = (action: ResolvedAction): "action" | "bonus" | "free" =>
  action.type === "action" ? "action" : action.type === "bonus" ? "bonus" : "free";

/**
 * Why `action` is not freely usable now, or null. `depleted` is the caller's (a
 * reaction card asks with `false`: its button already reads its spent state).
 */
export function actionBlockReason(
  doc: CharacterDoc,
  action: ResolvedAction,
  turn: ActionTurnState,
  conditions: ActionConditions,
  depleted: boolean
): ActionBlockReason | null {
  if (castsSpell(action)) {
    // A blocked spell has no cast routes, so it also reads depleted: the block is why.
    const blocker = spellcastingBlocker(doc, action.spellId);
    if (blocker === "form") return { kind: "in-form" };
    if (blocker === "state") return { kind: "spellcasting-blocked" };
    return depleted ? { kind: "no-uses" } : null;
  }
  const committed = [
    ...turn.selected.action,
    ...turn.selected.bonus,
    ...turn.selected.free,
  ];
  if (
    action.requiresActionThisTurn &&
    !committed.some((entry) => entry.id === action.requiresActionThisTurn)
  )
    return { kind: "prerequisite-action" };
  if (
    action.requiresActionCategoryThisTurn &&
    !committed.some(
      (entry) => entry.economyCategory === action.requiresActionCategoryThisTurn
    )
  )
    return { kind: "prerequisite-category" };
  if (
    action.maxUsesPerTurn !== undefined &&
    committed.filter((entry) => entry.id === action.id).length >= action.maxUsesPerTurn
  )
    return { kind: "per-turn-limit" };
  if (action.locksMovement && turn.movementUsedFt > 0) return { kind: "already-moved" };
  const blocker = resolveActiveStateBlocker(doc, action);
  if (blocker) return { kind: blocker };
  // The true economy kind is `action.type`: reactions fold into "free" for the
  // slot, but a condition still gates them. A free action is never gated.
  if (action.type === "free")
    return depleted ? { kind: "no-uses" } : weaponAdvisory(action, turn);
  const reason = blockedReasonFor({
    slot: action.type,
    blockedSlots: conditions.effects.blockedSlots,
    depleted,
  });
  if (!reason) return weaponAdvisory(action, turn);
  if (reason.kind === "depleted") return { kind: "no-uses" };
  return {
    kind: "condition",
    condition: conditions.list.find((id) =>
      resolveConditionEffects([id], conditions.facts).blockedSlots.has(reason.slot)
    ),
  };
}

/**
 * A weapon row's advisories, dimmed but tappable: an empty tracked quiver, and
 * Loading's one shot per action once this weapon fired while swings remain.
 */
function weaponAdvisory(
  action: ResolvedAction,
  turn: ActionTurnState
): ActionBlockReason | null {
  if (action.source !== "weapon") return null;
  const ammo = action.summary.ammo;
  if (ammo && ammo.remaining === 0) return { kind: "out-of-ammo", itemId: ammo.itemId };
  if (
    action.summary.loading &&
    attacksRemainingInAction(turn.attacksUsed, turn.attackBudget) != null &&
    turn.attackSwingIds.includes(action.id)
  )
    return { kind: "loading" };
  return null;
}

export interface ActionCta {
  /** An off-hand attack before a Light main-hand attack this turn: not offered yet. */
  hidden: boolean;
  verb: ActionCtaVerb;
  /** This card is a committed occupant of its slot this turn. */
  committed: boolean;
  /** Its slot is at budget (spells never spend out; the off-hand cap applies). */
  slotFull: boolean;
  depleted: boolean;
  /** Extra Attack swings left in the open Attack action, while this card is live. */
  attacksLeft: { remaining: number; total: number } | null;
  /** It rode a swing of the Attack action this turn (keeps its ring once spent). */
  attackOccupant: boolean;
  reason: ActionBlockReason | null;
  state: CombatCtaState;
}

/** Every action's button, keyed by action id. */
export function actionCtaView(
  doc: CharacterDoc,
  actions: ReadonlyArray<ResolvedAction>,
  turn: ActionTurnState,
  conditions: ActionConditions
): Map<string, ActionCta> {
  const isLightMain = (id: string) => actions.some((a) => a.id === id && a.lightWeapon);
  // Two-Weapon Fighting: the off-hand opens once a Light main-hand attack is
  // committed, as the Action slot's occupant (one attack) or a swing (Extra Attack).
  const lightAttackCommitted =
    turn.selected.action.some((s) => isLightMain(s.id)) ||
    turn.attackSwingIds.some(isLightMain);
  // A feature's Bonus Action attack (Pole Strike) follows an attack with its weapon.
  const attackedWith = new Set([
    ...turn.selected.action.map((s) => s.id),
    ...turn.attackSwingIds,
  ]);
  const offHand = committedOffHandId(
    actions,
    new Set([...turn.selected.free, ...turn.selected.bonus].map((s) => s.id))
  );
  const attacksLeft = attacksRemainingInAction(turn.attacksUsed, turn.attackBudget);
  const out = new Map<string, ActionCta>();
  for (const action of actions) {
    const depleted = isActionDepleted(doc, action);
    if (action.type === "reaction") {
      // The round's one Reaction: a spell reaction spends a slot, not the token.
      const spell = action.source === "spell";
      const committed = !spell && turn.reactionUsedId === action.id;
      const slotFull = !spell && turn.reactionUsed;
      const reason = actionBlockReason(doc, action, turn, conditions, false);
      out.set(action.id, {
        hidden: false,
        verb: "react",
        committed,
        slotFull,
        depleted: spell && depleted,
        attacksLeft: null,
        attackOccupant: false,
        reason,
        state: combatCtaState({
          committed,
          slotFull,
          attackLive: false,
          depleted: spell && depleted,
          conditionBlocked: reason !== null,
        }),
      });
      continue;
    }
    const spell = castsSpell(action);
    const slot = slotOf(action);
    const committed = !spell && turn.selected[slot].some((s) => s.id === action.id);
    const slotFull = spell
      ? false
      : action.offhand && offHand != null && offHand !== action.id
        ? true
        : slot === "action"
          ? turn.selected.action.length >= turn.budget.action
          : slot === "bonus"
            ? turn.selected.bonus.length >= turn.budget.bonus
            : false;
    const live =
      turn.attackBudget > 1 &&
      isPipAttackAction(action, turn.warMagicMax) &&
      attacksLeft != null;
    const reason = actionBlockReason(doc, action, turn, conditions, depleted);
    out.set(action.id, {
      hidden:
        (action.offhand === true && !lightAttackCommitted) ||
        (action.bonusAttackAfter !== undefined &&
          !attackedWith.has(action.bonusAttackAfter)),
      verb: spell ? "cast" : action.source === "weapon" ? "attack" : "use",
      committed,
      slotFull,
      depleted,
      attacksLeft: live ? { remaining: attacksLeft, total: turn.attackBudget } : null,
      attackOccupant: turn.attackSwingIds.includes(action.id),
      reason,
      state: combatCtaState({
        committed,
        slotFull,
        attackLive: live,
        depleted,
        // any reason line dims the button (it stays tappable), as on the old sheet
        conditionBlocked: reason !== null && !depleted,
      }),
    });
  }
  return out;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** The reason line under a button, in the reader's language (null = say nothing). */
export function blockReasonLine(
  reason: ActionBlockReason,
  t: Translate,
  locale: Locale
): string | null {
  switch (reason.kind) {
    case "no-uses":
      return t("combat.blockedReasonNoUses");
    case "prerequisite-action":
      return t("combat.blockedReasonPrerequisiteAction");
    case "prerequisite-category":
      return t("combat.blockedReasonPrerequisiteCategory");
    case "per-turn-limit":
      return t("combat.blockedReasonPerTurnLimit");
    case "already-moved":
      return t("combat.blockedReasonAlreadyMoved");
    case "heavy-armor":
      return t("combat.blockedReasonHeavyArmor");
    case "incapacitated":
      return t("combat.blockedReasonIncapacitated");
    case "spellcasting-blocked":
      return t("combat.blockedReasonSpellcasting");
    case "in-form":
      return t("combat.blockedReasonInForm");
    case "loading":
      return t("combat.loadingOneShotReason");
    case "out-of-ammo":
      return t("combat.outOfAmmoReason", {
        item: localizeSrd("equipment", reason.itemId, "name", locale),
      });
    case "condition":
      return reason.condition ? conditionLabel(reason.condition, locale) : null;
  }
}

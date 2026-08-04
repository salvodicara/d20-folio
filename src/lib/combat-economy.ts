/** Pure allocation rules for ordinary and restricted combat-economy slots. */

import type { Grant } from "@/lib/grants";
import type { ResolvedAction } from "@/lib/smart-tracker";

type ExtraActionGrant = Extract<Grant, { type: "extra-action" }>;

export type EconomyActionCategory = NonNullable<
  ExtraActionGrant["allowedActions"]
>[number];

export interface EconomyActionClaim {
  category: EconomyActionCategory | null;
  /** Number of attacks contained in one Attack action. Non-attacks omit it. */
  attackCount?: number;
}

export interface EconomyActionRule {
  slot: ExtraActionGrant["slot"];
  count: number;
  allowedActions?: ExtraActionGrant["allowedActions"];
  maxAttacks?: number;
}

export interface EconomyTurnAction {
  isAttackGroup?: boolean;
  economyCategory?: EconomyActionCategory;
}

interface ActionSlot {
  allowed: ReadonlySet<EconomyActionCategory> | null;
  maxAttacks: number;
}

/** Stable rules category for an action. `null` means it needs an unrestricted slot. */
export function economyActionCategory(
  action: Pick<ResolvedAction, "id" | "source">
): EconomyActionCategory | null {
  if (action.source === "weapon") return "attack";
  switch (action.id) {
    case "base-grapple":
    case "base-shove":
      return "attack";
    case "base-dash":
      return "dash";
    case "base-disengage":
      return "disengage";
    case "base-hide":
      return "hide";
    case "base-utilize":
      return "utilize";
    default:
      return null;
  }
}

function actionSlots(
  rules: ReadonlyArray<EconomyActionRule>,
  baseCount: number
): ActionSlot[] {
  const slots: ActionSlot[] = Array.from({ length: Math.max(0, baseCount) }, () => ({
    allowed: null,
    maxAttacks: Infinity,
  }));
  for (const rule of rules) {
    if (rule.slot !== "action") continue;
    for (let index = 0; index < Math.max(0, rule.count); index += 1) {
      slots.push({
        allowed: rule.allowedActions ? new Set(rule.allowedActions) : null,
        maxAttacks: rule.maxAttacks ?? Infinity,
      });
    }
  }
  return slots;
}

function slotAccepts(slot: ActionSlot, claim: EconomyActionClaim): boolean {
  if (slot.allowed && (!claim.category || !slot.allowed.has(claim.category)))
    return false;
  return claim.category !== "attack" || (claim.attackCount ?? 1) <= slot.maxAttacks;
}

/**
 * Whether all committed/proposed Action claims can be assigned to the available
 * unrestricted and restricted slots. Slots are deliberately unordered: taking the
 * restricted action first never consumes the ordinary Action by accident.
 */
export function canAssignActionClaims(
  claims: ReadonlyArray<EconomyActionClaim>,
  rules: ReadonlyArray<EconomyActionRule>,
  baseCount = 1
): boolean {
  const slots = actionSlots(rules, baseCount);
  if (claims.length > slots.length) return false;

  // Hardest claims first keeps the tiny backtracking search deterministic and shallow.
  const ordered = [...claims].sort((a, b) => {
    if (a.category === null && b.category !== null) return -1;
    if (a.category !== null && b.category === null) return 1;
    return (b.attackCount ?? 1) - (a.attackCount ?? 1);
  });
  const used = new Set<number>();

  const assign = (claimIndex: number): boolean => {
    if (claimIndex >= ordered.length) return true;
    const claim = ordered[claimIndex];
    if (!claim) return true;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      if (!slot || used.has(slotIndex) || !slotAccepts(slot, claim)) continue;
      used.add(slotIndex);
      if (assign(claimIndex + 1)) return true;
      used.delete(slotIndex);
    }
    return false;
  };

  return assign(0);
}

/** Rebuild the Action claims from the durable turn ledger. Attack groups carry
 * their real swing count so a restricted one-attack slot cannot inherit Extra Attack. */
export function economyClaimsForTurn(
  actions: ReadonlyArray<EconomyTurnAction>,
  attacksUsed: number,
  attackBudget: number
): EconomyActionClaim[] {
  let attackGroupIndex = 0;
  return actions.map((action) => {
    if (!action.isAttackGroup) {
      return { category: action.economyCategory ?? null };
    }
    const usedBeforeGroup = attackGroupIndex * Math.max(1, attackBudget);
    attackGroupIndex += 1;
    return {
      category: "attack",
      // A persisted group must always consume at least one attack claim, even if a
      // malformed/stale counter says zero. Defensive parsing must never grant a slot.
      attackCount: Math.max(
        1,
        Math.min(Math.max(1, attackBudget), attacksUsed - usedBeforeGroup)
      ),
    };
  });
}

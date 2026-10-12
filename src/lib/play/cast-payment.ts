/**
 * What a use costs and whether the character can pay it now: pure rules over the
 * character, shared by the cast picker (a proposal) and the commit (which revalidates
 * against the live character so no path overdraws a resource).
 */
import { METAMAGIC_BY_ID } from "@/data/metamagic";
import { bareSlotIsPact, slotUsageKey, type CastLevelOption } from "@/lib/cast-options";
import {
  resolveItemResourceAvailability,
  resolveTrackers,
  type ActionCostOption,
  type ResolvedAction,
} from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

/** A configured cast: a picker row, or a ritual (no slot). */
export type CastCommitOption = CastLevelOption | { kind: "ritual"; level: number };

/** The Sorcerer's Sorcery Points tracker, which pays for Metamagic. */
export const SORCERY_POINTS_TRACKER_ID = "sorcerer-font-of-magic";

type TrackerCount = { readonly total: number; readonly used: number };

/** Whether the cast spends one of the character's spell slots. */
export function castOptionExpendsSpellSlot(option: CastCommitOption): boolean {
  return (
    option.kind === undefined ||
    option.kind === "slot" ||
    (option.kind === "free-cast" && option.expendsSpellSlot === true)
  );
}

/** The action re-priced to one alternative payment (the primary cost replaced). */
export function actionWithCost(
  action: ResolvedAction,
  cost: ActionCostOption["cost"]
): ResolvedAction {
  const withoutPrimaryCost: ResolvedAction = {
    ...action,
    costsSlot: false,
    slotLevel: undefined,
    costTracker: undefined,
    trackerCost: undefined,
    costTrackerIsPool: undefined,
    costTrackerUnit: undefined,
    costEquipment: undefined,
    resourcePayment: undefined,
    resourceCost: undefined,
  };
  if (cost.kind === "spell-slot") {
    return { ...withoutPrimaryCost, costsSlot: true, slotLevel: cost.minLevel };
  }
  if (cost.kind === "item-resource") {
    return {
      ...withoutPrimaryCost,
      resourcePayment: {
        kind: "item-resource" as const,
        itemId: cost.itemId,
        instanceId: cost.instanceId,
        resourceId: cost.resourceId,
        key: cost.key,
      },
      resourceCost: cost.amount,
    };
  }
  if (cost.kind === "tracker") {
    return {
      ...withoutPrimaryCost,
      costTracker: cost.trackerId,
      trackerCost: cost.amount ?? 1,
      costTrackerIsPool: cost.pool ?? false,
    };
  }
  if (cost.kind === "equipment") {
    return { ...withoutPrimaryCost, costEquipment: cost.key };
  }
  if (cost.kind === "free-cast") {
    return { ...withoutPrimaryCost, costTracker: cost.sourceId, trackerCost: 1 };
  }
  if (cost.kind === "signature") {
    return { ...withoutPrimaryCost, costTracker: cost.trackerId, trackerCost: 1 };
  }
  // Mastery / ritual / none are explicitly cost-free alternatives.
  return withoutPrimaryCost;
}

/** Whether a tracker has at least `amount` uses left. */
export function trackerAffordable(
  doc: CharacterDoc,
  trackerId: string,
  amount: number
): boolean {
  const tracker = resolveTrackers(doc).find((entry) => entry.id === trackerId);
  return tracker !== undefined && tracker.total - tracker.used >= amount;
}

/**
 * Whether one payment alternative is affordable (the picker disables the rest). A
 * slot payment needs an open slot ≥ its minLevel, each pool (normal vs pact) checked
 * against its own counter; a tracker payment needs remaining uses. `trackers` is the
 * caller's already-resolved tracker lookup. Other kinds are always affordable.
 */
export function paymentAffordable(
  doc: CharacterDoc,
  trackers: ReadonlyMap<string, TrackerCount>,
  cost: ActionCostOption["cost"]
): boolean {
  if (cost.kind === "spell-slot") {
    return doc.character.spellSlots.some((s) => {
      if (s.level < cost.minLevel) return false;
      const used = doc.session.spellSlots[slotUsageKey(s)]?.used ?? 0;
      return used < s.total;
    });
  }
  if (cost.kind === "tracker") {
    const tr = trackers.get(cost.trackerId);
    return tr ? tr.total - tr.used >= (cost.amount ?? 1) : false;
  }
  if (cost.kind === "item-resource") {
    const availability = resolveItemResourceAvailability(doc, cost);
    return Boolean(availability && availability.current >= cost.amount);
  }
  return true;
}

/** The Sorcery Points a set of Metamagic options costs. */
export function metamagicCost(metamagicIds: ReadonlyArray<string>): number {
  return metamagicIds.reduce((sum, id) => sum + (METAMAGIC_BY_ID.get(id)?.cost ?? 0), 0);
}

/** Whether the character has the Sorcery Points for the chosen Metamagic. */
export function metamagicAffordable(
  doc: CharacterDoc,
  metamagicIds: ReadonlyArray<string>
): boolean {
  const cost = metamagicCost(metamagicIds);
  return cost === 0 || trackerAffordable(doc, SORCERY_POINTS_TRACKER_ID, cost);
}

/** Whether the slot row at `level` in that pool has an opening. */
function slotOpen(doc: CharacterDoc, level: number, pactMagic: boolean): boolean {
  const row = doc.character.spellSlots.find(
    (entry) => entry.level === level && Boolean(entry.pactMagic) === pactMagic
  );
  return Boolean(
    row && (doc.session.spellSlots[slotUsageKey(row)]?.used ?? 0) < row.total
  );
}

/** Revalidate a bare action payment that did not come through the cast picker.
 *  Item resources own their stricter prepared check. */
export function actionPaymentAffordable(
  doc: CharacterDoc,
  action: ResolvedAction
): boolean {
  if (action.costsSlot) {
    if (action.slotLevel == null) return false;
    return slotOpen(
      doc,
      action.slotLevel,
      bareSlotIsPact(doc.character.spellSlots, action.slotLevel)
    );
  }
  if (!action.resourcePayment && action.costTracker) {
    return trackerAffordable(doc, action.costTracker, action.trackerCost ?? 1);
  }
  if (action.costEquipment) {
    return doc.character.equipment.some(
      (ref) =>
        ("custom" in ref ? `custom-${ref.instanceId}` : ref.srdId) ===
          action.costEquipment && (ref.quantity ?? 1) > 0
    );
  }
  return true;
}

/** Revalidate a configured cast: the picker is only a proposal, and a sync, another
 *  action or a redo may have spent the resource since. */
export function castOptionAffordable(doc: CharacterDoc, opt: CastCommitOption): boolean {
  if (opt.kind === "ritual") return true;
  if (!opt.kind || opt.kind === "slot") {
    return slotOpen(doc, opt.level, Boolean(opt.pactMagic));
  }
  if (opt.kind === "free-cast") {
    if (opt.payment?.kind === "item-resource") {
      const available = resolveItemResourceAvailability(doc, opt.payment);
      return available !== null && available.current >= opt.cost;
    }
    const trackerId =
      opt.payment?.kind === "tracker" ? opt.payment.trackerId : opt.sourceId;
    return trackerAffordable(doc, trackerId, opt.cost);
  }
  return true;
}

/** One store-paid part of a use: a spell slot from one pool, or tracker uses. */
export type CastSpend =
  | { kind: "slot"; level: number; pactMagic: boolean }
  | { kind: "tracker"; trackerId: string; amount: number };

/**
 * What a configured cast spends from the sheet: its slot or its free-cast tracker,
 * then the Sorcery Points for its Metamagic. An item-resource payment is not here:
 * it is paid through its own prepared item command.
 */
export function castOptionSpends(
  option: CastCommitOption,
  metamagicIds: ReadonlyArray<string>
): CastSpend[] {
  const spends: CastSpend[] = [];
  if (option.kind === "slot") {
    spends.push({
      kind: "slot",
      level: option.level,
      pactMagic: Boolean(option.pactMagic),
    });
  } else if (option.kind === "free-cast" && option.payment?.kind !== "item-resource") {
    spends.push({
      kind: "tracker",
      trackerId:
        option.payment?.kind === "tracker" ? option.payment.trackerId : option.sourceId,
      amount: option.cost,
    });
  }
  const points = metamagicCost(metamagicIds);
  if (points > 0) {
    spends.push({
      kind: "tracker",
      trackerId: SORCERY_POINTS_TRACKER_ID,
      amount: points,
    });
  }
  return spends;
}

/**
 * What a bare action (no cast-option pick) spends: its slot, its pool resolved from
 * the slot table (normal when one exists at that level, else Pact), or else its
 * tracker. Equipment is spent through the store's own item command.
 */
export function bareActionSpend(
  spellSlots: CharacterDoc["character"]["spellSlots"],
  action: ResolvedAction,
  trackerAmount?: number
): CastSpend | null {
  if (action.costsSlot && action.slotLevel != null) {
    return {
      kind: "slot",
      level: action.slotLevel,
      pactMagic: bareSlotIsPact(spellSlots, action.slotLevel),
    };
  }
  if (action.costTracker) {
    return {
      kind: "tracker",
      trackerId: action.costTracker,
      amount: trackerAmount ?? action.trackerCost ?? 1,
    };
  }
  return null;
}

/** An item resource a use pays with, how many units, and the name its prompt shows. */
export interface ItemPayment {
  payment: NonNullable<ResolvedAction["resourcePayment"]>;
  amount: number;
  label: string;
}

/**
 * The item resource a use pays with, paid through its own prepared item command: a
 * configured free cast drawn from an item, or a bare action's own item cost.
 */
export function castItemPayment(
  action: ResolvedAction,
  option?: CastCommitOption
): ItemPayment | null {
  if (option) {
    return option.kind === "free-cast" && option.payment?.kind === "item-resource"
      ? { payment: option.payment, amount: option.cost, label: option.sourceName }
      : null;
  }
  return action.resourcePayment
    ? {
        payment: action.resourcePayment,
        amount: action.resourceCost ?? 1,
        label: action.name,
      }
    : null;
}

/**
 * Atomic mechanics commands for character-owned resources.
 *
 * This first vertical owns resource conversions. A command stores only the
 * player's stable choice; every execution (including redo) re-resolves the live
 * grant and all resource owners before producing one compare-and-swap plan.
 * Pure module — no React, stores, persistence, locale, or Firebase.
 */

import { classFeatureIndex } from "@/data/classes";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { slotUsageKey } from "@/lib/cast-options";
import { classEntryLevel } from "@/lib/classes";
import {
  planResourceConversion,
  type CommitOp,
  type ResourceConversionChoice,
} from "@/lib/cost-engine";
import type { ResourceConversionEntry } from "@/lib/grants";
import { resolveTrackers } from "@/lib/smart-tracker";
import type { CharacterDoc, TrackerState } from "@/types/character";

export type ResourceConversionSelection =
  | { kind: "create-slot"; via: "cost-table"; slotLevel: number }
  | { kind: "create-slot"; via: "tracker-units"; units: number }
  | { kind: "slot-to-points"; slotLevel: number }
  | { kind: "restore-pact"; slotLevel: number; amount: number };

export interface ResourceConversionCommand {
  kind: "resource-conversion";
  occurrenceId: string;
  characterId: string;
  sourceId: string;
  conversionId: string;
  selection: ResourceConversionSelection;
}

export type MechanicsCommand = ResourceConversionCommand;

export type ResourceOwnerAddress =
  | { kind: "spell-slot"; level: number; pactMagic: boolean }
  | { kind: "tracker"; trackerId: string };

export interface MechanicsOwnerOperation {
  address: ResourceOwnerAddress;
  expectedTotal: number;
  expectedUsed: number;
  nextUsed: number;
}

export interface MechanicsPlan {
  kind: "resource-conversion";
  direction: "forward" | "reverse";
  command: ResourceConversionCommand;
  ownerOperations: ReadonlyArray<MechanicsOwnerOperation>;
}

export interface MechanicsReceiptChange {
  address: ResourceOwnerAddress;
  total: number;
  beforeUsed: number;
  afterUsed: number;
}

export interface MechanicsReceipt {
  command: ResourceConversionCommand;
  changes: ReadonlyArray<MechanicsReceiptChange>;
}

export type MechanicsPreparation =
  | { status: "planned"; plan: MechanicsPlan }
  | {
      status: "rejected";
      reason:
        | "invalid-command"
        | "character-mismatch"
        | "source-unavailable"
        | "choice-unavailable"
        | "resource-unavailable"
        | "invalid-resource-state";
    };

export type MechanicsApplyResult =
  | { status: "applied"; character: CharacterDoc; receipt: MechanicsReceipt }
  | {
      status: "rejected";
      reason:
        | "character-mismatch"
        | "source-unavailable"
        | "owner-missing"
        | "stale-plan"
        | "invalid-plan";
    };

/** A legal, currently committable conversion choice. */
export interface ConversionOptionVM {
  kind: "create-slot" | "slot-to-points" | "restore-pact";
  choice: ResourceConversionChoice;
  selection: ResourceConversionSelection;
  producedSlotLevel?: number;
  costUnits?: number;
  slotLevelSpent?: number;
  pointsGained?: number;
  pactRestored?: number;
}

/** Live resource facts used to expose legal conversion choices. */
export interface ConversionCtx {
  classLevel: number;
  trackerRemaining: (trackerId: string) => number;
  trackerDeficit: (trackerId: string) => number;
  slotsExpended: (level: number) => number;
  slotsAvailable: (level: number) => number;
  pactPool?: { level: number; max: number; expended: number; restoresAll: boolean };
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function addressKey(address: ResourceOwnerAddress): string {
  return address.kind === "tracker"
    ? `tracker:${address.trackerId}`
    : `slot:${address.pactMagic ? "pact" : "normal"}:${address.level}`;
}

function sameAddressValue(a: ResourceOwnerAddress, b: ResourceOwnerAddress): boolean {
  return addressKey(a) === addressKey(b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectionIsValid(value: unknown): value is ResourceConversionSelection {
  if (!isRecord(value)) return false;
  const selection = value;
  switch (selection.kind) {
    case "create-slot":
      return selection.via === "cost-table"
        ? positiveSafeInteger(selection.slotLevel)
        : selection.via === "tracker-units"
          ? positiveSafeInteger(selection.units)
          : false;
    case "slot-to-points":
      return positiveSafeInteger(selection.slotLevel);
    case "restore-pact":
      return (
        positiveSafeInteger(selection.slotLevel) && positiveSafeInteger(selection.amount)
      );
    default:
      return false;
  }
}

function commandIsValid(command: unknown): command is ResourceConversionCommand {
  if (!isRecord(command)) return false;
  return (
    command.kind === "resource-conversion" &&
    nonEmpty(command.occurrenceId) &&
    nonEmpty(command.characterId) &&
    nonEmpty(command.sourceId) &&
    nonEmpty(command.conversionId) &&
    selectionIsValid(command.selection)
  );
}

function planHeaderIsValid(value: unknown): value is MechanicsPlan {
  return (
    isRecord(value) &&
    value.kind === "resource-conversion" &&
    (value.direction === "forward" || value.direction === "reverse") &&
    commandIsValid(value.command) &&
    Array.isArray(value.ownerOperations) &&
    value.ownerOperations.length > 0
  );
}

function addressIsValid(value: unknown): value is ResourceOwnerAddress {
  if (!isRecord(value)) return false;
  return value.kind === "tracker"
    ? nonEmpty(value.trackerId)
    : value.kind === "spell-slot" &&
        positiveSafeInteger(value.level) &&
        typeof value.pactMagic === "boolean";
}

function normalSlot(doc: CharacterDoc, level: number) {
  return doc.character.spellSlots.find((slot) => slot.level === level && !slot.pactMagic);
}

/** Resolve the current locale-free legality context for a conversion grant. */
export function buildConversionCtx(
  doc: CharacterDoc,
  entry: ResourceConversionEntry
): ConversionCtx {
  const ownerClass = classFeatureIndex.get(entry.sourceId)?.class;
  const classLevel = ownerClass ? classEntryLevel(doc.character, ownerClass) : 0;
  const trackers = resolveTrackers(doc);
  const remaining = (id: string): number => {
    const tracker = trackers.find((candidate) => candidate.id === id);
    return tracker ? Math.max(0, tracker.total - tracker.used) : 0;
  };
  const deficit = (id: string): number => {
    const tracker = trackers.find((candidate) => candidate.id === id);
    return tracker ? Math.max(0, Math.min(tracker.used, tracker.total)) : 0;
  };
  const slotUsed = (level: number): number => {
    const slot = normalSlot(doc, level);
    if (!slot) return 0;
    return Math.min(doc.session.spellSlots[slotUsageKey(slot)]?.used ?? 0, slot.total);
  };
  const pactSlot = doc.character.spellSlots.find((slot) => slot.pactMagic);
  const pactUsed = pactSlot
    ? Math.min(doc.session.spellSlots[slotUsageKey(pactSlot)]?.used ?? 0, pactSlot.total)
    : 0;
  const warlockLevel = classEntryLevel(doc.character, "warlock");
  const eldritchMaster = classFeatureIndex.get("warlock-eldritch-master");
  return {
    classLevel,
    trackerRemaining: remaining,
    trackerDeficit: deficit,
    slotsExpended: slotUsed,
    slotsAvailable: (level) => {
      const slot = normalSlot(doc, level);
      return slot ? Math.max(0, slot.total - slotUsed(level)) : 0;
    },
    ...(entry.produces === "pact-slot" && pactSlot
      ? {
          pactPool: {
            level: pactSlot.level,
            max: pactSlot.total,
            expended: pactUsed,
            restoresAll: eldritchMaster != null && warlockLevel >= eldritchMaster.level,
          },
        }
      : {}),
  };
}

/** Build every conversion choice that is legal against the supplied live facts. */
export function conversionOptionVMs(
  entry: ResourceConversionEntry,
  ctx: ConversionCtx
): ConversionOptionVM[] {
  const out: ConversionOptionVM[] = [];
  if (!nonNegativeSafeInteger(ctx.classLevel)) return out;
  switch (entry.produces) {
    case "spell-slot": {
      if (!entry.fromTracker) break;
      const budget = ctx.trackerRemaining(entry.fromTracker);
      if (!nonNegativeSafeInteger(budget)) break;
      if (entry.costTable) {
        for (const row of entry.costTable) {
          if (
            !positiveSafeInteger(row.slotLevel) ||
            !positiveSafeInteger(row.cost) ||
            !nonNegativeSafeInteger(row.minLevel) ||
            row.minLevel > ctx.classLevel ||
            (entry.maxSlotLevel != null &&
              (!positiveSafeInteger(entry.maxSlotLevel) ||
                row.slotLevel > entry.maxSlotLevel)) ||
            row.cost > budget ||
            !positiveSafeInteger(ctx.slotsExpended(row.slotLevel))
          ) {
            continue;
          }
          out.push({
            kind: "create-slot",
            choice: { producedSlotLevel: row.slotLevel },
            selection: {
              kind: "create-slot",
              via: "cost-table",
              slotLevel: row.slotLevel,
            },
            producedSlotLevel: row.slotLevel,
            costUnits: row.cost,
          });
        }
      } else if (positiveSafeInteger(entry.perUnitSlotLevels)) {
        const seen = new Set<number>();
        for (let units = 1; units <= budget; units++) {
          const raw = units * entry.perUnitSlotLevels;
          if (!positiveSafeInteger(raw)) break;
          const level =
            entry.maxSlotLevel != null ? Math.min(raw, entry.maxSlotLevel) : raw;
          if (!positiveSafeInteger(level) || seen.has(level)) continue;
          if (entry.maxSlotLevel != null && raw > entry.maxSlotLevel) break;
          seen.add(level);
          if (ctx.slotsExpended(level) < 1) continue;
          out.push({
            kind: "create-slot",
            choice: { unitsSpent: units },
            selection: { kind: "create-slot", via: "tracker-units", units },
            producedSlotLevel: level,
            costUnits: units,
          });
        }
      }
      break;
    }
    case "sorcery-points": {
      if (!entry.toTracker) break;
      const deficit = ctx.trackerDeficit(entry.toTracker);
      if (!nonNegativeSafeInteger(deficit)) break;
      for (let level = 1; level <= 9; level++) {
        const available = ctx.slotsAvailable(level);
        if (!positiveSafeInteger(available) || level > deficit) continue;
        out.push({
          kind: "slot-to-points",
          choice: { slotLevel: level },
          selection: { kind: "slot-to-points", slotLevel: level },
          slotLevelSpent: level,
          pointsGained: level,
        });
      }
      break;
    }
    case "pact-slot": {
      const pool = ctx.pactPool;
      if (
        !pool ||
        !entry.fromTracker ||
        !positiveSafeInteger(pool.level) ||
        !positiveSafeInteger(pool.max) ||
        !nonNegativeSafeInteger(pool.expended) ||
        !positiveSafeInteger(ctx.trackerRemaining(entry.fromTracker)) ||
        pool.expended < 1
      ) {
        break;
      }
      const amount = Math.min(
        pool.restoresAll ? pool.max : Math.ceil(pool.max / 2),
        pool.expended
      );
      if (!positiveSafeInteger(amount)) break;
      out.push({
        kind: "restore-pact",
        choice: { pactSlotLevel: pool.level, pactRestoreAmount: amount },
        selection: { kind: "restore-pact", slotLevel: pool.level, amount },
        pactRestored: amount,
      });
      break;
    }
  }
  return out;
}

function sameSelection(
  left: ResourceConversionSelection,
  right: ResourceConversionSelection
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "slot-to-points" && right.kind === "slot-to-points") {
    return left.slotLevel === right.slotLevel;
  }
  if (left.kind === "restore-pact" && right.kind === "restore-pact") {
    return left.slotLevel === right.slotLevel && left.amount === right.amount;
  }
  if (left.kind === "create-slot" && right.kind === "create-slot") {
    if (left.via !== right.via) return false;
    return left.via === "cost-table" && right.via === "cost-table"
      ? left.slotLevel === right.slotLevel
      : left.via === "tracker-units" &&
          right.via === "tracker-units" &&
          left.units === right.units;
  }
  return false;
}

function ownerAddress(op: CommitOp): ResourceOwnerAddress | undefined {
  switch (op.op) {
    case "spend-spell-slot":
    case "gain-spell-slot":
      return { kind: "spell-slot", level: op.level, pactMagic: !!op.pactMagic };
    case "spend-tracker":
    case "gain-tracker":
      return { kind: "tracker", trackerId: op.trackerId };
    default:
      return undefined;
  }
}

function opDelta(op: CommitOp): number | undefined {
  switch (op.op) {
    case "spend-spell-slot":
      return 1;
    case "gain-spell-slot":
      return -1;
    case "spend-tracker":
      return op.amount;
    case "gain-tracker":
      return -op.amount;
    default:
      return undefined;
  }
}

type ResolvedOwner = { total: number; used: number };

function resolveOwner(
  character: CharacterDoc,
  address: ResourceOwnerAddress
): { status: "resolved"; owner: ResolvedOwner } | { status: "missing" | "invalid" } {
  if (address.kind === "spell-slot") {
    if (!positiveSafeInteger(address.level)) return { status: "invalid" };
    const owners = character.character.spellSlots.filter(
      (slot) => slot.level === address.level && !!slot.pactMagic === address.pactMagic
    );
    if (owners.length !== 1) return { status: "missing" };
    const owner = owners[0];
    if (!owner || !positiveSafeInteger(owner.total)) return { status: "invalid" };
    const used = character.session.spellSlots[slotUsageKey(owner)]?.used ?? 0;
    return nonNegativeSafeInteger(used) && used <= owner.total
      ? { status: "resolved", owner: { total: owner.total, used } }
      : { status: "invalid" };
  }
  if (!nonEmpty(address.trackerId)) return { status: "invalid" };
  const owners = resolveTrackers(character).filter(
    (tracker) => tracker.id === address.trackerId
  );
  if (owners.length !== 1) return { status: "missing" };
  const owner = owners[0];
  if (!owner || !positiveSafeInteger(owner.total)) return { status: "invalid" };
  const used = character.session.trackers[address.trackerId]?.used ?? 0;
  return nonNegativeSafeInteger(used) && used <= owner.total
    ? { status: "resolved", owner: { total: owner.total, used } }
    : { status: "invalid" };
}

/** Plan a chosen conversion against the character's current grants and resources. */
export function prepareMechanicsCommand(
  character: CharacterDoc,
  command: MechanicsCommand
): MechanicsPreparation {
  if (!commandIsValid(command)) return { status: "rejected", reason: "invalid-command" };
  if (character.id !== command.characterId) {
    return { status: "rejected", reason: "character-mismatch" };
  }
  const matches = aggregateCharacterGrants(
    character.character,
    character.session
  ).resourceConversions.filter(
    (entry) =>
      entry.sourceId === command.sourceId && entry.conversionId === command.conversionId
  );
  if (matches.length !== 1) {
    return { status: "rejected", reason: "source-unavailable" };
  }
  const entry = matches[0];
  if (!entry) return { status: "rejected", reason: "source-unavailable" };
  const option = conversionOptionVMs(entry, buildConversionCtx(character, entry)).find(
    (candidate) => sameSelection(candidate.selection, command.selection)
  );
  if (!option) return { status: "rejected", reason: "choice-unavailable" };

  const deltas = new Map<string, { address: ResourceOwnerAddress; delta: number }>();
  for (const op of planResourceConversion(entry, option.choice)) {
    const address = ownerAddress(op);
    const delta = opDelta(op);
    if (!address || delta === undefined || !Number.isSafeInteger(delta)) {
      return { status: "rejected", reason: "invalid-command" };
    }
    const key = addressKey(address);
    const current = deltas.get(key);
    deltas.set(key, { address, delta: (current?.delta ?? 0) + delta });
  }
  if (deltas.size === 0 || [...deltas.values()].some(({ delta }) => delta === 0)) {
    return { status: "rejected", reason: "invalid-command" };
  }

  const ownerOperations: MechanicsOwnerOperation[] = [];
  for (const { address, delta } of deltas.values()) {
    const resolved = resolveOwner(character, address);
    if (resolved.status === "missing") {
      return { status: "rejected", reason: "resource-unavailable" };
    }
    if (resolved.status !== "resolved") {
      return { status: "rejected", reason: "invalid-resource-state" };
    }
    const nextUsed = resolved.owner.used + delta;
    if (!nonNegativeSafeInteger(nextUsed) || nextUsed > resolved.owner.total) {
      return { status: "rejected", reason: "resource-unavailable" };
    }
    ownerOperations.push({
      address,
      expectedTotal: resolved.owner.total,
      expectedUsed: resolved.owner.used,
      nextUsed,
    });
  }
  return {
    status: "planned",
    plan: {
      kind: "resource-conversion",
      direction: "forward",
      command: structuredClone(command),
      ownerOperations,
    },
  };
}

/** Build the exact compare-and-swap inverse of a committed receipt. */
export function planMechanicsRevert(receipt: MechanicsReceipt): MechanicsPlan {
  return {
    kind: "resource-conversion",
    direction: "reverse",
    command: structuredClone(receipt.command),
    ownerOperations: receipt.changes.map((change) => ({
      address: structuredClone(change.address),
      expectedTotal: change.total,
      expectedUsed: change.afterUsed,
      nextUsed: change.beforeUsed,
    })),
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([candidate]) => candidate !== key)
  );
}

function writeTracker(
  trackers: Record<string, TrackerState>,
  trackerId: string,
  used: number
): Record<string, TrackerState> {
  const previous = trackers[trackerId];
  if (used === 0 && (!previous?.rolls || previous.rolls.length === 0)) {
    return omitKey(trackers, trackerId);
  }
  return { ...trackers, [trackerId]: { ...previous, used } };
}

/** Validate and reduce every plan leg as one pure all-or-nothing transition. */
export function applyMechanicsPlanToCharacter(
  character: CharacterDoc,
  plan: unknown
): MechanicsApplyResult {
  if (!planHeaderIsValid(plan)) {
    return { status: "rejected", reason: "invalid-plan" };
  }
  if (character.id !== plan.command.characterId) {
    return { status: "rejected", reason: "character-mismatch" };
  }
  if (plan.direction === "forward") {
    const fresh = prepareMechanicsCommand(character, plan.command);
    if (fresh.status === "rejected") {
      return {
        status: "rejected",
        reason:
          fresh.reason === "source-unavailable"
            ? "source-unavailable"
            : fresh.reason === "character-mismatch"
              ? "character-mismatch"
              : fresh.reason === "resource-unavailable"
                ? "owner-missing"
                : "stale-plan",
      };
    }
    const canonical = fresh.plan.ownerOperations;
    if (
      canonical.length !== plan.ownerOperations.length ||
      canonical.some((operation, index) => {
        const supplied = plan.ownerOperations[index];
        return (
          !supplied ||
          !sameAddressValue(operation.address, supplied.address) ||
          operation.expectedTotal !== supplied.expectedTotal ||
          operation.expectedUsed !== supplied.expectedUsed ||
          operation.nextUsed !== supplied.nextUsed
        );
      })
    ) {
      return { status: "rejected", reason: "stale-plan" };
    }
  }

  const seen = new Set<string>();
  for (const operation of plan.ownerOperations) {
    if (!isRecord(operation) || !addressIsValid(operation.address)) {
      return { status: "rejected", reason: "invalid-plan" };
    }
    const key = addressKey(operation.address);
    if (
      seen.has(key) ||
      !positiveSafeInteger(operation.expectedTotal) ||
      !nonNegativeSafeInteger(operation.expectedUsed) ||
      !nonNegativeSafeInteger(operation.nextUsed) ||
      operation.expectedUsed > operation.expectedTotal ||
      operation.nextUsed > operation.expectedTotal ||
      operation.expectedUsed === operation.nextUsed
    ) {
      return { status: "rejected", reason: "invalid-plan" };
    }
    seen.add(key);
    let resolved = resolveOwner(character, operation.address);
    if (
      resolved.status === "missing" &&
      plan.direction === "reverse" &&
      operation.address.kind === "tracker"
    ) {
      const used = character.session.trackers[operation.address.trackerId]?.used ?? 0;
      if (nonNegativeSafeInteger(used) && used <= operation.expectedTotal) {
        resolved = {
          status: "resolved",
          owner: { total: operation.expectedTotal, used },
        };
      }
    }
    if (resolved.status === "missing") {
      return { status: "rejected", reason: "owner-missing" };
    }
    if (
      resolved.status !== "resolved" ||
      resolved.owner.total !== operation.expectedTotal
    ) {
      return { status: "rejected", reason: "invalid-plan" };
    }
    if (resolved.owner.used !== operation.expectedUsed) {
      return { status: "rejected", reason: "stale-plan" };
    }
  }

  let spellSlots = character.session.spellSlots;
  let trackers = character.session.trackers;
  for (const operation of plan.ownerOperations) {
    if (operation.address.kind === "spell-slot") {
      const key = slotUsageKey(operation.address);
      spellSlots =
        operation.nextUsed === 0
          ? omitKey(spellSlots, key)
          : { ...spellSlots, [key]: { used: operation.nextUsed } };
    } else {
      trackers = writeTracker(trackers, operation.address.trackerId, operation.nextUsed);
    }
  }
  const receipt: MechanicsReceipt = {
    command: structuredClone(plan.command),
    changes: plan.ownerOperations.map((operation) => ({
      address: structuredClone(operation.address),
      total: operation.expectedTotal,
      beforeUsed: operation.expectedUsed,
      afterUsed: operation.nextUsed,
    })),
  };
  return {
    status: "applied",
    character: {
      ...character,
      session: { ...character.session, spellSlots, trackers },
    },
    receipt,
  };
}

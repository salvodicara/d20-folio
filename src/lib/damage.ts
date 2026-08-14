/** Pure resolution of concrete damage packets. No HP, concentration, RNG, time, or I/O. */

import { canonicalJson } from "@/lib/canonical-fingerprint";
import { exactConformer, type ExactSchemaContext } from "@/lib/exact-schema";
import { conformEntityRef } from "@/lib/mechanics-reference-schema";
import {
  DAMAGE_ALLOCATION_OBSERVATIONS_SCHEMA,
  DAMAGE_ALLOCATION_REQUIREMENT_SCHEMA,
  DAMAGE_COMPUTATION_SCHEMA,
  DAMAGE_DEFENSE_PROFILE_SCHEMA,
  DAMAGE_DEFENSE_RULE_SCHEMA,
  DAMAGE_DELIVERIES,
  DAMAGE_PACKET_SCHEMA,
  DAMAGE_RESOLUTION_SCHEMA,
  DAMAGE_TABLE_OVERRIDE_SCHEMA,
  DAMAGE_TRAITS,
  DAMAGE_TYPES,
  type DamageAllocationObservation,
  type DamageAllocationObservations,
  type DamageAllocationRequirement,
  type DamageComputation,
  type DamageDefenseProfile,
  type DamageDefenseRule,
  type DamageDefenseSelector,
  type DamagePacket,
  type DamageResolution,
  type DamageResolutionAttempt,
  type DamageRuleApplication,
  type DamageSchemaCustomTypes,
  type DamageTableOverride,
  type DamageType,
} from "@/types/damage";
import type { EntityRef } from "@/types/mechanics-reference";

export type {
  DamageAllocationObservation,
  DamageAllocationObservations,
  DamageAllocationRequirement,
  DamageComputation,
  DamageDefenseProfile,
  DamageDefenseRule,
  DamageDefenseSelector,
  DamageDelivery,
  DamagePacket,
  DamagePart,
  DamagePartResolution,
  DamageResolution,
  DamageResolutionAttempt,
  DamageRuleApplication,
  DamageTableOverride,
  DamageTrait,
  DamageType,
} from "@/types/damage";

const MAX_ID_LENGTH = 128;
const MAX_PARTS = 64;
const MAX_RULES = 128;
const MAX_DAMAGE_AMOUNT = 1_000_000_000;
const MAX_TOTAL_DAMAGE = 1_000_000_000_000;
const UNSAFE_IDS = new Set(["__proto__", "constructor", "prototype"]);

function identifier(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_IDS.has(value)
    ? value
    : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) &&
    !Object.is(value, -0) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
    ? (value as number)
    : null;
}

const DAMAGE_SCHEMA_CONTEXT: ExactSchemaContext<
  DamageSchemaCustomTypes,
  Record<never, never>
> = {
  customs: {
    "damage-amount": (value) => boundedInteger(value, 1, MAX_DAMAGE_AMOUNT),
    "entity-ref": (value): EntityRef | null => conformEntityRef(value),
    "flat-adjustment": (value) =>
      boundedInteger(value, -MAX_DAMAGE_AMOUNT, MAX_DAMAGE_AMOUNT),
    id: identifier,
    "positive-threshold": (value) => boundedInteger(value, 1, MAX_DAMAGE_AMOUNT),
    "signed-total": (value) => boundedInteger(value, -MAX_TOTAL_DAMAGE, MAX_TOTAL_DAMAGE),
    "total-damage": (value) => boundedInteger(value, 0, MAX_TOTAL_DAMAGE),
  },
  refs: {},
};

const conformPacketStructure = exactConformer(
  DAMAGE_PACKET_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformDefenseProfileStructure = exactConformer(
  DAMAGE_DEFENSE_PROFILE_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformDefenseRuleStructure = exactConformer(
  DAMAGE_DEFENSE_RULE_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformAllocationsStructure = exactConformer(
  DAMAGE_ALLOCATION_OBSERVATIONS_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformOverrideStructure = exactConformer(
  DAMAGE_TABLE_OVERRIDE_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformComputationStructure = exactConformer(
  DAMAGE_COMPUTATION_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformResolutionStructure = exactConformer(
  DAMAGE_RESOLUTION_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);
const conformRequirementStructure = exactConformer(
  DAMAGE_ALLOCATION_REQUIREMENT_SCHEMA,
  DAMAGE_SCHEMA_CONTEXT
);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function canonicalSubset<Value extends string>(
  values: readonly Value[],
  order: readonly Value[]
): boolean {
  let previous = -1;
  for (const value of values) {
    const index = order.indexOf(value);
    if (index <= previous) return false;
    previous = index;
  }
  return true;
}

/** Exact concrete-packet boundary with bounded, stable identities. */
export function conformDamagePacket(value: unknown): Readonly<DamagePacket> | null {
  const packet = conformPacketStructure(value);
  return packet &&
    packet.parts.length <= MAX_PARTS &&
    unique(packet.parts.map((part) => part.partId)) &&
    canonicalSubset(packet.traits, DAMAGE_TRAITS)
    ? packet
    : null;
}

function validSelector(selector: DamageDefenseSelector): boolean {
  return (
    canonicalSubset(selector.damageTypes, DAMAGE_TYPES) &&
    canonicalSubset(selector.deliveries, DAMAGE_DELIVERIES) &&
    canonicalSubset(selector.requiredTraits, DAMAGE_TRAITS) &&
    canonicalSubset(selector.forbiddenTraits, DAMAGE_TRAITS) &&
    selector.requiredTraits.every((trait) => !selector.forbiddenTraits.includes(trait))
  );
}

/** Exact standalone defense rule shared by grants, occurrences, and profiles. */
export function conformDamageDefenseRule(
  value: unknown
): Readonly<DamageDefenseRule> | null {
  const rule = conformDefenseRuleStructure(value);
  return rule &&
    validSelector(rule.selector) &&
    (rule.kind !== "flat-adjustment" || rule.amount !== 0)
    ? rule
    : null;
}

/** Exact ordered target-defense boundary. Rule order is preserved, never sorted. */
export function conformDamageDefenseProfile(
  value: unknown
): Readonly<DamageDefenseProfile> | null {
  const profile = conformDefenseProfileStructure(value);
  return profile &&
    profile.rules.length <= MAX_RULES &&
    unique(profile.rules.map((rule) => rule.sourceId)) &&
    profile.rules.every((rule) => conformDamageDefenseRule(rule) !== null)
    ? profile
    : null;
}

/** Exact allocation-observation boundary; packet/rule semantics are checked on resolution. */
export function conformDamageAllocationObservations(
  value: unknown
): Readonly<DamageAllocationObservations> | null {
  const observations = conformAllocationsStructure(value);
  return observations &&
    observations.length <= MAX_RULES &&
    unique(observations.map((observation) => observation.sourceId)) &&
    observations.every((observation) =>
      unique(observation.parts.map((part) => part.partId))
    )
    ? observations
    : null;
}

/** Exact table-override observation. It never replaces or mutates computed evidence. */
export function conformDamageTableOverride(
  value: unknown
): Readonly<DamageTableOverride> | null {
  return conformOverrideStructure(value);
}

function matchesSelector(
  selector: DamageDefenseSelector,
  packet: DamagePacket,
  damageType: DamageType
): boolean {
  return (
    (selector.damageTypes.length === 0 || selector.damageTypes.includes(damageType)) &&
    (selector.deliveries.length === 0 || selector.deliveries.includes(packet.delivery)) &&
    selector.requiredTraits.every((trait) => packet.traits.includes(trait)) &&
    selector.forbiddenTraits.every((trait) => !packet.traits.includes(trait))
  );
}

function safeAdd(left: number, right: number): number | null {
  const result = left + right;
  return Number.isSafeInteger(result) && result <= MAX_TOTAL_DAMAGE ? result : null;
}

function total(values: readonly number[]): number | null {
  let result = 0;
  for (const value of values) {
    const next = safeAdd(result, value);
    if (next === null) return null;
    result = next;
  }
  return result;
}

function requiredAt<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) throw new Error("validated packet indexes are complete");
  return value;
}

function canonicalAllocation(
  amounts: readonly number[],
  candidates: readonly number[],
  magnitude: number,
  increase: boolean
): ReadonlyMap<number, number> {
  const allocations = new Map<number, number>();
  let remaining = magnitude;
  for (const index of candidates) {
    const amount = increase ? remaining : Math.min(remaining, requiredAt(amounts, index));
    if (amount > 0) allocations.set(index, amount);
    remaining -= amount;
    if (remaining === 0) break;
  }
  return allocations;
}

type DefenseSignature = "immune" | "identity" | "double" | "half" | "half-double";

function defenseSignature(
  packet: DamagePacket,
  profile: DamageDefenseProfile,
  partIndex: number
): DefenseSignature {
  const part = packet.parts[partIndex];
  if (!part) throw new Error("part index must come from the packet");
  const matching = (kind: DamageDefenseRule["kind"]) =>
    profile.rules.some(
      (rule) =>
        rule.kind === kind && matchesSelector(rule.selector, packet, part.damageType)
    );
  if (matching("immunity")) return "immune";
  if (matching("resistance")) {
    return matching("vulnerability") ? "half-double" : "half";
  }
  return matching("vulnerability") ? "double" : "identity";
}

function applyDefenseSignature(signature: DefenseSignature, value: number): number {
  switch (signature) {
    case "immune":
      return 0;
    case "identity":
      return value;
    case "double":
      return value * 2;
    case "half":
      return Math.floor(value / 2);
    case "half-double":
      return Math.floor(value / 2) * 2;
  }
}

function allocationInvariant(
  packet: DamagePacket,
  profile: DamageDefenseProfile,
  amounts: readonly number[],
  candidates: readonly number[],
  magnitude: number,
  increase: boolean,
  flatRuleCount: number
): boolean {
  if (candidates.length <= 1) return true;
  if (
    !increase &&
    magnitude === total(candidates.map((index) => requiredAt(amounts, index)))
  ) {
    return true;
  }
  if (flatRuleCount !== 1) return false;
  const signatures = candidates.map((index) => defenseSignature(packet, profile, index));
  if (profile.damageThreshold !== null) {
    const candidateSet = new Set(candidates);
    const maximumResolved = total(
      packet.parts.map((_, index) => {
        const amount = requiredAt(amounts, index);
        const maximumAmount =
          increase && candidateSet.has(index) ? amount + magnitude : amount;
        return applyDefenseSignature(
          defenseSignature(packet, profile, index),
          maximumAmount
        );
      })
    );
    if (maximumResolved !== null && maximumResolved < profile.damageThreshold) {
      return true;
    }
  }
  if (
    signatures.every(
      (signature) =>
        signature === signatures[0] && signature !== "half" && signature !== "half-double"
    )
  ) {
    return true;
  }
  if (magnitude !== 1) return false;
  const deltas = candidates.map((index, position) => {
    const amount = requiredAt(amounts, index);
    const signature = signatures[position];
    if (!signature) throw new Error("candidate signatures are complete");
    return increase
      ? applyDefenseSignature(signature, amount + 1) -
          applyDefenseSignature(signature, amount)
      : applyDefenseSignature(signature, amount) -
          applyDefenseSignature(signature, amount - 1);
  });
  return deltas.every((delta) => delta === deltas[0]);
}

function validComputation(computation: DamageComputation): boolean {
  if (
    computation.parts.length > MAX_PARTS ||
    !unique(computation.parts.map((part) => part.partId))
  ) {
    return false;
  }

  for (const part of computation.parts) {
    let amount = part.rawAmount;
    let phase = 0;
    let immune = false;
    let resisted = false;
    let vulnerable = false;
    if (!unique(part.ruleApplications.map((application) => application.sourceId))) {
      return false;
    }
    for (const application of part.ruleApplications) {
      if (application.before !== amount) return false;
      switch (application.kind) {
        case "flat-adjustment": {
          if (
            phase !== 0 ||
            application.requestedAmount === 0 ||
            Math.abs(application.allocatedAmount) >
              Math.abs(application.requestedAmount) ||
            (application.allocatedAmount !== 0 &&
              Math.sign(application.allocatedAmount) !==
                Math.sign(application.requestedAmount)) ||
            application.after !==
              Math.max(0, application.before + application.allocatedAmount)
          ) {
            return false;
          }
          break;
        }
        case "immunity": {
          if (phase > 1) return false;
          phase = 1;
          if (
            application.applied !== !immune ||
            application.after !== (application.applied ? 0 : application.before)
          ) {
            return false;
          }
          immune ||= application.applied;
          break;
        }
        case "resistance": {
          if (phase > 2) return false;
          phase = 2;
          const shouldApply: boolean = !immune && !resisted;
          if (
            application.applied !== shouldApply ||
            application.after !==
              (application.applied
                ? Math.floor(application.before / 2)
                : application.before)
          ) {
            return false;
          }
          resisted ||= application.applied;
          break;
        }
        case "vulnerability": {
          phase = 3;
          const shouldApply: boolean = !immune && !vulnerable;
          if (
            application.applied !== shouldApply ||
            application.after !==
              (application.applied ? application.before * 2 : application.before)
          ) {
            return false;
          }
          vulnerable ||= application.applied;
          break;
        }
      }
      amount = application.after;
    }

    const firstBinary = part.ruleApplications.findIndex(
      (application) => application.kind !== "flat-adjustment"
    );
    const adjustedAmount =
      firstBinary < 0 ? amount : requiredAt(part.ruleApplications, firstBinary).before;
    if (
      part.adjustedAmount !== adjustedAmount ||
      part.resolvedAmount !== amount ||
      (part.netAmount !== 0 && part.netAmount !== part.resolvedAmount)
    ) {
      return false;
    }
  }

  const rawTotal = total(computation.parts.map((part) => part.rawAmount));
  const adjustedTotal = total(computation.parts.map((part) => part.adjustedAmount));
  const resolvedTotal = total(computation.parts.map((part) => part.resolvedAmount));
  const thresholdShouldApply =
    computation.damageThreshold !== null &&
    computation.resolvedTotal > 0 &&
    computation.resolvedTotal < computation.damageThreshold;
  return (
    rawTotal === computation.rawTotal &&
    adjustedTotal === computation.adjustedTotal &&
    resolvedTotal === computation.resolvedTotal &&
    computation.thresholdApplied === thresholdShouldApply &&
    computation.netTotal ===
      (computation.thresholdApplied ? 0 : computation.resolvedTotal) &&
    computation.parts.every(
      (part) =>
        part.netAmount === (computation.thresholdApplied ? 0 : part.resolvedAmount)
    )
  );
}

function packetMatchesComputation(
  packet: DamagePacket,
  computation: DamageComputation
): boolean {
  return (
    computation.packetId === packet.packetId &&
    canonicalJson(computation.target) === canonicalJson(packet.target) &&
    computation.parts.length === packet.parts.length &&
    packet.parts.every((part, index) => {
      const computed = computation.parts[index];
      return (
        computed?.partId === part.partId &&
        computed.damageType === part.damageType &&
        computed.rawAmount === part.amount
      );
    })
  );
}

/** Exact persisted-computation boundary, including every arithmetic invariant. */
export function conformDamageComputation(
  value: unknown
): Readonly<DamageComputation> | null {
  const computation = conformComputationStructure(value);
  return computation && validComputation(computation) ? computation : null;
}

/** Exact persisted-resolution boundary; an effective computed total cannot drift. */
export function conformDamageResolution(
  value: unknown
): Readonly<DamageResolution> | null {
  const resolution = conformResolutionStructure(value);
  return resolution &&
    conformDamagePacket(resolution.packet) !== null &&
    validComputation(resolution.computed) &&
    packetMatchesComputation(resolution.packet, resolution.computed) &&
    (resolution.effective.kind === "computed"
      ? resolution.effective.amount === resolution.computed.netTotal
      : resolution.effective.amount !== resolution.computed.netTotal)
    ? resolution
    : null;
}

function explicitAllocation(
  observation: DamageAllocationObservation,
  packet: DamagePacket,
  candidates: readonly number[],
  amounts: readonly number[],
  magnitude: number,
  increase: boolean
): ReadonlyMap<number, number> | null {
  const partIndexes = new Map(
    packet.parts.map((part, index) => [part.partId, index] as const)
  );
  const candidateSet = new Set(candidates);
  const allocations = new Map<number, number>();
  let previousIndex = -1;
  let allocated = 0;
  for (const part of observation.parts) {
    const index = partIndexes.get(part.partId);
    if (
      index === undefined ||
      index <= previousIndex ||
      !candidateSet.has(index) ||
      (!increase && part.amount > requiredAt(amounts, index))
    ) {
      return null;
    }
    previousIndex = index;
    allocations.set(index, part.amount);
    const next = safeAdd(allocated, part.amount);
    if (next === null) return null;
    allocated = next;
  }
  return allocated === magnitude ? allocations : null;
}

function reviewRequirement(
  packet: DamagePacket,
  sourceId: string,
  candidates: readonly number[],
  amounts: readonly number[],
  magnitude: number,
  increase: boolean
): Readonly<DamageAllocationRequirement> {
  const requirement = conformRequirementStructure({
    amount: magnitude,
    operation: increase ? "increase" : "reduction",
    packetId: packet.packetId,
    parts: candidates.map((index) => ({
      maximumAmount: increase ? null : amounts[index],
      partId: requiredAt(packet.parts, index).partId,
    })),
    sourceId,
  });
  if (!requirement) throw new Error("constructed allocation requirement must conform");
  return requirement;
}

function matchingRuleIndexes(
  packet: DamagePacket,
  rule: DamageDefenseRule
): readonly number[] {
  return packet.parts.flatMap((part, index) =>
    matchesSelector(rule.selector, packet, part.damageType) ? [index] : []
  );
}

function applyFlatAdjustments(
  packet: DamagePacket,
  profile: DamageDefenseProfile,
  observations: DamageAllocationObservations
):
  | {
      readonly kind: "applied";
      readonly amounts: readonly number[];
      readonly applications: readonly (readonly DamageRuleApplication[])[];
    }
  | { readonly kind: "invalid" }
  | {
      readonly kind: "review-required";
      readonly requirement: Readonly<DamageAllocationRequirement>;
    } {
  const amounts = packet.parts.map((part) => part.amount);
  const applications: DamageRuleApplication[][] = packet.parts.map(() => []);
  const observationsBySource = new Map(
    observations.map((observation) => [observation.sourceId, observation] as const)
  );
  const flatRules = profile.rules.filter(
    (rule): rule is Extract<DamageDefenseRule, { readonly kind: "flat-adjustment" }> =>
      rule.kind === "flat-adjustment"
  );
  const observedOrder = observations.map((observation) => observation.sourceId);
  const expectedObservedOrder = flatRules
    .map((rule) => rule.sourceId)
    .filter((sourceId) => observationsBySource.has(sourceId));
  if (
    observedOrder.some((sourceId, index) => sourceId !== expectedObservedOrder[index])
  ) {
    return { kind: "invalid" };
  }

  const usedObservations = new Set<string>();
  for (const rule of flatRules) {
    const matching = matchingRuleIndexes(packet, rule);
    const increase = rule.amount > 0;
    const candidates = increase
      ? matching
      : matching.filter((index) => requiredAt(amounts, index) > 0);
    const available = total(candidates.map((index) => requiredAt(amounts, index)));
    if (available === null) return { kind: "invalid" };
    const magnitude = increase ? rule.amount : Math.min(-rule.amount, available);
    const observation = observationsBySource.get(rule.sourceId);
    let allocation: ReadonlyMap<number, number>;

    if (observation) {
      if (candidates.length <= 1 || magnitude === 0) return { kind: "invalid" };
      const explicit = explicitAllocation(
        observation,
        packet,
        candidates,
        amounts,
        magnitude,
        increase
      );
      if (!explicit) return { kind: "invalid" };
      allocation = explicit;
      usedObservations.add(rule.sourceId);
    } else if (
      allocationInvariant(
        packet,
        profile,
        amounts,
        candidates,
        magnitude,
        increase,
        flatRules.length
      )
    ) {
      allocation = canonicalAllocation(amounts, candidates, magnitude, increase);
    } else {
      return {
        kind: "review-required",
        requirement: reviewRequirement(
          packet,
          rule.sourceId,
          candidates,
          amounts,
          magnitude,
          increase
        ),
      };
    }

    for (const index of matching) {
      const before = amounts[index];
      if (before === undefined) return { kind: "invalid" };
      const allocated = allocation.get(index);
      const magnitudeForPart = allocated === undefined ? 0 : allocated;
      const allocatedAmount =
        magnitudeForPart === 0 ? 0 : increase ? magnitudeForPart : -magnitudeForPart;
      const after = Math.max(0, before + allocatedAmount);
      if (!Number.isSafeInteger(after) || after > MAX_TOTAL_DAMAGE) {
        return { kind: "invalid" };
      }
      amounts[index] = after;
      requiredAt(applications, index).push({
        after,
        allocatedAmount,
        before,
        kind: "flat-adjustment",
        requestedAmount: rule.amount,
        sourceId: rule.sourceId,
      });
    }
  }
  return usedObservations.size === observations.length
    ? { amounts, applications, kind: "applied" }
    : { kind: "invalid" };
}

function applyBinaryDefenses(
  packet: DamagePacket,
  profile: DamageDefenseProfile,
  adjustedAmounts: readonly number[],
  applications: readonly (readonly DamageRuleApplication[])[]
): readonly {
  readonly adjustedAmount: number;
  readonly damageType: DamageType;
  readonly netAmount: number;
  readonly partId: string;
  readonly rawAmount: number;
  readonly resolvedAmount: number;
  readonly ruleApplications: readonly DamageRuleApplication[];
}[] {
  const groups = ["immunity", "resistance", "vulnerability"] as const;
  return packet.parts.map((part, index) => {
    const adjustedAmount = adjustedAmounts[index];
    if (adjustedAmount === undefined) throw new Error("adjusted packet is complete");
    let amount = adjustedAmount;
    let immune = false;
    let resisted = false;
    let vulnerable = false;
    const trace = [...requiredAt(applications, index)];

    for (const kind of groups) {
      const rules = profile.rules.filter(
        (rule) =>
          rule.kind === kind && matchesSelector(rule.selector, packet, part.damageType)
      );
      for (const rule of rules) {
        const before = amount;
        const applied =
          kind === "immunity"
            ? !immune
            : kind === "resistance"
              ? !immune && !resisted
              : !immune && !vulnerable;
        if (applied) {
          if (kind === "immunity") {
            amount = 0;
            immune = true;
          } else if (kind === "resistance") {
            amount = Math.floor(amount / 2);
            resisted = true;
          } else {
            amount *= 2;
            vulnerable = true;
          }
        }
        trace.push({
          after: amount,
          applied,
          before,
          kind,
          sourceId: rule.sourceId,
        });
      }
    }

    return {
      adjustedAmount,
      damageType: part.damageType,
      netAmount: amount,
      partId: part.partId,
      rawAmount: part.amount,
      resolvedAmount: amount,
      ruleApplications: trace,
    };
  });
}

/**
 * Resolve one concrete packet. Missing consequential allocation is a reviewed input,
 * malformed or contradictory evidence is rejected with `null`.
 */
export function resolveDamage(
  packetValue: unknown,
  profileValue: unknown,
  allocationValue: unknown
): Readonly<DamageResolutionAttempt> | null {
  const packet = conformDamagePacket(packetValue);
  const profile = conformDamageDefenseProfile(profileValue);
  const observations = conformDamageAllocationObservations(allocationValue);
  if (!packet || !profile || !observations) return null;

  const flat = applyFlatAdjustments(packet, profile, observations);
  if (flat.kind === "invalid") return null;
  if (flat.kind === "review-required") {
    return Object.freeze({ kind: "review-required", requirement: flat.requirement });
  }

  const parts = applyBinaryDefenses(packet, profile, flat.amounts, flat.applications);
  const rawTotal = total(parts.map((part) => part.rawAmount));
  const adjustedTotal = total(parts.map((part) => part.adjustedAmount));
  const resolvedTotal = total(parts.map((part) => part.resolvedAmount));
  if (rawTotal === null || adjustedTotal === null || resolvedTotal === null) return null;

  const thresholdApplied =
    profile.damageThreshold !== null &&
    resolvedTotal > 0 &&
    resolvedTotal < profile.damageThreshold;
  const netTotal = thresholdApplied ? 0 : resolvedTotal;
  const computation = conformComputationStructure({
    adjustedTotal,
    damageThreshold: profile.damageThreshold,
    netTotal,
    packetId: packet.packetId,
    parts: parts.map((part) => ({
      ...part,
      netAmount: thresholdApplied ? 0 : part.resolvedAmount,
    })),
    rawTotal,
    resolvedTotal,
    target: packet.target,
    thresholdApplied,
  });
  if (!computation) return null;
  const resolution = conformDamageResolution({
    computed: computation,
    effective: { amount: computation.netTotal, kind: "computed" },
    packet,
  });
  return resolution ? Object.freeze({ kind: "resolved", resolution }) : null;
}

/** Set or clear the explicit table net-total override without discarding computation. */
export function withDamageTableOverride(
  resolutionValue: unknown,
  overrideValue: unknown
): Readonly<DamageResolution> | null {
  const resolution = conformDamageResolution(resolutionValue);
  if (!resolution) return null;
  const override =
    overrideValue === null ? null : conformDamageTableOverride(overrideValue);
  if (overrideValue !== null && !override) return null;
  return conformDamageResolution({
    computed: resolution.computed,
    effective:
      override === null
        ? ({ amount: resolution.computed.netTotal, kind: "computed" } as const)
        : override,
    packet: resolution.packet,
  });
}

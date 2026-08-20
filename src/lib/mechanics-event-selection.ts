/** Process-local event-emission and subscriber-selection capability registry. */

import type { MechanicsProgramAuthorityReceipt } from "@/types/mechanics-program-receipt";
import type {
  MechanicsEvent,
  MechanicsEventEmission,
  MechanicsSubscriberSelection,
} from "@/types/mechanics-execution";
import type { OccurrenceGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsTriggerEvidence } from "@/types/mechanics-trigger";
import type { MechanicsWorld } from "@/types/mechanics-world";

export interface MechanicsSubscriberSelectionFiber {
  readonly authority: Readonly<MechanicsProgramAuthorityReceipt>;
  readonly emission: Readonly<MechanicsEventEmission>;
  readonly eventId: string;
  readonly evidence: Readonly<MechanicsTriggerEvidence>;
  readonly phaseId: string;
  readonly root: Readonly<OccurrenceGenerationRef>;
}

const authenticEmissions = new WeakSet<object>();
const subscriberSelections = new WeakMap<object, MechanicsSubscriberSelectionFiber>();
const consumedSubscriberSelections = new WeakSet<object>();

function freezeDeep<T>(value: T): Readonly<T> {
  const visited = new WeakSet<object>();
  const visit = (entry: unknown): void => {
    if (typeof entry !== "object" || entry === null || visited.has(entry)) return;
    visited.add(entry);
    Object.values(entry).forEach(visit);
    if (!Object.isFrozen(entry)) Object.freeze(entry);
  };
  visit(value);
  return value;
}

/** Trusted execution-only issuer for one exact stage-local event emission. */
export function issueMechanicsEventEmission<Event extends MechanicsEvent>(
  emissionWorld: Readonly<MechanicsWorld>,
  event: Readonly<Event>
): Readonly<MechanicsEventEmission<Event>> {
  const emission = freezeDeep({ emissionWorld, event }) as unknown as Readonly<
    MechanicsEventEmission<Event>
  >;
  authenticEmissions.add(emission);
  return emission;
}

export function isAuthenticMechanicsEventEmission(
  value: unknown
): value is Readonly<MechanicsEventEmission> {
  return typeof value === "object" && value !== null && authenticEmissions.has(value);
}

/** Trusted selector-only issuer; an authentic emission is a mandatory parent capability. */
export function issueMechanicsSubscriberSelection(
  emissionValue: unknown,
  fiberValue: Omit<MechanicsSubscriberSelectionFiber, "emission">
): Readonly<MechanicsSubscriberSelection> | null {
  if (
    !isAuthenticMechanicsEventEmission(emissionValue) ||
    fiberValue.eventId !== emissionValue.event.eventId
  ) {
    return null;
  }
  const selection = freezeDeep({
    eventId: fiberValue.eventId,
    phaseId: fiberValue.phaseId,
    root: fiberValue.root,
  }) as unknown as Readonly<MechanicsSubscriberSelection>;
  subscriberSelections.set(
    selection,
    freezeDeep({ ...fiberValue, emission: emissionValue })
  );
  return selection;
}

/** Read the private immutable fiber; cloned or serialized public projections have none. */
export function mechanicsSubscriberSelectionFiber(
  value: unknown
): Readonly<MechanicsSubscriberSelectionFiber> | null {
  return typeof value === "object" &&
    value !== null &&
    !consumedSubscriberSelections.has(value)
    ? (subscriberSelections.get(value) ?? null)
    : null;
}

/** Consume one authentic selection exactly once after its privileged push succeeds. */
export function consumeMechanicsSubscriberSelection(value: unknown): boolean {
  if (mechanicsSubscriberSelectionFiber(value) === null) return false;
  consumedSubscriberSelections.add(value as object);
  return true;
}

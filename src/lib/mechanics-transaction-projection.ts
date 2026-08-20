/** Process-local capability registry for transient transaction projections. */

import type { MechanicsTransactionProjection } from "@/types/mechanics-operation";
import type { InventoryGenerationRef } from "@/types/mechanics-reference";
import type { MechanicsCausalState, MechanicsWorld } from "@/types/mechanics-world";

export interface MechanicsTransactionProjectionFiber {
  readonly basis: Readonly<MechanicsCausalState>;
  readonly inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[];
  readonly world: Readonly<MechanicsWorld>;
}

const transactionProjections = new WeakMap<
  object,
  Readonly<MechanicsTransactionProjectionFiber>
>();

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

/** Trusted transaction-kernel issuer for one exact, non-causal prefix view. */
export function issueMechanicsTransactionProjection(
  basis: Readonly<MechanicsCausalState>,
  world: Readonly<MechanicsWorld>,
  inventorySourceLeases: readonly Readonly<InventoryGenerationRef>[]
): Readonly<MechanicsTransactionProjection> {
  const leases = freezeDeep(structuredClone(inventorySourceLeases));
  const projection = freezeDeep({
    inventorySourceLeases: leases,
    world,
  }) as unknown as Readonly<MechanicsTransactionProjection>;
  transactionProjections.set(
    projection,
    Object.freeze({ basis, inventorySourceLeases: leases, world })
  );
  return projection;
}

/** Read an authentic projection's private basis; clones and plain objects have none. */
export function mechanicsTransactionProjectionFiber(
  value: unknown
): Readonly<MechanicsTransactionProjectionFiber> | null {
  return typeof value === "object" && value !== null
    ? (transactionProjections.get(value) ?? null)
    : null;
}

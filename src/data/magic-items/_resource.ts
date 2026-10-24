import type { ResourceEnteredRoll, ResourceSpec } from "../types";

type Disposition = "destroyed" | "nonmagical";

/**
 * "Can't be used again until the next dawn": `amount` uses (default 1) that all
 * come back at dawn.
 */
export function DAWN_USES(amount = 1): ResourceSpec {
  return {
    kind: "counter",
    id: "uses",
    unit: "uses",
    capacity: { kind: "fixed", amount },
    initial: { kind: "full" },
    recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
  };
}

/**
 * "Has N charges and regains <roll> expended charges daily at dawn", with the
 * last-charge d20 (a 1 leaves the item `onOne`) when the text names one. The
 * rolled refill is entered by the player (real dice).
 */
export function DAWN_CHARGES(
  amount: number,
  regain: ResourceEnteredRoll | number,
  onOne?: Disposition
): ResourceSpec {
  return {
    kind: "counter",
    id: "charges",
    unit: "charges",
    capacity: { kind: "fixed", amount },
    initial: { kind: "full" },
    recoveries: [
      {
        trigger: { kind: "dawn" },
        amount:
          typeof regain === "number"
            ? { kind: "fixed", amount: regain }
            : { kind: "entered-roll", roll: regain },
      },
    ],
    ...(onOne
      ? {
          onEmpty: {
            kind: "entered-d20" as const,
            bands: [
              {
                min: 1,
                max: 1,
                outcomes: [{ kind: "set-item-disposition" as const, disposition: onOne }],
              },
              { min: 2, max: 20, outcomes: [] },
            ],
          },
        }
      : {}),
  };
}

/**
 * A supply that never comes back (a packet of pinches, a tube of ounces, a bag
 * of beans): a fixed or rolled stock, spent down to `onEmpty` when the text says
 * what the emptied item becomes.
 */
export function FINITE_SUPPLY(
  unit: "uses" | "charges" | "beads",
  stock: number | ResourceEnteredRoll,
  onEmpty?: Disposition
): ResourceSpec {
  return {
    kind: "counter",
    id: unit,
    unit,
    capacity:
      typeof stock === "number"
        ? { kind: "fixed", amount: stock }
        : { kind: "entered-roll", roll: stock },
    initial: { kind: "full" },
    ...(onEmpty
      ? {
          onEmpty: {
            kind: "deterministic" as const,
            outcomes: [{ kind: "set-item-disposition" as const, disposition: onEmpty }],
          },
        }
      : {}),
  };
}

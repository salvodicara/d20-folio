/** Magic-item activations (a `while-active` grant's `activation`) → Activity. */
import type { Grant } from "@/lib/grant-schema";
import { compact, statusEffect } from "./shared";
import type { Activity, ActivityResource } from "./types";

type WhileActive = Extract<Grant, { type: "while-active" }>;

/**
 * Activating an item's property: its economy, the charge it spends (the item's
 * own tracker, keyed by the item id, or one unit of a typed item resource), and
 * the status it lights. `undefined` for a grant with no activation. The status
 * key is the authored one; the reader that knows the equipped copy keys it per
 * copy (`resolveGrantActiveKey`).
 */
export function activityFromItemActivation(
  itemId: string,
  grant: WhileActive
): Activity | undefined {
  const activation = grant.activation;
  if (!activation) return undefined;
  const pay: ActivityResource | undefined = activation.resourceCost
    ? { kind: "item-resource", resourceId: activation.resourceCost.resourceId }
    : activation.tracker
      ? { kind: "tracker", trackerId: itemId, amount: 1 }
      : undefined;
  return {
    id: `item-activation:${itemId}:${grant.activeKey}`,
    source: { kind: "item-activation", itemId, activeKey: grant.activeKey },
    cost: compact({ economy: activation.action, pay: pay ? [pay] : undefined }),
    effects: [statusEffect(grant, grant.duration, false)],
  };
}

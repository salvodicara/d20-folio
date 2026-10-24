/**
 * A drunk potion's standing effect (Flying's fly speed, Water Breathing, …). A
 * timed potion declares it as a `while-active` grant keyed `potion:<itemId>`, the
 * same key as its countdown: drinking lights the key, and the countdown's expiry
 * (or a rest) ends it like any other timed state. The potion is gone once drunk,
 * so the lit key itself, not the inventory, is the grant source.
 */
import { getMagicItem } from "@/data/magic-items";
import type { Grant } from "@/lib/grant-schema";
import type { GrantSource } from "@/lib/grants";

/** The `effectTimers` / `activeFeatures` key prefix of a drunk potion. */
export const POTION_TIMER_PREFIX = "potion:";

/** The key of a drunk potion's countdown and of the state it lights. */
export function potionTimerKey(itemId: string): string {
  return `${POTION_TIMER_PREFIX}${itemId}`;
}

/** The standing effect a potion declares, keyed by its countdown key. */
export function potionStateGrant(
  itemId: string
): Extract<Grant, { type: "while-active" }> | undefined {
  const key = potionTimerKey(itemId);
  for (const grant of getMagicItem(itemId)?.grants ?? []) {
    if (grant.type === "while-active" && grant.activeKey === key) return grant;
  }
  return undefined;
}

/** The drunk potion behind a `potion:<id>` state key, or null for any other key. */
function potionItemOf(key: string): string | null {
  return key.startsWith(POTION_TIMER_PREFIX)
    ? key.slice(POTION_TIMER_PREFIX.length)
    : null;
}

/** The conditions a lit potion state's `state-condition` grants give (Invisibility). */
function stateConditionsOf(key: string): string[] {
  const itemId = potionItemOf(key);
  if (!itemId) return [];
  return (potionStateGrant(itemId)?.grants ?? []).flatMap((grant) =>
    grant.type === "state-condition" ? [grant.condition] : []
  );
}

/** Every condition the lit potion states give, in key order (duplicates kept once). */
export function potionStateConditions(activeKeys: Iterable<string>): string[] {
  return [...new Set([...activeKeys].flatMap(stateConditionsOf))];
}

/** The lit potion state keys that give `condition` (ending the condition ends them). */
export function potionStatesGiving(
  activeKeys: Iterable<string>,
  condition: string
): string[] {
  return [...activeKeys].filter((key) => stateConditionsOf(key).includes(condition));
}

/** The lit potion state keys whose duration ends early on `act` ("attack-roll"). */
export function potionStatesEndingOn(
  activeKeys: Iterable<string>,
  act: string
): string[] {
  return [...activeKeys].filter((key) => {
    const itemId = potionItemOf(key);
    const duration = itemId ? potionStateGrant(itemId)?.duration : undefined;
    return (
      duration !== undefined &&
      "endsEarlyOn" in duration &&
      (duration.endsEarlyOn ?? []).includes(act)
    );
  });
}

/** The lit potion states as grant sources; an unlit potion contributes nothing. */
export function resolvePotionStateSources(activeKeys: Iterable<string>): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const key of activeKeys) {
    if (!key.startsWith(POTION_TIMER_PREFIX)) continue;
    const itemId = key.slice(POTION_TIMER_PREFIX.length);
    const grant = potionStateGrant(itemId);
    if (!grant) continue;
    sources.push({
      id: itemId,
      grants: [grant],
      ref: { kind: "magic-item", key: itemId },
    });
  }
  return sources;
}

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
import { srdText } from "@/lib/loc-text";

/** The `effectTimers` / `activeFeatures` key prefix of a drunk potion. */
export const POTION_TIMER_PREFIX = "potion:";

/** The key of a drunk potion's countdown and of the state it lights. */
export function potionTimerKey(itemId: string): string {
  return `${POTION_TIMER_PREFIX}${itemId}`;
}

/** The suffix of the key a potion's after-effect (Speed's lethargy) is lit under. */
export const POTION_AFTEREFFECT_SUFFIX = ":aftereffect";

/** The key of a potion's after-effect, lit when its countdown runs out. */
export function potionAftereffectKey(itemId: string): string {
  return `${potionTimerKey(itemId)}${POTION_AFTEREFFECT_SUFFIX}`;
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

/** The lit potion states as grant sources; an unlit potion contributes nothing. */
export function resolvePotionStateSources(activeKeys: Iterable<string>): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const key of activeKeys) {
    if (!key.startsWith(POTION_TIMER_PREFIX)) continue;
    if (key.endsWith(POTION_AFTEREFFECT_SUFFIX)) {
      const itemId = key.slice(
        POTION_TIMER_PREFIX.length,
        -POTION_AFTEREFFECT_SUFFIX.length
      );
      const after = potionStateGrant(itemId)?.afterEffect;
      // Its own source and chip ("Lethargy"), held while the key is lit; the
      // turn edge it ends at is the key's stored boundary.
      if (after) {
        sources.push({
          id: key,
          label: srdText("rule", "potion.lethargy", "name"),
          grants: [
            {
              type: "while-active",
              activeKey: key,
              duration: {
                kind: "turn-boundary",
                phase: after.duration.phase,
                turns: after.duration.turns,
              },
              grants: [...after.grants],
            },
          ],
        });
      }
      continue;
    }
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

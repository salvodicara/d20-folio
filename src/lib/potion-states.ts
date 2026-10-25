/**
 * A drunk potion's standing effect (Flying's fly speed, Water Breathing, …). A
 * timed potion declares it as a `while-active` grant keyed `potion:<itemId>`, the
 * same key as its countdown: drinking lights the key, and the countdown's expiry
 * (or a rest) ends it like any other timed state. The potion is gone once drunk,
 * so the lit key itself, not the inventory, is the grant source.
 *
 * An activated item state that gives a condition or ends on an act (Ring of
 * Invisibility, Dust of Disappearance) is read the same way here: the condition and
 * end-on-act seams see its lit key, per physical copy.
 */
import { getMagicItem, SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { spells } from "@/data/spells";
import type { SrdMagicItemData } from "@/data/types";
import type { Grant } from "@/lib/grant-schema";
import type { GrantSource } from "@/lib/grants";
import { homebrewItemData, type ItemCopy } from "@/lib/homebrew-items";
import { customText } from "@/lib/loc-text";

/** The `effectTimers` / `activeFeatures` key prefix of a drunk potion. */
export const POTION_TIMER_PREFIX = "potion:";

/** The key of a drunk potion's countdown and of the state it lights. */
export function potionTimerKey(itemId: string): string {
  return `${POTION_TIMER_PREFIX}${itemId}`;
}

/**
 * The structured homebrew potion among the character's copies whose item id (its
 * `instanceId`) is `itemId`. A copy drunk to the last one has left the inventory,
 * so its state can no longer be read from it.
 */
function homebrewPotion(
  copies: ReadonlyArray<ItemCopy>,
  itemId: string
): { entry: ItemCopy; item: SrdMagicItemData } | undefined {
  for (const entry of copies) {
    if (!("custom" in entry) || entry.instanceId !== itemId) continue;
    const item = homebrewItemData(entry);
    return item?.type === "potion" ? { entry, item } : undefined;
  }
  return undefined;
}

/**
 * The standing effect a potion declares, keyed by its countdown key. A catalogue
 * potion keys it `potion:<itemId>` (`POTION_STATE`). A homebrew potion's id is its
 * copy's `instanceId`, minted per copy, so its `potion:`-keyed `while-active` is its
 * state whatever the authored suffix, re-keyed to the copy's countdown.
 */
export function potionStateGrant(
  itemId: string,
  copies: ReadonlyArray<ItemCopy> = []
): Extract<Grant, { type: "while-active" }> | undefined {
  const key = potionTimerKey(itemId);
  const catalogue = getMagicItem(itemId);
  if (catalogue) {
    for (const grant of catalogue.grants ?? []) {
      if (grant.type === "while-active" && grant.activeKey === key) return grant;
    }
    return undefined;
  }
  for (const grant of homebrewPotion(copies, itemId)?.item.grants ?? []) {
    if (
      grant.type === "while-active" &&
      grant.activeKey.startsWith(POTION_TIMER_PREFIX)
    ) {
      return { ...grant, activeKey: key };
    }
  }
  return undefined;
}

/** The round countdown a drunk potion arms (its `durationRounds`), catalogue or
 *  homebrew; undefined for an instant potion. */
export function potionDurationRounds(
  itemId: string,
  copies: ReadonlyArray<ItemCopy> = []
): number | undefined {
  return (getMagicItem(itemId) ?? homebrewPotion(copies, itemId)?.item)?.durationRounds;
}

/**
 * The potion id behind a drink's cost key: a catalogue potion's `srdId`, or a
 * homebrew potion's own id for its `custom-<instanceId>` key (null when that copy
 * is text-only, so there is nothing to arm).
 */
export function drunkPotionId(
  copies: ReadonlyArray<ItemCopy>,
  costKey: string
): string | null {
  for (const entry of copies) {
    if ("custom" in entry && `custom-${entry.instanceId}` === costKey) {
      return homebrewPotion(copies, entry.instanceId)?.item.id ?? null;
    }
  }
  return costKey;
}

/** The drunk potion behind a `potion:<id>` state key, or null for any other key. */
function potionItemOf(key: string): string | null {
  return key.startsWith(POTION_TIMER_PREFIX)
    ? key.slice(POTION_TIMER_PREFIX.length)
    : null;
}

type WhileActive = Extract<Grant, { type: "while-active" }>;

/** The per-copy prefix an item activation's state key carries (`resolveGrantActiveKey`). */
const ITEM_COPY_PREFIX = "magic-item:";

let activatedItemStates: ReadonlyMap<string, WhileActive> | undefined;

/**
 * A worn item's activated state that gives a condition or ends on an act (Ring and
 * Cloak of Invisibility, Dust of Disappearance), by its authored key. Like a potion's,
 * the lit key is the source: the condition seam reads sessions, not inventories.
 */
function activatedItemState(authoredKey: string): WhileActive | undefined {
  activatedItemStates ??= new Map(
    SRD_MAGIC_ITEMS.flatMap((item) =>
      item.type === "potion"
        ? []
        : (item.grants ?? []).flatMap((grant) =>
            grant.type === "while-active" &&
            grant.activation &&
            (grant.grants.some((inner) => inner.type === "state-condition") ||
              (grant.duration && "endsEarlyOn" in grant.duration))
              ? [[grant.activeKey, grant] as const]
              : []
          )
    )
  );
  return activatedItemStates.get(authoredKey);
}

let spellEndOnActStates: ReadonlyMap<string, WhileActive> | undefined;

/** A lit spell state whose duration ends early on an act (Sanctuary), by its key. */
function spellEndOnActState(key: string): WhileActive | undefined {
  spellEndOnActStates ??= new Map(
    spells.flatMap((spell) =>
      (spell.grants ?? []).flatMap((grant) =>
        grant.type === "while-active" && grant.duration && "endsEarlyOn" in grant.duration
          ? [[grant.activeKey, grant] as const]
          : []
      )
    )
  );
  return spellEndOnActStates.get(key);
}

/** The state behind a lit key: a drunk potion's, or an activated item's (per copy). */
function stateGrantOf(key: string): WhileActive | undefined {
  const itemId = potionItemOf(key);
  if (itemId) return potionStateGrant(itemId);
  if (!key.startsWith(ITEM_COPY_PREFIX)) return activatedItemState(key);
  const copySeparator = key.indexOf(":", ITEM_COPY_PREFIX.length);
  return copySeparator < 0 ? undefined : activatedItemState(key.slice(copySeparator + 1));
}

/** The conditions a lit state's `state-condition` grants give (Invisibility). */
function stateConditionsOf(key: string): string[] {
  return (stateGrantOf(key)?.grants ?? []).flatMap((grant) =>
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

/** The lit potion, item or spell state keys whose duration ends early on `act`
 *  ("attack-roll"): Potion of Invisibility, Sanctuary. */
export function potionStatesEndingOn(
  activeKeys: Iterable<string>,
  act: string
): string[] {
  return [...activeKeys].filter((key) => {
    const duration = (stateGrantOf(key) ?? spellEndOnActState(key))?.duration;
    return (
      duration !== undefined &&
      "endsEarlyOn" in duration &&
      (duration.endsEarlyOn ?? []).includes(act)
    );
  });
}

/** The lit potion states as grant sources; an unlit potion contributes nothing. A
 *  homebrew potion's state is read from its copy among `copies`, named by it. */
export function resolvePotionStateSources(
  activeKeys: Iterable<string>,
  copies: ReadonlyArray<ItemCopy> = []
): GrantSource[] {
  const sources: GrantSource[] = [];
  for (const key of activeKeys) {
    if (!key.startsWith(POTION_TIMER_PREFIX)) continue;
    const itemId = key.slice(POTION_TIMER_PREFIX.length);
    const grant = potionStateGrant(itemId, copies);
    if (!grant) continue;
    const homebrew = getMagicItem(itemId) ? undefined : homebrewPotion(copies, itemId);
    sources.push({
      id: itemId,
      grants: [grant],
      ...(homebrew && "custom" in homebrew.entry
        ? { label: customText(homebrew.entry.name) }
        : { ref: { kind: "magic-item", key: itemId } }),
    });
  }
  return sources;
}

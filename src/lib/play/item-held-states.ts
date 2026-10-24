/**
 * An item's activated state lasts only while its source copy is held: "until you
 * remove the ring", "if you … cease wearing the hood". When a copy stops being
 * equipped, its attunement lapses, it leaves the bag or it stops being magical, every
 * state lit from it ends, and with it the condition it gave (Ring of Invisibility).
 *
 * Pure: the selector names the keys, the events end them through the play log's
 * existing `set-active-state` transition (so each end folds, undoes and redoes like
 * any toggle), and the log lines say which conditions went.
 */
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { effectiveEquipmentForItemResources } from "@/lib/aggregate-character";
import { effectiveSessionConditions } from "@/lib/effective-conditions";
import { resolveGrantActiveKey } from "@/lib/grants";
import { resolveGrantSourcesForEquipment } from "@/lib/resolve-grant-sources";
import type { CharacterDoc } from "@/types/character";
import type { CombatEvent } from "@/types/combat-log";
import type { SheetEvent } from "./sheet-events";

/** The per-copy prefix of an item state's key (`resolveGrantActiveKey`). */
const ITEM_COPY_PREFIX = "magic-item:";

let authoredItemKeys: ReadonlySet<string> | undefined;

/** Every top-level activated-state key a worn item declares (potions excluded:
 *  a drunk potion's state outlives the bottle). */
function itemStateKeys(): ReadonlySet<string> {
  authoredItemKeys ??= new Set(
    SRD_MAGIC_ITEMS.flatMap((item) =>
      item.type === "potion"
        ? []
        : (item.grants ?? []).flatMap((grant) =>
            grant.type === "while-active" ? [grant.activeKey] : []
          )
    )
  );
  return authoredItemKeys;
}

/** Whether a lit key is an item's state at all (per copy, or a legacy un-numbered copy). */
function isItemStateKey(key: string): boolean {
  return key.startsWith(ITEM_COPY_PREFIX) || itemStateKeys().has(key);
}

/** The state keys the character's held items can light right now. */
function heldItemStateKeys(doc: CharacterDoc): Set<string> {
  const equipment = effectiveEquipmentForItemResources(
    doc.character.equipment,
    doc.session.itemResources
  );
  const keys = new Set<string>();
  for (const source of resolveGrantSourcesForEquipment(
    equipment,
    doc.session.itemResources
  )) {
    for (const grant of source.grants ?? []) {
      if (grant.type === "while-active") {
        keys.add(resolveGrantActiveKey(source, grant.activeKey));
      }
    }
  }
  return keys;
}

/** The lit item states whose source copy is no longer held, in lit order. */
export function unheldItemStateKeys(doc: CharacterDoc): string[] {
  const lit = (doc.session.activeFeatures ?? []).filter(isItemStateKey);
  if (lit.length === 0) return [];
  const held = heldItemStateKeys(doc);
  return lit.filter((key) => !held.has(key));
}

/**
 * The play-log events that end them: one `set-active-state` off per key, so each is
 * its own undoable entry. Empty when nothing ends. To dispatch right after any change
 * that can stop a copy being held (unequip, unattune, remove, a last charge that
 * leaves it nonmagical).
 */
export function unheldItemStateEvents(doc: CharacterDoc, litRound: number): SheetEvent[] {
  return unheldItemStateKeys(doc).map((key) => ({
    kind: "set-active-state",
    key,
    isActive: false,
    litRound,
  }));
}

/** The log lines for the ending: each condition the ended states took with them. */
export function unheldItemStateLogEvents(
  before: CharacterDoc,
  after: CharacterDoc
): CombatEvent[] {
  const still = new Set(effectiveSessionConditions(after.session));
  return effectiveSessionConditions(before.session)
    .filter((condition) => !still.has(condition))
    .map((conditionId) => ({ kind: "condition-loss", conditionId }));
}

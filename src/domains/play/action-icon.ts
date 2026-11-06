/**
 * The Play action slot's icon (approved prototype x-play: each row's 46 px framed slot),
 * picked from the data, never from the name: a weapon its own kind, the unarmed strike a
 * fist, a spell or an attack by the damage it deals, a healing spell the support mark,
 * any other spell its school of magic, a
 * class feature its class, a base action (Dash, Dodge…) its own sign; otherwise a spell
 * book or a feature medal. Pure: the screen maps each key to its glyph.
 */
import { classFeatureIndex } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import type { SpellSchool } from "@/data/types";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import type { PlayActionRow } from "./play-actions-view";

export type ActionIconKey =
  | { kind: "weapon"; id: string }
  | { kind: "unarmed" }
  | { kind: "damage"; type: DamageType }
  | { kind: "heal" }
  | { kind: "class"; id: string }
  | { kind: "base"; id: string }
  | { kind: "school"; id: SpellSchool }
  | { kind: "spell" }
  | { kind: "feature" };

const isDamageType = (value: string | undefined): value is DamageType =>
  (DAMAGE_TYPES as readonly string[]).includes(value ?? "");

/** The class feature behind an action id (`<featureId>-<type>`), if any. */
function featureOf(row: PlayActionRow): { id: string; class: string } | undefined {
  const tracker = row.action.costTracker;
  const byTracker = tracker ? classFeatureIndex.get(tracker) : undefined;
  if (tracker && byTracker) return { id: tracker, class: byTracker.class };
  let best: { id: string; class: string } | undefined;
  for (const [id, feature] of classFeatureIndex) {
    if ((!best || id.length > best.id.length) && row.id.startsWith(`${id}-`))
      best = { id, class: feature.class };
  }
  return best;
}

/**
 * The painted icon a row's slot shows (BG3's slot art): a weapon its equipment art, a
 * usable magic item its item art, a class feature its own art, a base action (Dash,
 * Dodge…) and the unarmed strike their action art. A spell paints through its school
 * (SpellArt).
 */
export function actionArt(
  row: PlayActionRow
): { kind: "equipment" | "item" | "feature" | "action"; id: string } | null {
  if (row.spellId) return null;
  if (row.action.weaponId) return { kind: "equipment", id: row.action.weaponId };
  if (row.id === "unarmed-strike") return { kind: "action", id: "unarmed-strike" };
  if (row.id.startsWith("base-")) return { kind: "action", id: row.id.slice(5) };
  if (row.id.startsWith("item-")) return { kind: "item", id: row.id.slice(5) };
  const feature = featureOf(row);
  return feature ? { kind: "feature", id: feature.id } : null;
}

export function actionIcon(row: PlayActionRow): ActionIconKey {
  const { action } = row;
  if (action.weaponId) return { kind: "weapon", id: action.weaponId };
  if (row.id === "unarmed-strike") return { kind: "unarmed" };
  if (row.id.startsWith("base-")) return { kind: "base", id: row.id.slice(5) };
  if (isDamageType(row.damageType)) return { kind: "damage", type: row.damageType };
  if (row.healing) return { kind: "heal" };
  const school = row.spellId ? getSpellById(row.spellId)?.school : undefined;
  if (school) return { kind: "school", id: school };
  if (row.spellId) return { kind: "spell" };
  const cls = featureOf(row)?.class;
  return cls ? { kind: "class", id: cls } : { kind: "feature" };
}

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
function featureClass(row: PlayActionRow): string | undefined {
  const tracker = row.action.costTracker;
  const byTracker = tracker ? classFeatureIndex.get(tracker)?.class : undefined;
  if (byTracker) return byTracker;
  let best: string | undefined;
  let length = 0;
  for (const [id, feature] of classFeatureIndex) {
    if (id.length > length && row.id.startsWith(`${id}-`)) {
      best = feature.class;
      length = id.length;
    }
  }
  return best;
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
  const cls = featureClass(row);
  return cls ? { kind: "class", id: cls } : { kind: "feature" };
}

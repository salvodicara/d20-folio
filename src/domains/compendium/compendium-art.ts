/**
 * A compendium entry's painted icon, by the spec it belongs to: a spell through its
 * school's art, an item from the mundane or magic catalogue, a monster, feat or class
 * feature its own. Maneuvers, metamagic, invocations and masteries have no painted
 * art: the row keeps its type's glyph.
 */
import type { ArtKind } from "@/ui/art-url";
import type { SpellSchool } from "@/data/types";

export type CompendiumArt =
  | { spell: string; school: SpellSchool }
  | { kind: ArtKind; id: string }
  | null;

const OWN: Record<string, ArtKind> = {
  monster: "monster",
  feat: "feat",
  feature: "feature",
};

export function compendiumArt(specId: string, entry: unknown): CompendiumArt {
  const e = entry as {
    id?: string;
    school?: SpellSchool;
    kind?: string;
    item?: { id: string };
  } | null;
  if (!e) return null;
  if (specId === "spell" && e.id && e.school) return { spell: e.id, school: e.school };
  if (specId === "items" && e.item)
    return { kind: e.kind === "magic" ? "item" : "equipment", id: e.item.id };
  const kind = OWN[specId];
  return kind && e.id ? { kind, id: e.id } : null;
}

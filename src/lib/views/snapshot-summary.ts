import { totalLevel } from "@/lib/classes";
import type { Locale } from "@/lib/locale";
import { localizeClassName } from "@/lib/views/srd-i18n";
import type { CharacterData } from "@/types/character";

/**
 * Compact class·level summary DERIVED at render from the snapshot's OWN stored
 * character data — what this snapshot would restore (owner, 2026-06-12). Never
 * a stored display string (rules 6/7/10: the old stored EN "Pre level-up
 * snapshot (Lv N)" label leaked English into the IT UI and is gone).
 * Single-class: "Barbaro 4"; multiclass: "Ladro 3 · Mago 2 — Liv 5".
 */
export function classLevelSummary(
  character: CharacterData,
  locale: Locale,
  lvlLabel: string
): string {
  const entries = character.classes.filter((e) => e.classId);
  if (entries.length === 0) return "";
  const parts = entries.map((e) => `${localizeClassName(e.classId, locale)} ${e.level}`);
  if (parts.length === 1) return parts[0] ?? "";
  return `${parts.join(" · ")} — ${lvlLabel} ${totalLevel(character)}`;
}

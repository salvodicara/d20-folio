/**
 * CharacterIdentityLine — the ONE "race · class level (subclass)" line, rendered
 * from the structured `classes[]` source of truth and localized REACTIVELY at
 * render time.
 *
 * Every surface that summarizes a character (roster card, campaign party card) uses
 * this so the chrome — mono `.ch-sub` scale, the class in gilt (`<em>`), the subclass
 * on its own line — stays identical, and the line re-localizes the instant the user
 * flips EN↔IT. R4 — class + level DERIVE from `classes[]` (ids, not display strings);
 * a multiclass character shows every class at its level joined by " / "
 * ("Mago 5 / Chierico 3"), and the PRIMARY (highest-level) class's subclass on its
 * own line.
 */

import { useLocale } from "@/hooks/useLocale";
import { cn } from "@/lib/utils";
import {
  localizeRaceName,
  localizeClassName,
  localizeSubclassName,
} from "@/lib/views/srd-i18n";
import { primaryClassEntry } from "@/lib/classes";
import type { ClassEntry } from "@/types/character";

interface Props {
  /** English species name/slug (e.g. "Elf"); localized via the srd-i18n map. */
  race?: string | null;
  /** The character's `classes[]` breakdown — the source of truth for class + level. */
  classes?: ReadonlyArray<ClassEntry>;
  /** Extra utility classes merged onto the `.ch-sub` span. */
  className?: string;
}

export function CharacterIdentityLine({ race, classes, className }: Props) {
  const { language: locale } = useLocale();
  const raceLabel = race ? localizeRaceName(race, locale) : "";
  const entries = classes ?? [];
  // The PRIMARY class's subclass goes on its own line (the headline subclass).
  const primarySubclassId =
    entries.length > 0
      ? (primaryClassEntry({ classes: [...entries] }).subclassId ?? "")
      : "";
  const subclassLabel = primarySubclassId
    ? localizeSubclassName(primarySubclassId, locale)
    : "";

  return (
    <span className={cn("ch-sub", className)}>
      {raceLabel}
      {raceLabel && entries.length > 0 ? " · " : ""}
      {entries.map((e, i) => (
        <span key={`${e.classId}-${i}`}>
          {i > 0 ? " / " : ""}
          <em>
            {localizeClassName(e.classId, locale)} {e.level}
          </em>
        </span>
      ))}
      {subclassLabel ? (
        <>
          <br />
          {subclassLabel}
        </>
      ) : null}
    </span>
  );
}

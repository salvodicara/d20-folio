/**
 * The optional XP line under the header identity (D&D Beyond's XP bar beside the
 * level): "2.450 / 2.700 PE" + a thin progress pool, the total edited in place.
 *
 * XP is optional — a milestone table never sets it, so the line is absent from the
 * sheet until the owner adds a total in edit mode. Once set it stays editable in
 * play too (golden rule 7: XP lands at the table, after a fight). It never levels
 * the character: reaching the threshold only says so, beside the Level-Up chip.
 */

import { useTranslation } from "react-i18next";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { useLocale } from "@/hooks/useLocale";
import { xpProgress } from "@/lib/experience";
import { fmtXp } from "@/lib/utils";
import { patchCharacter } from "../patch-character";

/** Upper bound of the editor — well past level 20's 355,000. */
const XP_MAX = 9_999_999;

export function HeaderXp({
  experience,
  level,
  editable,
  showWhenUnset,
}: {
  experience: number | undefined;
  level: number;
  editable: boolean;
  /** Edit mode: offer the empty field so a table that uses XP can start it. */
  showWhenUnset: boolean;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  if (experience === undefined && !showWhenUnset) return null;

  const xp = experience ?? 0;
  const { next, fraction, canLevelUp } = xpProgress(xp, level);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="tr-numeric">
        <InlineEditable
          type="number"
          editable={editable}
          // NaN while unset: the editor opens empty and a committed 0 still saves.
          value={experience ?? Number.NaN}
          min={0}
          max={XP_MAX}
          // Unset reads as the placeholder, never as a real "0".
          format={(v) => (experience === undefined ? "" : fmtXp(v, locale))}
          placeholder="—"
          onChange={(v) => patchCharacter({ experience: Math.round(v) })}
          ariaLabel={t("character.xpAria")}
        />{" "}
        {next === null
          ? t("common.xp")
          : t("character.xpOfNext", { next: fmtXp(next, locale) })}
      </span>
      {next !== null && (
        <span
          className="tr-pool"
          role="progressbar"
          aria-label={t("character.xpAria")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fraction * 100)}
        >
          <span
            className="tr-pool-fill"
            style={{
              ["--w" as string]: `${fraction * 100}%`,
              ["--tr-c" as string]: "var(--accent-primary)",
            }}
          />
        </span>
      )}
      {experience !== undefined && canLevelUp && (
        <span className="tr-numeric">
          <b>{t("character.levelUpReady")}</b>
        </span>
      )}
    </div>
  );
}

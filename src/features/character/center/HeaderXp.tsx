/**
 * The optional XP line under the header identity (D&D Beyond's XP bar beside the
 * level): "2.450 / 2.700 PE" + a thin progress pool, the total edited in place.
 *
 * XP is optional — a milestone table never sets it, so the line is absent from the
 * sheet until the owner adds a total in edit mode. Once set it stays editable in
 * play too (golden rule 7: XP lands at the table, after a fight), and clearing the
 * field returns the table to milestone levelling. It never levels
 * the character: reaching the threshold only says so, beside the Level-Up chip.
 */

import { useTranslation } from "react-i18next";
import { InlineEditable } from "@/components/shared/InlineEditable";
import { useLocale } from "@/hooks/useLocale";
import { xpProgress } from "@/lib/experience";
import { fmtXp } from "@/lib/utils";
import { useCharacterStore } from "@/stores/characterStore";
import { patchCharacter } from "../patch-character";

/** Upper bound of the editor — well past level 20's 355,000. */
const XP_MAX = 9_999_999;

/**
 * Edit mode, XP unset: the empty field rides the identity line inline, so toggling
 * edit never adds a masthead row (the no-reflow rule) and the play view is unchanged.
 */
export function HeaderXpStart() {
  const { t } = useTranslation();
  return (
    // A zero-height inline box: the field shows on the line but never makes the
    // line taller, so the masthead keeps its exact height.
    <span className="tr-numeric ml-2 inline-block h-0 overflow-visible align-top">
      <InlineEditable
        type="number"
        editable
        // NaN while unset: the editor opens empty and a committed 0 still saves.
        value={Number.NaN}
        min={0}
        max={XP_MAX}
        format={() => ""}
        placeholder="—"
        onChange={(v) => patchCharacter({ experience: Math.round(v) })}
        ariaLabel={t("character.xpAria")}
      />{" "}
      {t("common.xp")}
    </span>
  );
}

/**
 * Back to milestone levelling: the key is REMOVED (unset, not 0), so the line
 * disappears and the stored build carries no `experience` (the codec omits it and
 * the parent write replaces the whole `build` map).
 */
function clearXp(): void {
  const state = useCharacterStore.getState();
  if (state.readonly || !state.character) return;
  const { experience: _experience, ...character } = state.character.character;
  void _experience;
  state.setCharacter({ ...state.character, character });
}

/** The XP line once a total is set: the same row in play and edit mode. */
export function HeaderXp({
  experience,
  level,
  editable,
}: {
  experience: number | undefined;
  level: number;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  if (experience === undefined) return null;

  const xp = experience;
  const { next, fraction, canLevelUp } = xpProgress(xp, level);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="tr-numeric">
        <InlineEditable
          type="number"
          editable={editable}
          value={xp}
          min={0}
          max={XP_MAX}
          format={(v) => fmtXp(v, locale)}
          onChange={(v) => patchCharacter({ experience: Math.round(v) })}
          onClear={clearXp}
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
      {canLevelUp && (
        <span className="tr-numeric">
          <b>{t("character.levelUpReady")}</b>
        </span>
      )}
    </div>
  );
}

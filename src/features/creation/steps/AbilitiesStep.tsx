/**
 * Abilities-step components — the 2024-background `BgAsiPicker` (+2/+1 or
 * +1/+1/+1) on the wizard-F grammar: the mode fork wears the shared
 * `WizardForkTab` recipe, the tiles are the minimal ASI cartouches, and the
 * progress line speaks the chrome's mono voice (gold when complete — never an
 * off-palette green). No SRD/locale reads.
 */
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { WizardForkTab } from "@/features/wizard/chrome";
import { WizardAsiCartouches } from "@/features/wizard/point-buy";
import type { AbilityCode } from "@/data/types";

export function BgAsiPicker({
  baseScores,
  mode,
  choices,
  abilityOptions,
  backgroundName,
  onSwitchMode,
  onToggle,
  isValid,
}: {
  baseScores: Record<AbilityCode, number>;
  mode: "+2/+1" | "+1/+1/+1";
  choices: Partial<Record<AbilityCode, number>>;
  /**
   * The THREE abilities this background's ASI may land on (`bg.abilityOptions`).
   * A tile whose code is NOT in this set is disabled — the +2/+1 (or +1/+1/+1)
   * can only be assigned to an eligible ability, so an out-of-list assignment is
   * unreachable (golden rule 20), not validated-and-scolded after the fact.
   */
  abilityOptions: readonly AbilityCode[];
  /** The localized background display name — names the CAUSE of the disabled
   *  tiles (Constitution §2.7.3: a filtered category carries a one-line cause). */
  backgroundName: string;
  onSwitchMode: (m: "+2/+1" | "+1/+1/+1") => void;
  onToggle: (code: AbilityCode) => void;
  isValid: boolean;
}) {
  const { t } = useTranslation();
  const selectedCount = Object.keys(choices).length;
  const hasTwo = Object.values(choices).some((v) => v === 2);
  const [a, b, c] = abilityOptions;

  const instruction =
    mode === "+2/+1"
      ? !hasTwo
        ? t("create.bgAsiSelectFirst")
        : selectedCount < 2
          ? t("create.bgAsiSelectSecond")
          : t("create.bgAsiConfirmed")
      : selectedCount < 3
        ? t("create.bgAsiSelect3")
        : t("create.bgAsiConfirmed");

  return (
    <div className="flex flex-col gap-3">
      {/* The mode fork — the SAME tab recipe as the level-up boon fork. */}
      <div
        className="wiz-fork justify-center"
        role="group"
        aria-label={t("create.bgAsiModeLabel")}
      >
        <WizardForkTab active={mode === "+2/+1"} onClick={() => onSwitchMode("+2/+1")}>
          {t("create.bgAsiMode21")}
        </WizardForkTab>
        <WizardForkTab
          active={mode === "+1/+1/+1"}
          onClick={() => onSwitchMode("+1/+1/+1")}
        >
          {t("create.bgAsiMode111")}
        </WizardForkTab>
      </div>
      {/* WHY only three tiles are live — the one-line cause naming the
          background and its eligible trio (Constitution §2.7.3). */}
      {a && b && c && (
        <p className="wiz-rubric">
          {t("create.bgAsiEligible", {
            background: backgroundName,
            a: t(`abilities.${a}`),
            b: t(`abilities.${b}`),
            c: t(`abilities.${c}`),
          })}
        </p>
      )}
      {/* The progress line speaks the chrome's mono voice; completion flares
          gold with the wax check — never an off-palette green. */}
      <p className={cn("wiz-pick-head wiz-pick-solo", isValid && "wiz-pick-done")}>
        <span className="wiz-pick-label">
          {isValid && <Icon as={Check} size="xs" decorative />}
          {instruction}
        </span>
      </p>
      {/* The ability tiles — the wizard-F carved cartouches (current score, the
          increase applied in gold, the LIVE effective modifier). A full picker
          leaves the untouched tiles unpickable, never scolds (rule 20). */}
      <WizardAsiCartouches
        abilityScores={baseScores}
        bonusFor={(code) => choices[code] ?? 0}
        isSelected={(code) => (choices[code] ?? 0) > 0}
        onPick={onToggle}
        disabledFor={(code) =>
          // Ineligible for THIS background (∉ its 3 ability options) → never
          // pickable; or the picker is already full. (A code already chosen
          // stays tappable so a live ineligible pick can be removed — the
          // `WizardAsiCartouches` `!selected` guard handles that.)
          !abilityOptions.includes(code) ||
          (!choices[code] && (mode === "+2/+1" ? selectedCount >= 2 : selectedCount >= 3))
        }
      />
    </div>
  );
}

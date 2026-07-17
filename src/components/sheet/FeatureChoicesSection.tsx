/**
 * L3 — the unified choice-engine UI. Given the `FeatureChoiceSlots`
 * collected from any set of grant sources (feats, class/subclass features,
 * species, background) and a single `ChoicePicks` object, it renders the
 * right sub-picker for each kind that has slots. One component replaces the
 * four ad-hoc picker blocks the level-up and creation wizards used to mount
 * individually per selected feat.
 */
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { AbilityCode } from "@/data/types";
import type { FeatAsi } from "@/lib/feat-asi";
import type { ChoicePicks, FeatureChoiceSlots } from "@/lib/feature-choices";
import { abilityLabel } from "@/lib/views/level-up-view";
import { SkillChoicePicker } from "@/components/sheet/SkillChoicePicker";
import { ToolChoicePicker } from "@/components/sheet/ToolChoicePicker";
import { SkillOrToolPicker } from "@/components/sheet/SkillOrToolPicker";
import { LanguageChoicePicker } from "@/components/sheet/LanguageChoicePicker";
import { FeatSpellChoicesPicker } from "@/components/sheet/FeatSpellChoicesPicker";
import { ExpertiseChoicePicker } from "@/components/sheet/ExpertiseChoicePicker";
import { asLocale } from "@/lib/locale";

interface Props {
  slots: FeatureChoiceSlots;
  picks: ChoicePicks;
  onChange: (picks: ChoicePicks) => void;
  /** Skills the character already has — dimmed in skill / skill-or-tool pools. */
  existingSkillIds: ReadonlySet<string>;
  /** Spell ids already on the character — excluded from the spell pool. */
  existingSpellIds: ReadonlySet<string>;
  /** Skills the character is proficient in — the pool for Expertise picks. */
  proficientSkillIds: ReadonlySet<string>;
}

export function FeatureChoicesSection({
  slots,
  picks,
  onChange,
  existingSkillIds,
  existingSpellIds,
  proficientSkillIds,
}: Props) {
  return (
    // ONE inter-section rhythm (sp-4) between sibling choice sections — the same
    // step the slot pickers use internally, so the whole block reads as a single
    // aligned system (owner breathing pass, 2026-06-10).
    <div className="space-y-4">
      {slots.spell.length > 0 && (
        <FeatSpellChoicesPicker
          slots={slots.spell}
          picks={picks.spell}
          onChange={(spell) => onChange({ ...picks, spell })}
          existingSpellIds={existingSpellIds}
        />
      )}
      {slots.skillOrTool.length > 0 && (
        <SkillOrToolPicker
          slots={slots.skillOrTool}
          picks={picks.skillOrTool}
          onChange={(skillOrTool) => onChange({ ...picks, skillOrTool })}
          existingSkillIds={existingSkillIds}
        />
      )}
      {slots.skill.length > 0 && (
        <SkillChoicePicker
          slots={slots.skill}
          picks={picks.skill}
          onChange={(skill) => onChange({ ...picks, skill })}
          existingSkillIds={existingSkillIds}
        />
      )}
      {slots.tool.length > 0 && (
        <ToolChoicePicker
          slots={slots.tool}
          picks={picks.tool}
          onChange={(tool) => onChange({ ...picks, tool })}
        />
      )}
      {slots.language.length > 0 && (
        <LanguageChoicePicker
          slots={slots.language}
          picks={picks.language}
          onChange={(language) => onChange({ ...picks, language })}
        />
      )}
      {slots.expertise.length > 0 && (
        <ExpertiseChoicePicker
          slots={slots.expertise}
          picks={picks.expertise}
          onChange={(expertise) => onChange({ ...picks, expertise })}
          proficientSkillIds={proficientSkillIds}
        />
      )}
    </div>
  );
}

/**
 * A half-feat's "+1 ability" sub-choice — the props for {@link FeatAbilityPicker},
 * which the level-up ASI step and the creation wizard render inside a feat's
 * cause-block alongside the feat's other consequences.
 */
export interface FeatAbilityPick {
  /** The feat's structured ASI clause (abilities offered, amount, cap). */
  asi: FeatAsi;
  abilityScores: Record<AbilityCode, number>;
  value: AbilityCode | null;
  onChange: (ability: AbilityCode) => void;
}

/**
 * The "+1 ability" chips for a half-feat — the same numeric ability-tile
 * interaction as the ASI step's +2/+1+1 tiles (live "score → score+N"
 * preview), deliberately NOT an OptionGrid. Rubric reads BEFORE the picker it
 * explains, matching every sibling slot in the block. The cap comes from the
 * grant (`featAsi`): 20 for standard feats, 30 for Epic Boons — never
 * hardcoded.
 */
export function FeatAbilityPicker({
  asi,
  abilityScores,
  value,
  onChange,
}: FeatAbilityPick) {
  const { t, i18n } = useTranslation();
  const locale = asLocale(i18n.language);
  return (
    <div>
      <div className="opt-head">
        <span className="opt-head-label">
          {t("levelUp.asi.featAbilityHint", { amount: asi.amount })}
        </span>
      </div>
      {/* gap-2 matches the ASI step's sibling ability-tile grid — one chip
          rhythm across the whole step. */}
      <div className="flex flex-wrap gap-2">
        {asi.abilities.map((ab) => {
          const capped = abilityScores[ab] >= asi.cap;
          const chosen = value === ab;
          return (
            <button
              key={ab}
              type="button"
              disabled={capped}
              onClick={() => onChange(ab)}
              className={cn(
                "lvl-pick px-2 py-1 text-[0.7rem] font-semibold",
                chosen && !capped && "selected",
                capped && "opacity-40 cursor-not-allowed"
              )}
            >
              {abilityLabel(ab, locale)}{" "}
              <span className="font-mono text-text-secondary">
                {abilityScores[ab]}
                {!capped && chosen
                  ? ` → ${Math.min(asi.cap, abilityScores[ab] + asi.amount)}`
                  : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

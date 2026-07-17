/**
 * Expertise picker for `choice-expertise` grants (Skill Expert, etc.). Renders
 * one section per pending slot; the pool is the character's currently-
 * proficient skills (you can only gain Expertise in a skill you're proficient
 * in), passed in as `proficientSkillIds`.
 */
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { ALL_SKILLS } from "@/lib/compute";
import { WizardPickList } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import type {
  ExpertiseChoicePicks,
  ExpertiseChoiceSlot,
} from "@/lib/feat-expertise-choices";

// Expertise is chosen among skills, so it wears the same skill seal.
const SKILL_SEAL = <SocketSeal icon={Target} />;

interface Props {
  slots: ReadonlyArray<ExpertiseChoiceSlot>;
  picks: ExpertiseChoicePicks;
  onChange: (picks: ExpertiseChoicePicks) => void;
  /** Skill ids the character is proficient in (and not already expert). */
  proficientSkillIds: ReadonlySet<string>;
}

export function ExpertiseChoicePicker({
  slots,
  picks,
  onChange,
  proficientSkillIds,
}: Props) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <ExpertiseSlotPicker
          key={slot.slotId}
          slot={slot}
          picked={picks[slot.slotId] ?? []}
          proficientSkillIds={proficientSkillIds}
          onChange={(ids) => onChange({ ...picks, [slot.slotId]: ids })}
        />
      ))}
    </div>
  );
}

function ExpertiseSlotPicker({
  slot,
  picked,
  proficientSkillIds,
  onChange,
}: {
  slot: ExpertiseChoiceSlot;
  picked: ReadonlyArray<string>;
  proficientSkillIds: ReadonlySet<string>;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const options = ALL_SKILLS.filter((s) => proficientSkillIds.has(s.id)).map((s) => ({
    id: s.id,
    name: t(`skills.${s.id}`),
    seal: SKILL_SEAL,
  }));

  function toggle(id: string) {
    if (picked.includes(id)) {
      onChange(picked.filter((p) => p !== id));
    } else if (picked.length < slot.amount) {
      onChange([...picked, id]);
    } else {
      // At the limit → FIFO replace the oldest (matches the spell/feat picker).
      onChange([...picked.slice(1), id]);
    }
  }

  if (options.length === 0) {
    return (
      <p className="text-xs italic text-text-muted">
        {t("featChoices.noProficientSkills")}
      </p>
    );
  }
  return (
    <WizardPickList
      label={t("featChoices.pickExpertise", {
        count: slot.amount,
      })}
      options={options}
      selected={picked}
      total={slot.amount}
      onToggle={toggle}
      searchable={false}
    />
  );
}

/**
 * Skill-only picker for `choice-skill-proficiency` feat grants.
 * Mirrors the pattern of ToolChoicePicker / SkillOrToolPicker — one
 * section per slot from `pendingSkillSlotsForFeat`. Constrained to the
 * grant's `options[]` list; empty options list means "any skill".
 */
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { WizardPickList } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import {
  listAvailableForSkillSlot,
  type SkillChoicePicks,
  type SkillChoiceSlot,
} from "@/lib/feat-skill-choices";

const SKILL_SEAL = <SocketSeal icon={Target} />;

interface Props {
  slots: ReadonlyArray<SkillChoiceSlot>;
  picks: SkillChoicePicks;
  onChange: (picks: SkillChoicePicks) => void;
  /** Skills the character already has — disabled + un-pickable. */
  existingSkillIds: ReadonlySet<string>;
}

export function SkillChoicePicker({ slots, picks, onChange, existingSkillIds }: Props) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <SkillSlotPicker
          key={slot.slotId}
          slot={slot}
          existingSkillIds={existingSkillIds}
          picked={picks[slot.slotId] ?? []}
          onChange={(ids) => onChange({ ...picks, [slot.slotId]: ids })}
        />
      ))}
    </div>
  );
}

function SkillSlotPicker({
  slot,
  existingSkillIds,
  picked,
  onChange,
}: {
  slot: SkillChoiceSlot;
  existingSkillIds: ReadonlySet<string>;
  picked: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  // Already-owned skills are EXCLUDED (never disabled noise — rule 19); a
  // skill the player picked in THIS slot stays visible so its state shows.
  const options = listAvailableForSkillSlot(slot)
    .filter((s) => !existingSkillIds.has(s.id) || picked.includes(s.id))
    .map((s) => {
      const label = t(`skills.${s.id}`);
      return {
        id: s.id,
        name: label,
        searchText: `${label} ${s.name}`,
        seal: SKILL_SEAL,
      };
    });

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

  return (
    <WizardPickList
      label={t("featChoices.pickSkills", {
        count: slot.amount,
      })}
      options={options}
      selected={picked}
      total={slot.amount}
      onToggle={toggle}
      searchable={options.length > 12}
    />
  );
}

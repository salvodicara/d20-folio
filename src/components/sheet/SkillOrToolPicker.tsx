/**
 * Inline picker for Skilled-style "pick N skills OR tools" feat choices.
 *
 * Renders one section per slot from `pendingSkillOrToolSlotsForFeat`.
 * Each shows a unified grid (18 skills + 2024 SRD tools) and the player
 * picks `slot.amount` items. The parent stores the selection in a
 * SkillOrToolPicks object keyed by slot id.
 *
 * Same visual language as `FeatSpellChoicesPicker` — keep the UI cohesive.
 */
import { useTranslation } from "react-i18next";
import { ALL_SKILLS } from "@/lib/compute";
import { WizardPickList } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import { toolSealIcon } from "@/components/shared/item-icons";
import { srdOptionParts } from "@/components/shared/srd-option";
import {
  SRD_TOOLS_2024,
  type SkillOrToolPicks,
  type SkillOrToolSlot,
} from "@/lib/feat-skill-tool-choices";

interface Props {
  slots: ReadonlyArray<SkillOrToolSlot>;
  picks: SkillOrToolPicks;
  onChange: (picks: SkillOrToolPicks) => void;
  /** Skills the character already has — greyed out + un-pickable. */
  existingSkillIds: ReadonlySet<string>;
}

export function SkillOrToolPicker({ slots, picks, onChange, existingSkillIds }: Props) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <SkillOrToolSlotPicker
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

function SkillOrToolSlotPicker({
  slot,
  existingSkillIds,
  picked,
  onChange,
}: {
  slot: SkillOrToolSlot;
  existingSkillIds: ReadonlySet<string>;
  picked: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "it" ? "it" : "en";
  const skillGroup = t("abilities.skills");
  const toolGroup = t("equipment.tools");

  // Already-owned skills are EXCLUDED (never disabled noise — rule 19).
  // The visible heading carries the skill/tool family distinction. Skills need
  // no repeated generic glyph; tool seals remain because they distinguish a
  // useful second level (artisan tool / instrument / gaming set).
  const skills = ALL_SKILLS.filter(
    (s) => !existingSkillIds.has(s.id) || picked.includes(s.id)
  ).map((s) => {
    const label = t(`skills.${s.id}`);
    return {
      id: s.id,
      name: label,
      searchText: `${label} ${s.name} ${skillGroup} Skills`,
      group: skillGroup,
    };
  });
  // Tool names resolve from the SRD equipment catalogue by id (#107) — the single
  // source the inventory + proficiency surfaces also read, so no drift.
  const tools = SRD_TOOLS_2024.filter((tool) => tool.pickable !== false).map((tool) => {
    const { label, searchText } = srdOptionParts("equipment", tool.id, locale);
    return {
      id: tool.id,
      name: label,
      searchText: `${searchText} ${toolGroup} Tools`,
      group: toolGroup,
      seal: <SocketSeal icon={toolSealIcon(tool.category)} />,
    };
  });
  const options = [...skills, ...tools];

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
      label={t("featChoices.pickSkillsOrTools", {
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

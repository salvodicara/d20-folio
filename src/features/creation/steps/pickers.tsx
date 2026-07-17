/**
 * Creation pickers that bind to stable ids — the class-skills picker on the
 * wizard-F pick list (C1: no pre-F picker remains in either wizard). The class
 * gallery + Human-Versatile feat list live in the sibling wizard-F primitives
 * (`ClassGallery`, `WizardFeatList`).
 */
import { useTranslation } from "react-i18next";
import { Target } from "lucide-react";
import { WizardPickList, type WizardPickOption } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";

export function SkillsPickerSection({
  bgSkillIds,
  classSkillPool,
  classSkillCount,
  selectedClassSkills,
  onToggle,
}: {
  bgSkillIds: string[];
  classSkillPool: string[];
  classSkillCount: number;
  selectedClassSkills: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation();
  const picked = selectedClassSkills.length;
  // Background-granted skills are EXCLUDED from the offered pool — the picker
  // never shows a row only to say it's already yours (owner 2026-06-11,
  // rule 19; the Bio tab lists every effective proficiency).
  const pool = classSkillPool.filter((id) => !bgSkillIds.includes(id));
  if (pool.length === 0) return null;
  return (
    <WizardPickList
      label={t("create.skillsClass", { count: classSkillCount - picked })}
      options={pool.map(
        (id): WizardPickOption => ({
          id,
          name: t(`skills.${id}`),
          seal: <SocketSeal icon={Target} />,
        })
      )}
      selected={selectedClassSkills}
      total={classSkillCount}
      onToggle={onToggle}
      searchable={pool.length > 12}
    />
  );
}

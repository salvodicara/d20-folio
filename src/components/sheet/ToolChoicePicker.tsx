/**
 * Pure-tool picker for `choice-tool-proficiency` feat grants.
 * Renders one section per pending slot from `pendingToolSlotsForFeat`.
 * The options pool is constrained to the grant's `options[]` list (e.g.
 * 17 Artisan's Tools for Crafter, 10 Musical Instruments for Musician).
 */
import { useTranslation } from "react-i18next";
import { WizardPickList } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import { toolSealIcon } from "@/components/shared/item-icons";
import { srdOptionParts } from "@/components/shared/srd-option";
import { SRD_TOOLS_2024 } from "@/lib/feat-skill-tool-choices";
import type { ToolChoicePicks, ToolChoiceSlot } from "@/lib/feat-tool-choices";

interface Props {
  slots: ReadonlyArray<ToolChoiceSlot>;
  picks: ToolChoicePicks;
  onChange: (picks: ToolChoicePicks) => void;
}

export function ToolChoicePicker({ slots, picks, onChange }: Props) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <ToolSlotPicker
          key={slot.slotId}
          slot={slot}
          picked={picks[slot.slotId] ?? []}
          onChange={(ids) => onChange({ ...picks, [slot.slotId]: ids })}
        />
      ))}
    </div>
  );
}

function ToolSlotPicker({
  slot,
  picked,
  onChange,
}: {
  slot: ToolChoiceSlot;
  picked: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "it" ? "it" : "en";

  // Constrain the offered pool to the grant's options[] list. Names resolve from
  // the SRD equipment catalogue by id (#107), the single source the inventory +
  // proficiency surfaces also read — so a tool reads one canonical name everywhere.
  const allowedIds = new Set(slot.options);
  const options = SRD_TOOLS_2024.filter((tool) => allowedIds.has(tool.id)).map((tool) => {
    const { label, searchText } = srdOptionParts("equipment", tool.id, locale);
    return {
      id: tool.id,
      name: label,
      searchText,
      seal: <SocketSeal icon={toolSealIcon(tool.category)} />,
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
      label={t("featChoices.pickTools", {
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

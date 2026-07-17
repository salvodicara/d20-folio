/**
 * Language picker for `choice-language` grants. Renders one section per
 * pending slot from `pendingLanguageSlotsForFeat`. The pool is the grant's
 * `options[]` list, or the full 2024 standard roster when `options` is
 * empty ("a language of your choice").
 */
import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { WizardPickList } from "@/features/wizard/pick-list";
import { SocketSeal } from "@/features/wizard/seals";
import {
  listAvailableForLanguageSlot,
  type LanguageChoicePicks,
  type LanguageChoiceSlot,
} from "@/lib/feat-language-choices";
import { localizeSrd } from "@/i18n/resolver";

const LANGUAGE_SEAL = <SocketSeal icon={Languages} />;

interface Props {
  slots: ReadonlyArray<LanguageChoiceSlot>;
  picks: LanguageChoicePicks;
  onChange: (picks: LanguageChoicePicks) => void;
}

export function LanguageChoicePicker({ slots, picks, onChange }: Props) {
  return (
    <div className="space-y-4">
      {slots.map((slot) => (
        <LanguageSlotPicker
          key={slot.slotId}
          slot={slot}
          picked={picks[slot.slotId] ?? []}
          onChange={(ids) => onChange({ ...picks, [slot.slotId]: ids })}
        />
      ))}
    </div>
  );
}

function LanguageSlotPicker({
  slot,
  picked,
  onChange,
}: {
  slot: LanguageChoiceSlot;
  picked: ReadonlyArray<string>;
  onChange: (ids: string[]) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "it" ? "it" : "en";

  // IDS only from the engine; the LABEL is resolved by id here (presenter layer),
  // so a tongue reads its canonical localized name and a new language is JUST JSON.
  const options = listAvailableForLanguageSlot(slot).map((id) => ({
    id,
    name: localizeSrd("language", id, "name", locale),
    searchText: `${localizeSrd("language", id, "name", locale)} ${localizeSrd("language", id, "name", "en")}`,
    seal: LANGUAGE_SEAL,
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

  return (
    <WizardPickList
      label={t("featChoices.pickLanguages", {
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

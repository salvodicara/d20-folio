/**
 * The situational attack chips on the Play board (Unseen Target, Unseen Attacker,
 * Ranged in Melee, Long Range, Underwater, Mounted): one tap lights what the
 * table sees and the attack cards net it into their Advantage / Disadvantage. An
 * attack fact ends at the end of your turn, Underwater and Mounted when the fight
 * ends; a second tap clears either. A lit Underwater or Mounted
 * chip shows the rule line the sheet cannot apply for you.
 */
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Icon } from "@/components/ui/icon";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import {
  lightChipsView,
  situationChipsView,
  type LightChipVM,
} from "@/lib/views/tracker-view";
import type { SituationLasts } from "@/lib/situational-states";
import { commitLight, commitSituation } from "./action-state-commit";
import { useMemo } from "react";
import { litLightLevel } from "@/lib/light-states";
import { sheetDarkvisionFt } from "@/lib/play/light";
import { localeDistance } from "@/lib/utils";

/** The chip hint: a turn fact holds to the end of the turn, a fight fact (Underwater,
 * Mounted) until tapped off or the encounter ends. */
function hintKey(chip: { on: boolean; lasts: SituationLasts }): string {
  if (chip.lasts === "fight") {
    return chip.on ? "combat.situationLitHintFight" : "combat.situationOffHintFight";
  }
  return chip.on ? "combat.situationLitHint" : "combat.situationOffHint";
}

function toastKey(chip: { on: boolean; lasts: SituationLasts }): string {
  if (chip.on) return "combat.situationOffToast";
  return chip.lasts === "fight"
    ? "combat.situationOnToastFight"
    : "combat.situationOnToast";
}

export function SituationChips() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const activeFeatures = useCharacterStore((s) => s.character?.session.activeFeatures);
  const chips = situationChipsView(locale).map((chip) => ({
    ...chip,
    on: (activeFeatures ?? []).includes(chip.activeKey),
  }));
  const doc = useCharacterStore((s) => s.character);
  const darkvisionFt = useMemo(() => (doc ? sheetDarkvisionFt(doc) : 0), [doc]);
  const lit = litLightLevel({ activeFeatures });
  const lightChips = lightChipsView(locale, darkvisionFt);
  const litChip = lightChips.find((chip) => chip.level === lit);
  // What the lit level does to this hero: the SRD line, or what Darkvision makes of it.
  const lightNote = (chip: LightChipVM): string =>
    "text" in chip.note
      ? chip.note.text
      : t(chip.note.key, { range: localeDistance(darkvisionFt, locale) });

  const litNames = [
    ...chips.filter((chip) => chip.on).map((chip) => chip.name),
    ...(litChip ? [litChip.name] : []),
  ];
  const situationButton = (chip: (typeof chips)[number]) => (
    <button
      key={chip.id}
      type="button"
      className="status-badge sb-toggle"
      data-kind={chip.on ? "active" : undefined}
      aria-pressed={chip.on}
      title={t(hintKey(chip), {
        summary: chip.summary,
      })}
      onClick={() =>
        registerUndoableToast(
          {
            message: t(toastKey(chip), { name: chip.name }),
          },
          () => commitSituation(chip.id, !chip.on),
          { turnScoped: true }
        )
      }
    >
      <span className="sb-label">{chip.name}</span>
    </button>
  );
  const lightButton = (chip: LightChipVM) => {
    const on = lit === chip.level;
    return (
      <button
        key={chip.level}
        type="button"
        className="status-badge sb-toggle"
        data-kind={on ? "active" : undefined}
        aria-pressed={on}
        title={t(on ? "combat.situationLitHintFight" : "combat.situationOffHintFight", {
          summary: lightNote(chip),
        })}
        onClick={() =>
          registerUndoableToast(
            {
              message: on
                ? t("combat.situationOffToast", { name: chip.name })
                : t("combat.situationOnToastFight", { name: chip.name }),
            },
            () => commitLight(on ? null : chip.level),
            { turnScoped: true }
          )
        }
      >
        <span className="sb-label">{chip.name}</span>
      </button>
    );
  };

  // Progressive disclosure (owner 2026-10-16: beginners first). The special
  // situations sit behind one closed row; once opened, each reads as a switch with
  // what it does in plain words. What is lit stays in view while the row is shut.
  return (
    <details className="situations mb-4">
      <summary className="situations-head">
        <span>{t("combat.situationsSpecial")}</span>
        {litNames.length > 0 && (
          <span className="situations-lit">{litNames.join(" · ")}</span>
        )}
        <Icon as={ChevronDown} size="sm" decorative className="situations-chevron" />
      </summary>
      <ul className="situations-list" role="group" aria-label={t("combat.situations")}>
        {chips.map((chip) => (
          <li key={chip.id} className="situations-row">
            {situationButton(chip)}
            <span className="situations-what">{chip.summary}</span>
          </li>
        ))}
        {lightChips.map((chip) => (
          <li key={chip.level} className="situations-row">
            {lightButton(chip)}
            <span className="situations-what">{lightNote(chip)}</span>
          </li>
        ))}
      </ul>
      {chips
        .filter((chip) => chip.on)
        .flatMap((chip) =>
          chip.notes.map((note) => (
            <p key={`${chip.id}-${note.id}`} className="situations-note">
              <span className="font-medium text-text-primary">{chip.name}:</span>{" "}
              {note.text}
            </p>
          ))
        )}
    </details>
  );
}

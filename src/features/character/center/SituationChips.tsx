/**
 * The situational attack chips on the Play board (Unseen Target, Unseen Attacker,
 * Ranged in Melee, Long Range, Underwater, Mounted): one tap lights what the
 * table sees and the attack cards net it into their Advantage / Disadvantage. An
 * attack fact ends at the end of your turn, Underwater and Mounted when the fight
 * ends; a second tap clears either. A lit Underwater or Mounted
 * chip shows the rule line the sheet cannot apply for you.
 */
import { useTranslation } from "react-i18next";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import { situationChipsView } from "@/lib/views/tracker-view";
import type { SituationLasts } from "@/lib/situational-states";
import { commitSituation } from "./action-state-commit";

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

  return (
    <div className="mb-4">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t("combat.situations")}
      >
        <span className="mr-1 text-[0.7rem] italic text-text-secondary" aria-hidden>
          {t("combat.situations")}
        </span>
        {chips.map((chip) => (
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
        ))}
      </div>
      {chips
        .filter((chip) => chip.on)
        .flatMap((chip) =>
          chip.notes.map((note) => (
            <p
              key={`${chip.id}-${note.id}`}
              className="mt-1.5 text-xs text-text-secondary"
            >
              <span className="font-medium text-text-primary">{chip.name}:</span>{" "}
              {note.text}
            </p>
          ))
        )}
    </div>
  );
}

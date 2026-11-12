/**
 * The table's situations on the new Play screen (rules-gap board B, parity with the
 * classic sheet's SituationChips): one tap lights what the table sees (Unseen Target,
 * Unseen Attacker, Ranged in Melee, Long Range, Underwater, Mounted, Squeezing, the
 * light) and the attack rows net it into their Advantage / Disadvantage. An attack
 * fact ends with the turn; Underwater and Mounted when the fight ends; a second tap
 * clears it. A lit one says the rule line the sheet cannot apply for you.
 *
 * On a phone the row is one line: only the lit chips, after a «Situation ▾» disclosure
 * that opens the full set (Foundry's collapsed status-effect tray); the desktop has the
 * width for all of them and shows the label alone.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  commitLight,
  commitSituation,
} from "@/features/character/center/action-state-commit";
import { useLocale } from "@/hooks/useLocale";
import { useSheetReadonly } from "@/hooks/useSheetReadonly";
import { litLightLevel } from "@/lib/light-states";
import { sheetDarkvisionFt } from "@/lib/play/light";
import { localeDistance } from "@/lib/utils";
import { lightChipsView, situationChipsView } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableToast } from "@/stores/undoStore";
import { Chip, Icon } from "@/ui";

export function PlaySituations() {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const readonly = useSheetReadonly();
  const doc = useCharacterStore((s) => s.character);
  const activeFeatures = doc?.session.activeFeatures;
  const flanking = doc?.session.tableRules?.flanking;
  const darkvisionFt = useMemo(() => (doc ? sheetDarkvisionFt(doc) : 0), [doc]);
  const [open, setOpen] = useState(false);
  if (!doc) return null;
  const chips = situationChipsView(locale, flanking).map((chip) => ({
    ...chip,
    on: (activeFeatures ?? []).includes(chip.activeKey),
  }));
  const lit = litLightLevel({ activeFeatures });
  const lights = lightChipsView(locale, darkvisionFt);
  const litNotes = [
    ...chips
      .filter((c) => c.on)
      .flatMap((c) => c.notes.map((n) => `${c.name}: ${n.text}`)),
    ...lights
      .filter((l) => l.level === lit)
      .map(
        (l) =>
          `${l.name}: ${"text" in l.note ? l.note.text : t(l.note.key, { range: localeDistance(darkvisionFt, locale) })}`
      ),
  ];
  return (
    <div className="f-ask f-situations" data-open={open || undefined}>
      <div className="f-chips" role="group" aria-label={t("combat.situations")}>
        <span className="f-lbl">{t("combat.situations")}</span>
        <button
          type="button"
          className="f-sit-more"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {t("combat.situations")}
          <Icon name="u-expand" />
        </button>
        {chips.map((chip) => (
          <Chip
            key={chip.id}
            pressed={chip.on}
            disabled={readonly}
            title={chip.summary}
            onClick={() =>
              registerUndoableToast(
                {
                  message: t(
                    chip.on
                      ? "combat.situationOffToast"
                      : chip.lasts === "fight"
                        ? "combat.situationOnToastFight"
                        : "combat.situationOnToast",
                    { name: chip.name }
                  ),
                },
                () => commitSituation(chip.id, !chip.on),
                { turnScoped: true }
              )
            }
          >
            {chip.name}
          </Chip>
        ))}
        {lights.map((chip) => {
          const on = lit === chip.level;
          return (
            <Chip
              key={chip.level}
              pressed={on}
              disabled={readonly}
              onClick={() =>
                registerUndoableToast(
                  {
                    message: t(
                      on ? "combat.situationOffToast" : "combat.situationOnToastFight",
                      {
                        name: chip.name,
                      }
                    ),
                  },
                  () => commitLight(on ? null : chip.level),
                  { turnScoped: true }
                )
              }
            >
              {chip.name}
            </Chip>
          );
        })}
      </div>
      {litNotes.map((note) => (
        <p key={note} className="f-help">
          {note}
        </p>
      ))}
    </div>
  );
}

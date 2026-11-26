/**
 * What the start of my turn brings, under the turn strip (the classic turn band's
 * turn-start row, on the same `useTurnStartNotes` source): a heal or temporary Hit Points
 * a feature gives at the turn's start (Heroic Rally, Heroism), as a quiet one-tap apply
 * with undo, never automatic; the round-1 Death Strike reminder as a note. An applied
 * offer leaves the row for the rest of the turn, on every surface; its undo brings it back.
 */
import { useTranslation } from "react-i18next";

import { applyTurnStartOffer, useTurnStartNotes } from "@/domains/play/turn-start-notes";
import type { Locale } from "@/lib/locale";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";
import { Button } from "@/ui";

export function PlayTurnStart({
  doc,
  round,
  locale,
}: {
  doc: CharacterDoc;
  round: number;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const notes = useTurnStartNotes(doc, round);
  if (notes.length === 0) return null;
  return (
    <div className="f-turn-start" role="group" aria-label={t("play.turnStart")}>
      {notes.map((note) => {
        const name =
          note.kind === "burning" ? "" : grantSourceLabel(note.sourceId, locale);
        // Burning: its damage at the turn's start, entered in «Danni e cure» (no roll)
        if (note.kind === "burning")
          return (
            <p key={note.id} className="f-note" data-c="ini" data-note={note.id}>
              {t("play.fire.turnStart", { dice: note.dice })}
            </p>
          );
        if (note.kind === "death-strike")
          return (
            <p key={note.id} className="f-note" data-c="ini" data-note={note.id}>
              {t("combat.round1DamageDouble", {
                name,
                ability: t(`abilities.${note.saveAbility}_short`),
                dc: note.saveDC,
              })}
            </p>
          );
        const heal = note.kind === "heal";
        return (
          <div
            key={note.id}
            className="f-note f-turn-offer"
            data-c="cmp"
            data-note={note.id}
          >
            <span>
              {t(heal ? "combat.turnStartRegen" : "combat.turnStartTempHp", {
                amount: note.amount,
                name,
              })}
            </span>
            <Button
              kind="ghost"
              icon={heal ? "u-heal" : undefined}
              onClick={() => applyTurnStartOffer(note, t)}
            >
              {t(heal ? "combat.turnStartRegenApply" : "combat.turnStartTempHpApply", {
                amount: note.amount,
              })}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The DM's end-of-fight write-up on the Scontro tab, at parity with the classic «Save
 * this fight to the Chronicle» dialog (coordinator, 2026-11-26; the Chronicle and the
 * Diario stay as they are): a chapter title (the date when left blank), the DM's
 * account, the outcome (the fight's own guess first), and the fight's record with each
 * line removable. «Save to Chronicle» appends one chapter, then the fight ends; «Skip»
 * ends it without saving; closing keeps the fight running.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { fightChapterClose, type EncounterClose } from "@/domains/combat/fight-write-up";
import type { EncounterOutcome } from "@/types/combat-chronicle";
import { Button, Chip, Dialog, Field, Icon, TextArea } from "@/ui";

const OUTCOMES: readonly EncounterOutcome[] = ["victory", "ended"];

export function EndFightDialog({
  lines,
  outcome: guessed,
  onSave,
  onSkip,
  onCancel,
}: {
  /** The fight's record, already in words, oldest first. */
  lines: ReadonlyArray<{ id: string; round?: number; text: string }>;
  /** The outcome the fight suggests (`inferOutcome`). */
  outcome: EncounterOutcome;
  /** Resolves once the chapter is in (the caller ends the fight); rejects to retry. */
  onSave: (close: EncounterClose) => Promise<void>;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  // The app's language, not the browser's: an Italian table titles "26 nov 2026".
  const date = useMemo(
    () => new Date().toLocaleDateString(i18n.language, { dateStyle: "medium" }),
    [i18n.language]
  );
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState(guessed);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const save = () => {
    if (saving) return;
    setSaving(true);
    onSave(fightChapterClose({ title, note, lines, removed, outcome }, t, date)).catch(
      () => setSaving(false)
    );
  };
  const toggle = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Dialog
      open
      onClose={onCancel}
      color="log"
      title={t("combatChronicle.endTitle")}
      closeLabel={t("common.close")}
      actions={
        <>
          <Button kind="quiet" disabled={saving} onClick={onSkip}>
            {t("common.skip")}
          </Button>
          <Button kind="primary" wide disabled={saving} onClick={save}>
            {t("combatChronicle.endSave")}
          </Button>
        </>
      }
    >
      <div className="f-ask">
        <Field
          label={t("combatChronicle.endTitleLabel")}
          placeholder={t("combatChronicle.endTitlePlaceholder", { date })}
          maxLength={80}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <TextArea
          label={t("combatChronicle.endNoteLabel")}
          placeholder={t("combatChronicle.endNotePlaceholder")}
          maxLength={4000}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="f-ask">
        <span className="f-lbl">{t("combatChronicle.endOutcomeLabel")}</span>
        <div className="f-chips">
          {OUTCOMES.map((o) => (
            <Chip key={o} pressed={outcome === o} onClick={() => setOutcome(o)}>
              {t(
                o === "victory"
                  ? "combatChronicle.outcomeVictory"
                  : "combatChronicle.outcomeEnded"
              )}
            </Chip>
          ))}
        </div>
      </div>
      <div className="f-ask">
        <span className="f-lbl">{t("combatChronicle.endLinesLabel")}</span>
        {lines.length === 0 ? (
          <p className="f-quiet">{t("combatChronicle.endEmpty")}</p>
        ) : (
          <ul className="f-endlines">
            {lines.map((line) => {
              const gone = removed.has(line.id);
              return (
                <li key={line.id} data-gone={gone || undefined}>
                  <span>{line.text}</span>
                  <button
                    type="button"
                    className="f-endline-x"
                    aria-label={t("combatChronicle.endDeleteLine")}
                    aria-pressed={gone}
                    onClick={() => toggle(line.id)}
                  >
                    <Icon name="u-delete" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

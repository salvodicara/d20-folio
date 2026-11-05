/** Durable entered-roll prompt for damage-triggered Concentration saves. */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import { useCharacterStore } from "@/stores/characterStore";
import { registerUndoableResult } from "@/stores/undoStore";
import { useLocale } from "@/hooks/useLocale";
import {
  concentrationSaveD20Context,
  enteredD20FaceCount,
  resolveCharacterConcentrationSave,
} from "@/lib/character-d20-tests";
import { failedD20Savers } from "@/lib/play/failed-d20";
import { beginWholeStateUndo } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { concentrationLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc } from "@/types/character";
import type { PendingConcentrationSave } from "@/types/combat-state";
import { Button } from "@/components/ui/button";
import { EnteredD20Faces } from "./molecules/EnteredD20Faces";

export function ConcentrationSaveBanner() {
  const character = useCharacterStore((state) => state.character);
  const pending = useCharacterStore((state) => state.combatPendingConcentrationSaves[0]);
  const queueLength = useCharacterStore(
    (state) => state.combatPendingConcentrationSaves.length
  );
  if (!character || !pending) return null;
  return (
    <ConcentrationSavePrompt
      key={pending.id}
      character={character}
      pending={pending}
      queueLength={queueLength}
    />
  );
}

function ConcentrationSavePrompt({
  character,
  pending,
  queueLength,
}: {
  character: CharacterDoc;
  pending: PendingConcentrationSave;
  queueLength: number;
}) {
  const { t } = useTranslation();
  const { language: locale } = useLocale();
  const [firstFace, setFirstFace] = useState(10);
  const [secondFace, setSecondFace] = useState(10);
  const context = useMemo(
    () => concentrationSaveD20Context(character, pending),
    [character, pending]
  );
  const faceCount = enteredD20FaceCount(context);
  const rollMode =
    context.advantageSourceIds.length > 0 && context.disadvantageSourceIds.length === 0
      ? "advantage"
      : context.disadvantageSourceIds.length > 0 &&
          context.advantageSourceIds.length === 0
        ? "disadvantage"
        : null;

  const faces = faceCount === 2 ? [firstFace, secondFace] : [firstFace];
  // A failed save a Reaction spell can turn into a 20 (`failedD20Becomes`), while the
  // Reaction is free: offered beside «Applica».
  const reactionFree = useCombatStore((state) => !state.reactionUsed);
  const saver = useMemo(() => {
    if (!reactionFree) return null;
    try {
      const failed =
        resolveCharacterConcentrationSave(character, pending, faces).reviewedOutcome
          .status === "failure";
      return failed ? (failedD20Savers(character)[0] ?? null) : null;
    } catch {
      return null;
    }
    // `faces` is rebuilt from the two face states each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, pending, reactionFree, firstFace, secondFace, faceCount]);

  /** Cast the saver as a Reaction: its slot and the Reaction are spent, the d20 counts
   *  as its face, and one undo takes all of it back. */
  function castSaver(): void {
    if (!saver) return;
    const store = useCharacterStore.getState();
    const seal = beginWholeStateUndo();
    store.dispatch({ kind: "spend-slot", level: saver.slotLevel, pactMagic: false });
    const reacted = useCombatStore.getState().useReaction(`spell-${saver.spellId}`);
    const committed = store.commitPendingConcentrationSave(
      pending,
      faces.map(() => saver.face)
    );
    const restore = seal?.() ?? null;
    const undo = () => {
      const ok = restore ? restore() : false;
      if (reacted) useCombatStore.getState().resetReaction();
      return ok;
    };
    if (!committed) {
      undo();
      return;
    }
    const message = t("combat.failedD20UsedToast", {
      spell: concentrationLabel(saver.spellId, locale),
      total: committed.result.total,
    });
    registerUndoableResult({ message }, undo, castSaver);
  }

  function commit(): void {
    const committed = useCharacterStore
      .getState()
      .commitPendingConcentrationSave(pending, faces);
    if (!committed) return;
    const success = committed.result.reviewedOutcome.status === "success";
    const message = t(
      success
        ? "combat.concentrationSaveSuccessToast"
        : "combat.concentrationSaveFailureToast",
      { total: committed.result.total }
    );
    registerUndoableResult({ message }, committed.undo, commit);
  }

  return (
    <div className="conc-banner conc-banner-prompt" role="status" aria-live="polite">
      <span className="conc-banner-mark" aria-hidden />
      <span className="conc-banner-text">
        {t("combat.concentrationSavePrompt", {
          spell: concentrationLabel(pending.spell, locale),
          dc: pending.difficultyClass,
        })}
        {queueLength > 1 && (
          <span className="ml-2 font-sans text-xs not-italic text-text-secondary">
            {t("combat.concentrationSaveQueue", { count: queueLength })}
          </span>
        )}
      </span>
      <div className="concentration-save-roll flex flex-wrap items-center gap-2">
        {rollMode && (
          <span className="rounded-sm border border-border-subtle px-1.5 py-0.5 font-mono text-[length:var(--text-micro)] uppercase tracking-[0.08em] text-text-secondary">
            <GlossaryTip term={rollMode} rubric={t(`combat.rollMode.${rollMode}`)} />
          </span>
        )}
        <EnteredD20Faces
          faceCount={faceCount}
          first={firstFace}
          second={secondFace}
          onFirstChange={setFirstFace}
          onSecondChange={setSecondFace}
          singleAriaLabel={t("combat.concentrationSaveRollAria")}
          firstAriaLabel={t("combat.d20FirstAria")}
          secondAriaLabel={t("combat.d20SecondAria")}
          decrementLabel={t("combat.healRollDec")}
          incrementLabel={t("combat.healRollInc")}
        />
        <Button variant="secondary" size="sm" onClick={commit}>
          {t("combat.apply")}
        </Button>
        {saver && (
          <Button variant="primary" size="sm" onClick={castSaver}>
            {t("combat.failedD20Use", {
              spell: concentrationLabel(saver.spellId, locale),
              face: saver.face,
            })}
          </Button>
        )}
      </div>
    </div>
  );
}

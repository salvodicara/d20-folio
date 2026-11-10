/**
 * The end-of-fight write-up (headless): the outcome it guesses, the chapter built from
 * the DM's title (the date when left blank), note and kept record lines, and the save,
 * the one Chronicle write per fight. Shared by the classic «Save this fight to the
 * Chronicle» dialog and the new fight screen.
 */
import type { TFunction } from "i18next";
import { appendChronicleChapter } from "@/features/campaigns/campaign-io";
import { useChronicleStore } from "@/features/campaigns/chronicleStore";
import { DEV_BYPASS_AUTH } from "@/lib/dev-bypass";
import { encounterCloseDrafts } from "@/lib/session-log/encounter-mirror";
import { buildEncounterChapter } from "@/lib/views/combat-chronicle-view";
import { useToastStore } from "@/stores/toastStore";
import type { EncounterOutcome } from "@/types/combat-chronicle";

export { inferOutcome } from "@/features/campaigns/combat-chronicle";

/** What saving hands back: the chapter for the book, the note and the outcome the
 *  session report records. */
export interface EncounterClose {
  chapter: string;
  note: string;
  outcome: EncounterOutcome;
}

export function fightChapterClose(
  args: {
    title: string;
    note: string;
    lines: ReadonlyArray<{ id: string; round?: number; text: string }>;
    /** Record lines the DM took out of the chapter. */
    removed: ReadonlySet<string>;
    outcome: EncounterOutcome;
  },
  t: TFunction,
  /** Today, in the app's language: the title when the DM leaves it blank. */
  date: string
): EncounterClose {
  const title = args.title.trim() || t("combatChronicle.endTitlePlaceholder", { date });
  return {
    chapter: buildEncounterChapter(
      {
        title,
        note: args.note,
        lines: args.lines.filter((line) => !args.removed.has(line.id)),
        outcome: args.outcome,
      },
      t
    ),
    note: args.note.trim(),
    outcome: args.outcome,
  };
}

/**
 * Save the chapter to the Chronicle. Resolves once it is in (the caller then ends the
 * fight); rejects when refused, so the dialog stays open and the fight running for a
 * retry. The session report (note and outcome) is not awaited: offline it queues.
 */
export function saveFightToChronicle(
  args: {
    campaignId: string;
    uid: string;
    encounterId: string;
    close: EncounterClose;
    writeLog: (drafts: ReturnType<typeof encounterCloseDrafts>) => void;
  },
  t: TFunction
): Promise<void> {
  const { close } = args;
  args.writeLog(encounterCloseDrafts(args.encounterId, close.note, close.outcome));
  // Dev only: no Firestore echo under the bypass, so mirror the chapter into the store.
  if (DEV_BYPASS_AUTH) {
    useChronicleStore.getState().appendChapter(close.chapter, args.uid, new Date());
  }
  const toast = (message: string, duration: number): void => {
    useToastStore.getState().showToast({ message, duration });
  };
  return appendChronicleChapter(args.campaignId, {
    chapter: close.chapter,
    editedBy: args.uid,
  }).then(
    () => toast(t("combatChronicle.savedToast"), 3000),
    (error: unknown) => {
      console.error("Chronicle append failed", error);
      toast(t("combatChronicle.saveFailedToast"), 6000);
      throw error;
    }
  );
}

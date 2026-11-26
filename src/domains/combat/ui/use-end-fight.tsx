/**
 * «Fine scontro» on the Scontro tab. The DM's opens the end-of-fight write-up first (as
 * the classic hub did), then the end; anyone else's ends the fight at once (anyone may
 * end, owner 2026-10-23), with no write-up. Save appends one Chronicle chapter and ends the fight;
 * Skip ends it without saving; closing the dialog keeps it running. The fight's record
 * is the same feed the tab shows, in words.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { usePartyNames } from "@/domains/campaign/ui/use-party";
import type { FightControls } from "@/domains/combat/fight-controls";
import { endFightWithChapter, inferOutcome } from "@/domains/combat/fight-write-up";
import { EndFightDialog } from "@/domains/combat/ui/EndFightDialog";
import { moves, useFightMove, type Toaster } from "@/domains/combat/ui/fight-moves";
import { useSessionLog } from "@/features/campaigns/useSessionLog";
import type { Locale } from "@/lib/locale";
import { encounterFeed } from "@/lib/session-log";
import { localizePlayEvent } from "@/lib/views/session-report-view";
import type { CampaignDoc, EncounterState } from "@/types/campaign";

type Reason = FightControls["suggestEnd"];

export function useEndFight(
  campaign: CampaignDoc,
  encounter: EncounterState,
  uid: string,
  isDm: boolean,
  locale: Locale,
  onToast: Toaster,
  /** The plain end (no write-up): a player's «Fine scontro». */
  endNow: (reason?: Reason) => void
) {
  const { t } = useTranslation();
  const move = useFightMove(onToast);
  const [reason, setReason] = useState<Reason | "open" | null>(null);
  const names = useReportNames(campaign, locale, usePartyNames(campaign));
  const log = useSessionLog(campaign.id, uid, campaign.dmUid, encounter.epoch);
  const encounterId = String(encounter.epoch);
  const lines = useMemo(() => {
    if (reason === null) return [];
    const start = log.entries.find(
      (e) => e.event.kind === "encounter-start" && e.event.encounterId === encounterId
    );
    const foes = start?.event.kind === "encounter-start" ? (start.event.names ?? {}) : {};
    const who = (id: string | undefined): string =>
      (id && (foes[id] ?? names.pc(id))) || t("combatChronicle.someone");
    return encounterFeed(log.entries, encounterId).flatMap((line) => {
      const text = localizePlayEvent(line.event, t, who, names);
      return text
        ? [{ id: line.id, ...(line.round ? { round: line.round } : {}), text }]
        : [];
    });
  }, [reason, log.entries, encounterId, names, t]);
  const end = (why: Reason | "open") =>
    move(
      moves.end(campaign.id, why === "open" ? undefined : (why ?? undefined)),
      t("fight.endDone")
    );
  const dialog = isDm && reason !== null && (
    <EndFightDialog
      lines={lines}
      outcome={inferOutcome(encounter)}
      onCancel={() => setReason(null)}
      onSkip={() => {
        setReason(null);
        end(reason);
      }}
      onSave={(close) =>
        // A refused chapter rejects (the dialog stays open, the fight running); once it
        // is in, the fight ends, and the end's undo also takes the chapter back.
        endFightWithChapter(
          {
            campaignId: campaign.id,
            uid,
            encounterId,
            close,
            writeLog: (drafts) => void log.append(drafts).catch(() => undefined),
            ...(reason !== "open" ? { reason } : {}),
          },
          t
        ).then((undo) => {
          setReason(null);
          if (!undo) {
            onToast(t("fight.moved"));
            return;
          }
          onToast(t("fight.endDone"), () => {
            void undo().then((ok) => {
              if (!ok) onToast(t("fight.tooLate"));
            });
          });
        })
      }
    />
  );
  return {
    end: (why?: Reason) => (isDm ? setReason(why ?? "open") : endNow(why)),
    dialog,
  };
}

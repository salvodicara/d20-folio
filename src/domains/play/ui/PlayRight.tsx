/**
 * The Play screen's right column (approved prototype x-play): «Iniziativa» while the
 * character's campaign fights (the same list as the campaign's Scontro), and «Resoconto»,
 * the campaign's latest evening as the Diario tells it (blocks, times, signed notes),
 * with «Copia il resoconto». A character attached to no campaign shows neither.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { usePartyNames } from "@/domains/campaign/ui/use-party";
import { diaryBlocks } from "@/domains/chronicle/diary-view";
import { ReportBlocks } from "@/domains/chronicle/ui/ReportBlocks";
import { useReportNames } from "@/domains/chronicle/ui/report-names";
import { fightRows } from "@/domains/combat/fight-rows-view";
import { FightLine } from "@/domains/combat/ui/FightLine";
import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { useSessionReports } from "@/features/campaigns/useSessionReports";
import { useSheetCombat } from "@/features/character/center/turn-state";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { Locale } from "@/lib/locale";
import { buildReport, foldSession } from "@/lib/session-log";
import { renderSessionReport } from "@/lib/views/session-report-view";
import { useAuthStore } from "@/stores/authStore";
import type { CampaignDoc } from "@/types/campaign";
import { Button, Panel } from "@/ui";

/** The campaign this character is attached to (one read on open), or null. */
function useAttachedCampaign(characterId: string): CampaignDoc | null {
  const uid = useAuthStore((s) => s.user?.uid);
  const [campaign, setCampaign] = useState<CampaignDoc | null>(null);
  useEffect(() => {
    if (!uid) return;
    let live = true;
    listSharedCampaigns(uid)
      .then((all) => {
        if (live)
          setCampaign(
            all.find((c) => c.memberDetails[uid]?.characterId === characterId) ?? null
          );
      })
      .catch((error: unknown) =>
        diagnosticsLog("warn", "play.campaign-read-failed", { message: String(error) })
      );
    return () => {
      live = false;
    };
  }, [uid, characterId]);
  return campaign;
}

export function PlayRight({
  characterId,
  locale,
  onToast,
}: {
  characterId: string;
  locale: Locale;
  onToast: (message: string) => void;
}) {
  const campaign = useAttachedCampaign(characterId);
  return (
    <div className="f-stack f-right">
      <Initiative locale={locale} />
      {campaign && <Report campaign={campaign} locale={locale} onToast={onToast} />}
    </div>
  );
}

function Initiative({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const fight = useSheetCombat();
  if (!fight) return null;
  const rows = fightRows(fight.view.rows, fight.view.currentId, {}, locale);
  return (
    <Panel color="ini" title={t("fight.listTitle", { round: fight.round })}>
      {rows.map((row) => (
        <FightLine key={row.ids.join("+")} row={row} />
      ))}
    </Panel>
  );
}

function Report({
  campaign,
  locale,
  onToast,
}: {
  campaign: CampaignDoc;
  locale: Locale;
  onToast: (message: string) => void;
}) {
  const { t } = useTranslation();
  const reports = useSessionReports(campaign.id);
  const names = useReportNames(campaign, locale, usePartyNames(campaign));
  const latest = reports.logs[0];
  const sections = useMemo(
    () =>
      latest ? buildReport(foldSession(latest.items, { dmUid: campaign.dmUid })) : [],
    [latest, campaign.dmUid]
  );
  const blocks = useMemo(() => diaryBlocks(sections), [sections]);
  const players = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(campaign.memberDetails).map(([uid, m]) => [uid, m.displayName])
      ),
    [campaign.memberDetails]
  );
  if (blocks.length === 0) return null;
  const copy = () => {
    const text = renderSessionReport(sections, campaign.name, t, names, {
      notes: latest?.notes,
    });
    void navigator.clipboard
      .writeText(text)
      .then(() => onToast(t("sessionReport.copied")));
  };
  return (
    <Panel
      color="log"
      title={t("play.report")}
      foot={
        <Button kind="quiet" icon="u-copy" onClick={copy}>
          {t("diary.copyReport")}
        </Button>
      }
    >
      <ReportBlocks blocks={blocks} names={names} players={players} locale={locale} />
    </Panel>
  );
}

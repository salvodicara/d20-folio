/**
 * useSessionReports — the campaign's recent session logs, read once per `reload` (no
 * standing listener) and joined to a session page by local day. The report itself is
 * rendered by {@link import("./SessionDayReport").SessionDayReport}.
 */

import { useCallback, useEffect, useState } from "react";

import { sessionLogStoreFor } from "@/features/campaigns/session-log-source";
import { diagnosticsLog } from "@/lib/diagnostics";
import type { LogItem } from "@/lib/session-log";

const RECENT_LOGS = 20;

export interface SessionLog {
  id: string;
  lastAt: number;
  items: LogItem[];
}

/** The local day a log id names (`2026-10-08-2` → 8 Oct 2026), or null. */
export function dayOfLog(id: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(id);
  return match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null;
}

/** A log's id is its local day (`2026-10-08`, a second sitting `2026-10-08-2`). */
export function dayKey(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface SessionReports {
  /** Every recent non-empty log, newest first. */
  logs: SessionLog[];
  /** The logs recorded on `date`'s local day, oldest sitting first. */
  logsOn: (date: Date) => SessionLog[];
  /** Re-read the recent logs (a session played since the page loaded). */
  reload: () => void;
}

export function useSessionReports(campaignId: string): SessionReports {
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const reload = useCallback((): void => {
    sessionLogStoreFor(campaignId)
      .recent(RECENT_LOGS)
      .then((recent) => setLogs(recent.filter((s) => s.items.length > 0)))
      .catch((error: unknown) =>
        diagnosticsLog("warn", "session-log.report-read-failed", {
          message: String(error),
        })
      );
  }, [campaignId]);
  useEffect(() => reload(), [reload]);
  const logsOn = useCallback(
    (date: Date): SessionLog[] => {
      const day = dayKey(date);
      return logs
        .filter((log) => log.id === day || log.id.startsWith(`${day}-`))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    },
    [logs]
  );
  return { logs, logsOn, reload };
}

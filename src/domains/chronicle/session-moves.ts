/**
 * The campaign's sessions (headless): create one (numbered after the others, empty and
 * ready to write in), rename, delete; the next session the DM sets, still «tonight» for
 * a few hours after it starts; «Last time», the latest session's notes. Shared by the
 * classic journal and «Last time» card and the new campaign screen.
 *
 * Session writes are optimistic and quiet on failure: the next load shows the truth.
 */
import type { TFunction } from "i18next";
import {
  createSession,
  deleteSession,
  setNextSession,
  updateSession,
} from "@/features/campaigns/campaign-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import type { SessionLogDoc } from "@/types/campaign";

/** The evening stays "next" for a few hours after it starts (people are playing). */
export const STILL_TONIGHT_MS = 6 * 3_600_000;

/** Newest first. */
export function sortSessions(sessions: readonly SessionLogDoc[]): SessionLogDoc[] {
  return [...sessions].sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Create the next session; null when the write was refused. */
export async function addSession(
  campaignId: string,
  existing: number,
  t: TFunction,
  date = new Date()
): Promise<SessionLogDoc | null> {
  const label = t("campaignHub.sessionN", { n: existing + 1 });
  try {
    const id = await createSession(campaignId, { label, date });
    return {
      id,
      date,
      label,
      notes: "",
      recapRequested: false,
      recapRequestedBy: null,
      recapRequestedAt: null,
      logs: {},
      generatedRecap: null,
      addedToChronicle: false,
    };
  } catch {
    return null;
  }
}

export function renameSession(campaignId: string, id: string, label: string): void {
  void updateSession(campaignId, id, { label }).catch(() => {});
}

export function removeSession(campaignId: string, id: string): void {
  void deleteSession(campaignId, id).catch(() => {});
}

export function nextSessionView(
  nextAt: number | null,
  now: number
): { at: number | null; upcoming: boolean } {
  return { at: nextAt, upcoming: nextAt !== null && nextAt + STILL_TONIGHT_MS > now };
}

/** The DM sets (or clears, with null) the next session on the open campaign. */
export function saveNextSession(at: number | null): void {
  const { campaign, setCampaign } = useCampaignStore.getState();
  if (!campaign) return;
  setCampaign({ ...campaign, nextSessionAt: at });
  void setNextSession(campaign.id, at);
}

/** «Last time»: the latest session and its notes. */
export function lastTimeView(sessions: readonly SessionLogDoc[]): {
  latest: SessionLogDoc | null;
  notes: string;
} {
  const latest = sortSessions(sessions)[0] ?? null;
  return { latest, notes: latest?.notes.trim() ?? "" };
}

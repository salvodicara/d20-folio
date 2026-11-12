/**
 * The campaign list on the new frame (D&D Beyond's campaign list: one card per table):
 * each card's name, DM, start date, party size (players only, the DM out), the party's
 * level range, the shared purse in gp, when it was last active, and who may delete it
 * (the DM, or the admin). The hidden personal campaign never shows.
 */
import { PERSONAL_CAMPAIGN_ID } from "@/app/_data/personal-campaign";
import { campaignPartySize, treasuryTotalGp } from "@/features/campaigns/campaignStore";
import { snapshotTotalLevel } from "@/features/campaigns/member-snapshot";
import { formatRelativeTime } from "@/features/roster/relative-time";
import type { Locale } from "@/lib/locale";
import type { CampaignDoc } from "@/types/campaign";

export interface CampaignCard {
  id: string;
  name: string;
  /** The DM's display name; empty when the table has none. */
  dm: string;
  started: string | null;
  party: number;
  /** «3» or «3–5»; null until a member attaches a character. */
  levels: string | null;
  potGp: number;
  active: string | null;
  canDelete: boolean;
  inviteCode: string;
}

const valid = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

function levelRange(campaign: CampaignDoc): string | null {
  const levels = Object.values(campaign.memberDetails)
    .map((m) => (m.character ? snapshotTotalLevel(m.character) : 0))
    .filter((l) => l > 0);
  if (levels.length === 0) return null;
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return min === max ? String(min) : `${String(min)}–${String(max)}`;
}

export function campaignCards(
  campaigns: ReadonlyArray<CampaignDoc>,
  uid: string | undefined,
  isAdmin: boolean,
  locale: Locale,
  now: number
): CampaignCard[] {
  return campaigns
    .filter((c) => c.id !== PERSONAL_CAMPAIGN_ID)
    .map((c) => ({
      id: c.id,
      name: c.name,
      dm: c.memberDetails[c.dmUid]?.displayName ?? "",
      started: valid(c.createdAt)
        ? c.createdAt.toLocaleDateString(locale, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null,
      party: campaignPartySize(c),
      levels: levelRange(c),
      potGp: treasuryTotalGp(c.treasury),
      active: valid(c.updatedAt) ? formatRelativeTime(c.updatedAt, locale, now) : null,
      canDelete: isAdmin || (uid !== undefined && c.dmUid === uid),
      inviteCode: c.inviteCode,
    }));
}

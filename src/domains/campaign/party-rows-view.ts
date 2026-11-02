/**
 * The new campaign Gruppo panel's rows: one per character, in member order, with the
 * class line, the player, HP, AC, passive Perception and the status chips
 * (Concentration first, then each condition).
 *
 * Name, classes and live numbers come from the member's hydrated character doc (`hydrateMemberDoc`), the
 * same derivation as their own sheet. Without it the row falls back to the party card
 * the member's app keeps in the campaign, and HP stays unknown (null), never guessed.
 * While the doc is still loading the row is marked `loading`, so the screen shows a
 * placeholder instead of card values that would change a moment later.
 */
import { derivePartyMemberStats } from "@/features/campaigns/party-stats";
import { memberCardView } from "@/features/campaigns/member-card-view";
import { localizeSrd } from "@/i18n/resolver";
import { getClasses } from "@/lib/classes";
import type { Locale } from "@/lib/locale";
import { concentrationLabel, conditionLabel } from "@/lib/views/tracker-view";
import type { CampaignDoc } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";

export interface PartyChip {
  kind: "conc" | "cond";
  label: string;
}

export interface PartyRow {
  uid: string;
  loading: boolean;
  name: string;
  player: string;
  portraitUrl: string | null;
  classLine: string;
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  perception: number | null;
  chips: PartyChip[];
}

export function partyRows(
  campaign: Pick<CampaignDoc, "members" | "memberDetails">,
  /** The member's hydrated doc; null when it can't be read, missing while it loads. */
  live: Record<string, CharacterDoc | null | undefined>,
  locale: Locale
): PartyRow[] {
  const rows: PartyRow[] = [];
  for (const uid of campaign.members) {
    const member = campaign.memberDetails[uid];
    if (!member?.character) continue;
    const card = memberCardView(member);
    const doc = live[uid];
    const stats = doc ? derivePartyMemberStats(doc) : null;
    const concentration = doc?.session.concentration;
    rows.push({
      uid,
      loading: doc === undefined,
      name: doc ? doc.character.name : card.name,
      player: member.displayName,
      portraitUrl: card.portraitUrl,
      classLine: (doc ? getClasses(doc.character) : card.classes)
        .map((c) => `${localizeSrd("class", c.classId, "name", locale)} ${c.level}`)
        .join(" · "),
      hp: stats
        ? { current: stats.currentHp, max: stats.maxHp, temp: stats.tempHp }
        : null,
      ac: stats?.ac ?? card.ac,
      perception: stats?.passivePerception ?? card.passives?.perception ?? null,
      chips: [
        ...(concentration
          ? [{ kind: "conc" as const, label: concentrationLabel(concentration, locale) }]
          : []),
        ...(stats?.conditions ?? []).map((id) => ({
          kind: "cond" as const,
          label: conditionLabel(id, locale),
        })),
      ],
    });
  }
  return rows;
}

/** Each character's name as the Gruppo panel shows it, by member: the live sheet's, else
 *  the party card's. Every tab names the party this way (the loot split, the chest's
 *  shares, the Diario's report), so one character never carries two names on screen. */
export function partyNames(
  campaign: Pick<CampaignDoc, "members" | "memberDetails">,
  live: Record<string, CharacterDoc | null | undefined>
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const uid of campaign.members) {
    const member = campaign.memberDetails[uid];
    if (!member?.character) continue;
    names[uid] = live[uid]?.character.name ?? memberCardView(member).name;
  }
  return names;
}

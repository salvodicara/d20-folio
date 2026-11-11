/**
 * The party's resting order (OWNER-1, the owner's pick): A–Z by CHARACTER name, a member
 * with no hero by their player name within the same list, and a `uid` tiebreak for a
 * total order that never churns render to render. `memberDetails` is a Firestore map, so
 * its key order means nothing. The classic Party and the new Gruppo panel both list
 * members this way; in a fight the order is initiative instead.
 */
import type { CampaignDoc } from "@/types/campaign";

type MemberDetails = CampaignDoc["memberDetails"];

export function partyOrder(
  memberDetails: MemberDetails,
  locale: string
): [string, MemberDetails[string]][] {
  return Object.entries(memberDetails).sort(([uidA, a], [uidB, b]) => {
    const keyA = a.character?.name ?? a.displayName;
    const keyB = b.character?.name ?? b.displayName;
    return (
      keyA.localeCompare(keyB, locale, { sensitivity: "base", numeric: true }) ||
      uidA.localeCompare(uidB)
    );
  });
}

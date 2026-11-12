/**
 * «Tira l'iniziativa» on Play: whether the open sheet may roll into its campaign's fight,
 * and the bonuses the roll is ordered by. The same rule as the campaign's Fight tab
 * (`fightControls`): with no fight the player may roll (the first roll starts it); in a
 * fight, only until they have rolled. Null when the sheet is not the player's attached
 * character in that campaign (`isAttached`: the fight would refuse the roll).
 */
import { fightControls } from "@/domains/combat/fight-controls";
import { isAttached } from "@/features/campaigns/combat-lifecycle";
import type { CampaignDoc } from "@/types/campaign";

export function playRollOffer(
  campaign: CampaignDoc | null,
  uid: string,
  characterId: string,
  sheetBonus: number,
  fightRows: ReadonlyArray<{ id: string; initiativeBonus?: number }>
): { bonus: number; bonuses: Record<string, number> } | null {
  const member = campaign?.memberDetails[uid];
  if (!campaign || !uid || member?.characterId !== characterId || !isAttached(member))
    return null;
  const encounter = campaign.encounter ?? null;
  const controls = fightControls(
    encounter,
    null,
    {
      uid,
      isDm: campaign.dmUid === uid,
      hasCharacter: true,
      rolled: campaign.encounterInit?.[uid] != null,
      missing: 0,
    },
    0
  );
  if (!controls.roll) return null;
  const myId = `pc-${uid}`;
  if (!encounter) return { bonus: sheetBonus, bonuses: { [myId]: sheetBonus } };
  const bonuses = Object.fromEntries(
    fightRows.map((r) => [r.id, r.initiativeBonus ?? 0])
  );
  return { bonus: bonuses[myId] ?? sheetBonus, bonuses };
}

/**
 * Read the signed-in account and download its export (`account-export.ts`). A
 * character that cannot be read is counted, never silently left out, so the
 * caller can say so.
 */
import {
  buildAccountExport,
  type AccountProfile,
} from "@/features/account/account-export";
import { listSharedCampaigns } from "@/features/campaigns/campaign-io";
import { triggerDownload } from "@/lib/download";
import { getFullCharacter, listCharacterIds } from "@/lib/firestore";
import { readLibrary } from "@/lib/library-io";
import type { CharacterDoc } from "@/types/character";

export async function exportMyAccount(
  profile: AccountProfile
): Promise<{ characters: number; charactersSkipped: number; portraitsDropped: number }> {
  const ids = await listCharacterIds(profile.uid);
  const read = await Promise.all(
    ids.map((id) => getFullCharacter(profile.uid, id).catch(() => null))
  );
  const characters = read.filter((doc): doc is CharacterDoc => doc !== null);
  const [library, campaigns] = await Promise.all([
    readLibrary(profile.uid),
    listSharedCampaigns(profile.uid),
  ]);
  const exportedAt = new Date();
  const { bytes, portraitsDropped } = await buildAccountExport({
    profile,
    characters,
    library,
    campaigns,
    exportedAt,
  });
  triggerDownload(
    new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
    `d20-folio-account-${exportedAt.toISOString().slice(0, 10)}.zip`
  );
  return {
    characters: characters.length,
    charactersSkipped: ids.length - characters.length,
    portraitsDropped,
  };
}

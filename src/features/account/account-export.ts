/**
 * The whole-account export: everything a player put into Folio, in one `.zip` they
 * can keep or re-import (GDPR portability, Phase 5).
 *
 *   account.json      profile and preferences, plus when the export was made
 *   characters/…      every character in the portable, re-importable format
 *   library.json      the homebrew library
 *   campaigns.json    each campaign's id and name with the player's own role and
 *                     character: never other members' names or details
 *
 * Pure over already-read data, so it is testable without Firebase; reading the
 * account is `exportMyAccount` in `account-export-io.ts`.
 */
import { buildCharacterFiles } from "@/lib/character-io";
import type { LibraryEntry } from "@/lib/library";
import type { CampaignDoc } from "@/types/campaign";
import type { CharacterDoc } from "@/types/character";

export interface AccountProfile {
  uid: string;
  email: string;
  displayName: string;
  createdAt: Date;
  settings?: unknown;
}

export interface AccountExportInput {
  profile: AccountProfile;
  characters: readonly CharacterDoc[];
  library: readonly LibraryEntry[];
  campaigns: readonly CampaignDoc[];
  exportedAt: Date;
}

export async function buildAccountExport(
  input: AccountExportInput
): Promise<{ bytes: Uint8Array; portraitsDropped: number }> {
  const { profile, exportedAt } = input;
  const { files, portraitsDropped } = await buildCharacterFiles(
    input.characters,
    "characters/"
  );
  const { strToU8, zipSync } = await import("fflate");
  const json = (value: unknown) => strToU8(JSON.stringify(value, null, 2));

  files["account.json"] = json({
    exportedAt: exportedAt.toISOString(),
    profile: {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName,
      createdAt: profile.createdAt.toISOString(),
      settings: profile.settings ?? null,
    },
  });
  files["library.json"] = json(input.library);
  files["campaigns.json"] = json(
    input.campaigns.map((campaign) => {
      const mine = campaign.memberDetails[profile.uid];
      return {
        id: campaign.id,
        name: campaign.name,
        role: mine?.role ?? "player",
        characterId: mine?.characterId ?? null,
      };
    })
  );
  return { bytes: zipSync(files, { level: 6 }), portraitsDropped };
}

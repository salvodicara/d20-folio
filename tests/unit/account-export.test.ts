/**
 * The whole-account export (`src/features/account/account-export.ts`): everything
 * a player put into Folio, in one archive they can keep or re-import (GDPR
 * portability, Phase 5). Characters stay in the re-importable portable format;
 * campaigns carry only the player's own part of them.
 */
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { buildAccountExport } from "@/features/account/account-export";
import { importCharactersFromZip } from "@/lib/character-io";
import { makeCharacterDoc } from "@tests/unit/_helpers";
import type { CampaignDoc } from "@/types/campaign";

const profile = {
  uid: "u1",
  email: "lyra@example.com",
  displayName: "Lyra",
  createdAt: new Date("2026-08-01T10:00:00Z"),
  settings: { language: "it", theme: "dark" },
};

const campaign = {
  id: "camp-1",
  name: "The Starless Keep",
  dmUid: "dm-9",
  members: ["dm-9", "u1", "u2"],
  memberDetails: {
    "dm-9": { displayName: "Dana", characterId: null, role: "dm" },
    u1: { displayName: "Lyra", characterId: "c-lyra", role: "player" },
    u2: { displayName: "Someone Else", characterId: "c-else", role: "player" },
  },
} as unknown as CampaignDoc;

function files(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([name, data]) => [name, strFromU8(data)])
  );
}

describe("buildAccountExport", () => {
  it("holds the profile, every character, the library and the player's campaigns", async () => {
    const { bytes } = await buildAccountExport({
      profile,
      characters: [
        makeCharacterDoc({ name: "Bo" as never }),
        makeCharacterDoc({ name: "Briox" as never }),
      ],
      library: [{ id: "lib-1", kind: "spell", name: "Mine", savedAt: 1 } as never],
      campaigns: [campaign],
      exportedAt: new Date("2026-10-16T12:00:00Z"),
    });
    const out = files(bytes);
    const account = JSON.parse(out["account.json"] ?? "{}") as {
      profile: unknown;
      exportedAt: string;
    };
    expect(account.profile).toEqual({
      uid: "u1",
      email: "lyra@example.com",
      displayName: "Lyra",
      createdAt: "2026-08-01T10:00:00.000Z",
      settings: { language: "it", theme: "dark" },
    });
    expect(account.exportedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(
      Object.keys(out).filter((name) => name.startsWith("characters/"))
    ).toHaveLength(2);
    expect(JSON.parse(out["library.json"] ?? "[]")).toHaveLength(1);
    expect(JSON.parse(out["campaigns.json"] ?? "[]")).toEqual([
      { id: "camp-1", name: "The Starless Keep", role: "player", characterId: "c-lyra" },
    ]);
  });

  it("never carries other members' details", async () => {
    const { bytes } = await buildAccountExport({
      profile,
      characters: [],
      library: [],
      campaigns: [campaign],
      exportedAt: new Date(),
    });
    const all = Object.values(files(bytes)).join("\n");
    expect(all).not.toContain("Someone Else");
    expect(all).not.toContain("u2");
    expect(all).not.toContain("Dana");
  });

  it("keeps the characters re-importable through the normal import", async () => {
    const { bytes } = await buildAccountExport({
      profile,
      characters: [makeCharacterDoc({ name: "Bo" as never })],
      library: [],
      campaigns: [],
      exportedAt: new Date(),
    });
    const onlyCharacters = Object.fromEntries(
      Object.entries(unzipSync(bytes)).filter(([name]) => name.startsWith("characters/"))
    );
    const { zipSync } = await import("fflate");
    const zip = new File([new Uint8Array(zipSync(onlyCharacters))], "chars.zip", {
      type: "application/zip",
    });
    const result = await importCharactersFromZip(zip);
    expect(JSON.stringify(result)).toContain("Bo");
  });
});

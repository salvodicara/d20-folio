/// <reference types="node" />
/**
 * Guard: a sheet read by anyone but its owner is read with the effects others left on
 * it (`effectiveDoc`, src/lib/play/effective-doc.ts), so a buff counts wherever the
 * sheet is read: a hit from another device, the DM's fight rows, the party, the DM's
 * view of a sheet. Every file that loads another creature's sheet either projects it
 * or is listed below with why it doesn't need to; a new loader fails here until it
 * does one or the other.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../src");

/** Loaders that hand a sheet on without reading its rules, and why. */
const EXEMPT: Record<string, string> = {
  // The loaders themselves: they decode a stored sheet; their readers project it.
  "lib/firestore.ts": "decodes a stored sheet (hydrateStoredCharacter)",
  "features/campaigns/useMemberCharacterDocs.ts": "loads teammates' raw docs",
  "features/campaigns/usePartyCombatStates.ts": "seeds a dev replica's play state",
  "features/campaigns/useMemberCharacterSubscription.ts":
    "loads a teammate's sheet read-only; MemberSheetView projects it",
  // A public share is outside any campaign: no one left effects on it there.
  "features/character/SharedCharacterView.tsx": "public share, outside a campaign",
  // Reads only the PC's own Concentration (its own sheet's field).
  "domains/combat/ui/FightTab.tsx": "reads only the PC's own Concentration",
};

const LOADS = /hydrateMemberDoc\(|hydrateStoredCharacter\(|resolveDevDoc\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("another creature's sheet is read through effectiveDoc", () => {
  const readers = files(SRC)
    .filter((path) => LOADS.test(readFileSync(path, "utf8")))
    .map((path) => relative(SRC, path));

  it("every file that loads another's sheet projects it, or says why not", () => {
    const unprojected = readers.filter(
      (path) =>
        !(path in EXEMPT) &&
        !readFileSync(join(SRC, path), "utf8").includes("effectiveDoc")
    );
    expect(unprojected).toEqual([]);
  });

  it("the exemptions are still loaders (the list is not stale)", () => {
    expect(Object.keys(EXEMPT).filter((path) => !readers.includes(path))).toEqual([]);
  });

  it("the readers that project today", () => {
    expect(readers.filter((path) => !(path in EXEMPT)).sort()).toEqual([
      "domains/campaign/ui/use-party.ts",
      "features/campaigns/campaign-io.ts",
      "features/campaigns/party-encounter.tsx",
      "features/campaigns/party-stats.ts",
    ]);
  });
});

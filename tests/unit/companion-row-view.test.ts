/**
 * Companion presenter (R2) — the ONE enumerate + resolve + localize seam the
 * Features tab and the Companions rail both read. Public tests cover the
 * HIDDEN-section case (a character with no companion → no views) and the
 * familiar's SEPARATE contract (a Find Familiar summon is never a presenter
 * view — the rail reads `session.familiar` straight into its lazy leaf); the
 * grant-companion views + variant resolution are PACK-data tests (the companion
 * stat blocks live in the pack — content-pack suites).
 */
import { describe, it, expect } from "vitest";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import { buildCompanionCardViews } from "@/lib/views/companion-row-view";

const t = (key: string) => key;

describe("companion-row-view presenter", () => {
  it("returns NO companion views for a character with no companion (hidden section)", () => {
    expect(buildCompanionCardViews(MOCK_CHARACTER, "en", t)).toEqual([]);
  });

  it("never turns a Find Familiar summon into a companion view (separate contract)", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        familiar: { monsterId: "bat", creatureType: "fey" },
      },
    };
    expect(buildCompanionCardViews(doc, "en", t)).toEqual([]);
  });
});

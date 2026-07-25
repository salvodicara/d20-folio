/**
 * Companion presenter (R2) — the ONE enumerate + resolve + localize seam the
 * Features tab and the Companions rail both read. Public tests cover the
 * HIDDEN-section case (a character with no companion → no rows) and the familiar
 * row descriptor; the grant-companion rows + variant resolution are PACK-data
 * tests (the companion stat blocks live in the pack — content-pack suites).
 */
import { describe, it, expect } from "vitest";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";
import {
  buildCompanionCardViews,
  buildCompanionRowVMs,
} from "@/lib/views/companion-row-view";

const t = (key: string) => key;

describe("companion-row-view presenter", () => {
  it("returns NO companion views for a character with no companion (hidden section)", () => {
    expect(buildCompanionCardViews(MOCK_CHARACTER, "en", t)).toEqual([]);
    expect(buildCompanionRowVMs(MOCK_CHARACTER, "en", t)).toEqual([]);
  });

  it("appends a familiar row descriptor when a Find Familiar summon is active", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        familiar: { monsterId: "bat", creatureType: "fey" },
      },
    };
    const rows = buildCompanionRowVMs(doc, "en", t);
    expect(rows).toEqual([
      { kind: "familiar", monsterId: "bat", creatureType: "fey", dismissed: false },
    ]);
  });

  it("marks the familiar row dismissed when it is in its pocket dimension", () => {
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      session: {
        ...MOCK_CHARACTER.session,
        familiar: { monsterId: "owl", creatureType: "celestial", dismissed: true },
      },
    };
    const rows = buildCompanionRowVMs(doc, "en", t);
    expect(rows[0]).toMatchObject({ kind: "familiar", dismissed: true });
  });
});

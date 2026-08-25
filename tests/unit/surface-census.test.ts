import { describe, expect, it } from "vitest";
import {
  assertSurfaceCensus,
  type SurfaceCensusEntry,
} from "../e2e/surface-census/schema";
import {
  ATLAS_BOARDS,
  B01_MOTION_FRAMES,
  PAIRWISE,
  SURFACE_CENSUS,
  SURFACE_ROUTES,
} from "../e2e/surface-census";

const VALID_ENTRY: SurfaceCensusEntry = {
  id: "contract-probe",
  board: "A00",
  route: "/characters",
  state: "resting",
  variants: [
    { locale: "it", theme: "dark", device: "desktop" },
    { locale: "en", theme: "light", device: "desktop" },
    { locale: "it", theme: "light", device: "mobile" },
    { locale: "en", theme: "dark", device: "mobile" },
  ],
  authority: "DESIGN.md",
  callSite: "tests/unit/surface-census.test.ts",
  curatedReview: false,
};

function entry(overrides: Partial<SurfaceCensusEntry> = {}): SurfaceCensusEntry {
  return { ...VALID_ENTRY, ...overrides };
}

describe("surface census contract", () => {
  it("rejects duplicate ids", () => {
    expect(() => assertSurfaceCensus([entry(), entry()])).toThrow(
      /duplicate surface id/i
    );
  });

  it.each([
    ["route", { route: "" }, /route/i],
    ["authority", { authority: "" }, /authority/i],
    ["call site", { callSite: "" }, /call site/i],
  ] as const)("rejects a missing %s", (_label, overrides, message) => {
    expect(() => assertSurfaceCensus([entry(overrides)])).toThrow(message);
  });

  it("rejects unknown boards", () => {
    expect(() =>
      assertSurfaceCensus([entry({ board: "Z99" as SurfaceCensusEntry["board"] })])
    ).toThrow(/unknown board/i);
  });

  it("rejects empty variant applicability", () => {
    expect(() => assertSurfaceCensus([entry({ variants: [] })])).toThrow(
      /variant applicability/i
    );
  });

  it("rejects invalid B01 motion-frame names", () => {
    expect(() =>
      assertSurfaceCensus([
        entry({
          board: "B01",
          motionFrames: ["overshoot" as "entry"],
        }),
      ])
    ).toThrow(/invalid B01 motion frame/i);
  });

  it("assigns campaign records and the live encounter to their atlas owners", () => {
    const boardFor = (id: string) =>
      SURFACE_CENSUS.find((surface) => surface.id === id)?.board;

    expect({
      chronicle: boardFor("campaign-hub-chronicle-edit"),
      session: boardFor("campaign-hub-session-edit"),
      note: boardFor("campaign-hub-note-edit"),
      treasury: boardFor("campaign-hub-treasury-add"),
      encounter: boardFor("campaign-hub-encounter"),
    }).toEqual({
      chronicle: "A12",
      session: "A12",
      note: "A12",
      treasury: "A12",
      encounter: "A13",
    });
  });

  it("freezes the pairwise variants and legacy adapter without shrinking it", () => {
    expect(ATLAS_BOARDS).toEqual([
      "A00",
      "A01",
      "A02",
      "A03",
      "A04",
      "A05",
      "A06",
      "A07",
      "A08",
      "A09",
      "A10",
      "A11",
      "A12",
      "A13",
      "A14",
      "A15",
      "A16",
      "B00",
      "B01",
      "S01",
      "S02",
    ]);
    expect(B01_MOTION_FRAMES).toEqual([
      "entry",
      "mid",
      "settled",
      "interrupted",
      "exit",
      "reduced",
    ]);
    expect(PAIRWISE).toEqual([
      { locale: "it", theme: "dark", device: "desktop" },
      { locale: "en", theme: "light", device: "desktop" },
      { locale: "it", theme: "light", device: "mobile" },
      { locale: "en", theme: "dark", device: "mobile" },
    ]);
    expect(SURFACE_CENSUS).toHaveLength(100);
    expect(new Set(SURFACE_CENSUS.map(({ id }) => id))).toHaveLength(100);
    expect(new Set(SURFACE_CENSUS.map(({ route }) => route))).toHaveLength(42);
    expect(
      SURFACE_CENSUS.every(
        ({ variants }) => JSON.stringify(variants) === JSON.stringify(PAIRWISE)
      )
    ).toBe(true);
    expect(SURFACE_ROUTES).toEqual(
      SURFACE_CENSUS.map(({ id: slug, route }) => ({ slug, route }))
    );
  });
});

/**
 * The two on-cast features (Wizard Abjurer Arcane Ward, Wizard Diviner Expert
 * Divination) live in the private content pack. In SRD-only mode a test stands them in
 * with the pack's own `onCast` specs; in composed mode the pack's real entries win.
 *
 * Use inside a hoisted mock:
 *   vi.mock("@/lib/srd-feature-lookup", async (importOriginal) =>
 *     (await import("./__helpers__/on-cast-features")).withOnCastFeatures(
 *       await importOriginal()));
 */
import type { SrdClassFeatureData } from "@/data/types";
import type * as FeatureLookup from "@/lib/srd-feature-lookup";
import { srdCatalogues } from "@/i18n/srd-en";

export const ARCANE_WARD = "wizard-abjurer-arcane-ward";
export const EXPERT_DIVINATION = "wizard-diviner-expert-divination";

const STAND_INS: Record<string, SrdClassFeatureData> = {
  [ARCANE_WARD]: {
    id: ARCANE_WARD,
    name: "Arcane Ward",
    level: 3,
    class: "wizard",
    subclass: "abjurer",
    description: "",
    mechanics: {
      tracker: { total: "level*2+INT", recovery: "long-rest" },
      onCast: {
        effect: "refill-tracker",
        school: "abjuration",
        minSlotLevel: 1,
        refillTrackerPerSlotLevel: 2,
      },
    },
    source: "Wiki",
  } as unknown as SrdClassFeatureData,
  [EXPERT_DIVINATION]: {
    id: EXPERT_DIVINATION,
    name: "Expert Divination",
    level: 6,
    class: "wizard",
    subclass: "diviner",
    description: "",
    mechanics: {
      onCast: {
        effect: "regain-lower-slot",
        school: "divination",
        minSlotLevel: 2,
        maxRegainLevel: 5,
      },
    },
    source: "Wiki",
  } as unknown as SrdClassFeatureData,
};

/** The stand-ins' EN names, for a test that renders the sheet (no-op with the pack). */
export function registerOnCastFeatureStrings(): void {
  const features = srdCatalogues("en")?.["class-feature"];
  if (!features) return;
  features[ARCANE_WARD] ??= { name: "Arcane Ward", description: "" };
  features[EXPERT_DIVINATION] ??= { name: "Expert Divination", description: "" };
}

export function withOnCastFeatures(actual: typeof FeatureLookup): typeof FeatureLookup {
  return {
    ...actual,
    getSrdFeatureSource: (srdId: string) =>
      actual.getSrdFeatureSource(srdId) ?? STAND_INS[srdId],
  };
}

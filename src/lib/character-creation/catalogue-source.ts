import { classTables, classFeatures } from "@/data/classes";
import { SRD_RACES } from "@/data/races";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { SRD_FEATS } from "@/data/feats";
import { spells } from "@/data/spells";
import { SRD_EQUIPMENT } from "@/data/equipment";
import { SRD_INVOCATIONS, type SrdEldritchInvocation } from "@/data/invocations";
import { srdEn, type SrdKind } from "@/i18n/srd-en";
import type {
  SrdClassTable,
  SrdClassFeatureData,
  SrdRaceData,
  SrdBackgroundData,
  SrdFeatData,
  SrdSpellData,
  SrdEquipmentData,
} from "@/data/types";
export type CreationSourceKind =
  | "class"
  | "species"
  | "background"
  | "feat"
  | "spell"
  | "equipment"
  | "invocation";
interface SourceLabel {
  id: string;
  key: string;
  name: string;
  description: string;
}
export type CreationSource = SourceLabel &
  (
    | { kind: "class"; value: SrdClassTable; features: SrdClassFeatureData[] }
    | { kind: "species"; value: SrdRaceData }
    | { kind: "background"; value: SrdBackgroundData }
    | { kind: "feat"; value: SrdFeatData }
    | { kind: "spell"; value: SrdSpellData }
    | { kind: "equipment"; value: SrdEquipmentData }
    | { kind: "invocation"; value: SrdEldritchInvocation }
  );
function label(kind: CreationSourceKind, id: string): SourceLabel {
  const catalogueKind: SrdKind = kind === "species" ? "race" : kind;
  const name = srdEn(catalogueKind, id, "name");
  if (!name?.trim()) throw new Error("catalogue-label-missing:" + kind + ":" + id);
  return {
    id,
    key: kind + ":" + id,
    name,
    description: srdEn(catalogueKind, id, "description") ?? "",
  };
}
/** Complete typed source inventory. Labels are display only; no rule is inferred from prose. */
export function creationSources(kind: CreationSourceKind): CreationSource[] {
  switch (kind) {
    case "class":
      return classTables.map((value) => ({
        ...label(kind, value.id),
        kind,
        value,
        features: classFeatures.filter(
          (feature) =>
            feature.class === value.id &&
            feature.level === 1 &&
            !feature.subclass &&
            value.levels.find((row) => row.level === 1)?.featureIds.includes(feature.id)
        ),
      }));
    case "species":
      return SRD_RACES.map((value) => ({ ...label(kind, value.id), kind, value }));
    case "background":
      return SRD_BACKGROUNDS.map((value) => ({ ...label(kind, value.id), kind, value }));
    case "feat":
      return SRD_FEATS.map((value) => ({ ...label(kind, value.id), kind, value }));
    case "spell":
      return spells.map((value) => ({ ...label(kind, value.id), kind, value }));
    case "equipment":
      return SRD_EQUIPMENT.map((value) => ({ ...label(kind, value.id), kind, value }));
    case "invocation":
      return SRD_INVOCATIONS.map((value) => ({ ...label(kind, value.id), kind, value }));
  }
}

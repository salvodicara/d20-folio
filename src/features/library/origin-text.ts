import { originRecord } from "@/lib/homebrew/origins";
import type { LibraryDefinition } from "@/lib/library/model";
type Label = (key: string) => string;
const str = (v: unknown) => (typeof v === "string" ? v : "");
export function originBenefitText(
  value: unknown,
  label: Label,
  definition?: LibraryDefinition
): string {
  const b = originRecord(value);
  if (!b) return label("preservedFields");
  switch (b.kind) {
    case "ability":
      return label("options." + str(b.ability)) + " +" + String(b.amount);
    case "spellcasting":
      return (
        label("origin.benefits.spellcasting") + ": " + label("options." + str(b.ability))
      );
    case "size":
      return label("fields.size") + ": " + label("options." + str(b.size));
    case "movement":
      return label("origin.modes." + str(b.mode)) + ": " + String(b.meters) + " m";
    case "sense":
      return label("fields." + str(b.sense)) + ": " + String(b.meters) + " m";
    case "proficiency":
      return (
        label("origin.categories." + str(b.category)) +
        ": " +
        (["skill", "save"].includes(str(b.category))
          ? label("options." + str(b.id))
          : label("origin.catalog." + str(b.category) + "." + str(b.id)))
      );
    case "resistance":
      return (
        label("origin.benefits.resistance") + ": " + label("options." + str(b.damageType))
      );
    case "reference":
      return (
        label("origin.includedBenefit") +
        ": " +
        (str(
          originRecord(
            originRecord(
              originRecord(definition?.payload.data.dependencies)?.[str(b.dependency)]
            )?.definition
          )?.name
        ) || label("origin.missingDependency"))
      );
    default:
      return label("preservedFields");
  }
}
export function originRequirementText(
  value: unknown,
  label: Label,
  definition?: LibraryDefinition
): string {
  const p = originRecord(value);
  if (!p) return label("preservedFields");
  switch (p.kind) {
    case "level":
      return label("origin.minimumLevel") + ": " + String(p.minimum);
    case "ability":
      return label("options." + str(p.ability)) + " ≥ " + String(p.minimum);
    case "proficiency":
      return originBenefitText(p, label, definition);
    case "spellcasting":
      return label("origin.requirements.spellcasting");
    case "feat": {
      const dependencies = originRecord(definition?.payload.data.dependencies) ?? {};
      const dependency =
        typeof p.dependency === "string"
          ? dependencies[p.dependency]
          : Object.values(dependencies).find(
              (v) =>
                originRecord(
                  originRecord(originRecord(originRecord(v)?.definition)?.payload)?.data
                )?.mechanicId === p.mechanicId
            );
      return (
        label("origin.requiredFeat") +
        ": " +
        (str(originRecord(originRecord(dependency)?.definition)?.name) ||
          str(p.mechanicId) ||
          label("origin.missingDependency"))
      );
    }
    case "all":
    case "any":
      return (
        label("origin.requirements." + p.kind) +
        ": (" +
        (Array.isArray(p.requirements)
          ? p.requirements
              .map((v) => originRequirementText(v, label, definition))
              .join(p.kind === "all" ? " · " : " / ")
          : label("preservedFields")) +
        ")"
      );
    default:
      return label("preservedFields");
  }
}

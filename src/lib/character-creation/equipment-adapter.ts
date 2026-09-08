import type { BackgroundEquipmentItem, BackgroundEquipmentOption } from "@/data/types";
import type { CatalogueSnapshot } from "../homebrew/sources";
import {
  dependencyKey,
  type OriginBenefit,
  type OriginChoice,
  type OriginDependency,
} from "../homebrew/origins";
import { creationPool } from "./catalogue-policy";

/** The same authored packages feed the review and the one-time loadout. */
export function normalizeStartingEquipment(
  packages: readonly BackgroundEquipmentOption[],
  id: string,
  snapshot: (key: string) => CatalogueSnapshot,
  proficiencySource?: string
): { choices: OriginChoice[]; dependencies: Record<string, OriginDependency> } {
  const dependencies: Record<string, OriginDependency> = {};
  const choices: OriginChoice[] = [];
  const items = (
    rows: readonly BackgroundEquipmentItem[],
    path: string,
    parent: NonNullable<OriginChoice["parent"]>,
    benefits: OriginBenefit[]
  ) => {
    rows.forEach((item, index) => {
      const key = path + "-" + String(index);
      if (item.choice) {
        const authored = item.choice;
        const choice: OriginChoice = {
          id: key,
          name: "Equipment choice",
          count: authored.count,
          options: [],
          parent,
        };
        choices.push(choice);
        if (authored.pool) {
          choice.pool = creationPool({
            kind: "equipment",
            ...(authored.pool.kind === "tool"
              ? { toolCategories: [authored.pool.category] }
              : { ids: [...authored.pool.ids] }),
          });
          choice.selectedGrant = { kind: "equipment", quantity: item.quantity ?? 1 };
        } else {
          for (const option of authored.options) {
            const value = {
              id: option.id,
              name: option.id,
              benefits: [] as OriginBenefit[],
            };
            choice.options.push(value);
            items(
              option.items,
              key + "-" + option.id,
              { choiceId: key, optionId: option.id },
              value.benefits
            );
          }
        }
      } else if (item.fromToolChoice) {
        if (!proficiencySource) throw new Error("catalogue-tool-source-required");
        choices.push({
          id: key,
          name: "Starting tool",
          count: 1,
          options: [],
          parent,
          pool: creationPool({
            kind: "equipment",
            categories: ["tool"],
            proficientOnly: true,
            proficiencySource,
          }),
          selectedGrant: { kind: "equipment", quantity: item.quantity ?? 1 },
        });
      } else {
        const source = snapshot("equipment:" + item.srdId);
        const sourceKey = dependencyKey(source);
        dependencies[sourceKey] = source;
        benefits.push({
          kind: "equipment",
          dependency: sourceKey,
          quantity: item.quantity ?? 1,
        });
      }
    });
  };
  const root: OriginChoice = {
    id,
    name: "Starting equipment",
    count: 1,
    options: [],
    parent: null,
  };
  choices.push(root);
  for (const option of packages) {
    const value = {
      id: option.label,
      name: option.label,
      benefits: [{ kind: "gold", amount: option.gold }] as OriginBenefit[],
    };
    root.options.push(value);
    items(
      option.items,
      id + "-" + option.label,
      { choiceId: id, optionId: option.label },
      value.benefits
    );
  }
  return { choices, dependencies };
}

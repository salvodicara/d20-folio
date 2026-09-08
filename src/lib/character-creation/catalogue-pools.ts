import { srdEn } from "@/i18n/srd-en";
import { SRD_LANGUAGE_IDS } from "@/data/languages";
import type { SrdEquipmentData } from "@/data/types";
import { ALL_SKILLS } from "../skills";
import { SRD_TOOLS_2024 } from "../tools";
import type { OriginFact } from "../homebrew/origin-build";
import type { CataloguePool, ResolvedPoolOption } from "../homebrew/choice-pools";
import {
  CREATION_CATALOGUE,
  CREATION_RELEASE,
  CREATION_ADAPTER_VERSION,
} from "./catalogue-policy";
import { creationSources } from "./catalogue-source";
import { catalogueSnapshot } from "./catalogue";

function proficientWeapon(item: SrdEquipmentData, facts: readonly OriginFact[]): boolean {
  const tokens = new Set(
    facts.flatMap((f) =>
      f.benefit.kind === "training" && f.benefit.category === "weapon"
        ? [f.benefit.id]
        : []
    )
  );
  if (tokens.has(item.id) || tokens.has(item.id + "s")) return true;
  if (item.weaponCategory === "simple") return tokens.has("simple-weapons");
  if (tokens.has("martial-weapons")) return true;
  return (
    (tokens.has("martial-weapons-light") && !!item.properties?.includes("Light")) ||
    (tokens.has("martial-weapons-finesse-or-light") &&
      !!item.properties?.some((p) => p === "Finesse" || p === "Light"))
  );
}

/** Live facts restrict eligible options; only the selected immutable leaves are later stored. */
export function resolveCreationPool(
  pool: CataloguePool,
  facts: readonly OriginFact[]
): ResolvedPoolOption[] {
  if (
    pool.catalogue !== CREATION_CATALOGUE ||
    pool.release !== CREATION_RELEASE ||
    pool.adapterVersion !== CREATION_ADAPTER_VERSION
  )
    return [];
  const q = pool.query;
  const allowed = (id: string) => !q.ids || q.ids.includes(id);
  const hasProficiency = (category: string, id: string, source?: string) =>
    facts.some(
      (f) =>
        (!source || ("kind" in f.source && f.source.id === source)) &&
        f.benefit.kind === "proficiency" &&
        f.benefit.category === category &&
        f.benefit.id === id
    );
  if (q.kind === "proficiency") {
    const candidates = [
      ...ALL_SKILLS.map((s) => ({ id: s.id, name: s.name, category: "skill" as const })),
      ...SRD_TOOLS_2024.filter(
        (t) =>
          t.pickable !== false &&
          (!q.toolCategories || q.toolCategories.includes(t.category))
      ).map((t) => ({
        id: t.id,
        name: srdEn("equipment", t.id, "name") ?? t.id,
        category: "tool" as const,
      })),
      ...SRD_LANGUAGE_IDS.map((id) => ({
        id,
        name: srdEn("language", id, "name") ?? id,
        category: "language" as const,
      })),
    ];
    return candidates
      .filter(
        (c) =>
          q.categories.includes(c.category) &&
          allowed(c.id) &&
          (q.proficientOnly
            ? hasProficiency(c.category, c.id) &&
              !facts.some(
                (f) =>
                  f.benefit.kind === "expertise" &&
                  f.benefit.category === c.category &&
                  f.benefit.id === c.id
              )
            : !hasProficiency(c.category, c.id))
      )
      .map((c) => ({
        option: {
          id: c.id,
          name: c.name,
          benefits: q.proficientOnly
            ? []
            : [{ kind: "proficiency", category: c.category, id: c.id }],
        },
      }));
  }
  const family = q.kind === "mastery" ? "equipment" : q.kind;
  const result: ResolvedPoolOption[] = [];
  for (const source of creationSources(family)) {
    if (!allowed(source.id)) continue;
    if (q.kind === "spell" && source.kind === "spell") {
      const spell = source.value;
      if (
        spell.level < q.minimumLevel ||
        spell.level > q.maximumLevel ||
        (q.classSpellLists &&
          !q.classSpellLists.some((c) => spell.classes.includes(c))) ||
        (q.ritualOnly && !spell.ritual) ||
        (q.schools && !q.schools.includes(spell.school)) ||
        (q.acquiredPolicy &&
          !facts.some(
            (f) =>
              f.benefit.kind === "spell" &&
              f.benefit.id === spell.id &&
              f.benefit.policy === q.acquiredPolicy
          ))
      )
        continue;
    } else if (q.kind === "feat" && source.kind === "feat") {
      if (
        (q.categories && !q.categories.includes(source.value.category)) ||
        (source.value.classScope && source.value.classScope !== q.classScope)
      )
        continue;
    } else if (q.kind === "invocation" && source.kind === "invocation") {
      const requirements = source.value.prerequisites;
      if (!requirements || requirements.minimumClassLevel > q.maximumClassLevel) continue;
      // Current P10 query is level one; later acquisition programs extend the same typed predicates.
      if (requirements.invocationIds?.length || requirements.cantrip) continue;
    } else if (
      (q.kind === "equipment" || q.kind === "mastery") &&
      source.kind === "equipment"
    ) {
      const item = source.value;
      if (q.kind === "mastery") {
        if (
          !item.mastery ||
          item.category !== "weapon" ||
          (q.categories &&
            (!item.weaponCategory || !q.categories.includes(item.weaponCategory))) ||
          (q.properties &&
            !q.properties.some((p) =>
              item.properties?.some((raw) => raw.toLowerCase() === p)
            )) ||
          (q.proficientOnly && !proficientWeapon(item, facts))
        )
          continue;
      } else {
        if (
          (q.categories && !q.categories.includes(item.category)) ||
          (q.toolCategories &&
            !SRD_TOOLS_2024.some(
              (t) =>
                t.id === item.id &&
                t.pickable !== false &&
                q.toolCategories?.includes(t.category)
            )) ||
          (q.proficientOnly && !hasProficiency("tool", item.id, q.proficiencySource))
        )
          continue;
      }
    } else continue;
    result.push({
      option: { id: source.id, name: source.name, benefits: [] },
      ...(q.kind === "mastery" ? {} : { snapshot: catalogueSnapshot(source.key) }),
    });
  }
  return result;
}

import { acquisitionKey } from "@/i18n/creation-keys";
import { authoredChoiceText } from "@/i18n/acquisition-source-text";
import { useTranslation } from "react-i18next";
import { srdCatalogues, type SrdKind } from "@/i18n/srd-en";
import { sourceVersionLabel, type DefinitionSnapshot } from "@/lib/homebrew/sources";
import type { InstanceSnapshot } from "@/lib/homebrew/instances";
import type { ActiveOriginChoice, OriginDiagnostic } from "@/lib/homebrew/origin-build";
import type { OriginBenefit, OriginOption } from "@/lib/homebrew/origins";
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
/** Presenters consume authored IDs and benefits; display strings never decide rules. */
export function useAcquisitionLabels() {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.language.startsWith("it") ? "it" : "en";
  const catalogue = srdCatalogues(locale);
  const w = (key: string, values: Record<string, string | number> = {}) =>
    t(acquisitionKey(key), values);
  const ability = (id: string) => t(`abilities.${id.slice(0, 3).toUpperCase()}`);
  const srd = (kind: SrdKind, id: string, fallback = id, field = "name"): string => {
    const value = catalogue?.[kind]?.[id]?.[field];
    return typeof value === "string" ? value : fallback;
  };
  const snapshot = (source: InstanceSnapshot, field = "name") => {
    const fallback =
      field === "name" ? source.definition.name : source.definition.description;
    if (!("kind" in source) || source.kind !== "catalogue") return fallback;
    const [kind, ...id] = source.entryId.split(":");
    return srd(
      (kind === "species" ? "race" : kind) as SrdKind,
      id.join(":"),
      fallback,
      field
    );
  };
  const provenance = (source: DefinitionSnapshot) =>
    w("version", { version: sourceVersionLabel(source) }) +
    " · " +
    ("kind" in source ? w("official") : source.ownerUid + " / " + source.entryId);
  const dependency = (source: DefinitionSnapshot | undefined, key: string) => {
    const value = record(record(source?.definition.payload.data.dependencies)[key]);
    if (!value.definition) return key;
    if (value.kind === "catalogue")
      return snapshot(value as unknown as DefinitionSnapshot);
    const name = record(value.definition).name;
    return typeof name === "string" ? name : key;
  };
  const proficiency = (category: string, id: string) =>
    category === "skill"
      ? i18n.exists(`skills.${id}`)
        ? t(`skills.${id}`)
        : id
      : category === "save"
        ? ability(id)
        : srd(category === "tool" ? "equipment" : "language", id);
  const authoredLabel = (
    source: DefinitionSnapshot | undefined,
    choiceId: string,
    optionId?: string
  ): string | undefined => {
    if (!source || !("kind" in source)) return;
    const [kind, id] = source.entryId.split(":");
    if (!id) return;
    const raw = record(source.sourceData);
    const features = Array.isArray(raw.features)
      ? raw.features.map((value) => record(value).id)
      : [];
    const catalogueKind =
      kind === "class" ? "class-feature" : kind === "species" ? "race" : kind;
    if (!catalogueKind) return;
    for (const [key, value] of Object.entries(
      catalogue?.[catalogueKind as SrdKind] ?? {}
    )) {
      const prefix =
        kind === "class"
          ? features.find(
              (feature) => typeof feature === "string" && key.startsWith(feature + ".")
            )
          : id;
      if (typeof prefix !== "string" || !key.startsWith(prefix + ".")) continue;
      const normalized = (
        kind === "class"
          ? key
          : kind === "species"
            ? key.slice((id + ".traits.").length)
            : key.replace(
                id,
                kind === "feat"
                  ? "feat"
                  : kind === "background"
                    ? "background"
                    : "invocation"
              )
      )
        .replaceAll(".grants.", "-")
        .replaceAll(".options.", "-");
      if (
        normalized === choiceId + (optionId === undefined ? "" : "-" + optionId) &&
        typeof value.label === "string"
      )
        return value.label;
    }
    return undefined;
  };
  const benefit = (b: OriginBenefit, source?: DefinitionSnapshot): string => {
    switch (b.kind) {
      case "ability":
        return ability(b.ability) + " +" + String(b.amount);
      case "casting-ability":
        return w(b.kind) + ": " + ability(b.ability);
      case "size":
        return w("size") + ": " + w(b.size);
      case "gold":
        return w("gp", { amount: b.amount });
      case "equipment":
        return w("quantity", {
          quantity: b.quantity,
          name: dependency(source, b.dependency),
        });
      case "reference":
        return dependency(source, b.dependency);
      case "proficiency":
        return w(b.category) + ": " + proficiency(b.category, b.id);
      case "expertise":
        return w("expertise") + ": " + proficiency(b.category, b.id);
      case "mastery":
        return w("mastery") + ": " + srd("equipment", b.id);
      case "training":
        return w("training", { category: w(b.category), name: srd("proficiency", b.id) });
      case "spell": {
        const casting =
          typeof b.ability === "object"
            ? w("abilityPending")
            : b.ability === "none"
              ? w("none")
              : ability(b.ability);
        const included = Object.entries(
          record(source?.definition.payload.data.dependencies)
        ).filter(
          ([, dep]) =>
            record(record(record(dep).definition).payload).data &&
            record(record(record(record(dep).definition).payload).data).mechanicId ===
              b.id
        );
        const name =
          included.length === 1 && included[0]
            ? dependency(source, included[0][0])
            : srd("spell", b.id);
        return (
          w("spellPolicy", { name, policy: w(b.policy), ability: casting }) +
          (b.policy === "free-cast"
            ? " · " + w("uses", { uses: b.uses ?? 0, rest: w(b.rest ?? "long") })
            : "")
        );
      }
      case "spellcasting":
        return w("spellcasting", { ability: ability(b.ability) });
      case "hp-per-level":
        return w(b.kind, { amount: b.amount });
      case "movement":
      case "movement-bonus":
        return w(b.kind, { mode: w(b.mode), meters: Number(b.meters.toFixed(2)) });
      case "movement-equals-walk":
        return w(b.kind, { mode: w(b.mode), multiplier: b.multiplier });
      case "sense":
        return w("movement", { mode: w(b.sense), meters: Number(b.meters.toFixed(2)) });
      case "resistance":
        return w("resistance") + ": " + t(`srd.damage_${b.damageType}`);
      case "armor-class":
        return (
          w(b.kind, {
            base: b.base,
            abilities: b.abilities.map(ability).join(" + ") || "0",
            condition: w(b.condition),
          }) +
          (b.shieldBonus !== undefined
            ? " · " + w("shieldBonus", { amount: b.shieldBonus })
            : "")
        );
    }
  };
  const choice = (
    c: Pick<ActiveOriginChoice, "choice">,
    source?: DefinitionSnapshot
  ): string => {
    if (source && !("kind" in source)) return c.choice.name;
    const authored = authoredLabel(source, c.choice.id);
    if (authored) return authored;
    const q = c.choice.pool?.query;
    if (c.choice.selectedGrant?.kind === "expertise") return w("expertise");
    if (q?.kind === "spell")
      return w(
        q.maximumLevel === 0
          ? "cantrips"
          : c.choice.selectedGrant?.kind === "spell" &&
              c.choice.selectedGrant.entitlements[0]?.policy === "spellbook"
            ? "spellbook"
            : "spell"
      );
    if (q?.kind === "proficiency")
      return w(
        q.categories.length === 1 ? (q.categories[0] ?? "proficiency") : "proficiency"
      );
    if (q) return w(q.kind);
    if (
      c.choice.options.some((o) =>
        o.benefits.some((b) => b.kind === "gold" || b.kind === "equipment")
      )
    )
      return w("equipment");
    const first = c.choice.options[0]?.benefits[0];
    return w(
      first && ["size", "casting-ability", "resistance"].includes(first.kind)
        ? first.kind
        : "feature"
    );
  };
  const option = (
    o: OriginOption,
    source?: DefinitionSnapshot,
    selectedSnapshot?: DefinitionSnapshot,
    choiceId?: string
  ): string => {
    if (selectedSnapshot) return snapshot(selectedSnapshot);
    if (source && !("kind" in source)) return o.name;
    const data = record(source?.definition.payload.data);
    const scopes = [
      data,
      ...(Array.isArray(data.progression) ? data.progression.map(record) : []),
      record(data.starting),
      record(data.multiclass),
    ];
    if (
      choiceId &&
      scopes.some(
        (scope) =>
          Array.isArray(scope.choices) &&
          scope.choices.some((value) => {
            const declaration = record(value);
            return (
              declaration.id === choiceId &&
              record(record(declaration.pool).query).kind === "mastery"
            );
          })
      )
    )
      return srd("equipment", o.id, o.name);
    const authored = choiceId ? authoredLabel(source, choiceId, o.id) : undefined;
    if (authored)
      return (
        authored +
        (o.benefits.length
          ? " · " + o.benefits.map((b) => benefit(b, source)).join(" · ")
          : "")
      );
    if (o.benefits.length) return o.benefits.map((b) => benefit(b, source)).join(" · ");
    // Bilingual authored bundle labels retain their stable option identity.
    const search = (value: unknown): string | undefined => {
      if (Array.isArray(value)) {
        for (const child of value) {
          const found = search(child);
          if (found) return found;
        }
      } else if (value && typeof value === "object") {
        const data = record(value);
        if (data.id === o.id) {
          const name = authoredChoiceText(data.label, locale);
          if (typeof name === "string") return name;
        }
        for (const child of Object.values(data)) {
          const found = search(child);
          if (found) return found;
        }
      }
      return undefined;
    };
    return (
      search(source && "kind" in source ? source.sourceData : undefined) ??
      w("package", { id: o.id })
    );
  };
  const diagnostic = (d: Pick<OriginDiagnostic, "code">) => {
    for (const key of ["creationV2." + d.code, "homebrewV2.diagnostics." + d.code])
      if (i18n.exists(key)) return t(key);
    return w("issue");
  };
  return {
    w,
    t,
    ability,
    srd,
    snapshot,
    provenance,
    dependency,
    benefit,
    choice,
    option,
    diagnostic,
  };
}

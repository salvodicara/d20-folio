/**
 * Every feature a character has, for display: the stored `features[]` united with
 * what the build choices compute (class and subclass features of every class entry,
 * the background / species Origin feats), deduped by SRD id, each resolved to its
 * localized name and rules text and sorted class (by level) → subclass (by level) →
 * species → feats → homebrew. The classic Features tab and the Play screen's
 * «Privilegi e tratti» both read this one list.
 *
 * Display-only and additive: derived refs carry `idx: -1` (no stored entry), so the
 * stored array and the engine's consumers are untouched.
 */
import { classFeatureIndex } from "@/data/classes";
import { FEATS_BY_ID } from "@/data/feats";
import { raceFeatureIndex, raceTraitCatKey } from "@/data/races";
import type { ActionType } from "@/data/types";
import { hasSrd, localizeCustom, localizeSrd } from "@/i18n/resolver";
import { buildGrantedFeatures, deriveOriginFeats } from "@/lib/character-build";
import type { Locale } from "@/lib/locale";
import { localizeClassName, localizeSubclassName } from "@/lib/views/srd-i18n";
import type { CharacterData, CustomFeature, SrdFeatureRef } from "@/types/character";

/** Where a feature comes from; drives the section heading and the sort order. */
export type FeatureGroup = "class" | "subclass" | "race" | "feat" | "custom";

export interface FeatureListEntry {
  /** The SRD id, or `custom-<instanceId>` for homebrew. */
  id: string;
  /** Index in the stored `features[]`, or -1 for a feature only the build computes. */
  idx: number;
  name: string;
  nameEn: string;
  notes: string;
  description: string;
  group: FeatureGroup;
  /** Class / subclass features: "Bard 3" / "College of Lore 3"; homebrew: its own
   *  source text; species traits and feats: null (the caller labels them). */
  sourceLabel: string | null;
  /** A feat's category id (`origin`, `general`, …). */
  featCategory?: string;
  /** The class level that grants it (class / subclass features), else 0. */
  level: number;
  actionType: ActionType | "neutral";
  isCustom: boolean;
  /** Derived from a build choice: read-only, never deletable. */
  isComputed: boolean;
  customRef: CustomFeature | null;
}

const GROUP_ORDER: Record<FeatureGroup, number> = {
  class: 0,
  subclass: 1,
  race: 2,
  feat: 3,
  custom: 4,
};

export function characterFeatureList(
  charData: CharacterData,
  locale: Locale
): FeatureListEntry[] {
  const storedSrdIds = new Set(
    charData.features.flatMap((f) => ("srdId" in f ? [f.srdId] : []))
  );
  const derivedRefs: SrdFeatureRef[] = [];
  const derivedSeen = new Set<string>();
  // Every id a build choice computes, before the stored dedup: a stored ref in here
  // is a computed feature too (read-only).
  const computedIds = new Set<string>();
  for (const ref of [
    ...charData.classes.flatMap((entry) =>
      buildGrantedFeatures({
        classId: entry.classId,
        level: entry.level,
        subclassId: entry.subclassId ?? "",
        raceId: charData.race.toLowerCase(),
      })
    ),
    ...deriveOriginFeats({
      background: charData.background,
      bgFeat: charData.bgFeat,
      humanOriginFeat: charData.humanOriginFeat,
    }),
  ]) {
    computedIds.add(ref.srdId);
    if (!storedSrdIds.has(ref.srdId) && !derivedSeen.has(ref.srdId)) {
      derivedSeen.add(ref.srdId);
      derivedRefs.push(ref);
    }
  }

  const entries: Array<{ ref: SrdFeatureRef | CustomFeature; idx: number }> = [
    ...charData.features.map((ref, idx) => ({ ref, idx })),
    ...derivedRefs.map((ref) => ({ ref, idx: -1 })),
  ];

  const resolved = entries.map(({ ref, idx }): FeatureListEntry => {
    if ("custom" in ref) {
      return {
        id: `custom-${ref.instanceId}`,
        idx,
        name: localizeCustom(ref.title, locale),
        nameEn: localizeCustom(ref.title, "en"),
        notes: "",
        description: ref.contentBlocks.map((b) => b.text ?? "").join("\n"),
        group: "custom",
        sourceLabel: ref.source,
        actionType: ref.actions?.[0]?.type ?? "neutral",
        isCustom: true,
        isComputed: false,
        customRef: ref,
        level: 0,
      };
    }
    const classFeature = classFeatureIndex.get(ref.srdId);
    const feat = classFeature ? undefined : FEATS_BY_ID.get(ref.srdId);
    const raceTrait = classFeature || feat ? undefined : raceFeatureIndex.get(ref.srdId);
    const srd = classFeature ?? feat ?? raceTrait;
    // The catalogue keys a class feature / feat by its SRD id and a species trait by
    // its id-derived key; an id with no SRD text falls back to the raw id.
    const kind = classFeature ? "class-feature" : feat ? "feat" : "race";
    const key = raceTrait ? raceTraitCatKey(raceTrait) : ref.srdId;
    const text = (field: string, loc: Locale): string =>
      srd && hasSrd(kind, key, field, loc)
        ? localizeSrd(kind, key, field, loc)
        : ref.srdId;
    const group: FeatureGroup = classFeature
      ? classFeature.subclass
        ? "subclass"
        : "class"
      : raceTrait
        ? "race"
        : "feat";
    const sourceLabel = classFeature
      ? classFeature.subclass
        ? `${localizeSubclassName(classFeature.subclass, locale)} ${String(classFeature.level)}`
        : `${localizeClassName(classFeature.class, locale)} ${String(classFeature.level)}`
      : feat || raceTrait
        ? null
        : // an id no catalogue knows: say so the way the classic tab always did
          `${localizeClassName("?", locale)} ?`;
    return {
      id: ref.srdId,
      idx,
      name: text("name", locale),
      nameEn: text("name", "en"),
      notes: ref.notes ?? "",
      description: hasSrd(kind, key, "description", locale)
        ? localizeSrd(kind, key, "description", locale)
        : "",
      group,
      sourceLabel,
      ...(feat ? { featCategory: feat.category } : {}),
      actionType: srd?.mechanics?.actions?.[0]?.type ?? "neutral",
      isCustom: false,
      isComputed: idx === -1 || computedIds.has(ref.srdId),
      customRef: null,
      level: classFeature?.level ?? 0,
    };
  });
  resolved.sort(
    (a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.level - b.level
  );
  return resolved;
}

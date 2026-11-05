/**
 * The level-up «Riepilogo»: what a level changes, read by comparing the
 * character before with the one the commit would save, so the summary can never
 * disagree with what is stored.
 *
 *   - numbers: Hit Points; the proficiency bonus when it goes up; each spell
 *     slot level and class resource whose maximum moves; and every column of the
 *     class table that changes (Bardic Inspiration d8 → d10, Sneak Attack 2d6 →
 *     3d6, Rage Damage +2 → +3), read from the table `levelUpPlan` reads;
 *   - gained: every feature, feat, spell, invocation, Metamagic option, maneuver
 *     and mastered weapon the level adds, and the subclass when it is chosen.
 *
 * Pure: SRD names resolve here in the reader's language; numbers stay raw.
 */
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { getClassTable } from "@/data/classes";
import { totalLevel } from "@/lib/classes";
import { localeDistance } from "@/lib/utils";
import { proficiencyBonus } from "@/lib/proficiency";
import type { Locale } from "@/lib/locale";
import type { CharacterData, CharacterDoc } from "@/types/character";
import { resourcesView } from "@/lib/views/resources-view";

export type ReviewNumber =
  | { id: "hp"; kind: "hp"; before: number; after: number }
  | { id: "pb"; kind: "pb"; before: number; after: number }
  | {
      id: string;
      kind: "slot";
      level: number;
      pact: boolean;
      before: number;
      after: number;
    }
  | { id: string; kind: "resource"; name: string; before: number; after: number }
  | {
      id: string;
      kind: "table";
      /** The class-table column (`TABLE_COLUMNS`). */
      key: string;
      /** Formatted: «d8», «3d6», «+2», «9 m»; null for a class's first level. */
      before: string | null;
      after: string;
    };

/**
 * The class-table columns the summary shows, each with how its value reads.
 * Uses (Rage, Second Wind, Focus, Sorcery Points, Lay on Hands, Bardic
 * Inspiration uses) are left out: the class-resource rows show them by name.
 */
export const TABLE_COLUMNS: Record<
  string,
  (v: number | string, locale: Locale) => string
> = {
  bardicInspirationDie: (v) => String(v),
  martialArtsDie: (v) => String(v),
  sneakAttackDice: (v) => `${String(v)}d6`,
  rageDamage: (v) => `+${String(v)}`,
  extraAttacks: (v) => String(v),
  unarmoredMovement: (v, locale) => `+${localeDistance(Number(v), locale)}`,
  wildShapeMaxCR: (v) => String(v),
  weaponMastery: (v) => String(v),
  invocationsKnown: (v) => String(v),
  metamagicKnown: (v) => String(v),
  pactSlotLevel: (v) => `${String(v)}°`,
};
/** Columns a class-resource row already shows, by the tracker's name. */
export const TABLE_USES = new Set([
  "rages",
  "bardicInspirationUses",
  "secondWindUses",
  "actionSurgeUses",
  "indomitableUses",
  "focusPoints",
  "layOnHandsPool",
  "sorceryPoints",
]);

export type GainedKind =
  | "subclass"
  | "feature"
  | "feat"
  | "spell"
  | "invocation"
  | "metamagic"
  | "maneuver"
  | "mastery";

export interface ReviewGained {
  kind: GainedKind;
  id: string;
  /** In the reader's language. */
  name: string;
}

export interface LevelUpReview {
  numbers: ReviewNumber[];
  gained: ReviewGained[];
}

const srdIds = (refs: ReadonlyArray<object>): string[] =>
  refs.flatMap((r) => ("srdId" in r && typeof r.srdId === "string" ? [r.srdId] : []));

/** Ids in `after` that `before` lacks, in `after`'s order. */
const added = (before: readonly string[], after: readonly string[]): string[] => {
  const had = new Set(before);
  return [...new Set(after)].filter((id) => !had.has(id));
};

function classPicks(c: CharacterData) {
  const all = (
    key: "invocationChoices" | "metamagicChoices" | "maneuverChoices" | "weaponMasteries"
  ) => c.classes.flatMap((e) => e[key] ?? []);
  return {
    invocation: all("invocationChoices"),
    metamagic: all("metamagicChoices"),
    maneuver: all("maneuverChoices"),
    mastery: all("weaponMasteries"),
    subclass: c.classes.flatMap((e) => (e.subclassId ? [e.subclassId] : [])),
  };
}

const PICK_KIND = {
  invocation: "invocation",
  metamagic: "metamagic",
  maneuver: "maneuver",
  mastery: "equipment",
  subclass: "subclass",
} as const;

export function levelUpReview(
  before: CharacterDoc,
  after: CharacterDoc,
  locale: Locale
): LevelUpReview {
  const b = before.character;
  const a = after.character;
  const numbers: ReviewNumber[] = [
    { id: "hp", kind: "hp", before: b.hp.max, after: a.hp.max },
  ];
  const prof = [
    proficiencyBonus(totalLevel(b)),
    proficiencyBonus(totalLevel(a)),
  ] as const;
  if (prof[1] !== prof[0])
    numbers.push({ id: "pb", kind: "pb", before: prof[0], after: prof[1] });

  // Maxima only: what is used tonight is not what the level changes.
  const slots = (c: CharacterData) => {
    const m = new Map<string, { level: number; pact: boolean; total: number }>();
    for (const s of c.spellSlots) {
      const pact = s.pactMagic === true;
      // Pact slots are one pool whose level rises: one row, at its new level.
      const id = pact ? "slot:pact" : `slot:${String(s.level)}`;
      const prev = m.get(id);
      m.set(id, { level: s.level, pact, total: (prev?.total ?? 0) + s.total });
    }
    return m;
  };
  const slotsBefore = slots(b);
  for (const [id, s] of slots(a)) {
    const prev = slotsBefore.get(id)?.total ?? 0;
    if (prev !== s.total) {
      numbers.push({
        id,
        kind: "slot",
        level: s.level,
        pact: s.pact,
        before: prev,
        after: s.total,
      });
    }
  }
  const resources = (doc: CharacterDoc) =>
    resourcesView(doc, locale).flatMap((r) => (r.kind === "class-resource" ? [r] : []));
  const resourcesBefore = new Map(resources(before).map((r) => [r.id, r.max]));
  for (const r of resources(after)) {
    const prev = resourcesBefore.get(r.id) ?? 0;
    if (prev !== r.max) {
      numbers.push({
        id: r.id,
        kind: "resource",
        name: r.name,
        before: prev,
        after: r.max,
      });
    }
  }

  // The class table: each advancing class's row before and after.
  for (const entry of a.classes) {
    const was = b.classes.find((e) => e.classId === entry.classId)?.level ?? 0;
    if (was === entry.level) continue;
    const table = getClassTable(entry.classId);
    const row = (level: number) =>
      table?.levels.find((l) => l.level === level)?.classSpecific;
    const prev = row(was) ?? {};
    for (const [key, value] of Object.entries(row(entry.level) ?? {})) {
      const format = TABLE_COLUMNS[key];
      const old = prev[key];
      if (!format || old === value) continue;
      numbers.push({
        id: `table:${entry.classId}:${key}`,
        kind: "table",
        key,
        before: old === undefined ? null : format(old, locale),
        after: format(value, locale),
      });
    }
  }

  const gained: ReviewGained[] = [];
  const pa = classPicks(a);
  const pb = classPicks(b);
  for (const id of added(pb.subclass, pa.subclass)) {
    gained.push({
      kind: "subclass",
      id,
      name: localizeSrd("subclass", id, "name", locale),
    });
  }
  for (const id of added(srdIds(b.features), srdIds(a.features))) {
    const feat =
      !hasSrd("class-feature", id, "name", locale) && hasSrd("feat", id, "name", locale);
    if (id.endsWith("-asi") && !feat) continue;
    gained.push({
      kind: feat ? "feat" : "feature",
      id,
      name: localizeSrd(feat ? "feat" : "class-feature", id, "name", locale),
    });
  }
  for (const id of added(srdIds(b.spells), srdIds(a.spells))) {
    gained.push({ kind: "spell", id, name: localizeSrd("spell", id, "name", locale) });
  }
  for (const kind of ["invocation", "metamagic", "maneuver", "mastery"] as const) {
    for (const id of added(pb[kind], pa[kind])) {
      gained.push({ kind, id, name: localizeSrd(PICK_KIND[kind], id, "name", locale) });
    }
  }
  return { numbers, gained };
}

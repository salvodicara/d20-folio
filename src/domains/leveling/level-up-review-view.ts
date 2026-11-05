/**
 * The level-up «Riepilogo»: what a level changes, read by comparing the
 * character before with the one the commit would save, so the summary can never
 * disagree with what is stored.
 *
 *   - numbers: Hit Points and the proficiency bonus always; then each spell slot
 *     level and class resource whose maximum moves;
 *   - gained: every feature, feat, spell, invocation, Metamagic option, maneuver
 *     and mastered weapon the level adds, and the subclass when it is chosen.
 *
 * Pure: SRD names resolve here in the reader's language; numbers stay raw.
 */
import { localizeSrd, hasSrd } from "@/i18n/resolver";
import { totalLevel } from "@/lib/classes";
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
  | { id: string; kind: "resource"; name: string; before: number; after: number };

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
    {
      id: "pb",
      kind: "pb",
      before: proficiencyBonus(totalLevel(b)),
      after: proficiencyBonus(totalLevel(a)),
    },
  ];

  // Maxima only: what is used tonight is not what the level changes.
  const slots = (c: CharacterData) => {
    const m = new Map<string, { level: number; pact: boolean; total: number }>();
    for (const s of c.spellSlots) {
      const pact = s.pactMagic === true;
      const id = `slot:${pact ? "pact:" : ""}${s.level}`;
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

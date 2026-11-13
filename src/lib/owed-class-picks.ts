/**
 * The class picks a stored character owes against its level table: for each
 * class entry, at that class's own level, the table's count minus the picks the
 * entry holds. Never negative, never a pick the table doesn't give.
 *
 *   - invocations — Warlock "Eldritch Invocations" column vs `invocationChoices`;
 *   - metamagic — Sorcerer "Metamagic" (2 / 4 / 6 at 2 / 10 / 17) vs `metamagicChoices`;
 *   - maneuvers — Combat Superiority (3 / 5 / 7 / 9 at Fighter 3 / 7 / 10 / 15), only
 *     when the character has it, vs `maneuverChoices`;
 *   - weaponMasteries — the class's "Weapon Mastery" column vs `weaponMasteries`;
 *   - cantrips — the class's "Cantrips" column vs the character's own cantrips: the
 *     plain ones (a feat's, a species', a subclass's fixed cantrip is always
 *     prepared and isn't one of them), each counted for a class whose list has it,
 *     the narrowest first; a cantrip on no owing list (added by hand) still fills
 *     a gap, so a player who has the count is never asked;
 *   - spellbook — the Wizard's book (6, then 2 per Wizard level) vs the levelled Wizard
 *     spells on the sheet (`wizard-spellbook.ts`); the picks land in the book, not
 *     prepared;
 *   - expertise — two skills each time the table grants Expertise (Bard 2 and 9, Rogue
 *     1 and 6) vs the skills at Expertise, never more than the proficient skills left
 *     to raise. Expertise from elsewhere (a feat) counts as held, so the player is
 *     never asked for more than the classes give.
 *
 * The counts are the level-up's own (`invocationsKnownAt`, `metamagicKnownAt`,
 * `maneuversKnownAt`, `weaponMasteryCountForClass`, the table's `cantripsKnown`),
 * and answers are stored by `applyClassPicks`, the level-up's write. The 2024
 * tables give prepared spells, a cap the player fills, never "spells known".
 *
 * Pure module — no React, no store.
 */
import { getClassTable } from "@/data/classes";
import { expertiseGrantsThrough } from "@/lib/creation/class-choices";
import { getSpellById, spells as allSpells } from "@/data/spells";
import { isWeaponProficient } from "@/lib/compute";
import {
  isFightingStylePlaceholder,
  listAllFightingStyles,
  listFightingStyles,
} from "@/lib/fighting-style";
import { eligibleInvocations, invocationsKnownAt } from "@/lib/invocation-pick";
import {
  applyExpertisePicks,
  EXPERTISE_PICKS_PER_GRANT,
  listExpertiseEligibleSkills,
} from "@/lib/expertise-pick";
import { applyClassPicks } from "@/lib/level-up-commit";
import {
  eligibleManeuvers,
  isManeuverPlaceholder,
  maneuversKnownAt,
} from "@/lib/maneuver-pick";
import { listMetamagicOptions, metamagicKnownAt } from "@/lib/metamagic-pick";
import {
  listMasterableWeapons,
  weaponMasteryCountForClass,
} from "@/lib/weapon-mastery-pick";
import { wizardBookOwed, wizardMaxSpellLevel } from "@/lib/wizard-spellbook";
import type { CharacterData, ClassEntry } from "@/types/character";

export type ClassPickKind =
  | "invocations"
  | "cantrips"
  | "metamagic"
  | "maneuvers"
  | "weaponMasteries"
  | "fightingStyles"
  | "spellbook"
  | "expertise";

export interface OwedClassPick {
  classId: string;
  pick: ClassPickKind;
  owed: number;
}

/** One answer: the new picks for one class's owed kind. */
export interface ClassPickAnswer {
  classId: string;
  pick: ClassPickKind;
  ids: readonly string[];
}

export type BuildForClassPicks = Partial<
  Pick<CharacterData, "classes" | "spells" | "features" | "skills">
>;

const ORDER: readonly ClassPickKind[] = [
  "metamagic",
  "invocations",
  "maneuvers",
  "weaponMasteries",
  "fightingStyles",
  "cantrips",
  "spellbook",
  "expertise",
];

function entries(build: BuildForClassPicks): ClassEntry[] {
  return (build.classes ?? []).filter(
    (e) => e.classId !== "" && getClassTable(e.classId) !== undefined
  );
}

function levelOf(entry: ClassEntry): number {
  return Math.max(1, Math.min(20, Math.floor(entry.level)));
}

/** The table's cantrip count for each entry, by class id. */
function cantripBudgets(build: BuildForClassPicks): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries(build)) {
    const row = getClassTable(e.classId)?.levels.find((l) => l.level === levelOf(e));
    const n = row?.cantripsKnown ?? 0;
    if (n > 0) out.set(e.classId, (out.get(e.classId) ?? 0) + n);
  }
  return out;
}

/** How many of each class's cantrips are still to learn. */
function cantripsOwed(build: BuildForClassPicks): Map<string, number> {
  const left = cantripBudgets(build);
  if (left.size === 0) return left;
  const classIds = [...left.keys()];
  const lists: string[][] = [];
  for (const s of build.spells ?? []) {
    if ("custom" in s) {
      if (s.level === 0) lists.push([]);
      continue;
    }
    if (s.alwaysPrepared || s.freeCastSource != null || s.speciesSpellAbility) continue;
    const data = getSpellById(s.srdId);
    if (data?.level !== 0) continue;
    lists.push(
      s.viaClass ? [s.viaClass] : classIds.filter((id) => data.classes.includes(id))
    );
  }
  // The narrowest first, so a Warlock-only cantrip isn't crowded out by a shared one.
  lists.sort((a, b) => (a.length || 99) - (b.length || 99));
  let unplaced = 0;
  for (const list of lists) {
    const home = list.find((id) => (left.get(id) ?? 0) > 0);
    if (home) left.set(home, (left.get(home) ?? 0) - 1);
    else unplaced += 1;
  }
  for (const id of classIds) {
    const fill = Math.min(unplaced, left.get(id) ?? 0);
    left.set(id, (left.get(id) ?? 0) - fill);
    unplaced -= fill;
  }
  return left;
}

/** The styles the character holds: a style feat (Defense, Archery…) or a concrete
 *  `<placeholder>-<style>` feature. */
function heldFightingStyles(build: BuildForClassPicks): string[] {
  const styles = new Set(listAllFightingStyles().map((s) => s.id));
  const ids = (build.features ?? []).flatMap((f) => ("srdId" in f ? [f.srdId] : []));
  return ids.filter(
    (id) =>
      styles.has(id) ||
      ids.some((other) => isFightingStylePlaceholder(other) && id.startsWith(`${other}-`))
  );
}

/** The Expertise picks each class still owes: the classes' grants minus the skills at
 *  Expertise, capped by the proficient skills left to raise, set against the classes
 *  in order. */
function expertiseOwed(build: BuildForClassPicks): Map<string, number> {
  const out = new Map<string, number>();
  const skills = build.skills ?? {};
  const held = Object.values(skills).filter((v) => v === "expertise").length;
  const earned = entries(build).map(
    (e) =>
      [
        e.classId,
        expertiseGrantsThrough(e.classId, levelOf(e)) * EXPERTISE_PICKS_PER_GRANT,
      ] as const
  );
  const total = earned.reduce((n, [, x]) => n + x, 0);
  let left = Math.min(
    Math.max(0, total - held),
    listExpertiseEligibleSkills(skills).length
  );
  for (const [classId, x] of earned) {
    const owed = Math.min(left, x);
    if (owed > 0) out.set(classId, (out.get(classId) ?? 0) + owed);
    left -= owed;
  }
  return out;
}

/** Every class pick the character owes, per class, in a stable order. */
export function owedClassPicks(build: BuildForClassPicks): OwedClassPick[] {
  const out: OwedClassPick[] = [];
  const hasManeuvers = (build.features ?? []).some(
    (f) => "srdId" in f && isManeuverPlaceholder(f.srdId)
  );
  const cantrips = cantripsOwed(build);
  const expertise = expertiseOwed(build);
  // Styles held (style feats among the features), set against each class's
  // Fighting Style slots in class order.
  let stylesHeld = heldFightingStyles(build).length;
  const seen = new Set<string>();
  for (const e of entries(build)) {
    if (seen.has(e.classId)) continue;
    seen.add(e.classId);
    const level = levelOf(e);
    const due: Record<ClassPickKind, number> = {
      invocations:
        e.classId === "warlock"
          ? invocationsKnownAt(level) - (e.invocationChoices?.length ?? 0)
          : 0,
      metamagic:
        e.classId === "sorcerer"
          ? metamagicKnownAt(level) - (e.metamagicChoices?.length ?? 0)
          : 0,
      maneuvers:
        e.classId === "fighter" && hasManeuvers
          ? maneuversKnownAt(level) - (e.maneuverChoices?.length ?? 0)
          : 0,
      weaponMasteries:
        weaponMasteryCountForClass(e.classId, level) - (e.weaponMasteries?.length ?? 0),
      cantrips: cantrips.get(e.classId) ?? 0,
      fightingStyles: 0,
      spellbook:
        e.classId === "wizard"
          ? wizardBookOwed(
              { spells: build.spells ?? [], features: build.features ?? [] },
              level
            )
          : 0,
      expertise: expertise.get(e.classId) ?? 0,
    };
    // The slots the sheet holds open (`<class>-fighting-style` placeholders).
    const styleSlots = (build.features ?? []).filter(
      (f) =>
        "srdId" in f &&
        isFightingStylePlaceholder(f.srdId) &&
        f.srdId.startsWith(`${e.classId}-`)
    ).length;
    const covered = Math.min(styleSlots, stylesHeld);
    stylesHeld -= covered;
    due.fightingStyles = styleSlots - covered;
    for (const pick of ORDER) {
      if (due[pick] > 0) out.push({ classId: e.classId, pick, owed: due[pick] });
    }
  }
  return out;
}

/**
 * The answers stored as a level-up stores them (`applyClassPicks`), each cut to
 * what is owed; an answer for a pick that isn't owed is ignored. The same
 * character back when nothing applies.
 */
export function applyOwedClassPicks(
  character: CharacterData,
  answers: readonly ClassPickAnswer[]
): CharacterData {
  const owed = owedClassPicks(character);
  let next = character;
  for (const answer of answers) {
    const debt = owed.find((o) => o.classId === answer.classId && o.pick === answer.pick);
    if (!debt) continue;
    const ids = [...new Set(answer.ids)].slice(0, debt.owed);
    if (ids.length === 0) continue;
    if (answer.pick === "spellbook") {
      next = {
        ...next,
        spells: [...next.spells, ...ids.map((srdId) => ({ srdId, prepared: false }))],
      };
      continue;
    }
    if (answer.pick === "expertise") {
      next = { ...next, skills: applyExpertisePicks(next.skills, ids) };
      continue;
    }
    if (answer.pick === "fightingStyles") {
      for (const id of ids)
        next = applyClassPicks(next, answer.classId, { fightingStyle: id });
      continue;
    }
    const entry = next.classes.find((e) => e.classId === answer.classId);
    next = applyClassPicks(next, answer.classId, {
      invocations: answer.pick === "invocations" ? ids : [],
      metamagic: answer.pick === "metamagic" ? ids : [],
      maneuvers: answer.pick === "maneuvers" ? ids : [],
      cantrips: answer.pick === "cantrips" ? ids : [],
      weaponMasteries:
        answer.pick === "weaponMasteries"
          ? [...(entry?.weaponMasteries ?? []), ...ids]
          : null,
    });
  }
  return next;
}

/**
 * The ids an owed pick may be answered with, in the level-up picker's order: the
 * pools «Scelte da completare» localizes (`owedClassPickRows`) — the invocations
 * eligible at the Warlock's level, the unknown Metamagic and maneuvers, the
 * masterable weapons not yet mastered, the class's cantrips not yet known.
 */
export function classPickPool(
  build: BuildForClassPicks,
  classId: string,
  pick: ClassPickKind
): string[] {
  const entry = build.classes?.find((e) => e.classId === classId);
  const level = entry ? levelOf(entry) : 1;
  const ids = (list: ReadonlyArray<{ id: string }>) => list.map((x) => x.id);
  switch (pick) {
    case "invocations":
      return ids(eligibleInvocations(level, entry?.invocationChoices ?? []));
    case "metamagic": {
      const known = new Set(entry?.metamagicChoices ?? []);
      return ids(listMetamagicOptions().filter((o) => !known.has(o.id)));
    }
    case "maneuvers":
      return ids(eligibleManeuvers(level, entry?.maneuverChoices ?? []));
    case "weaponMasteries": {
      const mastered = new Set(entry?.weaponMasteries ?? []);
      return ids(listMasterableWeapons().filter((w) => !mastered.has(w.id)));
    }
    case "fightingStyles": {
      const held = new Set(heldFightingStyles(build));
      return ids(listFightingStyles(classId).filter((s) => !held.has(s.id)));
    }
    case "cantrips": {
      const known = new Set(
        (build.spells ?? []).flatMap((s) => ("custom" in s ? [] : [s.srdId]))
      );
      return ids(
        allSpells.filter(
          (s) => s.level === 0 && s.classes.includes(classId) && !known.has(s.id)
        )
      );
    }
    case "expertise":
      return listExpertiseEligibleSkills(build.skills ?? {});
    case "spellbook": {
      const known = new Set(
        (build.spells ?? []).flatMap((s) => ("custom" in s ? [] : [s.srdId]))
      );
      const max = wizardMaxSpellLevel(level);
      return ids(
        allSpells.filter(
          (s) =>
            s.level >= 1 &&
            s.level <= max &&
            s.classes.includes(classId) &&
            !known.has(s.id)
        )
      );
    }
  }
}

/**
 * Weapon Mastery picks a player would make: the weapons the class is proficient
 * with, the ones the character carries first.
 */
function masteryPreference(character: CharacterData, classId: string, pool: string[]) {
  const profs = getClassTable(classId)?.weaponProficiencies ?? [];
  const weapons = new Map(listMasterableWeapons().map((w) => [w.id, w]));
  const proficient = pool.filter((id) => {
    const w = weapons.get(id);
    return (
      w !== undefined &&
      isWeaponProficient(w.weaponCategory, w.id, w.weaponType, w.properties ?? [], profs)
    );
  });
  const carried = new Set(
    character.weapons.flatMap((w) => ("custom" in w ? [] : [w.srdId]))
  );
  return [
    ...proficient.filter((id) => carried.has(id)),
    ...proficient.filter((id) => !carried.has(id)),
  ];
}

/**
 * The character with every owed class pick filled by the first legal options of
 * its pool (Weapon Mastery: proficient weapons, carried ones first), stored like
 * the banner's answers. Picks the character holds are kept; only the gap is filled.
 */
export function fillOwedClassPicks(character: CharacterData): CharacterData {
  const answers = owedClassPicks(character).map(({ classId, pick, owed }) => {
    const pool = classPickPool(character, classId, pick);
    const ordered =
      pick === "weaponMasteries" ? masteryPreference(character, classId, pool) : pool;
    return { classId, pick, ids: ordered.slice(0, owed) };
  });
  return applyOwedClassPicks(character, answers);
}

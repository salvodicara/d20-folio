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
 *     a gap, so a player who has the count is never asked.
 *
 * The counts are the level-up's own (`invocationsKnownAt`, `metamagicKnownAt`,
 * `maneuversKnownAt`, `weaponMasteryCountForClass`, the table's `cantripsKnown`),
 * and answers are stored by `applyClassPicks`, the level-up's write. The 2024
 * tables give prepared spells, a cap the player fills, never "spells known".
 *
 * Pure module — no React, no store.
 */
import { getClassTable } from "@/data/classes";
import { getSpellById } from "@/data/spells";
import { invocationsKnownAt } from "@/lib/invocation-pick";
import { applyClassPicks } from "@/lib/level-up-commit";
import { isManeuverPlaceholder, maneuversKnownAt } from "@/lib/maneuver-pick";
import { metamagicKnownAt } from "@/lib/metamagic-pick";
import { weaponMasteryCountForClass } from "@/lib/weapon-mastery-pick";
import type { CharacterData, ClassEntry } from "@/types/character";

export type ClassPickKind =
  | "invocations"
  | "cantrips"
  | "metamagic"
  | "maneuvers"
  | "weaponMasteries";

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
  Pick<CharacterData, "classes" | "spells" | "features">
>;

const ORDER: readonly ClassPickKind[] = [
  "metamagic",
  "invocations",
  "maneuvers",
  "weaponMasteries",
  "cantrips",
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

/** Every class pick the character owes, per class, in a stable order. */
export function owedClassPicks(build: BuildForClassPicks): OwedClassPick[] {
  const out: OwedClassPick[] = [];
  const hasManeuvers = (build.features ?? []).some(
    (f) => "srdId" in f && isManeuverPlaceholder(f.srdId)
  );
  const cantrips = cantripsOwed(build);
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
    };
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

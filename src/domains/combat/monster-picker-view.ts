/**
 * What the new campaign page's monster picker reads (Direction's blocker 2). The bestiary
 * rows come from the compendium picker; this adds the DM's homebrew monsters in the
 * same shape, turns a picked one into the add move's input, and grades the fight as it
 * would be with the picked creatures (the DDB-style readout, on the 2024 SRD
 * encounter-building budgets the classic `EncounterBudgetReadout` uses). Pure.
 */
import { customMonsterToInput } from "@/features/campaigns/encounter-monster-input";
import type { MonsterInput } from "@/features/campaigns/encounter";
import { totalLevel } from "@/lib/classes";
import {
  budgetVerdict,
  encounterXpCost,
  partyXpBudget,
  type BudgetVerdict,
} from "@/lib/encounter-difficulty";
import type { LibraryEntry } from "@/lib/library";
import { xpForCr } from "@/lib/monster";
import type { CampaignDoc, CustomMonster } from "@/types/campaign";

/** One picker row, bestiary or homebrew. `cr` is null for an un-costed creature. */
export interface PickerMonster {
  id: string;
  kind: "srd" | "homebrew";
  name: string;
  cr: number | null;
  ac: number;
  maxHp: number;
}

type MonsterEntry = LibraryEntry & { kind: "monster"; item: CustomMonster };
const isMonster = (entry: LibraryEntry): entry is MonsterEntry =>
  entry.kind === "monster";

const crOf = (cr: string | undefined): number | null => {
  const value = cr?.trim() ? Number(cr) : NaN;
  return Number.isFinite(value) ? value : null;
};

/** The DM's library monsters as picker rows. */
export function homebrewPickerMonsters(
  entries: ReadonlyArray<LibraryEntry>
): PickerMonster[] {
  return entries.filter(isMonster).map((entry) => ({
    id: entry.id,
    kind: "homebrew",
    name: entry.item.name,
    cr: crOf(entry.item.cr),
    ac: entry.item.ac,
    maxHp: entry.item.maxHp,
  }));
}

/** A picked homebrew monster as the add move's input (`addMonstersMove`). */
export function homebrewMonsterInput(
  entries: ReadonlyArray<LibraryEntry>,
  id: string,
  count: number,
  initiative: number | null
): MonsterInput | null {
  const entry = entries.find((candidate) => candidate.id === id);
  return entry && isMonster(entry)
    ? customMonsterToInput(entry.item, count, initiative)
    : null;
}

/**
 * The fight graded with the picked creatures added: the enemies already in it plus the
 * picks, against the attached characters' budgets. `difficulty` is null while nothing
 * is costed or no character is attached.
 */
export function encounterBudget(
  campaign: Pick<CampaignDoc, "memberDetails" | "encounter">,
  picked: ReadonlyArray<{ cr: number | null; count: number }>
): { xp: number; difficulty: BudgetVerdict | null } {
  const levels = Object.values(campaign.memberDetails).flatMap((member) => {
    const classes = member.character?.classes;
    return member.characterId && classes?.length ? [totalLevel({ classes })] : [];
  });
  const inFight = (campaign.encounter?.combatants ?? []).flatMap((c) =>
    c.kind === "monster" && (c.side ?? "enemy") === "enemy"
      ? [{ ...(c.xp !== undefined ? { xp: c.xp } : {}), count: 1 }]
      : []
  );
  const added = picked.map(({ cr, count }) => ({
    ...(cr !== null ? { xp: xpForCr(cr) } : {}),
    count,
  }));
  const { costedXp } = encounterXpCost([...inFight, ...added]);
  const budget = partyXpBudget(levels);
  return {
    xp: costedXp,
    difficulty: budget && costedXp > 0 ? budgetVerdict(costedXp, budget) : null,
  };
}

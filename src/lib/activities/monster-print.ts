/**
 * What a monster entry's English print says the DM can apply in one tap, read
 * from the SRD 5.2.1 stat-block wording. The bestiary data declares these facts
 * (`conditions` on an attack, `damage` and `performs` on a prose entry) and the
 * corpus guard pins every declaration to this reading of its print, so the data
 * never outruns the text. Pure: text in, facts out.
 *
 *  - {@link printedHitConditions}: the conditions an attack's "Hit:" clause gives,
 *    whether a sentence gates them ("If the target is a Medium or smaller
 *    creature, …"), or the save the hit forces before they land.
 *  - {@link printedAutomaticDamage}: damage a trait or action deals to other
 *    creatures with no roll (Fire Aura, Corrosive Form, Barbed Hide).
 *  - {@link printedPerformedEntry}: an entry that uses one of the monster's own
 *    attacks or saves (a dragon's Pounce "makes one Rend attack").
 *
 * The escape DC, durations and later stages stay text.
 */
import type { AbilityCode, ConditionId, MonsterDamage } from "@/data/types";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import { CONDITION_IDS } from "@/types/condition";

import type { MonsterSection } from "./types";

export interface PrintedHitConditions {
  conditions: ConditionId[];
  /** A sentence gates them on a fact the print states (size, a charge, 0 HP). */
  gated?: true;
  /** They land only on a failed save the hit forces. */
  save?: { save: AbilityCode; dc: number };
}

const ABILITY: Readonly<Record<string, AbilityCode>> = {
  Strength: "STR",
  Dexterity: "DEX",
  Constitution: "CON",
  Intelligence: "INT",
  Wisdom: "WIS",
  Charisma: "CHA",
};

const sentences = (text: string): string[] =>
  text
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

function conditionId(word: string): ConditionId {
  const id = word.toLowerCase();
  if (!(CONDITION_IDS as readonly string[]).includes(id))
    throw new Error(`unknown condition "${word}"`);
  return id as ConditionId;
}

/** "has the Blinded and Deafened conditions" → ["blinded", "deafened"], print order. */
function namedConditions(sentence: string): ConditionId[] {
  const out: ConditionId[] = [];
  for (const match of sentence.matchAll(
    /\bhas the ([A-Z]\w+(?:(?:, and |, | and )[A-Z]\w+)*) conditions?\b/g
  )) {
    for (const name of (match[1] ?? "").split(/, and |, | and /)) {
      const id = conditionId(name);
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

/** A sentence that describes a state the target is already in, not a new one. */
const describesState = (sentence: string): boolean =>
  /^(?:While|Until|Whenever)\b/.test(sentence);

/** The conditions of a save's first "Failure:" clause, up to its next stage. */
function failureConditions(rest: string): ConditionId[] {
  const failure = rest.split(/\b(?:First )?Failure:/)[1];
  if (failure === undefined) return [];
  const clause =
    failure.split(
      /\b(?:Success:|Failure or Success:|Failure by \d+ or More:|Second Failure:)/
    )[0] ?? "";
  return sentences(clause)
    .filter((sentence) => !describesState(sentence))
    .flatMap(namedConditions)
    .filter((id, index, all) => all.indexOf(id) === index);
}

/** The conditions an attack's Hit clause gives, or undefined when it gives none. */
export function printedHitConditions(text: string): PrintedHitConditions | undefined {
  const hit = text.split(/\bHit:/)[1];
  if (hit === undefined) return undefined;
  // A save the hit itself forces: "…, it is subjected to the following effect.
  // Constitution Saving Throw: DC 10. Failure: …". One a later event forces
  // ("Whenever the Poisoned target finishes a Long Rest, …") is not the hit's.
  const [direct = "", ...after] = hit.split(/\b(\w+) Saving Throw: DC (\d+)\./);
  const introducing = sentences(direct).at(-1) ?? "";
  if (after.length > 0 && !describesState(introducing)) {
    const [ability = "", dc = "", rest = ""] = after;
    const save = ABILITY[ability];
    const conditions = failureConditions(rest);
    if (save && conditions.length > 0)
      return { conditions, save: { save, dc: Number(dc) } };
  }
  const conditions: ConditionId[] = [];
  let gated = false;
  for (const sentence of sentences(direct)) {
    if (describesState(sentence)) continue;
    const named = namedConditions(sentence);
    if (named.length === 0) continue;
    if (/^If\b/.test(sentence)) gated = true;
    for (const id of named) if (!conditions.includes(id)) conditions.push(id);
  }
  if (conditions.length === 0) return undefined;
  return gated ? { conditions, gated: true } : { conditions };
}

function damageType(word: string): DamageType {
  const type = word.toLowerCase();
  if (!(DAMAGE_TYPES as readonly string[]).includes(type))
    throw new Error(`unknown damage type "${word}"`);
  return type as DamageType;
}

const DICE = String.raw`\d+ \((\d+d\d+(?: [+-] \d+)?)\) ([A-Z]\w+) damage`;

/**
 * The damage a prose entry deals to other creatures with no attack roll or save,
 * print order. The subject is a creature or the target, in the same clause:
 * "each creature … takes 5 (1d10) Fire damage", "A creature that hits the pudding
 * … takes", "the devil deals 5 (1d10) Piercing damage to any creature". Damage the
 * monster takes itself ("It takes 5 (1d10) Force damage") is not one.
 */
export function printedAutomaticDamage(text: string): MonsterDamage[] {
  const out: MonsterDamage[] = [];
  // Damage a save decides is the save's, not automatic.
  if (/\bSaving Throw: DC\b/.test(text)) return out;
  const clause = (dice: string, type: string) =>
    out.push({ dice: dice.replace(/ /g, ""), damageType: damageType(type) });
  for (const sentence of sentences(text)) {
    for (const match of sentence.matchAll(
      new RegExp(
        String.raw`\b(?:[Ee]ach creature|[Tt]hat creature|[Aa]ny creature|A creature|the (?:swallowed )?target)\b[^.,]*?\btakes ${DICE}`,
        "g"
      )
    ))
      clause(match[1] ?? "", match[2] ?? "");
    for (const match of sentence.matchAll(
      new RegExp(String.raw`\bdeals ${DICE} to (?:any|each) creature\b`, "g")
    ))
      clause(match[1] ?? "", match[2] ?? "");
  }
  return out;
}

/** One entry of the same stat block, as the parser needs it. */
export interface PrintedEntryName {
  section: MonsterSection;
  entryId: string;
  /** The English name as printed ("Grave Strike (Vampire Form Only)"). */
  name: string;
  kind: "attack" | "save" | "narrative" | "spellcasting";
}

/** The monster itself as the sentence's subject: "The mummy", "the rust monster",
 *  "it" (not "the wisp makes an attack roll or uses Consume Life"). */
const SUBJECT = String.raw`\b(?:[Tt]he [a-z]+(?: [a-z]+)?|[Ii]t)`;

/**
 * The one attack or save of the same stat block this entry uses: "it makes one
 * Rend attack", "The mummy uses Dreadful Glare". A choice ("one Claw or Tail
 * attack"), several attacks, or a name that is no attack or save of the block
 * resolve to nothing.
 */
export function printedPerformedEntry(
  text: string,
  entries: ReadonlyArray<PrintedEntryName>
): { section: MonsterSection; entryId: string } | undefined {
  const named = [
    ...text.matchAll(
      new RegExp(String.raw`${SUBJECT} makes one ([A-Z][\w' -]*?) attack\b`, "g")
    ),
    ...text.matchAll(
      new RegExp(String.raw`${SUBJECT} uses ([A-Z][\w' -]*?)(?=[.,]| and )`, "g")
    ),
  ].map((match) => match[1]);
  const bare = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "");
  const found = named.flatMap((name) =>
    entries.filter(
      (entry) =>
        (entry.kind === "attack" || entry.kind === "save") && bare(entry.name) === name
    )
  );
  const [only] = found;
  if (found.length !== 1 || !only) return undefined;
  return { section: only.section, entryId: only.entryId };
}

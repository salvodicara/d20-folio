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
 *  - {@link printedMultiattack}: a Multiattack's routine over the block's own
 *    entries, with its alternative routine and the swap it allows.
 *  - {@link printedMovement}: how an entry moves the monster (Teleport, Leap,
 *    Charge, Dash/Disengage/Hide, Spider Climb).
 *  - {@link printedBreathing}: Amphibious and Water Breathing.
 *
 * The escape DC, durations and later stages stay text.
 */
import type {
  AbilityCode,
  ConditionId,
  MonsterBreathing,
  MonsterDamage,
  MonsterMoveSpeed,
  MonsterMovement,
  MonsterMultiattack,
  MonsterMultiattackStep,
} from "@/data/types";
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

const COUNT: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};
const N = "(one|two|three|four|five|six)";
/** A printed entry name: capitalised words, "of (the)" between them ("Grave
 *  Strike", "Channel Negative Energy", "Curse of the Riddle"). */
const NAME = String.raw`[A-Z][\w'-]*(?:(?: of(?: the)?)? [A-Z][\w'-]*)*`;

/** Thrown inside the parser when the print names something it cannot pin. */
class Unpinned extends Error {}

/** The one entry (not a Multiattack) of the block printed with this bare name. */
function entryNamed(name: string, entries: ReadonlyArray<PrintedEntryName>): string {
  const found = entries.filter(
    (entry) => !/^Multiattack\b/.test(entry.name) && bareName(entry.name) === name
  );
  const [only] = found;
  if (found.length !== 1 || !only) throw new Unpinned(name);
  return only.entryId;
}

const bareName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, "");

const names = (list: string, entries: ReadonlyArray<PrintedEntryName>): string[] =>
  list.split(/, or |, | or | and /).map((name) => entryNamed(name, entries));

const STEP_ANY = new RegExp(
  String.raw`^(?:makes )?${N} (?:other )?attacks, using (${NAME}(?:(?:, or |, | or | and )${NAME})*) in any combination`
);
const STEP_ATTACK = new RegExp(
  String.raw`^(?:makes )?${N} (${NAME}(?: or ${NAME})*) attacks?(?: in any combination)?\b`
);
const STEP_USE = new RegExp(
  String.raw`^(can )?uses? (?:either )?(${NAME}(?:(?:, or |, | or )${NAME})*)(?: to cast [^,.]+?)?( twice| ${N} times)?( if available)?(?=,| and |$)`
);

/** One routine ("makes two Claw attacks and one Snake Hair attack"), print order. */
function routine(
  src: string,
  entries: ReadonlyArray<PrintedEntryName>
): MonsterMultiattackStep[] {
  const steps: MonsterMultiattackStep[] = [];
  let rest = src.replace(/^it /, "");
  while (rest.length > 0) {
    if (steps.length > 0) {
      const separator = rest.match(/^(?:,? and (?:it )?|, )/);
      if (!separator) throw new Unpinned(rest);
      rest = rest.slice(separator[0].length);
    }
    let match: RegExpMatchArray | null;
    if ((match = rest.match(STEP_ANY)) || (match = rest.match(STEP_ATTACK))) {
      steps.push({
        count: COUNT[match[1] ?? ""] ?? 0,
        use: names(match[2] ?? "", entries),
      });
    } else if ((match = rest.match(STEP_USE))) {
      steps.push({
        count: match[4] ? (COUNT[match[4]] ?? 0) : match[3] ? 2 : 1,
        use: names(match[2] ?? "", entries),
        ...(match[1] || match[5] ? { optional: true as const } : {}),
      });
    } else throw new Unpinned(rest);
    rest = rest.slice(match[0].length);
  }
  return steps;
}

/** "It can replace one attack with a use of (A) Sleep Breath or (B) Spellcasting …". */
function replacement(
  sentence: string,
  entries: ReadonlyArray<PrintedEntryName>
): NonNullable<MonsterMultiattack["replace"]> {
  const match = sentence.match(
    new RegExp(
      String.raw`^It can replace (one|two|any|the (${NAME})) attacks? with (.+?)(?: if available)?\.$`
    )
  );
  if (!match) throw new Unpinned(sentence);
  const [, how = "", of, swap = ""] = match;
  const attack = swap.match(new RegExp(String.raw`^an? (${NAME}) attack$`));
  const use = attack
    ? [entryNamed(attack[1] ?? "", entries)]
    : swap
        .replace(/^a use of /, "")
        .replace(/^\(A\) /, "")
        .split(/ or \(B\) /)
        .map((option) => {
          const name = option.match(new RegExp(String.raw`^(${NAME})(?: to cast .+)?$`));
          if (!name || !swap.startsWith("a use of ")) throw new Unpinned(option);
          return entryNamed(name[1] ?? "", entries);
        });
  return {
    count: of ? 1 : how === "any" ? "any" : (COUNT[how] ?? 0),
    use,
    ...(of ? { of: entryNamed(of, entries) } : {}),
  };
}

/**
 * The routine a Multiattack prints, over the entries of the same stat block:
 * "The dragon makes three Rend attacks. It can replace one attack with a use of
 * Spellcasting to cast Scorching Ray." A count the table decides ("as many Bite
 * attacks as it has heads"), a routine gated on an earlier turn, or a name that
 * is no single entry of the block resolve to nothing: the entry stays text.
 */
export function printedMultiattack(
  text: string,
  entries: ReadonlyArray<PrintedEntryName>
): MonsterMultiattack | undefined {
  const [first = "", ...more] = sentences(text);
  const body = first.match(/^The [a-z-]+(?: [a-z-]+)*? ((?:makes|uses) .+)\.$/)?.[1];
  if (!body) return undefined;
  try {
    // "…, or it makes three Poison Ray attacks", "… or two Earth Burst attacks".
    const [main = "", alternative, ...others] = body.split(
      /,? or (?=(?:it )?(?:makes|uses) |(?:one|two|three|four|five|six) )/
    );
    if (others.length > 0) return undefined;
    const steps = routine(main, entries);
    const or = alternative === undefined ? undefined : routine(alternative, entries);
    let replace: MonsterMultiattack["replace"];
    for (const sentence of more) {
      const also = sentence.match(/^It also (uses .+)\.$/);
      if (also) steps.push(...routine(also[1] ?? "", entries));
      else if (!replace) replace = replacement(sentence, entries);
      else return undefined;
    }
    return { steps, ...(or ? { or } : {}), ...(replace ? { replace } : {}) };
  } catch (error) {
    if (error instanceof Unpinned) return undefined;
    throw error;
  }
}

/** The sentence of `text` that holds index `at`. */
function sentenceAt(text: string, at: number): string {
  let start = 0;
  for (const sentence of sentences(text)) {
    const index = text.indexOf(sentence, start);
    if (at >= index && at < index + sentence.length) return sentence;
    start = index + sentence.length;
  }
  return "";
}

const SPEED: Readonly<Record<string, MonsterMoveSpeed>> = {
  Fly: "fly",
  Swim: "swim",
  Burrow: "burrow",
};
const MOVE_ACTIONS = "Dash|Disengage|Hide";

type Movement = MonsterMovement;
const MOVEMENT_READERS: ReadonlyArray<
  readonly [RegExp, (match: RegExpMatchArray, sentence: string) => Movement]
> = [
  [
    /\bteleports (?:itself or a willing [\w ]+? within \d+ feet of itself )?up to (\d+) feet\b/,
    (m) => ({ kind: "teleport", feet: Number(m[1]) }),
  ],
  [
    /\bjumps up to (\d+) feet by spending (\d+) feet of movement\b/,
    (m) => ({ kind: "leap", feet: Number(m[1]), costFt: Number(m[2]) }),
  ],
  [
    /\bLong Jump is up to (\d+) feet and its High Jump is up to (\d+) feet\b/,
    (m) => ({ kind: "long-jump", feet: Number(m[1]), highFt: Number(m[2]) }),
  ],
  [
    /\bWith a (\d+)-foot running start, the [a-z-]+(?: [a-z-]+)? can Long Jump up to (\d+) feet\b/,
    (m) => ({ kind: "long-jump", feet: Number(m[2]), runningStartFt: Number(m[1]) }),
  ],
  [
    new RegExp(
      String.raw`${SUBJECT} (?:moves|flies|swims|can fly) up to (?:(\d+) feet|(half )?its (?:(Fly|Swim|Burrow) )?Speed((?:(?:,? or |, )(?:Fly|Swim|Burrow) Speed)*))\b`
    ),
    (m, sentence) => ({
      kind: "move",
      speeds: [
        SPEED[m[3] ?? ""] ?? "walk",
        ...[...(m[4] ?? "").matchAll(/(Fly|Swim|Burrow) Speed/g)].map(
          (other) => SPEED[other[1] ?? ""] ?? "walk"
        ),
      ],
      ...(m[1] ? { feet: Number(m[1]) } : {}),
      ...(m[2] ? { half: true as const } : {}),
      ...(/\bwithout provoking Opportunity Attacks\b/.test(sentence)
        ? { noOpportunityAttacks: true as const }
        : {}),
      ...(/\b(?:straight )?toward an enemy\b/.test(sentence)
        ? { towardEnemy: true as const }
        : {}),
    }),
  ],
  [
    new RegExp(
      String.raw`\btakes the ((?:${MOVE_ACTIONS})(?:(?:, or |, | and | or )(?:${MOVE_ACTIONS}))*) actions?\b`
    ),
    (m) => ({
      kind: "take-action",
      actions: (m[1] ?? "")
        .split(/, or |, | and | or /)
        .map((action) => action.toLowerCase() as "dash" | "disengage" | "hide"),
      ...(/ or /.test(m[1] ?? "") ? { pickOne: true as const } : {}),
    }),
  ],
  [
    /\bcan climb difficult surfaces, including along ceilings, without needing to make an ability check\b/,
    () => ({ kind: "spider-climb" }),
  ],
  [
    /\bcan burrow through solid rock at half its Burrow Speed\b/,
    () => ({ kind: "burrow-through", material: "solid-rock", half: true }),
  ],
  [
    /\bcan burrow through nonmagical, unworked earth and stone\b/,
    () => ({ kind: "burrow-through", material: "earth-and-stone" }),
  ],
];

/**
 * How the entry moves the monster, the first move the print states: a teleport
 * or jump distance, a move up to (half) a Speed, the Dash/Disengage/Hide it
 * takes, Spider Climb, burrowing through stone. A sentence opening "While" or
 * "If" gates it. A plane shift, a Speed change, or another creature's move is
 * none.
 */
export function printedMovement(text: string): MonsterMovement | undefined {
  let first: { at: number; movement: Movement } | undefined;
  for (const [pattern, read] of MOVEMENT_READERS) {
    const match = text.match(pattern);
    if (match?.index === undefined || (first && first.at <= match.index)) continue;
    const sentence = sentenceAt(text, match.index);
    const movement = read(match, sentence);
    first = {
      at: match.index,
      movement: /^(?:While|If)\b/.test(sentence)
        ? { ...movement, gated: true }
        : movement,
    };
  }
  return first?.movement;
}

/** What the monster breathes: "can breathe air and water" (Amphibious) or "can
 *  breathe only underwater" (Water Breathing). A limit on it stays text. */
export function printedBreathing(text: string): MonsterBreathing | undefined {
  const all = sentences(text);
  if (all.some((s) => /^The [a-z-]+(?: [a-z-]+)? can breathe air and water\.$/.test(s)))
    return "air-and-water";
  if (all.some((s) => /^The [a-z-]+(?: [a-z-]+)? can breathe only underwater\.$/.test(s)))
    return "water-only";
  return undefined;
}

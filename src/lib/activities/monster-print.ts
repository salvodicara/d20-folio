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
 *  - {@link printedTraitFact}: the number a prose trait changes at the table
 *    (Magic Resistance, Pack Tactics, Regeneration and what suppresses it).
 *  - {@link printedAttack}, {@link printedSave}, {@link printedSpellcasting}: an
 *    entry's opening line (to-hit, reach and range, damage; save and DC; the
 *    spellcasting ability, DC and spell lists by tier).
 *  - {@link printedEntryHeader}, {@link printedUses}: "(Recharge 5–6)" and
 *    "(3/Day)" limits.
 *
 * The escape DC, durations and later stages stay text. A homebrew monster written
 * as text goes through these same readers (`monster-print-entries.ts`), so a
 * catalogue print and a DM's print read the same way.
 */
import type {
  AbilityCode,
  ConditionId,
  MonsterAttackEntry,
  MonsterBreathing,
  MonsterDamage,
  MonsterMoveSpeed,
  MonsterMovement,
  MonsterMultiattack,
  MonsterMultiattackStep,
  MonsterSaveEntry,
  MonsterSpellcastingEntry,
  MonsterTraitFact,
  MonsterTraitRoll,
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

// ─── Trait facts ─────────────────────────────────────────────────────────────

/** "attack rolls and saving throws" → ["attack", "save"], printed order. */
function traitRolls(phrase: string): MonsterTraitRoll[] | undefined {
  const out: MonsterTraitRoll[] = [];
  for (const part of phrase.split(/ and |, /)) {
    const p = part.trim();
    if (/^(an )?melee attack rolls?$/.test(p)) out.push("melee-attack");
    else if (/^(an )?attack rolls?$/.test(p)) out.push("attack");
    else if (/^saving throws$/.test(p)) out.push("save");
    else if (/^ability checks$/.test(p)) out.push("check");
    else if (/^D20 Tests$/.test(p)) out.push("d20");
    else return undefined;
  }
  return out;
}

function knownDamageType(word: string): DamageType | undefined {
  const type = word.toLowerCase();
  return (DAMAGE_TYPES as readonly string[]).includes(type)
    ? (type as DamageType)
    : undefined;
}

type AdvantageWhen = Extract<MonsterTraitFact, { kind: "advantage" }>["when"];
type DisadvantageWhen = Extract<MonsterTraitFact, { kind: "disadvantage" }>["when"];

function bends(
  kind: "advantage",
  phrase: string,
  when: AdvantageWhen
): MonsterTraitFact | undefined;
function bends(
  kind: "disadvantage",
  phrase: string,
  when: DisadvantageWhen
): MonsterTraitFact | undefined;
function bends(
  kind: "advantage" | "disadvantage",
  phrase: string,
  when: AdvantageWhen | DisadvantageWhen
): MonsterTraitFact | undefined {
  const rolls = traitRolls(phrase);
  if (!rolls) return undefined;
  return { kind, rolls, when } as MonsterTraitFact;
}

/**
 * The number a prose trait changes at the table, as its print states it: Magic
 * Resistance, Pack Tactics, Bloodied Fury, Sunlight and Light Sensitivity,
 * Regeneration (the damage that switches it off, whether it needs 1 Hit Point),
 * Acid Absorption, Siege Monster. Undefined when the print states none.
 */
export function printedTraitFact(text: string): MonsterTraitFact | undefined {
  let m: RegExpMatchArray | null;
  if (
    /has Advantage on saving throws against spells and other magical effects/.test(text)
  )
    return { kind: "advantage", rolls: ["save"], when: "vs-spells" };
  if (
    (m = text.match(
      /has Advantage on (an attack roll|attack rolls) against a creature if at least one of the [\w ]+'s allies is within 5 feet of the creature/
    ))
  )
    return bends("advantage", m[1] ?? "", "ally-near-target");
  if ((m = text.match(/^While Bloodied, the [\w ]+ has Advantage on ([\w ]+)\.$/)))
    return bends("advantage", m[1] ?? "", "bloodied");
  if ((m = text.match(/has Advantage on ([\w ]+) while it is Bloodied\.$/)))
    return bends("advantage", m[1] ?? "", "bloodied");
  if (
    (m = text.match(
      /(?:^|\. )While in sunlight, (?:the [\w ]+|it) has Disadvantage on ([\w ]+)\.$/
    ))
  )
    return bends("disadvantage", m[1] ?? "", "sunlight");
  if (
    (m = text.match(/^While in Bright Light, the [\w ]+ has Disadvantage on ([\w ]+)\.$/))
  )
    return bends("disadvantage", m[1] ?? "", "bright-light");
  if ((m = text.match(/regains (\d+) Hit Points at the start of each of its turns/))) {
    const off = text.match(/takes (\w+) or (\w+) damage, this trait doesn't function/);
    const suppressedBy = off
      ? [knownDamageType(off[1] ?? ""), knownDamageType(off[2] ?? "")]
      : [];
    if (!suppressedBy.every((type): type is DamageType => type !== undefined))
      return undefined;
    return {
      kind: "regeneration",
      amount: Number(m[1]),
      ...(off ? { suppressedBy } : {}),
      ...(/if it has at least 1 Hit Point/.test(text) ? { needsHp: true as const } : {}),
    };
  }
  if (
    (m = text.match(
      /is subjected to (\w+) damage, it (takes no damage and instead )?regains a number of Hit Points equal to the \1 damage dealt/
    ))
  ) {
    const damageType = knownDamageType(m[1] ?? "");
    if (!damageType) return undefined;
    return { kind: "absorb", damageType, ...(m[2] ? { instead: true as const } : {}) };
  }
  if (/deals double damage to objects and structures/.test(text))
    return { kind: "siege" };
  return undefined;
}

// ─── Limits ──────────────────────────────────────────────────────────────────

type EntryUses = NonNullable<MonsterAttackEntry["uses"]>;
type EntryRecharge = NonNullable<MonsterAttackEntry["recharge"]>;

const RECHARGE = /\s*\(Recharge ([2-6])(?:[–-]6)?\)\s*$/;
const PER_DAY = /\s*\(([1-9]\d*)\/Day(?:, or \d+\/Day in Lair)?\)\s*$/;
const PER_REST = /\s*\(Recharges after a (Short or Long|Long) Rest\)\s*$/;

/**
 * An entry name's printed limit: "Fire Breath (Recharge 5–6)" → recharge 5,
 * "Misty Step (3/Day)" → 3 per day, "(Recharges after a Short or Long Rest)" → once
 * per rest. `name` is the name without it; a form tag ("(Vampire Form Only)") stays.
 */
export function printedEntryHeader(printedName: string): {
  name: string;
  recharge?: EntryRecharge;
  uses?: EntryUses;
} {
  let m: RegExpMatchArray | null;
  if ((m = printedName.match(RECHARGE)))
    return {
      name: printedName.slice(0, m.index).trim(),
      recharge: Number(m[1]) as EntryRecharge,
    };
  if ((m = printedName.match(PER_DAY)))
    return {
      name: printedName.slice(0, m.index).trim(),
      uses: { count: Number(m[1]), per: "day" },
    };
  if ((m = printedName.match(PER_REST)))
    return {
      name: printedName.slice(0, m.index).trim(),
      uses: { count: 1, per: m[1] === "Long" ? "long-rest" : "short-or-long-rest" },
    };
  return { name: printedName.trim() };
}

/** The "(3/Day)" an entry's text opens with ("(3/Day, or 4/Day in Lair) If the
 *  dragon fails a saving throw, …"), as a per-day limit; the lair count stays text. */
export function printedUses(text: string): EntryUses | undefined {
  const m = text.match(/^\(([1-9]\d*)\/Day(?:, or \d+\/Day in Lair)?\)/);
  return m ? { count: Number(m[1]), per: "day" } : undefined;
}

// ─── Opening lines ───────────────────────────────────────────────────────────

const TYPE = `(${DAMAGE_TYPES.map((type) => type.charAt(0).toUpperCase() + type.slice(1)).join("|")})`;
/** One printed amount: "13 (2d8 + 4) Bludgeoning damage", or flat "1 Slashing damage". */
const AMOUNT = String.raw`(\d+)(?: \((\d+d\d+(?: [+-] \d+)?)\))? ${TYPE} damage`;

/** The damage clauses `clause` opens with: the first amount and each "plus" amount
 *  right after it ("13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage"). */
function leadingDamage(clause: string): MonsterDamage[] {
  const out: MonsterDamage[] = [];
  // "—or 8 (1d10 + 3) Piercing damage if …—" is a variant of the first amount.
  const plus = new RegExp(String.raw`^(?: |—[^—]*—)plus ${AMOUNT}`);
  let rest = clause;
  let match = rest.match(new RegExp(String.raw`^${AMOUNT}`));
  while (match) {
    out.push({
      dice: match[2] ? match[2].replace(/ /g, "") : (match[1] ?? ""),
      damageType: damageType(match[3] ?? ""),
    });
    rest = rest.slice(match[0].length);
    match = rest.match(plus);
  }
  return out;
}

/** "ft." or "feet"; the line's own full stop follows the last one. */
const FT = String.raw`(?:ft\.|feet)`;
const RANGE = String.raw`range (\d+)(?:\/(\d+))?`;
const ATTACK_LINE = new RegExp(
  String.raw`^(Melee|Ranged|Melee or Ranged) Attack Roll: \+(\d+)(?: to hit)?(?: \([^)]*\))?, (?:reach (\d+) (?:${FT} or ${RANGE} )?|${RANGE} )(?:ft|feet)\. Hit: (.*)$`,
  "s"
);

/**
 * An attack's opening line: "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4)
 * Bludgeoning damage." — its mode, to-hit, reach and range, the damage its Hit
 * clause opens with and the conditions it gives. Undefined when the text is no
 * attack, its hit opens with no damage, or it names a condition that is none.
 */
export function printedAttack(
  text: string
): Omit<MonsterAttackEntry, "id" | "recharge" | "uses"> | undefined {
  const m = text.match(ATTACK_LINE);
  if (!m) return undefined;
  const [, mode, toHit, reach, nearMixed, farMixed, near, far, hit = ""] = m;
  const damage = leadingDamage(hit);
  if (damage.length === 0) return undefined;
  let conditions: PrintedHitConditions | undefined;
  try {
    conditions = printedHitConditions(text);
  } catch {
    return undefined;
  }
  const rangeNear = nearMixed ?? near;
  const rangeFar = farMixed ?? far;
  return {
    kind: "attack",
    attack: mode === "Melee" ? "melee" : mode === "Ranged" ? "ranged" : "melee-or-ranged",
    toHit: Number(toHit),
    ...(reach ? { reachFt: Number(reach) } : {}),
    ...(rangeNear
      ? {
          rangeFt: {
            near: Number(rangeNear),
            ...(rangeFar ? { far: Number(rangeFar) } : {}),
          },
        }
      : {}),
    damage,
    ...(conditions ? { conditions: conditions.conditions } : {}),
    ...(conditions?.gated ? { conditionsIf: true as const } : {}),
    ...(conditions?.save ? { conditionSave: conditions.save } : {}),
  };
}

/** What a success does, as the print states it: "Success: Half damage." is half,
 *  any other first Success sentence is special, none is none (a "Failure or
 *  Success:" footer is not one). */
function printedOnSuccess(text: string): MonsterSaveEntry["onSuccess"] {
  const withoutFooter = text.replace(/Failure or Success:[^.]*\.?/gi, "");
  const match = withoutFooter.match(/Success:\s*([^.]*)/i);
  if (match === null) return "none";
  return /^Half damage( only)?$/i.test((match[1] ?? "").trim()) ? "half" : "special";
}

const SAVE_LINE =
  /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\d+)[,.]/;

/**
 * A save entry's line: "Dexterity Saving Throw: DC 21, each creature in a 60-foot
 * Cone. Failure: 59 (17d6) Fire damage. Success: Half damage." — the ability and
 * DC, the damage and conditions of its Failure clause, and what a success does.
 */
export function printedSave(
  text: string
): Omit<MonsterSaveEntry, "id" | "recharge" | "uses"> | undefined {
  const m = text.match(SAVE_LINE);
  const save = ABILITY[m?.[1] ?? ""];
  if (!m || !save) return undefined;
  const rest = text.slice((m.index ?? 0) + m[0].length);
  const failure = rest.match(/\bFailure: (.*)$/s)?.[1] ?? "";
  // "Failure: If the target has 20 Hit Points or fewer, … Otherwise, the target
  // takes 18 (4d8) Psychic damage." — the damage of the otherwise branch.
  const otherwise = failure.match(
    /\b(?:Otherwise, the target|It otherwise) takes (.*)$/s
  );
  const damage = leadingDamage(failure);
  if (damage.length === 0 && otherwise) damage.push(...leadingDamage(otherwise[1] ?? ""));
  let conditions: ConditionId[];
  try {
    conditions = failureConditions(rest);
  } catch {
    return undefined;
  }
  return {
    kind: "save",
    save,
    dc: Number(m[2]),
    ...(damage.length > 0 ? { damage } : {}),
    onSuccess: printedOnSuccess(text),
    ...(conditions.length > 0 ? { conditions } : {}),
  };
}

/** The SRD prints a few spells without their wizard's name ("Acid Arrow"); their
 *  catalogue id keeps it. Pinned against `src/i18n/en/srd/spells.json`. */
const SPELL_PRINT_IDS: Readonly<Record<string, string>> = {
  "arcane-hand": "bigbys-hand",
  "instant-summons": "drawmijs-instant-summons",
  "black-tentacles": "evards-black-tentacles",
  "secret-chest": "leomunds-secret-chest",
  "tiny-hut": "leomunds-tiny-hut",
  "acid-arrow": "melfs-acid-arrow",
  "faithful-hound": "mordenkainens-faithful-hound",
  "magnificent-mansion": "mordenkainens-magnificent-mansion",
  "private-sanctum": "mordenkainens-private-sanctum",
  "arcane-sword": "mordenkainens-sword",
  "arcanists-magic-aura": "nystuls-magic-aura",
  "freezing-sphere": "otilukes-freezing-sphere",
  "resilient-sphere": "otilukes-resilient-sphere",
  "irresistible-dance": "ottos-irresistible-dance",
  "telepathic-bond": "rarys-telepathic-bond",
  "hideous-laughter": "tashas-hideous-laughter",
  "floating-disk": "tensers-floating-disk",
};

/** A printed spell name as its catalogue id: "Command (level 2 version)" →
 *  "command", "Detect Evil and Good" → "detect-evil-and-good", "Acid Arrow" →
 *  "melfs-acid-arrow". */
export function printedSpellId(name: string): string {
  const slug = name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return SPELL_PRINT_IDS[slug] ?? slug;
}

/** "A (level 2 version), B, C" → ids; a parenthetical keeps its own commas. */
function spellList(list: string): string[] {
  const names: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of list) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      names.push(current);
      current = "";
    } else current += char;
  }
  names.push(current);
  return names.map((name) => printedSpellId(name.trim())).filter(Boolean);
}

const TIER =
  /(At Will|(\d+)\/Day(?: Each)?): (.*?)(?=\s+(?:At Will|\d+\/Day(?: Each)?):|$)/gs;

/**
 * A Spellcasting entry's text: "… using Charisma as the spellcasting ability (spell
 * save DC 20, +12 to hit with spell attacks): At Will: Command (level 2 version),
 * Detect Magic. 1/Day: Fireball." — the ability, DC, spell-attack bonus, the at-will
 * spells and each N/Day tier, as spell ids (an upcast qualifier stays text).
 */
export function printedSpellcasting(
  text: string
): Omit<MonsterSpellcastingEntry, "id" | "recharge" | "uses"> | undefined {
  const lists = text.match(
    /\busing (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) as (?:the )?spellcasting ability(?: \(([^)]*)\))?:\s*(.*)$/s
  );
  // One spell: "The imp casts Invisibility on itself, requiring no spell components
  // and using Charisma as the spellcasting ability."; "twice" is two casts a use.
  const single = lists
    ? null
    : text.match(
        /^(?:\([^)]*\) )?The [\w -]+? casts (?:the )?(.+?)(?: spell)?(?: on itself)?( twice)?, (?:requiring [^,]+? and )?using (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) as (?:the )?spellcasting ability(?: \(([^)]*)\))?\.(?:\s|$)/
      );
  const ability = ABILITY[(lists ?? single)?.[lists ? 1 : 3] ?? ""];
  if (!ability || !(lists ?? single)) return undefined;
  const qualifier = lists ? lists[2] : single?.[4];
  const dc = qualifier?.match(/spell save DC (\d+)/)?.[1];
  const toHit = qualifier?.match(/\+(\d+) to hit with spell attacks/)?.[1];
  const atWill: string[] = [];
  const perDay: Array<{ count: number; spellIds: string[] }> = [];
  if (single) {
    const ids = spellList((single[1] ?? "").replace(/(^|, )or /g, "$1"));
    if (single[2]) perDay.push({ count: 2, spellIds: ids });
    else atWill.push(...ids);
  }
  for (const [, label, count, list = ""] of (lists?.[3] ?? "").matchAll(TIER)) {
    const ids = spellList(list.replace(/\.\s*$/, ""));
    if (label === "At Will") atWill.push(...ids);
    else perDay.push({ count: Number(count), spellIds: ids });
  }
  if (atWill.length === 0 && perDay.length === 0) return undefined;
  return {
    kind: "spellcasting",
    ability,
    ...(dc ? { dc: Number(dc) } : {}),
    ...(toHit ? { toHit: Number(toHit) } : {}),
    ...(atWill.length > 0 ? { atWill } : {}),
    ...(perDay.length > 0 ? { perDay } : {}),
  };
}

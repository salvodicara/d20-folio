/**
 * homebrew-monsters — the ONE validator between a homebrew monster's authored stat
 * block and the encounter engine.
 *
 * A homebrew monster (`CustomMonster.mechanics`, a library template) declares its
 * stat block in the catalogue's own shape (`HomebrewMonsterMechanics`, derived from
 * `MonsterStatBlock`), so every structured fact a catalogue monster carries a DM's
 * monster can carry too. Each entry is either structured (a catalogue entry plus
 * the DM's name and text) or written as TEXT only — then the monster-print readers
 * the SRD bestiary is pinned to (`activities/monster-print-entries.ts`) derive it,
 * so a print reads the same whether the SRD or the DM wrote it.
 *
 * The stored object stays exactly as written (the library codec carries it
 * verbatim); the engine reads it only through {@link homebrewMonsterStatBlock}.
 * Each field is conformed against its exact schema below and a field the schema
 * rejects is left out of play — never repaired, never erased from storage. An
 * entry the schema rejects falls back to its text when it has one; an id a
 * Multiattack or a Pounce names that is no entry of the block, or a spell id the
 * catalogue does not know, is left out. An unknown field (a newer client's) is
 * preserved and inert.
 *
 * The result is a catalogue-shaped `MonsterStatBlock` whose id is
 * `homebrew:<library entry id>`, so the monster flows through the SAME encounter
 * paths a catalogue monster does: its counters (`monsterLimitedUses`, the Recharge
 * roll, the legendary pool), its Multiattack plan, its actions on the damage tray,
 * its trait facts (Regeneration and what suppresses it), its moves and its
 * Concentration. An encounter creature reaches it through `homebrewId`
 * ({@link encounterMonsterBlockId}, {@link homebrewMonsterLookup}).
 */
import { getSpellById } from "@/data/spells";
import type {
  HomebrewMonsterEntry,
  HomebrewMonsterMechanics,
  MonsterEntry,
  MonsterEntrySectionKey,
  MonsterStatBlock,
} from "@/data/types";
import { ALL_ALIGNMENTS, CREATURE_SIZE_ORDER } from "@/data/types";
import {
  printedEntries,
  type PrintedSourceEntry,
} from "@/lib/activities/monster-print-entries";
import {
  printedEntryHeader,
  type PrintedEntryName,
} from "@/lib/activities/monster-print";
import {
  arraySchema,
  conformExact,
  customSchema,
  discriminatedUnionSchema,
  literalSchema,
  numberSchema,
  objectSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import { EFFECT_RIDER_SCHEMAS } from "@/lib/homebrew-actions";
import type { LibraryEntry } from "@/lib/library";
import { ALL_SKILLS } from "@/lib/skills";
import { slugify } from "@/lib/utils";
import { ABILITY_CODES } from "@/types/ability";
import type { CustomMonster, EncounterMonster } from "@/types/campaign";
import { CONDITION_ID_SCHEMA } from "@/types/condition";
import { DAMAGE_TYPE_SCHEMA } from "@/types/damage";

// ─── The exact shape of every structured stat-block field ────────────────────

const literals = (values: ReadonlyArray<string>): ExactSchema =>
  unionSchema(values.map((value) => literalSchema(value)));

const TRUE = literalSchema(true);
/** A whole number of at least 1 (a use count, a legendary pool, an attack count). */
const COUNT = customSchema<"count", number>("count");
/** "1d6+2", "2d10" or a flat "1" — the catalogue's dice grammar. */
const DICE = customSchema<"dice", string>("dice");
/** A stable entry id: lowercase letters, digits and hyphens. */
const ENTRY_ID = customSchema<"entry-id", string>("entry-id");
const ABILITY = literals(ABILITY_CODES);
const SIZE = literals(CREATURE_SIZE_ORDER);
const SECTION = literals([
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
]);
const ABILITY_RECORD = (shape: ExactSchema) =>
  Object.fromEntries(ABILITY_CODES.map((code) => [code, shape]));

const DAMAGE = unionSchema([
  objectSchema({ dice: DICE, damageType: DAMAGE_TYPE_SCHEMA }),
  objectSchema({ dice: DICE, damageChoice: arraySchema(DAMAGE_TYPE_SCHEMA, 1) }),
]);

const ROLLS = arraySchema(
  literals(["attack", "melee-attack", "save", "check", "d20"]),
  1
);
const FACT = discriminatedUnionSchema("kind", {
  advantage: objectSchema({
    kind: literalSchema("advantage"),
    rolls: ROLLS,
    when: literals(["vs-spells", "ally-near-target", "bloodied"]),
  }),
  disadvantage: objectSchema({
    kind: literalSchema("disadvantage"),
    rolls: ROLLS,
    when: literals(["sunlight", "bright-light"]),
  }),
  regeneration: objectSchema(
    { kind: literalSchema("regeneration"), amount: COUNT },
    { suppressedBy: arraySchema(DAMAGE_TYPE_SCHEMA, 1), needsHp: TRUE }
  ),
  absorb: objectSchema(
    { kind: literalSchema("absorb"), damageType: DAMAGE_TYPE_SCHEMA },
    { instead: TRUE }
  ),
  siege: objectSchema({ kind: literalSchema("siege") }),
});

const STEP = objectSchema(
  { count: COUNT, use: arraySchema(ENTRY_ID, 1) },
  { optional: TRUE }
);
const MULTIATTACK = objectSchema(
  { steps: arraySchema(STEP, 1) },
  {
    or: arraySchema(STEP, 1),
    replace: objectSchema(
      {
        count: unionSchema([COUNT, literalSchema("any")]),
        use: arraySchema(ENTRY_ID, 1),
      },
      { of: ENTRY_ID }
    ),
  }
);

const SPEED_KIND = literals(["walk", "fly", "swim", "burrow"]);
const GATED = { gated: TRUE };
const MOVEMENT = discriminatedUnionSchema("kind", {
  teleport: objectSchema({ kind: literalSchema("teleport"), feet: COUNT }, GATED),
  leap: objectSchema({ kind: literalSchema("leap"), feet: COUNT, costFt: COUNT }, GATED),
  "long-jump": objectSchema(
    { kind: literalSchema("long-jump"), feet: COUNT },
    { highFt: COUNT, runningStartFt: COUNT, ...GATED }
  ),
  move: objectSchema(
    { kind: literalSchema("move"), speeds: arraySchema(SPEED_KIND, 1) },
    {
      feet: COUNT,
      half: TRUE,
      noOpportunityAttacks: TRUE,
      towardEnemy: TRUE,
      ...GATED,
    }
  ),
  "take-action": objectSchema(
    {
      kind: literalSchema("take-action"),
      actions: arraySchema(literals(["dash", "disengage", "hide"]), 1),
    },
    { pickOne: TRUE, ...GATED }
  ),
  "spider-climb": objectSchema({ kind: literalSchema("spider-climb") }, GATED),
  "burrow-through": objectSchema(
    {
      kind: literalSchema("burrow-through"),
      material: literals(["solid-rock", "earth-and-stone"]),
    },
    { half: TRUE, ...GATED }
  ),
});

/** The fields every entry kind shares: the limit, and the DM's text. */
const ENTRY_BASE = {
  recharge: unionSchema([2, 3, 4, 5, 6].map((face) => literalSchema(face))),
  uses: objectSchema({
    count: COUNT,
    per: literals(["day", "short-or-long-rest", "long-rest"]),
  }),
  text: stringSchema,
};
const ENTRY_NAME = { id: ENTRY_ID, name: stringSchema };

/** One structured homebrew entry — a catalogue `MonsterEntry` plus its name and
 *  text — discriminated on `kind` exactly as the catalogue's. */
export const HOMEBREW_MONSTER_ENTRY_SCHEMA: ExactSchema = discriminatedUnionSchema(
  "kind",
  {
    narrative: objectSchema(
      { ...ENTRY_NAME, kind: literalSchema("narrative") },
      {
        ...ENTRY_BASE,
        fact: FACT,
        damage: arraySchema(DAMAGE, 1),
        performs: objectSchema({ section: SECTION, entryId: ENTRY_ID }),
        multiattack: MULTIATTACK,
        movement: MOVEMENT,
        breathes: literals(["air-and-water", "water-only"]),
      }
    ),
    attack: objectSchema(
      {
        ...ENTRY_NAME,
        kind: literalSchema("attack"),
        attack: literals(["melee", "ranged", "melee-or-ranged"]),
        toHit: numberSchema,
        damage: arraySchema(DAMAGE, 1),
      },
      {
        ...ENTRY_BASE,
        reachFt: COUNT,
        rangeFt: objectSchema({ near: COUNT }, { far: COUNT }),
        conditions: arraySchema(CONDITION_ID_SCHEMA, 1),
        conditionsIf: TRUE,
        conditionSave: objectSchema({ save: ABILITY, dc: COUNT }),
        bloodiedDamage: DAMAGE,
        ...EFFECT_RIDER_SCHEMAS,
      }
    ),
    save: objectSchema(
      {
        ...ENTRY_NAME,
        kind: literalSchema("save"),
        save: ABILITY,
        dc: COUNT,
        onSuccess: literals(["half", "none", "special"]),
      },
      {
        ...ENTRY_BASE,
        damage: arraySchema(DAMAGE, 1),
        conditions: arraySchema(CONDITION_ID_SCHEMA, 1),
        ...EFFECT_RIDER_SCHEMAS,
      }
    ),
    spellcasting: objectSchema(
      { ...ENTRY_NAME, kind: literalSchema("spellcasting"), ability: ABILITY },
      {
        ...ENTRY_BASE,
        dc: COUNT,
        toHit: numberSchema,
        atWill: arraySchema(stringSchema, 1),
        perDay: arraySchema(
          objectSchema({ count: COUNT, spellIds: arraySchema(stringSchema, 1) }),
          1
        ),
      }
    ),
  }
);

const OPTIONAL_FEET = (keys: ReadonlyArray<string>) =>
  Object.fromEntries(keys.map((key) => [key, numberSchema]));

/** An entry section: an array, each element conformed on its own. */
const ENTRIES = customSchema<"entries", ReadonlyArray<unknown>>("entries");

/**
 * Every structured stat-block field → its exact schema. Typed over every key of
 * `HomebrewMonsterMechanics` (itself derived from `MonsterStatBlock`), so a new
 * catalogue field fails the type check until it is classified here. The SRD
 * bestiary conforms to these schemas (`homebrew-monster-mechanics.test.ts`), so the
 * two cannot drift. The five entry sections are conformed one entry at a time.
 */
export const HOMEBREW_MONSTER_FIELD_SCHEMAS: {
  readonly [Key in keyof Required<HomebrewMonsterMechanics>]: ExactSchema;
} = {
  sizes: arraySchema(SIZE, 1),
  typeTags: arraySchema(stringSchema, 1),
  swarmOf: SIZE,
  alignment: literals(ALL_ALIGNMENTS),
  initiative: numberSchema,
  speeds: objectSchema({}, OPTIONAL_FEET(["walk", "climb", "fly", "swim", "burrow"])),
  hover: TRUE,
  speedNote: literalSchema("climb-or-fly-20"),
  abilityScores: objectSchema(ABILITY_RECORD(numberSchema)),
  saveProficiencies: arraySchema(ABILITY, 1),
  saveOverrides: objectSchema({}, ABILITY_RECORD(numberSchema)),
  skills: arraySchema(
    objectSchema(
      { skill: literals(ALL_SKILLS.map((skill) => skill.id)) },
      { expertise: TRUE, bonus: numberSchema }
    ),
    1
  ),
  senses: objectSchema(
    {},
    {
      ...OPTIONAL_FEET(["darkvisionFt", "blindsightFt", "tremorsenseFt", "truesightFt"]),
      blindBeyond: TRUE,
      unimpededByMagicalDarkness: TRUE,
    }
  ),
  passivePerceptionOverride: numberSchema,
  languages: objectSchema(
    {},
    {
      ids: arraySchema(stringSchema, 1),
      understandsOnly: TRUE,
      understandsOnlyIds: arraySchema(stringSchema, 1),
      telepathyFt: numberSchema,
      telepathyOneWay: TRUE,
      plusAnyCount: COUNT,
      special: literals(["knew-in-life", "all"]),
    }
  ),
  gear: arraySchema(objectSchema({ id: stringSchema }, { qty: COUNT }), 1),
  xp: numberSchema,
  xpInLair: numberSchema,
  legendary: objectSchema({ uses: COUNT }, { usesInLair: COUNT }),
  traits: ENTRIES,
  actions: ENTRIES,
  bonusActions: ENTRIES,
  reactions: ENTRIES,
  legendaryActions: ENTRIES,
};

function plainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

const isEntryId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const CONTEXT: ExactSchemaContext<
  {
    count: number;
    dice: string;
    "entry-id": string;
    entries: ReadonlyArray<unknown>;
  },
  Record<never, never>
> = {
  customs: {
    count: (value) =>
      typeof value === "number" && Number.isSafeInteger(value) && value >= 1
        ? value
        : null,
    dice: (value) =>
      typeof value === "string" && /^(?:\d+d\d+(?:[+-]\d+)?|\d+)$/.test(value)
        ? value
        : null,
    "entry-id": (value) => (isEntryId(value) ? value : null),
    entries: (value) => (Array.isArray(value) ? value : null),
  },
  refs: {},
};

export const MONSTER_ENTRY_SECTIONS: ReadonlyArray<MonsterEntrySectionKey> = [
  "traits",
  "actions",
  "bonusActions",
  "reactions",
  "legendaryActions",
];

// ─── Entries: structured, or read from their print ───────────────────────────

type Placed = { section: MonsterEntrySectionKey; entry: HomebrewMonsterEntry };

/** A structured entry exactly as its schema accepts it, or null. */
function conformEntry(value: unknown): HomebrewMonsterEntry | null {
  const conformed: unknown = conformExact(HOMEBREW_MONSTER_ENTRY_SCHEMA, value, CONTEXT);
  return conformed === null ? null : (conformed as HomebrewMonsterEntry);
}

/** Each authored entry, structured where its schema accepts it, else read from
 *  its text; ids unique across the block (a later duplicate is left out). */
function resolveEntries(authored: Readonly<Record<string, unknown>>): Placed[] {
  const slots: Array<
    | { kind: "structured"; placed: Placed }
    | { kind: "print"; source: PrintedSourceEntry & { section: MonsterEntrySectionKey } }
  > = [];
  for (const section of MONSTER_ENTRY_SECTIONS) {
    const raw = authored[section];
    if (!Array.isArray(raw)) continue;
    for (const element of raw as unknown[]) {
      if (!plainObject(element)) continue;
      const structured = conformEntry(element);
      if (structured) {
        slots.push({ kind: "structured", placed: { section, entry: structured } });
        continue;
      }
      const { name, text } = element;
      if (typeof name !== "string" || typeof text !== "string" || !name.trim()) continue;
      const id =
        element.id === undefined ? slugify(printedEntryHeader(name).name) : element.id;
      if (!isEntryId(id)) continue;
      slots.push({ kind: "print", source: { section, id, name: name.trim(), text } });
    }
  }
  const siblings: PrintedEntryName[] = slots.flatMap((slot) =>
    slot.kind === "structured"
      ? [
          {
            section: slot.placed.section,
            entryId: slot.placed.entry.id,
            name: slot.placed.entry.name,
            kind: slot.placed.entry.kind,
          },
        ]
      : []
  );
  const sources = slots.flatMap((slot) => (slot.kind === "print" ? [slot.source] : []));
  const read = printedEntries(sources, siblings);
  let next = 0;
  const seen = new Set<string>();
  const out: Placed[] = [];
  for (const slot of slots) {
    let placed: Placed;
    if (slot.kind === "structured") placed = slot.placed;
    else {
      const reading = read[next++];
      if (!reading) continue;
      placed = {
        section: slot.source.section,
        entry: { ...reading.entry, name: slot.source.name, text: slot.source.text },
      };
    }
    if (seen.has(placed.entry.id)) continue;
    seen.add(placed.entry.id);
    out.push(placed);
  }
  return out;
}

/** The entry with this id must exist; Multiattack ids resolve actions first. */
function resolvable(placed: ReadonlyArray<Placed>) {
  const ids = new Set(placed.map(({ entry }) => entry.id));
  const inSection = new Set(placed.map(({ section, entry }) => `${section}:${entry.id}`));
  return {
    entry: (id: string) => ids.has(id),
    inSection: (section: string, id: string) => inSection.has(`${section}:${id}`),
  };
}

/** One entry with every reference it makes checked against the block: a routine
 *  over an id that is no entry, a used entry that is none, or an unknown spell is
 *  left out (the rest of the entry stays). */
function checked(
  entry: HomebrewMonsterEntry,
  known: ReturnType<typeof resolvable>
): HomebrewMonsterEntry {
  if (entry.kind === "spellcasting") {
    const atWill = entry.atWill?.filter((id) => getSpellById(id));
    const perDay = entry.perDay
      ?.map((tier) => ({
        ...tier,
        spellIds: tier.spellIds.filter((id) => getSpellById(id)),
      }))
      .filter((tier) => tier.spellIds.length > 0);
    const rest: Record<string, unknown> = { ...entry };
    delete rest.atWill;
    delete rest.perDay;
    return {
      ...rest,
      ...(atWill && atWill.length > 0 ? { atWill } : {}),
      ...(perDay && perDay.length > 0 ? { perDay } : {}),
    } as unknown as HomebrewMonsterEntry;
  }
  if (entry.kind !== "narrative") return entry;
  const rest: Record<string, unknown> = { ...entry };
  const routine = entry.multiattack;
  if (routine) {
    const steps = [...routine.steps, ...(routine.or ?? [])];
    const ok =
      steps.every((step) => step.use.every(known.entry)) &&
      (!routine.replace ||
        (routine.replace.use.every(known.entry) &&
          (routine.replace.of === undefined || known.entry(routine.replace.of))));
    if (!ok) delete rest.multiattack;
  }
  if (entry.performs && !known.inSection(entry.performs.section, entry.performs.entryId))
    delete rest.performs;
  return rest as unknown as HomebrewMonsterEntry;
}

// ─── Reading a stored homebrew monster ───────────────────────────────────────

/** A homebrew stat block as the engine reads it: every field accepted, every
 *  entry structured (the ones written as text read from their print). */
export type PlayableMonsterMechanics = Omit<
  HomebrewMonsterMechanics,
  MonsterEntrySectionKey
> & {
  readonly [Key in MonsterEntrySectionKey]?: ReadonlyArray<HomebrewMonsterEntry>;
};

const mechanicsCache = new WeakMap<object, PlayableMonsterMechanics>();

/**
 * The playable stat block of a stored homebrew monster: every known field its
 * schema accepts, every entry structured or read from its text and checked against
 * the block. Undefined when it declares none (a text-only template from before).
 */
export function homebrewMonsterMechanics(
  monster: Pick<CustomMonster, "mechanics">
): PlayableMonsterMechanics | undefined {
  const authored: unknown = monster.mechanics;
  if (!plainObject(authored)) return undefined;
  const hit = mechanicsCache.get(authored);
  if (hit) return hit;
  const accepted: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(HOMEBREW_MONSTER_FIELD_SCHEMAS)) {
    if (schema === ENTRIES || !Object.hasOwn(authored, key)) continue;
    const value: unknown = conformExact(schema, authored[key], CONTEXT);
    if (value !== null) accepted[key] = value;
  }
  const placed = resolveEntries(authored);
  const known = resolvable(placed);
  // A section authored as a list stays one, even empty (a genuine no-action print).
  for (const section of MONSTER_ENTRY_SECTIONS)
    if (Array.isArray(authored[section])) accepted[section] = [];
  for (const { section, entry } of placed) {
    const list = (accepted[section] ??= []) as HomebrewMonsterEntry[];
    list.push(checked(entry, known));
  }
  const mechanics = Object.freeze(accepted) as PlayableMonsterMechanics;
  mechanicsCache.set(authored, mechanics);
  return mechanics;
}

/** The stat-block id a homebrew monster answers to: `homebrew:<library entry id>`
 *  (a catalogue slug never holds a colon, so the two can never meet). */
export const HOMEBREW_MONSTER_ID_PREFIX = "homebrew:";

export function homebrewMonsterBlockId(entryId: string): string {
  return `${HOMEBREW_MONSTER_ID_PREFIX}${entryId}`;
}

const blockCache = new WeakMap<object, { entryId: string; block: MonsterStatBlock }>();

/** The 2024 average ability score: an undeclared score reads as +0. */
const AVERAGE_SCORES = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 } as const;

/**
 * A homebrew monster as a catalogue-shaped stat block — the one shape the
 * encounter engine reads. Its AC, average HP, CR, creature type and defenses come
 * from the template's own top level (the encounter seeds from the same fields);
 * an undeclared size reads as Medium, alignment as unaligned, Speed as 30 feet and
 * each ability score as 10. Undefined for a template that declares no stat block.
 */
export function homebrewMonsterStatBlock(
  entryId: string,
  monster: CustomMonster
): MonsterStatBlock | undefined {
  const hit = blockCache.get(monster);
  if (hit?.entryId === entryId) return hit.block;
  const mechanics = homebrewMonsterMechanics(monster);
  if (!mechanics) return undefined;
  const cr = Number(monster.cr?.trim() || 0);
  const defenses = monster.defenses ?? {};
  const block: MonsterStatBlock = {
    ...mechanics,
    id: homebrewMonsterBlockId(entryId),
    cr: Number.isFinite(cr) && cr >= 0 ? cr : 0,
    sizes: mechanics.sizes ?? ["Medium"],
    type: monster.creatureType ?? "humanoid",
    alignment: mechanics.alignment ?? "unaligned",
    ac: monster.ac,
    hp: { average: monster.maxHp, formula: String(monster.maxHp) },
    speeds: mechanics.speeds ?? { walk: 30 },
    abilityScores: mechanics.abilityScores ?? AVERAGE_SCORES,
    actions: mechanics.actions ?? [],
    ...(defenses.damageVulnerabilities
      ? { damageVulnerabilities: defenses.damageVulnerabilities }
      : {}),
    ...(defenses.damageResistances
      ? { damageResistances: defenses.damageResistances }
      : {}),
    ...(defenses.damageImmunities ? { damageImmunities: defenses.damageImmunities } : {}),
    ...(defenses.conditionImmunities
      ? { conditionImmunities: defenses.conditionImmunities }
      : {}),
    ...(defenses.qualifiedDefenses
      ? { qualifiedDefenses: defenses.qualifiedDefenses }
      : {}),
    // A homebrew monster belongs to no book; it is the DM's own.
    source: "Wiki",
  };
  blockCache.set(monster, { entryId, block });
  return block;
}

/** The DM's name for one entry of a homebrew stat block (user content), or
 *  undefined for a catalogue entry (its name lives in the monster catalogue). */
export function homebrewMonsterEntryName(entry: MonsterEntry): string | undefined {
  const name: unknown = (entry as Partial<HomebrewMonsterEntry>).name;
  return typeof name === "string" ? name : undefined;
}

/** Resolves a stat block by its id: the catalogue's own lookup, or a homebrew one. */
export type StatBlockLookup = (blockId: string) => MonsterStatBlock | undefined;

/**
 * A stat-block lookup over the catalogue AND the DM's library: a
 * `homebrew:<entryId>` id resolves to that monster entry's stat block, every other
 * id to `catalogue` (the lazy bestiary's `getMonster`). A deleted or text-only
 * entry resolves to nothing — the same quiet empty state as a stale catalogue id.
 */
export function homebrewMonsterLookup(
  library: ReadonlyArray<LibraryEntry>,
  catalogue: StatBlockLookup = () => undefined
): StatBlockLookup {
  return (blockId) => {
    if (!blockId.startsWith(HOMEBREW_MONSTER_ID_PREFIX)) return catalogue(blockId);
    const entryId = blockId.slice(HOMEBREW_MONSTER_ID_PREFIX.length);
    const entry = library.find((e) => e.kind === "monster" && e.id === entryId);
    return entry?.kind === "monster"
      ? homebrewMonsterStatBlock(entryId, entry.item)
      : undefined;
  };
}

/** The stat-block id an encounter creature answers to: its catalogue `srdId`, or
 *  its homebrew library entry's; undefined for a hand-typed creature. */
export function encounterMonsterBlockId(
  monster: Pick<EncounterMonster, "srdId" | "homebrewId">
): string | undefined {
  if (monster.srdId) return monster.srdId;
  return monster.homebrewId ? homebrewMonsterBlockId(monster.homebrewId) : undefined;
}

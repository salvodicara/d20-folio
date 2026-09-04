/**
 * The closed-world codec of the persisted `Encounter` (schema 1) — design §5.5.
 *
 * `ENCOUNTER_SCHEMA` covers exactly the five known top-level keys (`schema`, `id`, `host`,
 * `log`, `checkpoint`) and mirrors `types.ts`/`dice.ts` field for field. Every other top-level
 * key is preserved verbatim under `Encounter.unknown` rather than dropped, so a future schema
 * revision never loses data a current build does not understand — but a malformed *known*
 * field (a log entry missing `seq`, a checkpoint whose state is not shaped right, …) quarantines
 * the whole document rather than silently truncating the log.
 *
 * `schema !== 1` is reported as `reason: "schema"`; every other structural problem is
 * `reason: "malformed"`; a non-record top-level value is `reason: "not-a-record"`.
 *
 * TWO `exact-schema` ceilings quarantine a document as `malformed`, both enforced by the
 * pre-check every `exactConformer` call makes:
 *
 * - `MAX_COLLECTION` (2,048 entries): the length of any one array — a `log` of 2,049 actions.
 * - `MAX_VALUES` (50,000 JSON nodes): counted over the WHOLE known-keys object, `log` AND
 *   `checkpoint.state` together. This is the BINDING one. A realistic action is ~21 nodes
 *   (Marco's Fireball intent, the fattest shape the prototype writes, is ~34), so the node
 *   budget runs out long before 2,048 entries do. `firestore.rules` therefore caps the stored
 *   log at 1,000 entries (~21,000-34,000 nodes, still 5x the design §5.3 compaction budget of
 *   200) rather than at the collection ceiling: a document past `MAX_VALUES` quarantines on
 *   EVERY client, and `checkpointEncounter` refuses to rewrite a quarantined document, so
 *   compaction — the one repair — is exactly what would stop working.
 *
 * Both are hard backstops, never an expected path; `tests/unit/combat/codec.test.ts` pins the
 * cap from both sides.
 */
import {
  arraySchema,
  booleanSchema,
  customSchema,
  discriminatedUnionSchema,
  exactConformer,
  literalSchema,
  numberSchema,
  objectSchema,
  recordSchema,
  stringSchema,
  unionSchema,
  type ExactSchema,
  type ExactSchemaContext,
} from "@/lib/exact-schema";
import { stripUndefined } from "@/lib/strip-undefined";
import { ROLL_PURPOSES } from "./dice";
import type { Encounter } from "./types";

// ── The `json` custom conformer ─────────────────────────────────────────────
//
// Accepts any plain JSON value (finite number, string, boolean, `null`, arrays and plain
// records recursed) and returns it unchanged; anything else fails. The runtime treats a
// conformer's `null` return as failure (it cannot tell a legitimate JSON `null` apart from
// "invalid"), so every schema position that must accept a real JSON `null` unions this custom
// with `literalSchema(null)` rather than relying on the custom alone.

const JSON_INVALID = Symbol("codec-json-invalid");

/** Matches `exact-schema`'s own `UNSAFE_KEYS`: never let a key silently repoint a prototype. */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Matches `exact-schema`'s own `MAX_DEPTH`: a hard backstop against a pathologically deep
 *  unknown-key value blowing the call stack — quarantine it as `malformed` instead. */
const MAX_DEPTH = 64;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** Validate and structurally clone a plain-JSON value; `JSON_INVALID` on anything else,
 *  including an unsafe key anywhere in the tree or nesting past `MAX_DEPTH`. */
function cloneJson(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return JSON_INVALID;
  if (value === null) return null;
  const type = typeof value;
  if (type === "boolean" || type === "string") return value;
  if (type === "number") return Number.isFinite(value) ? value : JSON_INVALID;
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    for (const item of value) {
      const cloned = cloneJson(item, depth + 1);
      if (cloned === JSON_INVALID) return JSON_INVALID;
      result.push(cloned);
    }
    return result;
  }
  if (isPlainRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) return JSON_INVALID;
      const cloned = cloneJson(item, depth + 1);
      if (cloned === JSON_INVALID) return JSON_INVALID;
      result[key] = cloned;
    }
    return result;
  }
  return JSON_INVALID;
}

function conformJson(value: unknown): unknown {
  const cloned = cloneJson(value);
  return cloned === JSON_INVALID ? null : cloned;
}

function freezeDeep(value: unknown, depth = 0): void {
  if (depth > MAX_DEPTH || typeof value !== "object" || value === null) return;
  for (const child of Object.values(value)) freezeDeep(child, depth + 1);
  if (!Object.isFrozen(value)) Object.freeze(value);
}

const JSON_SCHEMA = customSchema<"json", unknown>("json");
/** Any JSON value including `null` — see the note above the `json` conformer. */
const NULLABLE_JSON_SCHEMA = unionSchema([literalSchema(null), JSON_SCHEMA]);

// ── Small literal unions ────────────────────────────────────────────────────

const entityKindSchema = unionSchema([
  literalSchema("pc"),
  literalSchema("monster"),
  literalSchema("npc"),
  literalSchema("summon"),
  literalSchema("companion"),
  literalSchema("object"),
  literalSchema("table"),
]);

const damageTypeSchema = unionSchema([
  literalSchema("acid"),
  literalSchema("bludgeoning"),
  literalSchema("cold"),
  literalSchema("fire"),
  literalSchema("force"),
  literalSchema("lightning"),
  literalSchema("necrotic"),
  literalSchema("piercing"),
  literalSchema("poison"),
  literalSchema("psychic"),
  literalSchema("radiant"),
  literalSchema("slashing"),
  literalSchema("thunder"),
]);

const conditionIdSchema = unionSchema([
  literalSchema("blinded"),
  literalSchema("charmed"),
  literalSchema("deafened"),
  literalSchema("exhaustion"),
  literalSchema("frightened"),
  literalSchema("grappled"),
  literalSchema("incapacitated"),
  literalSchema("invisible"),
  literalSchema("paralyzed"),
  literalSchema("petrified"),
  literalSchema("poisoned"),
  literalSchema("prone"),
  literalSchema("restrained"),
  literalSchema("stunned"),
  literalSchema("unconscious"),
]);

const lifeStateSchema = unionSchema([
  literalSchema("alive"),
  literalSchema("dying"),
  literalSchema("stable"),
  literalSchema("dead"),
]);

const rangeBandSchema = unionSchema([
  literalSchema("reach"),
  literalSchema("near"),
  literalSchema("far"),
  literalSchema("out"),
]);

const coverDegreeSchema = unionSchema([
  literalSchema("half"),
  literalSchema("three-quarters"),
  literalSchema("total"),
]);

const restKindSchema = unionSchema([literalSchema("short"), literalSchema("long")]);
const dayPhaseSchema = unionSchema([literalSchema("dawn"), literalSchema("dusk")]);
const turnEdgeSchema = unionSchema([literalSchema("start"), literalSchema("end")]);

const rechargeSchema = unionSchema([
  literalSchema("short"),
  literalSchema("long"),
  literalSchema("dawn"),
  literalSchema("dusk"),
  literalSchema("turn"),
  literalSchema("round"),
  literalSchema("never"),
]);

const riderOnSchema = unionSchema([
  literalSchema("weapon-hit"),
  literalSchema("spell-hit"),
  literalSchema("any-hit"),
]);

const outcomeSchema = unionSchema([
  literalSchema("hit"),
  literalSchema("crit"),
  literalSchema("miss"),
  literalSchema("save-fail"),
  literalSchema("save-success"),
]);

const clockPhaseSchema = unionSchema([
  literalSchema("idle"),
  literalSchema("gathering"),
  literalSchema("turns"),
  literalSchema("ended"),
]);

const rollSourceSchema = unionSchema([literalSchema("app"), literalSchema("manual")]);

const rollPurposeSchema = unionSchema(
  ROLL_PURPOSES.map((purpose) => literalSchema(purpose)) as unknown as readonly [
    ExactSchema,
    ...ExactSchema[],
  ]
);

const paymentPoolSchema = unionSchema([literalSchema("standard"), literalSchema("pact")]);

/** The full `Automation` union — the shape a `table` `settings` op may propose. */
const automationSchema = unionSchema([
  literalSchema("full-auto"),
  literalSchema("propose-and-confirm"),
  literalSchema("log-only"),
]);

/** `FoldedState.settings.automation` — `Exclude<Automation, "propose-and-confirm">`. */
const foldedAutomationSchema = unionSchema([
  literalSchema("full-auto"),
  literalSchema("log-only"),
]);

// ── Ids and positions ────────────────────────────────────────────────────────

const seqSchema = objectSchema({
  ms: numberSchema,
  counter: numberSchema,
  by: stringSchema,
});

const positionSchema = objectSchema({ x: numberSchema, y: numberSchema });
const nullablePositionSchema = unionSchema([positionSchema, literalSchema(null)]);
const nullableStringSchema = unionSchema([stringSchema, literalSchema(null)]);
const nullableNumberSchema = unionSchema([numberSchema, literalSchema(null)]);

// ── Entities ────────────────────────────────────────────────────────────────

const abilityMapSchema = objectSchema({
  STR: numberSchema,
  DEX: numberSchema,
  CON: numberSchema,
  INT: numberSchema,
  WIS: numberSchema,
  CHA: numberSchema,
});

const derivedStatsSchema = objectSchema({
  ac: numberSchema,
  maxHp: numberSchema,
  speed: numberSchema,
  proficiency: numberSchema,
  abilities: abilityMapSchema,
  saves: abilityMapSchema,
  spellSaveDc: nullableNumberSchema,
  spellAttack: nullableNumberSchema,
  attacksPerAction: numberSchema,
  resistances: arraySchema(damageTypeSchema),
  immunities: arraySchema(damageTypeSchema),
  vulnerabilities: arraySchema(damageTypeSchema),
  conditionImmunities: arraySchema(conditionIdSchema),
});

const entityOriginSchema = discriminatedUnionSchema("kind", {
  character: objectSchema({
    kind: literalSchema("character"),
    uid: stringSchema,
    characterId: stringSchema,
    buildRevision: numberSchema,
  }),
  monster: objectSchema({ kind: literalSchema("monster"), srdId: stringSchema }),
  custom: objectSchema({ kind: literalSchema("custom"), label: stringSchema }),
  table: objectSchema({ kind: literalSchema("table") }),
});

const turnLedgerSchema = objectSchema({
  action: numberSchema,
  bonus: numberSchema,
  reaction: numberSchema,
  attacksUsed: numberSchema,
  movementUsed: numberSchema,
  claims: arraySchema(stringSchema),
});

const resourceSchema = objectSchema({
  current: numberSchema,
  max: numberSchema,
  recharge: rechargeSchema,
});

const entityVitalsSchema = objectSchema({
  hp: numberSchema,
  tempHp: unionSchema([
    objectSchema({ amount: numberSchema, source: nullableStringSchema }),
    literalSchema(null),
  ]),
  deathSaves: objectSchema({ successes: numberSchema, failures: numberSchema }),
  life: lifeStateSchema,
  exhaustion: numberSchema,
});

const overrideEntrySchema = objectSchema({
  value: NULLABLE_JSON_SCHEMA,
  reason: stringSchema,
  by: stringSchema,
});

const entitySchema = objectSchema({
  id: stringSchema,
  kind: entityKindSchema,
  label: stringSchema,
  controllerUid: stringSchema,
  controlledBy: nullableStringSchema,
  origin: entityOriginSchema,
  stats: derivedStatsSchema,
  vitals: entityVitalsSchema,
  resources: recordSchema("string", resourceSchema),
  concentration: nullableStringSchema,
  turn: turnLedgerSchema,
  overrides: recordSchema("string", overrideEntrySchema),
  reveal: objectSchema({ block: booleanSchema, hp: booleanSchema, token: booleanSchema }),
  position: nullablePositionSchema,
  mechanics: arraySchema(stringSchema),
});

// ── Relations ────────────────────────────────────────────────────────────────

const relationSchema = discriminatedUnionSchema("kind", {
  adjacent: objectSchema({
    kind: literalSchema("adjacent"),
    a: stringSchema,
    b: stringSchema,
  }),
  range: objectSchema({
    kind: literalSchema("range"),
    a: stringSchema,
    b: stringSchema,
    band: rangeBandSchema,
  }),
  visible: objectSchema({
    kind: literalSchema("visible"),
    a: stringSchema,
    b: stringSchema,
    value: booleanSchema,
  }),
  cover: objectSchema({
    kind: literalSchema("cover"),
    target: stringSchema,
    from: nullableStringSchema,
    degree: coverDegreeSchema,
  }),
  engaged: objectSchema({
    kind: literalSchema("engaged"),
    a: stringSchema,
    b: stringSchema,
  }),
  "aura-member": objectSchema({
    kind: literalSchema("aura-member"),
    effect: stringSchema,
    member: stringSchema,
  }),
  mark: objectSchema({
    kind: literalSchema("mark"),
    effect: stringSchema,
    by: stringSchema,
    on: stringSchema,
  }),
});

// ── Effects and lifetimes ────────────────────────────────────────────────────

const lifetimeSchema = discriminatedUnionSchema("kind", {
  manual: objectSchema({ kind: literalSchema("manual") }),
  "turn-edge": objectSchema({
    kind: literalSchema("turn-edge"),
    entity: stringSchema,
    edge: turnEdgeSchema,
    round: numberSchema,
  }),
  rounds: objectSchema({ kind: literalSchema("rounds"), remaining: numberSchema }),
  seconds: objectSchema({ kind: literalSchema("seconds"), remaining: numberSchema }),
  rest: objectSchema({
    kind: literalSchema("rest"),
    rest: restKindSchema,
    minimumOrdinal: numberSchema,
  }),
  "day-phase": objectSchema({
    kind: literalSchema("day-phase"),
    phase: dayPhaseSchema,
    minimumOrdinal: numberSchema,
  }),
  "source-end": objectSchema({ kind: literalSchema("source-end"), effect: stringSchema }),
});

const riderSchema = objectSchema({
  dice: stringSchema,
  type: damageTypeSchema,
  on: riderOnSchema,
  vs: objectSchema({ mark: literalSchema("self") }),
});

const standingFactsSchema = objectSchema(
  {},
  {
    acBonus: numberSchema,
    advantageOnAttacks: booleanSchema,
    resistances: arraySchema(damageTypeSchema),
    riders: arraySchema(riderSchema),
  }
);

const effectPayloadSchema = discriminatedUnionSchema("kind", {
  condition: objectSchema({
    kind: literalSchema("condition"),
    condition: conditionIdSchema,
  }),
  standing: objectSchema({ kind: literalSchema("standing"), facts: standingFactsSchema }),
  mark: objectSchema({
    kind: literalSchema("mark"),
    riders: arraySchema(riderSchema),
    advantage: booleanSchema,
  }),
  "temp-hp": objectSchema({ kind: literalSchema("temp-hp") }),
  bond: objectSchema({ kind: literalSchema("bond") }),
});

const effectSchema = objectSchema({
  id: stringSchema,
  source: objectSchema({
    entity: stringSchema,
    mechanic: stringSchema,
    action: stringSchema,
    castLevel: nullableNumberSchema,
  }),
  target: stringSchema,
  payload: effectPayloadSchema,
  lifetime: lifetimeSchema,
  concentration: booleanSchema,
});

// ── Clock and windows ────────────────────────────────────────────────────────

const clockSchema = objectSchema({
  phase: clockPhaseSchema,
  round: numberSchema,
  order: arraySchema(stringSchema),
  current: nullableStringSchema,
  initiative: recordSchema("string", numberSchema),
  restOrdinal: numberSchema,
  dayPhaseOrdinal: numberSchema,
});

const combatEventSchema = discriminatedUnionSchema("kind", {
  "turn-start": objectSchema({ kind: literalSchema("turn-start"), entity: stringSchema }),
  "turn-end": objectSchema({ kind: literalSchema("turn-end"), entity: stringSchema }),
  "round-start": objectSchema({
    kind: literalSchema("round-start"),
    round: numberSchema,
  }),
  "attack-declared": objectSchema({
    kind: literalSchema("attack-declared"),
    attacker: stringSchema,
    target: stringSchema,
    action: stringSchema,
  }),
  "attack-resolved": objectSchema({
    kind: literalSchema("attack-resolved"),
    attacker: stringSchema,
    target: stringSchema,
    outcome: outcomeSchema,
  }),
  "damage-taken": objectSchema({
    kind: literalSchema("damage-taken"),
    entity: stringSchema,
    amount: numberSchema,
  }),
  "hp-zero": objectSchema({ kind: literalSchema("hp-zero"), entity: stringSchema }),
  "effect-ended": objectSchema({
    kind: literalSchema("effect-ended"),
    effect: stringSchema,
  }),
  "concentration-ended": objectSchema({
    kind: literalSchema("concentration-ended"),
    entity: stringSchema,
    effect: stringSchema,
  }),
  "entity-left-reach": objectSchema({
    kind: literalSchema("entity-left-reach"),
    entity: stringSchema,
    from: stringSchema,
  }),
  "rest-completed": objectSchema({
    kind: literalSchema("rest-completed"),
    rest: restKindSchema,
    ordinal: numberSchema,
  }),
});

const reactionWindowSchema = objectSchema({
  id: stringSchema,
  event: combatEventSchema,
  eligible: arraySchema(stringSchema),
  declared: stringSchema,
});

const pendingCheckSchema = objectSchema({
  id: stringSchema,
  entity: stringSchema,
  kind: literalSchema("concentration"),
  dc: numberSchema,
  cause: stringSchema,
});

// ── Answers and payment ──────────────────────────────────────────────────────

const answerSchema = unionSchema([
  numberSchema,
  stringSchema,
  booleanSchema,
  arraySchema(numberSchema),
  objectSchema({ roll: stringSchema }),
  positionSchema,
]);

const answersSchema = recordSchema("string", answerSchema);

const paymentChoiceSchema = discriminatedUnionSchema("kind", {
  slot: objectSchema({
    kind: literalSchema("slot"),
    level: numberSchema,
    pool: paymentPoolSchema,
  }),
  resource: objectSchema({ kind: literalSchema("resource"), id: stringSchema }),
});

// ── Rolls ────────────────────────────────────────────────────────────────────

const rollRecordSchema = objectSchema({
  formula: stringSchema,
  faces: arraySchema(numberSchema),
  total: numberSchema,
  seed: nullableNumberSchema,
  source: rollSourceSchema,
  hidden: booleanSchema,
  roller: nullableStringSchema,
  purpose: rollPurposeSchema,
  label: nullableStringSchema,
});

// ── The map ──────────────────────────────────────────────────────────────────

const mapRectSchema = objectSchema({
  x: numberSchema,
  y: numberSchema,
  w: numberSchema,
  h: numberSchema,
});

const mapBackgroundSchema = objectSchema({
  path: stringSchema,
  url: stringSchema,
  width: numberSchema,
  height: numberSchema,
  cellPx: numberSchema,
  origin: objectSchema({ x: numberSchema, y: numberSchema }),
  bytes: numberSchema,
});

const nullableMapBackgroundSchema = unionSchema([
  mapBackgroundSchema,
  literalSchema(null),
]);

const mapStateSchema = objectSchema({
  background: nullableMapBackgroundSchema,
  fog: objectSchema({ covered: booleanSchema, revealed: arraySchema(mapRectSchema) }),
});

const fogChangeSchema = discriminatedUnionSchema("kind", {
  cover: objectSchema({ kind: literalSchema("cover"), covered: booleanSchema }),
  reveal: objectSchema({ kind: literalSchema("reveal"), rect: mapRectSchema }),
  hide: objectSchema({ kind: literalSchema("hide"), rect: mapRectSchema }),
});

// ── Table ops ────────────────────────────────────────────────────────────────

const tableOpSchema = discriminatedUnionSchema("op", {
  start: objectSchema({ op: literalSchema("start"), epoch: numberSchema }),
  "add-entity": objectSchema({ op: literalSchema("add-entity"), entity: entitySchema }),
  "remove-entity": objectSchema({
    op: literalSchema("remove-entity"),
    entity: stringSchema,
  }),
  join: objectSchema({ op: literalSchema("join"), entity: entitySchema }),
  leave: objectSchema({ op: literalSchema("leave"), entity: stringSchema }),
  sync: objectSchema({ op: literalSchema("sync"), entity: entitySchema }),
  "set-initiative": objectSchema({
    op: literalSchema("set-initiative"),
    entity: stringSchema,
    value: numberSchema,
  }),
  "begin-turns": objectSchema({
    op: literalSchema("begin-turns"),
    order: arraySchema(stringSchema),
  }),
  "end-turn": objectSchema({ op: literalSchema("end-turn") }),
  end: objectSchema({ op: literalSchema("end") }),
  rest: objectSchema({ op: literalSchema("rest"), rest: restKindSchema }),
  settings: objectSchema({
    op: literalSchema("settings"),
    revealMonsterHp: booleanSchema,
    automation: automationSchema,
  }),
  map: objectSchema({
    op: literalSchema("map"),
    background: nullableMapBackgroundSchema,
  }),
  fog: objectSchema({ op: literalSchema("fog"), change: fogChangeSchema }),
});

// ── Actions ──────────────────────────────────────────────────────────────────

const ACTION_BASE = {
  id: stringSchema,
  seq: seqSchema,
  by: stringSchema,
};

const actionSchema = discriminatedUnionSchema("kind", {
  intent: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("intent"),
    entity: stringSchema,
    mechanic: stringSchema,
    program: stringSchema,
    targets: arraySchema(stringSchema),
    answers: answersSchema,
    payment: arraySchema(paymentChoiceSchema),
    window: nullableStringSchema,
    basedOn: numberSchema,
  }),
  declare: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("declare"),
    relation: relationSchema,
    remove: booleanSchema,
    mover: nullableStringSchema,
  }),
  override: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("override"),
    entity: stringSchema,
    path: stringSchema,
    value: NULLABLE_JSON_SCHEMA,
    reason: stringSchema,
  }),
  resolve: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("resolve"),
    window: stringSchema,
  }),
  check: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("check"),
    check: stringSchema,
    answers: answersSchema,
  }),
  undo: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("undo"),
    of: stringSchema,
    reason: nullableStringSchema,
  }),
  table: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("table"),
    table: tableOpSchema,
  }),
  roll: objectSchema({
    ...ACTION_BASE,
    kind: literalSchema("roll"),
    roll: rollRecordSchema,
  }),
});

// ── Folded state and the encounter envelope ─────────────────────────────────

const foldedStateSchema = objectSchema({
  epoch: numberSchema,
  clock: clockSchema,
  entities: recordSchema("string", entitySchema),
  relations: arraySchema(relationSchema),
  effects: recordSchema("string", effectSchema),
  windows: arraySchema(reactionWindowSchema),
  checks: arraySchema(pendingCheckSchema),
  declared: recordSchema("string", actionSchema),
  rolls: recordSchema("string", rollRecordSchema),
  spent: recordSchema("string", stringSchema),
  nextOrdinal: numberSchema,
  revision: numberSchema,
  settings: objectSchema({
    revealMonsterHp: booleanSchema,
    automation: foldedAutomationSchema,
  }),
  map: mapStateSchema,
});

const hostSchema = discriminatedUnionSchema("kind", {
  personal: objectSchema({
    kind: literalSchema("personal"),
    uid: stringSchema,
    characterId: stringSchema,
  }),
  campaign: objectSchema({ kind: literalSchema("campaign"), campaignId: stringSchema }),
});

const checkpointSchema = unionSchema([
  objectSchema({ through: seqSchema, state: foldedStateSchema }),
  literalSchema(null),
]);

/** The five known top-level keys of a schema-1 `Encounter`; `unknown` lives outside this. */
const ENCOUNTER_SCHEMA = objectSchema({
  schema: literalSchema(1),
  id: stringSchema,
  host: hostSchema,
  log: arraySchema(actionSchema),
  checkpoint: checkpointSchema,
});

const ENCOUNTER_CONTEXT: ExactSchemaContext<
  { readonly json: unknown },
  Record<never, never>
> = {
  customs: { json: conformJson },
  refs: {},
};

const conformEncounterKnown = exactConformer(ENCOUNTER_SCHEMA, ENCOUNTER_CONTEXT);

const KNOWN_KEYS = new Set(["schema", "id", "host", "log", "checkpoint"]);

// ── The codec ────────────────────────────────────────────────────────────────

export type EncounterParse =
  | { readonly ok: true; readonly encounter: Encounter }
  | { readonly ok: false; readonly reason: "not-a-record" | "schema" | "malformed" };

/** Parse an untrusted document into a schema-1 `Encounter`, failing closed. */
export function parseEncounter(value: unknown): EncounterParse {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    return { ok: false, reason: "not-a-record" };
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== 1) return { ok: false, reason: "schema" };

  const known: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (UNSAFE_KEYS.has(key)) return { ok: false, reason: "malformed" };
    if (KNOWN_KEYS.has(key)) known[key] = entry;
    else rest[key] = entry;
  }

  const conformed = conformEncounterKnown(known);
  if (conformed === null) return { ok: false, reason: "malformed" };

  if (Object.keys(rest).length === 0) {
    return { ok: true, encounter: conformed };
  }
  const clonedRest = cloneJson(rest);
  if (clonedRest === JSON_INVALID) return { ok: false, reason: "malformed" };
  freezeDeep(clonedRest);
  return {
    ok: true,
    encounter: {
      ...(conformed as Encounter),
      unknown: clonedRest as Readonly<Record<string, unknown>>,
    },
  };
}

/** Emit the Firestore-ready document for a schema-1 `Encounter`: `unknown` first, then the
 *  five known keys, through `stripUndefined`. */
export function encounterWriteData(encounter: Encounter): Record<string, unknown> {
  const { unknown, schema, id, host, log, checkpoint } = encounter;
  return stripUndefined({
    ...(unknown ?? {}),
    schema,
    id,
    host,
    log,
    checkpoint,
  }) as Record<string, unknown>;
}

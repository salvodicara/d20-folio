/**
 * `projectCharacter` — a `CharacterDoc` becomes a player character seated at the table:
 * one `Entity`, the executable mechanics it CARRIES into the encounter log, and the
 * automated/adjudicated split of what it can do (stage 6 design §2 D3/D4).
 *
 * ## Where this lives, and why not in the kernel
 *
 * The combat kernel (`src/lib/combat`) knows nothing about characters: it folds a log of
 * typed actions. This module is the ADAPTER between the sheet's engine and that kernel, so
 * it lives outside `src/lib/combat` and the kernel never imports it
 * (`tests/unit/combat/boundary.guard.test.ts`). It reads `resolveActions(doc, "combat")` —
 * the sheet's OWN action rows, override-first — so a projected attack bonus is, by
 * construction, the number the player reads on their sheet (golden rule 6).
 *
 * ## Numbers are fixed at projection
 *
 * `bonus: 7`, not an `Expr` over `stats`: the sheet's engine has already folded fighting
 * styles, magic bonuses, exhaustion and manual overrides into the row. The consequence is
 * stated rather than hidden — an ability-score override made INSIDE the encounter does not
 * move a projected attack bonus; the DM overrides the outcome instead, and `sync` refreshes
 * the whole projection when the build changes.
 *
 * ## What automates, and what the table decides
 *
 * Only the stage-3 vocabulary (`lib/combat/mechanic.ts`) may be emitted. A row the
 * vocabulary cannot express becomes a `manual-table` program that still spends its economy
 * and lands in the log, with the DM adjudicating the effect — never a half-built program.
 * The honest boundaries, each one visible in the returned `coverage`:
 *
 *  - a damage amount the dice grammar cannot roll — `3×(1d4+1)`, or a flat one (the 2024
 *    Unarmed Strike): the reducer reads every damage part from a rolled answer;
 *  - several damage instances, several simultaneous types, a use-time type choice, or a
 *    second dice+type component — one `damage` step carries one roll per part;
 *  - an area whose printed shape is not one of the five the grid derives
 *    (`SrdSpellData.areaShape` — an Emanation, a Wall, several shapes at once);
 *  - a rolled heal: `heal.amount` is an `Expr`, which has no dice (a FLAT heal — the Heal
 *    spell's 70 — does automate);
 *  - a row that promises more than the program would deliver — `promisesMore` names each
 *    class: a condition the save inflicts, a `while-active` grant the use establishes,
 *    damage on a miss, a one-roll bonus, a resolution gate, a target shape the vocabulary
 *    cannot say, or an effect that re-applies on a cadence.
 *
 * Two residuals are deliberately NOT degrades, because each is a PLAYER'S ELECTION at the
 * table rather than a consequence the program itself produces:
 *
 *  - conditional on-hit riders (Sneak Attack, Divine Smite, a Psi Warrior die) are
 *    once-per-turn, resource-gated or creature-type-gated, and the vocabulary cannot gate on
 *    that. The automated part is the base attack and its typed weapon damage, exactly as
 *    design §2 D4 specifies; the rider stays the table's to declare;
 *  - a condition the caster ENDS (the Heal spell's Blinded/Deafened) is a separate benefit
 *    the DM drawer adjudicates; refusing the heal over it would automate less, not more.
 *
 * The Versatile grip is NOT a residual: it is expressed as a `choice` input plus a `when`
 * predicate, so a longsword swung in two hands logs its own die (`attackProgram`).
 */
import type { CharacterDoc } from "@/types/character";
import type { AbilityCode, SrdSpellData } from "@/data/types";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage";
import { getSpellById } from "@/data/spells";
import { slotUsageKey } from "@/lib/cast-options";
import { getEquipment } from "@/data/equipment";
import { primaryClassId, totalLevel } from "@/lib/classes";
import {
  ALL_ABILITIES,
  abilityModifier,
  effectiveAbilityScores,
  effectiveProficiencyBonus,
  effectiveSpellAttackBonus,
  effectiveSpellSaveDc,
  flatSaveBonus,
  mergeSaveProficiencies,
  resolveCastingModifier,
  savingThrowBonus,
} from "@/lib/compute";
import {
  aggregateCharacterGrants,
  effectiveAC,
  effectiveMaxHp,
} from "@/lib/aggregate-character";
import { deriveDefenseKind } from "@/lib/defense-sets";
import {
  effectiveWalkingSpeedFt,
  attacksPerActionForCharacter,
  resolveActions,
  resolveTrackers,
  type RawResolvedAction,
} from "@/lib/smart-tracker";
import type { LocText } from "@/lib/loc-text";
import { CORE_MECHANIC_IDS } from "@/data/combat/core-catalogue";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { coverageFor, type CoverageRow } from "@/lib/combat/coverage";
import { parseFormula, isRollError } from "@/lib/combat/dice";
import type { LabelId, MechanicId } from "@/lib/combat/ids";
import type {
  AreaShapeSpec,
  Cost,
  DamagePart,
  Input,
  Mechanic,
  Predicate,
  Program,
  Step,
  TargetSpec,
} from "@/lib/combat/mechanic";
import type {
  Ability,
  ConditionId,
  Entity,
  LifeState,
  Resource,
} from "@/lib/combat/types";

/** Which character, played by whom, at which build revision. */
export interface CharacterSeat {
  readonly uid: string;
  readonly characterId: string;
  /** The build the projection was taken from; `sync` bumps it when the sheet changes. */
  readonly buildRevision: number;
}

/**
 * The base-action rows the STATIC core catalogue already gives every creature
 * (`src/data/combat/core-catalogue.ts`). Projecting them again would put two Dash tiles on
 * the hotbar; the other base rows (Influence, Magic, Ready, Search, …) have no core
 * mechanic and project as `manual-table` like anything else the table adjudicates.
 */
const CORE_COVERED_ROWS: ReadonlySet<string> = new Set([
  "base-dash",
  "base-dodge",
  "base-disengage",
  "base-help",
  "base-hide",
]);

const DAMAGE_TYPE_SET: ReadonlySet<string> = new Set(DAMAGE_TYPES);
const ABILITY_SET: ReadonlySet<string> = new Set(ALL_ABILITIES.map((a) => a.code));

function damageTypeOf(value: string | undefined): DamageType | null {
  return value !== undefined && DAMAGE_TYPE_SET.has(value) ? (value as DamageType) : null;
}

function abilityOf(value: string | undefined): Ability | null {
  return value !== undefined && ABILITY_SET.has(value) ? (value as Ability) : null;
}

/** A formula the kernel's dice grammar can actually roll (`NdM+K`); `null` otherwise. */
function rollable(formula: string | undefined): string | null {
  if (!formula) return null;
  return isRollError(parseFormula(formula)) ? null : formula;
}

/**
 * A row's LABEL as a stable reference, never a display string: the SRD catalogue key, the
 * chrome i18n key, the user's own homebrew name, or — for an engine-authored bilingual
 * literal, which has no catalogue key — the row's own stable action id.
 */
function labelFor(name: LocText, rowId: string): LabelId {
  if ("srd" in name) return `srd:${name.srd.kind}:${name.srd.key}:${name.srd.field}`;
  if ("ui" in name) return `ui:${name.ui}`;
  if ("custom" in name) return `custom:${name.custom}`;
  return `action:${rowId}`;
}

// ── The action adapter (design §2 D4) ───────────────────────────────────────

const VISIBLE_TARGET: Predicate = {
  relation: "visible",
  between: ["$self", "$target"],
  value: true,
};
const ADJACENT_TARGET: Predicate = {
  relation: "adjacent",
  between: ["$self", "$target"],
  value: true,
};

/** Does this attack reach its target with reach, or across the room? The weapon's own
 *  structured range answers for a carried weapon; `attackMode` answers for the rows that
 *  have no weapon (a spell attack, an Unarmed Strike). Anything else is treated as ranged,
 *  the weaker claim — an adjacency the table never declared would block the attack. */
function isMelee(row: RawResolvedAction): boolean {
  const range = row.summary.weaponRange;
  if (range) return range.kind === "melee";
  return row.summary.attackMode === "melee";
}

function oneTarget(eligibility: Predicate): TargetSpec {
  return { count: 1, eligibility };
}

/** The turn budget a row claims. A weapon swing spends an ATTACK of the Attack action; a
 *  spell or feature spends the economy it is printed with. */
function turnClaim(row: RawResolvedAction): Cost {
  if (row.type === "action" && row.source === "weapon")
    return { kind: "turn", claim: "attack" };
  return { kind: "turn", claim: row.type };
}

function costsFor(row: RawResolvedAction): Cost[] {
  const costs: Cost[] = [turnClaim(row)];
  if (row.costsSlot && row.slotLevel !== undefined) {
    // ALWAYS upcastable: the SRD lets every spell be cast from a slot of its own level or
    // higher, and only some of them scale with it. A projected program's numbers are fixed —
    // `castLevel` feeds nothing but `byLevel` and the effect's provenance — so refusing the
    // higher slot here would strand a Wizard out of 1st-level slots, and a Warlock (whose
    // whole pool sits at one level) out of every non-scaling spell it knows.
    costs.push({ kind: "slot", level: row.slotLevel, upcast: true });
  }
  if (row.costTracker) {
    costs.push({ kind: "resource", id: row.costTracker, amount: row.trackerCost ?? 1 });
  }
  if (row.concentration) costs.push({ kind: "concentration" });
  return costs;
}

/** `SrdSpellData.areaShape` → the authored area the reducer derives cells from. */
function areaSpec(shape: NonNullable<SrdSpellData["areaShape"]>): AreaShapeSpec | null {
  switch (shape.kind) {
    case "sphere":
    case "cylinder":
      return { kind: shape.kind, origin: "origin", radiusFt: shape.sizeFt };
    case "cube":
      return { kind: "cube", origin: "origin", sizeFt: shape.sizeFt };
    case "cone":
      return { kind: "cone", origin: "origin", aim: "aim", lengthFt: shape.sizeFt };
    case "line":
      return shape.widthFt === undefined
        ? null
        : {
            kind: "line",
            origin: "origin",
            aim: "aim",
            lengthFt: shape.sizeFt,
            widthFt: shape.widthFt,
          };
  }
}

/**
 * Which creatures a program may pick. The vocabulary says exactly two things: ONE target
 * matching an eligibility predicate, or an AREA that derives its own. So a row is
 * expressible only when it names one hostile-or-any target; an ally-only or self-only row,
 * a multi-target row, a creature-type restriction, an `excludeSelf` and a per-upcast target
 * growth are all shapes a single `$target` would misstate — a self-only heal aimed at
 * anyone visible, a three-target Bane cast on one creature.
 */
function expressibleTargeting(row: RawResolvedAction): boolean {
  const targeting = row.summary.targeting;
  if (!targeting) return true;
  if (targeting.affinity !== "enemy" && targeting.affinity !== "any") return false;
  if (targeting.maxTargets !== undefined && targeting.maxTargets !== 1) return false;
  return !(
    targeting.excludeSelf ||
    targeting.creatureTypes ||
    targeting.maxTargetsPerUpcast ||
    targeting.sharedAmount
  );
}

/**
 * `true` when the program's OWN resolution would produce a consequence the vocabulary
 * cannot express, so the whole row stays adjudicated rather than half-applied. Each class:
 *
 *  - a condition the save inflicts (`conditionApplication`);
 *  - an effect that re-applies on a cadence (`recurrence`, `recurringUse`) or does not
 *    resolve at cast at all (`resolveOnCast: false`);
 *  - a standing state the use establishes — a `while-active` grant on the caster
 *    (`activatesKey`, `maintainsActiveKey`) or on the target (`standingEffect`: Vicious
 *    Mockery's Disadvantage on the next attack roll). `effect-start` carries no grant, so
 *    automating the damage alone would quietly drop the point of the spell;
 *  - damage on a MISS (`damageOnMiss`) — the `attack` step applies damage on a hit only;
 *  - a flat bonus that must land on exactly ONE damage roll (`oneRollDamageBonus`);
 *  - a resolution gate that overrides the row's apparent attack/save shape
 *    (`damageResolution` — a smite whose damage lands before its rider's save);
 *  - a target shape `expressibleTargeting` rejects.
 *
 * A condition the caster ENDS (the Heal spell's Blinded/Deafened, a Lay-on-Hands cure) is
 * deliberately NOT here: it is a separate benefit the table adjudicates in the DM drawer,
 * and refusing to apply the heal because of it would automate less, not more.
 */
function promisesMore(row: RawResolvedAction): boolean {
  const summary = row.summary;
  return Boolean(
    summary.conditionApplication ||
    summary.recurrence ||
    summary.recurringUse ||
    summary.resolveOnCast === false ||
    row.activatesKey ||
    row.maintainsActiveKey ||
    row.standingEffect ||
    summary.damageOnMiss ||
    summary.oneRollDamageBonus !== undefined ||
    summary.damageResolution ||
    !expressibleTargeting(row)
  );
}

/** The damage a row deals as ONE typed roll, or `null` when the vocabulary cannot say it. */
function singleDamage(row: RawResolvedAction): { input: Input; part: DamagePart } | null {
  const summary = row.summary;
  // Several instances, several simultaneous types, a use-time choice, or a second
  // dice+type component: each would need more than one roll per damage part.
  if ((summary.instances ?? 1) > 1) return null;
  if (summary.damageTypes && summary.damageTypes.length > 1) return null;
  if (summary.secondaryDamage) return null;
  const formula = rollable(summary.damage);
  const type = damageTypeOf(summary.damageType);
  if (!formula || !type) return null;
  return {
    input: { id: "damage", kind: "dice", formula },
    part: { dice: "damage", type },
  };
}

/** The two grips a Versatile weapon offers, as stable label ids the presenter renders as a
 *  choice on the tile. One-handed is the DEFAULT: the `when` gates only the two-handed
 *  step, so a swing with no grip answer deals the printed one-handed damage. */
const GRIP_ONE_HANDED = "grip:one-handed";
const GRIP_TWO_HANDED = "grip:two-handed";

function attackProgram(row: RawResolvedAction, costs: Cost[]): Program | null {
  const bonus = row.summary.attackBonus;
  const damage = singleDamage(row);
  if (bonus === undefined || !damage) return null;
  // A Versatile weapon is TWO printed damage dice behind one attack roll. It is expressed,
  // not dropped: a `choice` input picks the grip and a `when` predicate selects the step,
  // so a longsword swung in two hands logs its own 1d10 instead of the sheet's 1d8. A
  // versatile formula the dice grammar cannot roll leaves the whole row to the table.
  const versatile = row.summary.versatileDamage;
  const twoHanded = versatile === undefined ? null : rollable(versatile);
  if (versatile !== undefined && !twoHanded) return null;
  const steps: Step[] = [
    {
      id: "hit",
      kind: "attack",
      roll: "roll",
      bonus,
      damage: [damage.part],
      ...(twoHanded
        ? { when: { not: { answer: "grip", equals: GRIP_TWO_HANDED } } }
        : {}),
    },
  ];
  const inputs: Input[] = [{ id: "roll", kind: "d20", for: "attack" }, damage.input];
  if (twoHanded) {
    inputs.push(
      { id: "grip", kind: "choice", options: [GRIP_ONE_HANDED, GRIP_TWO_HANDED] },
      { id: "damage-versatile", kind: "dice", formula: twoHanded }
    );
    steps.push({
      id: "hit-versatile",
      kind: "attack",
      when: { answer: "grip", equals: GRIP_TWO_HANDED },
      roll: "roll",
      bonus,
      damage: [{ dice: "damage-versatile", type: damage.part.type }],
    });
  }
  return {
    id: row.id,
    trigger: { kind: "invocation", economy: row.type },
    cost: costs,
    targets: oneTarget(isMelee(row) ? ADJACENT_TARGET : VISIBLE_TARGET),
    inputs,
    steps,
  };
}

function saveProgram(
  row: RawResolvedAction,
  costs: Cost[],
  spell: SrdSpellData | null,
  spellSaveDc: number | null
): Program | null {
  const ability = abilityOf(row.summary.saveAbility);
  const damage = singleDamage(row);
  if (row.summary.saveDC === undefined || !ability || !damage) return null;
  const area = row.summary.area ? (spell?.areaShape ?? null) : null;
  // An area row whose printed shape the grid cannot derive stays adjudicated: modelling it
  // as a single target would silently spare everyone else in the blast.
  if (row.summary.area && !area) return null;
  const spec = area ? areaSpec(area) : null;
  if (area && !spec) return null;
  const positions: Input[] =
    spec === null
      ? []
      : spec.kind === "cone" || spec.kind === "line"
        ? [
            { id: "origin", kind: "position" },
            { id: "aim", kind: "position" },
          ]
        : [{ id: "origin", kind: "position" }];
  const steps: Step[] = [
    {
      id: "resist",
      kind: "save",
      roll: "save",
      ability,
      // `"spell"` resolves to the entity's `stats.spellSaveDc` — the PRIMARY caster DC —
      // so it may only be used when the row's own DC is that same number. A second class's
      // spell (a Wizard/Cleric's Sacred Flame), an item's `castOverrides.saveDC` and a
      // species- or feat-granted spell on a martial each print a different DC, and a
      // non-caster has none at all: those carry the row's number, the one on the sheet.
      dc: row.summary.saveDC === spellSaveDc ? "spell" : row.summary.saveDC,
      onSuccess: row.summary.damageOnSave === "half" ? "half" : "negate",
    },
    { id: "harm", kind: "damage", parts: [damage.part], to: "$target" },
  ];
  return {
    id: row.id,
    trigger: { kind: "invocation", economy: row.type },
    cost: costs,
    targets: spec
      ? { count: "area", eligibility: { all: [] }, area: spec }
      : oneTarget(VISIBLE_TARGET),
    inputs: [
      ...positions,
      { id: "save", kind: "d20", for: "save", ability, perTarget: true },
      damage.input,
    ],
    steps,
  };
}

/** The heal a row restores as ONE deterministic number — the Heal spell's flat 70, a
 *  dice-free feature heal. `Step.heal.amount` is an `Expr`, which has no dice, so a rolled
 *  heal (every class heal in the corpus) is the table's until the vocabulary grows one. */
function flatHeal(row: RawResolvedAction): number | null {
  const { healing, heal } = row.summary;
  // A spell's own amount is a formula string (`"2d8+4"`, or the Heal spell's `"70"`); a
  // feature's is already structured. `healApply` is not read: its `dice` is required, so
  // every row that carries it rolls.
  if (healing !== undefined && /^\d+$/.test(healing.trim()))
    return Number(healing.trim());
  if (heal && heal.dice === undefined) return heal.bonus;
  return null;
}

function healProgram(row: RawResolvedAction, costs: Cost[]): Program | null {
  const amount = flatHeal(row);
  if (amount === null || amount <= 0) return null;
  return {
    id: row.id,
    trigger: { kind: "invocation", economy: row.type },
    cost: costs,
    targets: oneTarget(VISIBLE_TARGET),
    steps: [{ id: "mend", kind: "heal", amount, to: "$target" }],
  };
}

function manualProgram(row: RawResolvedAction, costs: Cost[]): Program {
  return {
    id: row.id,
    trigger: { kind: "invocation", economy: row.type },
    cost: costs,
    steps: [{ id: "resolve", kind: "manual-table", label: labelFor(row.name, row.id) }],
  };
}

/** Where the row's content came from: a player's own homebrew carries its name verbatim
 *  (a `custom` `LocText`), everything else is catalogue content. Provenance only — the
 *  reducer executes a mechanic the same way whatever wrote it. */
function sourceOf(row: RawResolvedAction): Mechanic["source"] {
  return "custom" in row.name ? "homebrew" : "srd";
}

function mechanicFor(
  row: RawResolvedAction,
  characterId: string,
  spellSaveDc: number | null
): Mechanic {
  const spell = row.spellId ? (getSpellById(row.spellId) ?? null) : null;
  const costs = costsFor(row);
  const program = promisesMore(row)
    ? manualProgram(row, costs)
    : (attackProgram(row, costs) ??
      saveProgram(row, costs, spell, spellSaveDc) ??
      healProgram(row, costs) ??
      manualProgram(row, costs));
  return {
    schema: 1,
    id: `pc:${characterId}:${row.id}`,
    source: sourceOf(row),
    label: labelFor(row.name, row.id),
    active: [program],
  };
}

// ── Stats, vitals and resources ─────────────────────────────────────────────

function lifeOf(hp: number, successes: number, failures: number): LifeState {
  if (hp > 0) return "alive";
  if (failures >= 3) return "dead";
  if (successes >= 3) return "stable";
  return "dying";
}

function slotResources(doc: CharacterDoc): Record<string, Resource> {
  const out: Record<string, Resource> = {};
  for (const slot of doc.character.spellSlots) {
    // The reducer's own keys (`intent.ts`): a Pact Magic slot is a separate pool at the
    // same level, so it can never be spent as a standard slot or vice versa.
    const key = slot.pactMagic ? `pact-${slot.level}` : `slot-${slot.level}`;
    // The USAGE counter has its own key (`slotUsageKey`, the one seam every read and write
    // of `session.spellSlots` routes through): a Pact slot counts under `pact-<level>`, a
    // normal one under the bare level. Keying both by level would seat a Sorlock with a
    // full Pact pool after spending a shared slot, and vice versa.
    const used = doc.session.spellSlots[slotUsageKey(slot)]?.used ?? 0;
    out[key] = {
      current: Math.max(0, slot.total - used),
      max: slot.total,
      recharge: slot.pactMagic ? "short" : "long",
    };
  }
  return out;
}

const RECHARGE: Readonly<Record<string, Resource["recharge"]>> = {
  "long-rest": "long",
  "short-rest": "short",
  "short-or-long-rest": "short",
  dawn: "dawn",
  "per-turn": "turn",
  manual: "never",
};

function trackerResources(doc: CharacterDoc): Record<string, Resource> {
  const out: Record<string, Resource> = {};
  for (const tracker of resolveTrackers(doc)) {
    out[tracker.id] = {
      current: Math.max(0, tracker.total - tracker.used),
      max: tracker.total,
      recharge: RECHARGE[tracker.recovery] ?? "never",
    };
  }
  return out;
}

export function projectCharacter(
  doc: CharacterDoc,
  seat: CharacterSeat
): { entity: Entity; mechanics: Mechanic[]; coverage: CoverageRow[] } {
  const charData = doc.character;
  const session = doc.session;
  const aggSession = {
    activeFeatures: session.activeFeatures,
    grantBundleChoices: session.grantBundleChoices,
    itemResources: session.itemResources,
  };
  const aggregate = aggregateCharacterGrants(charData, aggSession);
  const level = totalLevel(charData);
  const pbOverride = charData.proficiencyBonusOverride;
  const scores = effectiveAbilityScores(
    charData.abilityScores,
    aggregate.abilityScoreFloors,
    aggregate.itemAbilityScoreBonus,
    aggregate.itemAbilityScoreCap
  );
  const proficient = mergeSaveProficiencies(
    charData.savingThrows,
    aggregate.saveProficiencies
  );
  const saveBonusFlat = flatSaveBonus(aggregate, scores);
  const abilities = {} as Record<Ability, number>;
  const saves = {} as Record<Ability, number>;
  for (const { code } of ALL_ABILITIES) {
    abilities[code] = abilityModifier(scores[code]);
    saves[code] = savingThrowBonus(
      scores[code],
      level,
      proficient.includes(code),
      charData.savingThrowBonusOverrides?.[code] ?? null,
      session.exhaustion,
      pbOverride,
      saveBonusFlat
    );
  }

  // The caster numbers the sheet prints: the primary casting ability, the class-scoped
  // grant bumps, and an override that replaces the whole value (override-first).
  const casting = charData.spellcasting;
  const castAbility: AbilityCode = casting?.ability ?? "CHA";
  const spellSaveDc = casting
    ? effectiveSpellSaveDc(
        level,
        scores[castAbility],
        resolveCastingModifier(aggregate.spellSaveDcBonus, primaryClassId(charData)),
        casting.saveDCOverride,
        pbOverride
      )
    : null;
  const spellAttack = casting
    ? effectiveSpellAttackBonus(
        level,
        scores[castAbility],
        resolveCastingModifier(aggregate.spellAttackBonus, primaryClassId(charData)),
        casting.attackBonusOverride,
        session.exhaustion,
        pbOverride
      )
    : null;

  const defense = (
    computed: Iterable<string>,
    override: Record<string, boolean> | undefined,
    adds: readonly string[] | undefined
  ): string[] => deriveDefenseKind(computed, override, adds).effective;

  const mechanics = resolveActions(doc, "combat")
    .filter((row) => !CORE_COVERED_ROWS.has(row.id))
    .map((row) => mechanicFor(row, seat.characterId, spellSaveDc));
  const built = buildCatalogue(mechanics);

  const hp = session.hp.current;
  const entity: Entity = {
    id: seat.characterId,
    kind: "pc",
    label: `character:${seat.characterId}`,
    controllerUid: seat.uid,
    controlledBy: null,
    origin: {
      kind: "character",
      uid: seat.uid,
      characterId: seat.characterId,
      buildRevision: seat.buildRevision,
    },
    stats: {
      ac: effectiveAC(charData, aggSession),
      maxHp: effectiveMaxHp(charData, aggSession),
      speed: charData.speedOverride ?? effectiveWalkingSpeedFt(doc, getEquipment),
      proficiency: effectiveProficiencyBonus(level, pbOverride),
      abilities,
      saves,
      spellSaveDc,
      spellAttack,
      attacksPerAction: attacksPerActionForCharacter(doc),
      resistances: defense(
        aggregate.damageResistances,
        charData.damageResistanceOverrides,
        session.sessionDefenses?.resistance
      ) as DamageType[],
      immunities: defense(
        aggregate.damageImmunities,
        charData.damageImmunityOverrides,
        session.sessionDefenses?.immunity
      ) as DamageType[],
      vulnerabilities: defense(
        aggregate.damageVulnerabilities,
        charData.damageVulnerabilityOverrides,
        session.sessionDefenses?.vulnerability
      ) as DamageType[],
      conditionImmunities: defense(
        aggregate.conditionImmunities,
        charData.conditionImmunityOverrides,
        session.sessionDefenses?.conditionImmunity
      ) as ConditionId[],
    },
    vitals: {
      hp,
      tempHp: session.hp.temp > 0 ? { amount: session.hp.temp, source: null } : null,
      deathSaves: { successes: session.deathSucc, failures: session.deathFail },
      life: lifeOf(hp, session.deathSucc, session.deathFail),
      exhaustion: session.exhaustion,
    },
    resources: { ...slotResources(doc), ...trackerResources(doc) },
    // The sheet's concentration is a SPELL reference; the table's is an `EffectId` the
    // reducer mints when the cast applies. A projection starts concentrating on nothing.
    concentration: null,
    turn: {
      action: 0,
      bonus: 0,
      reaction: 0,
      attacksUsed: 0,
      movementUsed: 0,
      movementExtra: 0,
      claims: [],
    },
    overrides: {},
    // A party member is public at the table: the token, the block and the HP.
    reveal: { block: true, hp: true, token: true },
    position: null,
    mechanics: [
      ...mechanics.map((mechanic): MechanicId => mechanic.id),
      ...CORE_MECHANIC_IDS,
    ],
  };
  return {
    entity,
    mechanics,
    coverage: coverageFor(built.catalogue, built.errors),
  };
}

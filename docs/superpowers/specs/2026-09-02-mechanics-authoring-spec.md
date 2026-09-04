# Mechanics authoring specification (v1)

**Date:** 2026-09-02 · **Status:** v1, bounded on 2026-09-03 to the stage-3 tier (§6) ·
**Owner of this fact:** this document until folded into `docs/MECHANICS.md` (stage 7). Companion of the
[target architecture](2026-09-02-total-combat-automation-design.md). This is the contract that
SRD data, the private content pack and in-app homebrew write against. It is versioned; the
engine accepts exactly the versions it declares.

## 1. Shape

```ts
interface Mechanic {
  schema: 1;
  id: MechanicId; // "srd:spell:hunters-mark" | "pack:feature:paladin-vow-of-enmity"
  // | "homebrew:<uid>:<slug>" | "monster:goblin:scimitar"
  source: "srd" | "pack" | "homebrew" | "monster";
  passive?: Grant[]; // the existing 127-kind Grant union, unchanged (src/lib/grant-schema.ts)
  active?: Program[];
}

interface Program {
  id: string; // unique within the mechanic
  trigger: Trigger;
  cost?: Cost[];
  targets?: TargetSpec;
  inputs?: Input[];
  steps: Step[]; // ordered; each gated by `when`
}
```

### 1.1 Triggers

```ts
type Trigger =
  | {
      kind: "invocation";
      economy: "action" | "bonus" | "reaction" | "free" | "legendary" | "none";
      castingTime?: { minutes: number };
    }
  | {
      kind: "event";
      event: EventSelector;
      scope: "self" | "controlled" | "others" | "any";
      window?: boolean;
    }; // true = needs a decision/die; false = automatic

type EventSelector =
  | { kind: "turn-start" | "turn-end" | "round-start" }
  | {
      kind: "attack-declared" | "attack-resolved";
      target?: "self" | "any";
      outcome?: Outcome;
    }
  | { kind: "cast-declared"; within?: RangeBand }
  | { kind: "save-resolved"; outcome?: "fail" | "success" }
  | { kind: "damage-taken"; of?: "self" | "controlled"; type?: DamageType }
  | { kind: "hp-zero"; of: "self" | "controlled" | { markedBy: "self" } | "any" }
  | { kind: "effect-ended" | "concentration-ended"; source?: "self" }
  | { kind: "entity-left-reach"; of: "self" }
  | { kind: "rest-completed"; rest: "short" | "long" }
  | { kind: "day-phase"; phase: "dawn" | "dusk" }
  | { kind: "manual"; label: LabelId }; // a table-declared event (homebrew escape hatch)
```

### 1.2 Costs (closed union; a costed program cannot commit unpaid)

```ts
type Cost =
  | {
      kind: "slot";
      level: number;
      upcast?: boolean;
      pool?: "standard" | "pact" | "either";
    }
  | {
      kind: "resource";
      id: ResourceId;
      amount: number | { byLevel: Record<number, number> };
    }
  | { kind: "item-charge"; amount: number } // resolved against the invoking item instance
  | {
      kind: "turn";
      claim: "action" | "bonus" | "reaction" | "attack" | "free" | "legendary";
      uses?: number;
    }
  | { kind: "concentration" }
  | { kind: "recharge" } // spent until a d6 ≥ threshold at turn start
  | { kind: "hit-dice"; count: number };
```

### 1.3 Targets and inputs

```ts
interface TargetSpec {
  count: number | { max: number } | "area"; // "area" = declared membership list
  eligibility: Predicate; // over the candidate entity and relations
  self?: boolean;
}

type Input =
  | {
      id: string;
      kind: "d20";
      for: "attack" | "save" | "check" | "death-save" | "initiative" | "concentration";
      ability?: Ability;
      perTarget?: boolean;
    }
  | { id: string; kind: "dice"; formula: DiceFormula; perTarget?: boolean } // e.g. "1d6", "8d6", "{level}d8"
  | { id: string; kind: "choice"; options: LabelId[] }
  | { id: string; kind: "damage-type"; options: DamageType[] }
  | { id: string; kind: "integer"; min: number; max: number }
  | { id: string; kind: "declare"; relation: Relation["kind"] } // a tactical fact
  | { id: string; kind: "table"; label: LabelId }; // a ruling
```

For a `table` entity (solo play), a `d20` input for the target's roll accepts either a face or a
declared outcome (`hit`/`miss`/`fail`/`success`), because the table owns that creature.

A `d20` or `dice` input is answered by the id of a `roll` action already in the log
(`answers[input.id] = { roll: ActionId }`, ADR-0010); the reducer reads the roll's total from
`state.rolls`. The formula of a `dice` input uses the seam's grammar (`NdS`, `kh`/`kl`, signed
integers; `{level}` is substituted by the client before the roll).

### 1.4 Steps (closed union; every kind has a reducer handler, enforced by `assertNever`)

```ts
type Step = { id: string; when?: Predicate } & (
  | {
      kind: "attack";
      ability?: Ability;
      bonus?: Expr;
      damage: DamagePart[];
      reach?: RangeBand;
    }
  | {
      kind: "save";
      ability: Ability;
      dc: Expr | "spell";
      onSuccess: "half" | "negate" | "none";
    }
  | { kind: "damage"; parts: DamagePart[]; to: TargetRef }
  | { kind: "heal"; amount: Expr; to: TargetRef; maxHpDelta?: Expr }
  | { kind: "temp-hp"; amount: Expr; to: TargetRef; lifetime?: Lifetime }
  | { kind: "effect-start"; effect: EffectTemplate }
  | { kind: "effect-end"; select: EffectSelector }
  | {
      kind: "condition";
      id: ConditionId;
      to: TargetRef;
      lifetime: Lifetime;
      repeatSave?: { ability: Ability; at: "turn-end" | "turn-start" };
    }
  | { kind: "resource"; id: ResourceId; delta: Expr; to: TargetRef }
  | { kind: "move-mark"; from: TargetRef; to: TargetRef }
  | { kind: "declare"; relation: RelationTemplate }
  | { kind: "turn-claim"; claim: Cost & { kind: "turn" }; key?: string } // once-per-turn gates
  | {
      kind: "summon";
      template: EntityTemplate;
      count: Expr;
      bond: "concentration" | "effect" | "none";
    }
  | { kind: "dismiss"; select: EntitySelector }
  | {
      kind: "transform";
      statline: StatlineRef;
      keep: ("hp" | "mind")[];
      lifetime: Lifetime;
    }
  | { kind: "negate"; target: "declared-action" } // Counterspell, Shield's miss
  | { kind: "register"; name: string; value: Expr }
  | { kind: "manual-table"; label: LabelId } // honest residual
  | { kind: "end-program" }
);

interface EffectTemplate {
  kind: "standing" | "mark" | "aura" | "bond" | "ready";
  to: TargetRef; // "$target" | "$self" | "$event.entity" | "encounter"
  lifetime: Lifetime; // see design §2.4; may be `byLevel`
  concentration?: boolean;
  grants?: Grant[]; // passive facts while the effect lasts
  riders?: Rider[]; // e.g. { dice:"1d6", type:"force", on:"weapon-hit", vs:{ mark:"self" } }
  endsOn?: EventSelector[];
}
```

### 1.5 Predicates and expressions (closed, pure, locale-free)

```ts
type Predicate =
  | { outcome: Outcome; of?: string }                          // hit | crit | miss | save-fail | save-success
  | { answer: string; equals: string | number | boolean }
  | { relation: Relation["kind"]; between: ["$self" | "$target" | "$event.entity", …]; value?: unknown }
  | { condition: ConditionId; on: TargetRef; present: boolean }
  | { hp: TargetRef; op: "<=" | "<" | ">=" | ">"; value: Expr | "half-max" }
  | { entityKind: Entity["kind"][]; of: TargetRef }
  | { weapon: { property?: WeaponProperty[]; kind?: "melee" | "ranged" } }
  | { advantage: TargetRef } | { disadvantage: TargetRef }
  | { all: Predicate[] } | { any: Predicate[] } | { not: Predicate };

type Expr = number | { byLevel: Record<number, number> } | { ability: Ability } | { pb: true }
          | { stat: "spellSaveDc" | "spellAttack" | "level" | "classLevel"; class?: string }
          | { sum: Expr[] } | { mul: [Expr, number] } | { max: Expr[] } | { register: string };
```

## 2. Versioning and validation

- `Mechanic.schema` is an integer; the engine exports `MECHANIC_SCHEMA_VERSIONS = [1]`. A future
  version adds kinds; the conformer for an old version stays until every catalogue entry is
  migrated by a script (golden rule 10), then is deleted.
- `conformMechanic(value): Ok<Mechanic> | Err<{ path: string; rule: string; message: LabelId }>` —
  an exact-schema (`src/lib/exact-schema.ts`) parse followed by semantic rules with ids
  (`targets-required-by-step`, `input-referenced-by-when`, `lifetime-reachable`,
  `cost-claim-matches-trigger`, `mark-requires-target`, `once-per-turn-needs-key`,
  `summon-needs-template`, …). Never a bare `null`.
- Catalogue load conforms every mechanic (public, pack, homebrew) and the coverage guard fails
  on any `Err`; the in-app homebrew editor shows `path` + `message` inline.
- Content ids are opaque to the engine: no predicate, step or cost references a mechanic id
  other than through `$self`/`$target`/`$event` bindings and `source: self` selectors.

## 3. Worked example — Hunter's Mark (SRD) and Vow of Enmity (pack)

```ts
export const huntersMark: Mechanic = {
  schema: 1,
  id: "srd:spell:hunters-mark",
  source: "srd",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "bonus" },
      cost: [{ kind: "slot", level: 1, upcast: true }, { kind: "concentration" }],
      targets: {
        count: 1,
        eligibility: {
          all: [{ relation: "visible", between: ["$self", "$target"], value: true }],
        },
      },
      steps: [
        {
          id: "mark",
          kind: "effect-start",
          effect: {
            kind: "mark",
            to: "$target",
            concentration: true,
            lifetime: {
              kind: "seconds",
              remaining: { byLevel: { 1: 3600, 3: 28800, 5: 86400 } },
            },
            riders: [
              { dice: "1d6", type: "force", on: "weapon-hit", vs: { mark: "self" } },
            ],
          },
        },
      ],
    },
    {
      id: "move",
      trigger: {
        kind: "event",
        event: { kind: "hp-zero", of: { markedBy: "self" } },
        scope: "self",
        window: true,
      },
      cost: [{ kind: "turn", claim: "bonus" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      steps: [{ id: "move", kind: "move-mark", from: "$event.entity", to: "$target" }],
    },
  ],
};
```

Twenty-two lines of data, two programs, seven kinds. The rider reaches every weapon attack through
the reducer's rider scan (design §7.1); the per-hit 1d6 is a physical input; the upcast lifetime is
`byLevel`; a short rest advances time and the lifetime decides survival; moving the mark is an
event-triggered window with a bonus-action cost. No engine file names the spell.

The content pack's Vow of Enmity differs only in data (`cost: [{kind:"resource", id:"channel-divinity", amount:1}]`,
`lifetime: { kind: "rounds", remaining: 10 }`, `endsOn: [{ kind: "hp-zero", of: { markedBy: "self" } }]`,
`grants: [{ type: "advantage-on", on: "attack", vs: { mark: "self" } }]`, and a `move` program with
`cost: [{ kind: "turn", claim: "free" }]`). Zero engine changes, zero engine knowledge of the id; the
`"vowed"` scope word and its i18n keys are deleted.

## 4. Monster stat blocks

A pure adapter `monsterMechanics(block: MonsterStatBlock): Mechanic[]` maps the existing structured
entries: `attack` → `{ kind: "attack", bonus: toHit, damage }`, `save` → `{ kind: "save", dc, onSuccess }`,
Multiattack → one program with the block's attack steps, `recharge: N` → `cost: [{ kind: "recharge" }]`
with threshold N, `legendary.uses` → a per-round resource and `trigger: event turn-end scope others`,
traits with structured triggers → event programs, prose-only entries → `manual-table`. The
adapter is the only place that understands `MonsterEntry`; its output is ordinary data.

## 5. Authoring ergonomics (what a mistake looks like)

| Mistake                                                                                    | Surfaces as                                                           |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| unknown key, wrong enum, missing field                                                     | exact-schema `Err` with JSON path at catalogue load and in the editor |
| a `when` referencing an input the program never asks                                       | `input-referenced-by-when` rule, path to the step                     |
| an effect whose lifetime can never end                                                     | `lifetime-reachable` rule                                             |
| a costed program with a trigger that cannot pay (e.g. reaction cost on a non-window event) | `cost-claim-matches-trigger`                                          |
| a step kind the reducer does not handle                                                    | TypeScript compile error (`assertNever`)                              |
| a mechanic whose every step is `manual-table`                                              | coverage JSON shows it as `table`, never as automated                 |

## 6. Vocabulary tiers (2026-09-03)

Bounded to what the acceptance stories need (`PRODUCT.md` §Steering; design §4/§7). A `later`
kind is declared in the closed unions, conforms as `unsupported` with a path, and gains its
reducer handler in the stage that first needs it.

| Kind family | Stage 3 (Marco's first turn, Sara's ogre ambush)                                                                                                    | Later                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Triggers    | `invocation` (action, bonus, reaction); `event: entity-left-reach` (opportunity attack)                                                             | other events (`attack-declared`, `cast-declared`, `hp-zero`, …)   |
| Costs       | `turn` claims, `slot` (with upcast), `resource`                                                                                                     | `recharge`, `legendary`                                           |
| Inputs      | `d20` (attack, save, initiative, concentration), `dice`, `choice`, `damage-type`, `declare`                                                         | `integer`, `table` rulings                                        |
| Steps       | `attack`, `save`, `damage`, `heal`, `effect-start`, `condition`, `move-mark`, `turn-claim`, `negate`, `manual-table`, `move`                        | `summon`, `transform`, `aura`, `ready`                            |
| Lifetimes   | `manual`, `turn-edge`, `rounds`, `seconds`, `rest`                                                                                                  | `day-phase`                                                       |
| Adapter     | monster stat blocks → `Mechanic` for `attack` entries and damage-carrying `save` entries; every other entry (Multiattack included) → `manual-table` | structured Multiattack, Recharge, Legendary Actions, lair bonuses |

Stage 3 also added area targeting (`TargetSpec.count: "area"`, an `AreaShapeSpec` parametrized by
`position`-kind inputs, resolved against stage 2's `areaMembership`) and the monster adapter
(`monsterMechanics`, `src/lib/combat/monster-adapter.ts`): `block.actions`' `attack` entries and
`save` entries **with damage parts** automate; effect-only saves, `onSuccess: "special"`, use-time
damage choices, `narrative` entries (Multiattack included, since the corpus carries no structured
attack count for it) and `spellcasting` all degrade to `manual-table`. `traits`, `reactions`,
`legendaryActions` and `recharge`/`legendary` costs stay `later`.

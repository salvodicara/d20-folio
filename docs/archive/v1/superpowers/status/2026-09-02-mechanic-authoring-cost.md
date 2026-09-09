# §4.4 Authoring cost — one mechanic, three formats

Mechanic under test: **Hunter's Mark** (SRD 5.2.1, L1 Divination, Bonus Action, Concentration ≤ 1 h;
upcast 3rd/4th → 8 h, 5th+ → 24 h; +1d6 Force on each weapon-attack hit vs the marked creature; on
the mark's 0 HP the caster may Bonus-Action move the mark; survives a short rest only while the
remaining duration allows). Pack twin: **Vow of Enmity** (Oath of Vengeance Channel Divinity, non-SRD,
must be authored from `content-pack/` with zero engine changes and zero engine knowledge of the id).

All paths are relative to
`/Users/salvatoredicara/Workspace/d20-folio/.claude/worktrees/d20-folio-combat-arch-db1941`. Note:
the `content-pack/` symlink is absent in this worktree, so the pack side is described against the
public seam types (`src/data/pack-types.ts`, `src/data/pack-empty.ts`) rather than the pack's own
files.

---

## A. Legacy `Grant` + `SrdSpellData` (what ships today)

### A.1 Schema facts read

- `SrdSpellData` — `src/data/types.ts:876`; `grants?: ReadonlyArray<Grant>` at `:1183`;
  `resolveOnCast?: false` at `:1067`; `targeting?: CombatTargeting` at `:889`; `concentration` at
  `:963`; `mechanicsProgram?` at `:923`.
- `SrdActionDef` — `src/data/types.ts:1313`. Relevant members: `type: ActionType` `:1328`,
  `maintainsActiveKey?` `:1353`, `trackerCost?` `:1404`, `costTracker?` `:1410`,
  `costTrackerOverride?` `:1422`, `conditionApplication?` `:1459`, `targeting?` `:1461`,
  `targetMark?: { scope: "marked" | "cursed" | "vowed"; maxRounds?: number }` `:1462-1465`.
  **There is no `activatesKey`, `economy`, `duration.byCastLevel` or `endsEarlyOn` on
  `SrdActionDef`**: the activation key is derived from the owning feature's `while-active` grant
  (`src/lib/smart-tracker.ts:5198-5215`), `endsEarlyOn` lives on the `while-active` duration
  (`src/lib/grant-schema.ts:1905`, e.g. `src/data/classes/barbarian.ts:159`), and `economyCategory`
  (`types.ts:1330`) is a category tag, not an economy contract.
- `while-active` grant — `src/lib/grant-schema.ts:1814-1919`. Required: `activeKey`, `grants[]`,
  `type`. Optional: `activation` (items only), `afterEffect`, `duration` (one of `maintained`
  `:1881-1888` | `timed` `:1890-1905` with `minutes`, optional `byCastLevel[{maxRounds,minLevel,minutes}]`,
  `endsEarlyOn: string[]`, `maxRounds` | `turn-boundary` `:1906-1910`), `label`, `minLevel`,
  `recipient: "caster"|"selected"` `:1918`, `targetScope: "marked"|"cursed"` `:1919`.
- `damage-rider` grant — `src/lib/grant-schema.ts:1180-1237` (first variant). Required: `appliesTo`
  (`melee-weapon|weapon|weapon-or-unarmed|unarmed|finesse-or-ranged-weapon|one-handed-melee|attack-or-spell`),
  `damageType`, `type`. Optional: `addAbilityMod`, `amount`, `dice`, `diceByLevel`, `oncePerTurn`,
  `requiresRiderTrackerId`, `resourceCost`, `round1`, `vsMarkedTarget: "marked"|"cursed"` `:1235`.
- `advantage-on` (attack variant) — `src/lib/grant-schema.ts:1636-1650`: `rollType: "attack"`,
  `scope` ∈ `strength|all|marked|cursed|vowed|missed|untaken|strDex|sorcery` (`:1645` = `vowed`),
  `vs: string`; optional `description`, `round1`, `suppressedByConditions`.
- `weapon-damage-bonus` — `src/lib/grant-schema.ts:836-851` (`scope`, optional `amount|"PB"`,
  `sourceKey`). Not needed here (it is a flat bonus, not a die).
- Grant kind count: 127 top-level keys in `GRANT_SCHEMA` (`grep -c` of the discriminated-union
  keys in `src/lib/grant-schema.ts`).
- Duration helper: `timedSpellDuration(minutes, byCastLevel?)` — `src/data/spells/duration.ts:13-30`
  derives `maxRounds = minutes*10` so rounds and minutes cannot drift.

### A.2 How the current Hunter's Mark data becomes runtime

`src/data/spells/level1.ts:600-645` (the literal is reproduced below). Pipeline:

1. `evaluateGrants` — `src/lib/grants.ts:3484-3514` — a `while-active` block is a toggle keyed by
   `activeKey`; while lit, inner grants apply; the `damage-rider` lands in `damageRiders`
   with `vsMarkedTarget` (test `tests/unit/marked-target-rider.test.ts:87-95`).
2. `resolveActions` (spell path) — `src/lib/smart-tracker.ts:6271-6300` — every `while-active` on
   a spell yields `spellActivatesKey` and, because `g.targetScope !== undefined`, a `standingEffect`
   `{ sourceId, activeKey, markScope: g.targetScope, targetAffinity, maxRounds }`.
3. `combat-resolution.ts:231-239` turns `standingEffect.markScope` into a persisted
   `ActiveCombatEffect` payload `{ kind: "target-mark", activeKey, scope }`
   (`src/types/combat-effect.ts:78-83`; read-validated at `src/lib/combat-effect-io.ts:63-66`).
4. Weapon rows: `resolveAttackDamageRiders` `src/lib/smart-tracker.ts:3696-3760` carries
   `vsMarkedTarget` to the chip; spell-attack rows: `resolveSpellAttackMarkedRiders` `:3779-3800`,
   wired at `:6118-6132`. The chip is **display-only**, player-applied on the right hit.
5. The engine-cast path projects the world's `active-key` standing back into the same key set
   (`src/lib/world-standing-grants.ts:77-91`, `:194-198`), so an engine cast lights the same
   legacy rider.

### A.3 The complete Hunter's Mark literal (format A)

```ts
// src/data/spells/level1.ts (existing, comments stripped) — 34 lines of data
{
  id: "hunters-mark",
  level: 1,
  school: "divination",
  classes: ["ranger"],
  castingTime: "bonus action",
  ritual: false,
  components: { v: true, s: false, m: false },
  concentration: true,
  damageType: "force",
  damageDice: "1d6",
  resolveOnCast: false,
  targeting: { affinity: "enemy", maxTargets: 1 },
  grants: [
    {
      type: "while-active",
      activeKey: "spell-hunters-mark",
      duration: timedSpellDuration(60, [
        { minLevel: 3, minutes: 480 },
        { minLevel: 5, minutes: 1_440 },
      ]),
      targetScope: "marked",
      grants: [
        {
          type: "damage-rider",
          dice: "1d6",
          damageType: "force",
          appliesTo: "weapon",
          vsMarkedTarget: "marked",
        },
      ],
    },
  ],
  source: "SRD",
}
```

Counts: **34 lines of data**; **2 grant kinds** (`while-active`, `damage-rider`) + **19 distinct
fields** (`id level school classes castingTime ritual components concentration damageType damageDice
resolveOnCast targeting source` + `activeKey duration targetScope grants` + `dice damageType appliesTo
vsMarkedTarget`, counting `damageType` once). Plus 2 i18n catalogue entries (EN/IT
`src/i18n/*/srd/spells.json`, not counted).

What it does **not** express (declared narrative in the data comment, `level1.ts:610-621`):

- move-the-mark on 0 HP (no primitive: `SrdActionDef` has `maintainsActiveKey` for re-extend but
  nothing that re-targets a standing without re-paying; a re-cast would spend a slot).
- short-rest survival — `timed.minutes` + `maxRounds` are rounds/minutes ledgers; a rest is not a
  clock event on the legacy ledger (`world-standing-grants.ts:189-192` — the legacy expiry sweep
  owns rest/trigger expiry only for legacy chips; no `rest` clause on `timed`).
- RAW's "any attack roll" is split: `appliesTo: "weapon"` for weapon rows plus a second read of the
  same flag for spell attacks (`smart-tracker.ts:3779-3800`), i.e. **one engine seam exists solely
  for this pair**.

### A.4 Engine/UI files that must "know" the mechanic

Content-id branches (`"hunters-mark"` / `"hex"`) in `src/lib`, `src/features`, `src/stores`:
**0** (the only hits are scenario data in `src/lib/dev-scenarios.ts:1135,1239,1264`, not branches).

Scope-word branches (the closed literal union `"marked" | "cursed" | "vowed"`) — the real coupling:

| #   | File:line                                                                                  | What it hardcodes                              |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 1   | `src/lib/grant-schema.ts:1235`, `:1292`                                                    | `vsMarkedTarget` union                         |
| 2   | `src/lib/grant-schema.ts:1643-1645`, `:1707-1709`                                          | attack-advantage `scope` union incl. `vowed`   |
| 3   | `src/lib/grant-schema.ts:1919`                                                             | `while-active.targetScope` union (no `vowed`)  |
| 4   | `src/lib/grants.ts:66-79`                                                                  | `ATTACK_CLAUSE_SCOPES` + `MarkedTargetScope`   |
| 5   | `src/data/types.ts:1463`                                                                   | `SrdActionDef.targetMark.scope`                |
| 6   | `src/types/combat-effect.ts:82`                                                            | persisted `target-mark` payload scope          |
| 7   | `src/lib/combat-effect-io.ts:64-66`                                                        | read-boundary validation of the same           |
| 8   | `src/lib/smart-tracker.ts:777`, `:1104`                                                    | `markScope`, `vsMarkedTarget` on resolved rows |
| 9   | `src/features/character/center/CombatResolver.tsx:152`, `:221-225`, `:370-374`, `:657-661` | `markScopes` collection + scope reach          |
| 10  | `src/features/character/center/tabs/PlayTab.tsx:231-243`                                   | scoped clause rendering                        |
| 11  | `src/i18n/{en,it}/ui/combat.json:32`, `:373-375`                                           | `resolveTargetMark_*`, `attackScope_*`         |

Hunter's Mark itself needs **0** engine files changed today because those 11 seams already exist.
A _new_ scope word ("sworn", "quarry") would touch all 11.

### A.5 The pack twin — Vow of Enmity in format A

Authored as an `SrdClassFeatureData` entry in the pack's `packClassFeatures`
(`src/data/pack-empty.ts:62`; merged at `src/data/classes.ts:58-70`), under a pack subclass in
`packSubclasses` (`pack-empty.ts:63`, `classes.ts:28-35`). The Channel Divinity pool is the public
`paladin-channel-divinity` tracker (`src/data/classes/paladin.ts:238-250`; existing CD actions pay it
via `costTracker`, `:293`, `:394`).

```ts
// content-pack: Oath of Vengeance, level 3 — 30 lines of data
{
  id: "paladin-vengeance-vow-of-enmity",
  class: "paladin",
  subclass: "oath-of-vengeance",
  level: 3,
  grants: [
    {
      type: "while-active",
      activeKey: "paladin-vengeance-vow-of-enmity",
      duration: { kind: "timed", minutes: 1, maxRounds: 10 },
      grants: [
        {
          type: "advantage-on",
          rollType: "attack",
          vs: "vow-of-enmity-target",
          scope: "vowed",
        },
      ],
    },
  ],
  mechanics: {
    actions: [
      {
        type: "bonus",
        costTracker: "paladin-channel-divinity",
        targeting: { affinity: "enemy", maxTargets: 1 },
        targetMark: { scope: "vowed", maxRounds: 10 },
      },
    ],
  },
  source: "PHB",
}
```

Shape precedents: Rage (`barbarian.ts:139-212`: feature `while-active` + a `bonus` action lights it
via `smart-tracker.ts:5198-5215`), Precise Hunter (`ranger.ts:303-306`: `advantage-on` attack with
`scope: "marked"`), the feature-action `targetMark` → `standingEffect` seam
(`smart-tracker.ts:5458-5470`). Engine files changed: **0**; engine knowledge of the id: **0**.
Caveat: it is zero only because `"vowed"` is pre-seeded in the 11 public seams above (an engine
that already knows a non-SRD mechanic's scope word and ships `attackScope_vowed` strings in the
public locale, `combat.json:375`). "Until it drops to 0 HP / transfer as a free action" is not
expressible (same gap as Hunter's Mark); the 1-minute end is a rounds ledger (`maxRounds: 10`).

---

## B. `MechanicsProgram` (hand-authored `mechanicsProgram` field)

### B.1 Schema facts read

`src/lib/mechanics-program-authoring-schema.ts` (964 lines):

- `MECHANICS_PROGRAM_SCHEMA` `:925-936` — required `id`, `phases[≥1]`, `registers[]`, `version`;
  optional `lifetime: LifetimeSpec[≥1]`. Phase `:917-922`: `inputs[]`, `phaseId`, `steps[]`,
  `trigger`.
- `PHASE_TRIGGER_SCHEMA` `:501-548` — 12 kinds: `invocation`, `turn-boundary`, `resource-depleted`,
  `hit-points-zero {target: ROLE}` `:512-515`, `damage-taken`, `rest-completed`, `day-phase`,
  `source-end`, `program-phase-end`, `area-boundary`, `manual-table-event {eventId}` `:540-543`,
  `root-pulse {eventId}` `:544-547`.
- `LIFETIME_SPEC_SCHEMA` `:551-581` — 9 kinds: `manual`, `source-end`, `program-phase-end`,
  `combat-end`, `duration {seconds: IntegerExpression}` `:559-562`, `turn-boundary`,
  `rest-completed {combatant, rest}` `:569-573`, `day-phase`, `temporary-hit-points-empty`.
- `STANDING_FACT_TEMPLATE_SCHEMA` `:584-627` — 9 kinds: `active-key`, `condition-immunity`,
  `damage-defense`, `damage-transfer`, `grant-group`, `max-hp-delta`, `program-fact`,
  `target-mark {markId, marked: EntitySelector}` `:617-621`, `zero-hp-floor`. **No damage-rider /
  attack-modifier fact kind exists.**
- `MECHANICS_STEP_SCHEMA` `:715-909` — 24 kinds; used here: `register` `:873-891`, `standing`
  `:773-780` (`fact`, `lifetime|null`, `operation: start|end`, `target`), `concentration`
  `:781-786`, `turn-claim` `:867-872` with `TURN_CLAIM_SCHEMA` `:696-708` →
  `claim-bonus-action` (`src/types/turn-economy.ts:396-415`: `bonusAction: {kind:"action",
requirementId}`, `claimId`), `end-program` `:892-895`.
- `MECHANICS_INPUT_SCHEMA` `:394-498` — `entities` `:395-406`, `resource` `:488-492`.
- `MECHANICS_PREDICATE_SCHEMA` `:189-319` — 24 kinds incl. `entity-hit-points` `:243-249`,
  `standing-present` `:281-287`, `answer-entity-count` `:213-218`.
- Roles: `RESOURCE_OWNER_ROLE_SCHEMA` `src/types/resource.ts:142-150` —
  `owner|source|target|caster|activator|triggering-attacker|victim`.
- Integer expressions: `src/types/integer-expression.ts:19-50` — `fixed`, `binding`, `add`,
  `multiply`, `divide`, `min`, `max`.

`src/lib/mechanics-program-authoring.ts` (conformance):

- `conformMechanicsProgram` `:944-949` returns **`null`** on any structural or semantic failure —
  no reason is reported.
- Exactly one `invocation` phase `:603`; unique phase/register/input/step ids and no input↔step id
  collision `:604-605`, `:625-634`; bounds `:62-71` (64 phases, 512 nodes, ...).
- Root `lifetime` may not contain `source-end` or `temporary-hit-points-empty` `:612-621`.
- Phase-end DAG `:224-244`; **liveness** `:274-306`: a `program-phase-end` lifetime created in a
  phase not reachable from that phase, or reachable from a `source-end` phase, is rejected.
- Binding ids `:669-716`: only `input-total` (count-limited), `register.<id>`,
  `phase.<id>.executions`, `trigger.damage|raw-damage` (only under `damage-taken`),
  `input.<resource>.level`, `input.<integer>.value`.
- `standing/condition/concentration/polymorph`: `start ⇔ lifetime !== null` `:816-821`.
- `occurrence-end` must name a child-producing step `:824-825`; selectors must reference inputs of
  the right kind `:826-828`.

Runtime facts that bound expressibility:

- `hit-points-zero` matches only when `trigger.target` **role** resolves to a world creature at 0 HP
  (`src/lib/mechanics-program.ts:915-926`); the event is emitted only by kernel damage/reduce
  operations on a world entity (`src/lib/mechanics-execution.ts:1163-1182`).
- Every live install binds all five anchors to **self**
  (`src/lib/mechanics-world-store.ts:630, 895, 1018, 1128, 1518`; `src/lib/damage-reaction.ts:358`).
- An `entities` answer must resolve to a world entity: `self` or a present
  `document.state.entities[id]` (`src/lib/mechanics-program.ts:342-356`); documents are
  `character | shared` (`src/types/mechanics-world.ts:24-34`). A solo-play enemy is table-abstract
  (`world-standing-grants.ts:16-24`).
- The transcriber today emits for Hunter's Mark: `standing-spell-hunters-mark` (automated),
  `mark-marked` (automated), `rider-spell-hunters-mark` = **table** "player-applies-die-on-hit-by-design"
  (`src/lib/mechanics-transcription.ts:1732-1738`), upcast tiers = **table**
  "cast-level-duration-tiers" (`:1481-1488`), duration = **table**
  "no-structured-spell-duration-fact" (`:1771-1774`); confirmed in
  `docs/automation-coverage.generated.json` (entry ending at line 2094).

### B.2 Hand-authored Hunter's Mark program (format B)

Written against the schema above; precedents: Ensnaring Strike (`src/data/spells/level1.ts:1045-1360`)
and the transcriber's own emission (`mechanics-transcription.ts:1510-1547`, `:1757-1764`).

```ts
mechanicsProgram: {
  id: "spell:hunters-mark",
  version: 1,
  registers: [{ initial: 1, registerId: "cast-level" }],
  // Concentration, up to 1 h / 8 h (3rd-4th) / 24 h (5th+): 3600 + 25200·clamp01(L-2) + 57600·clamp01(L-4)
  lifetime: [
    {
      kind: "duration",
      seconds: {
        kind: "add",
        terms: [
          { kind: "fixed", value: 3600 },
          {
            kind: "multiply",
            factors: [
              { kind: "fixed", value: 25200 },
              { kind: "min", values: [
                { kind: "fixed", value: 1 },
                { kind: "max", values: [
                  { kind: "fixed", value: 0 },
                  { kind: "add", terms: [
                    { bindingId: "register.cast-level", kind: "binding" },
                    { kind: "fixed", value: -2 },
                  ] },
                ] },
              ] },
            ],
          },
          {
            kind: "multiply",
            factors: [
              { kind: "fixed", value: 57600 },
              { kind: "min", values: [
                { kind: "fixed", value: 1 },
                { kind: "max", values: [
                  { kind: "fixed", value: 0 },
                  { kind: "add", terms: [
                    { bindingId: "register.cast-level", kind: "binding" },
                    { kind: "fixed", value: -4 },
                  ] },
                ] },
              ] },
            ],
          },
        ],
      },
    },
  ],
  phases: [
    {
      phaseId: "cast",
      trigger: { kind: "invocation" },
      inputs: [
        {
          inputId: "slot",
          kind: "resource",
          term: {
            amount: { kind: "fixed", value: 1 },
            selector: {
              kind: "spell-slot",
              level: { kind: "minimum", value: 1 },
              owner: "caster",
              pool: "either",
            },
          },
          when: null,
        },
        {
          eligibility: "creature",
          inputId: "targets",
          kind: "entities",
          maximum: { kind: "fixed", value: 1 },
          minimum: { kind: "fixed", value: 1 },
          multiplicity: "slots",
          when: null,
        },
      ],
      steps: [
        {
          kind: "register",
          operation: { kind: "set-integer", value: { bindingId: "input.slot.level", kind: "binding" } },
          registerId: "cast-level",
          stepId: "record-cast-level",
          when: null,
        },
        {
          kind: "turn-claim",
          combatant: "caster",
          claim: {
            bonusAction: { kind: "action", requirementId: "spell.hunters-mark.cast" },
            claimId: "spell.hunters-mark.cast",
            kind: "claim-bonus-action",
          },
          stepId: "claim-bonus-action",
          when: null,
        },
        {
          fact: { key: "spell-hunters-mark", kind: "active-key" },
          kind: "standing",
          lifetime: { kind: "source-end" },
          operation: "start",
          stepId: "standing-spell-hunters-mark",
          target: { kind: "role", role: "caster" },
          when: null,
        },
        {
          fact: { kind: "target-mark", markId: "marked", marked: { inputId: "targets", kind: "input" } },
          kind: "standing",
          lifetime: { kind: "source-end" },
          operation: "start",
          stepId: "mark-marked",
          target: { kind: "role", role: "caster" },
          when: null,
        },
        {
          kind: "concentration",
          lifetime: { kind: "manual" },
          operation: "start",
          stepId: "hold-concentration",
          when: null,
        },
      ],
    },
    {
      // "Move the mark": the TABLE declares the marked creature fell (no trigger can name it — see B.4).
      phaseId: "mark-fell",
      trigger: { eventId: "mark-fell", kind: "manual-table-event" },
      inputs: [
        {
          eligibility: "creature",
          inputId: "new-target",
          kind: "entities",
          maximum: { kind: "fixed", value: 1 },
          minimum: { kind: "fixed", value: 0 },
          multiplicity: "slots",
          when: null,
        },
      ],
      steps: [
        {
          kind: "turn-claim",
          combatant: "caster",
          claim: {
            bonusAction: { kind: "action", requirementId: "spell.hunters-mark.move" },
            claimId: "spell.hunters-mark.move",
            kind: "claim-bonus-action",
          },
          stepId: "claim-move-bonus-action",
          when: { comparison: "gte", inputId: "new-target", kind: "answer-entity-count", value: { kind: "fixed", value: 1 } },
        },
        {
          fact: { kind: "target-mark", markId: "marked", marked: { inputId: "targets", kind: "input" } },
          kind: "standing",
          lifetime: null,
          operation: "end",
          stepId: "end-old-mark",
          target: { kind: "role", role: "caster" },
          when: { comparison: "gte", inputId: "new-target", kind: "answer-entity-count", value: { kind: "fixed", value: 1 } },
        },
        {
          fact: { kind: "target-mark", markId: "marked", marked: { inputId: "new-target", kind: "input" } },
          kind: "standing",
          lifetime: { kind: "source-end" },
          operation: "start",
          stepId: "mark-new",
          target: { kind: "role", role: "caster" },
          when: { comparison: "gte", inputId: "new-target", kind: "answer-entity-count", value: { kind: "fixed", value: 1 } },
        },
      ],
    },
  ],
},
```

Counts: **~150 lines** (≈4.4× format A); **schema kinds used: 19** (program root; triggers
`invocation`, `manual-table-event`; lifetimes `duration`, `source-end`, `manual`; inputs `resource`,
`entities`; steps `register`, `turn-claim`, `standing`, `concentration`; standing facts `active-key`,
`target-mark`; claim `claim-bonus-action`; predicate `answer-entity-count`; entity selectors `role`,
`input`; integer expressions `fixed`, `binding`, `add`, `multiply`, `min`, `max`; resource selector
`spell-slot`).

Places I could not verify by reading:

1. `end-old-mark` references `inputs.targets` from the **cast** phase inside the **mark-fell** phase.
   `selectorReferencesOfStep` is checked against `inputs` = _this phase's_ inputs
   (`mechanics-program-authoring.ts:650`, `:826-828`), so this step is **probably rejected**; the
   lawful form would need the old mark re-selected as a second `entities` input, or a `standing end`
   that matches by `markId` only — the schema requires the full `marked` selector (`:617-621`), so
   there is no "end whichever mark I hold" form. This is a real expressibility hole, not a typo.
2. Whether `lifetime.duration.seconds` bound to `register.cast-level` evaluates at root creation
   (schema comment `:933` says "the coordinator resolves it at creation"; the register is set in
   the invocation phase — ordering unverified). The transcriber deliberately does **not** do this
   (`:1468` uses `fixed(minutes*60)`, tiers stay "table").
3. Whether a root `duration` lifetime actually elapses across a **short rest** on the character
   clock (`rest-completed` lifetime exists `:569-573`, but "survive if remaining duration allows" is
   a clock question the schema cannot state; no clock-advance-on-rest read was found).

### B.3 What the engine must ALSO have for the +1d6 rider to reach a weapon attack

Nothing in the program above produces the die. The attack flow reads the **legacy** aggregate:
`evaluateGrants` (`grants.ts:3484-3514`) → `damageRiders` gated by `sessionActiveKeys`
(`world-standing-grants.ts:194-198`, which projects the program's `active-key` standing at
`:77-91`) → `resolveAttackDamageRiders` / `resolveSpellAttackMarkedRiders`
(`smart-tracker.ts:3696-3800`). So a program-only Hunter's Mark **shows no chip**; the spell must
still carry the format-A `grants` block (the transcriber says so: `rider-…` = table,
`mechanics-transcription.ts:1732-1738`). The only in-program alternative is a `root-pulse` "hit"
phase with a `damage` step on the marked `entities` input (Ensnaring Strike's pulse pattern,
`level1.ts:1180-1266`) — a table-declared event, not an attack-roll hook, and it lands only on a
modeled world entity (`mechanics-program.ts:342-356`).

Concepts a human must hold to write this (counted): program root/version/registers (1), phases and
the one-invocation rule (2), the 12 triggers and which are table-declared (3), inputs and answer
identity/`slots` multiplicity (4), expansion (needed the moment a die or d20 enters) (5), the
binding-id grammar `register.*`/`input.*.level`/`input-total` (6), standing facts vs conditions vs
concentration children (7), lifetimes and the phase-end liveness law `:274-306` (8), entity
selectors and the roles/anchors model (all-self in solo) (9), integer-expression algebra for
tiers (10), turn-claim/requirement identity coupling with the turn-economy projection
(`docs/MECHANICS.md:330-334`) (11), the predicate AST and per-phase reference rules (12), and the
legacy-grant twin the chip still needs (13). **13 concepts**, vs 4 for format A (grants, toggles,
durations, marked-target flag).

### B.4 Is "move the mark on 0 HP" expressible?

- As a **trigger**: no. `hit-points-zero.target` is a `MECHANICS_ROLE` (`schema:512-515`), roles are
  the seven anchors (`resource.ts:142-150`), every live install anchors all of them to self
  (`mechanics-world-store.ts:630` etc.), matching demands the role entity be a world creature at
  0 HP (`mechanics-program.ts:915-926`), and there is no selector form
  `{ kind: "input" }` or `{ kind: "standing", fact: target-mark }` for a trigger. The marked
  creature is an `input`, never a role.
- As a **predicate**: `entity-hit-points` on `{kind:"input"}` exists (`schema:243-249`) but returns
  `null` (unknown) when the entity is not in the world (`mechanics-program.ts:1651-1653`) — honest
  only for a modeled enemy.
- As a **table event + bonus-action claim + new target input**: yes in the schema
  (`manual-table-event` `:540-543`, `claim-bonus-action` `:696-708`, second `entities` input), with
  the cross-phase `end` problem in B.2 item 1. Net: expressible as _declared by the table_, not as
  _observed by the engine_.

### B.5 The pack twin — Vow of Enmity in format B

Authored on the pack feature's `mechanics.actions[0].mechanicsProgram` (`types.ts:1326`; served
verbatim `mechanics-transcription.ts:2234-2248`). The program would be: `resource` input on
`{ kind: "pool", owner: "caster", resourceId: "paladin-channel-divinity" }` (`:2365-2368`), one
`entities` input, `turn-claim` bonus action, `standing active-key` + `standing target-mark
{markId:"vowed"}` with `lifetime: { kind: "duration", seconds: fixed 60 }`, and a `manual-table-event`
"vow-transfer" phase (free action → no claim). ~110 lines. Engine changes: **0** for the id.
But **the Advantage never reaches an attack roll from the program**: there is no standing fact for
attack advantage (9 fact kinds, `:584-627`) and `rollRules.advantageSourceIds` are authored per
request (`src/types/d20-test.ts:96-104`), never derived from standings (no non-empty derivation in
`src/lib/mechanics-*.ts`). The feature still needs the format-A `advantage-on scope:"vowed"` grant,
and `"vowed"` must still be pre-seeded in the 11 engine seams of A.4. Same verdict as Hunter's Mark:
the program adds lifecycle/claims/mark identity, the legacy grant still carries the effect.

Failure mode: `conformMechanicsProgram` → `null` (`mechanics-program-authoring.ts:944-949`) →
`transcribeFeatureAction` emits `authored-program / unsupported / program-conformance`
(`mechanics-transcription.ts:2234-2242`) → the corpus guard fails with no reason string
(`tests/unit/mechanics-transcription.guard.test.ts:224-228`).

---

## C. K1 `RuleDefinition` / `SemanticCommand`

### C.1 What exists

- `src/types/rule-definition.ts:26-42` — exactly one kind: `resource-spend`
  `{schemaVersion:1, kind, ruleId, ruleVersion, fingerprint, provenance, resourceId, amount,
target: {kind:"actor"} | {kind:"selected-targets", min, max, candidateIds}}`.
  `RuleProvenance.kind ∈ srd|content-pack|homebrew` (`:9-13`) — the pack seam is already typed.
- `src/types/command.ts:49-73` — `SemanticCommand = UseRuleCommand | UndoReceiptCommand`;
  external requests `:109-113` (`selected-targets`, `table-geometry`, `observed-outcome`, `ruling`);
  patches `:155-165` (`set-resource` only); events `:167-178` (`resource-spent|restored`);
  `WorldState = {resources, effects}` `:41-47`.
- `src/types/effect-instance.ts:11-36` — `EffectInstance` with `duration ∈ until-revision |
until-rest | until-dismissed`; no payload beyond `ruleId/sourceId/targetId`.
- `src/lib/command/codec.ts:348-373` — `ruleDefinition()` fails `unknown-rule-kind` for anything
  but `resource-spend`; `src/lib/command/resolve-command.ts:287-335` implements only the resource
  debit and the selected-targets round-trip. `docs/MECHANICS.md:39-45`: "`Grant` remains normalized
  capability/modifier/trigger IR: it is neither a command, an active effect nor an executable rule
  language."

### C.2 What Hunter's Mark WOULD need (every `kind` below is invented — none exists)

```ts
// hypothetical — 42 lines; ~90% of the vocabulary does not exist
{
  schemaVersion: 1,
  kind: "cast-spell",                                   // MISSING (only "resource-spend")
  ruleId: "rule:v1:spell.hunters-mark", ruleVersion: 1, fingerprint: "fp:v1:…",
  provenance: { kind: "srd", sourceId: "source:v1:srd-5.2.1", sourceVersion: 1 },
  cost: { resourceId: "resource:v1:spell-slot", minLevel: 1, chosenLevel: "choice:slot" }, // MISSING slot-level choice
  economy: { kind: "bonus-action" },                    // MISSING (no turn economy in K1)
  target: { kind: "selected-targets", min: 1, max: 1, candidateIds: [] },   // exists (:19-24)
  concentration: true,                                  // MISSING
  effects: [                                            // MISSING (EffectInstance has no payload)
    {
      kind: "attack-damage-rider", dice: "1d6", damageType: "force",
      appliesTo: "any-attack", vsEffectTarget: true,    // MISSING attack hook + per-target predicate
    },
    { kind: "target-mark", markId: "marked" },          // MISSING payload kind
  ],
  duration: {                                           // MISSING: only until-revision|until-rest|until-dismissed
    kind: "elapsed-seconds", byChoice: { "choice:slot": { 1: 3600, 3: 28800, 5: 86400 } },
    survivesRest: "while-remaining",
  },
  triggers: [                                           // MISSING (no trigger vocabulary in K1)
    { on: "effect-target-hit-points-zero",
      offer: { kind: "retarget-effect", economy: { kind: "bonus-action" } } },
  ],
}
```

Missing kinds, listed: `cast-spell` (or any effect-applying rule), slot-level choice/upcast
binding, turn-economy claim, concentration, effect payloads on `EffectInstance`, an attack-roll /
damage-roll hook (K1 has no d20 or dice request — only `observed-outcome`), per-target identity in
a payload, elapsed-time duration and rest survival semantics, triggers, retarget/transfer, and the
patch/event kinds for all of the above (`CommandPatch = SetResourcePatch` only). Nothing in K1 can
carry the +1d6 to an attack row; the legacy grant would still be needed. Pack twin: provenance
`content-pack` is typed today (`rule-definition.ts:10`), so the id would be pack-side — but the same
missing vocabulary applies, plus a `channel-divinity` resource id contract.

---

## Comparison table

| Format                         | Lines of data                                              | Distinct kinds/fields                                   | Concepts to learn       | Engine files for THIS mechanic                                                               | Engine files for PACK twin (target 0)                                                                                                                              | "Move mark on 0 HP"                                                                                                                                                                                                                                                                                                               | Upcast duration surviving short rest                                                                                                                                                                                                                                        | Per-target rider reaches the attack roll                                                                                          | Verdict                                                                                                                                          |
| ------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Legacy Grant + SrdSpellData | 34 (HM) / 30 (Vow)                                         | 2 grant kinds, 19 fields (HM); 3 kinds, 16 fields (Vow) | 4                       | 0 (11 scope-word seams pre-exist; a new scope word = 11 files)                               | 0 — but only because `"vowed"` + `attackScope_vowed` are hardcoded in public engine/i18n (`grants.ts:66-79`, `combat.json:375`)                                    | No (narrative; re-cast spends a slot)                                                                                                                                                                                                                                                                                             | Upcast yes (`byCastLevel`, `grant-schema.ts:1895-1901`); rest survival no (rounds/minutes ledger, no rest clause)                                                                                                                                                           | **Yes** — display-only chip on weapon rows + a second read for spell attacks (`smart-tracker.ts:3696-3800`)                       | Cheapest and the only one that lights the chip; the marked-target model is a hand-built special case (`vsMarkedTarget`, `targetScope`, 11 seams) |
| B. MechanicsProgram            | ~150 (HM) / ~110 (Vow) + the format-A block still required | 19 schema kinds                                         | 13                      | 0 for the program; the rider still needs A's grant (`mechanics-transcription.ts:1732-1738`)  | 0 for the id; Advantage still needs A's `advantage-on scope:"vowed"` (no advantage standing fact; `advantageSourceIds` authored per request, `d20-test.ts:96-104`) | Only as a **table-declared** `manual-table-event` + `claim-bonus-action` + new `entities` input; `hit-points-zero` cannot name an input entity (`schema:512-515`, `mechanics-program.ts:915-926`, anchors all self `mechanics-world-store.ts:630`); ending the old mark cross-phase is probably rejected (`authoring.ts:826-828`) | Upcast: schema-expressible via `duration.seconds` over `register.cast-level` (`schema:559-562`), runtime unverified; transcriber keeps tiers "table" (`:1481-1488`). Rest survival: `rest-completed` lifetime exists (`:569-573`) but no clock-elapses-over-rest read found | **No** — no rider/advantage standing fact (9 kinds, `schema:584-627`); at best a table-pulsed `damage` step onto a modeled entity | Precise lifecycle/claims/mark identity at 4–5× the size, and it still does not carry the effect that matters                                     |
| C. K1 RuleDefinition           | 42 (all hypothetical)                                      | 1 real kind (`resource-spend`); ~10 invented            | n/a (vocabulary absent) | codec + resolver + types would all change (`codec.ts:348-373`, `resolve-command.ts:287-335`) | provenance `content-pack` typed (`rule-definition.ts:10`); everything else missing                                                                                 | No                                                                                                                                                                                                                                                                                                                                | No                                                                                                                                                                                                                                                                          | No                                                                                                                                | Not an authoring format today; a resource-debit kernel with a target round-trip                                                                  |

---

## Ergonomics critique (one owner, agent-assisted)

**A. Legacy Grant.**

- A mistake looks like: a **TypeScript compile error** for a wrong field on a typed array literal
  (`SrdSpellData[]`, `grants: Grant[]`, `types.ts:1183`), or a **conformance rejection** at the
  persistence/test boundary — `conformGrant` (`grants.ts:113-116`) over the exact-object schema
  rejects unknown keys (`src/lib/exact-schema.ts:498-510`) and the corpus sweep test
  (`tests/unit/grant-conformer.test.ts:154`) conforms "the complete composed SRD and pack corpus".
  The dangerous class is the **silent no-op**: a valid `while-active` whose `activeKey` never gets
  lit (a feature without a `bonus` action, `smart-tracker.ts:5198-5215`), a `damage-rider` with
  `appliesTo: "weapon"` that never shows on a spell attack unless `vsMarkedTarget` is set
  (`:3787`), or `targetScope` omitted so no `target-mark` effect is created (`:6275`) — all
  schema-valid, all invisible until someone opens the combat card.
- A validation tool would need: a "reachability" check that every `activeKey` has an activator
  (action, cast path, or item activation), that every `vsMarkedTarget` rider sits under a
  `while-active` with a matching `targetScope`, that every attack `scope` word has both
  `attackScope_*` i18n keys in EN and IT, and a golden "resolved combat card" snapshot per spell
  (the marked-target test does this by hand, `tests/unit/marked-target-rider.test.ts`).

**B. MechanicsProgram.**

- A mistake looks like: **`null`** from `conformMechanicsProgram` (`authoring.ts:944-949`) with
  no location or reason, surfacing as an `unsupported / program-conformance` clause
  (`mechanics-transcription.ts:446-454`, `:2234-2242`) and a guard-test failure
  (`guard.test.ts:224-228`). Roughly 60 boolean rules are `||`-chained in `programSemantics`
  (`:599-941`), so a wrong `cardinality`, a cross-phase selector, a `start` with `lifetime: null`, or
  a liveness violation all collapse into the same `null`. Silent no-ops also exist: a phase on a
  `manual-table-event` nobody ever signals, or a `duration` expression that evaluates against an
  unset register.
- A validation tool would need: a **diagnostic conformer** that returns the failing rule id and
  JSON path (the exact-schema layer already knows the path; `programSemantics` discards it), a
  per-phase input/selector scope report, and a dry-run of the program against a fixture world that
  prints the answer requirements per phase (the `drive()` harness in
  `tests/unit/mechanics-authored-programs.test.ts:240-262` is the seed of this).

**C. K1 RuleDefinition.**

- A mistake looks like: a **codec rejection** with a typed reason (`RejectionReason`,
  `command.ts:208-232`: `unknown-rule-kind`, `unknown-field`, `rule-fingerprint-mismatch`, ...) —
  by far the best error surface of the three, because every rule is versioned, fingerprinted and
  exact. But the vocabulary is one kind wide, so for this mechanic the "mistake" is that nothing
  can be written at all.
- A validation tool would need: nothing new for shape (the codec is it); the cost is entirely in
  growing the rule language, and each new kind needs codec + resolver + patch/event/inverse pairs
  - the Functions golden-bytes contract (`docs/MECHANICS.md:47-54`).

**Bottom line for the owner.** Today the effect that a player actually sees (the "+1d6 Force vs
marked target" chip, the "Adv. vs vowed target" line) is carried **only** by format A, through a
hand-built marked-target special case (`vsMarkedTarget` + `targetScope` + `targetMark` + 11 engine
seams with a closed `marked|cursed|vowed` union). Format B adds exact lifetime, mark identity and
bonus-action claims at ~4.5× the authoring size and 3× the concepts, but has no fact kind that
reaches an attack or damage roll, cannot observe the marked creature's death, and reports failure
as `null`. Format C is a resource kernel. The cheapest structural win visible from this audit is
not a new format but closing the scope-word leak in A (an open `markId: string` in the 11 seams
instead of the closed union) and giving B a diagnostic conformer.

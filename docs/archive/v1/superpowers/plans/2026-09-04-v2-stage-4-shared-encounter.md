# Stage 4 — the shared encounter document — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the stage-3 encounter log in Firestore at `campaigns/{id}/encounters/{eid}` so two
clients (DM and player) fold the same document to the same state, with the lease actions, the
codec, compaction, and `firestore.rules` reduced to identity, membership, ownership and shape.

**Architecture:** The pure reducer (`src/lib/combat`) stays pure and gains only data: three lease
table ops (`join`, `leave`, `sync`), per-target roll attribution, and an HP override that couples
to the same 0-HP consequences damage has. Persistence is one closed-world codec
(`src/lib/combat/codec.ts`, `exact-schema`, unknown top-level keys preserved), one pure compaction
helper (`src/lib/combat/checkpoint.ts`), and one thin Firestore adapter (`src/lib/combat-io.ts`)
that takes a `Firestore` instance explicitly, so the same functions run on the emulator under two
authenticated contexts and in the app against `@/lib/firebase`'s `db`. Appending is
`updateDoc(ref, { log: arrayUnion(action) })`; subscribing is one `onSnapshot` per client;
compaction is a transaction with a precondition on the previous checkpoint. The rules drop every
predicate that reads a game field; the reducer enforces legality; the table enforces manners.

**Tech Stack:** TypeScript (strict), Vitest, Firestore Web SDK v12 (`firebase/firestore`),
`@firebase/rules-unit-testing` on the Firestore emulator (Java 25 present). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5 (all four
subsections) and §3.1 (`table` op vocabulary: `join`, `leave`, `sync` are the lease),
`docs/adr/0010-dice-seam-rolls-are-log-actions.md`, `docs/adr/0011-campaign-automation-levels.md`,
`docs/PROGRAM_STATUS.md` → "`v2` — stage 3" (the six open seams) and "Owner confirmations"
(admin-supreme), `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 4 and the gate
for stages 1–4).

## Decisions taken by this plan (the seams stage 3 left open)

Each is recorded in `docs/PROGRAM_STATUS.md` by task 9 and reconciled into the spec.

1. **Per-target save rolls are attributed to the target.** A roll referenced under a per-target
   answer key `${input}:${entityId}` may carry `roller: entityId`; under a plain key the roller
   must be `null` or the intent's entity, as before. Who appends it is a client concern (the
   target's owner entering a real die, the DM for a monster, or the caster's client drawing the
   seed at `full-auto`); the fold only checks the binding. Marco's replay switches the three
   goblin saves to `roller: "goblin-N"` so the acceptance fixture exercises it. ADR-0010 gains an
   amendment.
2. **Hidden faces stay in the shared log, concealed by presenters.** ADR-0010 alternative 2
   (a DM-private document) was rejected because the fold would diverge; the owner ratified
   "written in the log, not shown to players" on 2026-09-03. Stage 4 keeps the faces in the
   document and restates the accepted risk (a member who reads the raw document sees them, like
   forged actions). The codec stores `hidden` verbatim; nothing else changes.
3. **An HP override to 0 has the consequences damage has.** `patchDirectOverride` already
   couples the life state; now the same tail `deliverDamage` runs — `hp-zero` event and the
   concentration effect ended — runs for an override that drops a creature from above 0 to 0.
   No `damage-taken` event and no concentration check: no damage was taken. An override that
   revives emits nothing. The asymmetry stage 3 recorded does not survive.
4. **`log-only` withholds `move` and declarations whole** — unchanged; the shared document only
   carries actions, and the two-client test proves both clients reach the same conclusion.
5. **Admin-supreme.** The admin has DM-level rights on every encounter document (create, append,
   checkpoint, settings, delete) and owner-level rights on every user path (`users/{uid}`,
   `characters/{id}`, `public/sheet` excluded — it is an anonymous projection with its own
   exactness invariant —, `combat/state`, `snapshots/*`, `library/*`). Membership is not
   implicit: for the party board and the hub the owner's account is added as a member of his
   group's campaign, the smaller option, matching how he plays today. Setting the owner's
   `role` to `admin` is a console action on the user document (production already grants it —
   the admin inbox works — and staging gets it when Auth is enabled); no code.
6. **Compaction keeps a grace window.** The checkpoint seq is the newest action at least
   `graceMs` (default 5 minutes) older than the newest action in the log, so an offline client
   whose queued appends carry older `seq`s is not silently dropped by a checkpoint that landed
   while it was away. An append older than the checkpoint is still skipped by the fold (§5.3);
   the window makes that rare, it does not make it impossible — recorded as an accepted limit.
7. **The lease marker is `lease`**, not `attached`: the character parent already carries
   `attachedCampaignId` (the one-campaign claim the rules read for co-member access), and a
   sibling called `attached` would read as the same fact. `lease: { campaignId, encounterId,
epoch }` is written and cleared by the owner's client only. The spec's §5.1/§5.2 wording is
   reconciled.
8. **The old campaign play surfaces become rule-denied on `v2`.** The predicates that let the
   old hub write `encounter`, `encounterInit`, `encounterSkipped`, `memberEffects`, `effectOps`,
   `world` and a peer's `combat/state` disappear now (the spec assigns them to this stage). The
   old client code that writes them dies at stage 6 with the surfaces that host it; editing
   dying surfaces to unplug them first is dead work. Two membership paths that would otherwise
   break are fixed here because they are not play: `removeMember` and `deleteCampaign` stop
   writing other users' character documents, and `attachMemberCharacter` treats a claim on a
   campaign the owner can no longer read as stale.
9. **The `checkpoint` action kind of §3.1 is not built.** The checkpoint is the document field
   `Encounter.checkpoint` the fold already consumes; a log-level marker would carry the same
   `through` twice. §3.1 is reconciled.

## Global Constraints

- `src/lib/combat` stays pure: no React/Firebase/Zustand/`@/i18n`/`@/features`/`@/components`/
  `@/stores` imports, no `Date.now`/`new Date`/`Math.random`/crypto RNG
  (`tests/unit/combat/boundary.guard.test.ts` greps every file). `@/lib/exact-schema` and
  `@/lib/strip-undefined` are pure and allowed.
- Every union stays closed; every reducer `switch` ends in `assertNever` (`ids.ts`).
- `main` is production and is never touched; every commit lands on `v2` only. No deploy, no
  release, no end-to-end spec.
- Small Conventional Commits, owner sole author (no co-author/trailer), one `.changeset/*.md`
  per commit (frontmatter `---\n---\n` then one sentence), the owning document reconciled in the
  same commit. Never `--no-verify`. The pre-commit hook runs the changeset guard and lint-staged.
- Gates before the push: `just ci`, `pnpm test:rules` (mandatory — the rules change),
  `pnpm build && pnpm test:budget`, `just ci-srd-only` (public modules change). Stage-3 baseline:
  4 min 36 s / 15.1 s / 5 s / 2 min 19 s.
- Public documents carry no product-identity term (the partition guard scans `docs/**`); the
  private twin is named by role only.
- Rules-lane files run serially against one emulator; every new emulator test seeds its own
  users and campaign in `beforeEach` after `clearFirestore()` (see
  `tests/rules/firestore-rules.test.ts`).

## File structure

| File                                                 | Responsibility                                                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/types.ts`                            | `*Action` aliases move here; `TableOp` gains `join`/`leave`/`sync`; `Encounter.unknown`                                                         |
| `src/lib/combat/answers.ts` (new)                    | `answerNumber`, `answerPosition`, `areaShapeFrom`, `AreaResolution`                                                                             |
| `src/lib/combat/override.ts` (new)                   | `applyOverride`, `patchDirectOverride`, `isLifeState`; the 0-HP tail shared with damage delivery                                                |
| `src/lib/combat/reposition.ts` (new)                 | `openLeftReachWindow`, `repositionRelations`, `applyDeclare`                                                                                    |
| `src/lib/combat/intent.ts`                           | costs, lifetimes, AC, damage delivery, the step runner, concentration, the automation gate, intents/resolve/check                               |
| `src/lib/combat/resolve.ts`                          | per-target roll attribution in `rollsUsable`                                                                                                    |
| `src/lib/combat/table.ts`                            | the three lease ops                                                                                                                             |
| `src/lib/combat/codec.ts` (new)                      | the exact schema of the persisted `Encounter` (schema 1); `parseEncounter`, `encounterWriteData`                                                |
| `src/lib/combat/checkpoint.ts` (new)                 | `shouldCompact`, `checkpointThrough`, `compact` — pure                                                                                          |
| `src/lib/combat-io.ts` (new)                         | refs, `createEncounter`, `appendAction`, `subscribeEncounter`, `checkpointEncounter`, `deleteEncounter`, the seq clock                          |
| `src/lib/combat-lease.ts` (new)                      | `joinTable`, `leaveTable`, `readLease` — the owner's client's two motions of §5.2                                                               |
| `src/features/campaigns/campaign-io.ts`              | `removeMember`/`deleteCampaign` stop detaching other users' characters; stale-claim probe in `attachMemberCharacter`                            |
| `firestore.rules`                                    | the reduced matrix                                                                                                                              |
| `tests/rules/firestore-rules.test.ts`                | the matrix rewritten                                                                                                                            |
| `tests/rules/encounter-two-clients.emulator.test.ts` | the stage gate: both replays through two clients, override and undo from each side, compaction, the lease                                       |
| `tests/unit/combat/*.test.ts`                        | new cases per task                                                                                                                              |
| docs                                                 | spec §3.1/§5, ADR-0010 amendment, `PROGRAM_STATUS.md`, stage-1 plan, `TEST_PORTFOLIO.md`, `ARCHITECTURE.md`, `CHARACTER_SCHEMA.md`, the handoff |

---

## Task 1: Split `intent.ts` (behaviour-preserving)

**Files:**

- Modify: `src/lib/combat/types.ts` (add the five `*Action` aliases)
- Create: `src/lib/combat/answers.ts`, `src/lib/combat/override.ts`, `src/lib/combat/reposition.ts`
- Modify: `src/lib/combat/intent.ts`, `src/lib/combat/resolve.ts`
- Modify: every importer of the moved names (`grep -rn "from \"@/lib/combat/intent\"\|from \"./intent\"" src tests`)

**Interfaces:**

- Produces (types.ts): `export type IntentAction = Extract<Action, { kind: "intent" }>` and the
  same for `CheckAction`, `DeclareAction`, `OverrideAction`, `ResolveAction`. `intent.ts` no
  longer exports them (no re-export alias — owner rule: no compat shims).
- Produces (answers.ts): `answerNumber(state, answers, key): number | null`,
  `answerPosition(answers, key): Position | null`, `areaShapeFrom(spec, answers): AreaResolution`,
  `type AreaResolution`.
- Produces (override.ts): `applyOverride(state, action): StepResult`, `isLifeState`,
  `patchDirectOverride`. `StepResult` stays defined in `intent.ts`; `override.ts` imports the type
  from there (a type-only cycle is fine; there is no value cycle because `intent.ts` does not
  import `override.ts`).
- Produces (reposition.ts): `openLeftReachWindow(...)`, `repositionRelations(...)`,
  `applyDeclare(state, action, catalogue): StepResult`. `intent.ts` imports `repositionRelations`
  from `./reposition` (the `move` step) — `reposition.ts` must not import `intent.ts` as a value
  (it needs `StepResult` type only and `subscribersFor` from `./windows`).

- [ ] **Step 1: Record the baseline.** `pnpm test --run tests/unit/combat` — all green; note the
      count. `wc -l src/lib/combat/intent.ts` (1216).
- [ ] **Step 2: Move the aliases** to `types.ts` under a `// ── Action views ──` heading; delete
      them from `intent.ts`; update importers (`resolve.ts` and any test).
- [ ] **Step 3: Create `answers.ts`** with `answerNumber`, `answerPosition`, `AreaResolution`,
      `areaShapeFrom` moved verbatim (keep their doc comments); `intent.ts` imports them.
- [ ] **Step 4: Create `reposition.ts`** with `openLeftReachWindow`, `repositionRelations`,
      `applyDeclare` moved verbatim; `intent.ts` imports `repositionRelations`; `resolve.ts`
      imports `applyDeclare` from `./reposition`.
- [ ] **Step 5: Create `override.ts`** with `LIFE_STATES`, `isLifeState`, `patchDirectOverride`,
      `applyOverride` moved verbatim; `resolve.ts` imports `applyOverride` from `./override`.
- [ ] **Step 6: Prove it.** `pnpm test --run tests/unit/combat` same count green;
      `pnpm typecheck`; `pnpm lint --max-warnings 0`; `wc -l src/lib/combat/*.ts` (intent.ts
      well under 1,000). No behaviour change: `git diff --stat` shows only moves and imports.
- [ ] **Step 7: Commit** with changeset `v2-intent-split.md` ("refactor(combat): split intent.ts
      into answers, override and reposition").

## Task 2: Per-target roll attribution and the override 0-HP tail

**Files:**

- Modify: `src/lib/combat/resolve.ts` (`rollsUsable`), `src/lib/combat/override.ts`,
  `src/lib/combat/intent.ts` (`deliverDamage` shares the tail)
- Modify: `tests/unit/combat/replays/marco-first-turn.json` (goblin saves `roller: "goblin-N"`)
- Test: `tests/unit/combat/resolve.roll.test.ts` (extend), `tests/unit/combat/resolve.override.test.ts` (extend)
- Modify: `docs/adr/0010-dice-seam-rolls-are-log-actions.md` (amendment)

**Interfaces:**

- Produces (override.ts): `settleZeroHp(state, entity, events): FoldedState` — ends the entity's
  concentration effect when it is at 0 HP or dead, pushing `endEffects`' events; `deliverDamage`
  calls it instead of its inline block, and `applyOverride` calls it after a `vitals.hp` patch
  that took the entity from above 0 to 0 (pushing `hp-zero` first). `applyOverride`'s receipt
  now carries `events`.

- [ ] **Step 1: Failing tests (rolls).** In `resolve.roll.test.ts` add, using the existing
      helpers: (a) a `roll` with `roller: "goblin-1"` answered under `save:goblin-1` inside the
      caster's Fireball intent is accepted (state after fold has the goblin's HP changed);
      (b) the same roll answered under `save:goblin-2` is rejected with
      `{ reason: "roll-roller-mismatch", roll, entity: <caster> }`; (c) a roll with
      `roller: "goblin-1"` under a plain key (`damage-0`) is rejected the same way.
- [ ] **Step 2: Failing tests (override).** In `resolve.override.test.ts`: (a) an entity
      concentrating on an effect, overridden `vitals.hp` → 0: the receipt's `events` contains
      `{ kind: "hp-zero", entity }` and `{ kind: "concentration-ended", … }`, the effect is gone
      and `concentration` is `null`; no `damage-taken`; (b) an override from 0 to 12 on a dying PC
      emits no events; (c) an override from 20 to 10 emits no events.
- [ ] **Step 3: Run** `pnpm test --run tests/unit/combat/resolve.roll.test.ts tests/unit/combat/resolve.override.test.ts` — the new cases fail.
- [ ] **Step 4: Implement `rollsUsable`.** Iterate `Object.entries(action.answers)`; for a roll
      reference under key `k`, `const at = k.indexOf(":"); const perTarget = at > 0 ? k.slice(at + 1) : null;`
      accept when `record.roller === null || record.roller === entity || (perTarget !== null && record.roller === perTarget)`.
      Keep `referencedRolls` for `spend`. Update the doc comment.
- [ ] **Step 5: Implement `settleZeroHp`** in `override.ts` and use it from `deliverDamage`
      (`intent.ts` imports `{ settleZeroHp } from "./override"` — `override.ts` must therefore not
      import `intent.ts` as a value; it already only needs the `StepResult` type). In
      `applyOverride`, after `patchDirectOverride`, if `action.path === "vitals.hp"` and
      `entity.vitals.hp > 0 && patched.vitals.hp === 0`, push `{ kind: "hp-zero", entity }` and
      run `settleZeroHp`.
- [ ] **Step 6: Marco's fixture.** Change the three save rolls' `roller` from `null` to
      `"goblin-1"`, `"goblin-2"`, `"goblin-3"` (the keys already match). Run the replays.
- [ ] **Step 7: Green + gates.** `pnpm test --run tests/unit/combat`; typecheck; lint.
- [ ] **Step 8: ADR-0010 amendment** ("Amendment (2026-09-04, stage 4)": the per-target binding
      rule in one paragraph; hidden faces stay in the shared log — restate the accepted risk).
- [ ] **Step 9: Commit** with changeset `v2-roll-attribution-override-events.md` ("feat(combat):
      per-target save rolls bind to the target; an HP override to zero ends concentration").

## Task 3: The lease table ops

**Files:**

- Modify: `src/lib/combat/types.ts` (`TableOp`), `src/lib/combat/table.ts`
- Test: `tests/unit/combat/resolve.table.test.ts` (extend)

**Interfaces:**

- Produces: `TableOp` gains
  `| { readonly op: "join"; readonly entity: Entity }`
  `| { readonly op: "leave"; readonly entity: EntityId }`
  `| { readonly op: "sync"; readonly entity: Entity }`.
  `join` = `add-entity` semantics (duplicate id rejected; appended to the order in turns).
  `leave` = `remove-entity` semantics (effects it sourced or received end, relations pruned, the
  order and current pointer repaired). `sync` upserts the entity (replaces an existing one of the
  same id wholesale, inserts otherwise; the order is untouched). Receipt summaries come from
  `resolve.ts` as `table:join` / `table:leave` / `table:sync`.

- [ ] **Step 1: Failing tests.** `join` adds a PC (and to the order during turns); a second
      `join` with the same id is rejected `invalid-table-op`; `leave` removes it and ends an effect
      it sourced; `sync` on the personal aggregate replaces the entity's vitals with the synced
      copy and inserts when absent.
- [ ] **Step 2: Run** — fail (unhandled op is a compile error via `assertNever`; the tests fail to
      type-check first, which is the point).
- [ ] **Step 3: Implement** by extracting the bodies of `add-entity` and `remove-entity` into
      `addEntity(state, entity, events)` / `removeEntity(state, id, events)` helpers and calling
      them from four cases; `sync` is `withEntity`.
- [ ] **Step 4: Green + gates. Commit** with changeset `v2-lease-table-ops.md` ("feat(combat):
      join, leave and sync table ops for the encounter lease").

## Task 4: The encounter codec

**Files:**

- Create: `src/lib/combat/codec.ts`
- Modify: `src/lib/combat/types.ts` (`Encounter.unknown?: Readonly<Record<string, unknown>>`)
- Test: `tests/unit/combat/codec.test.ts` (new)

**Interfaces:**

- Produces:

  ```ts
  export type EncounterParse =
    | { readonly ok: true; readonly encounter: Encounter }
    | { readonly ok: false; readonly reason: "not-a-record" | "schema" | "malformed" };
  export function parseEncounter(value: unknown): EncounterParse;
  export function encounterWriteData(encounter: Encounter): Record<string, unknown>;
  ```

  `parseEncounter` splits the record into the five known keys (`schema`, `id`, `host`, `log`,
  `checkpoint`) and the rest; the known part is conformed by `exactConformer(ENCOUNTER_SCHEMA, …)`
  from `@/lib/exact-schema`; the rest, when non-empty, becomes `unknown` (values cloned as plain
  JSON, a non-JSON value → `malformed`). `schema !== 1` → `reason: "schema"`. `encounterWriteData`
  spreads `unknown` first, then the five keys, through `stripUndefined`. Round-trip:
  `encounterWriteData(parseEncounter(x).encounter)` deep-equals `x` for every well-formed `x`.

- [ ] **Step 1: Failing tests.** (a) Every replay under `tests/unit/combat/replays/*.json`, built
      into an `Encounter` exactly as `replays.test.ts` does (opening actions + the log), round-trips
      through write → parse → write with deep equality; (b) an extra top-level key
      `{ future: { a: 1 } }` survives the round trip and is exposed as `encounter.unknown.future`;
      (c) `schema: 2` → `{ ok: false, reason: "schema" }`; (d) a log entry missing `seq` →
      `malformed`; (e) a `checkpoint` with a state whose `entities` value is not a map →
      `malformed`; (f) an `override` action with `value: { nested: [1, "x", null] }` round-trips;
      (g) a `roll` with `seed: null` and one with a number both round-trip; (h) a `table` op of
      every kind including `join`/`leave`/`sync`/`settings` round-trips; (i) a non-record → `not-a-record`.
- [ ] **Step 2: Write the schema.** Compose it from `exact-schema` builders, one constant per
      type, mirroring `types.ts` and `dice.ts` exactly (the reviewer diffs them field by field):
      `seqSchema`, `positionSchema`, `answerSchema` (union: number, string, boolean, number[],
      `{roll}`, position), `paymentChoiceSchema`, `relationSchema` (discriminated on `kind`),
      `lifetimeSchema`, `riderSchema`, `standingFactsSchema` (all optional), `effectPayloadSchema`,
      `effectSchema`, `resourceSchema`, `entityOriginSchema`, `turnLedgerSchema`, `derivedStatsSchema`,
      `entitySchema` (with `overrides: recordSchema("string", objectSchema({ value: json, reason, by }))`,
      `position: union(position, literal null)`), `rollRecordSchema` (`seed: union(number, null)`,
      `purpose` as a union of literals over `ROLL_PURPOSES`), `tableOpSchema` (discriminated on
      `op`, `automation` as literals), `combatEventSchema`, `reactionWindowSchema`,
      `pendingCheckSchema`, `clockSchema`, `foldedStateSchema` (`settings.automation` limited to
      the two built levels), `actionSchema` (discriminated on `kind`; `override.value` is the
      `json` custom; `undo.reason` union string/null; `intent.window` union string/null),
      `encounterSchema` (`host` discriminated on `kind`; `checkpoint` union of `{through, state}`
      and `literal(null)`; `log: arraySchema(actionSchema)`). The single custom conformer `json`
      returns its input unchanged when it is a plain JSON value (`typeof` checks; arrays and
      records recursed; `null` allowed), else `null`.
- [ ] **Step 3: Implement** `parseEncounter`/`encounterWriteData`; run the tests green.
- [ ] **Step 4: Gates + commit** with changeset `v2-encounter-codec.md` ("feat(combat): the
      closed-world codec of the persisted encounter (schema 1)").

## Task 5: Compaction (pure) and the Firestore adapter

**Files:**

- Create: `src/lib/combat/checkpoint.ts`, `src/lib/combat-io.ts`
- Test: `tests/unit/combat/checkpoint.test.ts` (new), `tests/rules/encounter-io.emulator.test.ts` (new)
- Modify: `docs/TEST_PORTFOLIO.md` (rules lane row: files/cases)

**Interfaces:**

- Produces (checkpoint.ts, pure):
  ```ts
  export const COMPACT_ACTIONS = 200;
  export const COMPACT_BYTES = 512 * 1024;
  export const CHECKPOINT_GRACE_MS = 5 * 60_000;
  export function encounterBytes(encounter: Encounter): number; // TextEncoder over JSON
  export function shouldCompact(encounter: Encounter): boolean; // log.length > 200 || bytes > 512 KiB
  export function checkpointThrough(
    encounter: Encounter,
    graceMs = CHECKPOINT_GRACE_MS
  ): Seq | null;
  // the seq of the newest action whose ms <= newest.ms - graceMs and that is after the current
  // checkpoint; null when nothing qualifies
  export function compact(
    encounter: Encounter,
    catalogue: Catalogue,
    through: Seq
  ): Encounter;
  // folds through `through` (reusing `fold` on a copy whose log is truncated to <= through), sets
  // `checkpoint: { through, state }`, keeps only actions after `through` in `log`
  ```
  `compact` must produce the same fold as the uncompacted document: `fold(compact(e)).state`
  deep-equals `fold(e).state` (test it on a replay with a `through` in the middle). Note the
  fold's checkpoint semantics: `state.revision` continues from the checkpoint's state.
- Produces (combat-io.ts; imports only `firebase/firestore`, never `@/lib/firebase`):
  ```ts
  export function encounterRef(
    db: Firestore,
    campaignId: string,
    encounterId: string
  ): DocumentReference;
  export function personalEncounterRef(
    db: Firestore,
    uid: string,
    characterId: string
  ): DocumentReference; // …/combat/state
  export function createSeqClock(by: string, now: () => number = Date.now): () => Seq;
  // monotonic: ms = max(now(), last.ms); counter increments when ms repeats, else 0
  export function newActionId(): string; // crypto.randomUUID()
  export async function createEncounter(ref, encounter: Encounter): Promise<void>; // setDoc(encounterWriteData)
  export async function appendAction(ref, action: Action): Promise<void>; // updateDoc(ref, { log: arrayUnion(stripUndefined(action)) })
  export type EncounterSnapshot =
    | {
        readonly kind: "encounter";
        readonly encounter: Encounter;
        readonly pending: boolean;
      }
    | { readonly kind: "missing" }
    | {
        readonly kind: "quarantined";
        readonly reason: Exclude<EncounterParse, { ok: true }>["reason"];
      }
    | { readonly kind: "error"; readonly error: Error };
  export function subscribeEncounter(
    ref,
    listener: (snapshot: EncounterSnapshot) => void
  ): () => void;
  // one onSnapshot; `pending` = snapshot.metadata.hasPendingWrites (latency compensation)
  export async function checkpointEncounter(
    db,
    ref,
    next: Encounter,
    expectedThrough: Seq | null
  ): Promise<"written" | "stale">;
  // runTransaction: read; if the stored checkpoint's `through` (null when absent) is not deep-equal
  // to expectedThrough → "stale" (no write); else set(encounterWriteData(next) but with `log` =
  // next.log ∪ any actions the stored log holds that are after next.checkpoint.through and not in
  // next.log — appends that landed between the caller's fold and the transaction are kept)
  export async function deleteEncounter(ref): Promise<void>;
  ```
- [ ] **Step 1: Unit tests for `checkpoint.ts`** (fold equality after `compact`, `shouldCompact`
      thresholds, `checkpointThrough` grace: with actions at ms 0…300_000 and grace 5 min the
      result is the action at 0 when the newest is 300_000; null when all are within the window;
      never at or before the current checkpoint).
- [ ] **Step 2: Emulator test `encounter-io.emulator.test.ts`** (copy the harness of
      `firestore-rules.test.ts`: `initializeTestEnvironment`, seed `users/dm`, `users/member`, a
      campaign with both): (a) `createEncounter` by the DM then `appendAction` by the member; the
      DM's `subscribeEncounter` delivers a parsed encounter with the member's action; (b) the
      member's own append arrives on the member's listener with `pending: true` first, then
      `pending: false`; (c) `checkpointEncounter` with a wrong `expectedThrough` returns `"stale"`
      and leaves the document unchanged; with the right one writes it; an action appended by the
      member between the caller's fold and the transaction is preserved in the log; (d) a document
      hand-written with `schema: 2` reaches the listener as `quarantined`.
- [ ] **Step 3: Implement** both modules; run `pnpm test --run tests/unit/combat/checkpoint.test.ts`
      and `pnpm test:rules`.
- [ ] **Step 4: `docs/TEST_PORTFOLIO.md`** rules row updated (3 files, N cases).
- [ ] **Step 5: Commit** with changeset `v2-encounter-io.md` ("feat(combat): the append/subscribe/
      checkpoint adapter and pure compaction for the shared encounter").

## Task 6: The lease adapter

**Files:**

- Create: `src/lib/combat-lease.ts`
- Modify: `docs/CHARACTER_SCHEMA.md` (the `lease` parent field beside `attachedCampaignId`)
- Test: covered by task 8's two-client test (the lease is exercised end to end there); add one
  unit test `tests/unit/combat-lease.test.ts` for `readLease` (shape tolerant: absent → null,
  malformed → null).

**Interfaces:**

```ts
export interface EncounterLease {
  readonly campaignId: string;
  readonly encounterId: string;
  readonly epoch: number;
}
export function readLease(data: unknown): EncounterLease | null; // reads `lease` off a parent doc's data
export async function joinTable(args: {
  db: Firestore;
  uid: string;
  characterId: string;
  campaignId: string;
  encounterId: string;
  epoch: number;
  entity: Entity;
  action: { id: string; seq: Seq };
}): Promise<void>;
// writeBatch: update(encounterRef, { log: arrayUnion(table join) }) + update(characterRef, { lease })
export async function leaveTable(args: {
  db: Firestore;
  uid: string;
  characterId: string;
  campaignId: string;
  encounterId: string;
  entity: Entity;
  leave: { id: string; seq: Seq };
  sync: { id: string; seq: Seq };
  personal: Encounter | null; // the current personal aggregate (null → created with `sync` as its first action)
}): Promise<void>;
// writeBatch: update(encounterRef, { log: arrayUnion(table leave) }) + set/update(personalEncounterRef,
// log arrayUnion(table sync)) + update(characterRef, { lease: deleteField() })
```

A batch is atomic and offline-queueable. `leaveTable` with `personal === null` uses `set` with a
fresh `Encounter { schema: 1, id: "personal", host: { kind: "personal", uid, characterId }, log: [sync], checkpoint: null }`.

- [ ] **Step 1:** unit test for `readLease`; implement; the batch functions are proven in task 8.
- [ ] **Step 2:** `docs/CHARACTER_SCHEMA.md`: one entry for `lease` (owner-written; set on
      `table:join`, cleared on `table:leave`/`table:sync`; not part of the codec envelope, like
      `attachedCampaignId`).
- [ ] **Step 3: Commit** with changeset `v2-encounter-lease.md` ("feat(combat): the lease —
      joinTable and leaveTable write the owner's documents only").

## Task 7: `firestore.rules` reduced, the rules suite rewritten, the three membership fixes

**Files:**

- Modify: `firestore.rules` (rewrite), `tests/rules/firestore-rules.test.ts` (rewrite the
  affected describes), `src/features/campaigns/campaign-io.ts` (`removeMember`, `deleteCampaign`,
  `attachMemberCharacter`), `tests/unit/campaign-io.test.ts` and any unit test asserting the
  removed detaches (`grep -rn "attachedCampaignId: deleteField\|deleteFieldMock" tests/unit`)
- Modify: `docs/ARCHITECTURE.md` → Security section (the matrix in one table)

**The new `firestore.rules`** (copy; keep the `isExactPublicCharacterSheet` body and the
`/users/{uid}`, `public/sheet`, `dmNotes`, wildcard subcollection, `bug_reports`, `diagnostics`
and `admin_audit` blocks byte-for-byte from the current file; only the blocks below change):

```
    // Characters — owner and admin write (revision compare-and-set, empty parent state, exact
    // public projection); a current co-member reads. Cross-user access is derived live from the
    // campaign roster: the parent's `attachedCampaignId` claim is only a pointer, the roster row
    // naming this character is the grant. Nobody but the owner (or the admin) writes here — the
    // DM detach path is gone (§5.2: the owner's client clears its own claims).
    match /users/{uid}/characters/{charId} {
      function attachedCampaign() { … unchanged … }
      function isCurrentCampaignAttachment() { … unchanged … }
      function isOwnerOrAdmin() { return isNotBlocked() && (request.auth.uid == uid || isAdmin()); }
      allow read: if isOwnerOrAdmin()
        || (isNotBlocked()
            && resource.data.get("attachedCampaignId", "") != ""
            && isCurrentCampaignAttachment());
      function publicSheetMatchesAfter() { … unchanged … }
      function parentStateEmptyAfter() { … unchanged … }
      function revisionAdvancesWithBuild() { … unchanged … }
      allow create: if isOwnerOrAdmin()
        && request.resource.data.revision == 0
        && parentStateEmptyAfter()
        && publicSheetMatchesAfter();
      allow update: if isOwnerOrAdmin()
        && revisionAdvancesWithBuild()
        && parentStateEmptyAfter()
        && publicSheetMatchesAfter();
      allow delete: if isOwnerOrAdmin()
        && !existsAfter(/databases/$(database)/documents/users/$(uid)/characters/$(charId)/public/sheet);
    }

    // The personal encounter (`combat/state`): owner and admin write, a current co-member reads.
    // No shape: the codec is the shape (a rules field-lock here caused the "initiative never
    // saves" outage when the deployed rules lagged the client by one field).
    match /users/{uid}/characters/{charId}/combat/state {
      function parentChar() {
        return get(/databases/$(database)/documents/users/$(uid)/characters/$(charId)).data;
      }
      function isCoMember() {
        let campaign = get(/databases/$(database)/documents/campaigns/$(parentChar().attachedCampaignId)).data;
        return request.auth.uid in campaign.members
          && uid in campaign.members
          && campaign.get('memberDetails', {}).get(uid, {}).get('characterId', '') == charId;
      }
      allow read: if isNotBlocked() && (
        request.auth.uid == uid
        || isAdmin()
        || (parentChar().get("attachedCampaignId", "") != "" && isCoMember()));
      allow write: if isNotBlocked() && (request.auth.uid == uid || isAdmin());
    }

    // Snapshots are immutable envelopes: created and deleted by the owner (or the admin), never
    // updated; the shape is the codec envelope plus the reason.
    match /users/{uid}/characters/{charId}/snapshots/{snapId} {
      allow read, delete: if isNotBlocked() && (request.auth.uid == uid || isAdmin());
      allow create: if isNotBlocked() && (request.auth.uid == uid || isAdmin())
        && request.resource.data.schema == 3
        && request.resource.data.build is map
        && request.resource.data.state is map
        && request.resource.data.reason is string;
      allow update: if false;
    }

    match /users/{uid}/library/{docId} {
      allow read: if isNotBlocked() && (request.auth.uid == uid || isAdmin());
      allow write: if isNotBlocked() && (request.auth.uid == uid || isAdmin())
        && request.resource.data.entries is list
        && request.resource.data.entries.size() <= 100;
    }

    // Campaigns: identity, settings, treasury, roster. The model's fields are enumerated: a write
    // may create or change nothing else (the embedded encounter, `encounterInit`,
    // `encounterSkipped`, `memberEffects`, `effectOps`, `world` are gone — play lives in
    // `encounters/{eid}`). `sharedNotes` stays only as the legacy read-fallback a member may delete.
    match /campaigns/{campId} {
      function isMember() { return isNotBlocked() && request.auth.uid in resource.data.members; }
      function isDm() { return isNotBlocked() && request.auth.uid == resource.data.dmUid; }
      function modelFields() {
        return ['name', 'createdAt', 'updatedAt', 'createdBy', 'dmUid', 'members', 'memberDetails',
                'status', 'inviteCode', 'treasury', 'treasuryLog', 'bannerUrl', 'bannerCrop',
                'joinsLocked', 'sharedNotes'];
      }
      function touchesOnlyModelFields() {
        return request.resource.data.diff(resource.data).affectedKeys().hasOnly(modelFields());
      }
      function dmIsMember() {
        return request.resource.data.dmUid in request.resource.data.members;
      }
      function rosterAndOwnerUnchanged() { … unchanged … }
      function memberEditsOnlyOwnEntry() { … unchanged … }
      function joinsLockedUnchanged() { … unchanged … }
      function isSelfJoin() { … unchanged minus the `encounterSkipped` line … }
      allow get: if isMember() || isAdmin();
      allow list: if isAdmin() || (isNotBlocked() && request.auth.uid in resource.data.members);
      allow create: if isNotBlocked()
        && request.resource.data.keys().hasOnly(modelFields())
        && request.auth.uid in request.resource.data.members
        && request.resource.data.createdBy == request.auth.uid
        && request.resource.data.dmUid == request.auth.uid;
      allow update: if touchesOnlyModelFields() && dmIsMember()
        && ((isMember() && rosterAndOwnerUnchanged() && memberEditsOnlyOwnEntry() && joinsLockedUnchanged())
            || isDm() || isAdmin() || isSelfJoin());
      allow delete: if isDm() || isAdmin();
    }

    // The shared encounter (§5.1/§5.4): members append (the log only grows, nothing else
    // changes); the DM and the admin create, checkpoint, change settings and delete. Shape is
    // the version and the log bound; the reducer decides legality; the table keeps manners.
    match /campaigns/{campId}/encounters/{eid} {
      function campaign() { return get(/databases/$(database)/documents/campaigns/$(campId)).data; }
      function encounterMember() { return isNotBlocked() && request.auth.uid in campaign().members; }
      function encounterDm() { return isNotBlocked() && request.auth.uid == campaign().dmUid; }
      function validEncounterShape() {
        return request.resource.data.schema == 1
          && request.resource.data.log is list
          && request.resource.data.log.size() <= 2000;
      }
      function logOnlyGrew() {
        return request.resource.data.diff(resource.data).affectedKeys().hasOnly(['log'])
          && request.resource.data.log.size() > resource.data.log.size();
      }
      allow read: if isAdmin() || encounterMember();
      allow create: if (isAdmin() || encounterDm()) && validEncounterShape();
      allow update: if validEncounterShape()
        && ((isAdmin() || encounterDm()) || (encounterMember() && logOnlyGrew()));
      allow delete: if isAdmin() || encounterDm();
    }
```

Before writing, confirm the campaign key list against every writer: `grep -n "setDoc(campaignDoc\|updateDoc(campaignDoc\|txn.update(ref\|\[\`memberDetails" src/features/campaigns/campaign-io.ts`and`CampaignDoc`in`src/types/campaign.ts`; a key a live writer needs that is missing from `modelFields()` is a plan defect to fix in the list, unless it is one of the deleted fields.

**Rules-suite rewrite:** delete the describes "the turn pointer is a diff-scoped member grant",
"a player applies reviewed combat effects", the DM-detach cases inside "character parents", the
whole "combat/state: the play owner and its peer effect fence" and "encounterInit"; add:

- campaigns: a member's or the DM's `updateDoc` touching `encounter`, `encounterInit`,
  `encounterSkipped` or `memberEffects` is denied; a member's treasury edit still succeeds; create
  with an `encounter` key is denied; `dmUid` transfer to a non-member is denied, to a member
  succeeds (DM); the admin may update a campaign he is not a member of.
- characters: the DM's batch removing a member and clearing the departing character's
  `attachedCampaignId` is denied (the character update fails); the admin may update another
  user's character under the revision CAS; a co-member still reads.
- combat/state: owner, admin and a current co-member read; a co-member's and the DM's writes are
  denied; the admin's write succeeds.
- snapshots: owner create with the envelope shape succeeds, without `reason` fails, `updateDoc`
  fails even for the owner, the admin may create and delete.
- library: admin read/write.
- encounters: keep the five existing cases; add "the admin, not a member, may append, checkpoint
  and delete" and "a member may not delete".

**Client fixes:**

- `removeMember`: drop the `txn.update(characterRef, { attachedCampaignId: deleteField() })`
  branch and the `characterId` read that only served it; update its doc comment (the owner's
  client clears its own claim — §5.2).
- `deleteCampaign`: drop the character detach loop (and `MAX_ATOMIC_CAMPAIGN_DETACHES` if it
  has no other reader); update the comment.
- `attachMemberCharacter`: before the transaction, when the character's `attachedCampaignId`
  names a different campaign, `getDoc` that campaign; a `permission-denied` (or a missing doc)
  means the claim is stale and the attach proceeds by overwriting it; a readable campaign whose
  roster names this character keeps the D9 conflict. Keep `attachViolatesOneCampaign` as the
  in-transaction decision, fed with `null` when the probe proved the claim stale.
- Unit tests in `tests/unit/campaign-io.test.ts` (and any other) that assert the removed detach
  writes are updated to assert their absence; add one for the stale-claim probe.

- [ ] **Step 1:** write the new rules tests first (they fail against the old rules where the
      behaviour changes); `pnpm test:rules` shows exactly the new cases red.
- [ ] **Step 2:** rewrite `firestore.rules`; `pnpm test:rules` green (record the case count and
      `wc -l firestore.rules`).
- [ ] **Step 3:** the client fixes + their unit tests; `pnpm test --run tests/unit/campaign-io.test.ts`
      and any other file touched.
- [ ] **Step 4:** `docs/ARCHITECTURE.md` → Security: replace the encounter/peer prose with the
      §5.4 matrix (actors × paths, one table) and one sentence on the threat model.
- [ ] **Step 5: Commit** in two commits: `v2-rules-reduced.md` ("feat(rules): reduce
      firestore.rules to identity, membership, ownership and shape") and
      `v2-membership-owner-writes.md` ("fix(campaigns): membership paths stop writing other users'
      characters").

## Task 8: The stage gate — two clients fold the same log

**Files:**

- Create: `tests/rules/encounter-two-clients.emulator.test.ts`
- Modify: `docs/TEST_PORTFOLIO.md` (golden replays now also run through two clients on the emulator)

The test reads both acceptance replays (`marco-first-turn.json`, `sara-ogre-ambush.json`) with the
same `Replay` shape `tests/unit/combat/replays.test.ts` uses (import the helpers from
`@tests/unit/combat/__helpers__/state` and `entities`; `@tests` is aliased in
`vitest.rules.config.ts`). Per replay:

1. Seed: users `dm`, `p-marco`, `p-hero`, `outsider` (status active); campaign `camp1` with
   members `["dm", "p-marco", "p-hero"]`, `dmUid: "dm"`; a character `users/p-marco/characters/marco`
   (`{ revision: 0, state: {}, build: {}, status: "active" }`) for the lease.
2. The DM's client (`testEnv.authenticatedContext("dm").firestore()`) `createEncounter`s
   `camp1/enc1` with the opening actions (`openingActions(...)` exactly as the unit replay).
   Every uid in the replay's `log[].by` gets its own client; each client `subscribeEncounter`s
   and keeps its latest `fold(...)` result (the catalogue is `buildCatalogue(PROTOTYPE_MECHANICS)`).
3. Replay the log: each action is appended by the client of its `by` uid, with the stamped `seq`
   from the JSON (`{ ms: 5_000 + index, counter: 0, by }`), awaiting each `appendAction`.
4. Wait until every client's fold reports `applied === replay.expect.applied + opening.length`
   (poll the listeners' latest result; 10 s cap), then assert for every client: rejections equal
   `replay.expect.rejections`, every `expect.state` path matches, and all clients' folded states
   deep-equal the DM's.
5. Then the four extra appends (the gate's "override and undo from each side"): the DM overrides
   the first PC's `vitals.hp` to 1; the player (the PC's controller uid) overrides it to 5; the
   player undoes the DM's override; the DM undoes the player's override. After each append all
   clients converge to the same state; at the end the PC's `vitals.hp` equals the value the
   replay left it at (both overrides undone) and the log holds all four actions.
6. Compaction: append `declare` actions (visible relations toggling, by the DM) until
   `shouldCompact` is true, then `compact` with `checkpointThrough(encounter, 0)` and
   `checkpointEncounter` from the DM's client; every other client's next fold deep-equals the
   fold it held before the checkpoint (`state`), and `log.length` on the document is 0.
7. The lease (Marco's replay only): before step 3, `joinTable` from `p-marco`'s client with a
   PC entity (`testEntity({ id: "marco-pc", kind: "pc", controllerUid: "p-marco" })`) — the
   encounter gains the entity and the character document carries `lease: { campaignId: "camp1",
encounterId: "enc1", epoch: 7 }`; after step 6, `leaveTable` — the entity is gone from the
   fold, `users/p-marco/characters/marco/combat/state` holds a personal encounter whose single
   `sync` action carries the entity, and `lease` is absent. An `outsider` client's `appendAction`
   and `getDoc` fail (`assertFails`).

- [ ] **Step 1:** write the test; `pnpm test:rules` — it must pass on the first green run of the
      implementation from tasks 5–7 (if it does not, the defect is in those modules: fix there,
      never in the test).
- [ ] **Step 2:** `docs/TEST_PORTFOLIO.md`: the golden-replays row says they run in-memory
      (unit) and through two clients on the emulator (rules lane).
- [ ] **Step 3: Commit** with changeset `v2-two-client-gate.md` ("test(combat): both acceptance
      replays fold identically on two emulator clients; override and undo from each side").

## Task 9: Reconcile the documents and close the stage

**Files:**

- Modify: `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` (§3.1: the
  `checkpoint` action kind removed; `join`/`leave`/`sync` marked stage 4; §5.1: `lease` marker,
  admin on every user path; §5.2: `lease`; §5.3: grace window, the transaction precondition;
  §5.4: the admin decision, the predicates now gone; §11: `src/lib/combat-io.ts` written)
- Modify: `docs/PROGRAM_STATUS.md` (new section "`v2` — stage 4"; the redundant stage-2 `Next`
  line removed; the admin-supreme confirmation marked decided; gate numbers)
- Modify: `docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 4 status closed; the
  module-fates row for `combat-io.ts`)
- Modify: `docs/adr/0005-*.md` if it states the encounter access model (one amendment line)
- Rewrite: `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` for stage 5

- [ ] **Step 1:** run the four gates and record the numbers.
- [ ] **Step 2:** write the stage-4 section (done / reviews / rulings — the nine decisions above
      plus anything the execution added / gates / out of stage 4: `propose-and-confirm`; the
      cutover of the live `combat/state` from `CombatState` to the personal `Encounter` (stage 6,
      with the old cockpit, snapshot → dry-run → apply); the old hub's rule-denied encounter
      writers (stage 6); the campaign `memberDetails` snapshot fields `.character`/`.role`
      (stage 8, with the release migration); `reorder`/`day-phase` table ops (later)).
- [ ] **Step 3:** the handoff for stage 5 (the minimum map), same structure as this stage's.
- [ ] **Step 4: Commit** with changeset `v2-stage-4-close.md` ("docs(combat): close stage 4 on v2
      and hand off to stage 5").

## Self-review notes

- Spec coverage: §5.1 (documents, deleted fields → tasks 4, 6, 7), §5.2 (lease → 3, 6, 8), §5.3
  (append/subscribe/compaction/precondition → 5, 8), §5.4 (matrix, predicates gone, admin → 7),
  §5.5 (codec totality → 4), §3.1 vocabulary (`join`/`leave`/`sync` → 3; `checkpoint` action →
  decision 9), the six open seams (→ 2 and the decisions), the gate for stages 1–4 (→ 8).
- Type consistency: `Seq`, `Encounter`, `Action`, `Entity` from `types.ts`/`ids.ts`;
  `EncounterParse` from task 4 is what task 5's `quarantined` carries; `createSeqClock` (task 5)
  stamps the seqs task 8 uses.
- Not narrowed: every table op in §3.1 that is not built (`reorder`, `day-phase`) is named in
  the stage-4 "out" list, not silently dropped.

# P2 prototype vertical — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** prove the target architecture on a hard slice: one PC and one monster acting against each other, a reaction on another creature's turn, a per-target concentration effect that ends and cascades, a two-client shared log with an offline reconnect, a DM append onto a player-owned fact under the new rules, and one mechanic authored purely as data.

**Architecture:** a pure module `src/lib/combat/` (types → mechanic conformer → reducer → fold → coverage) with no React/Firebase/i18n/Zustand/clock/RNG imports; a Firestore adapter `src/lib/combat-io.ts` (append with `arrayUnion`, subscribe); an additive `encounters` block in `firestore.rules`; golden replays and property tests under `tests/unit/combat/`.

**Tech Stack:** TypeScript strict, Vitest, `src/lib/exact-schema.ts` (zero-dependency schema layer), Firestore emulator for rules.

**Spec:** [target architecture](../specs/2026-09-02-total-combat-automation-design.md), [authoring spec](../specs/2026-09-02-mechanics-authoring-spec.md).

## Global constraints

- No `Math.random`, no `Date.now` inside `src/lib/combat/**` (seq is supplied by the caller).
- Every union closed with `assertNever` (`src/lib/utils.ts` has none; add `assertNever` in `src/lib/combat/ids.ts`).
- Labels are ids (`LabelId` strings); nothing localized in the module.
- The module is not reached by any production UI in this phase (import guard test).
- Commits: Conventional, owner as sole author, one `.changeset/*.md` per commit.

## File structure

| File                                                              | Responsibility                                                                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/combat/ids.ts`                                           | `EntityId`, `ActionId`, `Seq` (HLC) + `compareSeq`, `assertNever`                                                                                   |
| `src/lib/combat/types.ts`                                         | `Encounter`, `Entity`, `Relation`, `Effect`, `Lifetime`, `Action`, `FoldedState`, `Receipt`, `Rejection`, `CombatEvent`                             |
| `src/lib/combat/mechanic.ts`                                      | `Mechanic`, `Program`, `Step`, `Predicate`, `Cost`, `Input` types + `conformMechanic` (structural + semantic rules with path)                       |
| `src/lib/combat/catalogue.ts`                                     | `Catalogue` (id → Mechanic) + core mechanics (`core:end-turn` is a table op, not a mechanic; `core:opportunity-attack`, `core:concentration-check`) |
| `src/lib/combat/predicates.ts`                                    | `evalPredicate`, `evalExpr`                                                                                                                         |
| `src/lib/combat/lifetimes.ts`                                     | expiry at boundaries                                                                                                                                |
| `src/lib/combat/damage.ts`                                        | `applyDamage(entity, packets)` in SRD order; temp HP; dying/dead                                                                                    |
| `src/lib/combat/resolve.ts`                                       | the reducer `resolve(state, action, catalogue)`                                                                                                     |
| `src/lib/combat/fold.ts`                                          | `fold(encounter, catalogue)` → `{ state, rejections }`; undo skipping                                                                               |
| `src/lib/combat/coverage.ts`                                      | `coverageFor(catalogue)` → JSON rows                                                                                                                |
| `src/lib/combat/index.ts`                                         | public surface                                                                                                                                      |
| `src/lib/combat-io.ts`                                            | `appendAction`, `subscribeEncounter` (Firestore; not unit-tested here)                                                                              |
| `src/data/combat/prototype-catalogue.ts`                          | Hunter's Mark, Shield, Tasha's-like save spell, longbow, goblin scimitar, goblin stat block adapter sample — data only                              |
| `tests/unit/combat/*.test.ts`, `tests/unit/combat/replays/*.json` | replays, properties, guards                                                                                                                         |
| `firestore.rules`                                                 | additive `match /campaigns/{campId}/encounters/{eid}`                                                                                               |
| `tests/rules/firestore-rules.test.ts`                             | 4 cases for the encounter block                                                                                                                     |

---

### Task 1: ids, types, assertNever

**Files:** create `src/lib/combat/ids.ts`, `src/lib/combat/types.ts`; test `tests/unit/combat/ids.test.ts`.

**Produces:** `Seq = { ms: number; counter: number; by: string }`, `compareSeq(a, b): -1|0|1`, `assertNever(x: never): never`, all types of design §2–3.

- [ ] Write `tests/unit/combat/ids.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compareSeq } from "@/lib/combat/ids";
describe("compareSeq", () => {
  it("orders by ms, then counter, then uid", () => {
    expect(
      compareSeq({ ms: 1, counter: 0, by: "b" }, { ms: 2, counter: 0, by: "a" })
    ).toBe(-1);
    expect(
      compareSeq({ ms: 1, counter: 1, by: "b" }, { ms: 1, counter: 0, by: "a" })
    ).toBe(1);
    expect(
      compareSeq({ ms: 1, counter: 0, by: "a" }, { ms: 1, counter: 0, by: "b" })
    ).toBe(-1);
    expect(
      compareSeq({ ms: 1, counter: 0, by: "a" }, { ms: 1, counter: 0, by: "a" })
    ).toBe(0);
  });
});
```

- [ ] Run `pnpm test --run tests/unit/combat/ids.test.ts` → FAIL (module missing).
- [ ] Implement `ids.ts` and `types.ts` per design §2–3 (closed unions; `Encounter.log: Action[]`).
- [ ] Run → PASS. Commit `feat(combat): ids and aggregate types`.

### Task 2: mechanic types and conformer

**Files:** create `src/lib/combat/mechanic.ts`; test `tests/unit/combat/mechanic.test.ts`.

**Produces:** types of the authoring spec §1; `conformMechanic(value: unknown): { ok: true; mechanic: Mechanic } | { ok: false; path: string; rule: string }`.

- [ ] Test: a valid Hunter's Mark literal conforms; a step `when: { answer: "x" }` with no input `x` fails with `rule: "input-referenced-by-when"` and `path: "active[0].steps[0].when"`; an unknown top-level key fails with `rule: "unknown-key"`.
- [ ] Run → FAIL. Implement: structural check (own enumerable keys, closed sets) + semantic rules `input-referenced-by-when`, `targets-required-by-step`, `cost-claim-matches-trigger`, `once-per-turn-needs-key`.
- [ ] Run → PASS. Commit `feat(combat): mechanic authoring types and conformer`.

### Task 3: predicates, expressions, damage

**Files:** create `predicates.ts`, `damage.ts`; tests `predicates.test.ts`, `damage.test.ts`.

- [ ] Damage tests: resistance halves after flat adjustment, vulnerability doubles, immunity zero; temp HP absorbs first; hp to 0 sets `dying` (or `dead` for non-PC kinds by default); massive damage kills; healing from 0 clears death saves.
- [ ] Predicate tests: `outcome`, `relation`, `condition`, `hp <= half-max`, `all/any/not`.
- [ ] Implement; PASS; commit `feat(combat): predicates and damage application`.

### Task 4: the reducer — table ops and clock

**Files:** create `resolve.ts`, `lifetimes.ts`; test `resolve.table.test.ts`.

**Produces:** `resolve(state: FoldedState, action: Action, catalogue: Catalogue): Applied | Rejected`.

- [ ] Tests: `start` allocates epoch; `add-entity` allocates `monster-1`; `set-initiative` + `begin-turns` orders with declared ties; `end-turn` emits `turn-end`/`turn-start`, resets the ledger, expires a `turn-edge` effect exactly at the right edge; `rest` allocates ordinal and ends only `rest` lifetimes with `minimumOrdinal <= ordinal`.
- [ ] Implement; PASS; commit `feat(combat): reducer table operations and boundaries`.

### Task 5: intents — attack, save, effects, costs, concentration

**Files:** modify `resolve.ts`; create `catalogue.ts`, `src/data/combat/prototype-catalogue.ts`; test `resolve.intent.test.ts`.

- [ ] Tests (each an explicit action list folded by hand-calling `resolve`):
  1. Longbow attack by the ranger on `monster-1`: hit when d20+bonus ≥ AC; damage applied; receipt lists `paid: [turn:attack]`.
  2. Hunter's Mark cast: slot spent, concentration set, mark effect on `monster-1`; the next longbow hit requests the `1d6` rider input and adds it.
  3. A save-gated spell (Tasha's-like): every target succeeds → applied with `outcome: "negated"`, slot spent, **no** concentration, **no** effect.
  4. Unpaid intent (no slot left) → `rejected: { reason: "unaffordable" }`; state unchanged.
  5. Concentration check: goblin hits the ranger; `damage-taken` opens a pending check DC 10; `core:concentration-check` with d20 face 3 → concentration ends, mark effect ends, the rider no longer applies (cascade in one action).
- [ ] Implement; PASS; commit `feat(combat): intents, costs, outcomes, concentration cascade`.

### Task 6: reaction windows on another creature's turn

**Files:** modify `resolve.ts`; test `resolve.window.test.ts`.

- [ ] Tests: goblin declares an attack on the ranger who knows Shield with a reaction available → a window opens, action is `declared`; ranger appends Shield intent with `window` → +5 AC standing until the ranger's next turn start; `resolve` recomputes the attack: 16 vs AC 15 was a hit, vs 20 is a miss; a second window in the same round is not offered (reaction spent); opportunity attack: a `declare` removing `adjacent` between goblin and ranger opens a window for the ranger's `core:opportunity-attack`.
- [ ] Implement; PASS; commit `feat(combat): reaction windows`.

### Task 7: fold, undo, and the two-client offline replay

**Files:** create `fold.ts`; tests `fold.test.ts`, `replays.test.ts` + `tests/unit/combat/replays/*.json`.

**Produces:** `fold(encounter, catalogue): { state: FoldedState; rejections: Array<{ action: ActionId; reason: Rejection }> }`.

- [ ] Tests: (a) undo of the mark cast restores slot and removes the effect and its dependents; (b) property: for a fixed log of 40 mixed actions from two uids, every one of 50 seeded permutations of `log` folds to a canonically-equal state; (c) offline reconnect: client A appends 5 actions while B appends 3 offline with earlier `ms`; union folds equal on both; an action of B that targets an entity A already removed is `rejected` identically; (d) DM override after a player's damage: fold order is by `seq`; the override wins and both are in the log.
- [ ] Implement; PASS; commit `feat(combat): fold, undo, replays`.

### Task 8: coverage generator and guards

**Files:** create `coverage.ts`; tests `coverage.guard.test.ts`, `import.guard.test.ts`, `payment.guard.test.ts`; output `docs/automation-coverage.json` (prototype catalogue only in this phase).

- [ ] Tests: coverage rows for the prototype catalogue match the committed JSON (regenerate and compare; on mismatch the message says how to regenerate); `src/lib/combat/**` imports none of `react`, `firebase`, `zustand`, `@/i18n`, `@/features`, `@/components`, `Date.now`, `Math.random`; every costed program in the catalogue, folded through its replay, yields a `paid` receipt.
- [ ] Implement; PASS; commit `feat(combat): coverage generator and guards`.

### Task 9: Firestore adapter and rules

**Files:** create `src/lib/combat-io.ts`; modify `firestore.rules` (additive block); modify `tests/rules/firestore-rules.test.ts` (+4 cases).

- [ ] Rules tests: member can `update` `campaigns/{c}/encounters/{e}` when only `log` grows; non-member denied; DM can `set` a checkpoint (rewrite); a member cannot write another user's `combat/state` (existing test kept as the invariant this phase does not change).
- [ ] Rules block:

```
match /campaigns/{campId}/encounters/{eid} {
  allow read: if isAuth() && isNotBlocked() && (isMember(campId) || isAdmin());
  allow create: if isAuth() && isNotBlocked() && (isDmOf(campId) || isAdmin())
    && request.resource.data.schema == 1 && request.resource.data.log is list;
  allow update: if isAuth() && isNotBlocked() && (
    (isDmOf(campId) || isAdmin())
    || (isMember(campId)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(["log"])
        && request.resource.data.log.size() > resource.data.log.size()
        && request.resource.data.log.size() <= 2000));
  allow delete: if isAuth() && isNotBlocked() && (isDmOf(campId) || isAdmin());
}
```

- [ ] `combat-io.ts`: `appendAction(campaignId, encounterId, action)` → `updateDoc(ref, { log: arrayUnion(action) })`; `subscribeEncounter(ref, onValue)` with `parseEncounter` fail-closed.
- [ ] `pnpm test:rules` → PASS. Commit `feat(combat): encounter document rules and adapter`.

### Task 10: gates, docs, changesets

- [ ] `just ci`, `just ci-srd-only`, `pnpm test:rules` green.
- [ ] `docs/PROGRAM_STATUS.md`: one section "Automation direction under re-architecture (2026-09-02)" pointing at the spec and this plan; Wayfinder charters marked superseded.
- [ ] Changesets present; rebase on fresh `origin/main`; push `HEAD:main`; confirm SHA.

## Self-review

- Spec coverage: state model (T1), authoring (T2), damage/predicates (T3), clock/boundaries (T4), outcomes/costs/concentration (T5), windows (T6), fold/undo/multi-client (T7), coverage/guards (T8), rules/adapter (T9). Overrides and `declare` are exercised in T6/T7 replays. Monster adapter and full vocabulary are P2 proper, not the prototype.
- Names used consistently: `resolve`, `fold`, `conformMechanic`, `compareSeq`, `appendAction`, `subscribeEncounter`, `coverageFor`.

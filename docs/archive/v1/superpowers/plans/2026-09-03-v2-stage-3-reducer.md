# Stage 3 — the reducer for the two story encounters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five confirmed gaps between `src/lib/combat` today and what Marco's first
turn and Sara's ogre ambush (`PRODUCT.md` §Steering) need, so both stories pass as golden replays
against the pure reducer.

**Architecture:** Everything below extends the existing P2-prototype reducer in place — no new
step vocabulary, no new module boundary, no UI. Five pieces, each scoped to exactly what the two
stories exercise (nothing speculative, per `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md`
§0 "Bounded on 2026-09-03" and the authoring spec §6):

1. **Automation levels** (ADR-0011): `full-auto` and `log-only` only — `propose-and-confirm` is
   explicitly stage 6, not stage 3. Gating lives entirely inside `applyIntent`/`applyResolve`/
   `applyCheck` (intent.ts), which already distinguish "a verdict was computed" from "bookkeeping
   that must always land" (a reaction window opening, a pending check being cleared). `resolve.ts`
   needs no changes at all — each of those three functions reads `state.settings.automation`
   itself and, at `log-only`, returns the **pre-mutation** state with the fully-computed receipt
   instead of the mutated one. This means cost payment is also withheld at `log-only` ("applies
   nothing" is read literally, matching ADR-0011's wording) — a log-only table is fully hand-kept
   by the DM; the app only shows what the dice said.
2. **Override generalization**: today `applyOverride` stores any path generically but only two
   read sites (`effectiveAc`, the `move` step's speed budget) ever consult it — the design
   invariant ("derived stats compute base → passive grants → effects → overrides") describes a
   _derived_-stat pattern that doesn't fit `vitals.hp`/`vitals.life`, which are persisted facts,
   not formulas. So those two paths get **directly patched** by `applyOverride` (the same
   correction model `declare` already uses for relations — a later fact replaces the old one for
   every subsequent read) rather than forced into the consult-at-read pattern built for AC/speed.
   Both patterns coexist; `applyOverride` still records every override generically for audit
   regardless of whether a direct-patch path recognizes it.
3. **Area targeting**: `TargetSpec.count` gains a `"area"` literal alongside its existing
   `number`, paired with a new `area: AreaShapeSpec` (an `AreaShape` from stage 2's `position.ts`,
   parametrized by input ids instead of literal positions). `applyIntent` computes the affected
   entity list itself from the caster's declared origin/aim answers and every entity's _current_
   position — never from a client-supplied target list — reusing stage 2's `areaMembership`
   unchanged. No new step kinds: Fireball's save-then-half-damage is exactly the `save`+`damage`
   step pair `giggle` and the monster adapter's save entries already use.
4. **Monster adapter**: `monsterMechanics(block): Mechanic` converts `block.actions` only —
   `MonsterAttackEntry` → an `attack` program, `MonsterSaveEntry` → `save`+`damage`, everything
   else (prose `MonsterNarrativeEntry` including Multiattack, and `MonsterSpellcastingEntry`) →
   `manual-table`, exactly matching the authoring spec §4's own rule ("prose-only entries →
   manual-table"). The real 2024 SRD Ogre carries no structured Multiattack data (confirmed by
   reading `src/data/monsters/n-p.ts`: Multiattack isn't even present on its stat block — only
   two plain attack entries), so Sara's story never needs the adapter to automate a multi-attack
   sequence; the adapter still _handles_ a Multiattack entry correctly (degrading it to
   `manual-table`, never crashing or silently dropping it). `traits`, `reactions`,
   `legendaryActions`, and `recharge`/`legendary` costs stay `later` — the authoring spec already
   tiers them there.
5. **0-HP/dying**: already fully implemented (`damage.ts`); no task needed. Death-save-at-turn-
   start input is correctly out of scope (`later` tier, design doc §7).

Two golden replays close the stage: `marco-first-turn.json` (move, then an area-save Fireball
against three goblins) and `sara-ogre-ambush.json` (a `log-only` hidden ogre attack, a DM `override`
that actually changes HP, switching back to `full-auto`, a homebrew sword landing a hit) — matching
the acceptance stories in `PRODUCT.md` §Steering verbatim.

**Tech Stack:** TypeScript (strict), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` (§3, §4, §7),
`docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` (§4, §6), `docs/adr/0011-campaign-automation-levels.md`,
`docs/superpowers/specs/2026-09-03-v2-stage-2-positions-areas-design.md`.

## Global Constraints

- `src/lib/combat` stays pure: no React/Firebase/Zustand/`@/i18n`/`@/features`/`@/components`/
  `@/stores` imports, no `Date.now`/`Math.random`/crypto RNG (`tests/unit/combat/boundary.guard.test.ts`
  enforces this by grepping every file in the directory — a `type`-only import from `@/data/types`
  is fine, it compiles away and isn't in the forbidden pattern list).
- Every union stays closed; every reducer `switch` ends in `assertNever` (`ids.ts`). A new case
  in a closed union is a compile error everywhere it isn't handled — that's the point.
- Costed programs must report a non-empty `paid` when they apply at `full-auto`
  (`boundary.guard.test.ts`'s payment test) — `log-only` is explicitly exempt (it applies nothing,
  by design; do not add it to that guard's mechanic loop).
- Coverage (`docs/automation-coverage.prototype.json`) is machine-derived, never hand-edited —
  regenerate with `WRITE_COMBAT_COVERAGE=1 pnpm test --run tests/unit/combat/coverage.guard.test.ts`
  whenever `PROTOTYPE_MECHANICS` changes.
- No dice rolling by the reducer itself outside the dice seam (`src/lib/dice.ts`, untouched here);
  every replay fixture answers with a logged `roll` action, never a bare number, matching
  `dice-provenance.json`/`position-and-reach.json`.
- Never import `@/data/monsters` (or its `index.ts` barrel) as a _value_ from anywhere reachable
  by `src/data/combat/prototype-catalogue.ts` at module scope — that corpus is bundle-budget-guarded
  as lazy-only (`src/data/monsters/index.ts` header: "Nothing eager may import this module"). A
  `import type` is fine (erased at compile time); a real fixture literal is hand-copied instead.
- Small Conventional Commits, one `.changeset/*.md` per commit, the owning document reconciled in
  the same commit (golden rule 10 / CLAUDE.md). Never `--no-verify`.

---

## Task 1: Automation levels (`full-auto` / `log-only`)

**Files:**

- Modify: `src/lib/combat/types.ts` (new `Automation` type; `TableOp`'s `"settings"` variant;
  `FoldedState.settings`)
- Modify: `src/lib/combat/table.ts` (`applyTable`'s `"settings"` case)
- Modify: `src/lib/combat/fold.ts` (`initialState()`)
- Modify: `src/lib/combat/intent.ts` (`applyIntent`, `applyResolve`, `applyCheck`)
- Modify: `tests/unit/combat/__helpers__/state.ts` (`emptyState()`)
- Test: `tests/unit/combat/resolve.automation.test.ts` (new)
- Test: `tests/unit/combat/resolve.table.test.ts` (extend: the `propose-and-confirm` rejection)
- Test: `tests/unit/combat/resolve.intent.test.ts` (extend: a log-only concentration check)

**Interfaces:**

- Produces: `export type Automation = "full-auto" | "propose-and-confirm" | "log-only"`
  (`types.ts`), consumed by every later task that reads `state.settings.automation`.
- Consumes: nothing new from earlier tasks (this is the foundational task; do it first).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/combat/resolve.automation.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState, Relation } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import {
  nextActionId,
  openingActions,
  seqFactory,
  tableAction,
} from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("p1");

const hero = testEntity({
  id: "hero",
  kind: "pc",
  controllerUid: "p1",
  hp: 20,
  ac: 10,
  abilities: { DEX: 3 },
  mechanics: ["srd:weapon:longbow"],
});
const foe = testEntity({
  id: "monster-1",
  kind: "monster",
  controllerUid: "dm",
  hp: 10,
  ac: 5,
});
const visible: Relation[] = [{ kind: "visible", a: "hero", b: "monster-1", value: true }];

function opened(): FoldedState {
  let state = initialState();
  for (const action of openingActions(
    "dm",
    seq,
    [hero, foe],
    { hero: 20, "monster-1": 1 },
    ["hero", "monster-1"]
  )) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return { ...state, relations: visible };
}

function attack(): Action {
  return {
    kind: "intent",
    id: nextActionId("a"),
    seq: seq(),
    by: "p1",
    entity: "hero",
    mechanic: "srd:weapon:longbow",
    program: "attack",
    targets: ["monster-1"],
    answers: { roll: 15, damage: 5 }, // 15 + DEX 3 + PB 2 = 20 ≥ AC 5 → 5 damage
    payment: [],
    window: null,
    basedOn: 0,
  };
}

function logOnly(state: FoldedState): FoldedState {
  const result = resolve(
    state,
    tableAction("dm", seq(), {
      op: "settings",
      revealMonsterHp: false,
      automation: "log-only",
    }),
    catalogue
  );
  if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
  return result.state;
}

describe("automation — log-only computes the verdict but applies nothing (ADR-0011)", () => {
  it("a log-only attack leaves HP, the turn ledger and the cost untouched, with the full receipt", () => {
    const result = resolve(logOnly(opened()), attack(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "monster-1").vitals.hp).toBe(10); // unchanged
    expect(mustEntity(result.state, "hero").turn.attacksUsed).toBe(0); // cost not paid
    expect(result.receipt.paid).toEqual(["turn:attack"]); // receipt still shows what would pay
    expect(result.receipt.outcome).toBe("established"); // and the full verdict
    expect(result.state.revision).toBe(opened().revision + 2); // settings + this action still count
  });

  it("the same attack at full-auto applies exactly as before the setting existed", () => {
    const result = resolve(opened(), attack(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "monster-1").vitals.hp).toBe(5);
    expect(mustEntity(result.state, "hero").turn.attacksUsed).toBe(1);
  });
});
```

(The concentration-check half of the contract is tested in `resolve.intent.test.ts` below, where
the fixture that opens a check already exists — no duplicated setup.)

Append to `tests/unit/combat/resolve.intent.test.ts`, right after the existing
`"damage to a concentrating caster opens a concentration check; a failed check ends the mark and its rider"`
test (reuse its `run`/`opened`/`intent`/`tableAction`/`firstOf` helpers — all already imported there):

```ts
it("at log-only, a failed concentration check is cleared but the break is withheld (ADR-0011)", () => {
  let state = run(opened(), [
    intent("p1", "ranger", "srd:spell:hunters-mark", "cast", {
      targets: ["monster-1"],
      payment: [{ kind: "slot", level: 1, pool: "standard" }],
    }),
    tableAction("dm", seq(), { op: "end-turn" }),
    intent("dm", "monster-1", "monster:goblin:scimitar", "attack", {
      targets: ["ranger"],
      answers: { roll: 12, damage: 6 },
    }),
  ]);
  state = run(state, [
    {
      kind: "resolve",
      id: nextActionId("r"),
      seq: seq(),
      by: "p1",
      window: firstOf(state.windows).id,
    },
  ]);
  const markId = mustEntity(state, "ranger").concentration as string;
  expect(state.checks).toHaveLength(1);
  state = run(state, [
    tableAction("dm", seq(), {
      op: "settings",
      revealMonsterHp: false,
      automation: "log-only",
    }),
  ]);
  const after = run(state, [
    {
      kind: "check",
      id: nextActionId("c"),
      seq: seq(),
      by: "p1",
      check: firstOf(state.checks).id,
      answers: { d20: 3 }, // 3 + CON 2 < DC 10 → would break at full-auto
    },
  ]);
  expect(after.checks).toEqual([]); // the pending check is bookkeeping: always cleared
  expect(mustEntity(after, "ranger").concentration).toBe(markId); // the break is the verdict: withheld
  expect(after.effects[markId]).toBeDefined();
});
```

Also add to `tests/unit/combat/resolve.table.test.ts` (append a new `describe` block; read the
file first to match its existing `opened()`/`seq` helpers before adding):

```ts
describe("table — settings", () => {
  it("rejects automation: propose-and-confirm (stage 6, not built yet)", () => {
    const state = opened();
    const result = resolve(
      state,
      tableAction("dm", seq(), {
        op: "settings",
        revealMonsterHp: false,
        automation: "propose-and-confirm",
      }),
      catalogue
    );
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.rejection.reason).toBe("invalid-table-op");
  });

  it("accepts log-only and full-auto, and can switch back mid-session", () => {
    let state = opened();
    for (const automation of ["log-only", "full-auto"] as const) {
      const result = resolve(
        state,
        tableAction("dm", seq(), { op: "settings", revealMonsterHp: false, automation }),
        catalogue
      );
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
      expect(state.settings.automation).toBe(automation);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run tests/unit/combat/resolve.automation.test.ts tests/unit/combat/resolve.table.test.ts tests/unit/combat/resolve.intent.test.ts`
Expected: FAIL — the settings op ignores `automation` (the type check runs separately in `just ci`;
Vitest's esbuild transform strips types, so the failure is behavioral: HP changes at "log-only",
`state.settings.automation` is `undefined`, the concentration break is not withheld).

- [ ] **Step 3: Add `Automation` and wire it through the types**

In `src/lib/combat/types.ts`, add just above `TableOp`:

```ts
export type Automation = "full-auto" | "propose-and-confirm" | "log-only";
```

Change the `TableOp` `"settings"` variant (currently `| { readonly op: "settings"; readonly revealMonsterHp: boolean };`):

```ts
  | {
      readonly op: "settings";
      readonly revealMonsterHp: boolean;
      readonly automation: Automation;
    };
```

Change `FoldedState.settings` (currently `readonly settings: { readonly revealMonsterHp: boolean };`):

```ts
  readonly settings: {
    readonly revealMonsterHp: boolean;
    readonly automation: Automation;
  };
```

- [ ] **Step 4: Default `automation` in both state constructors**

In `src/lib/combat/fold.ts`, `initialState()`, change:

```ts
    settings: { revealMonsterHp: false },
```

to:

```ts
    settings: { revealMonsterHp: false, automation: "full-auto" },
```

In `tests/unit/combat/__helpers__/state.ts`, `emptyState()`, make the identical change.

- [ ] **Step 5: Reject `propose-and-confirm` and thread `automation` through `applyTable`'s settings case**

In `src/lib/combat/table.ts`, change the `case "settings":` branch:

```ts
    case "settings": {
      if (op.automation === "propose-and-confirm") {
        return reject("settings: propose-and-confirm is not built until stage 6 (ADR-0011)");
      }
      return {
        kind: "applied",
        state: {
          ...state,
          settings: { revealMonsterHp: op.revealMonsterHp, automation: op.automation },
        },
        events,
      };
    }
```

- [ ] **Step 6: Gate the three verdict-producing entry points in `intent.ts`**

In `src/lib/combat/intent.ts`, `applyIntent`'s final return (currently the block starting at
`const next = settleConcentration(...)` through the end of the function), replace with:

```ts
const next = settleConcentration(
  run.state,
  action,
  run.created,
  payment.concentration,
  events
);
const receipt: Receipt = {
  action: action.id,
  outcome: receiptOutcome(run.created.length, run.dealt, run.tried),
  paid: payment.paid,
  events,
  summary: [action.mechanic],
};
if (state.settings.automation === "log-only") {
  return { kind: "applied", state, receipt };
}
return { kind: "applied", state: next, receipt };
```

(`state` here is `applyIntent`'s original parameter — the pre-payment, pre-run state. The
held-window branch above this, unchanged, always commits: opening a reaction window is
bookkeeping, not a verdict, and gating it would silently break reactions for every other actor
regardless of automation level.)

In `applyResolve`, replace the final return (`return { kind: "applied", state: run.state, receipt: {...} };`)
with:

```ts
const base: FoldedState = { ...closed, declared: remaining };
const receipt: Receipt = {
  action: action.id,
  outcome: receiptOutcome(run.created.length, run.dealt, run.tried),
  paid: [],
  events,
  summary: [declared.mechanic, "window:resolved"],
};
if (base.settings.automation === "log-only") {
  return { kind: "applied", state: base, receipt };
}
return { kind: "applied", state: run.state, receipt };
```

(`base` clears the resolved window and its `declared` entry either way — that bookkeeping always
lands; only the program's _outcome_ is gated.)

In `applyCheck`, restructure to separate "always applied" (the pending check is cleared) from
"gated" (the concentration break):

```ts
export function applyCheck(state: FoldedState, action: CheckAction): StepResult {
  const check = state.checks.find((c) => c.id === action.check);
  if (!check) return rejected({ reason: "no-such-check", check: action.check });
  const face = answerNumber(state, action.answers, "d20");
  if (face === null) return rejected({ reason: "missing-answer", input: "d20" });
  const entity = mustEntity(state, check.entity);
  const withoutCheck: FoldedState = {
    ...state,
    checks: state.checks.filter((c) => c.id !== check.id),
  };
  const passed = face + entity.stats.saves.CON >= check.dc;
  const events: CombatEvent[] = [];
  let next = withoutCheck;
  if (!passed && entity.concentration !== null) {
    const ended = endEffects(withoutCheck, [entity.concentration]);
    next = ended.state;
    events.push(...ended.events);
  }
  const receipt: Receipt = {
    action: action.id,
    outcome: passed ? "applied" : "negated",
    paid: [],
    events,
    summary: ["check:concentration"],
  };
  if (withoutCheck.settings.automation === "log-only") {
    return { kind: "applied", state: withoutCheck, receipt };
  }
  return { kind: "applied", state: next, receipt };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm test --run tests/unit/combat/resolve.automation.test.ts tests/unit/combat/resolve.table.test.ts tests/unit/combat/resolve.intent.test.ts tests/unit/combat/resolve.window.test.ts tests/unit/combat/fold.test.ts tests/unit/combat/boundary.guard.test.ts`
Expected: PASS (the boundary guard's payment test still passes — it only exercises the default
`full-auto` state, so nothing there is gated).

- [ ] **Step 8: Commit**

```bash
git add src/lib/combat/types.ts src/lib/combat/table.ts src/lib/combat/fold.ts \
  src/lib/combat/intent.ts tests/unit/combat/__helpers__/state.ts \
  tests/unit/combat/resolve.automation.test.ts tests/unit/combat/resolve.table.test.ts \
  tests/unit/combat/resolve.intent.test.ts .changeset/v2-stage-3-automation-levels.md
git commit -m "feat(combat): full-auto and log-only campaign automation levels (ADR-0011)"
```

Add `.changeset/v2-stage-3-automation-levels.md`:

```markdown
---
"d20-folio": patch
---

Add the `full-auto`/`log-only` campaign automation levels to the combat reducer (ADR-0011):
`log-only` computes the same verdict but withholds its state transition, letting the DM apply it
by hand through `override`. `propose-and-confirm` is rejected until stage 6 builds it.
```

---

## Task 2: Override generalization (`vitals.hp`, `vitals.life`)

**Files:**

- Modify: `src/lib/combat/intent.ts` (`applyOverride`)
- Test: `tests/unit/combat/resolve.override.test.ts` (new)

**Interfaces:**

- Consumes: nothing from Task 1 (independent; may be done before or after it).
- Produces: `applyOverride` now actually mutates `entity.vitals.hp`/`entity.vitals.life` when
  those exact paths are overridden with a correctly-typed value — Task 7 (Sara's replay) and
  Task 8 rely on this.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/combat/resolve.override.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState } from "@/lib/combat/types";
import { PROTOTYPE_MECHANICS } from "@/data/combat/prototype-catalogue";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const { catalogue } = buildCatalogue(PROTOTYPE_MECHANICS);
const seq = seqFactory("dm");

function opened(hero: Partial<Parameters<typeof testEntity>[0]> = {}): FoldedState {
  let state = initialState();
  const entity = testEntity({ id: "hero", kind: "pc", hp: 30, ...hero });
  for (const action of openingActions("dm", seq, [entity], { hero: 10 }, ["hero"])) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

function override(path: string, value: unknown): Action {
  return {
    kind: "override",
    id: nextActionId("o"),
    seq: seq(),
    by: "dm",
    entity: "hero",
    path,
    value,
    reason: "DM correction",
  };
}

describe("override — direct-patch paths actually change the fact, not just the audit record", () => {
  it("vitals.hp: an HP override changes the entity's live HP", () => {
    const result = resolve(opened(), override("vitals.hp", 18), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(18);
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"]).toEqual({
      value: 18,
      reason: "DM correction",
      by: "dm",
    });
  });

  it("vitals.life: the DM's last word on death — dying can be overridden to stable", () => {
    const state = opened({
      hp: 0,
      life: "dying",
      deathSaves: { successes: 0, failures: 2 },
    });
    const result = resolve(state, override("vitals.life", "stable"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("stable");
  });

  it("vitals.hp above zero on a dying or stable creature revives it, like healing does", () => {
    const state = opened({
      hp: 0,
      life: "dying",
      deathSaves: { successes: 1, failures: 2 },
    });
    const result = resolve(state, override("vitals.hp", 5), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals).toMatchObject({
      hp: 5,
      life: "alive",
      deathSaves: { successes: 0, failures: 0 },
    });
  });

  it("vitals.hp on a dead creature changes HP only — death is reversed by an explicit life override", () => {
    const state = opened({ hp: 0, life: "dead" });
    const result = resolve(state, override("vitals.hp", 5), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.life).toBe("dead");
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(5);
  });

  it("a malformed override (wrong type) is still recorded but never corrupts the live field", () => {
    const result = resolve(opened(), override("vitals.hp", "not-a-number"), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(30); // unchanged
    expect(mustEntity(result.state, "hero").overrides["vitals.hp"].value).toBe(
      "not-a-number"
    );
  });

  it("stats.ac keeps its existing consult-at-read behavior (unaffected by this change)", () => {
    const result = resolve(opened(), override("stats.ac", 99), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    // stats.ac is never direct-patched — its base field is untouched; effectiveAc() consults
    // overrides["stats.ac"] at read time (unchanged behavior, proven by resolve.intent.test.ts).
    expect(mustEntity(result.state, "hero").stats.ac).toBe(12); // testEntity default, unpatched
    expect(mustEntity(result.state, "hero").overrides["stats.ac"].value).toBe(99);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --run tests/unit/combat/resolve.override.test.ts`
Expected: FAIL — `vitals.hp`/`vitals.life` stay unpatched (`toBe(18)`/`toBe("stable")`/the revive
case all fail against the untouched fixture values); the malformed-override and `stats.ac` tests
already pass (they pin existing behavior so the change cannot widen).

- [ ] **Step 3: Implement the direct-patch paths**

In `src/lib/combat/intent.ts`, add `LifeState` to the `type` import from `./types` (it currently
imports `Action, CombatEvent, Effect, Entity, FoldedState, Lifetime, Outcome, PaymentChoice,
PendingCheck, ReactionWindow, Receipt, Rejection, Relation, TurnLedger` — add `LifeState` to that
list), then replace `applyOverride`:

```ts
const LIFE_STATES = new Set<LifeState>(["alive", "dying", "stable", "dead"]);

/** Paths that are persisted facts, not read-time-derived stats (like `stats.ac`): an override
 *  here directly corrects the fact, the same way a later `declare` replaces a relation, rather
 *  than layering on top of a formula consulted at read time. An HP override above zero revives
 *  a dying/stable creature exactly as `applyHealing` does; `dead` stays dead until the DM
 *  overrides `vitals.life` explicitly. */
function patchDirectOverride(entity: Entity, path: string, value: unknown): Entity {
  if (path === "vitals.hp" && typeof value === "number" && Number.isFinite(value)) {
    const { life, deathSaves } = entity.vitals;
    const revived = value > 0 && (life === "dying" || life === "stable");
    return {
      ...entity,
      vitals: {
        ...entity.vitals,
        hp: value,
        life: revived ? "alive" : life,
        deathSaves: revived ? { successes: 0, failures: 0 } : deathSaves,
      },
    };
  }
  if (
    path === "vitals.life" &&
    typeof value === "string" &&
    LIFE_STATES.has(value as LifeState)
  ) {
    return { ...entity, vitals: { ...entity.vitals, life: value as LifeState } };
  }
  return entity;
}

export function applyOverride(state: FoldedState, action: OverrideAction): StepResult {
  const entity = state.entities[action.entity];
  if (!entity) return rejected({ reason: "unknown-entity", entity: action.entity });
  const recorded: Entity = {
    ...entity,
    overrides: {
      ...entity.overrides,
      [action.path]: { value: action.value, reason: action.reason, by: action.by },
    },
  };
  const patched = patchDirectOverride(recorded, action.path, action.value);
  return {
    kind: "applied",
    state: { ...state, entities: { ...state.entities, [action.entity]: patched } },
    receipt: {
      action: action.id,
      outcome: "applied",
      paid: [],
      events: [],
      summary: ["override"],
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test --run tests/unit/combat/resolve.override.test.ts tests/unit/combat/resolve.intent.test.ts tests/unit/combat/resolve.window.test.ts`
Expected: PASS (existing AC/speed override tests in `resolve.intent.test.ts`/`resolve.window.test.ts`
still pass unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/combat/intent.ts tests/unit/combat/resolve.override.test.ts \
  .changeset/v2-stage-3-override-vitals.md
git commit -m "fix(combat): DM overrides on vitals.hp and vitals.life actually change the fact"
```

Add `.changeset/v2-stage-3-override-vitals.md`:

```markdown
---
"d20-folio": patch
---

An `override` on `vitals.hp` or `vitals.life` now directly patches the entity, matching the
design's "DM's last word" invariant — previously it was recorded in the audit trail but silently
had no effect on anything but `stats.ac`/`stats.speed`.
```

---

## Task 3: Area targeting (`TargetSpec.count: "area"`)

**Files:**

- Modify: `src/lib/combat/mechanic.ts` (`TargetSpec`, new `AreaShapeSpec`, `checkProgram` rule)
- Modify: `src/lib/combat/intent.ts` (`applyIntent`'s target-validation block; a shared
  `answerPosition` helper, reused by the existing `move` step)
- Test: `tests/unit/combat/mechanic.test.ts` (extend: the new conformance rule)
- Test: `tests/unit/combat/resolve.area.test.ts` (new)

**Interfaces:**

- Consumes: `areaMembership(shape: AreaShape, candidates: Positioned[]): EntityId[]` and
  `type AreaShape` from `src/lib/combat/position.ts` (already built, stage 2, unchanged).
- Produces: `AreaShapeSpec` (mechanic.ts) — consumed by Task 4 (Fireball authoring).

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/combat/mechanic.test.ts` (read the file first to match its existing style; it
almost certainly already has a `describe("conformMechanic"...)` block — append a new `it` inside
it, or a new top-level `describe` if the file is organized by rule):

```ts
describe("conformMechanic — area targeting", () => {
  const base = {
    schema: 1 as const,
    id: "test:area",
    source: "homebrew" as const,
  };

  it("accepts count: 'area' with an area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: {
            count: "area",
            eligibility: { all: [] },
            area: { kind: "sphere", origin: "origin", radiusFt: 20 },
          },
          inputs: [{ id: "origin", kind: "position" }],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects count: 'area' without an area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: { count: "area", eligibility: { all: [] } },
          inputs: [],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("area-required-by-count");
  });

  it("rejects a numeric count carrying a stray area shape", () => {
    const result = conformMechanic({
      ...base,
      active: [
        {
          id: "cast",
          trigger: { kind: "invocation", economy: "action" },
          targets: {
            count: 1,
            eligibility: { all: [] },
            area: { kind: "sphere", origin: "origin", radiusFt: 20 },
          },
          inputs: [],
          steps: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("area-requires-area-count");
  });
});
```

Create `tests/unit/combat/resolve.area.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mustEntity } from "@/lib/combat/state";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import type { Action, FoldedState } from "@/lib/combat/types";
import type { Mechanic } from "@/lib/combat/mechanic";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const blast: Mechanic = {
  schema: 1,
  id: "test:blast",
  source: "homebrew",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "action" }],
      targets: {
        count: "area",
        eligibility: { all: [] },
        area: { kind: "sphere", origin: "origin", radiusFt: 10 },
      },
      inputs: [
        { id: "origin", kind: "position" },
        { id: "damage", kind: "dice", formula: "2d6" },
      ],
      steps: [
        {
          id: "hit",
          kind: "damage",
          parts: [{ dice: "damage", type: "fire" }],
          to: "$target",
        },
      ],
    },
  ],
};

const { catalogue } = buildCatalogue([blast]);
const seq = seqFactory("caster");

function opened(): FoldedState {
  let state = initialState();
  const caster = testEntity({
    id: "caster",
    kind: "pc",
    hp: 20,
    mechanics: ["test:blast"],
  });
  const inside = testEntity({
    id: "inside",
    kind: "monster",
    hp: 10,
    position: { x: 1, y: 0 },
  });
  const outside = testEntity({
    id: "outside",
    kind: "monster",
    hp: 10,
    position: { x: 10, y: 10 },
  });
  for (const action of openingActions(
    "caster",
    seq,
    [caster, inside, outside],
    { caster: 10 },
    ["caster"]
  )) {
    const result = resolve(state, action, catalogue);
    if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
    state = result.state;
  }
  return state;
}

function cast(): Action {
  return {
    kind: "intent",
    id: nextActionId("i"),
    seq: seq(),
    by: "caster",
    entity: "caster",
    mechanic: "test:blast",
    program: "cast",
    targets: [],
    answers: { origin: { x: 0, y: 0 }, damage: 7 },
    payment: [],
    window: null,
    basedOn: 0,
  };
}

describe("area targeting — the reducer derives targets from positions, never trusts the client", () => {
  it("hits everyone inside the shape and no one outside it, ignoring a supplied targets array", () => {
    const result = resolve(opened(), cast(), catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "inside").vitals.hp).toBe(3);
    expect(mustEntity(result.state, "outside").vitals.hp).toBe(10);
  });

  it("rejects with missing-answer when the origin position wasn't answered", () => {
    const result = resolve(opened(), { ...cast(), answers: { damage: 7 } }, catalogue);
    expect(result.kind).toBe("rejected");
    if (result.kind !== "rejected") return;
    expect(result.rejection).toEqual({ reason: "missing-answer", input: "origin" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run tests/unit/combat/mechanic.test.ts tests/unit/combat/resolve.area.test.ts`
Expected: FAIL — `TargetSpec` doesn't accept `count: "area"` yet (TypeScript compile error), and
the reducer rejects the cast as `invalid-target` (today's strict `length !== count` check).

- [ ] **Step 3: Extend `TargetSpec` and add the semantic rule**

In `src/lib/combat/mechanic.ts`, add above `TargetSpec`:

```ts
export type AreaShapeSpec =
  | {
      readonly kind: "sphere" | "cylinder";
      readonly origin: string;
      readonly radiusFt: number;
    }
  | { readonly kind: "cube"; readonly origin: string; readonly sizeFt: number }
  | {
      readonly kind: "cone";
      readonly origin: string;
      readonly aim: string;
      readonly lengthFt: number;
    }
  | {
      readonly kind: "line";
      readonly origin: string;
      readonly aim: string;
      readonly lengthFt: number;
      readonly widthFt: number;
    };
```

Change `TargetSpec` (currently `{ readonly count: number; readonly eligibility: Predicate; }`):

```ts
export interface TargetSpec {
  readonly count: number | "area";
  readonly eligibility: Predicate;
  readonly area?: AreaShapeSpec;
}
```

In `checkProgram`, right after the existing `for (const [i, cost] of ...)` cost loop and before
the `for (const [i, step] of program.steps.entries())` loop, add:

```ts
if (program.targets) {
  const hasArea = program.targets.area !== undefined;
  if (program.targets.count === "area" && !hasArea) {
    return fail("area-required-by-count", `${path}.targets`);
  }
  if (program.targets.count !== "area" && hasArea) {
    return fail("area-requires-area-count", `${path}.targets`);
  }
}
```

- [ ] **Step 4: Run the conformance tests to verify they pass**

Run: `pnpm test --run tests/unit/combat/mechanic.test.ts`
Expected: PASS.

- [ ] **Step 5: Compute derived targets in `applyIntent`, sharing a `answerPosition` helper with `move`**

In `src/lib/combat/intent.ts`, add `type Position` to the `type` import from `./types`, add
`AreaShapeSpec` to the `type` import from `./mechanic` (currently
`import type { LifetimeSpec, Program, Step } from "./mechanic";`), and add `areaMembership` plus
`type AreaShape` to the import from `./position` (currently
`import { distanceFt, rangeBand, REACH_FT } from "./position";`):

```ts
import {
  areaMembership,
  distanceFt,
  rangeBand,
  REACH_FT,
  type AreaShape,
} from "./position";
```

Add a shared helper right after `answerNumber`:

```ts
/** A `position`-kind answer, given directly as `{x,y}` (never as a roll reference). */
function answerPosition(answers: IntentAction["answers"], key: string): Position | null {
  const value = answers[key];
  return typeof value === "object" &&
    value !== null &&
    "x" in value &&
    "y" in value &&
    typeof value.x === "number" &&
    typeof value.y === "number" &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y)
    ? { x: value.x, y: value.y }
    : null;
}

type AreaResolution =
  | { readonly kind: "shape"; readonly shape: AreaShape }
  | { readonly kind: "missing"; readonly input: string };

/** An authored `AreaShapeSpec` bound to the caster's `position` answers. */
function areaShapeFrom(
  spec: AreaShapeSpec,
  answers: IntentAction["answers"]
): AreaResolution {
  const origin = answerPosition(answers, spec.origin);
  if (origin === null) return { kind: "missing", input: spec.origin };
  switch (spec.kind) {
    case "sphere":
    case "cylinder":
      return {
        kind: "shape",
        shape: { kind: spec.kind, origin, radiusFt: spec.radiusFt },
      };
    case "cube":
      return { kind: "shape", shape: { kind: "cube", origin, sizeFt: spec.sizeFt } };
    case "cone":
    case "line": {
      const aim = answerPosition(answers, spec.aim);
      if (aim === null) return { kind: "missing", input: spec.aim };
      return {
        kind: "shape",
        shape:
          spec.kind === "cone"
            ? { kind: "cone", origin, aim, lengthFt: spec.lengthFt }
            : {
                kind: "line",
                origin,
                aim,
                lengthFt: spec.lengthFt,
                widthFt: spec.widthFt,
              },
      };
    }
    default:
      return assertNever(spec, "area shape spec");
  }
}
```

Refactor the `move` step to use `answerPosition` instead of its inline duplicate (in `runStep`'s
`case "move":`, replace the `const raw: unknown = ...` through `if (to === null) return {...}`
block):

```ts
      case "move": {
        const to = answerPosition(action.answers, step.to);
        if (to === null) return { reason: "missing-answer", input: step.to };
```

(leave the rest of the `move` case body unchanged — only the `to` computation changes).

Now replace `applyIntent`'s target-validation block (the `if (program.targets) { ... }` that
currently checks `action.targets.length !== program.targets.count`) with:

```ts
let effectiveTargets = action.targets;
if (program.targets) {
  if (program.targets.count === "area") {
    const spec = program.targets.area;
    if (!spec) return rejected({ reason: "unknown-mechanic", mechanic: action.mechanic }); // conformance forbids this; the type still needs narrowing
    const resolved = areaShapeFrom(spec, action.answers);
    if (resolved.kind === "missing") {
      return rejected({ reason: "missing-answer", input: resolved.input });
    }
    const candidates = Object.values(state.entities).map((e) => ({
      id: e.id,
      position: e.position,
    }));
    const targets = program.targets;
    effectiveTargets = areaMembership(resolved.shape, candidates).filter((target) => {
      const ctx: EvalContext = {
        self: action.entity,
        target,
        eventEntity: windowEvent,
        outcome: null,
        answers: action.answers,
      };
      return evalPredicate(targets.eligibility, state, ctx);
    });
  } else {
    if (action.targets.length !== program.targets.count) {
      return rejected({ reason: "invalid-target", entity: "" });
    }
    for (const target of action.targets) {
      if (!state.entities[target])
        return rejected({ reason: "unknown-entity", entity: target });
      const ctx: EvalContext = {
        self: action.entity,
        target,
        eventEntity: windowEvent,
        outcome: null,
        answers: action.answers,
      };
      if (!evalPredicate(program.targets.eligibility, state, ctx)) {
        return rejected({ reason: "invalid-target", entity: target });
      }
    }
  }
}
const effectiveAction: IntentAction = { ...action, targets: effectiveTargets };
```

Only two sites are functionally required to switch to `effectiveAction` (everything else in the
function — `payCosts(entity, program, action)`, the `paidState` construction — only reads
`action.entity`/`action.payment`, never `.targets`, so leave those on the original `action`):

1. The `runProgram(paidState, program, action, payment.castLevel, events, {...})` call — change
   its third argument from `action` to `effectiveAction`. This is the one call that actually
   iterates `.targets`, so it's the only change with real effect.
2. The held-window branch's `declared: { ...paidState.declared, [action.id]: { ...action, payment: [] } }`
   — change the spread from `{ ...action, payment: [] }` to `{ ...effectiveAction, payment: [] }`,
   so a future window-holdable area program (none exist yet) replays with its resolved targets,
   not a stale or empty client-submitted list.

For every non-area program, `effectiveTargets === action.targets` (the `else` branch just copies
it through), so both changes are no-ops there — this only changes behavior for `count: "area"`
programs.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test --run tests/unit/combat/resolve.area.test.ts tests/unit/combat/resolve.move.test.ts tests/unit/combat/resolve.intent.test.ts tests/unit/combat/replays.test.ts`
Expected: PASS (the `move` step's behavior is unchanged — same parsing, same rejection — and every
non-area program's target validation is byte-identical to before).

- [ ] **Step 7: Commit**

```bash
git add src/lib/combat/mechanic.ts src/lib/combat/intent.ts \
  tests/unit/combat/mechanic.test.ts tests/unit/combat/resolve.area.test.ts \
  .changeset/v2-stage-3-area-targeting.md
git commit -m "feat(combat): area-targeted programs (TargetSpec.count: \"area\")"
```

Add `.changeset/v2-stage-3-area-targeting.md`:

```markdown
---
"d20-folio": patch
---

`TargetSpec.count` accepts `"area"` with an `AreaShapeSpec`: the reducer derives affected entities
itself from the caster's declared origin/aim and every entity's current position (stage 2's
`areaMembership`), never from a client-supplied target list. No new step vocabulary — an area
save-and-halve spell reuses the existing `save`+`damage` step pair.
```

---

## Task 4: Fireball (levelled area save spell)

**Files:**

- Modify: `src/data/combat/prototype-catalogue.ts` (new `fireball` mechanic, add to
  `PROTOTYPE_MECHANICS`)
- Test: implicitly covered by Task 6's golden replay; add one focused unit test here so Task 4 is
  independently verifiable before the replay exists.
- Test: `tests/unit/combat/resolve.intent.test.ts` (extend with one `it`)

**Interfaces:**

- Consumes: `AreaShapeSpec`, `TargetSpec.count: "area"` (Task 3).
- Produces: mechanic id `"srd:spell:fireball"`, program id `"cast"` — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/combat/resolve.intent.test.ts` (inside the existing `describe("resolve — intents", ...)`
block, reusing its `ranger`/`goblin`/`opened()`/`intent()` fixtures). Fireball needs the ranger to
know the mechanic and hold a 3rd-level slot, so extend the shared `ranger` fixture: add
`"srd:spell:fireball"` to its `mechanics` array and `"slot-3": { current: 1, max: 1, recharge: "long" }`
to its `resources`. Multiple targets are proven by Task 6's replay; this test pins the single-
target arithmetic and the cost. The ranger stays unpositioned (`position: null`), so
`areaMembership` skips him — a positioned caster 5 ft from the origin would be inside his own
20 ft blast and the cast would need a `save:ranger` answer.

```ts
it("Fireball: a DEX save halves the blast, the caster outside it is untouched, a 3rd-level slot is spent", () => {
  const base = opened();
  const state = {
    ...base,
    entities: {
      ...base.entities,
      "monster-1": { ...base.entities["monster-1"], position: { x: 1, y: 0 } },
    },
  };
  const result = resolve(
    state,
    intent("p1", "ranger", "srd:spell:fireball", "cast", {
      answers: {
        origin: { x: 1, y: 0 },
        "save:monster-1": 13, // 13 + DEX save 0 = 13 ≥ DC 13 → half
        damage: 8,
      },
    }),
    catalogue
  );
  expect(result.kind).toBe("applied");
  if (result.kind !== "applied") return;
  expect(mustEntity(result.state, "monster-1").vitals.hp).toBe(3); // 7 − floor(8 / 2)
  expect(mustEntity(result.state, "ranger").vitals.hp).toBe(20); // outside: no save asked, no damage
  expect(mustEntity(result.state, "ranger").resources["slot-3"]?.current).toBe(0);
  expect(result.receipt.paid).toEqual(["turn:action", "slot:3"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test --run tests/unit/combat/resolve.intent.test.ts`
Expected: FAIL — `unknown-mechanic` (`srd:spell:fireball` isn't in the catalogue yet).

- [ ] **Step 3: Author Fireball in the prototype catalogue**

In `src/data/combat/prototype-catalogue.ts`, add (after `giggle`, before `shortsword`, to keep the
file's existing rough ordering of "weapons, then spells, then movement"):

```ts
/** Fireball, at its base 3rd-level cast: a 20-ft-radius sphere, DEX save for half, 8d6 fire.
 *  No upcast scaling for stage 3 (Marco's story is a beginner's first, base-level cast) — an
 *  upcast Fireball needs `Input.dice.formula` to grow a `byLevel` variant, deliberately out of
 *  scope until a story needs it. */
export const fireball: Mechanic = {
  schema: 1,
  id: "srd:spell:fireball",
  source: "srd",
  active: [
    {
      id: "cast",
      trigger: { kind: "invocation", economy: "action" },
      cost: [
        { kind: "turn", claim: "action" },
        { kind: "slot", level: 3 },
      ],
      targets: {
        count: "area",
        eligibility: { all: [] },
        area: { kind: "sphere", origin: "origin", radiusFt: 20 },
      },
      inputs: [
        { id: "origin", kind: "position" },
        { id: "save", kind: "d20", for: "save", ability: "DEX", perTarget: true },
        { id: "damage", kind: "dice", formula: "8d6" },
      ],
      steps: [
        {
          id: "burn",
          kind: "save",
          roll: "save",
          ability: "DEX",
          dc: "spell",
          onSuccess: "half",
        },
        {
          id: "scorch",
          kind: "damage",
          parts: [{ dice: "damage", type: "fire" }],
          to: "$target",
        },
      ],
    },
  ],
};
```

Add `fireball` to `PROTOTYPE_MECHANICS`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test --run tests/unit/combat/resolve.intent.test.ts`
Expected: PASS.

- [ ] **Step 5: Regenerate coverage**

Run: `WRITE_COMBAT_COVERAGE=1 pnpm test --run tests/unit/combat/coverage.guard.test.ts`
Expected: the guard's second assertion passes and `docs/automation-coverage.prototype.json` gains
Fireball's rows (`burn` → `physical-input`, `scorch` → `automated`, program `*` → `automated`).

- [ ] **Step 6: Commit**

```bash
git add src/data/combat/prototype-catalogue.ts tests/unit/combat/resolve.intent.test.ts \
  docs/automation-coverage.prototype.json .changeset/v2-stage-3-fireball.md
git commit -m "feat(combat): author Fireball as a levelled area save spell"
```

Add `.changeset/v2-stage-3-fireball.md`:

```markdown
---
"d20-folio": patch
---

Author Fireball (base 3rd-level cast, no upcast scaling yet) using the new area-targeting seam —
proves an area save-and-halve spell needs no new step vocabulary.
```

---

## Task 5: Monster adapter

**Files:**

- Create: `src/lib/combat/monster-adapter.ts`
- Test: `tests/unit/combat/monster-adapter.test.ts` (new)

**Interfaces:**

- Consumes: `type { MonsterAttackEntry, MonsterEntry, MonsterSaveEntry, MonsterStatBlock } from "@/data/types"`
  (type-only — this compiles away, no runtime/bundle dependency; the boundary guard's forbidden
  patterns don't cover `@/data`).
- Produces: `export function monsterMechanics(block: MonsterStatBlock): Mechanic` — consumed by
  Task 7 (the real Ogre, in Sara's replay).

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/combat/monster-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCatalogue } from "@/lib/combat/catalogue";
import { conformMechanic } from "@/lib/combat/mechanic";
import { monsterMechanics } from "@/lib/combat/monster-adapter";
import { initialState } from "@/lib/combat/fold";
import { resolve } from "@/lib/combat/resolve";
import { mustEntity } from "@/lib/combat/state";
import type { Action, FoldedState } from "@/lib/combat/types";
import type { MonsterStatBlock } from "@/data/types";
import { testEntity } from "./__helpers__/entities";
import { nextActionId, openingActions, seqFactory } from "./__helpers__/state";

const block: MonsterStatBlock = {
  id: "test-brute",
  cr: 1,
  sizes: ["Medium"],
  type: "humanoid",
  alignment: "unaligned",
  ac: 12,
  hp: { average: 20, formula: "3d8+6" },
  speeds: { walk: 30 },
  abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 8, WIS: 10, CHA: 8 },
  actions: [
    {
      id: "club",
      kind: "attack",
      attack: "melee",
      toHit: 5,
      reachFt: 5,
      damage: [{ dice: "1d6+3", damageType: "bludgeoning" }],
    },
    {
      id: "sling",
      kind: "attack",
      attack: "ranged",
      toHit: 3,
      rangeFt: { near: 30, far: 120 },
      damage: [{ dice: "1d4", damageType: "bludgeoning" }],
    },
    {
      id: "roar",
      kind: "save",
      save: "WIS",
      dc: 12,
      damage: [{ dice: "2d6", damageType: "thunder" }],
      onSuccess: "half",
    },
    { id: "multiattack", kind: "narrative" },
  ],
  source: "SRD",
};

describe("monsterMechanics — the adapter", () => {
  it("compiles a conformant mechanic", () => {
    const mechanic = monsterMechanics(block);
    const result = conformMechanic(mechanic);
    expect(result.ok).toBe(true);
  });

  it("maps an attack entry to an attack program using its printed to-hit and damage", () => {
    const mechanic = monsterMechanics(block);
    const club = mechanic.active?.find((p) => p.id === "club");
    expect(club?.steps).toEqual([
      {
        id: "hit",
        kind: "attack",
        roll: "roll",
        bonus: 5,
        damage: [{ dice: "damage-0", type: "bludgeoning" }],
      },
    ]);
    expect(club?.targets?.eligibility).toEqual({
      relation: "adjacent",
      between: ["$self", "$target"],
      value: true,
    });
  });

  it("maps a ranged attack entry to visible eligibility, not adjacent", () => {
    const mechanic = monsterMechanics(block);
    const sling = mechanic.active?.find((p) => p.id === "sling");
    expect(sling?.targets?.eligibility).toEqual({
      relation: "visible",
      between: ["$self", "$target"],
      value: true,
    });
  });

  it("maps a save entry to save+damage with the printed DC and half-on-success", () => {
    const mechanic = monsterMechanics(block);
    const roar = mechanic.active?.find((p) => p.id === "roar");
    expect(roar?.steps).toEqual([
      {
        id: "resist",
        kind: "save",
        roll: "save",
        ability: "WIS",
        dc: 12,
        onSuccess: "half",
      },
      {
        id: "harm",
        kind: "damage",
        parts: [{ dice: "damage-0", type: "thunder" }],
        to: "$target",
      },
    ]);
  });

  it("degrades a prose-only entry (Multiattack) to manual-table, never drops or half-builds it", () => {
    const mechanic = monsterMechanics(block);
    const multi = mechanic.active?.find((p) => p.id === "multiattack");
    expect(multi?.steps).toEqual([
      { id: "resolve", kind: "manual-table", label: "test-brute.actions.multiattack" },
    ]);
  });

  it("an adapted attack actually resolves through the reducer", () => {
    const mechanic = monsterMechanics(block);
    const { catalogue } = buildCatalogue([mechanic]);
    const seq = seqFactory("dm");
    const monster = testEntity({
      id: "brute",
      kind: "monster",
      controllerUid: "dm",
      mechanics: ["monster:test-brute"],
    });
    const hero = testEntity({ id: "hero", kind: "pc", hp: 20, ac: 10 });
    let state: FoldedState = initialState();
    for (const action of openingActions(
      "dm",
      seq,
      [monster, hero],
      { brute: 10, hero: 5 },
      ["brute", "hero"]
    )) {
      const result = resolve(state, action, catalogue);
      if (result.kind === "rejected") throw new Error(JSON.stringify(result.rejection));
      state = result.state;
    }
    state = { ...state, relations: [{ kind: "adjacent", a: "brute", b: "hero" }] };
    const attack: Action = {
      kind: "intent",
      id: nextActionId("m"),
      seq: seq(),
      by: "dm",
      entity: "brute",
      mechanic: "monster:test-brute",
      program: "club",
      targets: ["hero"],
      answers: { roll: 15, "damage-0": 6 }, // 15 + 5 = 20 ≥ AC 10
      payment: [],
      window: null,
      basedOn: 0,
    };
    const result = resolve(state, attack, catalogue);
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(mustEntity(result.state, "hero").vitals.hp).toBe(14);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test --run tests/unit/combat/monster-adapter.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the adapter**

Create `src/lib/combat/monster-adapter.ts`:

```ts
/**
 * The monster adapter: `MonsterStatBlock` (typed SRD/pack/homebrew data) → `Mechanic`. The only
 * place that understands `MonsterEntry`; everything downstream sees ordinary mechanic data.
 * Spec: docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md §4.
 *
 * Stage 3 scope: `block.actions` only — a structured `attack`/`save` entry becomes an `attack`/
 * `save`+`damage` program; every prose-only entry (Multiattack included: the corpus carries no
 * structured attack count for it yet) becomes `manual-table`, per §4's own rule. `traits`,
 * `reactions`, `legendaryActions` and `recharge`/`legendary` costs are `later` (authoring spec §6).
 */
import type {
  MonsterAttackEntry,
  MonsterEntry,
  MonsterSaveEntry,
  MonsterStatBlock,
} from "@/data/types";
import type { DamagePart, Input, Mechanic, Program, Step } from "./mechanic";

// `MonsterDamage.damageType` and `MonsterSaveEntry.save` are the same string-literal unions as this
// engine's `DamageType`/`Ability` (`src/types/damage.ts`, `src/types/combat-outcome.ts`), so they
// assign without casts.

function labelFor(block: MonsterStatBlock, entry: MonsterEntry): string {
  return `${block.id}.actions.${entry.id}`;
}

/** `null` parts means at least one damage clause has no fixed `damageType` (a use-time
 *  `damageChoice`) — not automatable yet; the caller falls back to `manual-table`. */
function damageParts(
  damage: MonsterAttackEntry["damage"]
): { readonly inputs: Input[]; readonly parts: DamagePart[] } | null {
  const inputs: Input[] = [];
  const parts: DamagePart[] = [];
  for (const [index, clause] of damage.entries()) {
    if (!clause.damageType) return null;
    const id = `damage-${index}`;
    inputs.push({ id, kind: "dice", formula: clause.dice });
    parts.push({ dice: id, type: clause.damageType });
  }
  return { inputs, parts };
}

function attackProgram(entry: MonsterAttackEntry): Program | null {
  const compiled = damageParts(entry.damage);
  if (!compiled) return null;
  const step: Step = {
    id: "hit",
    kind: "attack",
    roll: "roll",
    bonus: entry.toHit,
    damage: compiled.parts,
  };
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "attack" }],
    targets: {
      count: 1,
      eligibility: {
        relation: entry.attack === "melee" ? "adjacent" : "visible",
        between: ["$self", "$target"],
        value: true,
      },
    },
    inputs: [{ id: "roll", kind: "d20", for: "attack" }, ...compiled.inputs],
    steps: [step],
  };
}

function saveProgram(entry: MonsterSaveEntry): Program | null {
  if (entry.onSuccess === "special") return null; // prose-only outcome
  const compiled = damageParts(entry.damage ?? []);
  if (!compiled) return null;
  const steps: Step[] = [
    {
      id: "resist",
      kind: "save",
      roll: "save",
      ability: entry.save,
      dc: entry.dc,
      onSuccess: entry.onSuccess === "half" ? "half" : "negate",
    },
  ];
  if (compiled.parts.length > 0) {
    steps.push({ id: "harm", kind: "damage", parts: compiled.parts, to: "$target" });
  }
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "action" }],
    targets: {
      count: 1,
      eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
    },
    inputs: [
      { id: "save", kind: "d20", for: "save", ability: entry.save },
      ...compiled.inputs,
    ],
    steps,
  };
}

function manualProgram(entry: MonsterEntry, block: MonsterStatBlock): Program {
  return {
    id: entry.id,
    trigger: { kind: "invocation", economy: "action" },
    cost: [{ kind: "turn", claim: "action" }],
    steps: [{ id: "resolve", kind: "manual-table", label: labelFor(block, entry) }],
  };
}

export function monsterMechanics(block: MonsterStatBlock): Mechanic {
  const active: Program[] = block.actions.map((entry) => {
    const structured =
      entry.kind === "attack"
        ? attackProgram(entry)
        : entry.kind === "save"
          ? saveProgram(entry)
          : null;
    return structured ?? manualProgram(entry, block);
  });
  return { schema: 1, id: `monster:${block.id}`, source: "monster", active };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --run tests/unit/combat/monster-adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the boundary guard still passes**

Run: `pnpm test --run tests/unit/combat/boundary.guard.test.ts`
Expected: PASS — `monster-adapter.ts`'s only import beyond `./ids`/`./mechanic`/`./types` is a
`type`-only import from `@/data/types`, which the guard's regex list doesn't forbid (it forbids
`@/i18n`, `@/features`, `@/components`, `@/stores`, react, firebase, zustand, and RNG/clock calls
— not `@/data`, and a type import has no runtime `from` statement to match against besides the
literal string, which also isn't in the forbidden list).

- [ ] **Step 6: Commit**

```bash
git add src/lib/combat/monster-adapter.ts tests/unit/combat/monster-adapter.test.ts \
  .changeset/v2-stage-3-monster-adapter.md
git commit -m "feat(combat): monster stat-block adapter (attack, save, manual-table fallback)"
```

Add `.changeset/v2-stage-3-monster-adapter.md`:

```markdown
---
"d20-folio": patch
---

Add `monsterMechanics(block)`: converts a typed `MonsterStatBlock`'s structured actions into
reducer-ready programs, degrading anything prose-only (Multiattack included — the corpus has no
structured attack count for it yet) to `manual-table` rather than half-building it.
```

---

## Task 6: Golden replay — Marco's first turn

**Files:**

- Create: `tests/unit/combat/replays/marco-first-turn.json`

**Interfaces:**

- Consumes: `core:move` (existing), `srd:spell:fireball` (Task 4).

- [ ] **Step 1: Write the replay fixture**

Create `tests/unit/combat/replays/marco-first-turn.json`:

```json
{
  "name": "Marco's first turn — move, then Fireball on three goblins (PRODUCT.md acceptance story 1)",
  "dm": "dm",
  "entities": [
    {
      "id": "marco",
      "kind": "pc",
      "controllerUid": "p-marco",
      "hp": 25,
      "ac": 15,
      "abilities": { "DEX": 2 },
      "mechanics": ["core:move", "srd:spell:fireball"],
      "resources": { "slot-3": { "current": 1, "max": 1, "recharge": "long" } }
    },
    {
      "id": "goblin-1",
      "kind": "monster",
      "controllerUid": "dm",
      "hp": 7,
      "ac": 15,
      "saves": { "DEX": 2 },
      "position": { "x": 6, "y": 0 }
    },
    {
      "id": "goblin-2",
      "kind": "monster",
      "controllerUid": "dm",
      "hp": 7,
      "ac": 15,
      "saves": { "DEX": 2 },
      "position": { "x": 7, "y": 1 }
    },
    {
      "id": "goblin-3",
      "kind": "monster",
      "controllerUid": "dm",
      "hp": 7,
      "ac": 15,
      "saves": { "DEX": 2 },
      "position": { "x": 6, "y": 2 }
    }
  ],
  "initiative": { "marco": 18, "goblin-1": 12, "goblin-2": 11, "goblin-3": 10 },
  "order": ["marco", "goblin-1", "goblin-2", "goblin-3"],
  "log": [
    {
      "id": "move",
      "by": "p-marco",
      "kind": "intent",
      "entity": "marco",
      "mechanic": "core:move",
      "program": "move",
      "targets": [],
      "answers": { "to": { "x": 2, "y": 0 } },
      "payment": [],
      "window": null,
      "basedOn": 0
    },
    {
      "id": "r-save-1",
      "by": "dm",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [5],
        "total": 5,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": null,
        "purpose": "save",
        "label": null
      }
    },
    {
      "id": "r-save-2",
      "by": "dm",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [15],
        "total": 15,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": null,
        "purpose": "save",
        "label": null
      }
    },
    {
      "id": "r-save-3",
      "by": "dm",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [8],
        "total": 8,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": null,
        "purpose": "save",
        "label": null
      }
    },
    {
      "id": "r-damage",
      "by": "p-marco",
      "kind": "roll",
      "roll": {
        "formula": "8d6",
        "faces": [1, 1, 1, 1, 1, 1, 1, 1],
        "total": 8,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": "marco",
        "purpose": "damage",
        "label": null
      }
    },
    {
      "id": "cast-fireball",
      "by": "p-marco",
      "kind": "intent",
      "entity": "marco",
      "mechanic": "srd:spell:fireball",
      "program": "cast",
      "targets": [],
      "answers": {
        "origin": { "x": 7, "y": 1 },
        "save:goblin-1": { "roll": "r-save-1" },
        "save:goblin-2": { "roll": "r-save-2" },
        "save:goblin-3": { "roll": "r-save-3" },
        "damage": { "roll": "r-damage" }
      },
      "payment": [],
      "window": null,
      "basedOn": 0
    }
  ],
  "expect": {
    "applied": 6,
    "rejections": [],
    "state": {
      "entities.marco.position": { "x": 2, "y": 0 },
      "entities.marco.resources.slot-3.current": 0,
      "entities.marco.turn.action": 1,
      "entities.goblin-1.vitals.hp": 0,
      "entities.goblin-1.vitals.life": "dead",
      "entities.goblin-2.vitals.hp": 3,
      "entities.goblin-2.vitals.life": "alive",
      "entities.goblin-3.vitals.hp": 0,
      "entities.goblin-3.vitals.life": "dead"
    }
  }
}
```

(Sphere membership is Euclidean in feet (`position.ts` `inShape`: `Math.hypot`), 5 ft/cell:
origin (7,1) to goblin-1 (6,0) = √(5²+5²) ≈ 7.1 ft; to goblin-2 (7,1) = 0 ft; to goblin-3 (6,2)
≈ 7.1 ft — all ≤ 20 ft, all inside. Origin to marco's post-move position (2,0) = √(25²+5²) ≈
25.5 ft — outside the 20 ft blast, marco isn't caught by his own spell (the `move` uses Chebyshev
for the movement budget: (0,0)→(2,0) is 10 ft of 30). Goblin-1/3 fail their DEX save (5+2=7 and
8+2=10, both < DC 13) and take the full 8 fire damage — 7 HP, hp clamps to 0, non-PC life resolves
to `"dead"`. Goblin-2 succeeds (15+2=17 ≥ 13) and takes half — `Math.floor(8/2)=4` — 7−4=3 HP,
stays `"alive"`. The save rolls carry `roller: null`: `rollsUsable` (resolve.ts) binds a roll to
the intent's entity, and a per-target save is rolled for the target inside the caster's intent —
attributing those rolls to each goblin is a known seam for the shared-document stage, recorded in
Task 8's "Out of stage 3".)

- [ ] **Step 2: Run the replay to verify it passes**

Run: `pnpm test --run tests/unit/combat/replays.test.ts`
Expected: PASS — the new file is picked up automatically (`readdirSync(DIR)`), no other change
needed.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/replays/marco-first-turn.json .changeset/v2-stage-3-marco-replay.md
git commit -m "test(combat): golden replay — Marco's first turn (move, Fireball, three goblins)"
```

Add `.changeset/v2-stage-3-marco-replay.md`:

```markdown
---
"d20-folio": patch
---

Golden replay for acceptance story 1: Marco moves, casts Fireball on three goblins, one saves for
half and survives, two fail and die — proving the area-targeting seam and Fireball end to end.
```

---

## Task 7: Golden replay — Sara's ogre ambush

**Files:**

- Modify: `src/data/combat/prototype-catalogue.ts` (add a hand-copied real Ogre `MonsterStatBlock`
  fixture + `monsterMechanics(ogreStatBlock)`; add a small homebrew sword mechanic; both to
  `PROTOTYPE_MECHANICS`)
- Create: `tests/unit/combat/replays/sara-ogre-ambush.json`

**Interfaces:**

- Consumes: `monsterMechanics` (Task 5), `Automation`/`log-only` (Task 1), direct-patch
  `vitals.hp` override (Task 2).

- [ ] **Step 1: Add the real Ogre fixture and a homebrew sword to the prototype catalogue**

In `src/data/combat/prototype-catalogue.ts`, add `import type { MonsterStatBlock } from "@/data/types";`
and `import { monsterMechanics } from "@/lib/combat/monster-adapter";` to the top of the file
(both are safe: the type import erases, and `monster-adapter.ts` itself only carries a type-only
`@/data/types` dependency per Task 5 — no eager runtime import of the guarded monster corpus).

Add, after `move`:

```ts
/** The real 2024 SRD Ogre (AC 11, HP 68, CR 2) — hand-copied from `src/data/monsters/n-p.ts`
 *  rather than imported, because that corpus is bundle-budget-guarded as lazy-only (its own
 *  header: "Nothing eager may import this module") and this catalogue is loaded eagerly by
 *  every combat test. Adapted through `monsterMechanics`, not hand-authored, so this is exactly
 *  what the real bestiary entry produces. */
const ogreStatBlock: MonsterStatBlock = {
  id: "ogre",
  cr: 2,
  sizes: ["Large"],
  type: "giant",
  alignment: "chaotic-evil",
  ac: 11,
  hp: { average: 68, formula: "8d10+24" },
  speeds: { walk: 40 },
  abilityScores: { STR: 19, DEX: 8, CON: 16, INT: 5, WIS: 7, CHA: 7 },
  senses: { darkvisionFt: 60 },
  languages: { ids: ["common", "giant"] },
  gear: [{ id: "greatclub" }, { id: "javelin", qty: 3 }],
  actions: [
    {
      id: "greatclub",
      kind: "attack",
      attack: "melee",
      toHit: 6,
      reachFt: 5,
      damage: [{ dice: "2d8+4", damageType: "bludgeoning" }],
    },
    {
      id: "javelin",
      kind: "attack",
      attack: "melee-or-ranged",
      toHit: 6,
      reachFt: 5,
      rangeFt: { near: 30, far: 120 },
      damage: [{ dice: "2d6+4", damageType: "piercing" }],
    },
  ],
  source: "SRD",
};

export const ogre: Mechanic = monsterMechanics(ogreStatBlock);

/** A homebrew shortsword reskin for the golden replay's "the group's own custom weapon" case —
 *  a table-authored mechanic, not SRD; shape mirrors `shortsword` minus the opportunity-attack
 *  program (out of scope for this replay). */
export const homebrewBlade: Mechanic = {
  schema: 1,
  id: "homebrew:weapon:saras-blade",
  source: "homebrew",
  active: [
    {
      id: "attack",
      trigger: { kind: "invocation", economy: "action" },
      cost: [{ kind: "turn", claim: "attack" }],
      targets: {
        count: 1,
        eligibility: { relation: "visible", between: ["$self", "$target"], value: true },
      },
      inputs: [
        { id: "roll", kind: "d20", for: "attack" },
        { id: "damage", kind: "dice", formula: "1d6" },
      ],
      steps: [
        {
          id: "stab",
          kind: "attack",
          roll: "roll",
          bonus: { sum: [{ ability: "DEX" }, { stat: "proficiency" }] },
          damage: [{ dice: "damage", type: "slashing" }],
        },
      ],
    },
  ],
};
```

Add both `ogre` and `homebrewBlade` to `PROTOTYPE_MECHANICS`.

- [ ] **Step 2: Regenerate coverage (the catalogue changed again)**

Run: `WRITE_COMBAT_COVERAGE=1 pnpm test --run tests/unit/combat/coverage.guard.test.ts`
Expected: PASS, `docs/automation-coverage.prototype.json` gains the ogre's two attack programs and
the homebrew blade's attack program.

- [ ] **Step 3: Write the replay fixture**

Create `tests/unit/combat/replays/sara-ogre-ambush.json`:

```json
{
  "name": "Sara's ogre ambush — log-only, a hidden roll, an overridden result, a homebrew sword (PRODUCT.md acceptance story 2)",
  "dm": "dm",
  "entities": [
    {
      "id": "hero",
      "kind": "pc",
      "controllerUid": "p-hero",
      "hp": 30,
      "ac": 16,
      "abilities": { "DEX": 2 },
      "mechanics": ["homebrew:weapon:saras-blade"],
      "position": { "x": 0, "y": 0 }
    },
    {
      "id": "ogre",
      "kind": "monster",
      "controllerUid": "dm",
      "hp": 68,
      "ac": 11,
      "mechanics": ["monster:ogre"],
      "position": { "x": 1, "y": 0 }
    }
  ],
  "initiative": { "ogre": 18, "hero": 10 },
  "order": ["ogre", "hero"],
  "log": [
    {
      "id": "d-adjacent",
      "by": "dm",
      "kind": "declare",
      "relation": { "kind": "adjacent", "a": "hero", "b": "ogre" },
      "remove": false,
      "mover": null
    },
    {
      "id": "d-visible-1",
      "by": "dm",
      "kind": "declare",
      "relation": { "kind": "visible", "a": "hero", "b": "ogre", "value": true },
      "remove": false,
      "mover": null
    },
    {
      "id": "d-visible-2",
      "by": "dm",
      "kind": "declare",
      "relation": { "kind": "visible", "a": "ogre", "b": "hero", "value": true },
      "remove": false,
      "mover": null
    },
    {
      "id": "s-log-only",
      "by": "dm",
      "kind": "table",
      "table": { "op": "settings", "revealMonsterHp": false, "automation": "log-only" }
    },
    {
      "id": "r-ogre-atk",
      "by": "dm",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [14],
        "total": 14,
        "seed": null,
        "source": "manual",
        "hidden": true,
        "roller": "ogre",
        "purpose": "attack",
        "label": null
      }
    },
    {
      "id": "r-ogre-dmg",
      "by": "dm",
      "kind": "roll",
      "roll": {
        "formula": "2d8+4",
        "faces": [5, 3],
        "total": 12,
        "seed": null,
        "source": "manual",
        "hidden": true,
        "roller": "ogre",
        "purpose": "damage",
        "label": null
      }
    },
    {
      "id": "ogre-attacks",
      "by": "dm",
      "kind": "intent",
      "entity": "ogre",
      "mechanic": "monster:ogre",
      "program": "greatclub",
      "targets": ["hero"],
      "answers": {
        "roll": { "roll": "r-ogre-atk" },
        "damage-0": { "roll": "r-ogre-dmg" }
      },
      "payment": [],
      "window": null,
      "basedOn": 0
    },
    {
      "id": "dm-applies-by-hand",
      "by": "dm",
      "kind": "override",
      "entity": "hero",
      "path": "vitals.hp",
      "value": 18,
      "reason": "ogre's greatclub — table plays log-only, applying the receipt by hand"
    },
    {
      "id": "s-full-auto",
      "by": "dm",
      "kind": "table",
      "table": { "op": "settings", "revealMonsterHp": false, "automation": "full-auto" }
    },
    { "id": "end-ogre-turn", "by": "dm", "kind": "table", "table": { "op": "end-turn" } },
    {
      "id": "r-hero-atk",
      "by": "p-hero",
      "kind": "roll",
      "roll": {
        "formula": "1d20",
        "faces": [16],
        "total": 16,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": "hero",
        "purpose": "attack",
        "label": null
      }
    },
    {
      "id": "r-hero-dmg",
      "by": "p-hero",
      "kind": "roll",
      "roll": {
        "formula": "1d6",
        "faces": [4],
        "total": 4,
        "seed": null,
        "source": "manual",
        "hidden": false,
        "roller": "hero",
        "purpose": "damage",
        "label": null
      }
    },
    {
      "id": "hero-attacks",
      "by": "p-hero",
      "kind": "intent",
      "entity": "hero",
      "mechanic": "homebrew:weapon:saras-blade",
      "program": "attack",
      "targets": ["ogre"],
      "answers": { "roll": { "roll": "r-hero-atk" }, "damage": { "roll": "r-hero-dmg" } },
      "payment": [],
      "window": null,
      "basedOn": 0
    }
  ],
  "expect": {
    "applied": 13,
    "rejections": [],
    "state": {
      "settings.automation": "full-auto",
      "clock.current": "hero",
      "entities.hero.vitals.hp": 18,
      "entities.ogre.vitals.hp": 64,
      "entities.ogre.turn.attacksUsed": 0
    }
  }
}
```

(Ogre's greatclub: 14 + 6 = 20 ≥ AC 16, hits — but automation is `log-only` at that point, so the
reducer computes the full 12-damage verdict yet applies nothing, not even the attack claim
(`ogre.turn.attacksUsed` stays 0 — the DM keeps the economy by hand at a log-only table);
`hero.vitals.hp` only changes once the DM's `override` directly patches it to 18, per Task 2. The
`end-turn` is required: `applyIntent` rejects an invocation off the actor's turn (`not-your-turn`),
and the order is `[ogre, hero]`. Hero's blade: DEX 2 + PB 2 = 4; 16 + 4 = 20 ≥ AC 11, hits for 4
slashing — full-auto by then, applies immediately: 68 − 4 = 64.
Literal fog/tokens-on-a-map aren't reducer concepts yet — stage 5's minimum map — so this replay
demonstrates every _reducer_-level element of the story: hidden rolls, the monsters' own action
via the adapter, an overridden result, a homebrew weapon, and the automation level changing
mid-session.)

- [ ] **Step 4: Run the replay to verify it passes**

Run: `pnpm test --run tests/unit/combat/replays.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full combat suite**

Run: `pnpm test --run tests/unit/combat`
Expected: PASS, every file.

- [ ] **Step 6: Commit**

```bash
git add src/data/combat/prototype-catalogue.ts docs/automation-coverage.prototype.json \
  tests/unit/combat/replays/sara-ogre-ambush.json .changeset/v2-stage-3-sara-replay.md
git commit -m "test(combat): golden replay — Sara's ogre ambush (log-only, override, homebrew sword)"
```

Add `.changeset/v2-stage-3-sara-replay.md`:

```markdown
---
"d20-folio": patch
---

Golden replay for acceptance story 2: a real 2024 SRD Ogre through the monster adapter, a
log-only hidden attack the DM applies by hand via override, then full-auto for a homebrew sword —
proving automation levels, the adapter, and the override fix end to end.
```

---

## Task 8: Vocabulary-tier doc reconciliation, and stage close-out

**Files:**

- Modify: `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` (§6 table)
- Modify: `docs/PROGRAM_STATUS.md` (close stage 3)
- Create: `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` (stage 4 handoff — use the
  actual date this task runs)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Fix the §6 vocabulary-tiers table's drift from the implementation**

Read `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md` §6 first (its table is
reproduced in this plan's research, but re-read the live file before editing — other stage-3
tasks may have touched it). The **Steps** row currently lists a "Later" column including
`move-mark` and `manual-table`, and a "Stage 3" column including `effect-end` — but `effect-end`
is not and has never been a step kind in `STEP_KINDS` (mechanic.ts), while `move-mark` (Hunter's
Mark), `manual-table` (this stage's monster adapter), `turn-claim` and `negate` are all already
implemented and reachable. Replace the **Steps** row with:

```markdown
| Steps | `attack`, `save`, `damage`, `heal`, `effect-start`, `condition`, `move-mark`, `turn-claim`, `negate`, `manual-table`, `move` | `summon`, `transform`, `aura`, `ready` |
```

Replace the **Lifetimes** row (currently lists `seconds`/`rest`/`day-phase` all under "Later",
but `seconds` and `rest` are both implemented and reachable from authored data — `LifetimeSpec` in
`mechanic.ts` has exactly `manual | turn-edge | rounds | seconds | rest`, no `day-phase` variant
at all) with:

```markdown
| Lifetimes | `manual`, `turn-edge`, `rounds`, `seconds`, `rest` | `day-phase` |
```

Add one sentence after the table noting area targeting and the monster adapter's actual stage-3
shape (attack/save entries automated, everything else `manual-table`):

```markdown
Stage 3 also added area targeting (`TargetSpec.count: "area"`, an `AreaShapeSpec` parametrized by
`position`-kind inputs, resolved against stage 2's `areaMembership`) and the monster adapter
(`monsterMechanics`, `src/lib/combat/monster-adapter.ts`): `block.actions`' `attack`/`save`
entries automate, everything else — Multiattack included, since the corpus carries no structured
attack count for it — degrades to `manual-table`. `traits`, `reactions`, `legendaryActions` and
`recharge`/`legendary` costs stay `later`.
```

- [ ] **Step 2: Run the full local gate**

Run: `just ci`
Run: `pnpm test:rules`
Run: `vite build && pnpm test:budget`
Run: `just ci-srd-only` (touched `src/lib/combat`, `src/data/combat`, and `docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md`
— all public/SRD)

Expected: all green, and note the measured wall-clock times (compare against stage 2's
4 min 26 s / 15.3 s / ~2 s / 2 min 13 s baseline — the target stays under 15 minutes combined).

- [ ] **Step 3: Close stage 3 in `docs/PROGRAM_STATUS.md`**

Read the file first (it has grown since this plan's research pass — Task 1's automation-levels
commit and others land before this task). Append a new `## \`v2\` — stage 3, the reducer for the
two story encounters (<today's date>)` section, following the exact structure of the existing
stage 1/2 sections (Design/Plan pointers, **Done**, **Gates on \`v2\` at the close**, **Out of
stage 3**, **Next\*\*). "Out of stage 3" should name explicitly: `propose-and-confirm` (stage 6),
upcast Fireball (needs `Input.dice.formula` to grow a `byLevel` variant), monster `traits`/
`reactions`/`legendaryActions`/`recharge`/`legendary` costs, death saves at turn start, fog/tokens-
on-a-map (stage 5), and the per-target save-roll attribution seam (`rollsUsable` binds a roll to
the intent's entity, so a target's save inside a caster's intent is logged with `roller: null` —
stage 4 decides whether the shared document attributes it to the target). Move the "Next: stage
3..." line at the end of the stage 2 section to instead point at stage 4.

- [ ] **Step 4: Write the stage 4 handoff**

Create `docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md` (use the actual date),
following the exact structure of the existing
`docs/superpowers/plans/2026-09-03-v2-next-session-handoff.md` (this file becomes historical —
leave it in place, git history is the record; do not delete it). The new handoff's "Read first"
section points at: `PRODUCT.md` §Steering, `CLAUDE.md` Direction block,
`docs/superpowers/plans/2026-09-03-new-app-stage-1.md` (stage 4 is next: "the shared encounter
document"), `docs/superpowers/specs/2026-09-02-total-combat-automation-design.md` §5 (persistence,
topology, authorization — stage 4's actual scope), `docs/PROGRAM_STATUS.md` → the stage 3 section
just written. Also carry forward, verbatim, the two owner decisions recorded in
`docs/PROGRAM_STATUS.md`'s "Owner confirmations, recorded ahead of their stage" section (2026-09-03)
— the admin-supreme account activates exactly at stage 4 (the access matrix and Firestore rules
this stage builds), so the handoff must not let it be missed.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-02-mechanics-authoring-spec.md docs/PROGRAM_STATUS.md \
  docs/superpowers/plans/2026-09-04-v2-next-session-handoff.md .changeset/v2-stage-3-close.md
git commit -m "docs(combat): close stage 3 on v2 and hand off to stage 4"
```

Add `.changeset/v2-stage-3-close.md`:

```markdown
---
"d20-folio": patch
---

Close stage 3 (the reducer for Marco's first turn and Sara's ogre ambush) in the program ledger
and the stage plan; reconcile the authoring spec's vocabulary-tier table to match what's actually
implemented; hand off to stage 4 (the shared encounter document).
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** all five gaps from the handoff are covered — Tasks 1/2/3+4/5 close gaps 3/5/2
  (+ Fireball)/1 respectively; gap 4 (0-HP/dying) needed no task, confirmed already correct.
  Both golden replays (Tasks 6, 7) exercise every piece together, matching the stage's actual
  acceptance gate ("both replays pass against the pure reducer").
- **Ordering matters:** Task 3 (area targeting) must land before Task 4 (Fireball) and Task 6
  (Marco's replay). Task 5 (adapter) must land before Task 7 (Sara's replay), and Task 1/2 should
  land before Task 7 too (it exercises `log-only` and the HP override together). Tasks 1 and 2 are
  mutually independent and can run in either order, or in parallel subagents, before Task 3.
- **File coupling:** `types.ts`, `intent.ts` and `mechanic.ts` are each touched by more than one
  task (mirroring stage 2's own note that these files are "too coupled... for independent subagent
  tasks without merge conflicts" when edits land close together) — if executing with
  subagent-driven-development, dispatch tasks **sequentially** in the order above (1 → 2 → 3 → 4 →
  5 → 6 → 7 → 8), each starting from the prior task's committed state, rather than fanning out
  Tasks 1–3 in parallel.
- **What stays explicitly out of stage 3** (do not build if asked mid-execution — confirm with the
  owner first, per the standing "no half-built vocabulary" rule): `propose-and-confirm` automation,
  upcast Fireball damage scaling, monster `traits`/`reactions`/`legendaryActions`/`recharge`/
  `legendary` costs, death saves at turn start, any literal map/fog/token UI (stage 5), the shared
  Firestore encounter document and its access rules including the admin-supreme role (stage 4).

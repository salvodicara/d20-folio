# d20-folio architecture

> **Read this first if you're new to the codebase.** Audience: human developers and AI
> agents extending the app. It explains what's pioneering about the system (the declarative
> Grant pipeline) and where to put new code so it lives next to similar code.
>
> See `docs/MECHANICS.md` for the Grant taxonomy, `docs/CONTRIBUTING.md` for the
> day-to-day workflow, and `CLAUDE.md` for the project rules.

---

## What the app is

A free, modern PWA for **D&D 2024** players to create, manage, and play characters
digitally. Bilingual (EN + IT), offline-first, Firebase-backed. **No dice rolling** — the
app shows deterministic formulas; the player rolls externally.

The architectural goal: **automate every 2024 mechanic** with override always available.
Beginner players get a self-driving sheet; expert players keep full manual control.

---

## Stack

```
React 19 + TypeScript strict + Vite 8 (Rolldown bundler) + Tailwind v4
Custom in-house UI layer (src/components/ui/*) on Radix primitives — NOT shadcn/ui
Zustand (client state) + React Router v7
Firebase (Auth Google · Firestore + offline persistence · Storage · Hosting)
Vitest (unit) + Playwright (E2E)
@changesets/cli (SemVer + CHANGELOG)
ESLint zero-warnings · Prettier · pre-commit + pre-push hooks (mandatory CI)
```

The pre-push hook runs **typecheck + lint zero-warnings + the unit suite + coverage ≥ 80% +
production build** before every push. Never `--no-verify`.

---

## Data flow

```
Firestore SDK ⇄ Zustand stores ⇄ React UI            (offline persistence + a Service Worker
      ↓               │                                that caches SRD data + app shell)
characterStore ──▶ evaluateGrants(sources) ──▶ AggregatedGrants ──▶ CharacterCockpit
  (the runtime         reads race traits / feats /     (the merged   (single shell: Left HUD ·
   source of truth)    class features / magic items     view)         Center · Right HUD · tabs)
```

`characterStore.character` is the runtime source of truth; it debounces (2-3 s) to Firestore. Renderers
compute on every state change — no derived data is persisted. (The full layer model with one-way
dependency rules is under **Architecture invariants** below.)

---

## Three layers of data

1. **SRD data** (`src/data/`) — static TypeScript modules per category (classes + subclasses, races
   incl. lineages, backgrounds, feats, spells, equipment, magic items, conditions, metamagic,
   invocations, maneuvers), bundled + served offline. Each entry is **ids + mechanics ONLY** — its
   bilingual display text lives in the SRD catalogues (`src/i18n/{en,it}/srd/`, see "SRD content
   strings"). Imports the `Grant` union, `TrackerSpec`, `SrdActionDef` types.

2. **Character data** (`src/types/character.ts` → `CharacterDoc`) — owned by the player, persisted to
   Firestore. Holds character._ fields (name, level, ability scores, …) and session._ fields (current
   HP, slots used, conditions, session defenses, action log), storing SRD content by reference
   (`srdId`). Session defenses (`sessionDefenses`) are the play-time defense overlay (resistances /
   immunities / vulnerabilities / condition immunities gained DURING play, layered additively over the
   build's permanent sets via `deriveDefenseKind`, added/removed in the rail without edit mode —
   Constitution §2.8).

3. **Aggregated view** (`AggregatedGrants`) — computed by `evaluateGrants(sources)`; the shared input to
   the sheet renderers. Never persisted; recomputed every render.

This three-layer split is the reason a character JSON export is small (just references

- session state) and SRD updates instantly propagate to every character without migration.

### The content-pack seam (the licensing partition)

The SRD layer is PARTITIONED for licensing: `src/data` + `src/i18n/*/srd` carry ONLY SRD 5.2.1
(CC-BY-4.0) content, so the repo can be snapshotted into a public repo; everything else (2024-PHB +
setting content, the personal team fixtures, the pack dev scenarios) lives in the top-level
**`content-pack/`** package (unlicensed, personal-use — see its README). One build-time alias
**`@pack`** is the whole seam:

- **Resolution** (`scripts/content-pack-mode.ts`, consumed by `vite.config.ts` + `vitest.config.ts`
  - the tsconfig `paths` fallback): `content-pack/index.ts` when the directory exists and
    `VITE_CONTENT_PACK` ≠ `0`; else the typed-empty stub `src/data/pack-empty.ts`. The shared export
    contract is `src/data/pack-types.ts`; each mode's typecheck pins its own resolution
    (`pnpm typecheck` / `pnpm typecheck:srd-only` → `tsconfig.srd-only.json`).
- **Merge points** — every per-category aggregate composes `public + pack` through
  `src/lib/pack-merge.ts` (an id collision or an overlay patch aimed at a missing entry THROWS at
  module init): `data/spells.ts`, `feats.ts`, `races.ts`, `backgrounds.ts`,
  `background-equipment.ts`, `magic-items/index.ts`, `maneuvers.ts`, `beasts/index.ts`,
  `classes.ts` (pack classes append; pack subclasses extend their public class table),
  `srd-names.ts` (the eager name index — the pack side is `content-pack/data/names.ts`,
  literal names only, so the roster chunk never drags the pack corpora). Consumers only ever read
  the aggregates — never a `@pack` deep path — so the seam stays single.
- **i18n** — pack EN srd shards are statically bundled and merged in `src/i18n/srd-en.ts` (the EN
  facts rule is unchanged); non-EN pack shards lazy-load through the pack's own
  `content-pack/i18n/loader.ts` and merge inside `loadSrdCatalogues`. The pack's `overlay.ts`
  patches PUBLIC entries per locale so the composed build shows the PHB wording (the 18 creator
  names the public catalogue carries under their SRD 5.2.1 names, the full Elven Lineage /
  Pact of the Chain prose, chrome labels via `uiOverlay` in `loadUiResources`). The six
  i18n-completeness locks hold in BOTH modes; the build-time leak-lock + parity checks cover the
  pack shards whenever the pack is enabled (`scripts/i18n/catalogue-io.ts`).
- **Tests** — `content-pack/tests/unit/**` joins the same fast/slow vitest lanes ONLY in pack mode
  (`PACK_JSDOM_TS_TESTS` in `tests/lanes.ts` mirrors the DOM-bound rule). The full gate (coverage
  floors included) runs in pack mode; the SRD-only lane is
  `pnpm typecheck:srd-only && pnpm test:srd-only && pnpm build:srd-only` (`just ci-srd-only`) — no
  coverage floors, no pack suites. Suites in `tests/unit` must pass in both modes by construction
  (they iterate whatever the aggregates expose; bare pack ID slugs in allowlists are permitted).
- **Composition is a symlink; nothing assumes physical nesting.** The maintainer composes the pack
  as a gitignored symlink to a sibling checkout of the private repo
  (`content-pack -> ../d20-folio-content/content-pack` — docs/CONTRIBUTING.md → "The two build
  modes"), so a pack file's REAL path is outside this repo root. Pack tests therefore import
  public-root helpers only through the root-anchored `@tests/*` / `@scripts/*` aliases (wired in
  the vitest/vite alias maps + tsconfig `paths`, always valid — they point at the public root in
  both modes); the vitest lanes resolve with `preserveSymlinks: true` (keeps pack modules at their
  in-root symlink path, so bare imports anchor at this repo's `node_modules`); the dev server
  allows the pack's real directory via `server.fs.allow` (`fsAllowRoots()`,
  `scripts/content-pack-mode.ts`); and `pnpm lint` names the pack glob explicitly (eslint's `.`
  directory traversal does not follow symlinks; `--no-error-on-unmatched-pattern` keeps the same
  script valid when no pack is present). The production build keeps realpath resolution; tsc
  follows the symlinked `include` natively.
- **Team fixtures** live in `content-pack/fixtures/team/` (personal data); `src/lib/dev-fixtures.ts`
  reads them through `@pack`, so the SRD-only app simply has none. Pack dev scenarios merge into
  `DEV_SCENARIOS` the same way.

### Minimal-character codec (the import spine)

A character document should carry only the **irreducible facts** the player chose — species,
class, subclass, level, background, ability scores, the picks the rules leave open — plus any
manual **override**. Everything a standard 2024 grant determines (saving throws, hit die, spell
slots, the **spellcasting block** [ability/focus/preparedMax from the class table], the **species
Speed**, the **class/subclass feature list** [`buildGrantedFeatures`, excluding race traits — those
live outside `features[]` and resolve via `resolveGrantSourcesForRace`], the background Origin feat,
the 27-point-buy budget …) is **inferred at read time**, never stored. Two small modules own this
seam:

- `src/lib/character-infer.ts` — pure inferers that compose existing engine data
  (`classTableIndex`, `getBackgroundOriginFeat`). Each returns the value a legal character's field
  _would_ take, so it never re-states a fact.
- `src/lib/character-minimal.ts` — `minimizeCharacter` strips a `CharacterData` to its minimal form
  (drops a field only when it exactly equals its inferred value, or is a null/empty override default);
  `rehydrateCharacter` rebuilds the full shape. The two read one shared `DERIVABLE` table, so they can
  never disagree. **`features[]` is SUBSET-minimized**: the derived class/subclass refs (`inferFeatures`)
  drop on minimize and merge back on rehydrate, while chosen feats / custom features are kept verbatim.
  **Race traits NEVER live in `features[]`** — they auto-grant from `character.race`; rehydrate runs
  `conformStoredFeatures` which drops any stored ref that duplicates an auto-granted source (recognized by
  stable id — undoing the legacy BAKE), and `remapSessionTrackerIds` migrates persisted pip STATE onto the
  surviving race session id (a bounded ONE-WAY read-boundary conform, golden rule 10). **`skills`** is
  likewise subset-minimized for Jack-of-All-Trades (the derivable `halfProficiency` entries drop/refill;
  picks + explicit opt-outs are kept).

**Lossless by construction:** the invariant is **`rehydrate(minimize(x)) === rehydrate(x)`** — the app
loads every doc through `rehydrateCharacter`, so minimizing is invisible on load. Anything that deviates
(an override, a value the engine can't yet infer) is kept, so a weaker inferer costs export _size_, never
correctness. The minimal model is the CORE of the **v3 portable codec** (`src/lib/character-codec.ts`):
`serializeCharacter` reshapes the minimal record into the id-based `{ schema, build, state }`
envelope and `parseCharacter` reverses it + rehydrates — the ONLY supported import/export format AND
(via the shared `serializeCharacterEnvelope`/`parseCharacterEnvelope` core) the Firestore storage
format (see `docs/CHARACTER_SCHEMA.md` + "Unified persistence codec" below). `character-io.ts` is the
thin I/O facade over it; the round-trip regression lives in `tests/unit/character-codec.test.ts` +
`tests/unit/persistence-unify.test.ts` + the 6 team fixtures (canonical v3).

### Portrait pipeline (Storage ⇄ export)

One portrait file per character — `users/{uid}/portraits/{charId}.jpeg` (`src/lib/storage.ts`),
canvas-compressed on upload, immutable Cache-Control; cropping is metadata-only (`portraitCrop`,
CSS crop at render) so a re-crop never re-uploads. **Display** (`PortraitImg`) renders the download
URL as a plain no-cors `<img>`, cached offline by the Workbox runtime cache. The crop is a
**uniform cover-fit**: `cropToCssStyle` (`src/lib/portrait-crop.ts`) over-sizes the image so the crop
rectangle maps to the frame, then `object-fit: cover` + `object-position: <focal>` apply a single
scale — so a crop whose pixel-aspect matches the frame shows the rectangle exactly, and a mismatched
one (a 1:1 portrait crop in a square frame is the matching case; a live pre-16:9 ~3:1 `bannerCrop` in
the 16:9 campaign card is the mismatched case) renders **undistorted, never stretched** (the old
`object-fit: fill` scaled width/height independently and stretched mismatched crops). The SAME crop
math drives both character portraits and campaign banners. **Export** embeds a
base64 copy under `meta` (the ONE place portrait bytes leave Storage): `buildCharacterExport` →
`portraitToDataUrl` reads the bytes through the Storage SDK (`getBlob`), never an HTTP fetch — so
the opaque display-cache entry can never be served to the export. The SDK read is a browser XHR and
**requires a CORS config on the GCS bucket** (INFRA, applied once via `scripts/set-storage-cors.mjs`,
the same one-off admin pattern as the `scripts/migrate-*` tools); the read is raced against an 8s
cap so a portrait read never stalls the export — any failure degrades to a faceless export that
reports `portraitDropped` (the `roster.exportPortraitDropped` toast — never silent). **Import**
re-uploads the embedded base64 and attaches the new URL atomically best-effort
(`uploadAndAttachPortrait`). **Delete** cascades doc → portrait (`firestore.ts` → `deletePortrait`).
Pinned by `tests/e2e/portrait-export-journey.spec.ts` under a REAL service worker. (The 2026-06-10
opaque-cache repro + the CORS-header detail live in git history.)

---

## The pioneering bit: declarative Grant pipeline

`src/lib/grants.ts` defines a discriminated union — `Grant` — that's the **language**
features use to declare their mechanical effects, covering senses, defensive sets, movement,
derived stats, proficiencies, expertise, languages, tools, spell grants, choice grants, casting
modifiers, advantage chips, weapon/spell damage riders, extra-attack, crit-range, pact-weapon
riders, granted actions, and the `while-active` / `choice-grant-bundle` composites. **The union
is the source of truth for the kind count** — see `src/lib/grants.ts` (each arm carries
co-located TSDoc); `docs/MECHANICS.md` documents the conceptual model + the kind domains.

Each kind documents its evaluator merge rule:

```typescript
| { type: "darkvision";       range: number }                 // max
| { type: "damage-resistance"; damageType: DamageType }       // set-union
| { type: "speed";            amount: number }                // sum
| { type: "ac-bonus";         amount: number }                // sum
| { type: "fly-speed";        amount: number | "equal-to-walking" }  // max
| { type: "free-cast-spell";  spellId; chargesPerRest; rest }
…
```

`evaluateGrants(sources)` walks every source row (race traits + feats + class features +
equipped magic items + invocations + **maneuvers** + backgrounds — assembled by
`resolveAllGrantSources` in `src/lib/resolve-grant-sources.ts`) and aggregates into
`AggregatedGrants` — the merged effect view (the `AggregatedGrants` interface in
`src/lib/grants.ts` is the source of truth for its fields).

Sheet renderers consume `AggregatedGrants` instead of reading prose with regex. **No
module in the codebase grep's English text to figure out what a feature does.** If it does,
that's a refactor target.

### How to add a new mechanic

1. Add a new `Grant` variant to the union in `src/lib/grants.ts` (with its co-located TSDoc).
2. Add the evaluator branch (one case in the `switch`).
3. Add an `AggregatedGrants` field (or extend an existing one).
4. Add a unit test pinning the branch (table-driven where a per-entity family exists).
5. Add the grant to every SRD data row that should emit it.
6. Add the consumer (sheet header, abilities page, combat panel, …) — read from
   `evaluateGrants(sources)` instead of looking at prose.

Steps 1-4 are usually one commit; step 5 may be its own per-category release. The full
taxonomy + the per-arm recipe lives in `docs/MECHANICS.md`.

---

## Trackers (resource pools)

`src/lib/smart-tracker.ts` exposes `resolveTrackers(character, locale)` which returns the
character's current trackers (Channel Divinity, Bardic Inspiration, Rage uses, Spell
Slots-as-pool, Sorcery Points, Lucky uses, …).

Each tracker comes from a `mechanics.tracker` declaration on a class feature / feat / race
trait. The spec:

```typescript
interface TrackerSpec {
  total: string; // formula: "PB", "level", "CHA", "1+level", "floor(level/2)"
  recovery: Recovery; // "short-rest" | "long-rest" | "dawn" | "per-turn" | "manual" | …
  die?: string; // "d6" / "d8" / "d10" / "d12" for inspiration-style
  isPool?: boolean; // pool mode (Sorcery Points)
  unit?: string; // "pts" / "HP" / "uses"
  shortRestRecovery?: number | string; // partial recovery (Second Wind, Wild Shape)
  levels?: TrackerLevelOverride[]; // per-level overrides for total/die/recovery
}
```

The formula language supports constants, ability codes (`CHA`/`WIS`/…), `PB`, `level`, arithmetic
(`* + - /`), and `ceil`/`floor` rounding — so mixes like `"1+level"`, `"PB*2"`, `"ceil(level/2)"`
resolve. Trackers scale via `levels[]` for class-table thresholds (e.g. CD uses 1 → 2 → 3 at L2/L6/L18);
per-character `trackerOverrides` overlay the SRD defaults (the universal override pattern).

Some tracker rows are **DERIVED, not hand-declared** (golden rules 2 + 6). A magic item's charge
pool comes from its `free-cast-spell` grant (`resolveFreeCastItemTrackers`, S9); and a feat/feature that
grants **≥ 2 free-cast spells** (Fey/Shadow/Vampire-Touched, the multi-spell heritage feats) emits ONE
INDEPENDENT 1/rest row PER SPELL via `resolveFreeCastFeatTrackers`, keyed `${featId}:${spellId}` — so
casting one never locks the others (the prior shared-`total:2` counter deadlocked them). The row, the
cast gate (`spell-cast-sources`), the spend (`useTracker`), and short-rest recovery all resolve to that
one key (a shared `forEachFeatFreeCast` iterator builds the row + the recovery so they can't drift).
A **single**-free-cast source keeps its bare-id `mechanics.tracker`. Spell SLOTS, like every tracker,
are now manually editable on the rail (tap a gem to spend, a spent socket to restore) — override-first
(golden rule 8), so any mis-spend is correctable, not just within the cast's undo window.

### Riders (passive scaling chips)

Some features carry **rider** chips — a class-table value displayed on the feature card but
not directly trackable. Examples: Rage Damage (+2 / +3 / +4), Monk Unarmored Movement
(+10 ft / +15 / +20 / …), Monk Martial Arts die (d6 / d8 / d10 / d12).

These declare on `mechanics.rider`:

```typescript
mechanics: {
  rider: {
    sourceKey: "rageDamage",         // key into the class table's `classSpecific`
    format: "additive" | "feet" | "passthrough",
    // label resolved from the i18n catalogue at
    // `<featureId>.mechanics.rider.label` (an `extra` entry: `.rider.<sourceKey>.label`)
    extra?: [{ sourceKey: "magicItems", format: "passthrough" }], // optional sibling chips
  };
}
```

`resolveFeatureRider(featureId, character)` reads the class table at the character's level
and formats the PRIMARY value. `resolveFeatureRiders` (plural) returns the primary chip PLUS
any `extra[]` siblings, each resolved by the SAME recipe — one feature can surface several
scaling chips (Artificer Replicate Magic Item shows both "Plans Known N" and the "Magic Items N"
cap) with no parallel widget.

---

## Actions (combat panel buttons)

`SrdActionDef` declares Action / Bonus Action / Reaction / Magic Action / Free Action
triggers on a feature. Each carries label + description + (optionally) a `costTracker`
keyed to another feature's tracker (so spending the action decrements that pool — e.g.
Wild Companion → "druid-wild-shape" tracker).

Three carrier shapes hold `mechanics.actions`: a class feature / feat (`character.features[]`),
a race trait, and — since S10 (Gaze of Two Minds) — an Eldritch Invocation. Race traits and
invocations both live OUTSIDE `features[]`, so `resolveFeatureActions` (smart-tracker.ts)
resolves them via sibling passes (1b race traits, 1c invocations) that mirror the primary
feature loop's resolution (owning-class scaling level, cost/tracker, save/attack/heal
summary) and feed the SAME action list — never a parallel model. An invocation's owning
class is always Warlock. The combat panel reads every action from every feature ref the
character holds, every race trait, every known invocation, plus spells, plus weapons.

---

## Combat model (the turn-resolution layer)

> This section is the durable contract for the combat model. (The original standalone design
> doc has been folded in here; the exploratory history lives in git.)

The action economy is **immediate-commit-per-action-with-undo** (the owner's binding decision —
**not** batch select-and-commit). Each action/cast/attack calls `planCommit` (pure, serializable
`CommitOp[]`) + `applyCommitOps` (runs the mutation, returns a reverse-applier pushed into a 5 s
undo toast), so the resource is deducted the instant it's used. `combatStore.endTurn()` is **pure
bookkeeping** — advance round, restore reaction, reset movement, tick durations — so forgetting it
is harmless. (In a campaign encounter, the sheet's End Turn ADVANCES the SHARED encounter turn only —
no private round bump; the per-turn economy resets at **turn-START**, when the shared pointer lands back
on your PC, not on End Turn — so it is always fresh at the start of your turn even if you never formally
end it. See the combat-subdoc + campaign section below.) The economy strip is a **budget meter derived
from the plan, not a commit queue.**
A committed action that ESTABLISHES a while-active state (Rage, Bladesong — its resolved action
carries an inferred `activatesKey`, see `docs/MECHANICS.md` "Activation seam") also flips that key
into `session.activeFeatures` — the rail chip lights automatically, the state's grants (Rage's
`weapon-damage-bonus`, resistances) flow into every derived figure, undo clears only a commit-lit
key, and tapping the lit chip ends the state.

**Extra Attack is part of the action economy (the BG3 attack grammar — the count lives on the attack
AFFORDANCE, the economy just spends).** A hero who makes N weapon attacks per Attack action has
`attackBudget = N` (derived ONCE by `attacksPerActionForCharacter` and pushed into `combatStore` alongside the
B6 `setBudget`). Committing a weapon attack — or a War-Magic cantrip that replaces an attack — calls
`combatStore.commitAttackSwing`: the FIRST swing of an Attack action claims one Action slot (a single localized
"Attack action" group entry occupies it via the ordinary slot budget), each further swing RIDES that open action
without claiming a slot, and `attacksUsed` increments per swing. An Attack action holds `attackBudget` swings;
Action Surge (a second Action slot) opens a fresh set. Undo (`undoAttackSwing`) decrements the count and
reconciles the group entries to `ceil(attacksUsed / attackBudget)` (order-independent); re-arming the Action
coin (`deselectSlot("action")`) resets the swing counter with the released groups, the rearm undo restores the
exact prior progress, and a STALE rearm undo (the slot re-spent within the toast window) is a no-op. War Magic
is an INTERACTION, not a badge: a mid-Attack-action SPELL swing routes through the SAME rich-cast seam as every
other cast (`commitCastOption(…, ridesPip)` — the Metamagic/upcast picker still surfaces, golden rule 6;
`resolveReplaceAttackWithCast` gates which casts qualify; a CUSTOM cantrip with no `spellId` has nothing to pick
and swings directly) and the confirmed cast rides an attack swing instead of claiming a fresh Action slot. At
`attackBudget === 1` (most characters) the whole path is inert — attacks commit through the ordinary economy,
zero delta.

The **presentation** follows the BG3 grammar (owner rulings 2026-07-10): the turn-meter Action **coin** behaves
like ANY action — it spends fully on the FIRST swing (no partial state, no segmented ring). While swings remain
the **attack affordance** stays lit with NO standing text — every attack-capable weapon / War-Magic **card**'s
CTA turns **struck gold** (`.uc-cta.is-emphasis`, the app's lit-primary material), which alone signals "this
swing is already paid for"; the exact "N of M attacks remaining" count is surfaced only on demand, via the
CTA's **hover title** + an **sr-only** status. The board **group headers** are pure rubrics — no availability
text of any kind (the economy coins alone carry that state; owner order 2026-07-10) — and on the last swing
the cards enter the CTA grammar's SPENT state (disabled "Used" — DESIGN.md, "The combat-CTA grammar"). `attacksRemainingInAction` (`combat-action-view.ts`) is the SINGLE
derivation feeding the CTA state + its on-demand count (golden rule 6); `isPipAttackAction` /
`maxReplaceAttackSpellLevel` are the shared pure predicate the commit routing and the card CTA both branch on. Each swing logs a counted `action-use` event
(`attackOf: { n, total }` → "attack 2 of 2"), and shows ONE evolving 5s undo toast (the reversal contract's
one-snackbar rule: a new undoable act's announcement replaces the live one in place — its text updating, undo
always popping the LAST swing) rather than a stack of per-swing toasts; deeper swings stay individually
undoable on the session undo stack.

The single projector `resolveTurnPlan(character, locale) → TurnPlan` projects everything castable this
turn from the existing pipeline (`evaluateGrants` + `resolveActions`/`resolveTrackers` +
`buildCastOptions` + `compute.ts`). **New mechanics become DATA edits** — a `granted-action` grant, an
`economy` facet on `SrdActionDef`, a `CONDITION_GATES` row — never combat-code edits. Primitives:
`cost-engine.ts` (`CostSpec`/`CommitOp` unions with `assertNever`, so a new resource kind is a compile
error) and `condition-effects.ts` (`CONDITION_GATES` → blocked slots / speed-0 / break-concentration /
auto-fail / adv-dis, emitted into the grants `advantages`/`disadvantages`). Metamagic is a grant source
(`resolveGrantSourcesForMetamagic`); the ten core 2024 options remain per-cast modifiers at the cast
layer. The same `resolveSpellCastOptions` source feeds BOTH the Spells page and the Combat page, so the
two cast pipelines cannot drift. Residual: full RAW condition nuance (line-of-sight, prone-within-5 ft)
is advisory chips, not enforced (appropriate under override-first).

### The session undo stack (`undoStore`)

Every undoable act already produces a hand-written **reverse-applier closure** (the cost-engine's
`applyCommitOps` return, `commitAction`'s return, the HP snapshot restore, the store's
condition/concentration `onUndo`s). Historically that closure's only home was a 5 s toast, then it
was thrown away. `src/stores/undoStore.ts` gives it a durable home: a per-character, in-memory,
**LIFO undo stack** (depth `MAX_UNDO_DEPTH = 20`) with standard redo semantics. One source of truth
(golden rule 6) — the toast's Undo button, the ⌘Z/⌘⇧Z accelerators (`useUndoRedoShortcut`, route-scoped
in `CockpitView`), and the sheet's on-page undo/redo controls (the Binder's Fob ⟲ ⟳ coins on
desktop, the Signet's bloomed ⟲ ⟳ pair on mobile — one home per viewport,
`useBinderFobHome`) all _reference_ the same `UndoEntry`, never a private copy; the keyboard +
controls share `useUndoActions`.

- **Currency:** an `UndoEntry` is the closure PAIR `{ undo, redo }` (not the serializable op — ops stay
  the inner primitive). Call sites register via `registerUndoable(label, execute, { turnScoped })`:
  `execute` runs the mutation and RETURNS its reverse (or `null` on a legal bail); **redo re-runs the
  SAME `execute`** and re-registers (no duplicated mutation code; every redo is itself undoable, and it
  re-validates every execute-side guard — "never trust the history", and never re-rolls/re-picks:
  golden rule 21). Labels mirror the toast contract exactly — UI callers pass a pre-localized `message`,
  store callers pass a structured `{ intent }` localized at render by the same `toastMessage` path.
- **`turnScoped`:** TRUE for per-turn economy commits (action/cast/swing/reaction/End Turn), FALSE for
  character-state (HP, conditions, out-of-combat tracker spends, concentration, defenses).
- **Fences (§ boundaries):** character switch / unload → `clear(charId)` (rebind); **solo End Turn →
  COMPACTION** (the turn's `turnScoped` entries fold into the single End-Turn entry; undoing it restores
  the round/economy AND re-instates them individually undoable — the shipped re-arm, generalized);
  encounter turn-start / encounter-end → `purgeTurnScoped()` (turn economy gone, HP/condition undos
  survive); long/short rest, level-up apply, `reconcileBuildChoices`, import, snapshot restore → `clear()`;
  a **remote-originated** document/combat snapshot (`hasPendingWrites === false` + a material diff, via
  `combatTrioDiffers`) → `clear()` so a snapshot-leg undo never clobbers a peer. Read-only sheet → the
  stack never populates + the control hides.
- **Own-sheet-only (decided):** the stack covers ONLY the signed-in owner's open character doc + its
  `combat/state` subdoc. Shared campaign documents are OUT — **no `registerUndoable`/`useUndoStore`
  import may appear under `src/features/campaigns/`** (a concurrent writer + snapshot reversal would
  silently clobber, and "whose ⌘Z" is ambiguous). Session-memory only: reload clears it (the closures
  are non-serializable by nature; the bounded subdoc + autosave remain the durable truth).

### The combat-log event seam (events-as-data)

The action/combat log records the deterministic session story beats (HP damage/heal, temp HP,
condition gained/lost, concentration, rest, death save, turn advance, action/reaction commit). Like
toasts-as-data, it stores a **structured `CombatEvent`, never a localized line** (`src/types/combat-log.ts`
— a discriminated union, each variant carrying only ids/tokens + numbers; the sole free-text fields are
the localized-at-use `actionName`/`spell` labels and a `legacy` event's frozen text). The contract has
one of each seam: ONE emit path (`useCharacterStore.logEvent`, appended from the state-mutating store
actions + the cockpit commit loop — no parallel log system), ONE localizer
(`src/lib/views/combat-log-view.ts → localizeCombatLogRow`, so a language switch re-localizes the whole
feed), and ONE bounded read-normalization at the boundary (`sanitize-session.normalizeLogEntry` reads a
pre-events persisted row as a `legacy` event; the engine never emits `legacy`). Locked by
`combat-log-view.test.ts`, `combat-log-emission.test.ts` (incl. the locale-independence guard), and
`action-log.test.ts`.

---

## Character creation + level-up

`src/lib/character-build.ts` + `src/lib/level-up.ts` apply changes deterministically. The
`PendingChoice` union has **nine** kinds — `ability-score` (Choice ASI), `skill-proficiency`,
`expertise`, `language`, `tool-proficiency`, `cantrip`, `spell`, `feat`, and `skill-or-tool-proficiency`
— surfaced as `pendingChoices` for the wizard. Weapon Mastery, Metamagic, Invocations, and maneuvers
resolve through their own `*-pick` / `feat-*-choices` modules + the generic `feature-choices.ts` engine,
NOT via `pendingChoices`. ALL of a feat's consequences (its own
`choice-*` slots, split out by `partitionChoiceSlotsBySource`; a half-feat's "+1 ability" sub-picker)
render in ONE container attributed to that cause (the feat's expanded entry, or the cause-attributed
`FeatChoicesInline` block; every other source's slots render in the shared `FeatureChoicesSection`),
honoring the ASI cap of 20 standard / 30 Epic Boons (one cause, one container).

`level-up.ts` produces a `LevelUpPreview` with structured `LevelUpChange[]` so the wizard renders
before-and-after diffs without re-deriving them on the UI side.

**Bio-tab build edits + LEVEL DOWN (`src/lib/reconcile-build.ts`).** Every Bio-tab edit of a creation
CHOICE (species · class · subclass · level) flows through ONE pure seam, `reconcileBuildChoices(prev,
next)`: it re-derives the choice-fixed values (saves, hit die, spellcasting block, feature set, JoaT
skills, Speed) and — on a LEVEL DECREASE — prunes every choice recorded above the new level **with its
downstream effects**. Per-entry picks (maneuvers, invocations, metamagic, weapon masteries, fighting
styles), ASI-level feats (taking their `freeCastSource`-traced spells), Expertise, cantrips, and the
prepared count are **shrink-bounded** clamps — a family loses at most what the removed levels granted,
dropped latest-first, so manual deviations survive (override-first); spells above the new max slot level
and grant-set-diff always-prepared spells are pruned outright. Max HP moves by the INFERRED delta
(`inferHpMax`) so a mistyped level round-trips losslessly; spell slots derive through the ONE seam
`deriveSpellSlots` (`multiclass-slots.ts` — class table / third-caster / 2024 multiclass table, read by
level-up + reconcile + the dev builder). The SESSION reconciles in the same write via
`reconcileSessionAfterBuild` (HP / hit-dice / slot-uses clamped, stale rows dropped, Concentration +
active-feature toggles pruned). Baked ASIs are NOT auto-reverted — the destructive-edit confirm
(`summarizeBuildDiscards`) itemizes every discard. Pinned by `tests/unit/reconcile-build.test.ts`.

**Starting equipment (`src/data/background-equipment.ts`).** CLASS and BACKGROUND starting gear share
ONE shape (`BackgroundEquipmentOption` — the 2024 "Choose A or B" packages) and ONE resolver. A
`BackgroundEquipmentItem` is one of THREE forms: a stable catalogue id, a name-only flavour entry
(inline BiText — the one documented data-guard bypass), or a `fromToolChoice` MARKER that references the
source's `choice-tool-proficiency` grant STRUCTURALLY (never a tool id/locale string). The shared
`expandToolChoiceItem` resolves the marker to the player's picked tool (the SAME picks that derive the
proficiency, golden rule 6 — built by `toolChoiceContextForClass`/`...ForBackground`; an umbrella
"Choose one kind of X" never survives as a final proficiency or item). The pure
`resolveStartingEquipment(...)` routes each item and is the SOLE path for the chosen tool's item (no
double-add). This is CREATION-CONSUMED — a one-time snapshot, never re-derived, so changing the model
never touches existing characters. Pinned by `starting-equipment-facts.test.ts` (labels / ids /
quantities / gold vs the wikidot facts) and `starting-equipment-resolves.test.ts` (single-source
expansion + no double-add).

**Wizard presentation (owner-approved design, 2026-06-11).** Creation and level-up are full-screen
routes sharing ONE presentation layer, `src/features/wizard/` — the orb chrome, page-turn nav, the
plaque/hero identity gallery, the read-then-choose feat/spell lists, and the GENERIC `WizardPickList`
that renders EVERY in-wizard choice slot (skills, tools, languages, expertise, invocations, maneuvers,
metamagic, weapon mastery, spell/feat picks) with one icon grammar. The CSS recipes live in
`src/styles/folio.css` (`.wiz-*`, pinned by `tests/unit/wizard-css.guard.test.ts`); the component-level
design + performance contract is the design doc's concern (`DESIGN.md`). Creation is `/characters/new`
(`features/creation/CreationWizard.tsx`, whose step list DERIVES from the class — a non-caster gets no
Spells step), level-up `/characters/:id/level-up` (`features/leveling/LevelUpWizard.tsx`); both
leave-confirms are DIRTY-gated (`useBlocker` + `beforeunload`). The old single-scroll `LevelUpModal`

- its step files + `SpellPicker` + `AbilityScoreGrid` are deleted (superseded; golden rule 10).

**2024 multiclassing (#36).** The level-up wizard's Hit Points step carries the CLASS FORK: advance an
owned class or take the first level of a new one. The facts live on the class tables (`primaryAbility`

- `primaryAbilityMode` for the 13+ prerequisite, the partial `multiclass` proficiency set — verified
  against dnd2024.wikidot.com); the gate is `src/lib/multiclass.ts` (`eligibleNewClasses` — prerequisite
  both ways, RAW-illegal classes FILTERED, never greyed). The filtered absence carries a CAUSE
  (Constitution §2.7.3): `multiclassFilterReport` reports each hidden class with its unmet 13+ floors,
  rendered as one quiet progressive-disclosure line by `MulticlassFilteredCause` (never bare silence). The
  engine path is `levelUp(..., { advanceClassId })` (features/slots/HP resolve at the advancing class's
  NEW class level; slots via the 2024 multiclass caster table); `featGateCtx` derives armor training from
  the INITIAL class's full set + each later class's partial multiclass set.

---

## i18n

`react-i18next` for UI chrome. The chrome catalogue is split into **per-domain `ui/<group>.json`
shards** (`src/i18n/<locale>/ui/`, one file per top-level group) that merge back into the single runtime
`common` namespace at bootstrap (zero call-site churn — every `t("group.key")` keeps working; pinned by
the `i18n ui/ shard layout` guard).

**Async lazy-per-locale bootstrap.** `src/i18n/index.ts` is ASYNC: it inits i18next with NO eager
resources and loads ONLY the active locale's `ui/*` shards + (non-EN) `srd/*` catalogues before resolving
`i18nReady`; `main.tsx` gates the first render on it, so no surface ever paints a raw key, and switching
language lazy-loads the target locale BEFORE flipping. Per-locale loaders use `import.meta.glob`
(`src/i18n/loaders.ts`) so each shard code-splits into its own per-locale chunk — the inactive locale's
catalogues are never downloaded at startup. **The EN-canonical rule (facts AND chrome):** EN is the
always-loaded canonical FALLBACK on both axes:

- EN `srd/*` is the canonical FACTS source the Grant engine parses in ANY locale (`srdEn` reads
  dice/durations/triggers from the English wording), so it is STATICALLY bundled in `src/i18n/srd-en.ts`
  and always loaded.
- EN `common` (the `ui` namespace) is force-loaded in `bootstrap()` whenever the active locale isn't EN
  (`if (active !== "en") await ensureLocale("en")`), so prod `fallbackLng: "en"` is actually functional
  for ui keys AND an EN canonical chrome ref (a `ui` `LocText`, below) resolves in any session. This is
  what makes the EN fallback REAL instead of a config that never had its catalogue loaded.

So an EN user pays only EN; an IT user pays EN srd + EN ui + IT ui (no IT-side duplication of facts).
`srd-en.ts` is the process-wide catalogue REGISTRY (EN seeded static; other locales registered lazily by
`ensureLocale`). Workbox precaches every locale chunk, so an offline language switch works even for an
EN-only user.

The i18n completeness LOCKS (the throwing resolver + missing-key handler, disabled `fallbackLng` in
dev/test, the parity + locale-sweep gates) are catalogued under **Architecture invariants → the five
i18n-completeness locks** below. In prod the handlers log + `fallbackLng: "en"` protects live users. A
cross-locale/locked-namespace fetch (`i18n.getFixedT(<locale>)`) belongs ONLY in `src/i18n/**` (owns
loading) + the `src/lib/views/**` presenter (resolves a `ui` `LocText` ref via the always-loaded
`common`) — NEVER in `src/features/**`/`src/components/**`, where the target locale may be unloaded → a
missing-key crash (the `combat.otherReactionName` IT-session white-screen). Pinned by the
`no-cross-locale-fetch` guard.

**SRD content strings.** Every SRD content string (name, description, range, duration, material,
trigger, …) lives ONLY in the per-language, id-keyed JSON catalogues `src/i18n/{en,it}/srd/<kind>.json`
(17 kinds). **`src/data/**`is ids + mechanics ONLY** — the`BiText`/effect fields are stripped from the
data + SRD types; the catalogues are the single source of SRD text. A stripped entity is addressed by
its stable `id`(race traits / sub-entities / named grants carry an explicit`id = slug(name.en)`), and
resolves through one pure function `localizeSrd(kind, key, field, locale)` (`src/i18n/resolver.ts`) —
which THROWS in dev/test on any miss (lock 1) and returns the `⟦…⟧`sentinel in prod. Keys are the
entity id, with dotted segments for nested fields.`localizeCustom`is the typed bypass for
user-authored content (it keeps its own single-locale text, never touches the resolver). The two
whitelisted inline-string bypasses are`background-equipment.ts`(creation-consumed`flavour`snapshots)
and`srd-names.ts` (the lightweight name index the eager persistence layer reads).

**Tools are named ONCE — the equipment catalogue (#107).** A tool is BOTH a proficiency (the rail/Bio
chips) and an equipment item (the bag), so its name reads from ONE place. `src/lib/tools.ts`
(`SRD_TOOLS_2024`) carries **id + category + the umbrella flag ONLY — no display strings**; every tool
name lives ONCE in `srd/equipment.json` keyed by the tool id, resolved by both surfaces (the inventory
item via `localizeSrd`, the proficiency chips via `displayToolProficiencies` in `lib/views/sheet-view.ts`).
`tools.ts` is dependency-light (no `@/i18n` import) so class data can import its tool-id lists without
pulling the SRD corpus into the `srd-classes` chunk; the name resolvers that read `srdEn` live in the
consumer-side `src/lib/tool-names.ts`. Drift is made impossible by
`tool-name-single-source.guard.test.ts` (proficiency string == inventory string per tool, both locales).

**MANUAL languages + tool proficiencies are IDS, never display strings (#114, golden rule 7).** The
player's hand-added languages / tools live as STABLE IDS (`character.languageIds`/`toolProficiencyIds`)
plus verbatim `customLanguages`/`customToolProficiencies` for off-catalogue homebrew. The presenter
(`displayLanguages`/`displayToolProficiencies`, `lib/views/sheet-view.ts`) unions these with the
aggregate's granted set, dedups **by id**, and localizes each via `localizeSrd` — so a held tongue/tool
reads its canonical name in the active locale on the rail, Bio tab, AND PDF, by construction. Languages
are a `"language"` SrdKind + `srd/languages.json`; **a new app language is JUST a new JSON file, zero
code.** Umbrellas (`artisans-tools`/`gaming-set`/`musical-instrument`) never finish as a chip
(`effectiveToolTokens` tags a held umbrella as a pending "choose one kind of X"). Guarded by
`character-data-ids.guard` (stored docs hold ids, never labels), `i18n-proficiency-divergence` (a
resolvable token renders EN ≠ IT), and the `i18n-parity` `languages` catalogue. (The old fold-match
"rescue" + the string→ids migration are deleted — git history preserves them.)

**Italian source cascade** (see the i18n rule in `CLAUDE.md`): official IT SRD 5.2.1 PDF → other
authoritative IT sources → reputable community → AI-translate with `// AI-translated, no
authoritative IT source found` comment. Empty Italian fields are never acceptable.

**IT casing convention — damage types are DEFINED TERMS, capitalized.** The 2024 SRD treats damage
types as defined terms, and the IT catalogues follow: the damage-type noun in a damage phrase is
CAPITALIZED — `danni da Fuoco`, `danni Necrotici`, `danni da Acido, Freddo o Fulmine` (every member
of a list). This is house style corpus-wide (the newest curated content-pack entries carry it ~3:1;
normalized fully 2026-07-17). It applies ONLY to the damage-type noun in a `dann[oi] [da] …` phrase
— the same lemmas as common words stay lowercase (`il fuoco si propaga`, `prova di Forza` the
ability). The `highlightRulesText` grammar is first-letter case-flexible, so the convention is data
hygiene, not a rendering dependency.

Distance, weight, currency: `src/lib/utils.ts` exports `formatSpeed`, `formatWeight`,
`localeDistance`. EN shows `30 ft`, IT shows `9 m` (1.5 m per 5 ft, comma decimal).

**Rules-prose colour emphasis is a pure render-time formatter, not an SRD edit.**
`highlightRulesText` (`src/components/shared/highlightRulesText.tsx`) is a pure,
locale-parameterized function (built once per locale, cached) that walks a plain prose run and
lifts DAMAGE PHRASES (→ `.rt-dmg`, inked `var(--dmg-<type>-ink)`), CONDITION names (→ `.rt-cond`,
`var(--cond-<id>-ink)`), VALUES (dice / save DC / measured distance-duration → `.rt-value`), and
Advantage/Disadvantage (→ `.rt-adv`/`.rt-dis`) into keyed React nodes. It sits at the **rules-text
seam** — wired opt-in through `InlineMarkdown`'s `highlight` prop by `CompendiumDetailBody`, the
sheet's `UniversalCardDesc`/`Higher` + FeaturesTab cards, and the level-up reading prose (an
omitted prop renders byte-identical output, so chronicle/session/user prose is untouched by
construction). Locale match-vocabulary lives in `src/i18n/rules-prose.ts` (typed over
`DamageType` × `Locale` — golden rule 7: locale words never sit outside `src/i18n/**`); condition
base names resolve via `localizeSrd("condition", …, "name", locale)`. It edits ZERO SRD strings
and does NOT touch the shared `parseInline` tokenizer (elements pass through untouched — only
string leaves are formatted). See DESIGN.md "Rules-text colour grammar".

### External DOM mutation resilience (issue #24)

Browser machine translation (and any extension that rewrites the live page) mutates DOM that React
owns, so a later reconcile calls `removeChild`/`insertBefore` against a stale reference →
`NotFoundError`, white-screening a subtree (production issue #24). The fix is a permanent boundary
adapter (same category as `timestampsToDates`): `src/lib/dom-resilience.ts` installs tolerant
`Node.prototype.removeChild`/`insertBefore` wrappers (the established React translate-proofing pattern,
facebook/react#11538) **before the first React render** (`src/main.tsx`) — a stale call no-ops/falls
back to `appendChild`, a well-formed call passes through. **Translation stays ALLOWED** (this superseded
the earlier blanket `translate="no"` ban); `src/i18n/index.ts` mirrors the active locale onto
`document.documentElement.lang`, and the few primitives that render meaning-bearing formula tokens carry
a SELECTIVE `translate="no"` so "2d6+5" is never machine-mangled while prose stays translatable. Pinned
by `tests/unit/dom-resilience.test.tsx`, `tests/unit/translate-allowed.guard.test.ts`, and
`tests/e2e/translate-resilience.spec.ts`.

---

## Architecture invariants

These are the locked, non-negotiable structural rules — the destination the R1–R8 campaign reached,
now present reality. Each is enforced by a guard test (table below) so it cannot silently regress.

### Navigation feel — scroll restoration + the overlay-history seam

Two small seams give the lazy-route SPA native-app navigation (contract in `DESIGN.md` →
"Navigation feel"):

- **The ONE persistent Suspense boundary** (`AppShell`, wrapping its `<Outlet>`; fallback
  `FolioLoader variant="region"`). Every heavy route is `React.lazy`, and React.lazy ALWAYS
  suspends on a FRESH boundary's first render — so a per-route `<Suspense>` (the retired `suspend()`
  wrapper in `router.tsx`) blanked the content region then flashed the loader on the first
  eager→lazy leg (roster→campaigns), because leaving the eager roster mounts a brand-new boundary
  and prefetch only warms the module cache, not lazy's resolved state. Hoisting the single boundary
  above the `<Outlet>` keeps it mounted across every navigation: under React Router v7's
  `startTransition` the previous page stays painted until the next chunk resolves, so a warm leg
  shows ZERO blank/loader frames and only a genuinely cold fetch surfaces the d20 (still delayed
  ~250ms). The shell chrome (Topbar/nav/footer) sits OUTSIDE the boundary and never unmounts; the
  region `errorElement` route renders THROUGH this `<Outlet>`, so a chunk-load failure or render
  fault still lands in the recoverable region panel with the nav intact.
- **`ScrollRestorer`** (`src/app/ScrollRestorer.tsx`, one renderless instance in `AppShell`) owns
  window scroll + focus restoration app-wide (`history.scrollRestoration = "manual"`). React
  Router's built-in `<ScrollRestoration>` restores in a layout effect the instant navigation
  completes — but heavy routes are `React.lazy` + Suspense, so at that instant the page is the empty
  `FolioLoader` with no height and the restore clamps to 0. `ScrollRestorer` instead WAITS (rAF)
  until the mounted route is tall enough to hold the saved offset, then scrolls — never into the
  empty loader window. Its pure target logic lives in `src/lib/scroll-restoration.ts`
  (`scrollTarget` — POP restores the history entry's saved offset, EVERY fresh PUSH → top —
  including the realm indexes (owner, 2026-07-10: rock-solid realm switches, no post-mount restore
  jump) — REPLACE → untouched). A PUSH's scroll-to-top runs synchronously in the layout effect,
  before the committed route's first paint, so the destination never flashes at the source page's
  offset. Realm-tab query memory lives in `src/lib/realm-memory.ts` — it remembers only a realm index's
  DURABLE view (the compendium's `?type` codex category), stripping transient drill-down state
  (the open entry `?sel`, a seeded search `?q`), so a realm-tab click always lands on a fresh index
  and never resurrects the last open entry. On PUSH it also moves focus to
  `#main` with `preventScroll` (POP never steals focus).
- **Compose-once loading** (nav-feel audit, 2026-07-10; contract in `DESIGN.md` →
  "Navigation feel" §7). A page never reorganizes itself after paint: a surface fed
  by several async sources gates its render on every INITIAL snapshot — the campaign
  hub mounts `useChronicleSubscription` itself and holds its `FolioLoader` until the
  campaign doc AND the chronicle's first snapshot land (an error settles the gate).
  The `FolioLoader` WRAPPER mounts immediately (only the die waits out the ~250ms
  delay): it reserves the region height and is the marker
  `.app-canvas:has(.folio-loader) .site-footer` reads to keep the footer invisible
  until the content composes (a cold load used to pin the footer under the die, then
  the arriving sheet shoved it off — CLS ≈ 0.08 on deep links). Late sub-content that
  can't be gated renders a stand-in with FINAL geometry (a party member's doc-loading
  cluster = the saved snapshot vitals in the live card's own barred chips). The `?`
  shortcuts sheet is sticky-mounted in `AppShell` after its first open, so closing
  drives Radix's `data-state="closed"` exit animation instead of unmounting mid-frame.
- **The overlay-history seam** (`src/lib/overlay-history.ts` + `useOverlayBack`) makes hardware /
  gesture Back close an open overlay instead of leaving the page. On open, an overlay pushes a
  sentinel history entry that CLONES the current `history.state` — since React Router keys locations
  by `history.state.key`, the clone reads as the SAME location and the route never re-renders. A
  single popstate listener consumes the sentinel on Back and closes the topmost overlay (LIFO — one
  entry per tier); any other close path (Esc / scrim / button) retires the sentinel with one silent
  `history.back()`. That rewind is **doubly guarded** so it can only ever unwind the overlay's OWN
  entry, never a real page one: it no-ops both when a real navigation changed the URL AND when the
  LIVE `history.state.folioOverlay` is not this cleanup's id — the latter catches a
  setup→cleanup→setup remount of `useOverlayBack` (React StrictMode / Offscreen / Fast Refresh) or a
  raced double-retire, which leaves the browser sitting on a DIFFERENT same-URL entry than the one
  being retired. Without that id guard, a conditionally-mounted modal's cancel/commit could
  `history.back()` off the sheet entirely (`/` → the index redirect → `/characters` — the
  dialog-bounce regression). The hook is wired into the ModalShell / Dialog / lightbox primitives
  ONCE, so every consumer inherits it — never per-dialog. This composes with the wizards' `useBlocker` (it needs no blocker, sidestepping
  React Router's one-blocker-at-a-time limit). **Confirm-tier dialogs opt OUT** (`ModalShell
backDismiss={false}`, set by `ConfirmDialog`): a store-driven confirm is a transient modal owned
  by a flow — and is frequently opened BY a `useBlocker` guard — so its sentinel-retirement
  `history.back()` would fire a stray pop that races the flow's own `proceed()`/`reset()` and
  corrupts the guarded navigation. It therefore never participates in Back; hardware Back falls
  through to the guard (which re-blocks while dirty) instead.
- **The keyboard seam** (`src/lib/shortcuts.ts` + `useGlobalShortcuts`). `shortcuts.ts` is the pure,
  i18n-free registry (`SHORTCUTS` — the declarative inventory both the listeners and the shortcuts
  sheet render from, so the sheet can never drift) plus the shared guards `isTypingTarget` /
  `inDialog` and the pure `nextSeqState` `g`-sequence reducer (armed-at timestamp, 1500ms window —
  DOM-free, unit-tested). `useGlobalShortcuts` (one `window` listener, mounted ONCE in `AppShell`)
  implements the global rows — ⌘K/Ctrl+K toggle the palette (the one key that still fires under a
  dialog), `/` opens it, `g 1/2/3` go to the realms via `realmTarget`, `g s`/`g a` reach
  Settings/Admin (Admin admin-gated) — behind the shared guards. The route-scoped accelerators
  (`useEditModeShortcut` on the cockpit, `useTurnAdvanceShortcut` in the encounter) stay
  route-scoped and only import the shared `isTypingTarget`. Bindings are FROZEN (EN mnemonics /
  positional digits) in both locales; only labels localize.

### The four-layer model + one-way dependencies

```
DATA    src/data/**                ids + mechanics ONLY — Grant unions, class/level tables,
                                    numbers, level maps. NO display strings.
  │ imported by
ENGINE  src/lib/** (core)          pure mechanics, NO locale. grants · compute · smart-tracker ·
        src/stores/**              level-up · cost-engine · resolve-* · codec/infer · MUTATIONS.
        src/types/**               OUTPUT: ids, raw numbers (feet, dice strings), i18n keys+args,
                                    structured intents. NEVER a localized/display string.
  │ consumed by
VIEWS   src/lib/views/**           the PRESENTER seam — pure, framework-free; the ONLY engine-side
        src/lib/pdf/**             layer that may read `locale`, call `localizeSrd`, and format
                                    units (localeDistance/formatSpeed/Weight). FORBIDDEN: React,
                                    Zustand stores, Firebase, DOM.
  │ rendered by
UI      src/features/** · src/app/**          renders view-models, binds inputs to IDS, localizes
        src/components/** · src/hooks/**       chrome via react-i18next. NEVER computes mechanics.
                                               hooks/ own: Firestore subscription, view-model
                                               assembly (calling lib/views/), TOAST localization.
```

The dependency rule is **one-way**: the engine (`lib`/`stores`/`data`/`types`) NEVER imports the UI
(`features`/`app`/`components`/`hooks`). Two sharpenings hold today: **(1)** `lib/views/` (+ `lib/pdf/`)
is a presenter sub-layer — it imports engine-core + `localizeSrd` + the `lib/utils` formatters, but NOT
React/stores/Firebase/UI, and engine-core never imports it (views depend on engine, never the reverse).
**(2)** Engine-core does NOT touch i18n or locale — the engine→i18n import count is **zero**; localization
is the presenter's job (toasts are emitted as structured `ToastIntent` data and localized in a UI hook).
A cross-aggregate concern belongs in a **feature-layer orchestrator** that composes engine primitives,
never inside the engine.

### The six i18n-completeness locks

It is **impossible to ship an untranslated string** — six independent locks, any of which fails CI:

| #   | Lock                              | Mechanism                                                                                                                             |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Throwing SRD resolver**         | `localizeSrd(kind,id,field,locale)` THROWS in dev/test on any missing kind/id/field (returns the `⟦…⟧` sentinel in prod).             |
| 2   | **Throwing missing-key handler**  | i18next `missingKeyHandler` throws in dev/test; `fallbackLng` DISABLED in dev/test (no silent English-in-IT); prod logs + falls back. |
| 3   | **No `defaultValue`, ever**       | An ESLint rule forbids `t()` `defaultValue` + inline `t("k") ?? "English"` fallbacks; `--max-warnings 0` blocks reintroduction.       |
| 4   | **en/it parity + no-empty**       | `i18n-parity.test.ts` pins key-set equality both directions + no empty-string value, across both `ui/` and `srd/`.                    |
| 5   | **Locale-sweep render assertion** | The surface gate sweeps surfaces × {en,it} × {dark,light}, failing on a raw key, the `⟦…⟧` sentinel, or English rendered in IT.       |
| 6   | **Build-time leak-lock**          | A Vite `buildStart` plugin (`vite.config.ts → i18nLeakLock`) fails `pnpm build` (non-zero) on ANY leak BEFORE a bundle is emitted.    |

**The build-time leak-lock (lock 6)** is the last line: a leak can never reach a user because the
bundle a user receives is only produced via `pnpm build`, and the build goes RED first. It runs the
ONE shared detector set in `scripts/i18n/` over EN + IT and every `srd/` catalogue — (a) en↔it key
parity both directions, (b) no empty/whitespace value, (c) no English-in-IT leak (an IT value
byte-identical to EN that reads as English — the SAME `STRONG_EN` heuristic as lock 4), and (d) every
STATIC `t("…")` literal in `src/` resolves to a real catalogue key. The detectors are PURE
(data in → violations out); the build gate (`vite.config.ts` + the `pnpm i18n:check` CLI) and the
unit guards (`i18n-parity.test.ts`, `i18n-dedup.guard.test.ts`) **import the SAME module**
(`scripts/i18n/leak-detectors.ts`), so the leak logic can never drift between "fails the build" and
"fails CI" (single source of truth, golden rule 6). Locks 4 + 6 assert the catalogues are clean
_now_; lock 6 additionally makes a future leak impossible to ship.

### The guard-test set (what locks the architecture)

| Guard test                                    | Locks                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `architecture-direction.guard.test.ts`        | engine never imports UI; engine-core never imports `@/i18n`/`i18next`/`react-i18next`; `lib/views`+`lib/pdf` are presenters |
| `pure-modules-guard.test.ts`                  | `lib/views/**` (+ CI-pure lib modules) import no React/stores/Firebase/DOM                                                  |
| `no-srd-strings-in-data.guard` (+ data guard) | no `BiText`/display literal in `src/data/**` (ids + mechanics only); the documented inline bypasses are whitelisted         |
| `no-bitext-indexing.guard`                    | no `.name[locale]` / `[locale]` BiText indexing in `src/features` / `src/components` (UI renders VMs)                       |
| `localize-srd.test.ts`                        | `localizeSrd` throws in dev/test on missing kind/id/field                                                                   |
| ESLint `no-i18n-default-value`                | `defaultValue` option to `t()` (and inline string fallbacks) forbidden                                                      |
| `i18n-parity.test.ts`                         | en/it key-set equality + no-empty + no English-in-IT across `ui/`+`srd/` (shares `scripts/i18n/leak-detectors.ts`)          |
| `i18n-dedup.guard.test.ts`                    | no new duplicate-(EN,IT) pair under two keys (golden rule 6); shares the `scripts/i18n` flattener                           |
| `scripts/i18n` build gate (`vite.config.ts`)  | lock 6: `pnpm build` fails on parity/empty/English-in-IT/missing-`t()`-key — the ONE detector the unit guards also import   |
| `a11y.spec.ts` / `i18n-sweep.spec.ts`         | surfaces × {en,it} × {dark,light}: no raw key, no `⟦…⟧` sentinel, no English-in-IT; axe-clean                               |
| `bundle-budget.guard.test.ts`                 | the eager-closure / entry / precache ceilings + the per-new-eager-chunk ratchet                                             |
| `value-breakdown.guard.test.ts`               | `sum(parts) === displayed total` for every breakdown-bearing value across the 6 fixtures + MOCK                             |
| `character-codec.test.ts` + team fixtures     | the `{schema,build,state}` round-trip + the 6 team fixtures render identically (canonical v3)                               |

The fast/slow test lanes + table-driven per-entity consolidation are documented in
`docs/CONTRIBUTING.md` (the gate split + smart test integration); coverage gates are ≥80% lines/
stmts/fns, ≥75% branches.

---

## Persistence + offline

Firestore SDK handles real-time sync + offline persistence transparently. Writes are
debounced (~2-3 s) inside `useCharacterSubscription`. The service worker
(`vite-plugin-pwa`) caches the app shell + SRD data for full offline play.

### Boot data-resilience — an empty result is authoritative only when SERVER-confirmed

The invariant, learned from the 2026-07-09 **"Clear site data"** incident (`PROGRESS.md`): **a
negative/empty data answer that is only `fromCache` must never render as the authoritative "you have
nothing" state.** Chrome's "Clear site data" wipes the Firestore IndexedDB cache while the SDK is still
running; on reload the first list snapshot resolves from the now-EMPTY cache (`fromCache: true`, zero
docs) BEFORE the server answers — and the mid-session wipe can leave the SDK's local layer wedged, so the
server answer is badly delayed or (until a fresh instance) never lands. Rendering the cache-empty result
as the first-run onboarding screen hid a broken data layer with no recovery (logout/login re-hit the same
empty cache; the same Firestore instance stayed wedged). The seam:

- **Roster** (`subscribeToCharacters` → `useCharacters`): the subscription opens with
  `includeMetadataChanges: true` and passes `snap.metadata.fromCache` to the callback (the cache→server
  transition changes only metadata, so without this flag the empty set would not re-fire). The hook
  settles — leaving the loader / never showing onboarding — only on a **server-confirmed, non-empty, or
  genuinely-OFFLINE** snapshot: a non-empty cache snapshot renders immediately (offline-first, a
  returning user's cached characters), and an OFFLINE cache-empty answer settles as the TRUE empty state
  (the cache IS the best available truth offline — the same online-only-confirm semantics as the
  campaigns path; no error, no eternal loader). ONLINE, if no authoritative answer lands within
  `ROSTER_SERVER_CONFIRM_TIMEOUT_MS` (10 s), it surfaces the **recoverable error state** (Retry →
  `window.location.reload()` → a fresh Firestore instance, which is what actually unwedges the SDK). A
  settled empty answer is the TRUE first-run state.
- **Campaigns** (`listSharedCampaigns`): BOTH reads are bounded by `withTimeout`
  (`CAMPAIGNS_READ_TIMEOUT_MS`, 10 s) — the initial `getDocs` AND the `getDocsFromServer` re-read it
  forces when the result is EMPTY, only `fromCache`, and the browser is online (bypassing a wiped/wedged
  local layer) — so a hung SDK always REJECTS to the caller instead of spinning forever. Offline keeps
  the cached answer rather than throwing. Every caller handles the rejection: the list page (error state
  with Retry), the palette + delete orchestrators + `dm-readers`/`refresh-attached-sheets` (pre-existing
  catches), and `Party.attachMyCharacter`'s pre-check read (invoked fire-and-forget) surfaces it as the
  `attachFailed` toast.
- **Chunk recovery** (`main.tsx` + `chunk-recovery.ts`): a wiped precache can 404 a lazy route chunk
  `import()`, which Vite raises as `vite:preloadError`; a one-shot (sessionStorage-latched) reload
  re-primes the shell, and `preventDefault` fires ONLY when the reload is issued — with the latch
  already armed the error propagates to the ErrorBoundary crash screen, never a silently-dead route. The
  latch clears `CHUNK_RELOAD_LATCH_CLEAR_MS` (15 s) AFTER a successful boot — deliberately past the
  first lazy route loads, because route chunks fail POST-boot: clearing at first paint would re-arm the
  reload for an immediately-refailing chunk and loop.

The cross-member "saw only another member's HP" flash was the SAME partial-load state (teammates' tiny
`combat/state` subdocs resolved while the viewer's own parent doc didn't), not a scoping bug —
`usePartyCombatStates` keys strictly by member uid. `withTimeout` (`src/lib/promise-timeout.ts`) is the
shared bound behind both the campaign reads and the portrait export read. Pinned by
`roster-boot-resilience.test.tsx`, `boot-resilience-utils.test.ts`, and the `campaign-io`
server-confirm + timeout-propagation cases.

### Unified persistence codec — ONE format for Firestore + export

The Firestore character document stores **exactly the same codec envelope as the portable export**:
`{ schema: 3, build, state, meta? }` (the id-based minimal model — see "Minimal-character codec (the import spine)" above),
produced by `serializeCharacterEnvelope` (`src/lib/character-codec.ts`, the shared core of
`serializeCharacter`) PLUS a small **SRD-free roster `cache`** + the Firestore-only metadata. There is
**one codec** (serialize/parse) for both Firestore and export — no second storage shape, no
`minimizeForStorage`/`toCharacterDoc` flat path (deleted; golden rule 10). The persisted doc:

```
{ schema, build, state,                              // == the export's {schema,build,state}
  attachedCampaignId?,                               // the ONE-campaign claim (B07) — ALSO the cross-user access root (below)
  cache: { name, ac, hpMax, speed, raceId, classes },// SRD-free roster/party projection
  portraitUrl, portraitCrop, shareId, status, createdAt, updatedAt }
```

- **WRITE** (`firestore.ts → toStoredPayload`): lazy-imports the codec + `character-cache`, writes
  `serializeCharacterEnvelope(doc)` as `{ schema, build, state }`, stamps `cache` via `buildCharacterCache`
  (effective AC + hp.max + speed + race id + `classes[]`, the SRD-free roster projection). A
  partial/field-only write passes through untouched. The lazy import keeps the SRD class
  tables off the always-eager persistence bundle (the bundle-budget guard).
- **LOAD single character** (`subscribeToCharacter` — used by the cockpit AND the DM read-only viewer, ONE
  load path): lazy-imports the codec, `parseCharacterEnvelope({build, state})` → the full in-memory
  `CharacterData` + `SessionState` (rehydrate + the read-time normalizations: race-trait pip remap,
  weapon-action-id remap, AC stamp), resolved with a supersession token so an out-of-order parse can't
  render stale data.
- **LOAD roster list** (`subscribeToCharacters`): stays **SRD-FREE** — reads ONLY the top-level `cache`
  via `cacheToRosterDoc`, NEVER `parseCharacter`, so the landing bundle never pulls the SRD corpus. It
  returns a **distinct, type-safe projection** `RosterCharacterDoc` (narrow `RosterCharacter`: name · race
  · classes · ac · speed · hp.max + session vitals), which OMITS the SRD-heavy fields and carries a
  `projection: true` discriminant — so a full-character engine function (`effectiveAC`) **cannot be called
  on it: a COMPILE error, not a runtime guard** (the structural cure for the unified-codec reshape crashes
  #115). Operations needing the COMPLETE character (Export, Clone) re-read on demand via
  `getFullCharacter(uid, charId)`.
  - **Roster current HP / death saves come from the `combat/state` subdoc, NEVER the parent `state`.**
    The parent doc carries no combat trio at all, so `cacheToRosterDoc` **baselines** the session through
    the shared `applyCombatToSession(…, null, cache.hpMax)` — the absent-subdoc full-HP default (a
    genuinely fresh/undamaged hero) — and `useCharacters` opens one live `subscribeCombatState` listener
    per own character (mirroring `usePartyCombatStates`) and folds each subdoc onto its tile via
    `applyCombatToRosterDoc`. So the roster reads the SAME canonical HP the cockpit / encounter / DM read,
    updates live on every HP tap, and the fallen-hero skull derives from the subdoc death saves — aligned
    by construction, no denormalized copy. The dev path (`rosterProjectionFromDoc`, no subdoc under
    bypass) reads the live session, the same combat source, so dev == prod.
- **The name is a branded `NonEmptyString`, UNREPRESENTABLE empty** — see the dedicated invariant
  section below for the construction-site contract; per-section fault isolation (the shared
  `ErrorBoundary` + `SectionErrorFallback` around each `CampaignHubPage` section) is the belt-and-
  suspenders behind it.
- **Snapshots** ride the SAME codec envelope (a corrupt row degrades to an empty sanitized character,
  never crashes). The migration converted both the main docs AND every flat snapshot, so `firestore.ts`
  reads ONLY the unified shape — NO transitional read-shim (golden rule 10).

### Combat-mutable state lives in a per-character subdoc (`combat/state`)

The character's combat-mutable state — HP `{ current, temp }`, `conditions[]`, death saves, the SOLO
`round`, and the SOLO `initiative` roll — has ONE persisted home: a per-character Firestore subdoc at
`users/{uid}/characters/{charId}/combat/state` (`CombatState`, `src/types/combat-state.ts`) — its SOLE
representation (golden rule 10). A CAMPAIGN ENCOUNTER's initiative is NOT here — it lives in the
campaign's `encounterInit` table (the initiative SSOT — see the dedicated bullet below). The subdoc is
**physically absent from the parent character doc**: the Firestore serialization boundary
(`toStoredPayload`) omits the trio from `state` via `omitCombatTrio`, so the parent `state` carries no
HP/conditions/initiative/death-save field. (The self-contained portable v3 EXPORT, which has no subdoc,
still keeps the trio inline — see `docs/CHARACTER_SCHEMA.md`.) The subdoc is a tiny, SRD-free,
id/number-only JSON; its IO (`src/lib/combat-state-io.ts`) is the only combat-state seam that touches
`firebase/firestore`, kept light off the always-eager bundle.

- **Why** — so the cockpit sheet AND the in-hub party/encounter surface read THAT one document and are
  aligned by construction (no drift between two surfaces showing the same HP). EVERY co-member reads it
  live (the live campaign-membership grant); the owner and the campaign's DM write it.
- **In-memory** — `SessionState` still carries the trio, so every existing reader (compute /
  use-hp-controls / rest / level-up / smart-tracker) is unchanged. The store stays Firebase-free: it
  does the optimistic in-memory update (immediate UI) + side effects (concentration save, death-save
  reset, log, undo) exactly as before; persistence is orchestrated in `useCharacterSubscription`, never
  the store.
- **Hydration** — `useCharacterSubscription` opens a live `subscribeCombatState` listener alongside the
  character listener and merges each snapshot into the session via `characterStore.hydrateCombatState`,
  behind an `isFromCombatRef` loop guard (so a combat-doc echo never re-persists to either doc). An
  **absent** subdoc defaults to **FULL effective HP** (never 0) — the correct value for a genuinely
  fresh/undamaged character. The held-snapshot reconciles either load order (the async char parse usually
  lands after the tiny combat doc). The cockpit keeps the SOLO raw initiative ROLL in `combatStore` (a
  separate in-memory copy the turn meter reads); `TurnEconomyProvider`'s `syncCombatFromSession` policy
  pulls it from `session.initiative` on **every** snapshot — seeding round + roll hydrate-once on a fresh
  character, then RECONCILING the roll (only) on each later same-character snapshot. (An ENCOUNTER roll
  needs no such plumbing: the sheet reads it straight off the live campaign doc via the global-combat
  status — a DM rolling for the player re-syncs in the same snapshot every surface gets.) The in-progress
  local roll lives in the `InitVital` tile (seeded on open), so the reconcile updates the display without
  clobbering a live edit; reusing the one character subscription keeps the free-tier listener count flat.
- **Persistence routing** — two store subscribers split a transition by field: a **non-combat** change
  (`nonCombatSessionChanged`, incl. the action log, which stays on the parent) writes the parent doc (the
  serialization boundary omits the trio); a **trio** change persists the WHOLE `CombatState` to the subdoc
  through the single offline-safe writer below. A mixed mutation (a Long Rest sets HP + slots) writes
  BOTH, each slice to its own doc.
- **Offline-first writes (durably queued, never lost).** The combat-mutable state is OFFLINE-FIRST and
  MULTI-WRITER — the owning player AND the campaign DM edit a PC's HP/conditions/death-saves from the
  cockpit OR the in-hub encounter card, often OFFLINE (Firestore persistence + service worker), and the
  views align by construction (both write the ONE subdoc). Every mutation persists through
  `writeCombatState` (`combat-state-io.ts`) — a single **`setDoc` OVERWRITE (no `merge`) of the FULL
  `CombatState`** (the payload is always the complete state, and the overwrite sheds stray/legacy keys —
  e.g. the retired `initiativeEpoch` — as a side effect). `setDoc` is **offline-queueable**: Firestore
  records it in the local cache and replays it on reconnect, so a damage / heal / condition / death-save
  taken offline is never lost. (This REPLACED a `runTransaction` read-modify-write, which REQUIRES a live
  server round-trip and REJECTS offline — the swallowed rejection silently dropped the edit, then the
  unchanged server doc re-hydrated over the optimistic value. That was the bug.)
  - The **cockpit store** already computes the optimistic next state for every op, so it persists THAT
    (one computation feeds both the UI and the durable write — no re-reduce). The store stays
    Firebase-free — it calls the injected `CombatPersistence.write` seam; the live `subscribeCombatState`
    snapshot reconciles.
  - Writers that hold the current state as a VALUE rather than a store (the DM encounter card via the
    member's live `combat/state`) use the op helpers
    `applyHpDelta` / `tickDeathSave` / `setCombatCondition` / `setCombatTempHp`:
    each reduces the given `base` (seeding the full-HP `defaultCombatState` when the subdoc is absent — a
    genuinely fresh/undamaged PC) and persists the whole result. The CLIENT passes `effectiveMaxHp` (rules
    can't evaluate grants; the clamp is in the reducer + re-applied on read by `applyCombatToSession`).
  - **Concurrency is whole-object last-write-wins.** Because each writer reduces over its LATEST
    subscription-hydrated state, edits to DIFFERENT fields (or the same field at different times) both
    land; only an EXACTLY-simultaneous same-field write loses one — the accepted, DM-correctable tradeoff
    (offline durability over lock-step). An emulator test pins that a FRESH absent-subdoc full-shape write
    is authorized for owner/admin/DM (and denied for a read-only peer).
- **Edit gate (mirrors the rules).** The UI offers a combat write only where the rules allow one: a PC
  card is editable by the OWNING player (`isMe`) OR the DM/admin; a non-DM peer card is READ-ONLY
  (`canEdit = isMe || isDm`). Structure edits (add/remove combatant, monster, turn/round, hidden toggle)
  stay DM-only. A REJECTED write SURFACES an honest toast (`campaignHub.combatWriteFailed`) — never a
  silent swallow, and never a retry: with the live-derived grants below, a denial is a real, terminal
  authorization fact (e.g. removed from the campaign mid-fight), not a stale cache to reconverge. (The
  old stale-`dmReaders` self-heal toast + eager-recompute retry machinery is DELETED with the ACLs.)
- **Security — cross-user grants are DERIVED LIVE (the single source of truth is the campaign doc).**
  There is NO stored reader list anywhere. The character doc carries ONE pointer,
  `attachedCampaignId` — written ATOMICALLY with the campaign's `memberDetails` by the attach
  transaction (B07) — and `firestore.rules` derives every cross-user grant from it + the LIVE campaign
  doc at request time:
  - char-doc **READ**: `owner || isAdmin || (notBlocked && requester ∈ get(campaigns/{attachedCampaignId}).members)`;
  - combat-subdoc **READ**: owner / admin / any CURRENT member of the attached campaign (read-superset);
  - combat-subdoc **WRITE**: owner / admin / the attached campaign's CURRENT `dmUid` (write-subset — a
    peer reads but cannot write); the parent char-doc WRITE stays owner-only, untouched.
    A DM transfer or roster change is effective IMMEDIATELY on the next request — there is no
    client-maintained ACL to recompute, so the whole class of "stale grant" convergence failures (the old
    `dmReaders`/`campaignReaders` machinery, its attach-time recomputes, self-reconcile listeners, and
    retry toasts — all deleted) is structurally impossible. The owner check short-circuits before any
    `get()`; a cross-user request costs at most two extra gets (parent char + campaign, deduped), under the
    10-get cap. The subdoc rule validates ONLY AUTHORIZATION — **never the shape**: the old
    `isValidCombatState()` field-lock rejected EVERY combat write whenever the DEPLOYED rules lagged the
    client payload by one field (the "initiative never saves" production outage: the client gained `round`
    on 2026-07-09 while prod rules were still v0.18.0's), and every writer here is already trusted while
    the client parses defensively on read (`parseCombatState`). A rules test pins that a payload with an
    unknown future field is ACCEPTED (the version-skew class guard).
- **The encounter is a pure-REFERENCE read model (no PC stat copy).** `campaign.encounter` carries PC
  combatants as bare references — `EncounterPc = { kind, id, memberUid, characterId, hidden? }` (no
  AC/HP/name/conditions/initiative on the doc; monsters keep their own state since they have no char
  doc). The in-hub **Party surface** (`features/campaigns/Party.tsx` + `party-encounter.tsx`, ONE live
  view open to ALL members) assembles each PC row LIVE: identity/AC/maxHP/passives derived from the
  member's char doc, current/temp HP + conditions from a live `subscribeCombatState` listener per
  attached member (`usePartyCombatStates`, authorized by the live membership grant), and the INITIATIVE
  ROLL from the campaign doc's own `encounterInit` table (below). The pure
  selector `encounter-view.ts → buildEncounterView` merges references + live state into a sorted
  view-model and resolves the current turn by a **stable `currentCombatantId`** (not a sort index). The
  display order is phase-aware: during the **gathering** phase (no frozen `order`) the list is a LIVE
  PREVIEW that re-sorts by initiative as players roll, but once **turns begin** the rows FOLLOW the frozen
  `encounter.order` — NOT a live re-sort — so a player's locked initiative can never silently reshuffle the
  table ("20 but sitting 3rd") and the DM's drag-reorder is reflected; the stable `currentCombatantId`
  keeps whose-turn aligned either way (a combatant missing from a stale frozen order is appended in its
  live-sorted slot, never dropped). `hidden` combatants are filtered out for non-DM viewers (DM ambush
  staging). Combat is an OPTIONAL LAYER on the
  resting party dashboard, not a separate screen. The trio merge is the ONE pure helper
  `applyCombatToSession(session, combat|null, effectiveMax)` (`combat-state.ts`), shared by the cockpit
  store (`hydrateCombatState`) and every peer card — `combat===null` defaults to full effective HP.
- **ENCOUNTER INITIATIVE lives on the CAMPAIGN doc — `encounterInit: { uid → raw d20 }` (the
  initiative SSOT).** A PC's encounter roll is ENCOUNTER-TABLE state, not character state, so it lives
  in ONE table on the one document BOTH writers are already authorized on — never a cross-user
  character/subdoc write, never a grant, never a shape-locked payload (the three failure modes behind
  the owner's "none of us can set initiative" outage, all structurally gone):
  - the **DM/admin writes ANY row** (the unconstrained `isDm()`/`isAdmin()` rules branch) — rolling for
    a player is an ordinary write to the DM's own campaign doc;
  - a **member writes ONLY their OWN row** (`firestore.rules → encounterInitOwnEntryOnly()`, a map-diff
    scoped to their uid — the four-direction matrix DM-any ✓ / member-own ✓ / member-peer ✗ /
    non-member ✗ is emulator-pinned);
  - every write is a PER-KEY field-path `updateDoc` (`campaign-io.setEncounterInitiative(campaignId,
  memberUid, roll)`), so concurrent rolls COMPOSE (offline-queueable, treasury-style) and the DM's
    debounced whole-`encounter` structural writer — which never touches the SIBLING `encounterInit`
    field — can never clobber a player's roll.
    The table stores the RAW d20 (NEVER the total — every consumer derives `total = roll +
initiativeBonus` at the display/sort edge, the bonus engine-computed + override-first) and every
    surface reads it through the ONE accessor `encounter.ts → encounterRollFor(encounterInit, uid)`:
    the party card, the encounter view (`derivePcLive` takes the resolved roll), the topbar pip
    (`viewerActiveEncounters` derives `notRolled`/`myRoll` per entry), and the cockpit turn meter (via the
    global-combat status). The shared `InitVital` widget takes the raw roll, displays the derived total,
    and commits through the same seam everywhere. **Per-fight reset:** `persistStartEncounter` writes the
    fresh `encounter` AND `encounterInit: {}` in one atomic immediate `updateDoc` (mirroring
    `persistBeginTurns`' immediacy), so a new fight starts with every PC un-rolled by construction — this
    REPLACED the old per-character `initiativeEpoch` stamp + its epoch-gating machinery (`rollForEpoch`,
    `combatEpoch`/`currentEncounterEpoch` store plumbing, the pip's per-encounter subdoc listeners
    `useViewerRollStates` and its fresh-vs-reload loading-window heuristics — all deleted; `encounter.epoch`
    survives only as the fight-identity stamp for the pip's most-recent default + the B04 same-fight
    guard). `persistEndEncounter` clears both fields atomically. SOLO initiative is a different fact with
    its own home: the character's own `combat/state.initiativeRoll` (owner-written, exactly like the solo
    round) — the cockpit turn meter routes its commit by phase (encounter → the campaign table; solo → the
    combat store/subdoc), so neither home ever mirrors the other (rule 10). The DM presses **Begin turns**
    (`beginEncounterTurns`) to point the turn at the top of the live order.
- **The turn order is FROZEN onto the doc at Begin-turns (`EncounterState.order: string[]`).** `Begin turns`
  (`beginEncounterTurns`, DM-only) calls `freezeOrder` to SNAPSHOT the live-sorted ids (including hidden)
  into `encounter.order`, then points `currentCombatantId` at `order[0]`. From there `advanceTurn`/`prevTurn`
  step **that frozen array read off the doc** — NOT a per-caller live re-sort. This cured the divergence
  disease: the order used to be recomputed at every caller from each member's initiative-gated `combat/state`
  (which the sheet cannot even read for its peers), so the order diverged per surface and the turn wrapped
  every advance. Now the sheet, the hub, the pip, and every advance read the IDENTICAL sequence with NO
  cross-member reads, and a mid-fight PC initiative change can't silently re-target the current turn. The
  scoped `advanceEncounterTurn` transaction carries an **`expectedCurrentId` (compare-and-set)**: it aborts as
  a clean no-op when the FRESH pointer no longer equals the one the presser saw, so a rapid double-click can't
  step twice and skip a combatant — the guard the DM path (which skips the player-owns-the-turn check) needs;
  the buttons also disarm while an advance is in flight.
  `advanceTurn` skips a MONSTER whose every token is dead (combat doesn't pause on a corpse) but NEVER a PC
  (a downed PC still takes its turn for death saves; PC HP isn't on the encounter doc, so a PC is
  structurally unskippable); `removeCombatant` splices a combatant out of both the membership and `order`.
  `order` is OPTIONAL/additive (absent or empty = the gathering phase) so a fresh `startEncounter` and any
  pre-feature doc stay valid.
- **Begin-turns gate · initiative lock · DM drag-reorder · reinforcement auto-slot (C3 — the DM owns the
  order once combat starts).** Four behaviours make "the order locks once combat starts; the DM owns every
  reorder" real:
  - **Gate:** Begin-turns is HARD-DISABLED until EVERY combatant — PCs and monsters — has an initiative; the
    button shows the disabled reason (a `Lock` glyph + an "{rolled}/{total} rolled" count). RAW: combat
    doesn't start until the order is set.
  - **Initiative lock:** once `currentCombatantId !== null` (turns begun), the shared `InitVital` chip on the
    party card AND the sheet turn-meter (`ThisTurnTracker`, gated on the `useTurnState` phase `my-turn`/
    `waiting`) go READ-ONLY, and the DM's typed monster-init chip locks too — the roll is fixed; the DM owns
    every order change. Gathering + solo stay freely editable.
  - **DM drag-to-reorder:** the DM/admin reorders the frozen order by dragging a leading-edge grip (native
    HTML5 drag — no library) and the WHOLE card is the drop target (drop-BEFORE); ArrowUp/ArrowDown on the
    focused grip is the keyboard-accessible path (WCAG 2.1.1). Both resolve to the pure
    `reorderCombatant(state, movedId, beforeId)` reducer, persisted as a DM STRUCTURAL write (the optimistic
    `setEncounter` + debounced campaign writer); `currentCombatantId` is PINNED (reordering never changes
    whose turn it is). DM-only + turns-begun-only — a player never sees the grip.
  - **Reinforcement auto-slot:** a monster added mid-combat (`addReinforcement`, the feature-layer composite
    over `addMonster` + `freezeOrder`) slots INTO the frozen order at its typed-initiative rank — preserving
    any prior DM reorder — instead of merely appending; `currentCombatantId` stays pinned. The pure engine
    `addMonster` still APPENDS to `order` (the never-orphaned safety net the auto-slot overwrites), because
    the correct slot needs each existing combatant's LIVE initiative which only the feature layer (with
    `pcLiveById`) has. Before Begin-turns it's a plain add (Begin sorts fresh).
- **The resilience invariants are TEST-ENFORCED (C6 — spec §9, the "paused for weeks" guarantee).** Three
  suites lock the encounter/combat state model against silent regression:
  - **HP-never-resets** (`tests/unit/encounter.test.ts`) — the WHOLE encounter lifecycle (start · begin-turns ·
    advance · wrap · prev · DM reorder · mid-fight reinforcement · remove · end) leaves every PC combatant
    BYTE-IDENTICAL to its pure-reference seed, and a hard monster edit (HP→0 + a condition) never bleeds onto a
    PC. By construction a PC's HP/temp/conditions/death-saves live ONLY in its `combat/state` subdoc, so no
    encounter reducer can read or write them — the encounter doc can never be the thing that resets them.
  - **Frozen-order integrity** (`tests/unit/encounter.test.ts`) — `order` is a duplicate-free SUBSET of the live
    combatants and `currentCombatantId` always names a real combatant; advance steps within `order` (wrap ⇒
    round++), reorder is a permutation that pins the pointer, removal splices both lists, reinforcement
    auto-slots, and advance/prev NEVER rewrite `order` (a turn-field write carries only `currentCombatantId` +
    `round`, so the frozen order stays DM-structural by construction).
  - **Reload-mid-combat resilience** (`tests/unit/combat-resilience.test.ts`) — an in-combat encounter + the PCs'
    `combat/state` subdocs round-trip BYTE-IDENTICAL through the REAL (de)serialization (`timestampsToDates` for
    the encounter — the same read transform `toCampaignDoc` applies; `sessionToCombatState` → JSON store →
    `applyCombatToSession` for each subdoc — the exact projection `replaceTrio` writes + the hydration the
    subscription reads): round, frozen order, whose-turn, epoch, and every PC's HP/conditions/death-saves
    resume exactly (encounter rolls resume off the campaign's persisted `encounterInit` table), so a
    fight left for weeks resumes with zero drift and no spurious re-roll.
- **Solo round home (`combat/state.round` — the subdoc is its sole persisted home).** In a campaign encounter the
  round lives on the shared `encounter` doc (the `useTurnState` seam reads it, killing the old private-counter
  drift — C2). SOLO, the round lives in the per-character `combat/state` subdoc's `round` field — the SAME home as
  the combat trio (HP / conditions / initiative / death saves), so the combat-mutable state has ONE home (rule
  6/10). It was consolidated OFF `session.round`, which is **deleted entirely** (field, codec entry, sanitize
  plumbing, every consumer): the turn engine (`combatStore.round`) is the round's only in-memory reader, so the
  parent-doc mirror was pure duplication. The bridge: `hydrateCombatState` mirrors the subdoc's `round` onto
  `characterStore.combatRound`; `TurnEconomyProvider` seeds/reconciles `combatStore.round` from that (via
  `syncCombatFromSession`, the SAME policy that reconciles initiative — so a subdoc landing after the char doc
  lands its round on the next snapshot, the ordering fix); a solo turn advance persists through
  `persistCombatRound` → the whole-object `combat/state` write (which now carries `round` — typed-when-present in
  `firestore.rules`, OPTIONAL for transition-compat: a deployed old-code client still writes the subdoc without it,
  and rejecting that write would silently drop an HP/condition/death-save edit; readers default an absent round
  to 1). The v3 PORTABLE codec DROPS `state.round` one-way at the import boundary (a legacy export's
  round is read-and-dropped, never re-emitted — the export has no subdoc, and round is ephemeral turn state a
  fresh import resets to 1). Any live doc that once carried a legacy parent `state.round` was migrated to the
  subdoc and the dead parent field dropped, so the subdoc is now the round's only persisted home everywhere.
- **One shell-level live combat subscription (INIT-2/3 + the C4 pip).** A single renderless, lazy-loaded
  `GlobalCombatMount` (`global-combat.tsx`, mounted once in `AppShell`) opens ONE
  `subscribeToSharedCampaigns` listener (the membership-scoped `array-contains` query — re-fires the moment
  an encounter starts/ends, fixing the old one-shot `listSharedCampaigns` that left combat invisible until
  reload), resolves **EVERY** active encounter the viewer is in keyed on the **auth UID**
  (`viewerActiveEncounters` — a PC combatant with `memberUid === uid`, **or** the DM/`isAdmin` of a campaign
  with a running encounter, NOT the open sheet, so the pip lights wherever the user is and a DM with no PC still
  gets a one-way jump). **Optimistic snappiness (no echo lag):** before resolving the encounters it overlays the
  locally-open campaign (the optimistic `campaignStore`, when the viewer is on its hub) over the synced list via
  the pure `overlayOpenCampaign`, so the viewer's OWN `setEncounter` edits (start / end / begin-turns) drive the
  pip in the SAME render tick — NOT ~2 s later when the autosave-debounced `updateCampaign` finally fires the
  shared-campaigns listener. Correctness holds (still the synced doc, last-write-wins): while the hub is open both
  the campaign-doc and shared-campaigns `onSnapshot`s are live on the SAME doc, so a remote write reaches the
  optimistic copy no later than the list — the overlay is only ever equal-or-fresher — and on navigate-away the
  subscription flushes the pending write then resets `campaignStore` to `null`, so the overlay is inert off the
  hub. It picks ONE to display
  (`pickPrimaryCampaignId` — the LOCAL pin if still active, else
  the most-recently-started by `epoch`), upgrades THAT one to a single live `useLiveEncounter` read (the cost
  posture — one live encounter at a time), and PUBLISHES two shapes into the light `combatStatusStore`
  through ONE reconcile seam (`combat-reconcile.ts` — see the turn-advance note below):
  - the `GlobalCombat` **status** of the viewer's OWN PC fight (`useGlobalCombat`) — read by the cockpit
    `in-combat-chip` + the `useTurnState` seam, unchanged shape so the sheet never branches on the pip model;
  - the `PipModel` (`usePipCombat`) — every active encounter reduced ONCE to a `PipState`
    (`needs-roll`/`your-turn`/`actor-turn`/`gathering`) for the topbar **`CombatPip`** (the C4 LABELLED SWITCH —
    `⚔ R{n} · {state} → {dest}`; colour carries the state; the destination flips `Party ⇄ {hero}` by the router
    surface; a count chip opens a chooser that PINS one fight locally and jumps to it). The reduction
    (`buildPipModel`/`pipState`/`pickPrimaryCampaignId`) is pure + unit-tested.
    It also fires the gentle "it's your turn" toast once per turn-entry (`turnStartKey`/`shouldToastTurnStart`, pure).
    The encounter ROUND/turn are read off the published status through the `useTurnState` seam below.
  - **The pip roll-state is a PURE DOC DERIVATION (`needs-roll`, per-encounter).** The loud red `needs-roll`
    is the viewer's OWN "still owes an initiative roll THIS fight" prompt, resolved **PER encounter** straight
    off each campaign doc's `encounterInit` table (`viewerActiveEncounters` derives `notRolled = no entry for
the viewer's uid` on every entry) — the SAME cheap shared-campaigns snapshot the pip already holds. NO
    per-encounter subdoc listeners, NO loading window, NO fresh-vs-reload heuristics (the old
    `useViewerRollStates` + `freshEpochByCid` machinery — deleted): a fresh fight reds in the SAME tick its
    doc arrives, a reload into a rolled fight is quiet in the same tick, a SECONDARY chooser row reads its
    OWN red, and a pin switch can never mutate another row (each row is its own doc's fact).
    The ONE non-navigating pip state is that red `needs-roll`: instead of switching it OPENS an inline
    `InitVital` roll-to-total popover anchored to the pip (roll your initiative from anywhere — the convenience the
    pre-switch pip had), so it DROPS the `→ {dest}` arrow. It is RENDER-RECONCILED to the STATE, not the status:
    the roller TRIGGER renders the instant the state is red — even in the brief window before the live
    `GlobalCombat` status (the bonus payload) lands — so a fresh-start red never flashes the navigating `<Link>`
    fallthrough (no arrow-then-morph); the popover shows a one-tick pending spinner until the status publishes,
    then the roll widget. It commits the viewer's OWN `encounterInit` row through
    `campaign-io.setEncounterInitiative` (lazy-imported so the topbar stays firebase-free) — a single
    campaign-doc field write, no combat base, no max-HP hydration gate (the old `maxHp > 0` guard existed only
    because the roll used to rewrite the whole combat subdoc); `InitVital` is imported SYNCHRONOUSLY (its own
    light leaf module) — a CONTROLLED popover - `InitVital.onDismiss` keep the edit layout through the exit (no dismiss flicker).
    (Under `DEV_BYPASS_AUTH` a `d20-dev-pip` flag publishes a deterministic `makeDevPip` model so a single pip
    state is shootable with no live plumbing; a `d20-dev-pip-scenario` flag instead seeds the PRODUCER's inputs —
    scenario campaigns where the viewer is a PC, with their roll (or its absence) in the doc's `encounterInit`
    table — so the REAL resolution runs end-to-end for the permanent `combat-pip-needs-roll` e2e. Tree-shaken
    from production.)
- **ONE turn seam — `useTurnState()` (`features/character/center/turn-state.ts`).** Every combat surface reads
  `{ round, isMyTurn, phase, currentActorName, endTurn() }` through this one hook, so the sheet and the
  campaign encounter can never disagree by construction (golden rule 6). In an active encounter it resolves
  round/turn from the SHARED encounter doc (via `useGlobalCombat`) and `endTurn()` IS the SAME
  `advanceEncounterTurn` transaction the encounter's Next button calls; solo it resolves from
  `combatStore.round` and `endTurn()` bumps that local round. **This fixed the owner's live "round 6, 7, 8…"
  bug:** the sheet's End Turn used to run the SOLO path unconditionally — bump a PRIVATE `combatStore.round`
  - fire a "Round N started" toast — and NEVER advance the encounter, so the shared doc stayed at round 1
    while the private counter climbed. Now `TurnEconomyProvider.handleEndTurn` reads the shared status at click
    time: in an encounter it ADVANCES the SHARED turn ONLY (NO private round bump, NO bogus solo toast); solo it
    keeps the local round bump + undoable toast. The seam's static graph is **Firebase-free** (the advancing uid
    is derived from the status's own `myId`/`pc-<uid>`, and `advanceEncounterTurn` is reached via a DYNAMIC
    import), so the eager cockpit + its unit tests never pull Firebase at module-eval. The pure resolver
    `resolveTurnState(gc, soloRound)` is unit-tested directly.
- **End-Turn hand-off: ONE reconciled, non-regressing publish (`combat-reconcile.ts`).** `handleEndTurn`
  publishes the optimistic `advanceGlobalCombat` the INSTANT End Turn is pressed (the `advanceEncounterTurn`
  `runTransaction` is NOT latency-compensated, so waiting for its server echo felt dead). The **fixed bug** (the
  owner's "'Your turn' FLASHES before '<next>'s turn'"): that echo reaches the two publish sources on SEPARATE
  Firestore watch targets — the `status` half via `useLiveEncounter`'s `subscribeToCampaign`, the pip half via
  the `subscribeToSharedCampaigns` query — that reconcile in DIFFERENT ticks, so the producer's `set(status,pip)`
  could republish an advanced status beside a STALE "your turn" pip (or a peer `combat/state` echo could re-run
  the status memo with the pre-advance read and revert the whole hand-off). The producer now publishes through
  `reconcileCombatPublish(status, pip, pendingTurn)`: (1) the primary pip entry's turn-phase is derived FROM
  `status` (`syncPipToStatus` — the pill and the sheet band are ONE derivation, so a stale-half publish is
  unrepresentable; a `needs-roll` row is left untouched), and (2) while the player's own advance write is still
  in flight (`pendingTurn`, set by the sheet, cleared by the producer once the real read reflects the advance or
  by `advanceSharedTurn` on write failure) the turn stays optimistically advanced, so no lagging listener can
  regress it below the hand-off. All pure + unit-tested (`combat-reconcile.test.ts`); the single-frame flash
  itself is pinned in REAL Chromium (`turn-indicator-flicker.spec.ts` — the old direct publish reproduces it,
  the reconciled publish never does; a `d20-dev-turn-flicker` replay flag, tree-shaken from production).
- **Action economy resets at TURN-START, not End Turn (C5).** The per-turn budget (action/bonus/reaction/movement)
  refreshes when the shared turn pointer LANDS on your PC — `isMyTurn` false→true — so it is always fresh at the
  start of your turn and robust even if you never formally End Turn (the DM advances you, you go AFK, the DM
  rewinds, you join mid-combat). `TurnEconomyProvider` detects the landing through a NON-reactive
  `useCombatStatusStore` subscription that REUSES the C4 `turnStartKey`/`shouldToastTurnStart` pure helpers (the
  SAME transition the pip's "it's your turn" toast fires on — no second detector), firing `resetTurn` once per
  turn-entry and finalizing the turn's per-slot undo refs. Reactions stay tickable OFF-turn (Shield, opportunity
  attacks happen on others' turns) and clear with the rest at your next turn-start. Solo (status always null →
  `turnStartKey` always null) the subscription never fires; the solo `endTurn()` resets the economy there (every
  turn is yours), so there is no double-reset. NOT surfaced in the encounter view (sheet-only — owner's call).
- **Symmetric transactional turn-advance (INIT-6).** The DM AND a player advancing their OWN turn both route
  through ONE `advanceEncounterTurn(campaignId, dir, { uid, isDm })` transaction (the debounced
  whole-encounter writer is reserved for STRUCTURE): it re-reads the encounter fresh, RE-VALIDATES the
  caller may advance (DM, or the owner of the current turn — the rules can't iterate the combatants array,
  so this who-is-current check is client-side inside the txn), and writes ONLY `{currentCombatantId, round}`.
  The turn order is read FRESH from the encounter's FROZEN `order` field inside the txn (NOT a caller-supplied
  `orderedIds` — that param is gone), so every caller steps the identical sequence and a concurrent DM reorder
  self-corrects on the next step; hidden is a display filter, never a turn-order filter (`order` includes
  hidden, so a staged ambush still takes its turn). A member advance writes only the two turn fields (never
  `order`), so the frozen order stays DM-only by construction. **Rules:**
  `turnFieldsOnlyChanged()` allows a member to update `campaign.encounter` only when
  `diff().affectedKeys().hasOnly(['currentCombatantId','round'])` (the encounter must exist on both sides;
  combatants/status/roster stay byte-identical), while the DM/admin keep the full encounter write. The
  FROZEN `order` is DM-only STRUCTURAL state by construction — it is deliberately OUTSIDE the
  `turnFieldsOnlyChanged` allow-set, so a member advancing the turn can never freeze, drag-reorder, or
  smuggle an `order` change (Begin-turns + drag-reorder stay DM/admin-only via the unconstrained
  `isDm()`/`isAdmin()` branch — no new write path). Tolerant: a PC with no roll sorts last, an un-advanced
  turn is fine, nothing breaks if the DM never runs the tool, a player never rolls, or a player is offline.
  (Pinned by emulator rules cases: member turn-only allowed; member structure/status/smuggled/`order` write
  denied; DM/admin `order` write allowed; DM full; non-member denied.)
- **`DEV_BYPASS_AUTH`** — every combat read/write/listener is a no-op (mirrors `firestore.ts`), so dev
  runs on the optimistic in-memory update alone. The dev fixture loader (`dev-fixtures.ts` →
  `loadDevFixture`) seeds the trio to its absent-subdoc default (full effective HP) through the SAME
  `applyCombatToSession(session, null, max)` converter, so every dev surface shows full HP even though the
  fixtures carry no `state.hp` (the parsed default would otherwise be 0).

#### The combat-state migration is COMPLETE — the subdoc is the SOLE home (golden rule 10)

The trio moved homes AFTER live users already had it on the parent doc. The one-off
`scripts/migrate-combat-state.ts` backfilled the `combat/state` subdoc from each un-migrated parent and
`deleteField`ed the five legacy keys; once it ran against production and 100% coverage was verified, the
script + its test + the read-time fallback (`CharacterDoc.legacyCombatFallback`, `legacyCombatFromRawState`,
`legacyTrioPresent`) were all **DELETED** (golden rule 10 — a migration is not done until the
data is migrated, coverage verified, and the shim + old fields removed; a lingering dual representation is a
bug class). The durable result: the `combat/state` subdoc is the SOLE persisted home of the combat trio;
the parent doc never carries it (`toStoredPayload` omits it via `omitCombatTrio`); and EVERY reader/writer
base is simply the subdoc, falling to the full-HP `defaultCombatState` only when the subdoc is genuinely
absent (a fresh/undamaged character). **Deploy prerequisite** (why the sequence matters): fallback-free code
is safe to ship ONLY after the migration created a subdoc for every existing character — a wounded character
with no subdoc would read full HP and lose its wound. Migrate the data first, verify coverage, then deploy.

- **No `encounter.turnIndex` read-shim** — the EncounterState tracks a stable `currentCombatantId`, and
  the campaigns/encounter feature is undeployed, so no live campaign doc carries an encounter (let alone a
  legacy `turnIndex`). A conform would be day-one dead code; the decision is documented at `toCampaignDoc`
  (`campaign-io.ts`).

#### One campaign per character (invariant)

A character attaches to **at most one campaign**. Enforced at the attach seam: before writing an
attachment, `Party.attachMyCharacter` runs the membership-scoped `listSharedCampaigns(uid)` and REJECTS
(friendly toast, no write) when the hero is already attached to ANY OTHER campaign — a swap WITHIN the
same campaign and a detach are always allowed. The same predicate
(`memberDetails[uid].characterId === charId`) is what the migration's `--check` mode and
`refresh-attached-sheets` use. Firestore rules can't cheaply enforce a cross-campaign uniqueness (no
queries in rules), so this is an app-layer guard plus the verify report; a member still only writes their
own `memberDetails` entry.

### Non-nullability invariant — an empty character name is UNREPRESENTABLE

A character's `name` (and the party-member snapshot + roster-cache + roster-projection name) is a
**branded `NonEmptyString`** (`src/lib/non-empty-string.ts`), not a plain `string` — a phantom `unique
symbol` brand, so a bare `string` is not assignable where a name is required; the only way to obtain one
is the smart constructor `nonEmptyString(raw): NonEmptyString | null` (or its throwing twin). Reads stay
transparent (a `NonEmptyString` IS a `string`), so only **construction** sites change (the creation gate,
cockpit inline-edit, codec parse, cache stamp, mock/dev fixtures). This makes "a character with no name"
impossible to CONSTRUCT — superseding the old render-time placeholder tolerance (`boundaryName` /
`campaignHub.unnamedCharacter`, both DELETED, golden rule 10). `campaignHub.unnamedPlayer` (a player
account with no display name) is a separate concept and remains.

The boundaries enforce the same must-have set so no invalid value can ENTER, and REJECT (never tolerate
or invent) a corrupt one on the way out: **creation** mints `nonEmptyString(name)` and returns early on
`null`; **cockpit inline-edit** is `required` (an empty commit reverts, never writes `""` — golden rule
20); **codec parse** (`validateCharacterData`) rejects a missing name / species / ability score, an empty
`classes[]`, or `hp.max < 1` gracefully (shows the validation message, never a crash); **roster read**
(`cacheToRosterDoc → … | null`) and **campaign read** (`toCampaignDoc → rejectCorruptSnapshots`) resolve
a corrupt row to `null` (filtered / "no character attached"), self-healing on the next save. A
should-never-fire safety net behind the construction-site guarantee. `Portrait.name` stays optional ONLY
for non-character avatar uses (a Google avatar with no name → a "?" monogram).

A campaign DM reads a member's full sheet through the same `subscribeToCharacter` path the owner's
cockpit uses, authorized by the live campaign-membership grant — see "Co-members read each other's
full sheet" under **App structure** below (the single home for that contract).

Action logs persist to **IndexedDB** locally — never sent to Firestore until session-recap
time (cost-minimisation rule).

---

## Performance budget (P3)

> The app's value depends on a fast first paint on a phone. This is the **measured baseline +
> enforced ceilings**. A static guard (`tests/unit/bundle-budget.guard.test.ts`, run by `pnpm
test:budget` AFTER `vite build`, in the CI `build` job + the pre-push hook) FAILS the build if any
> ceiling is crossed. Update BOTH the ceiling constant and this table in the same commit when a
> ceiling is deliberately raised.

### Baseline + the eager closure

The honest "what a cold visit downloads" number is the **eager static closure**: the entry script
plus every chunk reachable through `import "./x.js"` edges, plus the eager stylesheet — NOT just the
named `index` chunk. The current measured baseline (the gz byte figures + the per-chunk breakdown)
lives in `tests/unit/bundle-budget.guard.test.ts` (the authoritative numbers) and in git history.
Two deliberate chunk-shaping decisions hold: a dedicated `modal-shell-*.js` chunk keeps the eagerly
reachable Radix-Dialog runtime out of the **entry** chunk (it must stay under its ceiling), and the
**bilingual SRD split holds** — an EN user never downloads the IT display catalogues; the heaviest
lazy chunks (CharacterCockpit, the IT-locale SRD variants, the PDF-export renderer — precached for
offline use) load only on the route/locale that needs them.

### Enforced ceilings (baseline + headroom)

| Ceiling                          | Value      | Guard constant             | Headroom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | ---------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| entry chunk gz                   | ≤ 61 KB    | `ENTRY_CEILING_KB`         | +14% (raised 60→61 KB 2026-07-10 for the eager global keyboard-shortcut listener + the nav-anchor chrome; the SHORTCUTS row table stays in the lazy ShortcutsSheet chunk)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| eager closure gz (JS + CSS)      | ≤ 773 KB   | `EAGER_CEILING_KB`         | ~+4% (raised 750→755 2026-07-10 for the compendium school-enamel palette; +1→756 2026-07-16 — the day's two ratified features, main's rules-text colour grammar + the Gilded Reliquary ornament, left the closure at 755.006, within gzip/build noise of 755 and flipping the gate; +1 KB restores deterministic headroom; +17 KB 2026-07-17 — the content-pack partition: the same EN catalogue bytes ship as public+pack chunk pairs (slightly worse per-chunk gzip) plus the composed-build overlay + @pack seam, measured 769.7; baseline still 727.1 — near budget, see frontier #1)                                                                                                                                                                                                                 |
| PWA precache                     | ≤ 7276 KiB | `PRECACHE_CEILING_KIB`     | +7% (raised 2026-06-11 for P1-PDF lazy renderer chunk; +1 KiB 2026-07-16 for the Gilded Reliquary per-theme corner ornament, after ~45% trimming the two `--frame-ornate` SVGs; +96 KiB 2026-07-17 — Batch-4 v2 plates P12–P14, encoded WebP q75 + sharp_yuv; +3 KiB deterministic headroom, same-day correction — the 7247 raise landed exact-fit against a 7247.22 measured build and flipped on the next rebuild; +2 KiB 2026-07-17 — the wave-2 identity strike's raw growth, build 7249.1, restoring the ~3 KiB never-exact-fit floor; +10 KiB 2026-07-17 — the content-pack partition's split catalogue chunk pairs + overlay, measured 7256.6; +14 KiB 2026-07-17 — the SRD repatriation's verbatim EN+IT prose on the 22 re-sourced entries atop the dual-SRD legal attribution, measured 7270.8) |
| per NEW eager chunk gz (ratchet) | ≤ 50 KB    | `NEW_EAGER_CHUNK_LIMIT_KB` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Never re-baseline a ceiling to an exact-fit measured value.** Two straight knife-edge flips proved
it: the 2026-07-16 eager-closure raise (755→756) landed AT the measured 755.006 and a routine
rebuild flipped the gate on ~6 bytes of gzip wobble; the 2026-07-17 precache raise (7151→7247)
repeated the mistake and flipped again the very next rebuild (7247.22 measured vs a 7247 ceiling).
Every raise must clear the measured value by a deliberate few KiB/bytes of deterministic headroom,
not land on it — see the raise-protocol comment in `tests/unit/bundle-budget.guard.test.ts`.

The per-chunk **ratchet** is the sharp edge: a new eager chunk over 50 KB gz needs an `EAGER_ALLOWLIST`
entry with a one-line justification (same pattern as the grant-kind / route-coverage guards). So
eagerly importing the IT SRD blob or a heavy lib into the app shell trips the guard with the chunk
named — it can't sneak in. The allowlist legitimately lists `firebase` / `react-vendor` (framework)
and the `spells` / `magic-items` / `class-features` corpora (frontier finding #1 below).

A runtime probe (`tests/e2e/_perf-probe.spec.ts`, gated on `PERF=1`, never in CI) navigates the key
routes under a mobile throttle and prints Navigation-Timing + web-vitals — CLS is excellent (≤ 0.003)
and FCP is fast; the cold-transfer weight from `dist/` (the guard) is the authoritative figure.

### Frontier findings (deferred — the highest-value future wins)

Three measured-but-deferred wins are documented in the budget guard's allowlist, in priority order:
**(1)** the entire SRD corpus is eager (~200 KB gz) because the Grant engine reads SRD facts
synchronously (`smart-tracker.ts` + `resolve-grant-sources.ts` statically import the spell/magic-item/
class-feature data, pulled by the always-eager character store) — the highest-value win, but fixing it
means making SRD resolution lazy at the sacred data↔UI seam; **(2)** `firebase` + `react-vendor`
dominate the framework cost (~240 KB gz) — granular Firebase sub-SDK imports would help but touch the
init seam; **(3)** the eager CSS is one Tailwind sheet — route-level CSS splitting is low ROI vs (1).
All three are out of a measure-only track; the corpus chunks are knowingly allowlisted until (1) lands.

> Binding constraint on **all** tasks/phases. Sharpens `CLAUDE.md`'s "zero budget" rule.

**Firebase / Firestore stays on the FREE (Spark) tier permanently.** No architecture decision may
assume or require paid-tier scaling. Context: ~7 users, private, biweekly play — never enterprise
scale. **Forbidden patterns:** high-frequency real-time sync at scale; listener-heavy / always-on /
broad subscriptions; read amplification / fan-out / global recompute loops; always-on backends
(cron / always-on Functions implying paid usage); presence / typing / per-keystroke sync.

**Binding design principles:**

1. **One document per entity; denormalize.** One char doc holds sheet + session; a campaign = one
   `/campaigns/{id}` doc + small subcollections (sessions, chronicle).
2. **On-demand, scoped, DETACHABLE listeners only.** Subscribe to the active character / open
   campaign; **detach on navigate-away.** No global or always-on listeners; never stream the whole party.
3. **Debounced writes (~2 s) + offline-first cache + last-write-wins.**
4. **Client-side derivation** — the engine computes derived values in the browser; no server recompute.
5. **On-demand AI / recaps** — explicit one-off user action, never always-on / background.
6. **Local-only where possible** — action logs are IndexedDB-local; the per-turn economy is client
   state, not written per action.

**Per-system cost posture:** cockpit/economy = client state debounced into the one char doc (per-turn
economy ephemeral); roster = bounded own-characters query; compendium = static bundled SRD (zero reads);
campaigns = one doc + small subcollections, on-open scoped + cached; recaps/sharing = on-demand / one
denormalized public-read doc. Free-tier caps are SHIPPED in `src/lib/limits.ts` (20 chars / 5 campaigns /
50 snapshots, FIFO-pruned).

**Overriding principle:** where an ideal scalable-SaaS pattern conflicts with free-tier-for-a-small-
group, **free-tier wins.** An over-budget feature is REDESIGNED to be efficient, never removed — UX
is not reduced, only backend complexity / sync / cost.

---

## App structure + render/listener contracts

`src/app/` is the **shell + router** (the persistent rail/topbar chrome, `router.tsx`, layouts);
`src/features/` holds the **feature modules** (`character`, `campaigns`, `compendium`, `creation`,
`leveling`, `roster`, `report`). The data↔UI seam runs between the engine + data and this presentation
layer. The character sheet is a single `CharacterCockpit` shell rendered at `/characters/:characterId` —
no per-page route file.

**Cockpit edit ↔ play is ONE global signal** (`uiStore.sheetMode`, persisted). The edit toggle flips
it — the Binder's Fob ✎ coin on desktop, the header `EditingPill` on compact viewports (one home per
viewport, `useBinderFobHome`); every inline override (`InlineEditable`) and bulk-edit flow gates on it.
It is driven three
ways — the toggle, **Esc** (exits edit, armed only while editing), and a **⌘E / Ctrl+E accelerator**
(`useEditModeShortcut`, route-scoped to the cockpit; inert while focus is in an input or on a read-only
member-sheet viewer, so the keyboard can never enter edit on someone else's sheet).

**Campaign membership lives ENTIRELY on the campaign doc** — the character document carries NO campaign
reference. A hero is attached by `campaigns/{id}.memberDetails[uid].characterId` (+ a lite
`MemberCharacterSnapshot` at `.character`), keyed by character id, so a character can be attached to more
than one campaign at once. `PERSONAL_CAMPAIGN_ID` is a purely VIRTUAL UI sentinel for the "in no shared
campaign" state — never persisted.

**Member-entry writes are attachment-safe (the join-clobber invariant).** A member's `memberDetails[uid]`
entry holds two unrelated concerns: IDENTITY (displayName · photoURL · role) and the
ATTACHMENT (`characterId` + the `character` snapshot). These are written by DISJOINT seams that must never
overwrite each other: **`setMemberCharacter` alone** ever touches `characterId`/`character` (per-leaf,
attach/detach); **`joinCampaign` is idempotent + attachment-blind** — a re-opened invite link for an
EXISTING member is a no-op (it reads the doc — only members can — and returns), and the first-join write
seeds ONLY identity fields via per-leaf paths, never `characterId`/`character`. So re-clicking an invite
link can NEVER drop an attached hero (the prod data-loss bug: a whole-object overwrite that dropped the
`character` key). Belt-and-suspenders at the rules layer: `memberEditsOnlyOwnEntry()` (a member update may
change AT MOST their own `memberDetails` entry, via `diff().affectedKeys().hasOnly([uid])`) closes the
A-edits-B vector that the key-set-only `rosterAndOwnerUnchanged()` left open. Pinned by
`campaign-io.test.ts` (re-join writes nothing) + `tests/rules` (A-edits-B denied; own-entry self-attach
allowed; a per-leaf write merges, preserving the attachment).

**Co-members read each other's full sheet (the live-membership read path).** A character doc is
PRIVATE to its owner by default; **sheets are fully open to the team** — every campaign member may open
any teammate's WHOLE sheet read-only (secrecy is DM-vs-players, never player-vs-player). A co-member
reads the **real** character doc the SAME way the owner's cockpit does (`subscribeToCharacter` →
read-only store via `loadReadonly`, rendering the SAME cockpit body) — there is no denormalized sheet
copy (golden rule 10). Authorization is DERIVED LIVE in `firestore.rules` from the character's
`attachedCampaignId` pointer (written atomically with the roster by the B07 attach transaction — the
one-campaign claim doubles as the cross-user access root) + the campaign doc itself: the requester must
be a CURRENT member of THAT campaign (`owner || isAdmin || (notBlocked && requester ∈
get(campaigns/{attachedCampaignId}).members)`). The char-doc `write` stays owner-only. There is NO
stored reader list and NO client-side ACL maintenance: a DM transfer, roster change, or removal is
effective on the very next request, so the old `dmReaders`/`campaignReaders` recompute/self-reconcile
machinery (and its convergence-failure class) is deleted entirely. A dangling pointer (campaign
deleted) fails CLOSED for peers; the owner always keeps access. The one-off
`scripts/backfill-attached-campaign.ts` backfills the pointer for any pre-B07 attachment at deploy
time and sweeps the dead ACL fields (rule 22; deleted once run).

**The auto-save fan-out (free-tier-safe).** When the owner's character auto-saves, the feature-layer
orchestrator `features/campaigns/refresh-attached-sheets.ts` refreshes the lite party snapshot
(`memberDetails[uid].character`) in every attached campaign so peers see reasonably-live AC/HP (the DM's
full sheet needs no fan-out — it reads the owner's real doc live via the live membership grant). It is bounded:
ONE membership-scoped `listSharedCampaigns` read, lazy + memoized per cockpit session, targeting only the
attached campaigns (normally 0–1), fire-and-forget (a failed/offline write never blocks the save).

### The presenter layer (`src/lib/views/`) — the localization line (R2)

Between the engine and the UI sits a **pure presenter layer**, `src/lib/views/`: framework-free
functions `(engine output + locale) → render-ready view-model`. It is the **ONLY engine-side layer
that may localize/format** — read `locale`, index a `BiText`, or call the unit formatters. Engine-core
emits **ids + raw numbers + i18n keys/args** and **never imports i18n** (pinned by the
`architecture-direction.guard` zero-import count; `pure-modules-guard` pins `lib/views/**`
React/store/Firebase-free). Present modules: `sheet-view.ts` (LeftHud/ResourceRail/Bio merge +
senses/speeds/immunities/advantage chips), `saves-checks-view.ts` (`deriveSavesAndChecks` — the ONE
locale-free home of the six saves + 18 skills + three passives row math, shared by the cockpit rail
`LeftHud` AND the in-combat "Saves & Checks" Play panel; a parity test pins the rail's rendered output
=== the builder), `combat-action-view.ts` (log-icon type, action sort, upcast text + the
`composeTurnLimiters` "what's limiting you" summary), `weapon-facts-view.ts` (the **unified weapon facts VM** — `buildWeaponFacts` produces ONE
`WeaponFactsVM` rendered by the SAME shared `WeaponFacts` component on BOTH the Combat and Inventory
tabs, so the two weapon cards are identical by construction; a mastery chip appears only for an OWNED
mastery), and `toast-intent.ts` (the toasts-as-data localizer).

**`LocText` — the engine's localizable text REFERENCE (`src/lib/loc-text.ts`).** Engine-core carries a
display string it cannot materialize (it has no IT and must not read the active locale) as a
self-describing `LocText` pointer, resolved at the presenter edge by `localizeText(text, locale)`
(`lib/views/srd-i18n.ts`). `loc-text.ts` is PURE (the type + tiny constructors; no React/i18n/store).
The four variants:

- `srd` (`srdText`) — a stable catalogue ref `{ kind, key, field }` → `localizeSrd(...)` (the common
  case: SRD content lifted into the id-keyed catalogues).
- `custom` (`customText`) — a USER-authored single string (homebrew name/description) → shown verbatim
  via `localizeCustom`.
- `lit` (`litText`) — an ENGINE-authored bilingual `BiText` constant (Unarmed Strike, the "(off-hand)"
  suffix, base action-menu labels) → `text[locale]`. It freezes BOTH locales in code.
- `ui` (`uiText`) — a REF to a `common`/ui CHROME key (e.g. `combat.otherReactionName`), resolved at
  render via `i18n.getFixedT(locale)(key)`. Unlike `lit` it stores ONLY the key (never a frozen
  both-locale value), so a logged row re-localizes on a language switch and the EN canonical resolves
  via the always-loaded EN `common`. Use for a view-synthesized row whose label is chrome, not SRD
  content, not user text (the combat off-list reaction). The key MUST exist in BOTH `{en,it}/ui/*.json`.
  The combat LOG persists a `nameLoc: LocText` and resolves it via `localizeText`, so every logged action
  re-localizes correctly in any locale. The union is ADDITIVE: old persisted `{srd|custom|lit}` events
  round-trip + resolve unchanged after `ui` was added (`nameLoc` is stored/read as opaque JSON — no
  closed-set validation on the persistence path), so no data migration was needed.

**The value-breakdown seam (`src/lib/value-breakdown.ts` + `BreakdownTip`).** Every composite derived
value that "varies based on several components" exposes a tap-for-breakdown tip through ONE generalized
register (golden rule 3). The engine emits locale-free `RawBreakdownPart[]` (label = an APP i18n key /
ability code / SRD name ref; value = a signed number, or a `dice` string); `breakdownTotal(parts)`
DERIVES the headline as the sum, so the shown value and the decomposed tip are the same arithmetic by
construction (rule 6). The presenter `localizeBreakdown` resolves the labels; the ONE `BreakdownTip`
component renders them. Every composite value has a `build*`/`compute*Detailed`/`*Breakdown` producer
feeding this register (AC, initiative, spell DC/attack, saves, passives, max HP, weapon damage/to-hit,
heal — list in `value-breakdown.ts`). A single-component value gets no tip (golden rule 19); an override
suppresses it. **Max HP is the OVERRIDE-GATE special case** (#95): its stored max shows the tip ONLY when
`storedMax === computeCharacterMaxHp(...)` (a hand-pinned/rolled max deviates, like `acOverride`).
**Every entity-naming part** labels via that entity's ONE canonical catalogue key (a `{ loc }` SRD ref,
never a bespoke `breakdown.*` term), so the tip can't localize the entity differently from its own
surfaces (rule 6). `tests/unit/value-breakdown.guard.test.ts` pins `sum(parts) === displayed total`
across the 6 fixtures + MOCK, the HP override-gate, and (table-driven) each entity name in EN + IT.

**Toasts-as-data.** `stores/characterStore.ts` no longer imports i18n. Destructive/combat mutations
push a **structured `ToastIntent`** (`src/types/toast.ts` — a `kind` discriminant + raw args: ids +
numbers) onto `toastStore`; the `useToasts` hook (UI) localizes it at render via
`lib/views/toast-intent.ts`, resolving any id arg (a condition id → its localized name) there. This
made `characterStore` the last engine→i18n import to be removed.

**The PDF export is a presenter CONSUMER (`src/lib/pdf/`).** Client-side character-sheet PDF export
(the official D&D 2024 structure, EN + IT) is a pure consumer of this seam: `character-pdf-view.ts`
assembles a fully-localized view-model ONLY from the engine presenters (mirroring the cockpit panels
exactly, so overrides + multiclass render identically by construction), and `character-pdf.ts` (pdf-lib,
dynamically imported so it never weighs on the entry bundle) maps over it with zero D&D logic. `lib/pdf`
is a presenter sub-layer like `lib/views` (classified as a presenter by the architecture-direction
guard; engine-core never imports it). Entry points: the roster kebab + the cockpit header, via
`character-pdf-export.ts → downloadCharacterPdf` (portrait via the same 8s-capped Storage-SDK path;
degrades to no-portrait, never silent).

Two contracts keep this fast and leak-free under the free-tier NFR:

- **Listener abstraction.** Every Firestore listener (character + campaign + compendium) goes through
  **one** subscription abstraction (`use*Subscription` hooks) that auto-tears-down on route /
  component unmount, never stays active across an inactive route, and never leaks a background
  subscription. No feature subscribes to Firestore directly.
- **Render isolation.** Derived sheet values are memoized (pure cached selectors); the Left/Right HUD
  must **not** re-render on unrelated tab changes; center-panel state changes must not cascade into
  HUD re-renders; tab switching changes view state only (no full-sheet recompute). The React Compiler
  is **not** enabled (plain `@vitejs/plugin-react`) — a `cockpit-render-isolation` test guards the hot
  path, so blind `memo()` is unnecessary and risks regressions.

---

## Where to put new code

| You want to…                             | Put it in…                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| Add a new spell                          | `src/data/spells/level<N>.ts`                                                  |
| Add a new feat                           | `src/data/feats.ts`                                                            |
| Add a new race                           | `src/data/races.ts`                                                            |
| Add a new class subclass                 | `src/data/classes/<class>.ts` (`SUBCLASSES`)                                   |
| Add a new mechanic type                  | `src/lib/grants.ts` + evaluator branch                                         |
| Add a new tracker formula keyword        | `src/lib/smart-tracker.ts` `resolveTrackerTotal`                               |
| Add a new combat-panel action behaviour  | `SrdActionDef` extension + smart-tracker                                       |
| Add a new cockpit tab/section            | `src/features/character/` (the `CharacterCockpit` shell)                       |
| Add a new shared UI component            | `src/components/shared/<Component>.tsx`                                        |
| Add a new SRD reference helper           | `src/lib/srd-resolve.ts`                                                       |
| Localize/format engine output for a view | `src/lib/views/*` (the ONLY engine-side layer that may)                        |
| Emit a combat/destructive toast          | a `ToastIntent` (`src/types/toast.ts`) — never a string                        |
| Log a combat/story event                 | a `CombatEvent` (`src/types/combat-log.ts`) via `logEvent`                     |
| Localize a combat-log line               | `src/lib/views/combat-log-view.ts` (the ONLY log localizer)                    |
| Add a UI (chrome) i18n string            | `src/i18n/{en,it}/ui/<group>.json` (the group's shard)                         |
| Add an SRD content string                | `src/i18n/{en,it}/srd/<kind>.json` (id-keyed)                                  |
| Add a new tool (proficiency + item)      | id+category in `src/lib/tools.ts`; name in `srd/equipment.json` (the ONE name) |
| Add a new character lifecycle step       | `src/lib/level-up.ts` / `level-up-choices.ts`                                  |
| Add a new test                           | `tests/unit/<topic>.test.ts`                                                   |
| Add an E2E test                          | `tests/e2e/<flow>.spec.ts`                                                     |

---

## What this app deliberately doesn't do

- **Roll dice.** `Math.random()` is banned; deterministic formulas only.
- **Magic-fix migration of SRD references.** When the SRD changes, the app shows a clear
  "this feature was removed/renamed" warning rather than silently rewriting the character.
- **Per-character cosmetic skinning.** One theme system, two themes (dark + light + system).

---

## Pioneering choices

1. **Declarative grants.** Effects are typed data on the SRD rows, aggregated via one pure evaluator —
   not interpreted rule text or hard-coded per-feature modifier paths. No prose-regex module exists.
2. **One Mock.** `src/lib/mock.ts → MOCK_CHARACTER` (Lyra Voss, Elf Bard 9, College of Lore) covers
   every edge case. Extend, never branch.
3. **Override-first.** Every derived value auto-computes from grants AND is manually overridable
   (`overrides` on the character / `trackerOverrides` on the feature ref) — no "automation lock."
4. **Docs are the system of record.** This file + `CLAUDE.md` + `docs/MECHANICS.md` + `PROGRESS.md` +
   `docs/PRODUCT_CONSTITUTION.md` are written for both human + AI agents; the pre-commit hook enforces
   docs co-update with code.

---

## Branch layout

- `main` — release branch; tagged on every release (see `CHANGELOG.md` for the current version).
- Per-task work lands via **one worktree + a branch-off-`main`, converged and merged to `main`
  by the agent — no PRs** (the repo standard — see `docs/WORKTREES.md`); `main` stays the
  integration branch.

Each work item gets a `.changeset/*.md` describing its bump (`pnpm changeset`); releases
are minted via `pnpm changeset:version` + a `vX.Y.Z` git tag.

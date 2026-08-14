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

Branch checkpoint pushes deliberately run no verification. The pre-push hook runs **typecheck +
lint zero-warnings + the unit suite + coverage ≥ 80% + production build** exactly once, when the
finished branch targets `main`. Never `--no-verify`.

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
**`@pack`** plus the two lazy bestiary sub-entries (`@pack/monsters` and
`@pack/monster-art`) is the whole seam:

- **Resolution** (`scripts/content-pack-mode.ts`, consumed by `vite.config.ts` + `vitest.config.ts`
  - the tsconfig `paths` fallback): `content-pack/index.ts` when the directory exists and
    `VITE_CONTENT_PACK` ≠ `0`; else the typed-empty stub `src/data/pack-empty.ts`. The shared export
    contract is `src/data/pack-types.ts`; each mode's typecheck pins its own resolution
    (`pnpm typecheck` / `pnpm typecheck:srd-only` → `tsconfig.srd-only.json`).
- **`@pack/monsters` — the lazy bestiary-data sub-entry** (`packMonstersAliasTarget()`; pack mode →
  `content-pack/data/monsters/index.ts` — the barrel over the eight alphabetical tranche files
  `a-b.ts … t-z.ts`, mirroring the public `src/data/monsters/` split for parallel-safe authoring;
  SRD-only → the SAME `src/data/pack-empty.ts` stub, which exports
  `packMonsters: []` alongside the other empty pack seams so there is no second stub to keep in step).
  The `@pack` BARREL is eager-reachable — the always-eager Grant engine reads
  `packFeats`/`packSpells`/… through it — and **Rolldown places whatever that barrel re-exports in
  the EAGER chunk regardless of the `manualChunks` bucket the source module claims.** For a
  fixed-size export that is a rounding error (`packQuickbuildPresets`, ~8 rows of bare ids, stays
  on the barrel deliberately). For the **bestiary it is fatal**: the corpus grows without bound,
  and the measured wave-1 pilot (10 statblocks) cost 1.24 KB gz of eager closure against 1.12 KB
  of remaining headroom — the manifest's other 163 would have added ~20 KB gz eager. So
  `packMonsters` is served off its own alias and is NOT re-exported from `content-pack/index.ts`;
  the corpus is reachable only from the lazy `src/data/monsters/index.ts`. **Rule for a future
  corpus: anything that scales gets a sub-entry, never a barrel re-export.** In the alias MAPS
  (`vite.config.ts`, `vitest.config.ts`) `@pack/monsters` must be listed BEFORE `@pack` — string
  aliases match by prefix; the tsconfig `paths` entries are literal and order-independent, but are
  kept in the same order for readability. Measured on the fix
  (`tests/unit/bundle-budget.guard.test.ts` → the closed SEAM DEBT record): eager 777.87 → 776.50
  KB gz across the same 14 chunks, `cockpit-engine` 387.7 → 386.3, entry unchanged at 61.81,
  precache flat at ~9044 KiB / 301 entries (the corpus moved chunks, it was never written twice).
- **`@pack/monster-art` — canonical private portrait URLs**
  (`packMonsterArtAliasTarget()`; pack mode → `content-pack/data/monster-art.ts`, SRD-only →
  `pack-empty.ts`). The public aggregate `src/data/monster-art.ts` merges public + private
  URL maps by stable id; the exact-id/dimension/weight guard
  (`tests/unit/monster-art.guard.test.ts`) requires one 672×840 WebP per database row at
  ≤90,000 bytes. Public sources live at `assets/monsters/`; private sources remain at
  `content-pack/assets/monsters/`. Both emit under `assets/monsters/`,
  stay out of the PWA first-install precache, and
  enter a one-year CacheFirst runtime cache only when viewed. Database art is derived at render
  from `srdId`, never copied into Firestore; custom monster uploads remain encounter/library data.
- **Merge points** — every per-category aggregate composes `public + pack` through
  `src/lib/pack-merge.ts` (an id collision or an overlay patch aimed at a missing entry THROWS at
  module init): `data/spells.ts`, `feats.ts`, `races.ts`, `backgrounds.ts`,
  `background-equipment.ts`, `magic-items/index.ts`, `maneuvers.ts`, `beasts/index.ts`,
  `monsters/index.ts` (the lazy bestiary corpus — `packMonsters` appends via `mergePack`, imported
  from the `@pack/monsters` sub-entry above, never the barrel),
  `classes.ts` (pack classes append; pack subclasses extend their public class table),
  `quickbuild.ts` (the per-class creation presets — the ONE record where a pack entry REPLACES
  the public one, keyed by class id via `overlayPackRecord`; see below),
  `srd-names.ts` (the eager name index — the pack side is `content-pack/data/names.ts`,
  literal names only, so the roster chunk never drags the pack corpora). Consumers only ever read
  the aggregates — never a `@pack` (or `@pack/monsters`) path — so the seam stays single: the ONLY
  modules allowed to import either alias are the merge points themselves.
- **The Polymorph Beast catalogue is a projection of the monster corpus** (D-5): the
  eager `src/data/beasts/beasts.ts` is not hand-authored — `scripts/beast-projection.ts`
  (`beastProjectionFromMonster`, the ONE shared derivation) maps each `MonsterStatBlock` to its
  `BeastStatBlock`, and the **COMPLETENESS** guard
  (`tests/unit/beast-monster-projection.guard.test.ts`) owns that derivation — it asserts EVERY beast
  resolves to a monster twin and DEEP-EQUALS its projection (no intersection skip), so `beasts.ts`
  and its `beasts.json` EN/IT keys can never drift from the corpus (golden rule 6, by CI). RAW:
  Polymorph
  grants Beast forms only, so the guard also pins every twin to `type === "beast"` — the 2024
  Monstrosity/Celestial reclassifications (flying-snake, axe-beak, giant-vulture, giant-eagle,
  giant-elk, giant-owl) are swept OUT of the catalogue, and a future reclassification fails loud.
  Runtime `beasts.ts` imports NOTHING from `data/monsters` (the eager Polymorph graph never
  grows), and top-level beast ids stay stable — a persisted `session.polymorphForm.beastId` is
  byte-safe across a re-derivation, even as attack/trait sub-ids and numbers change.
- **i18n** — pack EN srd shards are statically bundled and merged in `src/i18n/srd-en.ts` (the EN
  facts rule is unchanged); non-EN pack shards lazy-load through the pack's own
  `content-pack/i18n/loader.ts` and merge inside `loadSrdCatalogues`. The LAZY srd shards
  (the bestiary corpus) load per-(locale, kind) through `loadPackLazySrd` (the pack twin of
  `loadLazySrdKind`, EN included) and merge inside `ensureSrdKind`, never on the eager `packSrdEn`.
  The monster catalogue is PARTITIONED into per-tranche fragments
  (`content-pack/i18n/{en,it}/srd/monsters/<tranche>.json`, mirroring the data tranches for
  parallel-safe authoring); `loadPackLazySrd` merges all fragments of the requested (locale, kind)
  into one catalogue, and the build-time leak/parity (`scripts/i18n/catalogue-io.ts`) + the composed
  IT-name guard (`tests/unit/__helpers__/it-name-registry.ts`) merge the same fragment directory.
  The pack's `overlay.ts`
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
  picks + explicit opt-outs are kept). Class inference follows only `classTables.levels[].featureIds` plus
  the selected subclass rows: catalogue option entries that no level table grants are choices, never silent
  defaults. An explicitly stored legacy choice remains lossless and suppresses only its redundant placeholder.

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
| { type: "free-cast-spell";  spellId; chargesPerRest; rest; castLevels? }
…
```

`evaluateGrants(sources)` walks every source row (race traits + feats + class features +
equipped magic items + invocations + **maneuvers** + backgrounds — assembled by
`resolveAllGrantSources` in `src/lib/resolve-grant-sources.ts`) and aggregates into
`AggregatedGrants` — the merged effect view (the `AggregatedGrants` interface in
`src/lib/grants.ts` is the source of truth for its fields).

Condition-disabled sources are removed at this same evaluator boundary, before a consumer can count
them. A `save-bonus` may declare `suppressedByConditions`; Aura of Protection uses Incapacitated and
Unconscious, so its Charisma bonus cannot leak onto the Paladin's own Death Save while the aura is
inactive. This is typed source data plus the aggregate's effective-condition set, never a consumer-side
name check.

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

`src/lib/smart-tracker.ts` exposes `resolveTrackers(character)` which returns the locale-free
character's current trackers (Channel Divinity, Bardic Inspiration, Rage uses, Spell
Slots-as-pool, Sorcery Points, Lucky uses, …).

Each tracker comes from a `mechanics.tracker` declaration on a class feature / feat / race
trait. The spec:

```typescript
interface TrackerSpec {
  total: string; // formula: "PB", "level", "CHA", "1+level", "floor(level/2)"
  recovery: Recovery; // "short-rest" | "long-rest" | "dawn" | "per-turn" | "manual" | …
  autoRecover?: false; // cadence known; recovered amount requires table input
  longRestRecovery?: number; // fixed partial amount; omitted means full recovery
  die?: string; // "d6" / "d8" / "d10" / "d12" for inspiration-style
  recordedRolls?: { min: number; max: number }; // externally rolled values held until spent
  isPool?: boolean; // pool mode (Sorcery Points)
  unit?: string; // "pts" / "HP" / "uses"
  shortRestRecovery?: number | string; // partial recovery (Second Wind, Wild Shape)
  refreshOnActivationOf?: string; // full refill when this stable active-state key starts
  levels?: TrackerLevelOverride[]; // per-level overrides for total/die/recovery
}
```

The formula language supports constants, ability codes (`CHA`/`WIS`/…), `PB`, `level`, arithmetic
(`* + - /`), and `ceil`/`floor` rounding — so mixes like `"1+level"`, `"PB*2"`, `"ceil(level/2)"`
resolve. Trackers scale via `levels[]` for class-table thresholds (e.g. CD uses 1 → 2 → 3 at L2/L6/L18);
per-character `trackerOverrides` overlay the SRD defaults (the universal override pattern).

A tracker may additionally declare `recordedRolls`. This does not roll anything: it turns each
remaining use into one bounded numeric entry for a physical-table result (Diviner Portent is the
first consumer). The exact values live beside `used` in `session.trackers`, survive navigation and
export/import, clear with the tracker's normal recovery, and are spent/corrected through the same
immediate-commit + exact-undo seam as ordinary uses. Custom features expose the same optional range;
the engine therefore gains one homebrew-capable primitive, not a Portent-specific state branch.

An activation-scoped pool declares `refreshOnActivationOf` with the stable key of its owning state.
The common action activation transaction refills every matching tracker only when that state was
previously off; the returned inverse restores the exact pre-activation counters. Reusing an already-lit
action or a maintenance action cannot refresh it. Fanatical Focus is the first composed consumer
(`barbarian-rage`), but the field is part of `TrackerSpec`, resolved trackers and portable custom tracker
data, so future features and homebrew use the same route. `recovery:"manual"` remains the honest rest
cadence for such a pool; presenter copy names the activation trigger instead of exposing “Manual.”

Some tracker rows are **DERIVED, not hand-declared** (golden rules 2 + 6). Legacy magic items still
derive an item-id tracker temporarily, but every migrated mutable item instead declares catalogue
`ResourceSpec` data and stores state under its physical `SrdEquipmentRef.instanceId`; and a feat/feature that
grants **≥ 2 free-cast spells** (Fey/Shadow/Vampire-Touched, the multi-spell heritage feats) emits ONE
INDEPENDENT 1/rest row PER SPELL via `resolveFreeCastFeatTrackers`, keyed `${featId}:${spellId}` — so
casting one never locks the others (the prior shared-`total:2` counter deadlocked them). The row, the
cast gate (`spell-cast-sources`), the spend (`useTracker`), and short-rest recovery all resolve to that
one key (a shared `forEachFeatFreeCast` iterator builds the row + the recovery so they can't drift).
A **single**-free-cast source keeps its bare-id `mechanics.tracker`. Spell SLOTS, like every tracker,
are now manually editable on the rail (tap a gem to spend, a spent socket to restore) — override-first
(golden rule 8), so any mis-spend is correctable, not just within the cast's undo window.

A charged single-spell item may declare `castLevels: [{ level, cost }]` plus
`resourceCost: { resourceId }` on that grant. The shared
`resolveSpellCastOptions` path expands only affordable rows, the cast-level modal shows the scaled spell
facts plus the exact charge cost, and both Play and encounter commits debit/undo that cost through the
same physical-resource command. Omitting the schedule preserves the ordinary fixed-level, one-unit cast.
An item-provided `always-prepared-spell` is only the visibility bridge for that item route: removing
equipped items must leave the spell independently known before normal character slots are offered.

A `free-cast-from-list` action carries both its spell-pool attribution and an explicit payment address.
The source id selects the exact eligible list even when homebrew pools share a resource; after the spell pick,
the provider materializes the ordinary resolved spell action and rejoins the same cast-level → target
resolver → commit path. The selected turn record therefore names the spell and the actual charge payment,
while action economy, effects, concentration, Chronicle provenance and undo are identical to an ordinary
cast. Optional typed source overrides replace only the declared cast facts (fixed save DC, fixed spell
attack bonus, concentration, maximum duration) through `lib/cast-source-profile.ts`, shared by fixed-spell
and list casts on both solo and encounter routes. A concentration-free persistent source cast owns one source+spell active key and round
timer, so recurring actions remain available until deterministic expiry without pretending the spell still
uses Concentration. Confirmation and redo revalidate the live eligible pool and remaining resource before
mutating.

An equipped magic item's activated property declares its action economy and optional
`resourceCost` on the existing `while-active` wrapper. `resolveMagicItemActivationActions` emits an
ordinary Play action carrying the exact item/copy/resource address and `activatesKey`; the standard
target-review transaction spends the resource, lights the state and arms its timer atomically.
Inventory, Resources, rests and cast/action surfaces resolve that same owner. Variable Dawn dice are
typed `entered-roll` recovery amounts requested from the table before commit; deterministic partial/full
recovery is likewise data, and explicit Dawn/Dusk controls prevent any Long-Rest or wall-clock alias.

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

### Canonical mechanics runtime cutover (active)

The destination runtime has one exact physical state model, `MechanicsWorld`, spanning the loaded
character and shared-combat documents. Every executable capability resolves to an immutable
`MechanicsProgramAuthorityReceipt`; a durable program-root occurrence is the sole carrier of that
authority, while every effect occurrence is a direct child identified by `parentId`. Roots never
duplicate actor/source/target/program identity, and effects never carry a second authority. Inventory
and item/occurrence references include monotonic physical ordinals so deleting and recreating an id cannot
make an old command, resource address or occurrence authority valid again. `EntityRef` is one exact union:
character `self` is identified by its already-physical character material, while every mutable non-self
entity carries its positive entity ordinal. A bare mutable entity id is only a storage slot and never a
runtime reference.

Physical material is governed by the same generation law. `InventoryGenerationRef` is the only runtime
identity for an item copy; enchantment links and causal leases carry the complete owner + instance-id +
ordinal reference. Every created entity or item atomically creates one dedicated
`material-lifecycle` occurrence, and world validation proves that a lifecycle owns at most one physical
generation. Dismissal changes availability, not identity: the dismissed entity and its own lifecycle stay
addressable while ordinary effects that require its presence become eligible to end. Controller links are
exact generation references, may cross loaded documents, and the world rejects every local or
cross-document controller cycle.

Every non-root occurrence also carries one structured `ProgramStepOccurrenceOrigin`: exact root
generation, phase id, phase execution, globally unique authored step id and deterministic expansion
slot. World validation resolves that origin against the root's frozen program, checks that occurrence
kind matches the referenced step and rejects duplicate emissions. A closed world accepts only committed
executions; an unforgeable pending-frame permit admits exactly its one-ahead execution, and only the LIFO
top may create the current authored step's consecutive expansion slots. Root allocation is a standalone
zero-state transaction before that frame is pushed. Effect provenance is therefore queryable data, never
an occurrence-id naming convention or English/source regex.

Public mechanics commands contain only invocation identity or answers to engine-issued requests. The
trusted adapter constructs a complete, recoverable execution frame containing the authority receipt,
invocation, exact root create/advance CAS receipt and typed trigger evidence. Terminal operations carry
one canonical cause id whose public cause contains only the invocation. The kernel independently resolves
installed authority from the trusted `MechanicsAuthoritySnapshot`, or program authority from the exact
persisted root generation, then recomputes the id over `(authority, invocation)`. It also binds every
operation to the installation owner and injects definition/installation guards; authority is therefore
never self-attested by command JSON. Every distinct cause is resolved against the same immutable action
basis before the first operation mutates anything, so consuming a source cannot make a later operation
from that already-authorized source depend on array order. A transaction rejects missing, unused,
duplicate or forged causes before simulation. The same envelope will produce one reversible `JournalActionDraft` for the whole
causal action, never one draft per reaction or target.

The low-level operation union owns every deterministic physical transition. Program, effect, entity and
inventory creation all carry their exact preallocated generation and compare it with the relevant
`next*Ordinal` high-water mark; entity/item creation also writes its lifecycle in the same atomic
candidate. Entity availability/controller changes and inventory quantity/equipped/attuned/end changes
operate only on exact generations. Reducing an item to zero preserves its lifecycle ownership, clears
impossible equipment/attunement/outgoing-enchantment state, leases the exact source for the surrounding
causal action and requests lifecycle ending. If another item points at that enchantment, the operation
must name that exact inbound bearer and compare-and-swap both copies—there is no world scan whose result
can silently depend on execution order.

Allocator counters are high-water identity, not reversible game state. The journal rejects descendants of
a high-water path, requires a direct write to move strictly forward and requires an ancestor snapshot to
preserve or raise every nested counter; undo/redo therefore cannot smuggle a rollback. Rebase likewise accepts only a monotonic
counter transition: an idle encounter may be created only at the prior `nextEncounterEpoch` while
incrementing it exactly once, a live encounter keeps its epoch and nondecreasing combatant allocator, and
ending it cannot lower either high-water. Ordinary game state remains reversible. Every terminal
operation exposes its complete read, semantic-write and technical-write footprint, including references
embedded in entity vitals/templates, effects and inventory enchantments. Shared reads remain disjoint;
read/write or semantic-write overlap forms connected table-ordering partitions. Allocator overlap instead
adds immutable ordinal precedence, merged topologically with the table's genuine choices and never exposed
as freedom the user can reverse. The compiler must allocate every generation in causal order; duplicate,
skipped, reversed or stale allocation chains fail closed in kernel simulation. An end rule that observes
Temporary HP reads its target's vitals, and a persistent timeline-bound creation reads the owning
document's clock binding—not merely the clock currently written into the rule—because releasing a final
shared-combat lease rebases every such rule in that document.

Rest and day-phase identity follows the same allocation law. Each material timeline owns the first-unused
`nextBoundaryOrdinal`; beginning one of those qualitative boundaries allocates the current ordinal and
increments the counter before the checkpoint or any subscriber can create another lifetime. A rest/day
end rule records `minimumBoundaryOrdinal` and becomes due only for the same clock/selectors at an observed
ordinal greater than or equal to that minimum. An effect created during boundary `N` therefore records
`N + 1`, cannot expire retroactively on `N`, and remains compatible with a later matching boundary even
when other qualitative boundaries occurred between them. Shared-clock release rebases the rule to the
target timeline's current first-unused ordinal rather than copying a number from the detached clock. The
branch-only `MaterialState` runtime shape is schema 4; no schema-3 `MaterialState` was ever deployed or
persisted, so there is no live migration or compatibility reader to retain.

Entity dismissal and encounter membership are one physical transition for a non-current participant:
before the candidate is admitted back through the closed-world parser, the kernel removes that exact
generation from every local/shared encounter, repairs initiative membership and releases any character
whose final shared-combat lease has disappeared. Dismissing the current participant instead returns an
exact `needs-boundary` command carrying the generation to exclude, without mutating the world. That
authenticated complete-turn state machine emits the real end boundary, performs any round/time boundary,
selects and emits start for the next surviving participant, or returns a sole-participant encounter to
initiative. Only after it finishes does the retried operation own the entity dismissal and membership
removal. Historical causal cleanup may remove the original current participant only inside this exact
continuation before a successor starts; an unrelated, stale or post-start boundary fails closed.
Controller writes (including controlled creation) share one semantic controller-graph address because
cycle validation reads the whole loaded graph; encounter membership changes likewise share one semantic
address. These real read dependencies
must never be misclassified as disjoint target writes.

The operation-level turn surface is claim-only: action, attack, Bonus Action, Reaction, movement,
interaction and explicit table-boundary claims are isomorphic to the canonical `TurnEconomyClaimCommand`.
`start-turn` and `end-turn` remain private lifecycle inputs to the encounter boundary state machine and
cannot be forged by a program terminal step. All hostile arrays/records are accepted only through exact
own enumerable data descriptors. The kernel snapshots descriptor values once and never rereads a hostile
proxy after validation, so neither an accessor nor a stateful proxy trap can change a proposal or ordering
answer between conformance and execution. A closed persisted encounter in turn phase must name exactly one
current participant whose economy is `own-turn`; the boundary parser alone may carry the transitional
`between-turns` shape while ending one turn and starting its successor.

Operation mutation and causal closure are deliberately separate. A terminal change first preserves
every active source so post-events and `source-end` subscribers can still resolve their authority. Each
ordered operation produces only an authenticated process-local projection capability. Its public value
carries the exact transaction-local `MechanicsWorld` and cumulative inventory-source leases; a private
runtime fiber binds both to the original trusted causal basis. It is not a `MechanicsCausalState` or a
reusable causal receipt, and cloned, serialized or reconstructed projections fail authentication. The
ephemeral registries behind such capabilities (kernel causal states, event emissions, subscriber
selections, compiler continuations, transaction projections) are possession proofs of kernel provenance
only: every authoritative fact lives in the frozen value and the causal state, so a registry can never
become a second history, progress or persistence model. Prefix
projection validates protected journal epoch/revision/actions plus character build revision, but never
runs end discovery, causal rebase or pending-phase acceptance. The compiler refresh validates the
projected world against the already-conformed basis and its exact pending frames without conforming or
rebasing that world. The transaction kernel re-proves the caller's basis with the fixed-point
`conformMechanicsCausalState`; a `rebaseMechanicsCausalState` call therefore always means a genuine
post-transaction closure. After the complete transaction, the simulation/commit path performs exactly one
causal rebase and discovers/latches the net end wave. This lets one atomic transaction create a
`temporary-hp-empty` source and grant its Temporary HP without observing an impossible intermediate
expiry, while preserving any wave that was already latched when the transaction began. The coordinator
then delivers subscribers, appends their consequences and finalizes dependent-first removals plus
unreachable material cleanup. Concentration replacement remains an explicit barrier, not an eager delete
hidden inside occurrence creation. Intermediate inventory tombstones are legal only under exact
instance-id + ordinal leases and cannot escape as a persisted world.

The only hostile causal entry begins from a closed `MechanicsWorld`; typed continuations are produced and
advanced only by the kernel. Ending candidates are latched explicitly on their still-readable occurrences
as canonical causes. One canonical closure request owns all observed boundaries, explicit end requests and
inventory leases, including a checkpoint whose current wave is empty. This is pure serializable transient
state—not a caller-supplied history, hidden object identity or persisted compatibility model—and the
closed-world parser rejects it. After every complete atomic transaction the kernel monotonically extends
that request and its latches, so newly due dependencies join the same causal action while ending sources
remain readable without treating an intermediate ordered step as a causal boundary. A
suspension stores fenced inputs and observations and replays from the closed basis; it never serializes a
purportedly trusted continuation. End discovery is one bounded indexed worklist over dependency, boundary,
Concentration, ownership, inventory, live-entity and Temporary-HP edges; it emits a deterministic
dependent-first wave without recursive deletion or repeated whole-world scans.

Source readability is not mechanical activity. An occurrence whose exact `ending` latch is present remains
addressable only for authority, provenance, child traversal and `source-end` delivery; active conditions,
grants, standing facts, damage/condition defenses, marks, Concentration, polymorph forms, item activations
and deadlines exclude it. Active-only exclusivity permits a replacement Concentration, form or standing
defense to begin in the same causal action while the old generation is still readable. Compiler/reviewer
access to this transient is likewise singular: hostile requirement/review APIs continue to accept only a
closed world, while the causal path re-proves the complete `{ context, world }` state from its exact wave,
request, latches and leases and then uses only that canonical result as the basis for every authenticated
prefix projection and final simulation. A raw readable world, forged context or unauthenticated projection
is never a trusted compiler view.

A program root's `phaseState` is the sole phase-completion truth. During that one post-transaction causal
rebase, a child with a `program-phase-end` lifetime resolves its exact root generation, phase and authored
execution: the current or an overdue execution latches an exact `program-phase-completed` cause, while a
future execution stays live. The closure request carries no second phase-completion ledger. Exact root
generation therefore closes same-id ABA without duplicating phase state.

Program conformance also proves phase-lifetime liveness statically. A lifetime may end in its creating
phase or in a strict downstream phase. A non-self lifetime cannot point backward or sideways into a
one-shot invocation branch, and a source-end feedback path that would require the effect's own ending to
reach its expiry phase is rejected. An accepted authored program therefore cannot create an immortal
effect merely because its end phase is unreachable.

Table time/rest/turn/encounter progression uses the pure `beginMechanicsBoundary` /
`advanceMechanicsBoundary` state machine. Each checkpoint names the exact newly observed boundary, or
`null` when it only extends the current end wave. `completeMechanicsBoundaryCheckpoint` is the sole
production constructor for a completion: it re-proves the supplied causal state and binds it to the
complete continuation fingerprint. Same-wave completion may finalize, while a wave created or extended
during subscriber delivery must surface as another checkpoint first. Historical boundary proofs
survive only the exact clock/encounter hand-off performed by that state machine. There is no injected
resolver and no API through which a caller can return a replacement world.

The authentic post-event set is intentionally small: `damage-taken`, `hit-points-zero` and
`resource-depleted` derive only from exact applied operation stages. `program-root-create` allocates an
all-zero phase map plus authored initial registers and emits no completion event;
`program-phase-transition` is the final exact phase compare-and-swap and alone emits
`program-phase-end` with the root occurrence generation, phase and completed execution for subscribers.
Its acceptance marks the exact top frame `phase-complete` and performs the sole causal rebase, so any
lifetime made due by that transition is latched in the same returned state before subscriber delivery.
`source-ending` derives only from a re-proved readable end wave. Each
non-invocation trigger evidence carries that emitted event's exact id, and the phase CAS receipt must carry
the same id, so evidence cannot be replayed under an invented identity. Phase-completion events trail all
ordinary events from the same complete transaction while retaining deterministic order among themselves;
simulation/compiler results expose that sequence only as opaque process-local emissions: every ordinary
event is paired with its producing stage's exact `after` world, while `source-ending` is paired with the
exact re-proved readable end-wave world. A clone, serialization or reconstructed event is not an emission.
Occurrence removal and condition/entity/inventory/turn/register/Temporary-HP cleanup do not invent generic
semantic events because no authored trigger consumes them; their complete effect is the verified
finalization delta and ultimately the single journal draft.

Subscriber selection freezes the complete emission-time audience. The selector proves each authored
trigger against the emission world, then orders exact root generations and phases canonically; its public
capability retains only that root/phase membership while a private immutable fiber binds the authentic
emission, trigger evidence and authority. Dispatch does not re-evaluate mutable trigger predicates. When
the depth-first coordinator reaches a selected member, dispatch re-proves the exact live root generation
and immutable authority and allocates that phase's current expected→next CAS at that moment. A root or
phase created after emission was never in the audience, and clones, forgeries, selection reuse, stale
generation/authority, same-id ABA and repeated event delivery all fail closed.

Only the kernel's selected-event push may admit one of those frames on a readable-ending root, including
an ordinary-event subscriber selected while that root was still active. For `source-ending`, if the event
names a child, its exact owning program root must still be that selected root. The selected-event permit
remains on the LIFO frame through `phase-complete`, preventing end-wave finalization until the exact
completed top is popped. An ordinary frame cannot acquire that exception. The bounded state coordinator
that drains these frozen audiences is `runMechanicsCausalAction` (`src/lib/mechanics-coordinator.ts`):
one depth-first drive owns the LIFO compile loop, per-audience baseline depths, end-wave delivery and
finalization, boundary checkpoints and the single final journal draft, under one global work budget.
Suspension is replay-shaped — answer/response ledgers keyed by deterministic frame identity — so no
coordinator state ever serializes.

This hardened foundation is implemented and covered by focused hostile-input tests, but the cutover is
not yet a production runtime. A bounded, unforgeable `MechanicsCausalState` owns the exact LIFO stack of
incomplete frames. Root creation is a standalone zero-state segment before push; every later program-root
operation is authorized only for the exact semantic cursor at the stack top, while older frames remain
permits solely for provenance already present in the world. The canonical `compileMechanicsFrame` seam
re-reviews the exact frozen intent, requires that exact nonterminal top, emits at most one authentic
simulated step segment, and reserves a single-operation phase CAS to atomically mark the top
`phase-complete` and latch every newly due phase lifetime. Replay is recognized before a frame is pushed,
at the prepare/coordinator boundary.
Register writes are individual compare-and-swap `program-register-transition` operations rather than a
final lump, operation ids are deterministic, trusted compiler fact guards join the transaction, and the
result is a closed typed union (`compiled`, `needs-response`, `needs-coordination`, `rejected`).
Only a genuine response barrier mints an opaque process-local compiler continuation: a single-use
capability whose private fiber binds the exact issuance causal state by identity plus the immutable
reviewed input, expected cursor, consumed response prefix and the issued request—never a second world,
projected prefix or independent progress model. Consuming it invalidates it even when the resumed
compilation then rejects, resumed responses must extend the fiber's prefix by exactly one answer to its
request, and any surviving unconsumed answer fails the compilation closed. Causal coordination mints no
continuation at all: the coordinator latches/finalizes the required end state and restarts ordinary
compilation on the mutated basis.
The executable vertical now covers register/manual steps plus exact condition, standing,
Concentration and polymorph starts. Stable expansion slots bind every selected target and materialized
standing fact; Concentration has no authored target and is derived solely from the receipt's exact caster.
Semantic end steps select active occurrences deterministically: condition removal is deliberately global
for the exact target + condition, while standing, Concentration and polymorph endings are restricted to
the current root plus their fully materialized fact/caster/form identity. Zero matches are an idempotent
no-op. Authored `occurrence-end` contains only `childStepId`; it selects all active direct children of that
producer for the exact current root generation across executions, slots and targets, including Temporary
HP and entity/inventory material lifecycles. Producer-kind validation shares the same authority used to
validate persisted origin kinds. `end-program` alone terminates the root. A nonempty end selection or an
already-active exclusive replacement returns
`needs-coordination`; the coordinator requests those exact ends, delivers the latched wave's
`source-ending` audience, finalizes it and retries the frame. A conflicting second exclusive start created in the same frame is invalid rather
than silently replacing transaction-local state.

The active compiler work must now add the payment prelude and vitality/material/resource subcompilers,
allocating every physical generation from the current authentic causal segment; the bounded fixed-point
coordinator already resolves the effect barriers, runs trigger/subscriber/source-ending waves and calls
`planMechanicsWorldAction` once for one reversible journal draft. The compiler audit has also exposed
kernel/model prerequisites that remain open: a separately authorized table-override path,
source-specific Temporary-HP replacement cleanup, guarded effective defense/healing/immunity facts, and
closed entity/item materializations in capability snapshots. No second executor, compatibility planner
or final register-write lump is permitted. Persistence adapters and corpus transcription remain open; the
existing combat executors are migration inputs only and are deleted as their consumers move.

The action economy is **immediate-commit-per-action-with-undo** (the owner's binding decision —
**not** batch select-and-commit), so a resource is deducted the instant it is used.
`cost-engine.ts` currently supplies a pure `CommitOp[]` planner only to resource conversions and
tests; ordinary actions, attacks, casts and reactions still execute through handwritten composite
branches in `TurnEconomyProvider`. Those branches revalidate several costs and compensate a failed
later economy claim, but payment, character effects, turn ownership, logs and shared-target writes do
not yet share one serializable transaction. The active automation epic is incrementally replacing
that orchestration with the item-resource pattern: pure command planning, expected-state checks,
one coordinated local commit and causal receipts. Until each caller migrates, do not describe
`planCommit` as the production action engine or claim cross-store/shared atomicity.
`combatStore.endTurn()` is **pure bookkeeping** — advance round, restore reaction, reset movement,
tick durations — so forgetting it is harmless. (In a campaign encounter, the sheet's End Turn ADVANCES the SHARED encounter turn only —
no private round bump; the per-turn economy resets at **turn-START**, when the shared pointer lands back
on your PC, not on End Turn — so it is always fresh at the start of your turn even if you never formally
end it. See the combat-subdoc + campaign section below.) The economy strip is a **budget meter derived
from the plan, not a commit queue.**
The resource rail follows the same single-source contract: committed spell slots and trackers render
only their already-mutated session counters. `combatStore.selected` is the durable turn receipt used
to fence action availability across navigation; it is never interpreted as a second “pending” debit.
Slot/tracker mutators coalesce a parent-save flush in a microtask, after the whole synchronous cast
has updated concentration/log/related resources. Play resources therefore do not wait behind the
general 2 s edit debounce, while prose fields and other high-frequency edits still do.

Resource conversions are the first migrated `MechanicsCommand` member. The command contains stable
source/conversion ids and the chosen level/amount—not mutable counters or captured store operations. Its
pure planner re-resolves the live grant, class gate, option legality and exact normal-slot/Pact-slot/
tracker owners, then emits one canonical expected-state plan. `characterStore.applyMechanicsPlan`
validates all legs against the same character snapshot and either replaces both resource maps in one
Zustand mutation plus one persistence flush or changes nothing. The receipt plans causal undo without
requiring the original grant to remain equipped/known; redo regenerates expectations from current state.
This atomicity is limited to the owner character document and does not include campaign-owned effects.

Physical magic-item resources use a stricter instance-owned transition seam. Catalogue
`ResourceSpec` data declares each counter, capacity/initial facts, exact recovery triggers and
depletion consequences; one durable `SrdEquipmentRef.instanceId` identifies each physical copy, and
`session.itemResources[instanceId]` is its only mutable owner. `lib/resources.ts` plans a pure
whole-item compare-and-swap operation from an exact command and table-entered facts. The shared
`ItemResourceCommandProvider` resolves every required input before mutation, then the character store
commits one operation or an entire recovery boundary atomically. Undo is causal LIFO, redo replans the
same facts at a fresh revision, and a stale copy/attunement/state conflict mutates nothing. Short Rest,
Long Rest, Dawn and Dusk are distinct typed boundaries: rests never impersonate sunrise, while the
Table Clock exposes Dawn/Dusk as explicit story declarations rather than device-time events. A copy
whose disposition becomes nonmagical, consumed or destroyed immediately stops contributing grants,
casts, actions and intrinsic equipment bonuses. Legacy `ref.charges` and item-id session trackers are
temporary corpus-migration inputs only; they are never fallback owners for a typed item.
The pending owner-gated `scripts/migrate-item-resources.ts` one-off plans current documents and every
snapshot together, backs up exact tagged Firestore values, commits the whole ≤500-document plan with
per-document update-time preconditions, and requires reread/global/idempotency verification. Until that
production check succeeds, compatibility inputs remain isolated at migration boundaries; afterward they
and the spent script are deleted rather than becoming a permanent runtime projection.
A committed action that ESTABLISHES a while-active state (Rage, Bladesong, an activated magic item — its resolved action
carries an inferred `activatesKey`, see `docs/MECHANICS.md` "Activation seam") also flips that key
into `session.activeFeatures` — the rail chip lights automatically, the state's grants (Rage's
`weapon-damage-bonus`, resistances) flow into every derived figure, undo clears only a commit-lit
key, and tapping the lit chip ends the state. `setActiveFeature` owns timer lifecycle for every entry:
turning a state on arms a fresh declared timer and turning it off removes that timer, so action commits,
undo, and manual correction cannot diverge.

Active states also own their incompatibilities as data. Inner `spellcasting-blocked` /
`concentration-blocked` grants project two aggregate facts consumed by both Play and Spells; a cast
cannot bypass the gate through cantrip, ritual, custom-spell, prepared-target or reaction routes.
Activation ends existing Concentration through `characterStore.setConcentration`, and the composite
action undo restores the exact spell, cast level and concentration-bound active keys. Maintained
states declare immediate-drop triggers in `duration.endsEarlyOn`; `resolveActiveStateBlocker` gates
entry and `resolveActiveStatesEndingOn` lets the condition and equipment mutation seams retract every
matching active key. This keeps Rage's 2024 Heavy-armor/Incapacitated and no-spells/no-Concentration
rules generic rather than branching on `barbarian-rage`.
Completed rests consume the same declared lifetimes. `resolveActiveStatesEndingOnRest` retracts
maintained states, owner-turn-boundary states, and timed states whose minutes fit inside the completed
rest; it also removes their timer/boundary/cast-level metadata while preserving unknown homebrew and
indefinite toggles. A Long Rest first routes held Concentration through the canonical teardown, so
concentration-bound grants and a self-Polymorph body cannot survive the sleep path. Resource recovery
and effect expiry therefore rebuild one coherent post-rest session rather than updating counters only.
Spell lifetimes use that same declaration: every spell `while-active` grant owns an enforceable
duration, and optional ascending `byCastLevel` tiers select the lifetime from the slot actually spent.
The cast compiler resolves the tier before target review, then the self timer, encounter standing
effect, persisted cast-level provenance and rest-expiry query all consume that one result. Hex and
Hunter's Mark therefore survive a Short Rest only when their stored upcast tier proves they can.
Maintenance reads `SelectedAction.triggerEvents`, not whether an Action slot happens to be occupied:
weapon/spell attacks and target-saving-throw actions stamp `"attack"`, while Dash/Help/other actions
do not. The receipt is persisted with turn economy, so navigation cannot change the verdict.

Compound feature actions remain one transaction. A resolved action may carry `trackerTopUp` alongside
its cost and target consequence; commit spends the source use, restores the live destination pool and
applies the reviewed consequence, while the shared undo reverses each mutation exactly and refuses to
overwrite later manual edits. Optional "when you roll Initiative, you can" features therefore surface as
ordinary player-chosen actions rather than the unconditional `initiative-tracker-topup` seam. Explicit
`targeting.affinity:"self"` is preserved by `combatResolutionSpec`, so self-heals enter the same resolver
in solo and encounter play instead of being misclassified as enemy actions.

Conditional follow-ups use action provenance, not feature-specific UI state. An authored action can
declare `requiresActionThisTurn` with the stable id of its prerequisite, or a typed
`requiresOutcomeThisTurn` predicate when an observed attack, save or damage-reduction result is the gate.
`lib/combat-outcomes.ts` compiles immutable receipts with exact occurrence/action/target identity and an
exact instance only when the table supplied one; count-only multiattacks remain honest aggregates. The
selected action, structured Attack swing or spent Reaction owns that occurrence id in persisted turn
economy. Hydration accepts a receipt only when its owner/action association is valid, so navigation,
undo/re-arm and repeated uses cannot forge or cross-satisfy a follow-up. Level-dependent option
sets use the generic `pickByLevel` threshold helper shared with dice scaling, so Deflect Attacks' redirect
widens its eligible damage types at Deflect Energy without a Monk branch in the resolver or UI.

Turn-action facts that must survive navigation live beside the persisted economy receipt:
`nextAttackAdvantage` and `movementLocked` make Steady Aim's pending roll and Speed-0 consequence
durable and exactly undoable. Authored actions describe rules identity through `economyCategory`, not
card ids, so every Dash reaches the one `commitDash` movement seam and every `skillCheck` reaches the
one check resolver. On-hit riders become one reviewed damage plan: a tracker-backed rider is selected
by its entered result; dependent fixed riders use `round1` + `requiresRiderTrackerId`; resource payment,
shared/solo effects, structured log and undo commit together. No Rogue or Assassin id is branched on in
the UI/store layers. A rider may declare either one fixed/weapon-derived type or a non-empty
`damageTypeChoices` list. The grant evaluator normalizes the latter to a concrete fallback for existing
readers while preserving the full list through `RawActionSummary` and the presenter; `combatDamageParts`
then emits a choice component. The resolver requires a type only when that optional rider carries a
positive entered result, and feeds the chosen type into the same per-component resistance/immunity/
vulnerability calculation. Divine Fury is data, not a UI special case, and homebrew riders use the same
pipeline.

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

### The Combat Chronicle event seam (campaign encounters)

The DM's in-hub encounter tracker has its OWN events-as-data feed — the table-wide sibling of the solo
combat log, the **deterministic record of what LANDED**. As the DM books HP / conditions, the pure
recorders append a structured **`CombatChronicleEvent`** (`src/types/combat-chronicle.ts` — a
discriminated union: `hp-damage` / `hp-heal` / `down` / `condition-gain` (with an optional
reconciliation-set `attackerId` for a rider credit) / `condition-loss` / the reconciliation-only
`attack-miss` + `attack-multi` (the fused multi-target line) + `attack-save` (the fused AoE
save-for-half line); ids + numbers only —
combatant ids `pc-<uid>` / `monster-<n>`,
condition ids, amounts; NO localized string, golden rule 7) to an **ephemeral `EncounterState.events`**
array. Because the events live on the encounter object, they ride the SAME debounced encounter writer the
tracker already uses — accumulating them adds **no new write cadence and never a per-action write**; the
array is dropped when the encounter clears at end. The DM never books a **miss** by hand (no dice, no
per-turn button — that friction the app avoids); a miss enters the record only when a PLAYER declares it
from their sheet (the auto-narrated capture below), and drama still belongs in the DM's end-entry note.

- **Emit** — the pure recorders in `src/features/campaigns/combat-chronicle.ts` (`recordMonsterHp` /
  `recordPcHp` / `recordCondition`) compose with the plain encounter
  reducers at the tracker seams (`party-encounter.tsx`: monster HP + conditions; the PC HP tile +
  condition editor, via the DM-only `recordEvent` threaded through the card). Down-crossing is derived in
  ONE place (a PC or monster crossing to 0). Emission is **DM-only** (the
  seams are DM-gated; firestore.rules keep the whole `encounter` structure DM-write-only), so a player's
  own HP edit never writes the feed.
- **Attribution** — a damage event carries an attacker **only** when the DM taps the feed's one-tap picker
  (`setEventAttacker`), pre-selected to the current combatant, always skippable (`skipEventAttacker`); the
  app NEVER auto-guesses. This is the **fallback** for undeclared (paper-play) damage; a declared attack
  is attributed automatically (below).
- **Auto-narrated capture + universal resolution (the sheet → combat-state seam).** Committing any
  structurally modeled attack, save, damage, healing, Temporary-HP or condition-bearing battle action
  opens ONE compact resolver when the app owns a consequence it can apply
  (`features/character/center/CombatResolver.tsx`, gated in `PlayTab`). The locale-free
  `src/lib/combat-resolution.ts` derives the resolution kind, target affinity,
  target cap, area, instances, damage/healing and typed rider conditions from action facts—never localized
  prose or spell names. The safe default filters enemies for harm and allies for healing; the explicit
  **Any creature** switch supports friendly fire, unusual rulings and homebrew. A weapon swing stays one
  target with hit/miss; save actions resolve failed/saved per target even when they deal no damage (Vicious
  Mockery class); multi-instance actions allocate instances per creature and record mixed hits; area
  actions share one rolled amount and halve automatically on a successful save. Group heals share one
  table roll, distributed-pool heals cap the reviewed total, full heals need no fake number entry,
  condition cures remove only modeled eligible conditions, and consumable-producing spells do not pretend
  their later use happened on cast. Typed damage parts pass through the target's resistance, immunity,
  vulnerability and flat reduction in RAW order; Temporary HP uses max-wins and absorbs damage before
  normal HP for PCs and monsters; linked effects such as Vampiric Touch heal the caster from the final
  post-defense damage. Per-roll damage bonuses stay in each instance formula; a bonus that applies to one
  roll of a cast is a separate fixed component assigned to exactly one reviewed target, so a multi-instance
  spell cannot multiply it accidentally. Every successful target still permits an explicit condition override.
  Condition immunity follows the same override-first rule. An unconditional `condition-immunity`
  contributes to the target's effective immunity set; a grant with `sourceId` contributes one exact
  source-qualified clause (Fey Ancestry: Unconscious only from `sleep`). Both travel through the live-PC
  presenter into target review. The resolver omits an immune modeled condition from its automatic
  defaults and labels the choice, but keeps manual selection available for a table ruling or homebrew;
  there is no race/spell branch and the state reducer never turns an advisory into an unoverridable gate.
  Outcome modifiers are grant-driven too: `spell-damage-outcome` changes the consequence of a declared
  miss/save without an Evoker or spell-id branch (Potent Cantrip is half damage, with additional effects
  still gated by the original successful outcome).
  Reactions that reduce one observed incoming damage instance use this same boundary. Structured action
  data supplies the external die formula, deterministic ability/class-level bonus and eligible damage
  types; the table enters the incoming amount, type and physical roll. The remainder then passes through
  the target's ordinary defenses and Temporary HP before one atomic HP/undo commit. A zero remainder is
  persisted as a success receipt for any authored follow-up; ordinary damage resistance cannot falsely
  create that receipt because success is tested before defenses.
  Linked healing is equally structural: `self-heal-on-other` fires once only when another selected target
  receives HP, and `maximize-spell-healing` turns a scaled healing formula into its deterministic maximum
  before the same target/effect transaction. Slot-level configuration therefore precedes both calculations.

  Variable healing pools use the same boundary. `poolSpendEffect:"healing"` names only the effect;
  the referenced tracker remains the single source for unit, die and remaining amount. An HP pool derives
  its exact debit from the reviewed healing plus selected cure costs (Lay On Hands), while a dice pool asks
  for the die count first, materializes `NdX`, then asks for the rolled total (Recover Vitality). The live
  pool is re-read inside commit and redo, so a stale review cannot overdraw it. Optional `ActionData`
  fields expose the identical path to inline homebrew actions; custom actions resolve the tracker they
  actually name rather than assuming the feature's first tracker.

  Rolled feature effects use the same path: `SrdActionDef` / homebrew `ActionData` project structured
  healing, Temporary HP, condition removal and targeting into the flat action summary before React sees
  them. Class-table dice sentinels and ability/PB-derived target limits resolve to concrete values at that
  boundary; one shared roll may then heal or ward several reviewed targets. Wholeness of Body and Form of
  Dread are data-only consumers of that same boundary (rolled heal vs rolled Temporary HP + condition
  removal), and a timed `while-active` declaration arms Form of Dread's ten-round expiry through the
  ordinary lifecycle engine; the same duration metadata ends it early on Incapacitated. Stable
  per-action ids permit
  multiple variants with the same action economy and let `actionOverrides` replace labels, effects and
  targets without a feature-name branch. The v3 codec preserves those overrides even when the base class
  feature is otherwise inferred, so reload/export cannot silently revert a homebrew table ruling.

  The boundary is deliberate: the table declares facts the SPA cannot observe (targets, hit/save results,
  rolled totals, range/line-of-sight and geometry); the engine resolves every modeled deterministic
  consequence. In a live encounter, targets are stable PC/monster instance ids and the Chronicle records
  exact action provenance. In SOLO, the **same** plan and component apply self-owned healing, Temporary HP,
  cures and conditions; hostile damage remains a table fact because SOLO owns no enemy state. There is no
  parallel solo rules engine and no fake battlefield model.

  The resolver is a **true commit boundary**. `TurnEconomyProvider.prepareResolution` resolves slot level,
  item charge cost, upcast scaling, instance count, free-cast source and metamagic **before** target selection,
  so targets see the real cast-level facts. It then holds the resolution callback until the cast-option/reaction/action
  transaction actually commits, so cancelling an upcast,
  concentration choice or nested picker spends nothing and applies nothing. Only then does one generic
  `DeclaredCombatEffect` batch (`damage | healing | temp-hp | condition | granted-die | heroic-inspiration`) cross the Firebase-free dynamic bridge to
  `campaign-io.applyDeclaredCombatEffects`, which re-reads the encounter and applies the reviewed effects
  in one transaction. Self effects use the character store. Effects aimed at another PC are applied by
  the acting client in the SAME fresh-read transaction as the Chronicle update: it reads the exact target
  `combat/state`, reduces typed HP/temp/condition/held-resource effects, and merges only those combat fields. The target
  client may be offline. Firestore authorizes this narrow subdocument to current table members while the
  parent character/build/inventory remains owner-only; roster removal revokes the grant immediately.
  Transaction retries compose simultaneous effects from fresh target state, so the app cannot report a
  heal that failed to land (or vice versa).

  PC damage has one pure transition kernel: `lib/combat-transition.ts → reducePcDamage`. Both
  `characterStore.applyDamage` (the open sheet/solo adapter) and
  `campaign-io.reduceDirectPcEffects` (the fresh-read peer adapter) pass the same HP, Temporary HP,
  conditions, dying track, critical-hit fact and persistent-effect occurrences into it. The reducer owns
  defense-stage routing, Temporary-HP absorption, damage at 0 HP, Stable reset, ordinary knockout,
  massive-damage death, Unconscious lifecycle, post-resistance transfer/retaliation and one-shot zero-HP
  floors. Damage declarations say whether their amount is `raw` or already `resolved`; reviewed resolver
  totals are always `resolved`, so Warding Bond resistance cannot be applied twice while its transfer still
  runs. The core event carries both pre-floor `incoming` damage and HP/temp actually `applied`: the local
  character log keeps its established incoming-hit meaning, while the campaign Chronicle records the
  applied reversible delta. `resolveCombatDamagePackets` preserves each entered hit/ray/missile occurrence;
  adapters reduce those packets in order and remove consumed occurrences before the next packet. Damage
  at 0 HP, Death Ward, Temporary HP depletion, concentration checks, transfer and retaliation therefore
  happen at the rules' per-hit boundary rather than once against an action total. The adapters otherwise
  only translate returned state/events into persistence and Chronicle shapes.

  Reviewed combat outcomes are a separate immutable fact stream, never fields stamped onto reusable
  action definitions. `CombatResolver` emits a prepared artifact containing the resolved action plus
  target-bound receipts; the economy commit publishes both only after cost/effect commit succeeds and
  returns their exact inverse. `CombatOutcomePredicate` supports an optional action id, so generic rules
  can match any successful attack while source-specific follow-ups can require one exact action. Queries
  return both matching receipts and their bound targets for target-constrained riders. `critical-hit` is a
  first-class fact but is never inferred from damage; the current HIT/MISS UI therefore emits none yet.
  Receipt publication is part of the owning `selectAction`, `commitAttackSwing` or `useReaction` store
  mutation. Re-arm and undo use those same owner APIs, so no persisted turn snapshot can contain one half
  of the owner/receipt relation.

  Per-spell casting math is independent from class-slot ownership. `resolveSpellAbility` first honors a
  literal per-spell override, then the character's deferred species choice, then the owning class. The
  action compiler recomputes DC/attack whenever that ability diverges **or the character has no class
  Spellcasting block**, so innate/feat spells on martials retain full PB-based rules without becoming
  ordinary class spells. This is the same cascade the Spells presenter uses.

  Composite cast undo is event-exact: the cast transaction captures its own concentration start/end event
  ids, restores the prior concentration silently (without nesting another undo), and removes only those
  captured events. Manual log edits and unrelated events made after the cast are never snapshot-clobbered.

  **Target-bound standing effects use one append-only ledger.** `EncounterState.effectOps` stores only
  typed apply/revoke operations over stable actor + exact target references (including a monster instance
  index), spell-or-feature catalogue source ids, immutable cast bindings and duration.
  `foldCombatEffectOps` is the one active-state projection; every reader passes it through
  `resolveCombatEffectGrantSources`, which projects
  the catalogue group's INNER grants directly onto the recipient. It never lights the catalogue's shared
  `activeKey`, so a recipient who also prepared that spell cannot receive a duplicate bonus. The same
  rules compiler also owns short timing and physical-roll modifiers. Catalogue `while-active.duration`
  can declare an exact relative turn boundary or a slot-level-dependent round cap; encounter effects
  resolve it against frozen turn order and the reviewed cast level,
  while self effects persist the resulting `{round, phase}` in additive `session.effectBoundaries`.
  Turn-start/end are the only expiry seams, and their inverse restores the toggle, boundary and log beat
  together. Target grant projection exposes one-shot or every-roll `roll-die-adjustment`, Speed deltas
  and `healing-blocked` to the resolver; campaign and solo HP reducers consume the same healing flag, so offline PCs and monsters
  cannot diverge from the open sheet. One-shot roll modifiers are revoked by occurrence id in the same
  transaction as the reviewed action's HP, conditions and Chronicle changes, then restored with a fresh
  id on undo. The same transaction applies/revokes operations and any max/current-HP delta. Damage runs
  the generic persistent reducer for universal resistance, exact post-resistance transfer, one-shot
  zero-HP floors and successful-hit reactions. A hit is carried independently from its damage amount, so a modeled
  `damage-retaliation` can still fire when resistance or Temporary HP makes the landed HP loss zero.
  The action summary preserves melee/ranged mode; the effect occurrence supplies its exact wearer,
  attacker and original cast level. Temp-HP-bound occurrences are revoked when their pool is depleted
  or replaced by a stronger pool. Chained damage keeps its type and spell source through the ordinary
  defense resolver (including non-stacking resistance), plus the retaliating source/action provenance
  in the Chronicle. Turn
  advance expires deterministic boundaries and emits typed successors (Haste's one-turn lethargy). The
  ledger is capped at 512 operations and conform-read at the campaign boundary; no rule payload or
  localized prose is copied into Firestore.

  A one-shot floor may be visible briefly as both a sheet `activeFeatures` key and its exact campaign
  occurrence. The damage kernel treats a shared `activeKey` as duplicate authority for one rule and returns
  both the consumed state key and occurrence id. The sheet adapter removes both its local active key and
  current projection before another local hit can reduce. The campaign ledger remains authoritative across
  reloads: self-target encounter damage still needs to route occurrence revocation and returned partner
  transfers through the shared transaction rather than relying only on that optimistic projection filter.
  Its inverse must restore the exact occurrence as well as HP/state; these orchestration seams are tracked
  in `PROGRESS.md`.

  Conditions carried by a source are occurrences, not mutations of the manual condition list.
  Encounter occurrences use the ledger's typed `condition` payload; solo play needs only
  `session.concentrationConditions` because one actor can maintain one concentration.
  `effectiveSessionConditions` is the one projection read
  by grants, action gates, saves, movement, party cards and the status rail. This keeps a manual/homebrew
  condition and two casters' identical conditions independent: ending one concentration revokes only
  that actor/source's occurrences, while an explicit cure or DM override removes every matching
  occurrence plus the manual layer. Incapacitation and 0 HP revoke all concentration-owned payload
  kinds through the same generic lifecycle rule. The campaign transaction performs that revocation
  even when the affected PC is offline; reconnect clears any stale character-owned concentration.
  Firestore rules validate the condition payload at the same member-write seam as grants and marks, so
  auth-bypass and production cannot diverge.

  Each condition occurrence also owns one typed maximum lifetime through
  `CombatConditionLifetime`: source-owned (normally Concentration), fixed minutes/rounds, an exact
  actor/target turn boundary, or manual/table-observed. A condition application may declare one
  shared lifetime or one per selectable condition (Symbol). `actionAtCastLevel` resolves any slot
  tier before target review (Geas), and `CombatResolver` writes one occurrence per chosen condition,
  so ending one never removes an unrelated manual condition or another caster's copy. Automatic
  expiry clears held Concentration through the canonical concentration transaction; undo restores
  the active key, timer/boundary, cast level, condition projection and both log entries together.
  Outside an encounter, the same `ActiveCombatEffect` occurrences persist in the character's existing
  `combat/state` subdocument and are composed with any campaign projection at the sheet read seam.
  This gives solo casts the same grant/condition stacking, reload survival, manual revocation and
  turn-boundary expiry without a second effect model or a parent-character mirror.
  Repeat saves, damage, help and leaving an area are explicit table corrections because the app
  cannot observe them; the typed maximum still prevents an effect surviving beyond RAW.

  Persistent spells use the same transaction rather than masquerading as another cast. `resolveOnCast:
false` separates placement from the first later trigger; `recurrence` covers repeated copies of the cast
  effect; `followUp` describes a distinct active action. Concentration stores its chosen slot level in
  `session.concentrationCastLevel`; non-concentration active spells store it by stable active key in
  `session.activeSpellCastLevels`. The generated active row spends no slot, does not restart concentration,
  preserves upcast dice, and still passes through `CombatResolver`. Clearing/swapping concentration or an
  active toggle retracts its stored level; undo restores spell, toggle and level atomically.
  A recurring target-bound row defaults to the exact occurrence already owned by that caster, while the
  resolver's Any-creature control remains the explicit table/homebrew override. A declared successful-save
  ending retracts both the caster state and every matching target occurrence, and undo restores both. Damage
  components may also declare eligible creature types; the resolver includes that component only for matching
  targets, keeping typed resistance intake and roll entry separate (Divine Smite is the first consumer).

  **THE SOURCE-OF-TRUTH FLIP (owner 2026-08-02).** On a HIT the player types the damage they rolled and it
  **AUTO-APPLIES to the target monster's HP right away** — the chronicle now narrates the PLAYER's number,
  not the DM's manual HP delta. Two writes fire on confirm, and the reconcile pipeline is **unchanged**
  (it still fuses a declaration with the observed `hp-damage` events — those events are now written by the
  player instead of the DM):
  1. the effect application — `features/character/center/apply-damage.ts` (the historical Firebase-free
     dynamic-import bridge) → `campaign-io.applyDeclaredCombatEffects`, a **narrow cross-user dot-path
     transaction** that re-reads the encounter and applies damage/healing/condition effects to exact
     monster instances through the pure recorders and writes peer-PC combat slices directly, writing back
     only `encounter.{combatants,events}` plus the exact target subdocs.
     The monster state lives on the CAMPAIGN doc the player doesn't own, so `firestore.rules`
     `combatEffectFieldsOnlyChanged()`
     grants a member that exact new-action diff (`affectedKeys().hasOnly(['combatants','events'])` +
     combatants count unchanged + append-only events/effects), the SAME diff-scoped member-grant idiom as
     `turnFieldsOnlyChanged()`. The deployed queue fields remain accepted only so an encounter already in
     progress during the upgrade can drain once; new resolutions never append to them.
     A miss/successful save with no half damage applies nothing.
  2. the declaration — the exact action `LocText`, target SET + outcome (+ the multi-instance drop bound,
     or a `save` flag, + any
     applied-condition `riders`; **no amount** — the amount rides the applied event) to a small capped
     **`recentActions` ring** on the player's own `combat/state` subdoc
     (`characterStore.declareAttack` → `pushRecentAttack` → the EXISTING `writeCombatState`) — **no new
     document, no new subscription, no per-sub-action write**; the DM/hub already streams every member's
     subdoc via `usePartyCombatStates`.

  The PURE, derived-every-render correlation layer `features/campaigns/chronicle-reconcile.ts`
  (`flattenDeclarations` + `reconcileChronicle`) fuses those declarations with the observed HP deltas +
  conditions, keyed on (target, round):
  - **single-target** — a declared HIT + a matching pending `hp-damage` ⇒ an **auto-attributed** hit line
    (amount = the applied delta, i.e. the player's number) and retains the exact action name; a declared
    MISS ⇒ a **certain** synthesized
    `attack-miss` line; an ambiguous match (>1 declarer) ⇒ **uncertain**-marked; a declared hit with no
    delta ⇒ no line;
  - **multi-target** — a declared HIT with a target SET binds the several drops the DM applied across those
    targets in-window (bounded by the action's `instances`), FUSING them into ONE **`attack-multi`** line
    that carries each struck target's real amount ("A hits G (22), the Chief (22) and the Ogre (11)"); a
    declared target with no drop is **omitted** (never an invented number); drops that can't cleanly match
    the set (over the bound, or a competing declaration on a shared target) ⇒ **uncertain**; a multi MISS ⇒
    one line naming the whole set;
  - **area save** — a declared SAVE action binds **all** its declared targets' drops this round (no
    instance cap — an area hits everyone at once) into ONE **`attack-save`** line. The resolver asks the
    save outcome per target and applies the shared rolled amount in full or half as reviewed; a no-damage
    saved target is positively logged as resisted. Each damaged target carries the applied number; a
    competing declaration on a shared target ⇒ **uncertain**;
  - **condition rider (Phase 3)** — a DM-booked `condition-gain` is **credited to a caster** only when the
    gained condition id is that action's declared RIDER (a Topple mastery's Prone) on the SAME (target,
    round) — the confident provenance, never guessed from mere co-occurrence; >1 caster with the same rider ⇒
    uncertain. An un-correlated condition stays a plain logged line;
  - and, every class: a delta with no declaration ⇒ stays pending for the one-tap fallback.

  The correlation layer is **deterministic and never fabricated** (a hit line needs a real HP delta, a miss line an explicit
  tap, a per-target amount a real drop, a resisted target the spell having resolved, a condition credit an
  exact rider match) and **writes nothing back** (no additional Firestore cost). **DM remediability is airtight**
  (owner mandate — "mistakes should always be remediable"): the DM freely re-adjusts any monster's HP (the
  HP popover), overrides any pending/uncertain single-target line via the one-tap picker (writing the
  stored `attackerId`), and — for any applied MONSTER hit line — taps **Undo** in the live feed
  (`party-chronicle.tsx` → `combat-chronicle.undoHpEvent`), which removes the line AND restores the monster
  HP by the same amount in one motion; condition gain/loss lines have the identical reversal through
  `undoConditionEvent`, restoring the monster condition and removing the line. Reconcile then re-derives
  the feed with the effect gone. All lines
  remain editable/removable at the end entry. Locked by `chronicle-reconcile.test.ts` (single/multi/save/
  condition branches) + `combat-resolver.test.tsx` (the review/apply flow) + `combat-resolution.test.ts`
  - `combat-chronicle-view.test.ts` + `party-chronicle.test.tsx` (the Undo affordance) + the two-user
    `combatEffectFieldsOnlyChanged()` grant in `firestore-rules.test.ts`.

- **Localize + close** — ONE presenter `src/lib/views/combat-chronicle-view.ts` resolves each event to its
  prose line (injected combatant-name + condition-name resolvers → EN/IT re-localizes on a language
  switch) and `buildChronicleChapter` assembles the kept lines into one round-grouped markdown `##`
  chapter. At "End encounter" the DM's editable entry (`party-chronicle.tsx → EndEncounterDialog`: title,
  free-text narrative note, state-inferred outcome, removable lines) appends that chapter via
  `campaign-io.appendChronicleChapter` — a transaction that concatenates onto the SERVER's current
  chronicle text (`joinChronicleText`), the **single persisted Chronicle write per fight**. "Skip" saves
  nothing; either way the encounter then clears. Locked by `combat-chronicle.test.ts`,
  `combat-chronicle-view.test.ts`, `party-chronicle.test.tsx`, and the `campaign-io` append tests.

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

Grandfathered spell-choice repair reuses that same acquisition seam. The pure
`incompleteFreeCastChoiceFeatIds` read boundary detects only a machine-verifiable missing
`freeCastSource`; it never guesses which spell the player chose. The Features card then opens the
ordinary `FeatSpellChoicesPicker`, and `applySpellChoicePicks` enriches an already-known selected spell
in place (preserving notes and identity) or adds it normally. A different source's recorded free-cast
provenance is never overwritten. Once materialized, the normal spell-card transaction owns casting,
resource spend, persistence and undo with no repair-specific runtime branch.

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

**The creation choice model + the READY-MADE build.** What a brand-new character still owes lives
OUTSIDE the wizard, in `src/lib/creation-choices.ts`: the 2024 origin-language slot (Common + 2,
Common excluded because it is already seeded) and `creationChoiceSlots(build)` — every pending
`choice-*` slot the build's sources confer (class grants, background grants, the Human Versatile +
background origin feats, and the class/subclass features through the starting level, with the level's
spell-slot row as `SpellChoiceCtx`). The wizard RENDERS those slots; the preset engine FILLS them.

Creation is therefore never a blank form: **Quick Start opens already complete** on the default
class's ready-made build (`DEFAULT_QUICKBUILD_PRESET`), and picking another class on that page
rebuilds the sheet from ITS preset — silently when nothing has been sculpted, behind the house
confirm when it has (`sameAppliedQuickbuild` compares the live state against exactly what
`applyPreset` wrote, so the yardstick can never drift from the thing it measures). The typed NAME is
outside that yardstick and is never touched. `quickbuildDraft` (`src/lib/quickbuild.ts`) turns a
preset (`src/data/quickbuild.ts`) into that state: an `abilityOrder` the 2024 standard array is dealt
into (that array costs EXACTLY the 27-point point-buy budget, so it rides the wizard's existing
point-buy state — no third abilities mechanism), the background +2/+1, skills, spells, languages,
lineage/Human feat, and per-kind choice picks consumed in SLOT ORDER against the collected slots.
Because both sides read ONE slot seam, a preset can never answer a different set of decisions than
the Create gate checks (golden rule 6); pinned by `quickbuild-presets.guard.test.ts` (legality +
completeness + the 27-point identity, all derived from the preset table) and
`quickbuild-path.test.tsx` (the REAL wizard driven per preset, through to the written document).

The preset record is the one place where the pack **REPLACES** public data instead of adding to it
(`overlayPackRecord`, `src/lib/pack-merge.ts`): the public set can only reach for the SRD's four
backgrounds, so several classes fall back on the Acolyte there, while the composed build hands each
class the origin it is known by (D11 — the split is licensing, never scope). Additive catalogues keep
`mergePackRecord`, whose throw on a public/pack id clash is what makes drift a build failure; the
override seam is pinned public-side by `pack-merge.test.ts` and composed-side by the pack's own
`quickbuild-override.test.ts`.

**Randomize** (`src/lib/quickbuild-random.ts`) is the same machinery run backwards:
`rollQuickbuildFlavor` keeps the class and its ability priority (a rolled character must stay
playable) and draws species + lineage, background + which of its abilities take the +2/+1, class
skills, level-1 spells, languages, the Human origin feat and every follow-up pick from the COMPOSED
pools — emitting a `QuickbuildPreset`, so a roll lands through the identical applicator and gate.
Randomness is INJECTED (`Rng`), which makes the roller a pure, seed-reproducible function; the only
entropy is `cryptoRng` (`crypto.getRandomValues`, the same source the campaign invite codes use) at
the bottom of that module. This is not dice (golden rule 21) — nothing here generates a roll of the
game. A seeded property battery (`quickbuild-random.test.ts`: every composed class × many seeds) pins
every draw legal and every slot filled.

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
(18 EAGER kinds + 1 LAZY display-only kind — the lazy tier below). **`src/data/**`is ids + mechanics ONLY** — the`BiText`/effect fields are stripped from the
data + SRD types; the catalogues are the single source of SRD text. A stripped entity is addressed by
its stable `id`(race traits / sub-entities / named grants carry an explicit`id = slug(name.en)`), and
resolves through one pure function `localizeSrd(kind, key, field, locale)` (`src/i18n/resolver.ts`) —
which THROWS in dev/test on any miss (lock 1) and returns the `⟦…⟧`sentinel in prod. Keys are the
entity id, with dotted segments for nested fields.`localizeCustom`is the typed bypass for
user-authored content (it keeps its own single-locale text, never touches the resolver). The two
whitelisted inline-string bypasses are`background-equipment.ts`(creation-consumed`flavour`snapshots)
and`srd-names.ts` (the lightweight name index the eager persistence layer reads).

**The lazy SRD-kind tier.** `SrdKind` splits into `EagerSrdKind` (the 18 kinds whose EN catalogue the
Grant engine parses as FACTS — statically bundled, always loaded) and `LazySrdKind` (`monster`), a
DISPLAY-ONLY tier with ZERO engine consumers. Because nothing in `lib/`/`stores/` ever reads a monster
fact synchronously, the "EN srd always loads" rule does not apply: even EN monster loads on demand, so
the bilingual bestiary corpus never joins the eager closure. `ensureSrdKind(kind)` (`src/i18n/index.ts`)
idempotently loads a lazy kind for every currently-loaded locale and marks it RESIDENT; `ensureLocale`
then carries every resident lazy kind into any locale loaded LATER (a language switch after the bestiary
was opened lands with the corpus already resolvable — the "load before flip" guarantee, extended). The
gate every lazy-kind consumer awaits lives at the three registry consumers — the `CompendiumPage` lazy
factory (`router.tsx`, `Promise.all([import(…), ensureSrdKind("monster")])`), the `CommandPalette`
specs-import effect, and the campaigns `encounter-bestiary` factories (`Party.tsx` +
`party-encounter.tsx`, the SAME `Promise.all([import("./encounter-bestiary"), ensureSrdKind("monster")])`
pattern) — DELIBERATELY not a specs-barrel top-level await, which would make that barrel an
async module and fragment Rolldown's eager chunk graph (the exact regression `fix(build)` b363626 removed).
Lock 1 covers the tier unchanged: an un-ensured lazy kind resolves through `?.[kind]?.` to the SAME
throwing missing path, so any monster-string site not behind the ensure seam fails CI loudly.

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
  ONCE, so every consumer inherits it — never per-dialog. **Close-then-navigate and close-then-open
  go through `retireTopOverlayThen(cb)`** (same module): the sentinel's silent `history.back()` is
  an ASYNC traversal, so a `pushState` issued while it is in flight gets rewound when it lands —
  silently undoing a navigation (the mobile palette-tap bug: a two-rAF wall-clock deferral fired
  the navigate before the ~7ms traversal completed, so tapping a result "did nothing"; desktop's
  slower rAF cadence usually won the same race) — and a NEW overlay raised in that window pushes
  its sentinel just in time for the landing pop to consume it (hardware Back then exits the page
  instead of closing it). The primitive retires the top sentinel eagerly (the overlay's own cleanup
  then no-ops) and runs the callback on the traversal's popstate — its one deterministic completion
  signal — so whatever follows the close (the palette's `activate` navigation, its shortcuts-sheet
  and bug-reporter raises, the campaign create/join modals' hub navigation) can never race the
  rewind on any device. Because that popstate is the ONLY signal that clears the in-flight flag, a
  **self-healing watchdog** (`beginRetire`, ~1s — far beyond any real sub-frame traversal) guards the
  one way it could be lost: a MISSED pop (a backgrounded/frozen tab, a browser that coalesces or drops
  a same-document traversal) would otherwise strand the flag true forever, queuing every later overlay
  op with nothing to ever flush it (the palette/Back freeze that only a refresh cleared). If the pop
  never lands, the watchdog does exactly what the missed handler would — clears the flag and drains the
  queue; the real pop cancels it, so the healthy path is byte-for-byte unchanged and never double-flushes.
  This composes with the wizards' `useBlocker` (it needs no blocker, sidestepping
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

### The persisted mechanics world + the cutover rollout bridge

Every character owns one persisted `CharacterMaterialState` at `session.world` — the sole home of
every fact the deterministic engine models. `src/lib/mechanics-world-store.ts` is the seam: a
document that has never carried a world derives it exactly once from the legacy session facts it
supersedes (fail-closed through `parseCharacterMaterialState`); a persisted world is re-proved on
every load and never re-derived. Cast/action surfaces run `runMechanicsCausalAction` over that
world through the replay-driven `useMechanicsCast` hook (requirements surface one at a time; the
outcome is recomputed from the ledgers on every render, so the UI can never disagree with the
engine), and the planned `JournalActionDraft` commits through `reduceActionJournal` — the one
canonical reducer that owns fences, generations and byte budgets. `undoCharacterAction` reverses a
committed action through the same reducer, exactly.

**Rollout bridge (temporary, deleted with this epic's final document migration):** while a legacy
surface still reads a session field the world now owns (hp, exhaustion, spell-slot usage), the
commit mirrors that exact field write-through so the two representations can never diverge. The
bridge is a golden-rule-10 rollout state, not a resting state: each fact family migrates its
surfaces atomically, and the mirror plus the legacy field are deleted together once no reader
remains. The concentration mirror moves the legacy field on ENGINE TRANSITIONS only (start/swap
stamps the spell; release clears the field only while it still shows the released spell) — a
commit that leaves the engine concentration unchanged never touches it, so a legacy-held swap
can never be resurrected by an unrelated later commit.

**The first UI-read migration off the bridge — world standings.** Standing occurrences carry
`active-key` facts in the exact key vocabulary the legacy `session.activeFeatures` chips use.
`src/lib/world-standing-grants.ts` projects the LIVE self-targeted keys out of the raw persisted
`session.world` (a fail-closed narrow walk — no full parse on the aggregation hot path), and
`aggregateCharacterGrants` unions them with the legacy chips into the ONE active-key set the
grants evaluator gates `while-active` grants on. An engine-cast buff (Shield's +5 AC, Blur's
incoming-attack disadvantage) therefore reaches `effectiveAC` and every derived stat with NO
legacy activation row — and a buff active both ways during the rollout dedupes by key identity
(a set union cannot double-count). This is a READ migration, not a mirror: the world stays the
sole owner of the standing's lifetime, and no session field is written for it.

The executable authority for a cast is closed at build level: `characterSpellCapability` seals the
transcribed program (see `src/lib/mechanics-transcription.ts`) into a capability snapshot anchored
on the caster, carrying build-derived truths the world does not hold — the spell save DC and
casting modifier as static bindings, the maximum hit points and per-slot resource definitions as
caller-guarded facts the kernel re-emits and the commit validates. A conjuring cast (Goodberry)
additionally carries its consumable's `NewInventoryInstance` template on the snapshot's closed
blueprint channel (`src/data/conjured-items.ts` → `CONJURED_ITEM_BLUEPRINTS`, the only source the
compiler's `inventory-create` instantiates from); the conjured batch lands in the WORLD's
inventory with its authored expiry lifetime, surfaces as the Spells tab's conjured-items strip
(`EngineConsumablesStrip`, localized from the creating spell's catalogue name), and each consume
runs the item's canonical program (`CONJURED_ITEM_PROGRAMS`) through
`characterConjuredItemCapability` — an item-sourced authority whose payment debits THIS instance's
own quantity.

Feature-action capabilities close their SESSION-derived transcription context through
`resolveFeatureActionRuntime`, from the exact seams the sheet reads: the `classSpecific:*` die of
a heal/Temp-HP/granted-die term from the owning class's progression row at the character's level
in that class (`featureClassRow` — the monk's Martial Arts die, the bard's Inspiration tier), a
`trackerTopUp` target's full-recovery rest from the one tracker resolver, and a dynamic
PB/ability-derived `targeting.maxTargets` collapsed to the row summary's already-resolved concrete
count. The corpus census (`mechanics-transcription.guard.test.ts`) deliberately omits these
session facts, so rows like Uncanny Metabolism and Patient Defense's Heightened Focus report an
honest census boundary while the RUNTIME capability executes them. Tracker pools seed into the
world as DERIVED-capacity count cells (the resolved total from the one tracker resolver; a world
persisted before this shape upgrades its capacity metadata once at read, current value preserved)
because the kernel's full-recovery law is only lawful against a finite cell — the capability
emits each touched pool's resource-definition fact as a bounded spec mirroring that capacity,
plus the top-up target's full-recovery boundary, so Uncanny Metabolism's Focus refill commits as
a real `resource-recover` transition.

**The encounter/adversary seam (`src/lib/encounter-world-store.ts` +
`src/features/campaigns/encounter-world-command.ts`).** The same runtime serves DM-run
adversaries: the campaign's live encounter projects into a canonical shared-combat
`SharedMaterialState`. Ownership is split by layer — the campaign encounter document owns the
adversary/table facts (membership, hp trio, AC, conditions chips, initiative, the frozen order and
turn pointer; every still-legacy surface keeps reading and writing them), while the optional
`encounter.world` field on the same document carries what only the engine owns (the action
journal, mechanic occurrences with their end rules, ordinal allocators, turn economies, the
material timeline). `encounterWorldState` is the one-way read-time projection: the persisted
engine layer is re-proved FAIL-CLOSED (`parseSharedMaterialState`; a corrupt `world` field
rejects, never silently re-derives), the encounter-owned facts are overlaid on top (so legacy
writes can never diverge — the world adopts them at the next read; entity ordinals continue the
persisted generation; effects referencing a removed adversary row are swept to a fixpoint), and
the composed candidate is re-parsed to prove it. Adversary rows keep their `srdId` as a
`catalogue-monster` template REFERENCE (never a statblock copy; a hand-typed NPC gets a `custom`
definition from its typed statline); a DM-typed initiative total splits losslessly into the
canonical 1..20 roll plus an entity initiative-bonus override. The SHARED composition scope is
the shared document alone: the canonical shared encounter lists adversary participants only, in
the "turns" phase exactly while the legacy pointer rests on a rolled adversary - any other
pointer projects the between-turns posture, where the kernel's 6-seconds-per-turn timeline law
carries turn-anchored lifetimes; PC participants compose through the PARTY LEASE on their own
character material (the dedicated paragraph below). Commits route back through the owner: the
feature-side command boundary (`applyAdversaryDamage` for the DM's damage tap AND the universal
resolver's per-adversary landed totals; `applyAdversaryHeal` for the heal tap and resolver
healing — exact kernel semantics: clamp at max, temporary HP untouched, a 0-HP revive stays a
documented legacy degradation because the canonical world models it as dead;
`applyAdversaryCondition` for engine-lifetimed conditions) runs one causal action through the
coordinator, commits through `reduceActionJournal` over the shared root, then mirrors the
world-owned adversary facts onto the exact legacy fields (hp/temp via the legacy clamps, the
condition chips, the Combat Chronicle beat — each mirrored beat stamped with its
`engineActionId`) and persists the committed world in the same `setEncounter` write (or, for the
resolver, the same member transaction — `firestore.rules`' `combatEffectFieldsOnlyChanged` grant
admits `world` beside `combatants`/`events`) — the identical rollout-bridge doctrine as the
character side, with the legacy arithmetic surviving only INSIDE the boundary as the fail-closed
degradation.

**Turn stepping is ENGINE-FIRST** (`stepEncounterTurn`, dispatched by both the
`advanceEncounterTurn` transaction and the dev-bypass path): advancing off a rolled adversary
fires the kernel's own `complete-turn` boundary over the derived world
(`planAdversaryTurnBoundary` — begin/checkpoint/advance to completion, then
`planMechanicsWorldAction` compiles the diff into one journal action under the table's
material-authority actor), so booked lifetimes expire EXACTLY when the table steps the tracker,
with the expiries mirrored onto the legacy chips + chronicle in the same value. A pointer leaving
a PC ends no canonical turn (the v1 adversary-only composition scope), which is precisely what
keeps a player's own-turn advance inside the member `turnFieldsOnlyChanged` rules grant — only DM
advances carry the wider engine fields. Back-step is a DOCUMENTED degradation: the boundary is
one-way (end waves latch and finalize; no un-fire), so `prev` rewinds only the legacy pointer and
engine-expired lifetimes stand — the DM re-books manually or reverses the exact expiry from its
chronicle line. **Chronicle undo is exact**: `undoAdversaryChronicleEvent` reverses an
engine-stamped beat's journal action (generation 1 → 2 through the same reducer, the shared-root
twin of `undoCharacterAction`), restoring hp trio, temporary HP, condition occurrences and their
booked lifetimes precisely, dropping every line of the undone action; a pre-world beat degrades
to the legacy one-tap arithmetic inside the boundary.

**The SOLO combat loop rides the same runtime** (`src/lib/mechanics-world-store.ts` +
`src/features/character/center/solo-world-turn.ts`). The character's own material carries a LOCAL
single-participant encounter: `planSoloEncounterStart` seeds it (the character as the one
"turns"-phase participant, its own turn running at the tracker's round, the entered raw-d20
initiative when the player typed one), `planSoloTurnBoundary` fires the kernel's `complete-turn`
per solo round advance, and `planSoloEncounterEnd` closes it — all through the identical
begin/checkpoint/advance boundary drive as the adversary seam, committed as one journal action
under the character material's table authority and mirrored onto the legacy session
(`commitCharacterAction` — condition chips, concentration, slots) in the same write. The wiring
lives at the two tracker seams: the provider's solo End Turn calls `advanceSoloWorldTurn` (the
encounter starts LAZILY on the first advance, so out-of-combat casts keep the
6-seconds-per-turn timeline freeze), and the tracker's End Combat calls `endSoloWorldEncounter`.
While the solo encounter runs, turn-anchored lifetimes freeze to EXACT turn-boundary end rules
and expire precisely when the tracker steps — fail-closed and one-way exactly like the adversary
boundary (a rejected plan leaves lifetimes standing; undoing an End Turn rewinds only the legacy
round). Every character dispatch (`useMechanicsEngineAction` / `useMechanicsPulse`) feeds the
coordinator the character's live **turn-economy projection**
(`characterTurnEconomyProjection` — attacks per Attack action, walking Speed and
condition-gated incapacitation from the same build seams the sheet reads), so an authored
`turn-claim` step compiles for solo dispatches and its claim commits against the participant's
own-turn ledger: a per-turn-capped program is REJECTED by the kernel on a second same-turn
dispatch and allowed again after the boundary opens the next turn. The transcriber emits those
`turn-claim` steps from declared once-per-turn caps, and the Play gate dispatches such a row
(Redirect Attack) to the engine exactly while a solo world encounter is running in its "turns"
phase — the claim needs the participant's ledger to commit against; outside one, and for an
unmet turn-outcome prerequisite or an already-used cap, the legacy layered gates keep the row
and own its feedback. Being in solo combat never forces the legacy path:
engine-executable casts/actions dispatch through `EngineCastFlow`/`EngineActionFlow` mid-combat,
and each commit mirrors the EXACT legacy turn-economy entry (slot occupant with its rules
category and "attack" turn event, the one-slot-per-turn claim on the solo turn key, and — for an
Extra-Attack weapon swing — the attack-pips ledger claim/ride instead of a whole Action slot).
Engine damage landing on the character itself surfaces the SAME entered-d20 Concentration
prompt seam the legacy damage path owns (`queueConcentrationSaveForDamage`; an engine commit
that leaves the character at 0 HP breaks concentration outright through the one authoritative
teardown). With the world-standing read in place (see the read-migration section above),
REACTION casts and SELF-owned mechanics-carrying while-active casts dispatch engine in and out
of combat: an engine Shield's standing lifts the sheet's AC through the projection, and the
commit marks the round's Reaction through the SAME `useReaction` CAS the legacy reaction commit
performed (the economy mirror). A legacy authoritative concentration drop — the failed
entered-d20 save, the 0-HP outright break, a manual stop, a legacy swap — ends an ENGINE-held
concentration through the canonical kernel end machinery in the same motion
(`planEngineConcentrationEnd`: one end request over the owning program root; the concentration
effect and every sourced standing end in the same wave; `setConcentration` commits it as one
journal action, exactly reversed by the undo pairing), so neither the world nor the session can
hold a dropped spell. The CONCENTRATION SWAP rides the same seam: casting a concentration spell
while the ENGINE holds one runs the shared `confirmConcentrationSwap` gate first, and a
confirmed swap commits as TWO exact journal actions — the canonical end of the held occurrence
(the `setConcentration("")` motion above, fired at confirm; RAW, concentration ends the moment
you start casting the next spell) and then the clean cast, whose commit fires the replacement
toast and the concentration-start story beat. (The compiler's own `concentration-replacement`
coordination exists, but its end wave does not converge through the coordinator's drive today,
so the one-action replacement stays out of reach; a LEGACY-held concentration keeps the legacy
swap flow, which owns that teardown.) The SPELL rows of the Play board dispatch through the SAME
shared gate as the Spells tab (`engine-spell-gate.ts` → `engineSpellCastRequest` — one dispatch
truth for both surfaces, Shield's reaction card included). Honest boundaries that stay legacy:
TARGET-BOUND standings (a selected recipient or a Hex-style mark scope — the legacy
target-binding flow still owns whom the buff rides), maintainers, and use-applies.

**RESTS ride the same runtime** (`src/features/character/rest-world-boundary.ts`, driven by the
RestModal's confirm). A confirmed Short/Long Rest plans ONE journal action over the character's
persisted world by chaining the kernel's own table boundaries — `end-encounter` when a local solo
encounter lingers (a rest always returns combat to baseline), `advance-time` for the rest's RAW
duration (1 hour / 8 hours, so timed lifetimes lapse exactly), then `complete-rest`, which
allocates the timeline's next boundary ordinal and emits the `rest-completed` evidence on the
character's timeline clock, ending every due "until you finish a short/long rest" lifetime through
its own end rule — and then executes every engine-modeled RECOVERY as world transitions computed
from the SAME resolvers the legacy rest reads (`resolveTrackers` cadence rows,
`getShortRestRecoveries`, the slot derivation, the exhaustion-recovery grants, `effectiveMaxHp`;
the short rest's hit-dice heal rides in as the player's ENTERED roll, the recorded observation the
modal already collects). The recovery targets are computed from the PRE-REST session counters and
ADOPTED into the world — the rest boundary is the rollout bridge's reconciliation point, so
legacy-only writes since the last commit (hp damage taps, exhaustion steps, tracker pip spends)
can never be resurrected from a stale world value, and after the commit both representations agree
exactly. A long rest additionally requests the end of every engine concentration occurrence (sleep
is incapacitation). The commit mirrors pools, slots, hp, exhaustion, ended
condition chips and released concentration onto the legacy session in the same write, and
`restFinalizedSession` reproduces the legacy-only bookkeeping the world does not own yet
(tracker-entry canonical shape, rest-ended active states, equipment charges via the shared
`equipmentAfterLongRest` law, hit dice spent, death saves, the event log, the combat-state
persist, the undo fence) with the exact legacy laws, so a legacy read cannot tell which path ran.
The legacy store `shortRest`/`longRest` recoveries survive ONLY as the fail-closed degradation: a
world that fails its parse or a rejected boundary/plan/commit runs them alone, exactly the
pre-cutover behavior, and nothing engine-side moves. Typed item resources stay on the item seam's
own exact boundary in the same confirm flow (dawn/dusk remain distinct day-phase boundaries, never
conflated with a rest).

**PC PARTICIPANTS join the composed encounter through the PARTY LEASE**
(`src/lib/encounter-world-store.ts` → "The PC party lease" +
`src/features/campaigns/party-world-lease.ts`, wired at `GlobalCombatMount`). The kernel's native
shared-encounter lease (`start-encounter` over a shared material whose seed lists character-play
combatants: end each character's local encounter, rebase its timeline rules onto the shared clock,
install the `clockBinding` lease - one atomic multi-document finalize, with `validateLeases`
making every half-state unparseable) has no honest carrier in this app's write topology: the
character document and the encounter document have DIFFERENT OWNERS (owner-scoped character
writes; the DM cannot write member docs), different debounced writers, and offline-first
last-write-wins semantics - no cross-document atomic commit exists, and a persisted half-flip
would fail-close every reader of whichever side landed first. So the lease is carried by
IDENTITY: the member client - the only writer of its character doc - joins through the kernel's
own `start-encounter` boundary over the CHARACTER material (the solo machinery's exact shape),
with the single participant id carrying the fight (`party:<epoch>:<campaignId>`). The join rides
the member's OWN subscription flow: `GlobalCombatMount` reduces every active own-PC fight (from
the same membership listener the pip reads - no new reads) into snapshots, and
`observePartyWorldFights` reconciles the OPEN character's world against them, idempotent by lease
identity and FAIL-CLOSED (a corrupt member world degrades only the member's own join; the
encounter document is never touched from this seam). Joining ends any lingering LOCAL solo
encounter first through the kernel's `end-encounter` boundary - the rest wave's collision
precedent - and a lease whose fight leaves the active set (ended, epoch replaced, PC removed)
releases the same way, with encounter-anchored lifetimes rebinding through the kernel's
combat-end machinery. **PC-turn-anchored lifetimes fire on the real tracker**: when the shared
pointer passes OFF the viewer's own PC, the member client commits the character-side
`complete-turn` (the mirror of the solo End-Turn wiring; the DM stepping the tracker never writes
member docs), so buffs anchored to the PC's turns expire exactly - once per (fight, round),
enforced by the boundary action id, so back-and-forward pointer steps cannot double-expire.
Clock behaviour is EQUIVALENT to the kernel's rebase by construction: the character's timeline
never leaves its own clock and advances six seconds per observed shared round (the kernel's own
per-round law, in lockstep with the table), so a 1-minute buff cast before joining keeps its
remaining duration across join, fight, and leave - and leaving needs no un-rebase. Inherited
honestly from the single-participant model: one observed pass-off crosses turn-end, the 6-second
round, and next-turn-start in one boundary, so "until the start of your next turn" collapses onto
"until the end of your turn" (exact separation needs kernel support for suspending a local
encounter between turns). **Cross-material actions are TWO single-material commits correlated by
ONE action identity** - never one multi-document journal action, for the same topology reason:
a member-declared attack mints one `pc-action:` seed per declare
(`applyDeclaredCombatEffects`), the adversary's damage books on the encounter journal under the
seed-prefixed action id (stamped on the mirrored chronicle beat as `engineActionId`), and the
acting member's own character journal records the SAME seed as a `record-manual-boundary`
turn-economy claim on the leased participant (`commitPartyAttackParticipation` - best-effort and
fail-closed; the adversary's state is table truth and always books first; secondary transfers
like retaliation keep their legacy ids). A member whose sheet is closed simply joins late and
misses pass-offs: lifetimes STAND until the next observed boundary - fail-closed is always late,
never early.

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
    updates live on every HP tap. The fallen-hero skull derives from `isCharacterDead` — three failed
    death saves (from the subdoc) OR Exhaustion level 6 (RA-21). Exhaustion is the ONE fallen-hero input
    that is NOT in the combat trio: it persists on the parent `state`, so `cacheToRosterDoc` ALSO seeds
    `state.exhaustion` into the baseline (the only parent-`state` field the projection reads) — aligned
    by construction, no denormalized copy. Under auth bypass, the local document replica exposes the
    same parent + combat-subdoc split, so the dev roster/party/sheet all observe one combat source too.
- **The name is a branded `NonEmptyString`, UNREPRESENTABLE empty** — see the dedicated invariant
  section below for the construction-site contract; per-section fault isolation (the shared
  `ErrorBoundary` + `SectionErrorFallback` around each `CampaignHubPage` section) is the belt-and-
  suspenders behind it.
- **Snapshots** ride the SAME codec envelope (a corrupt row degrades to an empty sanitized character,
  never crashes). The migration converted both the main docs AND every flat snapshot, so `firestore.ts`
  reads ONLY the unified shape — NO transitional read-shim (golden rule 10).

### Combat-mutable state lives in a per-character subdoc (`combat/state`)

The character's combat-mutable state — HP `{ current, temp }`, `conditions[]`, held Bardic Inspiration
die, held Heroic Inspiration, death saves, the SOLO `round`, the SOLO `initiative` roll, and the FIFO of
unresolved damage-triggered Concentration saves — has ONE persisted home: a
per-character Firestore subdoc at
`users/{uid}/characters/{charId}/combat/state` (`CombatState`, `src/types/combat-state.ts`) — its SOLE
representation (golden rule 10). A CAMPAIGN ENCOUNTER's initiative is NOT here — it lives in the
campaign's `encounterInit` table (the initiative SSOT — see the dedicated bullet below). The subdoc is
**physically absent from the parent character doc**: the Firestore serialization boundary
(`toStoredPayload`) omits the trio from `state` via `omitCombatTrio`, so the parent `state` carries no
HP/conditions/initiative/death-save/held-resource field. (The self-contained portable v3 EXPORT, which has no
subdoc, still keeps the combat slice inline — see `docs/CHARACTER_SCHEMA.md`.) The subdoc is a tiny, SRD-free,
id/number-only JSON; its IO (`src/lib/combat-state-io.ts`) is the only combat-state seam that touches
`firebase/firestore`, kept light off the always-eager bundle.

- **Why** — so the cockpit sheet AND the in-hub party/encounter surface read THAT one document and are
  aligned by construction (no drift between two surfaces showing the same HP). EVERY current table member
  reads it live and may apply reviewed combat effects to it; the parent character remains owner-only.
- **Held dice** — a reviewed `granted-die` effect writes the recipient's one held Bardic Inspiration die
  through the same peer transaction, so an offline teammate still receives it. The recipient spends it
  from the ordinary resource rail; short/long rest clears it because its 2024 duration is one hour. The
  optional subdoc field falls back to a legacy parent value only when absent; an explicit empty string is
  a real clear, so old characters migrate additively without creating two writable homes.
- **Heroic Inspiration** — a reviewed `heroic-inspiration` effect uses the same peer transaction and
  non-stacking state rule. Musician's Encouraging Song is a generic 1/Short-or-Long-Rest action capped at
  the actor's resolved PB allies; an offline PC or encounter-owned NPC receives the token and Chronicle
  provenance atomically. The optional subdoc boolean falls back to a legacy parent value only until the
  first explicit write, after which receive/spend/correction all use this one home.
- **Entered D20 Tests** — `types/d20-test.ts` + `lib/d20-test.ts` are the locale-free universal kernel:
  callers provide the physical d20 face(s), optional replacement/adjustment dice and consumed-resource
  ids; the kernel validates JSON-plain input, nets Advantage/Disadvantage, selects one natural face and
  resolves totals/outcomes without rolling. Table overrides are exact, attributed facts: their reviewed
  outcome is retained beside the computed outcome, and a declared two-failure Death Save is not mislabeled
  as a natural 1. `lib/character-d20-tests.ts` is the live-character adapter.
  Death Saves and Concentration maintenance are the first production consumers. Damage while a living
  character concentrates appends one `PendingConcentrationSave` per ordered damage packet (never per
  typed component) to `CombatState.pendingConcentrationSaves`; its stored spell ref, damage and capped DC
  are trigger facts only. Commit rechecks the exact FIFO head + held spell, then rebuilds the live CON
  save, Concentration-only modifiers, Exhaustion and net roll mode. Success removes one head; failure
  routes through the canonical concentration teardown and clears the remainder; 0 HP clears it without a
  prompt. Legacy absence is the empty queue, malformed/stale rows fail closed, and undo is a whole-command
  CAS restoring character, local effects, log and queue exactly.
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
  MULTI-WRITER. Owner/DM manual corrections from the cockpit or in-hub encounter card may happen OFFLINE
  (Firestore persistence + service worker), and the views align by construction because both write the ONE
  subdoc. Those local/manual mutations persist through
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
  - **Manual-write concurrency is whole-object last-write-wins.** Because each manual writer reduces over its LATEST
    subscription-hydrated state, edits to DIFFERENT fields (or the same field at different times) both
    land; only an EXACTLY-simultaneous same-field write loses one — the accepted, DM-correctable tradeoff
    (offline durability over lock-step). Reviewed peer-target effects deliberately use a DIFFERENT seam:
    `applyDeclaredCombatEffects` requires the acting client to reach Firestore, fresh-reads the target in a
    transaction, and merges only HP/temp/conditions/death saves. Thus the target client may be OFFLINE,
    simultaneous effects compose, and the Chronicle cannot claim an effect that failed to land. An emulator
    test pins that a FRESH absent-subdoc full-shape write is authorized for owner/admin/current member (and
    denied immediately after membership removal).
    Stabilization uses this same typed batch: the transaction reads the target's current death-save state,
    changes only an unstable 0-HP PC to `{ successes: 3, failures: 0 }`, preserves 0 HP + Unconscious,
    emits one source/action-attributed Chronicle event, and becomes an idempotent no-op when already Stable.
    Solo play applies the same effect through `characterStore.applyResolvedCombatEffects`, whose snapshot
    undo restores the exact prior death track.
  - **Turn economy is field-scoped.** The exact current-turn key plus selected actions, structured Attack
    swings, reaction identity, occurrence ordinal, target-bound outcome receipts, movement, dashes, slot
    casts and round damage flag live in optional
    `turnEconomy`. This makes a
    group↔sheet remount restore the SAME spent budget only when campaign/epoch/round/current-combatant still
    match. Its high-frequency writer merges only `round + turnEconomy`, so navigation/action persistence
    cannot overwrite HP or conditions another member committed concurrently. The IO contract is pinned by
    a strict `parseCombatState(combatStateWriteData(state))` round-trip suite covering every slot/category,
    localized action-reference shape, cadence fact, outcome receipt, counter, flag and active-effect
    lifetime. At the untrusted read edge, malformed rows and empty identities are dropped, non-finite rolls
    normalize safely, duplicate receipt ids are rejected, and a receipt survives only when an exact
    selected-action/Attack-swing/Reaction owner binds its occurrence to the same action id; a corrupt or
    stale subdoc therefore cannot reopen an outcome-gated follow-up. Owner creation/removal and its
    validated receipts occur in one store mutation, including coin re-arm, so the high-frequency writer
    never persists an intermediate owner-only or receipt-only snapshot.
- **Edit gate (mirrors the rules).** Direct card correction remains the owning player/DM/admin affordance;
  a co-member writes a peer only after confirming a typed effect in `CombatResolver`, never through a
  generic character editor. Structure edits (add/remove combatant, monster, turn/round, hidden toggle)
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
  - combat-subdoc **WRITE**: owner / admin / any CURRENT member of the attached campaign; this is the tiny
    table-effect surface only — the parent char-doc WRITE stays owner-only, untouched.
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
  doc). Each monster/NPC is one first-class combatant with optional `side:"ally"` (absence = enemy).
  Allegiance drives default target filtering, player-visible allied HP and encounter-budget/outcome math;
  the DM may flip it at any time. Legacy grouped rows are expanded idempotently by
  `conformEncounterCreatures` at the campaign boundary into stable suffixed instance ids, preserving
  order and group labels without a migration write. A monster also carries an OPTIONAL, additive `srdId`
  — a DISPLAY-ONLY reference to the bestiary statblock the encounter picker
  seeded it from (`toMonsterInput` copies the localized name + AC + `hp.average`, stamps `srdId`, and
  seeds its `xp` via `monsterXp` — a third encounter-owned fact, `ac`/`maxHp`-class, absent on
  a stat-less custom monster; the lair toggle rewrites it via the `setMonsterXp` reducer);
  it powers the DM-only statblock disclosure (resolved at render via `getMonster(srdId)`, degrading
  quietly on a stale id), never a mechanics source and never overriding the stored ac/maxHp/name (which
  stay the encounter-owned truth the DM may edit). The **2024 encounter difficulty** math is the pure,
  i18n-free engine `src/lib/encounter-difficulty.ts` (the SRD 5.2.1 "XP Budget per Character" table +
  `xpBudgetForLevel` / `partyXpBudget` / `encounterXpCost` / `budgetVerdict` — three grades, NO 2014
  multipliers), fed by `monster.ts → monsterXp` (the ONE `m.xp ?? xpForCr(cr)` fallback chain) and
  `CR_VALUES` (derived from the XP table); its DM-only budget readout is wired in the Party surface
  (below). The in-hub **Party surface**
  (`features/campaigns/Party.tsx` + `party-encounter.tsx`, ONE live
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
  live-sorted slot, never dropped). During that gathering re-sort, `gathering-scroll-anchor.ts` preserves
  spatial continuity: it applies available window-scroll compensation, re-measures after real document
  bounds, and FLIP-animates the residual row movement; reduced-motion users get the final order without
  animation. `hidden` combatants are filtered out for non-DM viewers (DM ambush
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
- **Alert Initiative Swap is an encounter decision, never a rewritten roll.** During gathering,
  `EncounterState.initiativeSwaps` stores `{sourceId,targetId}` pairs for Alert-bearing PCs and willing
  PC/NPC allies. `buildEncounterView` applies those pairs over the current live-sorted ids, so a late roll
  still produces the correct preview while `encounterInit` remains raw-d20 truth. `beginEncounterTurns`
  freezes that resulting sequence into `encounter.order`; from there the ordinary frozen-order contract
  takes over. Only the DM edits the structural decision, and can replace/remove it until turns begin.
  Reducers reject self, missing, enemy-target and non-PC-source pairs and remove dangling pairs with a
  departing combatant. Multiple Alert holders compose in explicit stored order rather than inventing a
  second initiative model.
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
- **Participation + begin-turns · initiative lock · DM drag-reorder · reinforcement auto-slot (C3 — the DM owns the
  order once combat starts).** Four behaviours make "the order locks once combat starts; the DM owns every
  reorder" real:
  - **Participation/begin:** `encounterSkipped:{uid→true}` is a sibling per-encounter map. A member may
    opt only themselves out/in during gathering; the DM/admin may correct anyone. The global combat pip
    ignores opted-out viewers, so no initiative polling trap remains. Begin requires at least one roll but
    may freeze only the rolled participants; its CTA states the exact `rolled/total`, and unrolled PCs are
    marked skipped while remaining visible/targetable for later correction. Start/end reset both initiative
    and participation maps atomically.
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
    through the `useTurnState` seam, unchanged shape so the sheet never branches on the pip model;
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
- **Production-parity dev sandbox** — `pnpm dev:emulators` is the manual-dogfood default. A single
  `firebase emulators:exec` process owns Auth + Firestore + Storage + Functions, runs the idempotent
  `scripts/dev-seed-sandbox.ts` against the hard-guarded `demo-d20folio` project, then starts Vite with
  demo-only Firebase config. `auth.ts` signs into the seeded Auth-emulator owner automatically, so the
  app exercises the production Firebase adapters, security rules, listeners, transactions, persistence,
  Storage and callable seams without Google OAuth or any live-project access. Ctrl-C tears down the whole
  stack. The per-tab `devActAs` presentation dock remains available for deterministic multi-seat UI work;
  authorization correctness itself stays emulator-rule-tested rather than being reimplemented client-side.
- **`DEV_BYPASS_AUTH` parity replica** — the cheaper screenshot/E2E lane; fixtures/scenarios are INITIAL SEEDS, not a parallel runtime.
  `dev-document-store.ts` provides one versioned local document adapter over `localStorage` (with an
  in-memory fallback): initial snapshot, same-tab optimistic echo, cross-tab `storage` snapshots and
  reload survival. Character dev persistence keeps the production split exactly: the parent projection
  omits `COMBAT_SESSION_KEYS`, while `combat/state` owns HP/temp/conditions/held dice/death
  saves/initiative/round,
  declared actions and turn economy. Campaign documents use the same generic adapter and the shared
  `useDocumentSubscription` lifecycle; party cards, peer read-only sheets, the live encounter and the
  character cockpit therefore observe the same local documents. Domain modules still own seed/merge
  semantics, so this is not a second rules engine or backend. `?reset-dev=1` clears only these replicas
  before boot and reseeds from the current fixtures; theme, locale and scenario flags remain untouched.

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

#### The account-level homebrew library (`users/{uid}/library/index`)

Homebrew is **account** data, not character data. Beside the per-character `combat/state`
singleton sits ONE per-user document — `users/{uid}/library/index`, holding a flat
`{ entries: LibraryEntry[] }` — that promotes the four per-character homebrew types
(`CustomSpell` / `CustomFeature` / `CustomEquipment` / `CustomWeapon`) to reusable templates.
ONE doc rather than a collection because the whole library is always read together (the
add-modals' Custom tab) and is hard-capped at `FREE_TIER_LIMITS.libraryEntries` (100,
mirrored in `firestore.rules` as the only shape assertion, alongside owner-only
read/write): one listener, one write, zero queries.

**CUSTOM IS THE LIBRARY (owner-ratified 2026-07-30).** There is no "save to library"
gesture and no manager surface: every Custom form commit — and every sheet-side edit of a
custom row — UPSERTS that homebrew into the library by (kind, name), silently (the
creation is its own feedback). The only curation is the Custom tab's per-row trash, and a
deletion STICKS — nothing re-adds an entry but a real create/edit.

Two consequences of that identity being (kind, name) rather than an id (the sheet item
carries none, and adding one would be a live-data schema change):

- a RENAME must MOVE the entry — each SHEET-side edit seam passes the PRE-edit name to
  `syncFromCharacter`, which removes the old-named entry once the new one lands, so a
  rename can never strand a ghost. It only moves after a SUCCESSFUL upsert: at the cap
  the append is refused, and dropping the old entry would lose the template outright.
  The Custom tab's own pencil needs none of that: it knows WHICH entry it opened, so it
  commits through `updateEntry(id, draft)` — id-keyed, position-preserving, and it
  absorbs a rename onto another kept entry's name (two rows under one identity would
  leave the second unreachable by every name-keyed upsert).
- the free-tier CAP can refuse a keep. A CREATE says so (`keepInLibrary` in
  `CustomCreationForms` — the item still lands on the sheet, only the reusable template
  is lost); the per-keystroke EDIT seam deliberately ignores the outcome, because a
  notice there would fire on every character typed.

The layering mirrors combat-state exactly:

- **Model** — `src/lib/library.ts` (PURE — no Firebase, no i18n, no `Date.now()`):
  `LibraryDraft` (the kind→item pair every consumer narrows on), `LibraryEntry` (+
  `id`/`savedAt`), `toLibraryEntry` (deep-copy + per-kind strip of every PLAY value —
  prepared/equipped/quantity/attuned/notes/tags/overrides, charges wound back to full;
  an item's authored tracking MODE — `tracked`/`isConsumable`/`isPotion` — is content and
  stays, or the pencil's round-trip would silently drop it), `upsertEntry` (same (kind, name) replaces IN PLACE, keeping the original id +
  position), `entryToCharacterItem` (a deep copy re-seeded with the SAME defaults the
  Custom creation forms produce) and `customDraftAt` (the ONE map from the four character
  arrays to their kinds, so an edit seam mirrors what is stored). An entry is a TEMPLATE,
  never a copy of one character's row.
- **IO** — `src/lib/library-io.ts`: the only library seam touching `firebase/firestore` —
  defensive read (`parseEntries` drops anything malformed), full-doc `setDoc` OVERWRITE
  through `stripUndefined` (offline-queueable), no-op under `DEV_BYPASS_AUTH`, and
  `createLibraryWriter` — the DEBOUNCED writer (`LIBRARY_WRITE_DEBOUNCE_MS` = 2 s, the
  character auto-save cadence) that coalesces a per-keystroke edit burst into ONE
  whole-doc write and is flushed on teardown.
- **State** — `src/stores/libraryStore.ts` holds the live list and its mutations
  (`saveToLibrary` / its `(kind, idx)` convenience `syncFromCharacter` /
  `removeFromLibrary`), emitting OUTCOMES (`saved`/`updated`/`full`/`unavailable`) rather
  than strings. Its write seam is **injected** (`LibraryPersistence`), the
  `characterStore.combatPersistence` pattern — that is what keeps the store, and therefore
  every create form and edit handler that upserts through it, Firebase-free (pinned by the
  pure-modules guard). A mutation refuses to run until `loaded`, because the write is a
  full-doc overwrite.
- **Listener** — `src/features/account/library-mount.ts`, a RENDERLESS `LibraryMount`
  mounted ONCE by `AppShell` (an upsert can fire from any add-modal, the spells tab or the
  inventory tab), tearing down on unmount / uid change — flushing the writer first — and
  resetting the store so no entry survives a sign-out. It is **lazy** there (the
  `GlobalCombatMount` pattern): app-wide hydration must not put the store/model/IO graph in
  the always-eager entry bundle, and every other consumer already lives in the lazy cockpit
  chunk — so the library's eager delta is ZERO (P3).

Consumers: the create forms + the four sheet-side edit seams (the upsert half), and the
shared `CustomTabBody` behind the **Custom** tab of all three Add-X modals, which carries
the whole CRUD, and it behaves EXACTLY like the SRD tab beside it (owner, 2026-07-30):
each entry is a `PickerRow` whose tap opens a DETAIL leg — the shared
`CompendiumDetailBody` scaffold the SRD legs wear (eyebrow · meta grid · description,
built per kind from the entry) under the standard `PickerDetailFooter`, whose Add commits
and whose Back returns to the list — including its D55 quantity stepper for the two
quantity-bearing kinds (equipment · weapon), and none for a spell or feature, mirroring
which SRD legs offer one. (The stepper now lives INSIDE that shared footer, built from a
`quantity={{ value, onChange, … }}` prop, so the SRD picker and the Custom tab render the
one control.) It reports the open entry through the same
`onDetailTitle` seam `CompendiumPicker` drives, so the modal title names the homebrew
while its detail is read and reverts on Back — a modal's head behaves identically
whichever tab is reading. There is no add glyph on the row: only the two
MANAGEMENT actions with no SRD counterpart (edit · delete) sit in a right-edge
`IconButton` cluster top-aligned on the name line, as SIBLINGS of the row button (never
nested — the `UniversalCard` head pattern, axe-clean). The modal supplies its form
through `renderForm(edit?)`, so the SAME
`CustomSpellForm` / `CustomEquipmentForm` / `CustomFeatureForm` serves three jobs — blank
behind the "Create …" bar (and directly, while the library is empty), and PREFILLED for
the pencil via their one optional `libraryEdit` prop (`{ item, onSave }`), whose CTA reads
"Save changes" and whose commit goes to `updateEntry` INSTEAD of the character. A library
edit deliberately leaves the character's copies alone: an entry is a template and a sheet
item is an independent copy of it, the one-way relationship the delete confirm already
teaches. The add commit routes through `characterStore.setCharacter`, the same path the
create forms use. Campaign SHARING of a library is the ladder's next rung (`PROGRESS.md`).

### Dismissable layers vs. portaled menus

`useDismissOnOutside` (`src/hooks/useDismissOnOutside.ts`) is the ONE outside-dismiss primitive for
every hand-rolled popover in the app. It ignores a pointer inside a Radix POPPER surface
(`[data-radix-popper-content-wrapper]`), because such a surface is portaled to `<body>` and therefore
lands physically outside its owner's ref: dismissing on it unmounts the menu between `pointerdown` and
`click`, so the item's handler never runs. That is what made every ⋯ overflow item inside the mobile
Signet's chain inert. A portaled surface manages its own dismissal (Radix's `DismissableLayer`), so
nesting one inside a dismissable region is now safe by construction rather than per-consumer care.

### Public share links — private aggregate + sanitized derived projection

A player shares a CHARACTER (never a campaign — see the deliberate non-goal in
`docs/POSITIONING.md`) by flipping the private character metadata field `shared`. That flag is the
publication decision; the anonymously readable object is the closed
`users/{uid}/characters/{charId}/public/sheet` projection, never the private parent. The projection is
a disposable read model, atomically rebuilt or deleted with every parent publication change; the
private parent + canonical `combat/state` child remain the only engine truth. The model in full:

- **The secret is the path.** The link is `/view/{uid}/{charId}` — literally the document's Firestore
  address. The auto-generated doc id is the unguessable half (the same "the unguessable id IS the
  grant" model the campaign invite code already uses), so nothing has to be minted, stored, or
  rotated. The route is `/view/:uid/:charId` (`src/features/character/SharedCharacterView.tsx`),
  mounted in the PUBLIC `AppShell` block beside `/legal` — outside `AuthGuard`, inside the chrome. It
  carries BOTH ids because a Firestore document is addressed by its full path; resolving a bare
  character id would need a collection-group query, an index and a broader rules grant, all of which
  the doc-path URL makes unnecessary.
- **The anonymous grant is exact-document GET only.** `firestore.rules` grants unauthenticated `get`
  solely on the literal `public/sheet` document after checking its exact allowlisted schema and exact
  equality to the current private parent's publishable facts and `updatedAt` generation. Anonymous
  `list` remains impossible, and the parent, `snapshots`, `combat/state`, every other public-doc id,
  and every unknown future field remain private. The projection contains only `schema`, `build`, the
  SRD-free roster `cache`, lifecycle `status`, a boolean portrait marker, a normalized crop, and the
  source generation. It contains no play state, ownership/campaign metadata, Storage URL or share
  flag.
- **Publication is atomic.** Creating/revoking a share, metadata edits, full parent saves and deletion
  write the parent and set/delete the exact projection in one batch or transaction. Rules use
  `getAfter`/`existsAfter` to reject a shared parent without its matching projection, a revoked parent
  with a surviving projection, or a stale projection from another parent generation. Revocation
  therefore makes the next projection read unavailable without a read-time fallback to private data.
- **The flag is DOC metadata, never codec payload.** `shared` lives beside `status`/`portraitUrl` on
  `CharacterDoc`, outside the `{ schema, build, state }` envelope, so an export cannot publish it and
  an import cannot inherit it (pinned in `tests/unit/character-io.test.ts`). It is derived at the read
  boundary (`readDocMeta`: `data.shared === true`), so every document written before the feature reads
  as `false` with no migration. The auto-save writes only `{ character, session }`, so a sheet edit can
  never clobber the flag.
- **Portraits never expose Storage bearer URLs.** A shared projection records only `hasPortrait` and
  the crop. The sheet receives the same-origin `/og/portrait/{uid}/{charId}.jpeg` URL; `ogImage`
  revalidates the current projection before streaming the canonical Storage object with
  `private, no-store` and `nosniff`. Revoked, stale, malformed and missing targets are identical 404s.
- **The view reuses everything.** `SharedCharacterView` owns only the fetch, three states, and the
  noindex; the sheet itself is the SAME `CockpitView` the owner, the DM viewer and the admin viewer
  render, loaded through `characterStore.loadReadonly` so the `readonly` flag (glass-case CSS + the
  store's write guards + the Binder's Fob self-gate) makes it read-only by construction — there is no
  second, "public" sheet to keep in step. `parsePublicCharacterProjection` strictly validates the
  projection, parses the build with an empty/default play state and presents full HP; it never reads
  the private parent or combat child. A dead link — revoked, deleted, denied, or offline — resolves to
  ONE quiet page, never four.
- **The owner affordance is ONE ⋯ entry and ONE popover** (owner-ratified 2026-07-31 — the
  Docs / Notion / Drive shape every reader already knows). The Binder's Fob / Signet overflow carries
  a single **Share** item, which opens `SharePopover`
  (`src/components/shared/SharePopover.tsx`) hung off that very coin:
  - a **visibility switch** — "Anyone with the link can view" — which IS share-and-revoke. Flipping
    it writes `shared` through `useShareCharacter.setShared`; there is NO confirm, because the switch
    shows the state, changing it changes the state, and the same gesture undoes it. The house
    register keeps confirms for DESTRUCTIVE acts, and re-sharing hands back the SAME link (the link
    is the document path, never a minted token).
  - the **link**, shown only while the switch is on — a read-only plate, not a field, since there is
    nothing to type — with **Copy link** (clipboard + a quiet toast) and, only where the platform
    really has a share sheet, the native **Share** button. On a desktop without `navigator.share`
    that button would be a second Copy, so it is feature-detected away.
    The popover's own state IS the feedback: the link appearing and disappearing under the switch.
    No separate "this character is public right now" signal, no second menu item, no toast on the
    flip. It sets `onFocusOutside` to `preventDefault` because it opens FROM a menu, whose close
    returns focus to the trigger — a focus event outside the layer that would otherwise dismiss the
    popover the instant it appeared; outside CLICK and Escape still dismiss.
    The write crosses `setCharacterSharing`, which compares the caller's parent generation and commits
    the complete parent + projection atomically, THEN reflects on the store; a concurrent edit or
    failed write can never leave the sheet offering a link for a different generation (it toasts and
    the switch stays put). The item and the popover live in the shared `SheetExtrasCoin`, so desktop
    and mobile cannot drift. The campaign card's ⋯ **Share invite link** opens the SAME
    component WITHOUT the switch — an invite is a functional join, not a visibility state (its kill
    switch is the hub's joins lock, beside the link it disables).
- **noindex.** The route injects `<meta name="robots" content="noindex, nofollow">` while mounted and
  removes it on unmount. A static tag in `index.html` would deindex the whole app, and there is no
  server to vary the response per route; Google renders JS and honours a tag injected this way. The
  belt to that pair of braces is that a share URL is unguessable and linked from nowhere.
- **Cost.** An anonymous sheet view is one billed projection read — a ONE-SHOT `getPublicCharacter`,
  never a listener. A portrait request additionally invokes the already-bounded `ogImage` function
  and reads the Storage object only after publication validation. At this scale that is free-tier
  noise, and SAFE-01 is the standing backstop.

### Link previews (Open Graph) — a static baseline plus one rewrite-fronted function

A crawler (WhatsApp · Discord · Slack · iMessage · Telegram · X · Google) fetches a URL ONCE, with no
JavaScript, and reads the `<meta>` tags that come back. A client-rendered SPA therefore cannot have
per-link previews on its own — every URL would unfurl as the same card. Two tiers:

- **The baseline** lives in `index.html`, between the `og:start` / `og:end` markers: `og:*` +
  `twitter:card`, EN only (OG has no clean bilingual story — a crawler carries no session and no
  Accept-Language worth trusting, and an English card is the industry norm), pointing at the designed
  1200×630 generic card at `public/og-card.jpg`.
- **One STATIC card image per TYPE — now the FALLBACK** beneath the dynamic renderer below:
  `public/og-card-character.jpg` ("A character lives here"), `public/og-card-campaign.jpg` ("A seat
  at the table"), and the generic app card — three designed siblings in one folio identity (same
  plate, gilt lockup, Cinzel/Alegreya voice, per-card scene art). These are what a card-less path is
  served (the generic, spliced into `index.html`) and what the dynamic image route redirects to on an
  unshared / locked / unknown entity or ANY render error, so the fallback is always a designed card,
  never a 500. All three are `.jpg`, which `globPatterns` does not match, and all three are
  deliberately absent from `includeAssets` — so no preview image ever enters the offline precache (the
  app never renders them, and the precache ceiling has ~11 KiB of headroom).
- **Per-link IMAGE — the dynamic renderer.** For a shared entity the `og:image` tag points not at the
  static card but at a second `onRequest` function, `ogImage` (`functions/src/index.ts`; the render in
  `functions/src/og-image.ts`), which Hosting rewrites `/og/**` to (`/og/character/:uid/:id.png`,
  `/og/campaign/:code.png`; `europe-west1` named, same reason as `ogShell`). It renders a 1200×630 PNG
  per link with `@resvg/resvg-js` (SVG string → PNG; no headless browser / native canvas — a ~30–50 ms
  warm render, chosen for cold-start + container size) over the SAME card art (`functions/cards/*.jpg`,
  byte-copies of `public/`, drift-guarded in the test) with the static placeholder headline masked
  and the entity's own facts painted on top in the bundled folio faces (`functions/fonts/` — static
  Cinzel + Alegreya, fetched by exact family + `font-weight`; system fonts are disabled). A character
  card shows the portrait (a circular medallion, or a per-seed tinted initial when there is none) with
  name / total level / class(es) / AC · HP; an invite shows the campaign name + party size. Every
  drawn number is read STRAIGHT off the sanitized projection's roster `cache` — the engine is NEVER
  re-run server-side, so a wrong stat is structurally impossible; an unstamped stat (0) is omitted, not
  guessed. The renderer sits BEHIND the same gate as the tag (below), and `tryRender` folds any
  rasterise failure to the static-card redirect. `og-meta.ts` owns the image URLs (`characterImageUrl`
  / `campaignImageUrl`) + the route parser (`parseOgImagePath`).
- **Per-link tags** on the two shared route families come from `ogShell`
  (`functions/src/index.ts`, pure half in `functions/src/og-meta.ts`), an `onRequest` function that
  Hosting rewrites `/view/**` and `/join/**` to (`firebase.json`; the rewrite names
  `europe-west1` explicitly, because a rewrite defaults to `us-central1` while `setGlobalOptions`
  puts the package in Europe). It fetches the built shell from the host that served the request,
  splices the entity's tags in between the same two markers, and returns it — the SAME shell, so a
  human still gets the ordinary SPA and there is no second rendering path to keep in step. The
  fetched-from host is ALLOWLISTED (production + a `d20-folio--<channel>-<hash>.web.app` preview
  channel; the loopback carve-out that makes the emulator curl-able applies ONLY when
  `FUNCTIONS_EMULATOR` is set) and anything else falls back to the canonical origin: the function
  must allow unauthenticated invocation for the rewrite to work, so its raw `*.run.app` URL is
  reachable directly and a forged `X-Forwarded-Host` would otherwise have it fetch — and reflect,
  with a 200 and CDN cache headers — an attacker's HTML. The emulator gate is part of that: deployed,
  `127.0.0.1:8080` is the function's OWN container port, so a forged loopback host would make
  `ogShell` fetch itself, each leg hanging to timeout — self-SSRF, and billed time on a zero-budget
  project.
- **What may be exposed, and nothing else.** A character: only through a current, exact
  `public/sheet` projection, and then only name, total level, class, AC · HP (read off its SRD-free
  `cache`) and — in the rendered image or gated portrait response only — the canonical portrait
  object when the projection records `hasPortrait`. The private parent and its Storage bearer URL
  never enter an anonymous response. A campaign: only its NAME + party
  size, and only for an invite code that resolves to a campaign whose joins are still open — the code
  IS the campaign's document id, the same secret the join flow already treats as the grant. The Admin
  SDK bypasses `firestore.rules`, so BOTH `ogShell` (the tag) and `ogImage` (the picture/portrait)
  revalidate the projection against a masked current parent; campaign previews re-check `joinsLocked`
  (the DM's kill switch for a leaked link). Every other case —
  unshared, locked, unknown, malformed, lookup failed — is served the shell UNTOUCHED
  (`injectOgTags(shell, null)` returns it byte-for-byte, the baseline generic card) and the image route
  redirects to the static per-type card, so an unshared id is not even distinguishable from a
  nonexistent one — not by title, not by card image; the only thing given up is `og:url` echoing the
  shared path on a link that describes nothing anyway.
- **Cost + staleness.** The shell is CDN-cacheable per URL (`max-age=300, s-maxage=3600`); the dynamic
  image is tuned SHORTER (`max-age=300, s-maxage=900`) since its content varies per link, plus a
  content ETag for cheap `304` revalidation. Both run on a crawl or a cold first hit, not per pageview
  — and a returning user never reaches either, because the service worker answers `/view/**` and
  `/join/**` navigations from the precached shell (`navigateFallback`, deliberately NOT denylisted:
  crawlers register no service worker, so previews are unaffected and humans keep the instant offline
  shell). A revoked link can keep its cached title + rendered card until `s-maxage` expires; the sheet
  behind it is denied on the very next read, so what goes stale is a name + portrait, never access.

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

| Ceiling                          | Value      | Guard constant             | Headroom                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ---------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| entry chunk gz                   | ≤ 65 KB    | `ENTRY_CEILING_KB`         | +17% (raised 60→61 KB 2026-07-10 for the eager global keyboard-shortcut listener + the nav-anchor chrome; the SHORTCUTS row table stays in the lazy ShortcutsSheet chunk; raised 61→62 KB 2026-07-24 for the ⌘K reference palette entries — the always-mounted palette's referenceHits memo + bilingual search-term arrays + the requestPlayRef seam, eager shell code; verified NO reference DATA module went eager, entry carries only ids + i18n keys; raised 62→63 KB 2026-07-31 for the anonymous-viewer topbar chrome — the logged-out `{user ? account : sign-in}` branch the eager Topbar renders in place of the account cluster (a single "Sign in" button routing to /login, no firebase/auth import; owner-simplified from a two-button form, and the post-view conversion card removed entirely); measured 62.14; raised 63→64 KB 2026-08-02 for the combat-chronicle in-encounter resolution panel — CombatResolver + the pure combat-resolution helpers on the eager PlayTab; the Firebase apply-damage write is dynamic-imported so the eager closure chunk families are unchanged; measured 63.61)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| eager closure gz (JS + CSS)      | ≤ 792 KB   | `EAGER_CEILING_KB`         | ~+4% (raised 750→755 2026-07-10 for the compendium school-enamel palette; +1→756 2026-07-16 — the day's two ratified features, main's rules-text colour grammar + the Gilded Reliquary ornament, left the closure at 755.006, within gzip/build noise of 755 and flipping the gate; +1 KB restores deterministic headroom; +17 KB 2026-07-17 — the content-pack partition: the same EN catalogue bytes ship as public+pack chunk pairs (slightly worse per-chunk gzip) plus the composed-build overlay + @pack seam, measured 769.7; baseline still 727.1 — near budget, see frontier #1; 2026-07-24 (bestiary) held FLAT at 773 — the monster corpus is fully lazy (zero eager delta), and a specs-barrel top-level `await` that had transiently fragmented the eager closure ~14→76 chunks (+13 KB gz of chunk wrappers + lost gzip cohesion, the entry chunk alone shed 62→24 KB) was FIXED by moving the load-before-render gate to the two runtime consumers, not absorbed by a raise — measured 771.4; +3 KB 2026-07-24 (style-A ornament, rebase onto the bestiary waves): raised 773→776 for the style-A per-corner ornament CSS (~+1 KB gz) atop the bestiary-held 771.4 KB baseline, chunk shape unchanged at 14 chunks, measured 773.2, +3 KB never-exact-fit headroom — see picker/specs/index.ts + bundle-budget.guard.test.ts; +3 KB 2026-07-30 (the quickbuild wave — creation opens on a ready-made build, plus the seeded randomizer): the eager closure keeps the SAME 14 chunk families, and tracing dist for each module's own string literals puts the PUBLIC preset record in the lazy `srd-content` chunk and the applicator/yardstick/randomizer in the lazy `CreationWizard` chunk; the PACK preset record is the one exception — it enters through the `@pack` barrel that eager modules already import, so ~8 presets of bare ids ride `cockpit-engine` (prising them out would mean restructuring the barrel for ~1 KB), and the remainder is shared-module churn; measured 776.5, +2.5 KB never-exact-fit headroom; 2026-07-31 the `@pack/monsters` lazy sub-entry took the pack bestiary OFF the eager-reachable barrel — the ceiling is UNCHANGED at 779 (ratchets are not trackers) and the new measured value is **776.50** across the same 14 chunks, `cockpit-engine` 387.7 → 386.3, entry unchanged at 61.81, with the wave-1 pilot ids now absent from every eager chunk; the ~1.4 KB freed is recorded slack, and this ratchet stays the regression guard for the seam — see the closed SEAM DEBT record in `tests/unit/bundle-budget.guard.test.ts`; +3 KB 2026-08-02 (custom-monster library + monster portraits): raised 779→782 for the owner-approved monster-art feature — the SAME 14 chunk families, the growth is the eagerly-loaded Option-B plate CSS in `folio.css` (~+2.7 KB gz); the feature's JS lands in LAZY chunks (the encounter editor, the portrait panel, the crop hook), not the eager closure; measured 779.2 KB gz (JS 702.9 + CSS 76.3), +~2.8 KB never-exact-fit headroom; +4 KB 2026-08-02 (the status ledge — BG3-style status badges on the turn meter): raised 782→786 for the owner-approved status-ledge — the SAME 14 chunk families (StatusLedge rides the eager PlayTab via ThisTurnTracker; its composeStatusBadges/composeTurnLimiters are in the already-eager combat-action-view, so no new lazy chunk went statically reachable), the growth is the component code (~+3.3 KB JS) + the `.status-ledge`/`.status-badge` folio.css grammar (~+0.7 KB gz); the dead-icon trim was applied first (the icon map now imports ONLY limiter-causing conditions and drops charmed/deafened/invisible, which have no self-side turn limiter and so are never badged today) but recovered ~0 KB — per-icon gz is negligible and the eager number was byte-identical before/after, confirming the icons were never the driver; legitimate eager play-surface weight, not a leak; measured 783.2 KB gz (JS 706.2 + CSS 77.0), +~2.8 KB never-exact-fit headroom)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| PWA precache                     | ≤ 8534 KiB | `PRECACHE_CEILING_KIB`     | +7% (raised 2026-06-11 for P1-PDF lazy renderer chunk; +1 KiB 2026-07-16 for the Gilded Reliquary per-theme corner ornament, after ~45% trimming the two `--frame-ornate` SVGs; +96 KiB 2026-07-17 — Batch-4 v2 plates P12–P14, encoded WebP q75 + sharp_yuv; +3 KiB deterministic headroom, same-day correction — the 7247 raise landed exact-fit against a 7247.22 measured build and flipped on the next rebuild; +2 KiB 2026-07-17 — the wave-2 identity strike's raw growth, build 7249.1, restoring the ~3 KiB never-exact-fit floor; +10 KiB 2026-07-17 — the content-pack partition's split catalogue chunk pairs + overlay, measured 7256.6; +14 KiB 2026-07-17 — the SRD repatriation's verbatim EN+IT prose on the 22 re-sourced entries atop the dual-SRD legal attribution, measured 7270.8; +757 KiB 2026-07-24 — the Batch-4 realm scenes P15–P23: the login-light/campaign-hall drop-in swaps + the six NEW per-realm plates (compendium/roster/creation dark+light), all WebP q75 + sharp_yuv, measured 8027.2; +6 KiB 2026-07-24 same-day, post-rebase — the atmosphere branch rebased onto origin/main's RA-wave SYSTEM-audit fixes, carrying in accumulated JS chunk growth, measured 8033.79; +7 KiB 2026-07-24 — the RA-wave W2 rules content (RA-18/19/20/21/32/34 + the Hex/Hunter's Mark toggle labels): ~28 new bilingual i18n strings + the four new BASE_ACTIONS entries grew existing JS/JSON chunks — NO new precache entries (still 276) and NO new images/fonts, measured 8040.32; +245 KiB 2026-07-24 (bestiary) — the lazy monster corpus: the `srd-monsters` / composed `monsters` data chunks + the EN/IT `monsters` i18n catalogue shards, all lazy (fetched only when the codex Monsters wing / palette opens) but precached for offline-first; NOT an eager regression — the eager closure stayed 14 chunks / ~771.4 KB gz (a specs-barrel top-level `await` that had fragmented it ~14→76 chunks was fixed in the SAME commit), measured 8273.55 KiB pre-rebase on the composed lane; ceiling set 8300 after combining with the W2 raise on the rebased tree (never-exact-fit headroom re-verified on the combined composed build), the SRD-only lane smaller under the same ceiling; +73 KiB 2026-07-24 (bestiary c-d wave) — the c-d tranche's 32 statblocks grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8362.50 KiB on the composed lane, +~10 KiB never-exact-fit headroom; +135 KiB 2026-07-24 (bestiary e-g wave) — the e-g tranche's 64 statblocks (Eagle…Guardian Naga) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8498.07 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +62 KiB 2026-07-24 (bestiary h-k wave) — the h-k tranche's 26 statblocks (Half-Dragon…Kraken) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8568.93 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +59 KiB 2026-07-24 (bestiary l-m wave) — the l-m tranche's 21 statblocks (Lamia…Mummy Lord) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8628.04 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +64 KiB 2026-07-24 (bestiary n-p wave) — the n-p tranche's 27 statblocks (Nalfeshnee…Purple Worm) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8691.76 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +117 KiB 2026-07-24 (bestiary q-s wave) — the q-s tranche's 45 statblocks (Quasit…Swarm of Venomous Snakes) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8808.76 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +126 KiB 2026-07-24 (bestiary t-z wave) — the t-z tranche's 46 statblocks (Tarrasque…Young White Dragon) grew the EN/IT `monsters` catalogue shards by the wave's bilingual trait/action prose, still LAZY (precached for offline-first) with the eager closure unchanged, measured 8934.23 KiB (285 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +22 KiB 2026-07-30 (visual rollback) — the restored v0.22.0 chrome CSS re-adds the raw bytes the chrome reset had trimmed (the baseline vocabulary back in dist CSS + the feature-layer appendix), measured 8956.49 KiB (294 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +22 KiB 2026-07-30 (the account-level homebrew library) — the feature's own code, ALL LAZY: the Custom tab rides the cockpit chunk and the listener/store/model/IO ride a 1.1 KB gz `libraryStore` chunk behind the lazy `LibraryMount`, so the ENTRY (61.8) and EAGER closure (775.6 across the same 14 chunks) are unchanged and only the precache — which counts every chunk, eager or not — grows; measured 8978.07 KiB (296 entries) on the composed lane, +~11 KiB never-exact-fit headroom; +20 KiB 2026-07-30 (binding corners) — the four hero-frame corner-fitting SVG masks externalized to `public/assets/ornaments/` (the eager CSS sheds the inline data-URIs — eager closure back under its ceiling; the fittings precache for offline-first), measured 9009.5 KiB (300 entries) on the composed lane, +~10 KiB never-exact-fit headroom; +13 KiB 2026-07-30 (the quickbuild wave) — the preset record, the applicator, the randomizer and the wave's bilingual strings grew EXISTING lazy chunks: still 300 precache entries, no new image/font, and the eager closure unchanged at 14 chunks; measured 9022.6 KiB on the composed lane, +~10 KiB never-exact-fit headroom; +22 KiB 2026-07-30 (MM-2025 bestiary pilot, wave 1) — the pack half's first 10 statblocks EN+IT, A/B'd on ONE app SHA with only the pack varying (pre-pilot vs pilot as `content-pack` symlink targets): precache 9023.64 KiB / 300 entries → 9044.06 KiB / 301 (+20.42, +1 entry), eager 776.64 → 777.88 KB gz across the same 14 chunks, entry 61.81 → 61.82; the pre-pilot figure lands on the quickbuild line's recorded 9022.6 KiB, confirming that baseline was correct and this is a genuine growth event, so the ceiling is the measured 9044.06 +~11 KiB never-exact-fit headroom. ⚠→✅ The same A/B exposed a SEAM DEBT, CLOSED 2026-07-31: `src/data/monsters/index.ts` is lazy but composed `packMonsters` from the eager-reachable `@pack` barrel, so pack monsters were double-shipped into the EAGER `cockpit-engine` chunk. Fixed by the `@pack/monsters` lazy sub-entry (see "The content-pack seam" above); the precache is UNCHANGED at 9044.04 KiB / 301 entries — the corpus moved chunks, it was never written to disk twice — so this pilot did not re-baseline; +11 KiB 2026-07-31 (share-links wave — feat/share-links's OWN new lazy chunks the PWA precaches: SharedCharacterView, SharePopover, the two `share-*` chunks, invite-code, the anonymous /view read seam) — ON TOP of main's seam-fixed 9044.04 KiB / 301 base: 9044.04 → 9055.07 KiB / 307 entries (+11.01, +6 entries, all lazy); EAGER (776.50 KB gz) and ENTRY (61.8 KB gz) unchanged and under their ceilings — the feature added only lazy chunks; measured 9055.07 KiB (307 entries) on the composed lane, +~11 KiB never-exact-fit headroom → 9066; +449 KiB 2026-08-02 (the full pack bestiary + 5 choice-damage monsters) — the 9066 line was the wave-1 PILOT baseline (10 pack statblocks); since then the pack bestiary was authored to ~160 statblocks across a-b…t-z, but that authoring lands in the PACK repo which has NO pre-push budget gate, so the composed lazy `monsters-*` catalogue shards (one entry per tranche × locale, ~16 new entries) grew UNTRACKED here — this is the first PUBLIC composed push to surface the accumulated drift; A/B on ONE app SHA, only the pack varying: 9481.90 KiB / 323 entries (pack origin/main) → 9503.94 KiB / 323 (these 5 monsters' EN+IT prose grew the EXISTING e-g/t-z shards, +22.04 KiB / +0 entries), the bulk 9055.07 → 9481.90 (+426.83 / +16 entries) being the pre-existing pack-tranche growth — all LAZY, EAGER closure unchanged (the corpus rides the `@pack/monsters` lazy sub-entry); measured 9503.94 KiB (323 entries) on the composed lane, +~11 KiB never-exact-fit headroom → 9515. NOTE the Value column above (8219, then 8255 below) is the CURRENT post-trim ceiling: the 2026-08-02 first-load precache trim moved the 12 heavy scene plates off the precache glob to a CacheFirst runtime route (see the guard-constant comment + DESIGN.md), dropping the composed precache from ~9503 to ~8207 KiB — this running narrative's 9515 tail predates that trim; +36 KiB 2026-08-02 (custom-monster library + monster portraits): raised 8219→8255 for the owner-approved monster-art feature — the growth is the new LAZY UI chunks precached for offline-first (the custom-monster editor `encounter-custom-monsters`, the Option-B portrait plate `MonsterPortraitPanel`/`MonsterArtHeader`, the `useMonsterPortrait` crop hook, the Option-B `folio.css`), none eager (the eager closure grew only marginally — see the eager row); measured 8243.51 KiB / 313 entries on the merged (rebased) tree, +~11.5 KiB never-exact-fit headroom; +45 KiB 2026-08-02 (combat-chronicle epic): raised 8255→8300 for the owner-approved auto-narrated combat chronicle — the new LAZY campaign/sheet chunks precached for offline-first (the recorders + reconciler, the EN/IT presenter, the party-chronicle live feed, the CombatResolver resolution panel); the eager entry grew +1 KB (its row) but the eager closure chunk families are unchanged (the Firebase apply-damage write is dynamic-imported); measured 8287.80 KiB / 315 entries on the merged (rebased) tree, +~12 KiB never-exact-fit headroom; +53 KiB 2026-08-02 (canonical Living Bestiary portraits): all 503 WebPs are excluded from first install and runtime-cached on view; only the lazy hashed-URL index stays precached for offline route integrity, measured 8340.67 KiB / 315 entries, +~12 KiB headroom → 8353; +4 KiB 2026-08-04 (generic active-state automation): declarative spellcasting/concentration blockers, exact undo, and durable attack-maintenance receipts grew existing JS/i18n chunks only — no new precache entries; measured 8463.90 KiB / 321 entries, +~2 KiB deterministic headroom → 8466; +6 KiB 2026-08-04 (recorded physical rolls): the generic recorded-roll tracker contract, compact editor/rail controls, portable-state codec, and bilingual labels grow existing JS/i18n chunks only — no new precache entries; measured 8475.57 KiB / 321 entries, +~3 KiB deterministic headroom → 8479; +10 KiB 2026-08-04 (target-state automation) — exact short-effect timing, target roll/healing/Speed projection, atomic one-shot consumption, portable boundary state and bilingual labels grew existing JS/i18n chunks only; measured 8485.38 KiB / 321 entries, +0 entries and +~3 KiB deterministic headroom → 8489; +8 KiB 2026-08-04 (six-fixture combat conformance) — universal unarmed strikes, semantic action prerequisites, and target-bound roll effects grew existing JS/i18n chunks only; measured 8504.83 KiB / 321 entries, +0 entries and +~3 KiB deterministic headroom → 8508; +4 KiB 2026-08-04 (condition provenance) — source-owned condition lifecycle grew existing lazy JS chunks only, measured 8508.63 KiB / 321 entries, +0 entries and +~3 KiB deterministic headroom → 8512) |
| per NEW eager chunk gz (ratchet) | ≤ 50 KB    | `NEW_EAGER_CHUNK_LIMIT_KB` | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

The 2026-08-04 persistent-spell lifetime contract raised the precache ceiling 8512 → 8515 KiB:
42 persistent spells gained structured fixed/upcast timers in existing JS chunks, with no new entry or
asset family. Shared duration construction first trimmed 1.2 KiB; the composed build measured 8512.79
KiB across the same 317 entries.

The 2026-08-04 condition/effect occurrence runtime raised the eager ceiling 790 → 792 KB and the
precache ceiling 8515 → 8527 KiB. Source-owned local effects, exact condition lifetimes, cast-level
expiry and Rage upkeep grew only existing chunks: the composed build measured 790.32 KB gz across the
same 14 eager chunks and 8523.14 KiB across the same 317 precache entries.

The 2026-08-04 incoming-damage reaction runtime raised only the precache ceiling 8527 → 8534 KiB.
The generic reduction transaction, durable success receipt, exact undo and bilingual resolver controls
grew existing JS/i18n chunks to 8530.75 KiB across the same 317 entries; the eager closure stayed below
its unchanged ceiling and the new baseline keeps about 3 KiB of deterministic-build headroom.

The 2026-08-12 ordered-outcome checkpoint raised only the precache ceiling 8534 → 8545 KiB. Canonical
multi-occurrence damage/outcome receipts grew existing JS chunks to 8541.85 KiB across the same 317
entries; no asset or chunk family entered the precache, and the baseline retains about 3 KiB of
deterministic-build headroom.

The 2026-08-04 breakdown WHY layer raised the eager closure 788 → 790 KB and the precache 8390 →
8392 KiB. Both sides were MEASURED with the guard (main `cd1f93f` built into a throwaway worktree,
then the branch), so the cost is a real diff rather than a delta against a stale record: eager
**785.80 → 788.70 KB gz (+2.90)**, precache **8377.13 → 8390.11 KiB (+12.98)**. The two deltas differ
because the eager ceiling sums GZIPPED bytes and the precache sums RAW ones — same growth, different
units. It is genuine feature weight, not a structural leak: 14 eager chunk families and 321 precache
entries on BOTH sides, so nothing lazy became statically reachable and no new asset family entered
the precache. The bytes are the 28 new `breakdown.why.*` chrome strings (the `common` bundle is eager
by design) plus the shared `WhyProse` component and the tip's accordion.

The 2026-08-04 persistent-effects wave raised only the precache ceiling 8392 → 8447 KiB after
removing a real eager leak. A composed A/B measured origin/main at **8390.11 KiB / 321 entries**
and this branch at **8434.77 KiB / 321 entries** (+44.66 KiB, +0 entries): the added bytes are the
typed effect/economy reducers, cross-user transaction logic, and production-faithful local replica
inside existing offline chunks, not a new asset family. The always-mounted Command Palette and
eager roster previously pulled all campaign IO into the shell merely to list campaigns during an
open palette or detach a character during deletion; both calls now import that boundary on demand.
That correction lowers this feature build to **55.52 KB entry / 781.64 KB eager** across the same
14 families—comfortably below the unchanged 65 / 790 ceilings—while the 8447 KiB precache ceiling
keeps ~12 KiB non-exact-fit headroom.

The 2026-08-04 reactive-hit wave raised only the precache ceiling 8447 → 8462 KiB. The composed
build measures **8449.63 KiB / 321 entries** (+2.63 KiB, +0 entries): the generic retaliation
resolver and typed chained-damage path grow existing combat/data chunks, with no new asset family;
the eager budgets remain green. The new ceiling restores ~12 KiB of non-exact-fit headroom.

The 2026-08-04 held-die delivery raised only the precache ceiling 8466 → 8473 KiB. The composed
build measures **8469.84 KiB / 321 entries**: the typed target effect, peer/NPC combat projection,
Chronicle event and bilingual target context add under 4 KiB inside existing offline chunks. No new
entry or asset family appears, the eager budgets remain green, and the ceiling retains ~3 KiB of
deterministic headroom.

The 2026-08-04 recorded-physical-roll wave raised only the precache ceiling 8473 → 8479 KiB. The
composed build measures **8475.57 KiB / 321 entries**: the generic tracker value contract, compact
editor/rail controls, portable codec and bilingual labels grow existing offline chunks. No new entry
or asset family appears, and the ceiling retains ~3 KiB of deterministic headroom.

The 2026-08-04 target-state automation wave raised only the precache ceiling 8479 → 8489 KiB. The
composed build measures **8485.38 KiB / 321 entries**: exact short-effect timing, target roll/healing/
Speed projection, atomic one-shot consumption, portable boundary state and bilingual labels grow
existing offline chunks. No new entry or asset family appears, and the ceiling retains ~3 KiB of
deterministic headroom.

The 2026-08-04 Rogue combat-contract wave raised only the precache ceiling 8489 → 8494 KiB. The
composed build measures **8490.94 KiB / 321 entries**: semantic action economy, durable turn
effects, and atomic/dependent damage riders grew the same offline JS/i18n chunks. No new entry or
asset family appears, and the ceiling retains ~3 KiB of deterministic headroom.

The 2026-08-04 Paladin combat-contract wave raised only the precache ceiling 8494 → 8500 KiB. The
composed build measures **8496.63 KiB / 321 entries**: target-bound spell/feature state,
recurring-save lifecycle, creature-type damage and bilingual effect labels grew existing offline
JS/i18n chunks. No new entry or asset family appears, and the ceiling retains ~3 KiB of
deterministic headroom.

The 2026-08-04 six-fixture combat-conformance wave raised only the precache ceiling 8500 → 8508
KiB. The composed build measures **8504.83 KiB / 321 entries**: universal unarmed strikes,
semantic action prerequisites and target-bound roll effects grew existing offline JS/i18n chunks.
No new entry or asset family appears, and the ceiling retains ~3 KiB of deterministic headroom.

The 2026-08-04 condition-provenance wave raised only the precache ceiling 8508 → 8512 KiB after
reducing solo state to the single-concentration invariant. The composed build measures
**8508.63 KiB / 321 entries**: source-owned condition lifecycle grew existing lazy JS chunks only.
No new entry or asset family appears, and the ceiling retains ~3 KiB of deterministic headroom.

The Heroic-Inspiration delivery wave keeps that ceiling unchanged. Resource delivery now shares
one typed combat-effect seam, and the PWA no longer precaches the four editable SVG launch-icon
siblings alongside their installed PNGs. The SVGs remain hosted (including the scalable manifest
fallback); removing only that duplicate first-install payload restores budget headroom without
weakening offline play or raising the ratchet.

The 2026-08-03 universal-combat wave raised these three ceilings only after feature CSS was split
behind the campaign/resolver lazy boundaries and `PROMPT_28` was re-encoded from 86 KiB to
17.5 KiB. The composed measurement is entry 64.62 KB, eager closure 787.03 KB across the same 14
families, and precache 8376.51 KiB / 321 entries; the 65 / 788 / 8390 ceilings preserve small,
non-exact-fit headroom for the bilingual resolution vocabulary, persistent-effect metadata, and
idempotent peer-effect delivery.

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
ways — the toggle, **Esc** (exits edit, armed only while editing, and only as the CONSUMER OF LAST
RESORT: it skips a press a layer above already claimed via `preventDefault` — a Radix dialog/popover,
`useDismissOnOutside`, an `InlineEditable` cancel — so closing a modal never also leaves edit mode;
`DESIGN.md` → "Esc belongs to the TOPMOST layer"), and a **⌘E / Ctrl+E accelerator**
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
locale-free home of the six saves + 18 skills + three passives row math, consumed by the cockpit rail
`LeftHud`, its sole surface), `combat-action-view.ts` (log-icon type, action sort, upcast text + the
`composeTurnLimiters` limiter VMs and `composeStatusBadges`, which groups them ONE badge per cause
for the turn meter's status ledge — the BG3-style badge row where concentration + each limiting
condition read as compact tinted badges with explain-on-demand popovers, replacing the old floating
banner lines), `weapon-facts-view.ts` (the **unified weapon facts VM** — `buildWeaponFacts` produces ONE
`WeaponFactsVM` rendered by the SAME shared `WeaponFacts` component on BOTH the Combat and Inventory
tabs, so the two weapon cards are identical by construction; a mastery chip appears only for an OWNED
mastery), and `toast-intent.ts` (the toasts-as-data localizer).

Skill ability substitution also terminates at this one presenter seam. The grant aggregate carries
locale-free `skill-ability-option` facts; `deriveSavesAndChecks` chooses the better effective modifier
for each named active check and exposes the resulting ability + bonus together. PDF export calls the
same pure helper, so it cannot disagree with the cockpit. Passive scores intentionally stay on the
skill's ordinary ability because an optional ability used when making a check is not a standing passive
replacement. No class id or localized skill name participates in the decision.

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
A direct sheet CON edit (LeftHud) rebakes the stored max by the same inferred CON-term delta
(`retroactiveConHpMax`, reusing `inferHpMax`), so the override-gate invariant
`storedMax === computeCharacterMaxHp` survives a CON change for a by-the-book character, and a
deviation is shifted by the delta rather than reset (RA-22, 2024 RAW).
**Every entity-naming part** labels via that entity's ONE canonical catalogue key (a `{ loc }` SRD ref,
never a bespoke `breakdown.*` term), so the tip can't localize the entity differently from its own
surfaces (rule 6). `tests/unit/value-breakdown.guard.test.ts` pins `sum(parts) === displayed total`
across the 6 fixtures + MOCK, the HP override-gate, and (table-driven) each entity name in EN + IT.

**The WHY layer (2026-08-03).** A breakdown is a receipt: it says WHAT sums, never WHY. So a part may
additionally carry a locale-free `why: BreakdownWhy` — `{ term, params?, rule? }`, where `term` is an
APP i18n key (`breakdown.why.*`) the EDGE interpolates, `params` may hold `{ loc }` `LocText` refs, and
`rule` is the feature/property NAME the tip shows as a gold, colon-terminated lead-in — and a DICE part may carry
`fromDice`, the printed die a rule REPLACED. The presenter's `resolveWhy` turns each into a
`BreakdownWhyLine` (LocText refs resolved, `term` + scalar params left for the edge) and `localizeBreakdown`
threads it onto `BreakdownLine.why` / `.fromValue`; `BreakdownTip` then renders `1d4 → 1d6` in the value
cell and makes that row a `.cause-toggle` disclosure whose tap unfolds ONE plain-language sentence
(accordion, one open at a time), rendered by the shared `WhyProse` component. **A `why` is emitted at the
exact engine site that applied the rule** (golden rule 2) — `effectiveWeaponDie` and
`resolveWeaponAttackStat` return the WINNING rule's provenance (`ResolvedWeaponDie` /
`ResolvedWeaponAttackStat`) rather than a bare value, so no consumer re-derives it — and
`ResolvedWeaponDie` models "replaced + sourceId travel together" as a UNION, so the pairing is true by
type rather than by comment (every `weapon-attack-ability` entry carries a `sourceId`: the grant-apply
seam takes one as a required argument). A substitution is NEVER silent: when the source is a class
feature the prose names the class level, and when it isn't (a feat / race trait / item) it falls back
to the class-free sentence rather than showing a bare arrow with nothing behind it. Wave-1 sites: the Monk
Martial Arts die replacement (carried weapon, Versatile grip, Unarmed Strike, inventory row), the ability
choice on attack/damage rows (Finesse best-of, a feature swap), the medium-armor DEX cap and the winning
Unarmored-Defense formula in `computeACDetailed` (branching on the grant's OWN `condition`, so a
`no-armor-no-shield` formula — the Monk's — never promises the laxer no-armor rule), and every on-hit
`damage-rider` — whose sentence is
COMPOSED from the grant's own fields (`riderWhy`: dice × damage type × `oncePerTurn` × `resourceCost`), so
a rider added tomorrow explains itself with zero per-feature prose. The copy states only what the engine
actually does: an ATTACK-roll swap is a best-of ("the higher modifier applies"), but the Unarmed Strike's
DAMAGE ability is taken unconditionally from the winning upgrade, so it gets its own plainer sentence.
`resolveWhy` lives on the LEAF `lib/views/srd-i18n.ts` beside `localizeText` — both breakdown presenters
need it and they already import each other, so hanging it off either would close a cycle. A `why` NEVER affects a total: a plain
STR longsword row carries none and renders exactly as before (rule 19), and the sum-of-parts guard is
unchanged. The rider's popover renders the SAME `WhyProse` (rule lead-in suppressed — its rubric already
names the feature).

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

- **Listener abstraction.** Every Firestore listener (character + campaign + compendium + the
  account-level homebrew library) goes through **one** subscription abstraction (`use*` hooks —
  `useCharacterSubscription`, `useCharacters`, …) or its renderless shell mount
  (`GlobalCombatMount`, `LibraryMount`) that auto-tears-down on route / component unmount,
  never stays active across an inactive route, and never leaks a background subscription. No
  feature subscribes to Firestore directly. The shell-level mounts are mounted EXACTLY ONCE,
  in `AppShell`, and LAZILY (their graphs stay off the eager bundle), so the count stays flat.
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

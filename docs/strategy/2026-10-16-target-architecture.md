# Target architecture and repo organisation (2026-10-16)

The shape the re-foundation moves toward, one area at a time, with the app live throughout. For the
play layer it agrees with `docs/ARCHITECTURE_MAP.md`: the log is the record, state is a fold of it,
and views are pure. The engine session owns that work. Evidence:
[research and audit](2026-10-16-research-and-audit.md) §2 and §4.

## Layers

```
catalogue (data)  →  rules core (pure)  →  play log + state fold  →  views (React)
   SRD | pack | homebrew        packages/folio-core          src/domains/play         src/app, src/domains/*/ui
                                         ↕ adapters (Firebase, i18n, storage, telemetry): src/platform
```

- **Catalogue.** Typed entries with Grants and Actions, from three sources behind one seam:
  - the SRD, bundled;
  - the pack, loaded at runtime for allowlisted accounts;
  - homebrew and imported packs, from the user's library.

  The rest of the app cannot tell which source an entry came from.

- **Rules core (`packages/folio-core`).**
  - Pure TypeScript with no React or Firebase.
  - It owns derivation (AC, attack, DC, slots…) and each value's **breakdown** (the explain chain).
  - It reports an event's effects but never rolls dice. A future dice module plugs in as one more
    input source.
  - It is the future public rules API (the owner's ambition), and it is SRD-only by construction.
- **Play.**
  - One append-only event log per campaign session, one Firestore document per event.
  - State (HP, resources, conditions, timers) is a fold over the log.
  - Undo and corrections are events too.
  - It replaces the six parallel records listed in ARCHITECTURE_MAP.
- **Views.** The sheet, play/combat, campaign, report and export are pure functions of state and
  the log, rendered with the design-system tokens only.

## Repo organisation

```
src/
  app/            routes, shell, providers (thin)
  domains/
    character/    build, creation, level-up        (ui/ + model/ + tests next to code)
    play/         log, fold, turn economy          (engine session)
    campaign/     party, encounter, invites
    chronicle/    deterministic report, export
    homebrew/     editors, import
    account/      sign-in, export, deletion, consent
  ui/             design system: tokens, primitives, BrandMark (the one place the name lives)
  platform/       firebase, i18n (locale registry), storage, telemetry, feature flags
  data/           SRD catalogue (generated where possible)
packages/folio-core/   rules core, the public API seam
content-pack/          private repo; build-time tooling only, never in the public bundle
functions/             Cloud Functions
tests/e2e, tests/visual    cross-domain journeys only; unit tests live next to their code
```

Rules that keep this shape:

- **One home per concept.** `src/lib` (222 flat files today) empties into the domains as each area is
  touched. Nothing new goes into `src/lib`.
- **Import boundaries in CI.** Domains import `folio-core`, `ui` and `platform`, never each other's
  internals. `folio-core` imports nothing from `src`.
- **Size.** A source file over about 600 lines is a signal to split, not a hard rule. There are
  about 60 files over 1,000 lines today.
- **Dead and duplicate code** is found by tools, not by reading: knip for unused exports, jscpd for
  copy-paste.

## Data model (Firestore, EU region)

| Path                                         | Holds                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `users/{uid}`                                | profile, locale, consent, `status`. Roles move to auth custom claims, so rules stop calling `get()`. |
| `users/{uid}/characters/{id}`                | the build only (no play state, no UI prefs), with the `revision` compare-and-set kept                |
| `users/{uid}/library/*`                      | homebrew and imported packs, private                                                                 |
| `campaigns/{id}`                             | party, settings, invite                                                                              |
| `campaigns/{id}/sessions/{sid}/events/{eid}` | the append-only log                                                                                  |
| `campaigns/{id}/sessions/{sid}`              | metadata plus a cached fold for fast load                                                            |

Every change to this table is a migration: snapshot → dry-run → idempotent apply → verify, with the
owner's yes for each live apply. Readers accept the old and new shapes until the apply has been
verified.

## Agent-facing setup

- **`CLAUDE.md` (= `AGENTS.md`)** stays under about 100 lines: product in two lines, commands,
  owner gates, the boundaries above. Each domain may have a short `CLAUDE.md` of its own, loaded only
  when an agent works there.
- **Skills** hold the procedures: deploy, migration, release, SRD boundary check, i18n string add.
  **Hooks** hold the must-always rules: format, changeset, blocked paths.
- **Tests as spec:**
  - behaviour tests whose cases come from the catalogue;
  - fast-check properties for the rules maths;
  - a few Playwright journeys with axe, and visual baselines generated in CI's own image;
  - nightly Stryker mutation runs on `folio-core`.
- **Previews:** Hosting preview channels on the staging project, never on production data.
- **Feedback loop:** error tracking with personal data stripped, cookieless analytics on a handful of
  events (sign-up, first character, first session logged), and the existing in-app report.

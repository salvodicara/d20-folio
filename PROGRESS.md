# d20 Folio — Progress Tracker

> **Living roadmap. EVERY agent keeps this current** — update phase status / tick items as you ship.
> This file holds the FORWARD plan only. Shipped detail lives elsewhere by design (golden rule 6):
>
> - **Releases** → `CHANGELOG.md` (minted from `.changeset/*.md`).
> - **Granular history** → git.
> - **The open gap frontier** (per-seam, per-entity) → `docs/AUTOMATION_BACKLOG.md`.
> - **How it works today** (incl. the architecture invariants the R1–R8 campaign locked in) → `docs/ARCHITECTURE.md`.

## Current state

**Released on `main` at v0.21.0** (v0.22.0 staged in `.changeset/`); the last owner-fired
**production deploy is v0.19.0** (https://d20-folio.web.app, 2026-07-11) — `main` runs ahead of live
because deploys are owner-gated (golden rule 22). **6 real users** have been playing since
2026-06-08. Since v0.19.0: the repo went **open-source + split-repo** (2026-07-17), the **full-BG3
identity pivot** landed code-complete (asset integration pending), and the **DDB-parity feature
epic** was ratified and queued (bestiary-first; the competitive map is `docs/POSITIONING.md`). **Phase 1** (single-user foundation) is complete; the **100%-automation push** and the
**R1–R8 target-architecture campaign** are both **CLOSED** (shipped, merged, deployed). The
**id-storage + GR7 i18n-leak-eradication campaign** is **CLOSED** (v0.13.0): every SRD-derived value
is a stable, mostly-branded id; every user-visible string lives in `src/i18n/**` (a new language = a
new JSON set); the GR7 leak-detector allowlist is empty; the cross-locale and dynamic-key i18n crash
classes are guard-locked. The premium B&W **PDF sheet export** (pdf-parity) shipped in the same
release. The headline **campaign features** — Party, Chronicle, Treasury, SharedNotes, Sessions — are
**shipped**. The **BG3 on-rails combat** campaign landed its **major wave on 2026-06-22** (on-hit
rider chips, the A2 duration/cadence engine, condition-consequence projection, form-swap attack rows,
and the effective-max-HP / set-score / darkvision / Epic-Boon correctness batch — git
`fe522b60`…`f68226dd`); the S1–S11 play/data seams + the cadence-mechanics wiring (2 of 4 wired) have
since shipped (S11 — the save-based action primitive — closed Dragonborn Breath Weapon, Cleric Divine
Spark/Radiance, Lupin Howl; **S11b** — the exotic Channel-Divinity sub-shapes (+WIS/+Cleric-level
additives, Divine Spark heal-or-damage, Sear Undead ability-count dice) — shipped 2026-06-25; **S13** —
effective-Speed render — shipped 2026-06-24; **S12b** — multi-instance spell dice (Magic Missile /
Scorching Ray ×N) + the Stars `diceByLevel` (Starry-Form 1d8→2d8 at L10) + **G24** spell-area recurrence
cadence (Moonbeam / Spirit Guardians / Flaming Sphere / Call Lightning) — shipped 2026-06-25; **S12c** —
leveled-spell upcast damage scaling (`damageDicePerUpcast` on 60 spells → the cast modal previews the
slot-scaled dice, Fireball L5 → 10d6) — shipped 2026-06-26). The confirmed correctness-bug frontier
(B1–B8, §D) and the structured `instantaneous`-duration fact are now **all shipped** (verified in code:
`barbarian.ts:175` `maxRounds:100`, `smart-tracker.ts:1508` `featureScalingLevel`, `cast-options`
`slotUsageKey`, `grants.ts` `hpFlatParts`, `data/types.ts:708` the `instantaneous` boolean). The **A–E
per-feature automation wave** (≈26 merges) has since landed the remaining wikidot rules-coverage
long-tail plus five new engine primitives — **slot-funded alternate recovery**
(`smart-tracker.ts` `resolveSlotAltRecovery`), **on-cast slot regain** (Diviner Expert Divination,
`on-cast-effects.ts` `resolveOnCastSlotRegain`), **incoming-attack-advantage** (Reckless Attack's
self-side defensive downside, `grants.ts:1802`), **speed-floor** (Boots of Striding and Springing,
`grants.ts:313`), and **rider extra-chips** (Artificer Replicate Magic Item cap as a second chip) — plus
the **"· active" self-labelling** of while-active effect chips and the GR7 **prose-parser deletions**
(`extractTrigger` / `extractSpellTrigger` / `extractDamageDice` retired in favour of structured tokens).
The **DM toolkit's** headline surface (the in-hub party-overview dashboard + encounter/initiative
tracker) is **shipped and live**; the forward frontier (detailed under _Next — the forward plan_) is
the tracking-doc reconciliation audit (rule 16, the on-ramp), the ratified **DDB-parity feature
epic** (bestiary-first — `docs/POSITIONING.md`), and the P4 polish tail (guided tour, compendium
polish).

**Session undo/redo stack — shipped in v0.19.0, DEPLOYED live (2026-07-11):** the 5-second undo toast grew a durable
home — a per-character, session-memory, LIFO **undo stack** (`src/stores/undoStore.ts`, depth 20) with
standard redo. Every act that showed a "— Undo" toast (action/cast/attack-swing/reaction commits, HP
damage/heal/temp, death saves, out-of-combat tracker spends, conditions, concentration, resource
conversions, Arcane Recovery / Divine Intervention, maintained-state End) now also lands on the stack;
the toast's Undo button, the **⌘Z / ⌘⇧Z** cockpit accelerators (`useUndoRedoShortcut`), and the sheet's
**on-page Undo · Redo controls** (the Binder's Fob ⟲ ⟳ coins on desktop; the Signet's bloomed ⟲ ⟳
pair on mobile) all reference the ONE reverse-applier (golden rule 6).
Own-sheet-only (shared campaign docs excluded — no `undoStore` import under `features/campaigns/`);
fenced by rests / level-up / build edits / import / snapshot restore / character switch / remote
snapshot; encounter turn-start purges only the turn's economy while HP/condition undos survive; solo
End Turn compacts the turn. The 12 adversarial cases are pinned. Full contract: `docs/ARCHITECTURE.md`
("The session undo stack"); the control recipe: `DESIGN.md` §5. **Explicit non-goals (recorded so
nobody "finishes" them):** reload/persistence survival of the stack, shared-doc undo, a history
dropdown, undo-rest (a future whole-session-snapshot entry), Ctrl+Y, rebindable keys.

**Sheet management system — the FOB FAMILY, both homes ratified (owner, 2026-07-11; shipped in
v0.19.0, DEPLOYED live 2026-07-11):** the sheet's whole management chrome (Undo · Redo · Edit · ⋯) lives OFF the masthead in
two homes split by ONE seam (`useBinderFobHome`), so the masthead is pure identity + vitals aligned
against the name on EVERY viewport. **DESKTOP (fine pointer ≥768px) = "The Binder's Fob":** a fixed
bottom-right **coin chain** in the Rest-medallion struck-metal family (`BinderFob` — ✎ standing, ⋯
above it, ⟲ ⟳ mounting with history so the standing coins never move); the toast lane slides left of
the coin column. **MOBILE (coarse / <768px) = "The Signet":** ONE struck-metal coin fixed above the
bottom nav (`MobileSignet`), the fob collapsed — the IDLE coin bears the **`Wrench` tools glyph**
(owner-picked 2026-07-12; NOT a pencil; the de-duplication ruling fixing the owner's "the edit icon
is repeated twice"), and a tap
BLOOMS the chain (⟲ ⟳ · ⋯ · ✎ Edit — the pencil lives ONLY in the chain). The ✎ coin is the
**activated toggle** on both homes: uncolored/seal at rest, lit amber while editing, zero geometry
change, a one-tap exit (aria "Done editing" / "Fine modifica"); if the Signet chain is bloomed while
editing it shows only ⟲ ⟳ · ⋯ — never a second pencil. Long-press flips the Signet to the left edge
(persisted). Both homes are fixed, so the lit coin is always reachable at any scroll depth — no
floating deep-scroll exit, no masthead management row. The sticky "Editing"
banner stays deleted; the portrait level-up gem stays removed (the `⌃⌃ LEVEL` lineage chip carries
availability alone). Recipe: `DESIGN.md` §5 ("The sheet management chrome" + "Cockpit masthead").

**Initiative single-source re-architecture — shipped in v0.19.0, DEPLOYED live (owner-mandated root
fix, 2026-07-11):** the "DM access out of date / initiative never saves" outage is cured at the root, in
both of its layers. (1) **Immediate cause:** prod ran v0.18.0's (pre-v0.19.0) `firestore.rules`, whose combat-state
field-lock (`isValidCombatState().hasOnly(...)`) predates the 2026-07-09 `round` field — so EVERY
combat write from current `main` was silently permission-denied and mislabeled by the catch-all
stale-DM-grant toast (reproduced mechanically in the emulator: the exact client payload vs the v0.18.0
rules). The shape-lock is DELETED (rules validate authorization only; the client already parses
defensively) and a version-skew class guard pins that a future additive field can never re-open the
outage. (2) **Architectural cause:** encounter initiative rode a cross-user, client-recomputed
`dmReaders` grant. It now lives in ONE home — the campaign doc's `encounterInit` table (`uid → raw
d20`) — DM writes any row, a player their own (the rules-proven four-direction matrix), per-key
composing offline writes, atomic table reset at fight start/end (the `initiativeEpoch` machinery,
`useViewerRollStates` listeners, retry toasts, and the whole `dmReaders`/`campaignReaders` ACL
apparatus are deleted — cross-user access now derives LIVE from `attachedCampaignId` + the campaign
roster, so a DM transfer/removal converges on the next request). **DEPLOY STEP:** ship
`firestore.rules` with the same deploy (standard `just deploy` does), then run
`scripts/backfill-attached-campaign.ts --check` / `--apply` (expected pointer backfills: zero — the
2026-07-10 backfill already stamped live docs; the sweep clears the dead ACL residue). Contract:
`docs/ARCHITECTURE.md` ("Combat-mutable state" → Security + the initiative-SSOT bullet).

**Search matcher tokenized (rule 27 stability fix, 2026-07-21):** the ONE shared `matchesSearch`
(`src/lib/search.ts`) no longer does a whole-query `includes()` — it splits the normalized query into
whitespace tokens and matches iff EVERY token is a substring of the joined candidate corpus. Fixes
the headline IT case ("pozione guarigione" now finds "Pozione di Guarigione" — the interstitial "di"
can't break the match) and propagates app-wide through the single seam (roster · command palette ·
every picker). Order-independent, interstitial-word-tolerant, still partial-token / case- /
accent-insensitive / bilingual; `rankedSearch`'s two-tier name-over-description ranking and the
`DESC_QUERY_MIN` gate are unchanged. Contract: `DESIGN.md` §15.6.

**Compendium picker name-priority ranking (rule 27 stability fix, 2026-07-21):** the shared compendium /
add-item picker (`useCompendiumPicker`) previously FLAT-filtered with `matchesSearch`, so an entry
matching only in its DESCRIPTION sorted level with a NAME match — typing "pozione guarigione" surfaced
"Pozione di Guarigione" only THIRD (below "Calderone della Rinascita" & co., which merely mention it in
body text). It now reuses the SAME `rankedSearch` primitive the wizard pickers use: each spec exposes a
`nameText` (localized name / EN name / id + subclass) alongside its combined `searchText`, and the
picker feeds `nameOf = nameText`, `descOf = searchText` (combined) — so a NAME hit ranks above a
description-only hit, the match SET is preserved exactly (tier 2 only ever sees non-name hits, mirroring
the command palette's own name/gloss partition), and an empty query keeps natural data order. One fix
covers BOTH the Compendium page and the add-item Equipment/Magic-item tabs. Contract: `DESIGN.md` §15.6.

**v0.18.0 released + DEPLOYED live (2026-07-07):** the release bundled the **Polymorph Phase 2 Beast
catalogue** (the full CR 0–8 fill — 91 forms, +73 new, EN+IT), the **Fable dark-theme chrome refresh**
(the glowing-grimoire login splash, the war-table campaign backdrop, and the engraved
brand-crest roster watermark — the splash is now static; pointer-parallax removed), and **batch-1
mechanics** (Barbarian Relentless Rage / Fanatical Focus riders + the Artificer Tools-of-the-Trade
coverage reconciliation). **Batch-2 mechanics (v0.18.1) are now DEPLOYED live as part of v0.19.0
(2026-07-11):** the Monk Patient Defense L10 temp-HP roll-entry rider (a new `SrdActionDef.tempHpRoll` field) and the
Reckless Attack backlog true-up (its downside consumer already shipped June 2026). Two
**steering-doctrine amendments** merged: (1) live-data migrations now run **AUTONOMOUSLY** under a
snapshot-verify safety net with explicit no-backward-compat / always-optimal modeling (amended golden
rules 10, 22, the four forks); (2) tracking docs must be a **truthful live mirror** — verify-first,
reconcile drift (amended golden rule 16 — this very sync operationalizes it). **Finding:** the
mechanical-automation long-tail (seams **S1–S11**) is now effectively **CLOSED** — several
survey/backlog "open" items turned out already shipped in June (the doc drift that motivated the
rule-16 amendment; a reconciliation audit is queued as the next on-ramp).

**v0.15.0 → v0.15.2 shipped and DEPLOYED (2026-07-01/02):** the **encounter/combat single-source
re-architecture** — HP, conditions, initiative, and death saves live SOLELY in the per-character
`combat/state` subdoc, read and written by the sheet, roster, campaign hub, and DM alike
(edit-anywhere by construction, golden rule 6); the frozen `EncounterState.order[]` + the one
`useTurnState` seam (which killed the "round 6, 7, 8…" drift), the all-rolled Begin-turns gate with
DM lift-&-follow drag-reorder, the labelled topbar combat pip with its inline roll-initiative
popover, the turn-START action-economy reset, and the test-enforced resilience invariants
(HP-never-resets, frozen-order integrity, the reload-mid-combat round-trip). Plus the **campaign-hub
redesign** (slim framed header, two-band PLAY/MANAGE dashboard, the campaign's 16:9 art as the
global backdrop with crop-focal parity), **open team sheets**, **DM invite management**
(remove-member, lock-joins, one link-based invite flow), the **shared-notes reveal lens**, and
**admin god-mode** (read-only inspection of any user's characters, a bug inbox, and a cascading
`deleteUser` Cloud Function). The transitional combat-state read-fallback and its spent migration
were DELETED after every live doc migrated (golden rule 10). Detail: `CHANGELOG.md` v0.15.x,
`docs/ARCHITECTURE.md` (the encounter/combat seam), `DESIGN.md` §13.

Deferred cleanliness — the solo-round consolidation is DONE: the SOLO round moved from
`session.round` (parent doc) to the `combat/state` subdoc's `round` field (its sole persisted home,
joining the combat trio), `session.round` is DELETED entirely (field, codec entry, sanitize plumbing,
every consumer), `firestore.rules` field-locks the new `round` (+ emulator rules-tests), and the v3
portable codec DROPS `state.round` one-way at the import boundary. The live-data migration was
**applied + verified against production on 2026-07-10** (every lingering parent `state.round` copied
into the `combat/state` subdoc where it lacked one, the dead parent field dropped; 10 docs migrated,
re-run idempotent no-op; the spent one-off script has been removed — rule 10). Rationale in
`docs/ARCHITECTURE.md` → "Solo round home"; codec story in `docs/CHARACTER_SCHEMA.md`.

**Full-app bug sweep — 32 fixes (2026-07-05, v0.16.4):** a 10-lens full-app discovery workflow (the
per-surface behavioural walk × the input / navigation / concurrency / i18n lenses) plus a graphify
structural nav-analysis over `src` found and fixed **32 bugs** — **1 critical, 13 high, 9 medium, 9
low** — across character creation, campaign-write concurrency, encounter/combat play, the character
sheet, inputs, navigation, and Italian localization. Headlines: the shared campaign write seam made
concurrency-safe (atomic treasury add/take + undo, a Chronicle-save restore-history snapshot before
overwrite, no turn-rewind from a debounced monster edit); encounter membership / DM-role /
gathering-roster hardening (removing a member drops their combatant, one-campaign-per-character
enforced across two devices, a failed role write reported + rolled back); the app-wide
`InlineEditable` number field now selects-all on focus (a typed digit was inserting into — not
replacing — every numeric override); Max HP edits now target the stored base, not the boosted total;
and creation gates on class skills + caster spells before a character can be made. Gate green
(tsc · lint · coverage · build); `ponytail-review` converged. **Now DEPLOYED** — it rode the
v0.16→v0.18 release train (v0.18.0 is live).

Resolved `ponytail-review` follow-up from the sweep (no user-facing effect): the one-time
`attachedCampaignId` backfill — stamping the internal one-campaign lock onto the legacy attached
characters that carried no claim — was **applied + verified against production on 2026-07-10** (9
attachments stamped, zero conflicts / duplicate memberships / missing docs, re-run idempotent no-op;
the spent one-off script has been removed — rule 10). It closed B07's residual concurrent-attach
window on the pre-existing docs (every NEW attach already stamps the lock).

**Boot data-resilience — the "Clear site data" incident (2026-07-09, rule 27, shipped in v0.19.0,
DEPLOYED live 2026-07-11).**
Two live users reported that after Chrome's **"Clear site data"** mid-session, re-login showed **no
characters and no campaign** for a prolonged period; logout/login didn't fix it; a fresh browser
(Safari) worked immediately and the first browser then recovered on its own. **Diagnosed mechanism:**
"Clear site data" wipes the Firestore IndexedDB cache while the SDK is still running, so on reload the
first roster `onSnapshot` (and the one-shot campaigns `getDocs`) resolves from the now-EMPTY cache
(`fromCache: true`, zero docs) BEFORE the server answers — and the mid-session wipe can leave the SDK's
local layer wedged so the server answer is badly delayed. The app rendered that cache-empty result as
the **authoritative** first-run "create your first character" / "no campaigns" screen, with **no
recovery** (logout/login re-hit the same empty cache; the same Firestore instance stayed wedged). Safari
"fixed" it only because a fresh browser had a clean cache; the first browser recovered by SW/instance
refresh timing (a reload = a fresh Firestore instance), NOT causally from Safari. The "saw only another
member's HP" flash was the same partial-load state (teammates' tiny `combat/state` subdocs resolved while
the viewer's own parent doc didn't), not a scoping bug — `usePartyCombatStates` keys correctly by uid.
**Fix (root, at the shared seam): an ONLINE empty result that is only `fromCache` is never
authoritative.** The roster subscription now surfaces `fromCache` (`subscribeToCharacters` +
`includeMetadataChanges`) and `useCharacters` keeps the loader up until a server-confirmed, non-empty,
or genuinely-OFFLINE snapshot lands (offline, the cache-empty answer settles as the TRUE empty state —
same semantics as the campaigns path), converting an online never-confirmed empty into the recoverable
error state (Retry → reload → fresh instance) after a 10s confirm timeout; `listSharedCampaigns` bounds
BOTH its reads with `withTimeout` and forces a `getDocsFromServer` read when an empty result is only
`fromCache` and the browser is online (every caller handles the rejection —
`Party.attachMyCharacter`'s fire-and-forget pre-check gained a catch → `attachFailed` toast); the
campaigns error state gained a Retry affordance; and a `vite:preloadError` handler reloads once when a
wiped precache 404s a lazy chunk, its latch cleared 15s post-boot so an immediately-refailing chunk
falls to the ErrorBoundary instead of looping (`chunk-recovery.ts`). Regressions:
`roster-boot-resilience.test.tsx`, `boot-resilience-utils.test.ts`, the `campaign-io` server-confirm +
timeout-propagation cases. Detail: `docs/ARCHITECTURE.md` → "Boot data-resilience".

**Session-summary edit-in-place — the read↔edit "resize jump" (2026-07-21, rule 27).** The owner
reported the Campaign → Sessions summary swap felt "traumatic": the read view rendered markdown up to
the `NoteClamp --reading` cap, then hard-swapped to a FIXED `rows=4` (min-height 88px) textarea that
bore no relation to the content — a big instant geometry jump, compounded by an `autoFocus` scroll-yank
and an action row that changed shape (one ghost button → two default-size buttons). **Fix:** the editor
is now CONTENT-SIZED (`field-sizing: content`, `.sess-notes-edit`) seeded off the read content and
capped at the SAME reading bound, so read and edit share ONE footprint (no fixed rows, no drag handle);
focus is placed with `preventScroll`; and empty / read / edit are unified into one structure (a body
region over a right-aligned `.sess-notes-actions` row whose height is identical whether it holds one
button — Edit / Add — or two — Cancel / Save). The commit stays an explicit Save/Cancel (a recap is
authored prose — the safe choice against blur-loss; only short always-complete tokens like the session
NAME commit-on-blur). Regressions: `sessions-section.test.tsx` (seed-on-edit + Cancel-discards) and the
`session-edit-no-jump.spec.ts` e2e (the editor is content-sized with no internal scroll; the region
footprint barely changes read→edit — both fail on the old fixed box). DESIGN.md §12.

**Add-item picker — scroll-preserve + AC i18n (rule 27, 2026-07-21).**

- **Scroll-position reset regression fixed.** The Add-item equipment picker's results list snapped
  back to the top whenever the character store ticked in the background (the ~2s auto-save
  write-back, a session/HP tick): `useCompendiumPicker` keyed `useScrollMemory` on the `filtered`
  result ARRAY, whose reference is re-created on every store write because the memo closes over
  `ctx` (which holds the whole character), so a background write produced a fresh `filtered` even
  though the visible rows were byte-identical. The reset key is now the query+facet IDENTITY
  (`resultSetKey`, a stable string primitive) — scroll resets on a real result-set change and
  survives store churn. Regressions: `add-item-scroll-preserve.spec.ts` (real Chromium, the
  faithful repro jsdom cannot measure) + the `resultSetKey` reset-key-stability cases in
  `compendium-deeplink.test.ts`.
- **Equipment AC stat line fully localized.** The picker row + detail hardcoded English "AC" / "DEX"
  / "(max N)" in the armor stat line ("AC 11 + DEX"), so an IT player saw English tokens; every
  token now routes through `t()` (`equipment.ac` · `abilities.DEX_short` · `equipment.acMaxDex`) —
  an IT player reads "CA 11 + DES" / "CA 13 + DES (max 2)". Regression: the armor-AC row+detail
  cases in `compendium-browse-specs.test.tsx` (real i18next, EN + IT).

## Open decisions (owner)

- **AI assistant — DROPPED (owner, 2026-07-06).** The long-carried "Phase-3 multi-provider AI
  assistant" is de-scoped for good — not deferred, dropped. The deterministic engine is the
  product's intelligence; an LLM conflicts with rules-correctness (hallucination risk), zero-budget
  (API cost / BYOK friction), and offline-first (needs network), and is redundant with what the
  engine already computes. A narrow BYOK narrative-only variant was considered and also declined.
  Do not re-add.
- **Backups / PITR posture** — deliberately deferred by the owner (2026-07-02); revisit when the
  user base or data value grows.
- **Client observability** (error/telemetry reporting beyond the in-app bug report → GitHub-issue
  loop) — undecided.
- **Billing posture.** Blaze plan active on Google Cloud trial credit (£222 remaining, expires
  2026-08-22). The £1 budget alert is now backed by a hard kill-switch (SAFE-01): the `onBudgetAlert`
  Cloud Function subscribes to the `budget-kill` Pub/Sub topic and DETACHES billing when actual cost
  exceeds the budget, forcing spend to zero. **Code + tests + runbook + one-command lifecycle
  shipped** (`functions/src/budget-kill.ts`, `scripts/safe-01.sh`, `docs/BUG_REPORTING.md` →
  SAFE-01). The whole one-time setup is now `just safe-arm` (idempotent: APIs · `budget-kill`
  topic · £1 budget wired to it · the detach IAM grant · deploy `onBudgetAlert`), with
  `just safe-status` (ARMED/NOT ARMED/FIRED) and `just safe-restore` (post-fire recovery,
  defuse-before-re-attach). Owner-run (touches billing + IAM); the switch goes live once the owner
  runs `safe-arm`. The detach grant is least-privilege project-scoped `roles/billing.projectManager`
  (detach-only, cannot re-link) — not the billing-account-wide `billing.admin` the first draft named.

## Phase status

| Phase                   | Scope                                                                       | Status                                                                                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Setup               | Vite/React/TS, Tailwind, custom UI layer, Firebase, CI/CD, PWA shell        | ✅ Done                                                                                                                                                                                                                     |
| 1 — Foundation          | Single-user: auth, SRD database, character CRUD + sheet, wizards, i18n, PWA | ✅ Done                                                                                                                                                                                                                     |
| Automation push         | Drive to 100% of D&D 2024 mechanics, override-first                         | ✅ CLOSED — levers + data-wiring + PROSE sweeps shipped; the verified gap long-tail lives in `docs/AUTOMATION_BACKLOG.md`                                                                                                   |
| UI/UX redesign (gate)   | Full Illuminated Folio visual/interaction redesign                          | ✅ Shipped — design system canonized in `DESIGN.md` (`src/index.css` + `src/styles/folio.css`); axe-clean, bilingual                                                                                                        |
| Combat model            | UI-agnostic immediate-commit turn engine                                    | ✅ Shipped — `combatStore` + `cost-engine` + condition gating + rich casting (contract in `docs/ARCHITECTURE.md`)                                                                                                           |
| 2 — Social & Campaigns  | Multi-char, campaigns, party view, sharing, snapshots                       | ✅ Shipped + live (v0.15.x) — Party, campaigns, open team sheets, the in-hub party overview + encounter/initiative tracker (single-source combat state), DM invite management, shared-notes reveal lens, admin god-mode     |
| 3 — Chronicle           | Markdown chronicle + version history, Treasury, SharedNotes, Sessions       | ✅ Shipped (v0.15.x) — Chronicle (markdown + version history), Treasury, SharedNotes, Sessions all live. (The AI assistant / AI session recaps once scoped here were **DROPPED** — owner 2026-07-06; see _Open decisions_.) |
| 4 — Polish & Completion | PDF export, command palette, compendium, a11y, perf, onboarding             | 🔄 PDF export (faithful from-scratch recreation of the official 2024 sheet layout — both pages, EN/IT, copyright-clean), glossary tooltips, perf budget, Cmd+K palette shipped. Guided tour + compendium polish open        |

## Shipped — the content-pack licensing partition (2026-07-17)

The data-split seam that precedes open-sourcing: `src/data` + `src/i18n/*/srd` now carry ONLY
SRD 5.2.1 (CC-BY-4.0) content (every entry `source: "SRD"`, guard-enforced by
`tests/unit/content-pack-partition.guard.test.ts` — PI-term denylist + source invariant); everything
else (825 entries: the Artificer, all non-SRD subclasses/feats/spells/species/backgrounds/magic
items, the 20 maneuvers, the team fixtures, the pack dev scenarios and pack-only test suites) lives
in the private `content-pack/`, composed back via the ONE `@pack` build-time alias so the composed
app matches the pre-split product (the pack overlay restores the 18 PHB creator names — published
publicly under their SRD 5.2.1 names — plus the full Elven Lineage / Pact of the Chain prose and
the pack's own heritage-feat category label; the engine's feat-category/scope vocabulary was renamed to the generic
`heritage` — not persisted in any live doc, verified). Both build modes gate green: `just ci`
(pack mode, coverage floors) and `just ci-srd-only` (the public snapshot's composition). Full seam
doc: `docs/ARCHITECTURE.md` → "The content-pack seam". **WI-1 shipped (2026-07-17): exact dual
attribution** — the licensing audit proved the shipped prose draws on BOTH SRD 5.2.1 and SRD 5.1
(each CC-BY-4.0, each requiring its own exact statement), so `/legal` now carries both required
statements verbatim as two stacked plaques (EN texts + WotC's official IT texts — the official
IT SRD 5.1 exists, `SRD_CC_v5.1_IT.pdf`) and `README.md` carries both EN statements; unit + e2e
locks pin all four byte-exact. **Repatriation follow-up (2026-07-17):**
the verifier's 22 KEEP-PACK holdbacks (11 subclass features + 11 magic items — all genuine SRD
5.2.1 entities held back only for residual prose lineage) were re-sourced to the SRD's own CC-BY
prose (EN verbatim, IT per the D2 cascade from the official IT SRD) and moved public, so Hunter /
Draconic Sorcery / Fiend Patron / Evoker ship complete features in SRD-only mode; the now-empty
`dataOverlay.subclassFeatureIds` escape hatch was deleted from the seam (the pack-subclass
composition — `withPackSubclasses` in `src/data/classes.ts` — remains; only the data-overlay
branch died), and Cube of Force carries
the SRD table (Tiny Hut / Private Sanctum / Resilient Sphere — mechanics identical, no overlay).
**Docs-partition + sensitive-value sweep shipped (2026-07-17):** the tracking docs are split the
same way — pack-entity coverage/backlog rows moved verbatim to `content-pack/docs/` — the remaining
docs generalized (no pack-entity names, no live-fixture identifiers, no personal values in the
would-be-public tree), the Storage rules' admin check made data-driven (matching the Firestore
rules), and the partition guard extended to scan the docs for the PI lexicon + identity values.

**Open-sourcing scaffolding shipped (2026-07-17):** the lean public workflow pair (`ci.yml` —
push/PR typecheck+lint+unit+build+budget gate, SRD-only by construction, self-skipping while the
repo is private; `deploy.yml` — dispatch-only, mirrors `just deploy` on a runner and composes the
private pack repo `salvodicara/d20-folio-content` via `CONTENT_PACK_TOKEN`; `test.yml` /
`visual.yml` / `update-snapshots.yml` deleted), the public front-door `README.md`
(SRD-only build story + exact dual attribution kept), public `package.json`
repository/homepage/bugs metadata, and the ONE-OFF snapshot builder — a
`build-public-snapshot.sh` that lives ONLY in the private tree's `scripts/` (it excludes itself
from the snapshot it cuts, so the public tree never carries it). The builder is clean-tree-only:
it copies all tracked files minus the exclusions below into a fresh-history repo — single commit
"feat: initial public release" authored under the GitHub noreply address — verifies the
exclusions are absent, then runs the partition guard + the full SRD-only gate inside the target
from a fresh install; it is `git rm`'d once the public repo is live. The exclusions (all
private-tree-only paths; this paragraph is the script's single source): the private
`content-pack/`, the local reference-data mirror (`data-scrape/`), the three
data-retrieval/ingestion scripts (`scrape_wiki.py`, `ingest_magic_items.py`,
`analyze_mechanics.py`), `previews/`, and the builder script itself.

**SHIPPED — the repo is PUBLIC (2026-07-17).** The open-sourcing epic (GH #32) is closed: the
snapshot was cut and `salvodicara/d20-folio` published with fresh history ("feat: initial public
release"); the split-repo world is live — the public repo is the canonical dev home (justfile,
hooks, worktree flow) and the private `salvodicara/d20-folio-content` repo carries
`content-pack/` + archives, composed locally via a gitignored sibling-checkout symlink
(`content-pack -> ../d20-folio-content/content-pack`, auto-linked into each worktree by `just wt-new`
when the pack sibling exists — composed-by-default — docs/CONTRIBUTING.md
→ "The two build modes"; pack tests reach public-root helpers via the root-anchored `@tests/*` /
`@scripts/*` aliases, the vitest lanes resolve with `preserveSymlinks`, and the dev server allows
the pack's real directory — docs/ARCHITECTURE.md → "The content-pack seam"). The spent snapshot
builder is gone (the public history never carried it). Residual (unchanged by the split): the
Playwright e2e suite stays pack-mode-only (`surfaces.ts` + several specs drive pack fixtures /
scenarios); the public `ci.yml` gate — typecheck + lint + unit + build + budget — is green
SRD-only.

## Active epic — The full-BG3 pivot (owner-ratified 2026-07-16)

**The owner's charter, captured on ratification (golden rule 4).** Baldur's Gate 3 — THE GAME — is
the aesthetic north star, now applied without the prior restraint: this **supersedes the
"Ember Penumbra" lit-magic grammar and the "Daylight Sibling Plates" light direction as an informed
override** (both shipped and owner-ratified earlier; the owner reopened and re-decided knowingly).
`docs/PRODUCT_CONSTITUTION.md` **amendment v1.8** lands with the parallel identity mission. The
quality bar, verbatim: _"It has to be woooooow. Users have to go: woooow man this is so professional
and curated, it's even better than DND Beyond!"_

The pivot's work packages:

- **Rules-text colour grammar — SHIPPED on this branch:** the rules-prose scannability grammar
  rebuilt full-BG3 — damage phrases wear their damage type's hue, condition names their condition
  hue, values (dice · save DCs · measured distances/durations) the lit special-ink register, and
  Advantage/Disadvantage the success/danger inks, the way BG3's tooltips read at a glance —
  colour explicitly ratified for rules prose, replacing the earlier weight-only restraint
  wholesale. Both themes DESIGNED (each theme's existing AA ink ramps), both locales first-class
  (IT inflection vocabulary included), axe serious/critical = 0. Grammar spec: `DESIGN.md` →
  "Rules-text colour grammar". **Locale-corpus closeout (2026-07-17):** the measured-unit
  vocabulary now covers every unit the SRD writes — EN `inch`/`inches`, IT `centimetr[oi]`
  (magic-item small-scale prose) — closing the last review-flagged unit gap; and the IT damage-type
  nouns are normalized corpus-wide (197 occurrences across all `it/srd` catalogues, both partitions)
  to the SRD defined-term capital ("danni da Fuoco", "danni Necrotici"). The grammar is first-letter
  case-flexible (`[Ff]uoco`, `[Dd]ann[oi]`), so the casing normalization is pure data hygiene —
  render-safe by construction, pinned by the grammar suite. IT casing convention recorded in
  `docs/ARCHITECTURE.md` → "Italian source cascade".
- **Full-BG3 identity mission (parallel):** the app-wide visual language pushed to full BG3; ships
  the constitution v1.8 amendment.
- **Light theme rebuilt** as the daylight sibling of the NEW language (not adapted from dark).
- **Art regeneration:** a precision prompt document in `~/Documents` the owner feeds to ChatGPT
  over days; assets land as they are produced.
- **Follow-up task — a full UI-test-corpus noise audit: SHIPPED (2026-07-17).** The audit ran and
  its findings merged as the `test-audit-*` changeset series: vacuous presence matchers
  strengthened, the permanently-skipped app-shell e2e replaced with a running `login-page` render
  test, the 52 spent one-mission `_*-shots` capture harnesses pruned (git history is the archive),
  and a per-theme reliquary-token count guard added. The four STANDING capture harnesses are the
  deliberate keep — `_polish-shots` (full-surface sweep), `_identity-shots` (identity/theme sweep),
  `_scenario-shots` (mechanic injection), `_perf-probe` — with their distinct roles and the
  `git rm`-before-merge convention recorded in `docs/CONTRIBUTING.md` ("The `_*` capture-harness
  convention"); `_identity-shots` and `_polish-shots` stay SEPARATE by design (theme-surface vs
  full-surface sweeps), not folded.

## Ratified epic — The DDB-parity frontier (owner-ratified 2026-07-17)

> The standing competitive map this epic serves — the ahead/behind frame, the deliberate non-goals,
> and the moat-vs-opening — is `docs/POSITIONING.md`.

**The owner's charter, captured on ratification (golden rule 4).** A full competitive audit vs
D&D Beyond (mid-2026 verified state: Project Sigil dead, 2D Maps free-for-all, DDB's 2026 roadmap
rebuilding toward "rules as data" — the architecture this app already has; DDB's weaknesses =
English-only, online-first snapshots, PDF-only export, paywalls) found the app AHEAD on the
player/sheet experience and structurally behind on the DM/content side. The owner ratified closing
everything except the deliberate non-goals. Standing constraints: license-clean by construction — all new
content is authored split-aware behind the #32 aggregation seam (SRD in the public repo, non-SRD in
the private content pack) — and the £1 budget. Forks resolved in the ratification grill
(2026-07-17):

- **Maps/VTT: constitution §2.9 STANDS** — no battle map, ever. The one permanent DDB gap, owned
  as "bring your own VTT".
- **Bestiary (flagship):** the FULL wikidot monster corpus, split-aware from day one — the ~330
  SRD 5.2.1 creatures in-repo, MM-2025-et-al statblocks pack-side, i18n along the same manifest,
  and the existing 91 `src/data/beasts/` Polymorph forms classified by that manifest (coordination
  comment posted on #32). Unlocks four surfaces: the encounter picker (replacing the type-by-hand
  AddMonsterForm), the 2024-DMG XP-budget difficulty calculator (DDB's standalone tool is stuck on
  2014 math — we can be more correct), the compendium Monsters section, and companions.
- **Companions/Extras:** a persistent companion-statblock surface on the sheet (Find Familiar,
  Primal Companion, Drakewarden, Artificer Steel Defender/Homunculus) — closes a
  rules-completeness hole; reuses the bestiary statblock renderer.
- **Homebrew — the full ladder:** (a) an account-level library promoting the per-character
  CustomSpell/Feature/Equipment/Weapon types to reusable account docs; (b) campaign sharing of
  that library; (c) authoring types staged after the bestiary — monster editor first, then
  species/feats/subclasses/backgrounds as declarative Grants; (d) homebrew CLASSES declared the
  horizon flagship on the grants seam (DDB's #1 refused community ask), scheduled only once (c)
  proves the authoring UX. Homebrew is user data, never repo data — no #32 impact.
- **Public share links: LIVE model** — a `shared: true` flag on the character doc + the
  unguessable doc id as the URL; rules allow anonymous read-only when flagged; revoke = flip the
  flag; noindex; reuses the MemberSheetView read-only rendering.
- **Quickbuild:** a fast-path creation preset (~10-tap playable level 1 — auto standard array,
  suggested skills/spells/equipment, all editable after) + pregens, on the existing wizard
  suggestion machinery. DDB shipped "Quickbuilder" March 2026.
- **Compendium completeness:** species/backgrounds/subclasses/conditions/rules-glossary sections
  (+ Monsters when the bestiary lands) — this DEFINES the open Phase-4 "compendium polish" scope.
- **XP:** an optional per-character XP counter with a threshold-reached → Level-up nudge;
  milestone (wizard-driven) stays the default; zero change for current users.
- **Auth breadth: DEFERRED** until the #32 public launch — Google-only stands; queue email-link +
  Apple when unknown users can arrive.
- **Table feed** (the dice-free game-log analog): **PARKED** — per-action campaign writes are the
  one feature class that genuinely threatens the £1 budget, and the encounter tracker already
  carries the at-table live state.
- **Sequencing:** interleaved as the next NEW-FEATURE epic — the RA correctness waves keep rule-27
  priority, the BG3 identity missions continue untouched, and the bestiary campaign opens first,
  coordinating with #32. Attack order: bestiary → encounter picker → difficulty calc → companions
  → homebrew library → quickbuild → share links → compendium completeness → XP.

## Shipped epic — BG3-Grade Identity Evolution Epic

### The FULL-BG3 fidelity push (owner-ratified 2026-07-16) — IN FLIGHT

The owner ratified pushing the shipped candlelit struck-gold identity to **full BG3 menu-craft
fidelity across the whole app** (constitution v1.8 — an informed override superseding the
"Ember Penumbra" / "Daylight Sibling Plates" directions as the CEILING; their shipped work stays
the base). Light lives as the daylight sibling of the new grammar; dark stays flagship. Two
parallel missions: the compendium rules-text emphasis grammar (SHIPPED — `highlightSrdProse`,
v0.20.0 tail) and the identity push itself (this mission). State:

- **Wave 1 — the Gilded Reliquary frame grammar: SHIPPED (2026-07-16).** Worked-gold corner
  goldwork on the three earned hero frames (framed realm masthead · gilt cockpit identity band ·
  dialogs) via the per-theme `--frame-ornate` SVG + `border-image` overlay; engraved ceremonial
  titling (`--engrave-title` — dark struck-plate, light letterpress); the tapered modal-head seat
  rule; panel smoke (dark) / morning-shade (light) vignettes. All recipe-level (`DESIGN.md` §5
  "The ornament vocabulary"), asset-independent, verified {dark·light}×{EN·IT}×{desktop·mobile}.
- **Asset pipeline — batch 4 prompt doc DELIVERED to the owner (2026-07-16):**
  `~/Documents/d20-folio-bg3-asset-prompts.md` — PROMPT_12–25: six v2 scene-plate regenerations at
  full BG3 painterliness (study/login/war-table × dark/light), six NEW realm-scene plates
  (compendium Grand Library · roster Hall of Heroes · creation Ritual of Making, each a
  dark/light pair — per-realm backdrop tokens get wired when the art lands), and two engraved
  ornament alpha masks (corner bracket + header flourish, candidates to top the in-code vector
  goldwork). The owner generates over days into `~/Documents/images_d20folio`; each delivery is
  graded, WebP-compressed, and wired independently. **Nothing blocks on assets** — current art is
  the interim grade.
- **Batch-4 first delivery INTEGRATED (2026-07-17):** PROMPT_12–14 (candlelit study v2 · daylight
  study v2 · grimoire-altar login v2) judged against the prompt doc's Accept/Reject bars — all
  three ACCEPTED (calm centres verified numerically: P12 centre-half mean `#0d0602` σ4, P13 honey
  mid-tone `#bb843d` σ23, P14 left third mean `#060402` σ2 — and P13's stray corner AI-signature
  squiggle clone-stamped out before grading) and shipped as in-place replacements of
  `home-hero.webp` / `home-hero-light.webp` / `login.webp` (same tokens, no wiring change). Encoded
  WebP q75 + sharp_yuv (visually transparent at 1:1): 80 / 113 / 78 KiB vs the v1s' 26 / 42 / 106;
  the PWA precache ceiling re-baselined 7151 → 7247 KiB (the richer painterly edges ARE the bytes).
  PROMPT_15–25 remain with the owner.

- **ASSET-INTEGRATION HANDOFF — the ONLY remaining pivot work (for a future session).** Everything
  non-asset is closed; the sole task left is integrating PROMPT_15–25 as the owner delivers them
  into `~/Documents/images_d20folio`. This is a checklist, not an essay — the pipeline is proven by
  PROMPT_12–14. Prompt doc (Accept/Reject bars per prompt): `~/Documents/d20-folio-bg3-asset-prompts.md`.
  - **State:** 12–14 ✅ integrated · 15–25 ⬜ still with the owner (generates over days). Each pair
    ships INDEPENDENTLY — a delivered dark plate goes live even if its light twin lands days later
    (the current plate covers the gap).
  - **Class (a) — 15–17 = DROP-IN swaps onto existing per-theme tokens (mirror exactly how 12–14
    landed: replace the file, no wiring change).** PROMPT_15 → light `--asset-login` →
    `public/assets/backgrounds/login-light.webp`; PROMPT_16 → dark `--asset-campaign-backdrop` →
    `campaign-backdrop.webp`; PROMPT_17 → light `--asset-campaign-backdrop` →
    `campaign-backdrop-light.webp` (dark tokens live in `src/index.css` `:root`; the light re-points
    in its `[data-theme="light"]` block, ~line 793).
  - **Class (b) — 18–23 = NEW per-realm scene wiring (deliberately NOT pre-built — build it when the
    art lands).** Three realms, each a dark/light pair: 18/19 compendium (Grand Library), 20/21
    roster (Hall of Heroes), 22/23 creation+level-up (Ritual of Making — optional tier, only if 22
    keeps). Building each entails: (1) add a per-theme backdrop token to `src/index.css` mirroring
    `--asset-campaign-backdrop` — dark URL in `:root`, light re-point in the `[data-theme="light"]`
    block (suggested: `--asset-compendium-scene` / `--asset-roster-scene` / `--asset-creation-scene`;
    files `public/assets/backgrounds/{compendium,roster,creation}-scene{,-light}.webp`); (2) mount it
    on the realm surface by overriding `--app-bg-art` on `:root` while mounted, EXACTLY the
    CampaignHubPage pattern (`CampaignHubPage.tsx` ~line 98 — `setProperty` on `--app-bg-art` at
    mount, `removeProperty` at unmount; reuses the one `body::after` backdrop layer, no new layer) —
    for the compendium page, the roster page, and the creation/level-up wizard; (3) hold the
    calm-centre discipline (the realm's cards/codex sit over the plate's dead-calm centre third —
    the prompt doc's Accept bar); (4) both themes designed, never adapted.
  - **Class (c) — 24–25 = ornament alpha masks, A/B'd against the in-code two-tone goldwork.** These
    are candidates to top the SHIPPED F2 dimensional two-tone reliquary corners (`--frame-ornate`)
    and the engraved header flourish. **Decision rule: the generated mask must BEAT the in-code SVG
    at BOTH 1x and 4x crops, or it is REJECTED** — the in-code goldwork is the incumbent and already
    carries the wow at small size (wave-2 discreet refinement). Rough-but-close is fine: edges are
    retouchable, composition is not.
  - **Acceptance protocol (every delivery):** grade into the theme colour band → verify the
    calm-centre rule with real UI composited over it → judge against the prompt doc's per-prompt
    Accept/Reject notes → retouch stray AI artifacts (as PROMPT_13's corner AI-signature squiggle
    was clone-stamped out before grading) → encode.
  - **Budget discipline:** WebP **q75 + sharp_yuv** (visually transparent at 1:1). The
    **never-exact-fit ceiling policy** holds — after each delivery re-baseline `PRECACHE_CEILING_KIB`
    in `tests/unit/bundle-budget.guard.test.ts` (currently **7276 KiB**, baseline 7270.8 + ~5 KiB
    deterministic headroom) AND its inline baseline comment, in the same commit; leave headroom,
    never fit exactly.
  - **Verification bar (per integration):** the rule-15 screenshot matrix (both themes × EN+IT ×
    desktop+mobile wherever they differ, real Chromium), the a11y battery (axe serious/critical = 0),
    the on-art ink-contrast batteries (`verdict-ink-contrast` / on-backdrop AA), and a PROACTIVE
    owner push of before/after snapshots per golden rule 25 (the preview always precedes the manual
    test).
- **Wave-1 review fix — F1 SHIPPED (2026-07-16):** the corner gem was seated ~6px from the corner
  (SVG center 26,26) and sheared by `--radius-xl` (8px) on `overflow:hidden` hosts / overhung the
  curve on the cockpit band; moved the whole corner unit inboard (gem center 26→40 SVG units, arms/
  echo/finials re-anchored to the y/x-40 seat, arm start pushed 50→64 to clear the larger gem) so
  the whole gem clears the 8px radius — one consistent "seated inside the mitre" reading on all
  three registers, verified {modal·masthead·cockpit-band}×{dark·light} in real Chromium.
- **Wave 2 — F2 dimensional two-tone strike: SHIPPED (2026-07-17).** The corner goldwork is now
  worked metal, not line-art: every member carries a light/shade pair (dark = under-shadow seat +
  top-edge glint under the gold-300 body; light = the letterpress inversion — cream understroke +
  umber upper wall under bronze), and the corner gem is truly faceted (dark: lit top facet/shaded
  lower/deep core; light: intaglio). Structurally the SVGs mirror UNFILLED geometry first and tone
  after, so the bevel light stays top-left on all four corners; gems place per-corner unflipped
  (guard-pinned, `ornament-vocabulary.guard.test.ts`). Verified 1x + 4x crops ×
  {masthead·cockpit band·modal} × {dark·light} in real Chromium.
- **Wave 2 — the discreet-weight refinement: SHIPPED (2026-07-17, owner-directed).** The owner
  reviewed the shipped corners at real scale: _"isn't the corner arts a bit too invasive? … is it
  normal they oppress the text?"_ — and the honest BG3 comparison agreed (BG3 frames are
  hairline-quiet with SMALL corner accents; our unit was denser and the masthead title sat near
  the arm's reach). Resolution (supersedes F3's "declined"): the echo hairline + mid-arm diamond
  are DELETED (they were the ink nearest content, ~14px into the box), the gem shrank r20→15
  (~7px) and the arm 122→74 SVG units (~33px reach, was ~47px) with a smaller finial — the
  two-tone strike carries the wow at the small size (a small worked jewel beats a large flat
  one). Clearance verified against the owner's exact complaint crop (roster masthead dark
  desktop) + all three registers × {dark·light} × {desktop·mobile} — title/content ink and
  ornament ink never share air. Combined wave-2 budget: eager closure 755.2/756 KB gz; precache
  ceiling stepped once 7250→7252 KiB (+2, documented — the wave's raw growth atop the Batch-4
  plates' 7249.1 build, restoring the never-exact-fit headroom floor).
- **Wave 2 — the interactive layer (BG3 "touch" fidelity): SHIPPED (2026-07-17).** Audit verdict:
  the interactive layer was already deep (pressed-brass buttons, gold-halo focus + interior wash,
  kindling opt-cell/tabstrip hovers, complete card press vocabulary) — three genuine gaps closed at
  the shared-recipe seam (Constitution §7): (1) **the gilt glint** — the struck-gold tier
  (`.btn.primary`/`.btn.brass`/`.endturn`) now plays a one-shot specular sweep on hover (BG3's
  "metal catches the light"), transform-only, 900ms `--ease-standard`, one-shot by construction,
  `[data-motion="auto"]`-gated, verified frame-by-frame in real Chromium (settle's fast start
  raced it across in a blink — retuned); (2) **pick-row hover kindles** toward candle-gold (was a
  plain neutral fill — the one browse row outside the "warm to the touch" voice); (3) **light
  `.cmp-tab` hover** was imperceptible (surface-2 on ivory) — now its own warm strike. Guard:
  `interactive-kindle.guard.test.ts`; grammar row in `DESIGN.md` §9. Focus layer verified healthy
  (keyboard-walked: gold double ring + wash on the gilt CTA); axe sweep 97 passed, zero
  serious/critical.
- **Open:** the pivot's ONLY remaining work is **asset integration (PROMPT_15–25)** — the precise
  checklist is the "ASSET-INTEGRATION HANDOFF" bullet above (grade + wire owner deliveries, the
  per-realm backdrop token seam for 18–23, the 24–25 ornament A/B). Everything non-asset is closed.
  Two OPTIONAL future-polish items ride downstream of the assets, neither a loose end nor a
  regression (rule 27 board is clean): sweeping the reliquary register deeper where earned
  (compendium tome chrome, login sign-in column, wizard hero altars — enhancement, not a defect),
  and re-shooting the README screenshots once the art push settles.

**Status: SHIPPED (dark flagship) — released in v0.18.0 (2026-07-07).** The owner-ratified evolution
of the frozen "Illuminated Folio" into its **candlelit struck-gold** form is merged to `main` and live:
the Gilded Plate type system (Cinzel · Alegreya · Source Serif 4), the BG3-grammar palette (the cream
`--text-special` tier, warm-black neutrals, the two scrim tiers, the focus wash, grounded glows),
candlelit translucent panels over the owner-generated atmospheric art, the settling motion grammar
(`--ease-settle`), the geometric ornament vocabulary, the struck-medallion economy, and champlevé
enamel accents — all applied at the token seam and swept per-surface. `docs/PRODUCT_CONSTITUTION.md`
bumped to **1.6** with the ratifying amendment; the steering canon reads as the current world.

**Shipped — all COMPLETE (granular detail in git history + the release changesets, golden rule 6):**

- **Phase 0 foundation** (T1–T5): the type system, the palette grammar, the AI-raster materials
  (batch 1), candlelit translucency (`--panel-alpha`), the settling motion re-voice, and the ornament
  vocabulary — landed globally at the token seam.
- **Phase 1 dark-theme perfection wave** (P1–P10): the impeccable craft pass over every surface —
  the full cockpit (Combat · Spells · Inventory · Features · Bio), the campaign hub, both wizards
  (creation + level-up), the roster + global shell, the compendium, and the account / admin /
  read-only / report / login screens — each walked {desktop · mobile} × {EN · IT} dark, all
  interaction states, every discovered UX-behavioral defect fixed in-branch.
- **Owner picks (2026-07-03):** the struck-medallion economy discs, the gold movement channel, and
  the Portrait-Socket combat pip — the winners became THE components, every losing alternative deleted
  whole (golden rule 10). The live encounter-interaction batch (stale-init epoch gate, optimistic End
  Turn, input-draft survival, pip labels) and the solo End-Combat + toggleable-coin re-arm shipped
  alongside. The golden-rule-18 model-tiering correction is now applied to `docs/GOLDEN_RULES.md`.
- **Solo↔encounter band precedence (owner-ratified 2026-07-03, SHIPPED).** The full cockpit
  combat-tab matrix {pure solo · gathering · live my-turn · live not-my-turn · ended} × {coins ·
  movement · End Turn · End Combat · initiative · scope} walked in real Chromium; four deviations
  fixed at the ROOT seam (`useTurnState` → the new `useSheetCombat`): **(1) character scoping** — the
  shell status is keyed on the USER's uid, so a SECOND hero of the same user (not in the fight) wrongly
  inherited the encounter chrome; now scoped to the open hero (`gc.characterId === open id`), and the
  cockpit initiative epoch (`currentEncounterEpoch`) is likewise scoped in `GlobalCombatMount`, so the
  non-encounter hero is pure solo (own round, End Combat, its own initiative) while the topbar pip stays
  the user-wide signal. **(2) gathering** had NO inert treatment — now Action/Bonus/Reaction/Movement +
  End Turn quiet + inert (init entry is the one call to action). **(3) not-my-turn reaction** dimmed with
  its siblings — now the Reaction coin carves back to LIVE (RAW off-turn reactions), the dim applied
  per-coin so a child can exceed the faded parent. **(4) encounter ended** — a `TurnEconomyProvider`
  subscription now resets to solo baseline (round 1 · economy re-armed · movement full · initiative
  cleared) the instant the open hero's scoped status drops, so an open sheet reverts cleanly with no
  stuck `waiting` state. HP/conditions/death-saves/Rest stay ungated in every mode (§2.8). Pinned by
  `turn-state.test.ts` (scoping) + `turn-band-waiting.test.tsx` (phases + baseline reset) +
  `tests/e2e/combat-band-phases.spec.ts` (the Chromium-only computed-opacity carve-out). Docs: `DESIGN.md`
  §13 (`.turn[data-phase]`). Dev seam: `makeDevGlobalCombat` now publishes the turn-phase statuses.
- **Phase-3 verification sweep (2026-07-03):** the whole-app hardening pass — a11y matrix green
  (90/90 both themes), budgets green (entry 57.1 KB gz, eager 736.1 KB gz, PWA 6765 KiB, themed
  assets ~1.6 MB), §7 cross-surface consistency holding by construction, the 6 team fixtures
  conformant, the full gate green (tsc · lint · coverage · build). (Light has since been rebuilt to
  full depth parity — see _Next — the forward plan_ item 3, SHIPPED 2026-07-09.)
- **Chrome-asset refresh (2026-07-07):** the owner-generated Fable batch-1 painterly plates are
  live — the glowing-grimoire login splash (~109 KB q85) and the war-table campaign default
  backdrop (~72 KB q85, hub + realm-card banner), both legibility-verified {dark · light} ×
  {desktop · mobile} with no scrim changes needed — and the engraved brand crest (P6) is seated
  ONCE as the home roster's frontispiece watermark (alpha-mask WebP through CSS `mask-image`,
  theme-accent ink). The login's pointer-parallax drift was REMOVED (input-coupled decorative
  motion, off the calm identity — the splash is static; the brand-intro reveal + ambient loops
  carry the life). `DESIGN.md` §13 manifest updated.

**The epic's one residual task (post-release):** re-shoot the README screenshots ONCE (never per-unit)
now the identity is finished and the owner picks are in.

### Next — the forward plan

**NEW (2026-07-11) — the 2024 core-rules SYSTEM audit shipped its ranked defect ledger** (owner's
flagship "is the app modeling ALL of D&D 2024, correctly, ideally?" sweep — system/engine phase;
the per-entry SRD content-fidelity sweep is the separate later phase). 35 findings (RA-01…RA-35)
verified against SRD 5.2.1 + the live code, ranked severity × frequency, each with its rule
citation, code seam, and fix tier: **`docs/AUTOMATION_BACKLOG.md` → "The 2024 core-rules SYSTEM
audit"**. Fixes ship in later waves (correctness = Tier-2/3 autonomous; interaction-quality = Fable
design rounds with rule-25 previews). Two tracking-doc overclaims found and reconciled in the same
commit (S5 breaksConcentration auto-drop; the exhaustion level-6 death note).

**Wave 1 (Fable design round) SHIPPED 2026-07-12 — the damage-and-dying flow (RA-03 + RA-05 +
RA-10 + RA-11 closed together as one coherent flow):** the pure damage-intake engine
(`lib/damage-intake.ts` — the character's own resistances/immunities/vulnerabilities/flat
reductions applied to the ENTERED roll, RAW order, no stacking) + defense-aware type chips with a
live math line and multi-part staging in the ONE `HpEditPopover`; the 0-HP rules in
`characterStore.applyDamage` (knockout → Unconscious + fresh track; massive-damage instant death;
at-0 damage → failure marks, crit = two, ≥ max = death; Stable ends on damage); the death-save d20
roll entry on the state-driven DyingBanner (Dying → Stable → Dead) consuming the previously-dead
`deathSaveOutcome` incl. the Champion-Survivor threshold. Every consequence rides one undo entry
(`restoreHpSnapshot`); every automated value keeps its manual path (untyped entry, hand-tapped
pips, removable condition chips). Ledger rows flipped in `docs/AUTOMATION_BACKLOG.md`; the flow
documented in `docs/MECHANICS.md` + `DESIGN.md`.

**The session-end frontier (2026-07-07), most-actionable first:**

1. **ON-RAMP — tracking-doc reconciliation audit — DONE (2026-07-07); per-class coverage re-ground DONE
   (2026-07-09).** A 3-auditor pass verified every open / deferred / partial claim across `PROGRESS.md` +
   `docs/AUTOMATION_BACKLOG.md` + `docs/AUTOMATION_COVERAGE.md` against the ACTUAL code (golden rule 16).
   **9 drift items found (zero false-greens** — the docs were broadly truthful) and all reconciled in
   `main`. **The residual per-CLASS coverage re-ground is now done (2026-07-09):** all 12 class sections
   (+ subclasses) of the coverage matrix were walked row-by-row against the live class-data + grants +
   consumers, and **11 stale cells flipped to match code** (all shipped-but-marked-narrative/partial —
   e.g. Rogue Fast Hands / Second-Story Work / Dread Allegiance, Monk Slow Fall / Empowered Strikes,
   Druid Aquatic Affinity, Cleric Improved Blessed Strikes, Wizard Core Traits / Epic Boon), plus two
   citation refreshes and the removal of a phantom Rogue row. `PROGRESS.md` + `docs/AUTOMATION_BACKLOG.md`
   already marked these shipped — the drift was matrix-only, confirming the named-campaign reconcile
   leaves matrix drift. **Still due:** the feats / species / backgrounds / magic-items / spells sections
   (not part of this per-class pass) remain at the 2026-06-25 baseline (the coverage-banner caveat now
   scopes to them).
2. **The new-primitive tier (design-heavy).** The mechanical-automation long-tail (seams S1–S11) is
   effectively CLOSED; what remains is a set of NEW engine primitives, each a design fork unblocked by
   the owner's optimal / no-tradeoffs directive. **SHIPPED 2026-07-07:** (a) the
   `SrdActionDef.tempHpRoll` roll-entry idiom ported to the spell-cast path (**False Life** 2d4+4, with
   Fiendish Vigor's maximized-12 one-tap); (b) **Warlock invocation action rows** (Gaze of Two Minds — a
   new optional `mechanics.actions` seam on the invocation type); and (c) the **marked-target model**
   flagship (Hex +1d6 Necrotic / Hunter's Mark +1d6 Force as a while-active, DISPLAY-ONLY "vs marked/cursed
   target" weapon rider — never auto-summed, since the app models no enemy). **Heroism's recurring
   per-turn temp-HP SHIPPED 2026-07-09** (the `regen-at-turn-start` cadence gained an `asTempHp` flag →
   max-wins `gainTempHp` seam, one-tap start-of-turn banner). **Wild Magic Surge on-cast SHIPPED
   2026-07-09** (a third `onCast` effect kind `wild-magic-surge` — a display-only post-cast reminder
   toast, no roll). **The defensive-buff consumers SHIPPED 2026-07-09** — Blur (new
   `incoming-attack-disadvantage` grant), Warding Bond (+1 AC/+1 saves + a `defense-note` line), Death
   Ward (a deterministic 0-HP interrupt in `applyDamage`, undoable), Mirror Image (a `defense-note`
   three-duplicate reminder) — all display-only, no rolls. **Death Strike SHIPPED 2026-07-09** — a new
   `round1-damage-double` grant kind surfaces a round-1-gated "DC N CON save or double damage" reminder in
   the turn tracker (never auto-doubles). **The new-primitive tier is now CLOSED.**
   **Two fast-follows on the shipped marked-target model (tasks #26/#27):** the
   COLLAPSED mobile weapon-row chip must gain a "vs marked target" marker before the next bundle-deploy
   (rule 26 design + rule 25 preview). **Task #27 SHIPPED (2026-07-09):** the rider now extends to
   spell-attack rows (Eldritch Blast + Hex) via `resolveSpellAttackMarkedRiders`, keyed off the
   `vsMarkedTarget` flag. Source list: `docs/AUTOMATION_BACKLOG.md` → S10-DEFERRED.
3. **SHIPPED — Phase 2, the light theme rebuilt to depth parity (light-parity, 2026-07-09).** The
   light theme now reads as designed, deep, and appealing as the dark flagship — never adapted. The
   deep-parchment field (direction A: `#bca268`, bright ivory cards floating on a wide value canyon),
   the deepened carved/embossed elevation, the struck-gold glow grammar (designed light siblings for
   `--illumination` / `--gilt-glow` / `--focus-wash` / `--accent-glow` / the medallion + magic-mark
   glints — gilt EDGE emphasis + emboss/lift on cream, never a dimmed dark copy), the on-backdrop ink
   - `.on-art` halo, and the panel/tome material story all landed across the prior OWN-36 / D47 waves;
     this closing pass **graduated the two genuine remaining gaps to designed:** (a) `--text-special`
     from its self-declared placeholder (`#33260a`, a hair off body ink) to a designed gilt-espresso
     **rubrication** (`#4a3006`) — the more-luminous, gold-cast "lit emphasis" that reads as an
     illuminated title on cream, AA on every ground (surface-1 10.2:1 · surface-3 8.2:1 · bare field
     4.95:1), locked by a "lit-register" luminance guard; and (b) the **light login/footer defect** —
     the shared `.site-footer` ivory grounding band (`--bg-surface-1`) hazed the intrinsically-dark
     login splash, so the light footer now grounds with a warm near-black fade (the light twin of dark's
     grounding), seating the colophon cleanly on the candlelit backdrop everywhere and fading the login
     hero to the scene, not haze. Walked {desktop 1440 · mobile 390} × {EN · IT} light across the
     cockpit (Combat · Spells · Inventory · Features · Bio), campaign hub (on-art legibility), both
     wizards, roster, compendium, settings, and login — no flat/muddy/washed surfaces remain vs the dark
     sibling. Every edit scoped to `[data-theme="light"]` / light-only tokens; **zero dark drift**
     (dark control shots byte-identical), axe serious/critical zero both themes, the contrast guards
     green. The §10 parity contract is met; dark stays the flagship + first-run default. **Optional
     follow-up (owner-blocked, NOT required for parity):** the owner's Priority-8 bespoke light-panel
     material would further enrich the light `.folio-panel` surface, but the shared asset set already
     renders a coherent light material story. **Update (2026-07-10):** the P8 plate is graded, tiled,
     compressed, and shipped as `public/assets/textures/panel-light.webp` (DESIGN.md §13), and the
     daylight-sibling rebuild WIRED it: the light `.folio-panel` now lays the cream grain under its
     ivory gradient at the light `--panel-alpha` 0.94 — the morning-light translucency that also
     reaches `.rail` + `.page-head.framed`, so the daylight scene breathes through light chrome as
     the candle glow does through dark.
     **Review-and-polish pass (Fable, 2026-07-10, owner-directed after the Candlelit-Vellum revert):**
     walked every major surface light-vs-dark {1440 · 390}; four genuine gaps fixed — the settings row
     titles/hints smeared (a stale on-backdrop ink flip outlived the rows' move into the ivory
     info-card; deleted, guard #8), all base-rule selected/lit surface TINTS + outer BLOOMS re-routed
     `--accent-primary` → `--accent-glow` (dark byte-identical; the gray Heroic-Inspiration panel,
     fork tabs, path plaques + ~40 sibling lit states now strike gold in light; guard #9 pins the
     class), the light path-plaque/fork-tab selected states joined the gilt-selected family
     (fchip-band + `--gilt-glow-sm`), and the light Take-Long-Rest CTA swapped its near-black umber
     slab for the shared bright-gilt primary band (guard #10). Dark proven pixel-identical
     (before/after diff = only the capture-UA shortcut chip); axe 90/90 + on-art-ink 45/45 green.
     Also repaired two broken polish-harness captures (re-pick label drift; the inline-encounter
     false overlay assert — `overlay: false`).
     **Ember-Penumbra rollout (owner-ratified 2026-07-11, "I definitely go ember penumbra, I love
     it").** A light-material exploration compared three candidate lit-magic grammars; the owner picked
     **Ember Penumbra** as the default. A lit gilt control can't bloom on ivory, so it now reads as
     HEAT: a saturated struck-gilt fill over a warm burnt-umber shadow pooling BELOW it ("glow-below"),
     keyed off the shared light-only `--ember-umber` token. Folded systematically into
     folio.css/index.css with no flag or data-attr (the exploration scaffolding and its shot harness
     removed): the light `--gilt-glow` / `--gilt-glow-sm` / `--illumination` aura tokens carry the ember
     so every consumer (hero bands, portrait wells, caster tiles, seals, selected tiles) converts by
     construction, plus ~15 emblematic recipes
     (Heroic-Inspiration chip/coin, the kindled attack + primary/End-Turn/long-rest CTA family, the
     LEVEL chip, the Rest moon, dashed add-affordances, compendium seal/empty leaf, slot & tracker
     pips, the scorched crest). One dup light `.trk-pip.on` collapsed to a single source. Dark
     byte-identical (proven by the diff — every hunk is `[data-theme="light"]`-scoped or a light-block
     token), text ≥4.72:1 everywhere touched, axe 94/94 both themes, guards pin the ember tokens (the
     ember-penumbra block in `light-theme-backdrop-legibility.guard.test.ts`). DESIGN.md §10.3 updated.
4. **PARKED (owner).** Local backups + observability/monitoring (both in _Open decisions_). The
   open-source / repo-public + legal effort (**GH #32**) has since SHIPPED — repo public
   2026-07-17, split-repo world live (see "Open-sourcing scaffolding shipped" above). **Legal-page slice
   landed (2026-07-09):** the `/legal` page was rebuilt as a proper colophon document — a parchment
   document leaf (the compendium-tome material) with Attribution · Licenses · Trademarks · The App set
   in the document type ramp — and now carries the EXACT dual SRD 5.2.1 + SRD 5.1 / CC-BY-4.0
   required attributions verbatim (WI-1, completed 2026-07-17: both EN required texts + WotC's
   official IT statements as two stacked plaques; `README.md` carries both EN statements), both
   licenses linked (CC-BY-4.0 + MIT), and the nominative-trademark / "compatible with fifth edition"
   notices. Unit + e2e locks pin all four statements byte-exact. **Still open in #32 (out of this
   slice):** the repo-publication work itself — the content partition (the WI-3 display renames +
   the WI-5 PI-denylist guard), the SRD prose re-sourcing (WI-2), and the docs-partition +
   sensitive-value sweep (WI-6) have since landed.

**Owner directives (2026-07-10)** — captured, in flight or queued:

1. SHIPPED (2026-07-10) — realm-switch "refresh" jump: root-caused by frame forensics under
   owner-like conditions (scrolled realms + real navigation, not the fixture-fresh probes). TWO
   causes: (a) the ScrollRestorer's per-realm scroll memory restored on PUSH — returning to a
   scrolled realm painted the top then visibly JUMPED to the remembered offset (and a switch away
   from a scrolled realm briefly painted the destination at the source's offset before snapping),
   so the masthead/crest never landed in the same place twice; (b) the masthead settle animation
   faded title/hint/actions in from invisible + a 6px rise on EVERY switch — the "refreshing" read.
   Fix: every fresh PUSH lands at the top (scroll-to-top runs pre-paint in the layout effect; POP
   keeps exact restore; `?scrollTo` hand-off unchanged) and the masthead is now deliberately STATIC
   (no mount animation — the content change is the navigation signal). Proven by overlap-diff: the
   crest strip is 0-differing-pixels across all three realms + a return visit; a 39-sample
   navigation trace shows zero off-target frames. Guards: `scroll-restoration.test.ts` (PUSH never
   restores), `page-header-crest.test.tsx` (no `.page-head*` animation), `navigation.spec.ts`
   (realm switch lands at top and stays).
   1b. SHIPPED (2026-07-10) — app-wide navigation-feel audit + compose-once fixes (Fable, the
   follow-through on directive 1): EVERY transition class frame-recorded in real Chromium with
   layout-shift attribution (realm switches warm/cold, roster↔cockpit, cockpit tabs incl.
   deep-scrolled, campaigns↔hub↔member-sheet, compendium entry/type/filters, creation + level-up
   wizard enter/steps/exit, rest/palette/shortcuts overlays, POP/forward, deep links) × 1512/390
   (touch) × dark/light × 6× CPU throttle. Most classes measured CLEAN (0 CLS, no loader flash, no
   scroll/focus surprise). Four real defects found and fixed at the root: (a) the campaign hub
   painted before the chronicle's first snapshot, then `AutoAnimateHeight` glided the book-spread
   +226px and shoved four sections down on EVERY hub entry → the hub now mounts the chronicle
   listener itself and composes ONCE (loader holds for both initial snapshots; errors settle the
   gate); the member-card doc-loading cluster now shows the saved SNAPSHOT vitals in the live
   card's own barred chips (stale-while-revalidate, zero height change on hydration); (b) cold /
   deep-link loads pinned the footer under the tumbling d20 then shoved it off when content landed
   (CLS 0.08–0.09) → the FolioLoader wrapper now mounts immediately as the "content settling"
   marker and `.app-canvas:has(.folio-loader)` keeps the SiteFooter invisible until the page
   composes (measured after: CLS 0.0001); (c) the `?` shortcuts sheet snap-closed (conditional
   unmount skipped Radix's exit animation) → sticky-mounted after first open (close now paints a
   real fade, 10 frames vs 2); (d) light-theme campaign-card banner flashed bright ivory while the
   art decoded → art-toned base color under the image. Contract: `DESIGN.md` → "Navigation feel"
   §7; seams: `docs/ARCHITECTURE.md` → "Compose-once loading". Verdict data + before/after frame
   strips in the session evidence; guards: `campaign-hub.test.tsx` (compose-once gate),
   `folio-loader.test.tsx` (settling marker + footer rule), `app-shell-suspense.test.tsx` (sticky
   mount), `chronicle-section.test.tsx` (the section stays a pure store reader).
2. IN FLIGHT — clear-site-data resilience: two live users lost character visibility after clearing
   Chrome site data (recovered via another browser); boot/persistence/SW/auth-race diagnosis + root
   fixes.
3. IN FLIGHT — live-data migrations run with the owner key (solo-round, attachedCampaignId) + a
   legacy-field hygiene sweep of live docs.
4. IN FLIGHT — mobile encounter topbar must never drop the brand wordmark.
5. IN FLIGHT — Bloodied IT term: "Dimezzato" reads as a mechanical status; official-SRD-first
   re-translation.
6. SHIPPED — Legal & Attribution set as THE COLOPHON SPREAD (Fable Tier-1, 2026-07-10, after
   three owner verdicts against a swimming prose column: "still wastes a lot of space. Do it
   properly and SOTA!"): a full-width engraved attribution plaque on the centred ceremonial
   axis, the two licenses as twin deed columns split by an upright fading thread, and
   Trademarks · The App side by side in the bottom register — the leaf's width is earned at
   desktop while every column keeps its reading measure; a phone stacks one clean column. The
   sticky "On this page" rail and its scroll-spy were DELETED (the spread fits roughly one
   viewport, so an in-page TOC had no job left). Contract pinned in
   `tests/e2e/legal-colophon.spec.ts` + the legal-page unit tests; layout doc in `DESIGN.md`.
7. SHIPPED — light theme "Daylight Sibling Plates" rebuild (Fable Tier-1, 2026-07-10; the
   owner-ratified Option A direction, after the "Candlelit Vellum" attempt was reverted on owner
   order). The three owner-generated daylight plates (P9 daylight study · P10 daylight war table ·
   P11 dawn grimoire) are graded, compressed (43/84/108 KB — all inside §13 budgets), and wired as
   the light theme's OWN scene art via per-theme asset tokens (`--asset-home-hero` / `--asset-login`
   / `--asset-campaign-backdrop`, dark in `:root`, light re-points) — each theme downloads only its
   own plates, and a theme switch swaps the hour, never the world. The light `body::after`
   colour-lift filter (a compensation for borrowing the dark art) is retired; the light login scrims
   are re-tuned to warm-umber morning washes around P11's calm left third; the realm-card banner
   flips its decode base to the morning plate's honey tone. NEW: user-uploaded campaign art is
   veiled in light (`data-app-bg-custom` → parchment glaze + gentle desaturation, DESIGN.md §13)
   so ANY upload — pure white, neon, pitch black — sits harmoniously under the light chrome
   (verified with exactly those three adversarial images); and the light `--on-art-halo` is
   re-struck from the hard 4-way outline to a micro-edge + soft engraved shadow, so loose on-art
   text reads as gilt lettering on the morning plates instead of stroked "game subtitle" text.
   Dark is byte-untouched throughout.
8. SHIPPED — compendium-lux (Fable design tier, 2026-07-10): the Compendium opens as a TWO-LEAF
   SPREAD ≥1024px (index verso · reading recto · book-fold gutter — reading never hides the list;
   below, the phone swap model is unchanged), the facet bar collapses behind ONE Filters disclosure
   at every width (active-count tally; the owner's space ask), the deferred school-hue decision is
   RESOLVED YES as the 8-school `--school-*` enamel domain palette (per-theme, AA-guarded chip math;
   the level rainbow stays on the seal — one hue vocabulary per fact), plus the frontispiece resting
   leaf, seated `aria-current` selection, index keyboard roam (search ↓ → rows → Enter/Esc), and the
   one-row scrolling ribbon. Contract: `DESIGN.md` §2 (schools) + §5 "Compendium codex".
9. SHIPPED — the Living Sheet cockpit masthead (Fable design tier, 2026-07-10; management chrome
   later moved OFF the masthead into the fob family, 2026-07-11): the masthead reads identity left,
   the vitals strip (DATA) right — and nothing else (the management chrome lives in the Binder's Fob
   / Signet). Rest and Level Up are quiet ceremony ON the sheet: **Rest** is a
   glyph-only wax-seal moon medallion trailing the HP tile (verb in title/aria — zero rendered
   locale text, so the vitals row is geometry-identical EN vs IT), and **Level Up** is pure
   availability ceremony — a gold "⌃⌃ LEVEL {n+1}" chip beside the lineage (no portrait gem),
   absent at L20. Medallion and chip are owner-only (the
   read-only glass case). Phones get the deliberate 1+4 vitals composition
   (the HP bar leads its top row with the Rest coin trailing it as a same-row sibling — one
   placement rule across breakpoints, zero bar-track overlap — over four even reference tiles). Contract: `DESIGN.md` §5 "Cockpit masthead — the Living
   Sheet".
10. QUEUED — keyboard-shortcut system: discoverable hints (⌘K-style), a shortcuts sheet, high-value
    bindings with limits.
11. QUEUED — navigation consistency: settings/legal live outside the realm nav (breadcrumb
    dead-ends); app-wide navigation audit to SOTA.
12. STANDING — owner reaffirmed the BG3-premium bar: wow-effect without clutter; unique consistent
    design vision; billing must never exceed £1/month (see Blaze note).

**Owner directives (2026-07-11):**

13. SHIPPED (2026-07-11) — the combat-CTA grammar + THE REVERSAL CONTRACT ("for once and for all",
    owner-ratified). ONE rule for every combat CTA — the CTA states usability now; the undo system
    owns ALL reversal: a spent economy token disables every card that needs it to "Used"/"Usata"
    (the reaction contract generalized; the committed occupant keeps the recessed chip + gold
    ring), live Extra-Attack swings stay struck gold (per-swing undo IS the double-attack answer),
    depleted hard-disables with its reason line, condition-blocks dim-but-stay-tappable
    (override-first). The inline "Annulla" tap-again toggle (an undo-stack duplicate) and the
    replace-oldest eviction DIED; `combatCtaState` (combat-card-helpers) is the one pure composer.
    Reversal hierarchy: the session undo stack is THE seam; the 5s undo snackbar (now under the
    ONE-SNACKBAR rule — a new act's announcement replaces the live one in place, retiring
    `replaceKey`; notices keep their own lane), the standing Undo·Redo control, and ⌘Z/⌘⇧Z are its
    only three references. The toast-only stragglers (roll-entry heals/temp-HP, turn-start regen,
    initiative top-ups, coin re-arms) now register on the stack. Contract: `DESIGN.md` → "THE
    REVERSAL CONTRACT" + "THE COMBAT-CTA GRAMMAR".

**Queued tail (not blocking the frontier above):**

- **Full encounter-mechanics perfection audit.** Every reducer/edge of the encounter surface —
  reinforcement slotting, dead-monster skip, multi-writer HP races, reveal/hidden, the death-save
  flow — audited once the identity epic merges (the top backlog item queued from live play).
  (Closed from this audit: **issue #41** — the sheet's `combatStore.initiative` now RECONCILES from
  each `combat/state` snapshot via `syncCombatFromSession`, so a remotely-edited roll re-syncs onto
  the open sheet instead of going stale until reload.)
- **Deferred P3 polish (noted, not defects):**
  - **Cockpit:** the Action Log's bounded-scroll vs
    latest-N recipe; a SHORT structured spell duration for the collapsed gloss (a data-model add, the
    constitution's collapsed-card example); the action-type-by-border-colour-only encoding; a
    play-mode CTA on the empty spellbook; play-mode weapon-mastery chips showing their property.
  - **Wizards:** the guided level field as a raw input (prefers `NumberStepper`, §15.7); the Create
    seal sharing the pager geometry (a taste fork); the level-up done ceremony celebrating level + HP
    only; the two-line eyebrow orphaning "3" on 390px IT.
  - **Roster / shell / compendium:** the legal Back as `navigate(-1)` on a fresh-tab deep link; the
    unchecked selection checkbox reading dark over portrait corners; roster cards not showing campaign
    membership (needs a membership query / denormalization decision); invocation prerequisites
    rendering EN-only (a D2 data gap, no authoritative IT). (The entry leaf's full-width meta grid
    and the hue-less school chips both CLOSED in the 2026-07-10 compendium-lux pass — the fact grid
    is capped at a reading measure; schools got their own enamel domain palette, frontier item 8.)
  - **Account / admin / read-only:** the read-only `.co-ex-pip` taps staying visible (inert); the
    report Summary placeholder clipping mid-example on 390; admin drill-down rows at the ~36px app-wide
    sm height; the Settings DATA section (export-all / import-all / delete-account — needs server
    seams); no AI / BYOK settings section (the AI assistant is DROPPED — owner 2026-07-06).
  - **App-wide:** sm-button touch targets in card heads <44px (a vocabulary-level decision); the DM
    at-a-glance "key resources" row (§2.9 — needs a listener / denormalization decision, free-tier
    posture).

## Active campaign — BG3 on-rails combat

**Direction (owner, 2026-06-22):** the **smartest possible interactive character sheet** — copying
Baldur's Gate 3's clarity about what you CAN and CANNOT do each turn — but it is a **companion sheet,
NOT a videogame**. Owlbear Rodeo owns dice, maps, and the grid, so **NO battle grid, NO dice rolling,
NO modeled enemies**. Target/range highlighting, enemy turn-order, enemy "examine", and timed reaction
prompts are **out of scope by identity** and must NOT be faked. Separately: copy BG3's **graphical
style** as far as possible **within the existing Illuminated Folio identity**.

The workstreams below are COARSE headlines — the detailed per-seam frontier lives in
`docs/AUTOMATION_BACKLOG.md`; do not duplicate it here.

> **The major wave shipped 2026-06-22 (on `main`, git `fe522b60`…`f68226dd`):** on-hit rider chips
> (S2), the A2 duration / per-turn cadence engine (S3), persistent blocked/depleted-reason cards +
> condition-consequence projection (B / S5), form-swap attack rows (S7), and the effective-max-HP /
> set-score / additive-darkvision / Epic-Boon-L19 / 2024-trait correctness batch (D). The boxes below
> are reconciled against that wave; the remaining tail is the genuine open frontier.

### A. Combat mechanics gaps (engine computes, UI renders)

- [x] **S2** — render on-hit RIDERS (Sneak Attack, Radiant/Divine/Blessed Strike, Berserker Frenzy,
      Colossus Slayer, fighting-style riders, Savage Attacker, Lifedrinker heal) from
      `summary.extraDamage`/`dieModifiers`/`onHitHeal` — shipped via `lib/views/rider-view.ts` +
      `components/shared/ActionRiders.tsx`, consumed by PlayTab + the inventory WeaponCard.
- [x] **S3 / A2** — duration / per-turn CADENCE engine: `Recovery` gains `per-turn` (Sneak Attack
      auto-resets at turn start); `while-active.duration.maxRounds` arms a `session.effectTimers`
      countdown the End-Turn seam decrements + auto-drops (Rage = 100 rounds → toast + `effect-expired`
      log + "N rounds left" chip); `advantage-on { round1 }` (Assassinate) gates on `round === 1`. All
      undoable via the single End-Turn undo; additive + back-compat.
- [x] **S5** — death-save crit threshold (Champion Survivor / Defy Death) + a standalone **Bloodied**
      flag on the HP control, both shipped (2026-06-24). The `DeathSaves` control reads
      `deathSaveCritThreshold` off the canonical aggregate and renders a "roll of N+ → regain 1 HP" chip
      only below the RAW default (source-agnostic numeric line, no name leak). `isBloodied`
      (`current > 0 && current ≤ ⌊effectiveMaxHp/2⌋`) drives a Bloodied mark on `HeaderHpControl` via the
      shared `useHpControls().bloodied`, and gates the two Bloodied boon TOGGLES (Desperate Resilience,
      Furious Storm) by their `-bloodied` activeKey suffix → `activatableToggles` hints the precondition
      when not Bloodied (override-first). The descriptive Bloodied features self-state their precondition
      in their SRD text; a dynamic per-feature-card highlight is a noted follow-up. (The other condition
      consumers — `speedZero`/`autoFailSaves`/`breaksConcentration` — shipped under workstream B.)
- [x] **S6** — play UI for the modeled catalogues is COMPLETE. Cunning Strike / alt-recovery /
      alt-cost / the pack maneuvers play in PlayTab; the final three affordances landed
      2026-06-24: **Metamagic per-cast** (an amethyst multi-select chip row in `CastLevelModal`,
      SP-debited from `sorcerer-font-of-magic` in both cast paths, undoable, applicability
      data-driven on the option id) via the shared `resolveMetamagicForCast`; the **EK War Magic
      note** (`resolveReplaceAttackWithCast` → a display-only badge on the Attack-action cluster);
      and **familiar enhancements** (`resolveFamiliarEnhancements` → the Investment of the Chain
      Master invocation-detail callout). Both former zero-caller resolvers now have a UI consumer.
- [x] **S7** — Wild Shape / Arcane Armor / Starry Form form-swap is now CLOSED: ATTACK ROWS, the
      while-active CON-save toggle, the **AC-swap**, AND the **speed-swap** all ship. The
      **AC-swap** is hardened end-to-end — the active while-active AC formulas (`agg.acFormulas`,
      already gated to the lit toggles) thread into the canonical
      `computeCharacterAC`/`computeCharacterAcBreakdown`, so a lit Moon form (13 + WIS), an active
      Mage Armor (13 + DEX), Shield/Shield-of-Faith (+5/+2), and a Barkskin floor (17) reach the
      displayed AC (MAX vs body, override-first) through the ONE helper every AC reader shares. The
      three forms the audit named, ruled per 2024 RAW: Circle of the Moon = a FORMULA (auto-computed);
      generic non-Moon Wild Shape = the beast's natural AC, a per-beast value left to override-first
      `acOverride` (never fabricated); 2024 Armorer's Arcane Armor sets NO fixed AC (keeps worn-armor
      AC) so carries no formula by design. A keystone regression pins the breakdown SOURCE
      (`computeCharacterAcBreakdown` shows the form base when lit; fail-before proven). The
      **speed-swap** is the EXACT parallel + correct-by-design (OVERRIDE-FIRST) — traced end-to-end:
      per RAW (`druid:main` "your game statistics are replaced by the Beast's stat block", incl. its
      speeds) the form's speeds apply, but a beast's per-beast walking/fly/swim/climb speed has NO
      formula, so — like the beast AC — it rides override-first (`speedOverride` walking +
      `speedOverrides[fly|swim|climb]`), never fabricated. Circle of the Moon grants NO speed (only
      AC + temp HP + max-CR, confirmed against `druid:circle-of-the-moon`). What IS auto-modeled is
      the DECLARED while-active movement MODE (Sea Stormborn Fly `equal-to-walking` while Wrath of the
      Sea is lit, Draconic wings, Beast forms) — it flows through the same `while-active` recursion
      the form AC uses → `flySpeed`/`swimSpeed`/`climbSpeed` → `deriveSensesAndSpeeds` → the LeftHud
      speed rows, retracting when the toggle is off. No new grant kind, no fabricated value — the seam
      was already complete; a keystone regression (`tests/unit/active-form-speed.test.ts`) drives the
      whole seam (the Fly row surfaces when lit + retracts when off + resolves the sentinel against
      the effective walking Speed; fail-before proven by short-circuiting the `while-active`
      recursion) plus the override-first walking + per-mode pins. The **stat-swap** is the THIRD
      exact parallel + correct-by-design (OVERRIDE-FIRST): per RAW (`druid:main` Wild Shape → Game
      Statistics) the beast's stat block replaces your STR/DEX/CON — you retain ONLY INT/WIS/CHA — and
      a beast's physical scores are per-beast with NO formula, so they ride override-first in the
      stored `abilityScores` (the same field `effectiveAbilityScores` layers item floors/bonuses on,
      no double-count), never fabricated. The SUBTLE consequence — the **concentration CON-save while
      transformed** (RAW No Spellcasting: shape-shifting doesn't break Concentration) uses the BEAST's
      CON, since CON is replaced not retained — falls out BY CONSTRUCTION: the store's `applyDamage`
      already feeds `effectiveScores.CON` into the concentration-save `savingThrowBonus` (B8), so the
      override-carried beast CON drives the save with zero special-casing. A keystone regression
      (`character-store.test.ts` "the Concentration CON save uses the BEAST's CON while Wild-Shaped")
      drives the whole store seam — the save total moves by the CON-mod delta when the override-carried
      CON changes (fail-before proven by feeding the save a constant CON). The fix-only S13→S7
      doc-comment typo in `active-form-speed.test.ts` was corrected in the same pass. The **Armorer
      Arcane Armor model-weapon rows** are now GATED ON THE CHOSEN MODEL (2026-06-25): all three 2024
      RAW models ship as `form-attack` rows inside a `choice-grant-bundle` (`armorer-armor-model`)
      nested in the donned-armor `while-active` — Dreadnaught Force Demolisher (1d10 Force, Reach),
      Guardian Thunder Pulse (1d8 Thunder + Disadvantage reminder), Infiltrator Lightning Launcher
      (1d6 Lightning 90/300 + once/turn +1d6) — INT-keyed (effective, B7), L15 die bumps via
      `damageDieByLevel`. The existing rail `GrantBundleSelector` surfaces the model picker (no new
      UI); switching the model swaps the attack row, doffing the armor clears it. The minimal seam:
      propagate the wrapping `activeKey` through the `choice-grant-bundle` evaluator (so a bundle in a
      lit form keeps its toggle), plus `oncePerTurnExtra` (→ `summary.extraDamage`) + a catalogue-keyed
      `note` (→ `summary.effect`) on `form-attack` — both REUSING existing channels. Old 2014 "Thunder
      Gauntlets" keys + the un-gated both-rows structure DELETED (rule 10). Regression added to
      `form-swap-attacks.test.ts` (engine gating + the end-to-end `resolveActions` model swap;
      fail-before proven). The **Circle-of-the-Stars Starry Form Archer ray** is now GATED ON THE
      CHOSEN CONSTELLATION (2026-06-25), the SAME doubly-gated shape: the constellation chooser
      (`choice-grant-bundle` `druid-stars-constellation` — Archer/Chalice/Dragon) was moved INSIDE the
      form's `while-active` and the Archer `form-attack` nested into the `archer` OPTION alongside its
      rail aura — so the WIS-keyed ranged Radiant attack row (1d8+WIS → 2d8 at druid L10) surfaces ONLY
      while the form is lit AND Archer is chosen, and retracts when you switch to the passive Chalice
      (heal aura) or Dragon (`roll-floor` aura) constellation. Previously the row was a sibling
      `while-active` gated on the form toggle ALONE, so the Archer ray LEAKED onto the board regardless
      of the chosen constellation. Pure data restructure REUSING the Armorer seam (no new grant
      kind/field); the i18n keys were re-pathed to the nested location (EN + IT already present:
      Archer/Arciere, Chalice/Calice, Dragon/Drago, the ray name "Forma Stellare: Arciere"). 2024 RAW
      confirmed against `dnd2024.wikidot.com/druid:circle-of-the-stars`. Dev scenario `stars-archer`
      added. Regression in `form-swap-attacks.test.ts` (engine gating: form off / no-constellation /
      Chalice / Dragon → no row; Archer → the WIS-radiant ray with the L10 die bump; switch-away
      retracts it; + end-to-end `resolveActions` render in EN + IT) — fail-before proven (5 assertions
      failed on the un-gated data). `aggregated-primitives` + `resource-rail` tests updated for the
      now-form-gated constellation benefits.
      **Polymorph / True Polymorph SELF-swap — SHIPPED (Phase 1, 2026-07-06).** The NEW primitive landed:
      a CR-indexed **Beast stat-block catalogue** (`src/data/beasts/*` — a curated starter set of ~18 iconic
      combat forms CR 1/4→8, ids+numbers only; names in the new `beasts` srd catalogue), the CR-gated per-cast
      **`BeastFormPicker`** (opened from the Polymorph spell card's "Transform" affordance; `resolvePolymorphForms`
      = form CR ≤ the caster's level), and the override-first **self-swap applicator** (`assumePolymorphForm` /
      `dropPolymorphForm` + the pure `lib/polymorph.ts`): assuming a form stamps the Beast's AC/speeds/all-six
      scores into the override fields, applies Temp HP = the Beast's HP, engages Concentration by id, and renders
      the Beast's own PRINTED attack rows on the Play board (`resolveBeastFormAttacks`, `form-attack` unchanged).
      Drop / 0-HP-Concentration-break restores the body + retracts the Temp HP from a session snapshot, undoable;
      the CON-save uses the Beast's CON by construction. Polymorphing ANOTHER creature is a read-only reference
      card (one modeled character). The spell ENTRIES were already 2024-RAW-correct (L4/L9 Transmutation,
      `concentration: true`, WIS save, "Metamorfosi"/"Metamorfosi pura"). Regression: `polymorph.test.ts`
      (catalogue integrity + CR gate + the whole self-swap seam → AC/speed/score/CON-save/attack-row + temp-HP
      retract + undo) and `spell-data-integrity.test.ts` (the spell facts). **Phase 2 — SHIPPED (2026-07-07):**
      the full CR 0-8 Beast catalogue is filled against the same `BeastStatBlock` shape — 73 more forms
      (source-verified against the CC-BY SRD 5.2.1 text + cross-checked against the 2024 XMM bestiary data),
      bringing the catalogue to 91 total forms; True Polymorph's arbitrary NON-Beast forms stay
      narrative/override-first. Full detail in `docs/AUTOMATION_BACKLOG.md` (S7, the Polymorph item) +
      `docs/AUTOMATION_COVERAGE.md` + `docs/MECHANICS.md`.
- [x] **S8** — one-tap apply of computed HP numbers (override-first; golden rule 21 — the app never rolls a die). The DETERMINISTIC legs are true one-tap, undoable: slot-LESS temp-HP cards (Dark One's Blessing, Celestial Resilience, Vitality of the Tree, Inspiring Leader) now carry the resolved amount as a structured `useEffects` entry and apply through the store `gainTempHp` max-wins seam on commit (the slot-gated Adrenaline Rush already did — this mirrors it); the start-of-turn **regen banner** (Heroic Rally 5+CON while Bloodied) gained a one-tap "Heal N" button (`applyHealing` + undo). The DICE leg is roll-entry-then-apply, never auto-rolled: Second Wind (`1d10 + level`) shows the formula + a clamped roll-entry input (`summary.healApply:{dice,bonus}` → `PlayTab.HealRollEntry`); the player enters their d10 and the app applies roll + the deterministic Fighter-level bonus. **Deferred (DICE, display-only):** the pack species' Healing Hands, Wholeness of Body, Form of Dread's Facsimile of Life — auto-apply is forbidden (golden rule 21); there are no dice-free self-heals in the data.
- [x] **S9** — magic-item charge-cast: charged wand/staff items emit a cast row through the `free-cast-spell` seam (debiting an item-charge tracker, shown + editable in the rail Resources); consumed buff potions arm a self-sustaining duration countdown reusing A2's `effectTimers`; set-score items (Headband of Intellect…) reach combat math via `combatAbilityScores`. **Multi-spell item-casters shipped** — Wand of Binding/Fear, Ring of Animal Influence, Staff of Charming cast ONE OF several spells from a shared charge pool via a new item→pool action bridge (`resolveItemPoolCastActions`) reusing the `free-cast-from-list` guided picker, with per-spell charge costs (`spellCosts`: Hold Monster 5 / Hold Person 2, Command 1 / Fear 3) debited + undone at the selected spell's exact cost.
- [x] **S10** (first wave) — data-wiring batch: the genuinely-open bare-prose items wired as PURE declarations on existing grant kinds (no new primitive for the wiring). Free-cast links: Star Map / Misty Wanderer / Mapping Magic (ability-scaled), Fey Reinforcements / Dragon Companion / Gift of the Depths (1/LR). Missing tracker spells: the three pack fey/elemental lineages (per-spell free-cast, old pool tracker removed), Illusionist Minor Illusion. While-active effects: Zealot Divine Fury rider, Reckless Attack advantage, Trance of Order roll-floors, Heroism Frightened-immunity. Action rows: Thief Fast Hands, Dhampir Vampiric Bite. The ONE near-primitive: `chargesFormula` now resolves ability mods (WIS/INT) via the shared `resolveChargesFormula`, not only `"PB"`. **Deferred at the time (need NEW primitives, tracked in `docs/AUTOMATION_BACKLOG.md` S10) — since narrowed:** Sacred Weapon to-hit, War God's Blessing 2-spell free-cast, false-life rolled temp-HP, Gaze of Two Minds invocation actions, and the Hex/Hunter's-Mark marked-target model have all SHIPPED; the genuinely-open remainder is the blur/mirror-image/warding-bond/death-ward defensive consumers. Verified byte-identical against the 6 team fixtures.
- [x] **Cadence-mechanics wiring** (the 4 fenced behind "review S3 cadence first"): **now all 4 WIRED (Death Strike shipped 2026-07-09)** (no half-models — golden rule 19). **Stunning Strike** (Monk L5) — a SELF-SIDE Ki affordance: the existing `free` action (1 `monk-focus`) now also surfaces the "CON save · DC N" line, the DC routed through the ONE `featureSaveDc` (8 + PB + WIS mod) via a generic `saveAbility`/`saveDcAbility` pair on `SrdActionDef`; the app NEVER models the enemy nor applies a Stunned condition (BG3 on-rails). **Studied Attacks** (Fighter L13) — a player-armed `while-active` toggle wrapping `advantage-on { attack }` with a `timed maxRounds:2` duration = the shipped until-next-turn cadence (no miss event exists, so the player arms it after a miss; override-first). **Dread Ambusher's Ambusher's Leap** (Gloom Stalker L3, 2026-06-25) — a `round1` `speed` grant (+10 ft on the first combat turn), the SPEED counterpart of Assassinate's `advantage-on { round1 }`: routed into the `round1SpeedBonusFt` aggregate and applied by `effectiveWalkingSpeedFt(char, resolveSrd, round)` only when `round === 1`; its Dreadful Strike rider + WIS-initiative were already wired. (The 2014 "first-turn extra attack" does NOT exist in 2024 — verified vs `ranger:gloom-stalker` — so there's no extra-attack gap.) **Death Strike SHIPPED 2026-07-09** — a NEW `round1-damage-double` grant kind (`{ saveAbility: "CON", saveDcAbility: "DEX" }`) surfaces a DISPLAY-ONLY round-1 reminder ("DC N CON save or double damage", DC via `featureSaveDc`) in `ThisTurnTracker`, gated on `round === 1`; the app never auto-doubles (no modeled enemy). Verified byte-identical against the 6 team fixtures (none is an Assassin-L17 / Gloom-Stalker / Fighter-L13 / Monk-L5 with these active). See `docs/AUTOMATION_BACKLOG.md` → "Cadence-dependent mechanics unblocked by S3".
- [x] **S11** — save-based action primitive: `SrdActionDef` gained `attack?: ActionAttack`
      (`dice`/`diceByLevel`/`damageType`|`damageTypeChoices`|`damageTypeFromBundle`) ALONGSIDE the existing
      `saveAbility`/`saveDcAbility` pair (REUSED, not duplicated). The shared `applySaveAttackSummary`
      resolver (called from BOTH the SRD-feature AND race-trait loops — single source of truth) resolves
      dice at the action's owning-class/character scaling level (via `pickByLevel`, the cantrip
      `extraDamageByLevel` rule) onto `summary.damage`/`damageType`(`/damageTypes`) + routes the DC through
      the one `featureSaveDc` formula — so the EXISTING chip + facts recipe renders "2d10 Fire · DC N DEX"
      with ZERO new view code or i18n key. **Wired:** Dragonborn Breath Weapon (G1; DEX/CON save, 1d10→4d10
      by char level, type from the chosen ancestry), Cleric Divine Spark (CON/WIS save, 1d8→4d8 by Cleric
      level, Necrotic/Radiant choice), Cleric (Light) Radiance of the Dawn (CON/WIS save, 2d10 Radiant),
      Lupin Howl (G15-DC; WIS/CON save). **The S11b exotic sub-shapes have since all shipped** (the
      `+WIS mod`/`+Cleric level` additives, Divine Spark's heal-or-damage mode, Sear Undead's ability-count
      dice, the pack species' multi-form revelation save + Healing Hands — see the S11b entry
      below). Verified byte-identical against the 6 team fixtures (none is a Dragonborn/Cleric/Lupin with
      these actions). See `docs/AUTOMATION_BACKLOG.md` → S11/S11b.
- [x] **S12 — structured spell `damageDice`/`healDice`** (SHIPPED 2026-06-24, defects C/E). Retired the
      golden-rule-5 seam violation where two display paths disagreed BY CONSTRUCTION: the cards read
      structured dice (unpopulated for ~125 spells → bare "Fire" / wrong "Utility"), the combat tab regexed
      English prose. Populated `damageDice` on all **126** dice spells (7→126) + `healDice`/`effectTag:"heal"`
      on every healer (1→11/13) + a new `healAddsCastMod` for the cure-family, generated from the OLD regex
      as the ORACLE then SRD-spot-checked (Fireball 8d6, Guiding Bolt 4d6, Spirit Guardians 3d8, Moonbeam
      2d10). DELETED `extractDamageDice` + the heal regex; the combat tab now reads the SAME structured field
      the cards read (cantrips scale via the pure `scaleCantripDice`, 5/11/17). Oracle-equality proven for
      every reached spell; both surfaces identical by construction. Override-first preserved; locked by
      `spell-data-integrity` assertions. 6 team fixtures byte-identical. Multi-instance (Magic Missile /
      Scorching Ray ×N) + Stars `diceByLevel` deferred to **S12b** (each a new structured sub-shape;
      SHIPPED 2026-06-25 — see below).
- [x] **S13 — effective walking Speed reaches the UI (SHIPPED 2026-06-24).** The combat-header Speed
      vital now shows the EFFECTIVE walking Speed (override-first via `character.speedOverride`, mirroring
      AC): `effectiveWalkingSpeedFt` folds Mobile/Fast-Movement/Unarmored-Movement/Roving + Boots of Speed
      ×2 (G12) + exhaustion + the heavy-armor STR-requirement −10 ft penalty (G11, vs effective STR). The
      unproficient-armor Disadvantage emits as `AdvantageClause`s (G13) into the combat adv/dis list. The
      PDF Speed + non-walking (fly/swim/climb) sentinels resolve against the effective walking Speed. The
      dead `armorEffects`/`effectiveWalkingSpeed`/`exhaustionSpeedReduction` twins are DELETED (rule 10).
      6 team fixtures byte-identical (the heavy-armor paladin meets plate's STR req — no spurious penalty).
- [x] **S11b — exotic Channel-Divinity save-attack shapes (SHIPPED 2026-06-25).** The Cleric shapes
      deferred from S11, GENERALIZED onto the existing fields (not parallel shapes — golden rule 3). Added
      **`ActionAttack.addMod?: AbilityCode`** + **`addLevel?: true`** (each resolved to a number and folded
      into the dice via `appendAbilityModToDice` — chip "1d8+3" / "2d10+5"; `addLevel` reads the OWNING-class
      `scalingLevel`, B2 lesson), **`mode:"heal-or-damage"`** (emits the SAME total onto both `summary.heal`
      and the save-damage chip — both render on the one card, player picks), and a shared
      **`DiceCount = "PB" | AbilityCode`** generalizing `ActionHeal.diceCount` + adding `ActionAttack.diceCount`
      (ability mod ≥1, via ONE `resolveDiceCount`). Wired: **Divine Spark** (Nd8 + WIS, heal-or-damage),
      **Radiance of the Dawn** (2d10 + Cleric level), **Sear Undead** (WIS-many d8 Radiant, own card so it
      renders). The surface-check + fail-before are pinned in `cleric-channel-divinity.test.ts` + the
      `smart-tracker.test.ts` S11 block. 6 team fixtures byte-identical (none is a Cleric). docs:
      `docs/MECHANICS.md` (Action declarations) + `docs/AUTOMATION_BACKLOG.md` → S11b.
- [x] **S12b — multi-instance spell dice + Stars `diceByLevel` + G24 spell-area recurrence (SHIPPED
      2026-06-25).** The three last S12/G24 spell-data deferrals, each REUSING/GENERALIZING an existing
      shape. (1) **Multi-instance:** `instances` + `instancesPerUpcast` on `SrdSpellData` (Magic Missile 3
      darts +1/slot above 1st; Scorching Ray 3 rays +1/slot above 2nd — PHB 2024) → both surfaces render
      `N × {dice}` via the shared `spellInstanceCount` + `spells.multiInstance` key; the per-instance
      `damageDice` stays intact so a flat rider folds per instance, THEN the UI multiplies (`summary.instances`
      carried separately). (2) **Stars `diceByLevel` (G20/W6):** added `diceByLevel` to the `aura`
      `ranged-attack`/`heal` effect + `damageDieByLevel` to the `form-attack` grant, both resolved via the
      SHARED `pickDiceByLevel` (the private smart-tracker `pickByLevel` was deleted in its favour) — the
      Stars Archer/Chalice die now scales 1d8→2d8 at Druid 10 on the rail aura formula AND the Archer attack
      row. (3) **G24 recurrence:** `recurrence: SpellRecurrence` (`on-enter-or-end-turn` / `bonus-action-move`
      / `action-retrigger`) on `SrdSpellData` → a self-side cadence note on the spell card (a detail tag) +
      the combat gloss (Moonbeam / Spirit Guardians / Flaming Sphere / Call Lightning). LIVE-FIXTURE EFFECT:
      the live Wizard fixture's Magic Missile now reads "3 × 1d4+1" (was "1d4+1") + Flaming Sphere gains a
      bonus-action-move cadence chip — a CORRECTNESS improvement; the `.json` is byte-identical. Regression +
      surface checks: `utils.test.ts`, `spell-card-verdict.test.ts`, `smart-tracker.test.ts`,
      `tracker-view.test.ts`, `form-swap-attacks.test.ts`, `spells-page.test.tsx`. docs: `docs/MECHANICS.md`
      (Spell-data structured facts) + `docs/AUTOMATION_BACKLOG.md` → S12b/G24.
- [x] **S12c — leveled-spell upcast damage scaling (SHIPPED 2026-06-26, defect C).** A leveled DAMAGE
      spell's chosen slot level was DROPPED before its damage was shown, so the combat card + cast modal
      showed the BASE dice at every slot (Fireball read "8d6" whether cast at 3rd or 9th). Extended the S12b
      precedent from instance counts to DICE counts: `damageDicePerUpcast?: string` (a plain `NdM` per-slot
      increment) on `SrdSpellData` + the pure `scaleUpcastDice(spell, castLevel)` helper (`lib/utils`) — base
      count + increment × steps-above-base, same die face, any flat tail (`"10d6+40"`'s `+40`) preserved.
      Backfilled **60 damage spells** (51 SRD + a 9-spell follow-up sweep — Wall of Ice +2d6 plus the
      bundled pack-side damage spells — found still unscaled by an adversarial enumeration of all
      110 leveled damage spells) (each increment + threshold confirmed against the 2024 wikidot
      "Using a Higher-Level Spell Slot" clause on the wiki; corrected Circle of Death's stale `8d6` → RAW
      `8d8`). The cast modal (`CastLevelModal`) now renders a per-slot `.cl-dmg` chip resolving the scaled dice
      (or `N × dice` for ray-count spells) at each slot level — threaded from BOTH cast surfaces (`SpellsTab`,
      `TurnEconomyProvider` via `getSpellById`). Ray-count spells (Scorching Ray / Magic Missile) keep scaling
      their instance COUNT via `instancesPerUpcast` (no `damageDicePerUpcast`). Override-first preserved.
      Regression: `spell-data-integrity.test.ts` (a RAW slot-total table + face-match lock + ray-count guard),
      `utils.test.ts` (the helper), `cast-level-modal-upcast.test.tsx` (the modal reflects the scaled chip);
      fail-before proven. docs: `docs/MECHANICS.md` + `docs/AUTOMATION_BACKLOG.md` (S12c) +
      `docs/AUTOMATION_COVERAGE.md` (the upcast-damage row → automated).

### B. BG3 can/cannot projection UX

- [x] Persistent disabled-state + inline reason on condition-blocked & depleted-pool cards.
- [x] Project condition consequences (`speedZero`/`autoFailSaves`/`breaksConcentration` from
      `condition-effects.ts`) — consumed by MovementSlider / ThisTurnTracker / LeftHud / `combat-action-view`.
- [x] **"What's limiting you this turn" summary near the action meter — SHIPPED** (the `.turn-limiters`
      banner on the Play meter, `composeTurnLimiters`). Emits attack-disadvantage / speed-0 / auto-fail-saves /
      exhaustion, and now **blocked action economy** (`blockedEconomy` from `condition-effects.blockedSlots` —
      "You can't take Action, Bonus, Reaction (Stunned)", 2026-07-06). `breaksConcentration` stays OUT (owned by
      the concentration banner — DRY); depleted pools / already-spent economy stay out (on the coins/cards —
      golden rule 19).
- [x] **In-combat save / check helper — REMOVED (2026-07-21, owner-ratified).** The Play-surface "Saves & Checks"
      panel (`SavesChecksPanel`) was retired: it duplicated the Stats rail's (`LeftHud`) saves + full skill list +
      passive senses byte-for-byte (same `deriveSavesAndChecks` builder, same numbers), and the owner decided the
      left rail stays the single home for saves/skills/senses on all screens. The shared, locale-free
      `deriveSavesAndChecks` builder (`lib/views/saves-checks-view.ts`) STAYS — `LeftHud` is now its sole consumer
      (golden rule 6, the one home of that math). Originally shipped 2026-07-06 (the row math was first lifted out of
      `LeftHud` into the shared builder so both surfaces could consume it); the parity test it guarded is gone with
      the duplication.
- [x] Multi-action count awareness (Action Surge / Haste) — the B6 per-turn extra-action budget.
- [x] **Reaction-awareness list — SATISFIED** by the shipped PlayTab Reactions section (the availability chip +
      reaction coin already show what reactions you have + whether the economy is spent). No duplicate surface was
      built (golden rule 19). Optional future enhancement (NOT built): a near-meter reaction-readiness chip.

### C. BG3 graphical-style adoption (phone-preview gated)

- [ ] ~~Adopt BG3's graphical style within Illuminated Folio.~~ **SUPERSEDED (owner, 2026-07-02)** by
      the **BG3-Grade Identity Evolution Epic** above — the identity itself is now open for
      evolution, not just style adoption within it. Owner review of visual work continues per
      golden rule 15 (screenshot loop) inside the epic.

### D. Correctness + exposure batch

- [x] **Effective-max-HP helper** — `effectiveMaxHp(doc)` (`lib/aggregate-character.ts`) folds `hp-flat`
      (Aid / Tough / Boon-of-Fortitude) + the standing Aid bonus, now adopted by every `hp.max` reader.
- [x] **Additive item ability-score bonuses** — set-score items (floors) AND additive item bonuses
      (Belt of Dwarvenkind +2 CON, the six +2 Ioun stones) reach ALL combat/cast/display/PDF math through
      the one `effectiveAbilityScores(base, floors, itemBonus, itemCaps)` chokepoint. The additive channel
      (`itemAbilityScoreBonus`/`itemAbilityScoreCap`) is fed ONLY by magic-item-sourced `ability-score`
      grants (filtered on `gref.kind` in the evaluator), so creation/level-up-baked feat & class ASIs can
      NEVER double-count; the bonus folds AFTER the floor and clamps to the per-item resulting-score cap.
- [x] Bardic Inspiration PB→CHA — already correct (`bard.ts`, `bardicInspirationUses: "CHA"`).
- [x] Divine Intervention 2014 → 2024.
- [x] 2024 core-trait lists (Druid armor/weapons, metamagic list+count, EK/AT school + 3rd cantrip, Monk/Rogue tools).
- [x] Additive darkvision stacking.
- [x] Epic Boon L19 framing.
- [x] Pack setting-subclass re-baseline (subclasses present + tested; rows re-verified in the matrix regen).
- [x] **S13 effective-Speed render (defect C, shipped 2026-06-24)** — the combat-header Speed vital,
      PDF, and non-walking sentinels now read the override-first EFFECTIVE walking Speed
      (`effectiveWalkingSpeedFt`: Mobile/Fast-Movement/Roving + Boots ×2 + exhaustion + heavy-armor STR
      penalty); unproficient-armor Disadvantage emits as `AdvantageClause`s. Dead `armorEffects` /
      `effectiveWalkingSpeed` / `exhaustionSpeedReduction` twins DELETED (rule 10).
- [x] **G20 — Stars Twinkling Constellations 1d8 → 2d8 at L10 (defect C, shipped 2026-06-25, S12b)** —
      the Starry-Form Archer/Chalice die was stuck at 1d8 at every level (matrix "Stars Twinkling (wrong)"
      cell). Added `diceByLevel` to the `aura` `ranged-attack`/`heal` effect + `damageDieByLevel` to the
      `form-attack` grant, resolved via the SHARED `pickDiceByLevel`; the die now scales 1d8→2d8 at Druid
      10 on both the rail aura formula and the Archer attack row. The private smart-tracker `pickByLevel`
      was DELETED in favour of the shared helper (rule 10). No team fixture is a Circle-of-Stars Druid.
- [x] **GR7 `advantage-on`/`disadvantage-on` `vs` id-slug normalization (shipped 2026-06-24)** — the
      `vs` field across `src/data/**` held ENGLISH display strings (66 literals — "Death Saving Throws",
      "Charmed", "Dexterity (Stealth) checks", …), a GR7 leak by construction (a display-shaped string
      in code). They never reached the screen — the rail renders the clause's localized SRD-catalogue
      `description` (gated by `rollType`/`mode`, never by `vs`; `hasInitiativeAdvantage` gates on
      `rollType`), so EN display + IT were ALREADY correct and no live leak existed. Normalized every `vs`
      to a stable id-slug (`death-saving-throws`, `charmed`, `stealth`, ability codes `str/int/wis/cha`,
      …; conditions reuse the existing condition ids, mirroring `condition-effects.ts`). EN display is
      byte-identical (the `description` i18n key is positional, NOT `vs`-derived, so it's untouched); IT
      stays the proper translation. New `advantage-vs-slug.guard.test.ts` locks every data `vs` to
      `^[a-z0-9-]+$` so a future English literal fails CI; the species advantage render-parity test pins
      EN-contains-"Charmed" + IT-contains-"Affascinato" + IT≠EN. 6 team fixtures byte-identical.

> **Audit backlog CLOSED (2026-06-25): B1–B8 + S11/S12/S13 + the full G/W series + BUG-6 — 21 merges**
> (`cc377f99`…`20a5492c` on `main`). The multi-week wiki-vs-implementation audit landed every confirmed
> correctness bug (B1 Rage 100-round cap, B2 owning-class tracker scaling, B3 Pact/normal slot keying,
> B4/B7/B8 the effective-scores family, B5 HP-breakdown-by-construction, B6 class-scoped spell DC), the
> Tier-3 primitives (S11/S11b save-based actions, S12/S12b structured + multi-instance + recurrence dice,
> S13 effective-Speed render), and the G/W per-feature series (G1–G25 / W2–W11; BUG-6 metamagic). The
> docs are reconciled to current `main` (this file + `docs/AUTOMATION_BACKLOG.md` + the regrounded
> `docs/AUTOMATION_COVERAGE.md` matrix). The area-spell 2014→2024 prose-corpus sweep (S12/G24 spillover)
> is now **SHIPPED/CLOSED** (`92bacd64`: 8 recurrence-clause spells fixed, 9 verified-left; see
> `docs/AUTOMATION_BACKLOG.md` "Catalogue-wide 2014→2024 area-spell prose audit — SHIPPED"). The half-caster
> multiclass rounding (`multiclass-slots.ts:91`) is now RESOLVED — VERIFIED correct per 2024 RAW
> (no change; see §D / `docs/AUTOMATION_BACKLOG.md`). (W8 cantrip-concentration flags and W9 Dueling
> one-handed scope are now FIXED, and W11 `chargesFormula` owning-class is VERIFIED — all shipped formulas
> character-wide, guard added — see §D below.)

**Confirmed shipped defects (2026-06-24/25 audit — fix + regression test, traces in `docs/AUTOMATION_BACKLOG.md`
→ "Confirmed correctness bugs"):**

- [x] **B1 (CRITICAL — a live user's Barbarian)** — Rage auto-ends at round 10 instead of 100
      (`barbarian.ts:175 maxRounds:10`). FIXED: `maxRounds:100` (10 min ×10 rounds/min) + the comment + every "Rage = 10 rounds" doc-comment across the engine; the pinned `character-store` /
      `turn-round-engine` tests now assert the 100-round cap (countdown 99→1, auto-drop on round 100).
- [x] **B2 (CRITICAL — multiclass shipped defect)** — tracker level-scaling used TOTAL level not
      owning-class level (4 seams: action card OWN tracker / action card CROSS-REFERENCED `costTracker`
      pool / `resolveTrackerTotal` / short-rest). FIXED: all four seams route through the ONE shared
      owning-class-level resolver `featureScalingLevel` (a class feature scales on its owning-class level,
      a feat/race tracker on total), threaded into a new optional
      `resolveTrackerTotal(formula, character, scalingLevel?)` param + the existing
      `resolveTrackerSpec(spec, level)`; the cross-ref seam feeds it the cross-referenced feature's id; the
      rail's inline `classEntryLevel` branch is deleted (rule 10). Table-driven regression
      (`tracker-owning-class-level.test.ts`): Druid 5/Cleric 3 → 2 Wild Shapes on BOTH action card + rail;
      Monk 5/Rogue 3 Focus → 5 AND its Flurry-of-Blows card's cross-referenced Focus pool → 5 (agrees with
      the rail, not 8); Paladin 5/Sorc 3 Lay On Hands → 25; Bard 4/Cleric 2 Bardic does NOT
      short-rest-recover; a feat tracker still bumps on total level; single-class unchanged. Verified
      byte-identical across all 6 single-class team fixtures.
- [x] **B3 (CRITICAL — multiclass shipped defect, Sorlock)** — Pact Magic + shared slots at the same
      level shared ONE usage counter (`session.spellSlots` keyed by level alone), so a Sorlock spending a
      shared L1 slot drained the Pact L1 cell and `paymentAffordable`/`buildCastOptions` summed BOTH pools'
      totals against the single counter → OVER-SPEND across pools. FIXED: one pure `slotUsageKey(slot)`
      helper (`pact-<level>` for a pact slot, `String(level)` for a normal/shared slot — so a legacy
      level-keyed doc resolves the normal pool UNCHANGED, no migration); EVERY `session.spellSlots`
      read + write routes through it — the store `useSpellSlot`/`restoreSpellSlot` (now `(level, pactMagic)`),
      `buildCastOptions`, `paymentAffordable`, the rail + Spells-page + PlayTab slot displays
      (`SlotSummaryVM` gains `pactMagic`, distinct React keys + "P" badge), Font-of-Magic conversions,
      Arcane Recovery, the spell-slot→tracker recovery, and the short rest (now restores ONLY `pact-*`,
      never wiping the normal pool). A bare level-only cast site (reaction / feature commit) resolves its
      pool via `bareSlotIsPact` (normal if one exists, else pact for a pure Warlock). Arcane Recovery's
      `!pactMagic` filter stays (RAW: pact slots aren't Wizard slots) but is no longer load-bearing for the
      collision. Regression `pact-slot-key.test.ts` (Sorc 3 / Warlock 2: spending a shared L1 leaves Pact L1
      at 2; no cross-pool over-spend; legacy `"1"` resolves the normal pool; short rest restores only pact).
      Verified byte-identical across all 6 single-class team fixtures.
- [x] **B4 + B7 (HIGH→LOW — effective-scores family)** — the INVENTORY weapon-row builder + carrying-
      capacity readout computed to-hit / damage / finesse-stat / capacity from RAW `character.abilityScores`,
      while the COMBAT path reads `effectiveAbilityScores` (post-`set-ability-score` grant — Gauntlets of
      Ogre Power → STR 19, Belt of Giant Strength) — so the same weapon showed two different to-hits and
      capacity used raw STR (B4). The SAME class of bug sat in the FORM-attack rows (Wild Shape beast bite /
      Starry Form / Armorer): `resolveActions` passed `charData.abilityScores` (raw) to `resolveFormAttacks`
      while every sibling row passed `ctx.abilityScores` (effective) (B7). FIXED at the ONE shared seam each
      (rule 6): `buildInventoryViewModel` computes `effectiveScores` once via the canonical
      `aggregateCharacterGrants` (`resolveAllGrantSources` — it sees EQUIPPED items) + `effectiveAbilityScores`,
      threads it into `buildWeaponVM` (the 3 raw reads DELETED) and `carryingCapacity`; the B7 caller switches
      its single argument `charData.abilityScores` → `ctx.abilityScores`, matching its siblings exactly.
      Regressions: `inventory-view.test.ts` (Gauntlets → inventory quarterstaff to-hit EQUALS the combat
      to-hit = +8, NOT raw +3; rises by +5; capacity 19×15=285 not 8×15=120; behaviour-preserving with no
      item) + `form-swap-attacks.test.ts` (Gauntlets Moon-druid beast bite +7 not +3). Fail-before proven
      (3→8, +0→5, 120→285, 3→7); behaviour-preserving for the 6 single-class team fixtures (none carries a
      set-ability-score item — `git status content-pack/fixtures/team/` clean).
- [x] **B8 (MODERATE — effective-scores family, cluster close)** — the adversarial follow-up to B4/B7 found
      the SAME defect in four ADDITIVE ability-keyed layers still reading RAW `abilityScores` while their
      sibling base mod uses EFFECTIVE (RAW 2024: a derived bonus scales with the CURRENT score, so a magic
      item raising the keyed ability raises the bonus). FIXED at each call site by passing the SAME effective
      map the base mod already uses (rule 6; the producing functions were already correct): **(1) the
      save-bonus ability layer** — `resolveSaveBonus` (Aura of Protection +CHA, Increased Toughness +WIS) +
      `resolveConcentrationSaveBonus` (Bladesong Focus +INT) fed RAW at all three callers (`characterStore`
      concentration toast, the hand-summed `saveBonusFlat` Aura reduce in `LeftHud` + `character-pdf-view`);
      the raw `charData.abilityScores[b.ability]` reads DELETED, the conformance harness `sheet-dump` now uses
      the full effective channels; **(2) companion AC owner-mod** — `resolveCompanion` at `FeaturesTab` (Steel
      Defender / Eldritch Cannon AC = base + owner INT) fed effective (the companion's OWN fixed scores stay
      RAW by design); **(3) short-rest heal CON preview** — `RestModal` matched the real heal engine's
      effective CON (Amulet of Health); **(4) aura effect-line dice** — `ResourceRail` `auraEffectLine` →
      `resolveAuraDice` (CHA/WIS-keyed aura dice). NO site left raw-by-design; the three excluded sites
      (`feat-prereq` base-score prereqs, the companion-OWN stat block, the transient pre-persist inventory AC)
      stay RAW correctly. Regression: a store-level fail-before (`character-store.test.ts` B8 — Bladesinger +
      Headband, concentration toast `saveBonus` delta 0→4) + per-cluster RAW-vs-EFFECTIVE pins in
      `ability-score-set.test.ts`. Verified byte-identical across all 6 team fixtures (none carries a
      save/companion-keyed boosting item — `git status content-pack/fixtures/team/` clean).
- [x] **B6 (MODERATE — FIXED 2026-06-24)** — class-scoped spell-DC/attack bump hit the wrong spells when
      two casters SHARE an ability. The per-spell DC/attack recompute gated on ability ONLY
      (`diverges = refAbility !== casterAbility`), so a Bard 6 / Sorcerer 3 (both CHA) with Innate Sorcery
      active (`scope:"sorcerer"` +1 DC) dropped the +1 on a Sorcerer-owned spell (`refAbility === casterAbility`
      → no recompute → primary-bard-scoped precomputed DC), and the mirror OVER-counted (a primary Sorcerer's
      Bard-owned spell inherited the +1). Same drop for Rod of the Pact Keeper (`scope:"warlock"`). FIXED at
      the ONE gate in BOTH per-spell seams — `lib/views/spells-view.ts` (the Spells tab + PDF + familiar reuse
      it) AND `lib/smart-tracker.ts` (the combat/action path): the recompute now fires when ability OR owning
      CLASS diverges from the primary, feeding `resolveCastingModifier(entries, owningClassId)` (already wired)
      and the owning ability's effective score (`refAbility ?? casterAbility`, null-guarded). The
      `overrideAbility` VM field KEPT its ability-only meaning (the SpellCard "ability differs" hint reads it);
      only the recompute condition widened. The compendium familiar "Your Save DC" line correctly stays on the
      primary headline (not a per-spell value). Regressions in `spells-view.test.ts` (Rod/warlock, always-on) + `smart-tracker.test.ts` (Innate Sorcery/sorcerer while-active + the mirror no-over-count + a Rod
      analog) — all fail-before/pass-after proven. 6 team fixtures byte-identical (all single-class →
      `owningClassId === classId`, no behavior change).
  - [x] **B6 follow-up — thread `session.activeFeatures` into the spells-view aggregate (FIXED 2026-06-25).**
        `buildSpellsViewModel` called `evaluateGrants(resolveAllGrantSources(character))` WITHOUT the active-feature + bundle-choice context the combat path passes, so the Spells-tab DC/attack reflected NO `while-active`
        casting bump (Innate Sorcery's `scope:"sorcerer"` +1 DC, Robe-of-the-Archmagi-while-active) — a
        cross-surface divergence vs combat (rule 6). FIXED by mirroring the combat `evaluateGrants(...)` call
        EXACTLY (`new Set(session.activeFeatures ?? [])` + `new Map(Object.entries(session.grantBundleChoices ?? {}))`;
        `session` already in scope). The Spells-tab per-card DC now EQUALS the combat-tab `summary.saveDC` for a
        while-active class-scoped bump by construction. Override-first preserved. Regression in `spells-view.test.ts`
        (pure Sorcerer 3 + Acid Splash: Innate Sorcery ACTIVE → DC 15, INACTIVE → 14, AND card DC == combat DC both
        ways) — fail-before proven (pre-fix the ACTIVE card stayed 14). 6 team fixtures byte-identical (no Sorcerer /
        while-active casting bump among them).
  - [x] **B5 — max-HP breakdown tip off by +5 (FIXED 2026-06-24).** `evaluateGrants` now accumulates an
        ATTRIBUTED `hpFlatParts` at the SAME seam `hpFlat` does (inheriting the while-active descent); the
        breakdown maps that list so `breakdownTotal === effectiveMaxHp` by construction. Shipped WITH the dead
        `session.hp.aidBonus` deletion (field + `+aid` term + all codec/sanitize/cache plumbing removed; a
        one-way read-normalization drops a legacy `aidBonus` at the input boundary so it can't double-count
        with the Aid toggle). Regression in `crit-range-hp-flat.test.ts` (fail-before proven: breakdown summed
        to `effectiveMaxHp − 5` + no Aid row). 6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **S11 save-attack exposure (G1 / G14-DC / G15-DC — FIXED 2026-06-24)** — a feature/trait action's
      damage dice + type + save DC lived ONLY in i18n prose (golden-rule-5 leak). `SrdActionDef` gained
      `attack?: ActionAttack` (the damage half) EXTENDING the existing `saveAbility`/`saveDcAbility` save
      pair (REUSED); the shared `applySaveAttackSummary` resolves dice at the action's owning-class/character
      scaling level onto `summary.damage`/`damageType`(`/damageTypes`), DC through the one `featureSaveDc`,
      so the existing chip + facts recipe renders "2d10 Fire · DC N DEX" with no view/i18n change.
      Closed: Dragonborn Breath Weapon (G1), Cleric Divine Spark + (Light) Radiance of the Dawn, Lupin Howl
      (G15-DC). Sear Undead, the +mod/+level additives, and the heal-or-damage toggle deferred to S11b;
      Necrotic Shroud's multi-form DC (G14) is now CLOSED below (2026-06-25). Regression:
      `smart-tracker.test.ts` S11 block (per-feature, ≥2 levels, fail-before proven). 6 team fixtures
      byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **Pack-species Celestial Revelation payloads (G14 / G18 / S11b — FIXED 2026-06-25)** — the signature
      combat payloads were missing (only the L3 tracker + bonus action + Wings fly-speed were modeled).
      **G14:** the 3 Revelation forms are now a `choice-grant-bundle` (its species-keyed bundle,
      re-selectable each Long Rest); each form contributes its once-per-turn flat **+PB** extra-damage rider
      — `damage-rider` GENERALIZED with `amount:"PB"` (no `dice`) + `appliesTo:"attack-or-spell"` (Radiant
      for Heavenly Wings / Inner Radiance, Necrotic for Necrotic Shroud, per RAW), a self-side reminder not
      folded into a weapon row. Heavenly Wings keeps `fly-speed:equal-to-walking`. **G18:** Healing Hands'
      PB×d4 heal — `ActionHeal` gained `diceCount:"PB"` + `dieFace`, multiplied to a concrete "3d4" at
      emission (resolved in BOTH the SRD-feature AND race-trait action loops — the race loop previously
      dropped `action.heal`); roll-entry/display only (golden rule 21). **S11b:** Necrotic Shroud's CHA save
      (DC 8 + CHA + PB → Frightened) is a `free` sub-action gated by the new
      `SrdActionDef.requiresBundleOption` — it surfaces ONLY when Necrotic Shroud is the active form (the
      other two forces force no save). Regression: `species-condition-advantages.test.ts` (G14 forms) +
      `s10-data-wiring.table.test.ts` Family F (G18 heal + S11b save), fail-before proven for each. docs:
      MECHANICS.md (rider `amount:"PB"`/`appliesTo:"attack-or-spell"` + ActionHeal `diceCount` +
      `requiresBundleOption`). 6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **G25 — damage riders ride the Unarmed-Strike row (Zealot Divine Fury — FIXED 2026-06-25).** The
      rider-resolution block lived inline in the carried-weapon loop only; the `unarmed-strike-die` row built
      its summary with NO rider attachment, so a "weapon OR an Unarmed Strike" rider (RAW Divine Fury) never
      reached the Monk/Bard Unarmed Strike. FIXED by factoring it into ONE pure helper
      `resolveAttackDamageRiders(damageRiders, target, character, scores)` fed by BOTH the carried-weapon loop
      AND the unarmed-strike-die row — so an applicable rider rides Unarmed Strike BY CONSTRUCTION (rule 6).
      Scope-respecting: `"melee-weapon"` (weapon OR Unarmed Strike) rides both; `"weapon"` rides weapons only
      (an Unarmed Strike is not a weapon); `"attack-or-spell"` rides neither. Data fix: Divine Fury's
      `appliesTo` `"weapon"` → `"melee-weapon"` (RAW barbarian:path-of-the-zealot — "a weapon OR an Unarmed
      Strike"). Regression `zealot-divine-fury-unarmed.test.ts` (Barbarian-Zealot/Monk raging → the rider on
      the carried Spear AND Unarmed Strike; rage-off → neither; the pure-helper scope matrix), fail-before
      proven for both the engine attachment and the data scope. 6 team fixtures byte-identical.
- [x] **inventory-monk-DEX — the inventory weapon stat ignored the Monk Martial-Arts swap (B4-family — FIXED
      2026-06-25).** The inventory weapon-row called `resolveWeaponStat` (finesse STR-vs-DEX only) but NOT the
      2024 Monk MONK-MELEE stat swap (`weaponScope:"monk-melee"` → DEX for Monk weapons) the COMBAT path
      applies — so a Monk's inventory weapon showed a STR to-hit while combat showed DEX (rule-6 divergence;
      the inventory comment FALSELY claimed it "can never disagree with the Play card"). FIXED by unifying the
      attack-stat math at ONE authority `resolveWeaponAttackStat({weaponType, properties, scores,
weaponAttackAbilities, isMonkMelee})` (`compute.ts`, REPLACING `resolveWeaponStat`) — finesse (by
      MODIFIER, ties→DEX, closing a second latent score-vs-modifier divergence) + the monk-melee swap — fed by
      the combat carried-weapon loop, manifested weapons, AND the inventory row, identical by construction; the
      false comment corrected. Regression `monk-weapon-dex.test.ts` (the live Monk fixture's inventory Spear to-hit EQUALS
      combat = +5 DEX, damage mod +3) + migrated/extended `compute.test.ts` (monk-melee on/off, finesse
      modifier-tie); fail-before proven (inventory Spear +1 STR → +5 DEX). The LIVE Monk fixture's Spear: inventory
      to-hit **+1** (STR −1 + PB 2) → **+5** (DEX +3 + PB 2), now AGREEING with combat (already +5) — a
      correctness fix; the Dagger (finesse, already DEX) unchanged. `.json` byte-identical; the conformance
      dump reads the combat path (already +5) so NO dump update.
- [x] **Three per-feature mechanic additions (G19 / G21 / G23 — FIXED 2026-06-25).** Each fills a declared
      action a feature was missing, reusing the existing action shape and adding the LEAST: **G21 Sentinel** —
      a `reaction` action row (the Guardian Opportunity Attack) mirroring the sibling reaction-feats
      (PAM / Shield Master / Protection); a named card (`sentinel.mechanics.actions.0` en+it = Guardian) +
      a tight new `FEATURE_TRIGGER_PATTERN` ("target other than you") renders the bilingual trigger; Halt's
      Speed-0 stays prose. **G23 Fighter Tactical Mind** — a new `SrdActionDef.checkBonus:{dice,refundOnFail}`
      field on a `free` action on `fighter-tactical-mind` (L2 gate), `costTracker:"fighter-second-wind"`;
      resolves onto `summary.checkBonus` → the PlayTab gloss/accordion "+1d10 to a failed check (refunded if
      it still fails)" (en+it); Tactical Shift stays narrative. **G19 Paladin Lay On Hands** — a new
      `SrdActionDef.cureConditions` field (id-keyed, `fromLevel`-gated): base 5-HP cure-**Poisoned** + L14
      Restoring Touch's six extra conditions (5 HP each), resolved onto `summary.cureOptions` and localized
      via `conditionLabel` + `combat.cureConditions` (en+it); pool never auto-debited (override-first). All
      three pinned in `s10-data-wiring.table.test.ts` Family G (cheapest engine-fact pin, golden rule 13),
      fail-before proven for each. The LIVE Paladin fixture (Oath of Vengeance L3): Lay on Hands now
      exposes `[{poisoned, 5 HP}]` (Restoring Touch correctly gated out at L3). 6 team fixtures byte-identical;
      the conformance dump is round-trip-stable (reads `cureOptions`, no golden file) — NO dump update.
- [x] **S12 spell-dice prose-regex deletion (G2 / G3 / G5 / W2 / W7 — FIXED 2026-06-24)** — spell damage/heal
      dice lived in TWO disagreeing places: structured `damageDice`/`healDice` (the cards) vs an English-prose
      regex (`extractDamageDice` + the heal regex, the combat tab) — a golden-rules-5/7 leak. Populated the
      structured fields on all 126 dice spells + every healer (generated from the regex's own output as the
      ORACLE, SRD-spot-checked), DELETED both regexes, and routed the combat tab to the SAME field; cantrips
      scale via the pure `scaleCantripDice`. One source, identical output by construction. Regressions:
      `spell-damage-bonus-consumer.test.ts` oracle-equality block (Fireball 8d6, Fire Bolt 1d10→3d10→4d10,
      Guiding Bolt 4d6, Cure Wounds 2d8(+mod), flat Heal 70 — fail-before proven by breaking the structured
      read), `spell-card-verdict.test.ts` (the card side), `utils.test.ts` `scaleCantripDice`, +
      `spell-data-integrity` locks (every damage-facet spell has dice; every heal verdict has an amount).
      6 team fixtures byte-identical (`git status content-pack/fixtures/team/` clean).
- [x] **G8 / G9 / G10 combat-feat + Monk-die batch (FIXED 2026-06-24)** — three independent combat mechanics,
      each its own clean grant extension. **G8 (GWM Heavy Weapon Mastery):** the 2024 **+PB damage on a Heavy
      weapon** (NOT the old −5/+10) — `weapon-damage-bonus` gained `scope:"heavy"` + an `amount:"PB"` sentinel
      (`resolveWeaponDamageBonuses` resolves "PB"→PB, honoring `proficiencyBonusOverride`), attached to
      `great-weapon-master`; folds into the Heavy weapon's damage formula on BOTH the combat row + inventory
      card, override-first. **G9 (Heavy Armor Master):** new `flat-damage-reduction` grant kind (a FLAT
      subtraction vs `damage-resistance`'s HALVING) — `{damageTypes, amount:number|"PB", condition?:"wearing-heavy-armor"}`,
      surfaced as a SELF-SIDE informational defenses LINE in the right rail (`deriveFlatDamageReductions`
      resolves "PB" + gates on Heavy armor being worn; the engine subtracts nothing from a modeled foe — golden
      rule 21); REUSABLE (not HAM-hardcoded). **G10 (Monk Martial-Arts die):** the MA die REPLACES a Monk
      weapon's printed die when larger (Shortsword 1d6→1d8 at L5; a 1d4 Monk weapon→1d6 even at L1) — a
      `dieUpgrade` field on the existing `weapon-attack-ability` grant + a shared pure `effectiveWeaponDie`
      (`max(weaponDie, martialArtsDie)`, resolved at the Monk's OWN level, mirroring `effectiveUnarmedStrike`)
      consumed in BOTH weapon resolvers. EN+IT for the new "Riduzione del Danno" / `flatDamageReduction` tokens
      (i18n cascade, IT SRD 5.2.1). Docs: 2 new grant kinds in `docs/MECHANICS.md`; G8/G9/G10 ticked in
      `docs/AUTOMATION_BACKLOG.md`. Regressions (fail-before proven): G8 in `barbarian-rage.test.ts` (Greatsword
      +PB, Handaxe not), G9 in `sheet-view.test.ts` (line ONLY in Heavy armor + PB resolved) + a feat-data pin
      in `feats-prose-sweep.table.test.ts`, G10 in `monk-weapon-dex.test.ts` (Dagger 1d4→1d6, Shortsword
      1d6@L4→1d8@L5, non-Monk weapon unchanged). **The live Monk fixture: its carried Dagger now correctly
      displays 1d6 (MA die beats 1d4 at Monk L3) — a RAW-correct change; the `.json` stays byte-identical and the
      gitignored conformance dump regenerates to 1d6.** All 6 team fixtures byte-identical; none carries GWM or
      Heavy Armor Master, so G8/G9 leave them unchanged.
- [x] **W8 — cantrip `concentration` flags VERIFIED vs the 2024 SRD: ZERO mismatches — FIXED 2026-06-25.**
      Enumerated all 34 level-0 spells (`src/data/spells/cantrips.ts`) and checked each stored `concentration`
      flag against its 2024 wikidot Duration ("starts with 'Concentration'?"). Data was already correct: exactly
      5 cantrips are concentration (blade-ward, dancing-lights, friends, **guidance, resistance** — the latter
      two are NOT 2024 reactions as suspected, they have "Concentration, up to 1 minute" duration); the other 29
      (Fire Bolt / Sacred Flame / Eldritch Blast / Toll the Dead / Mind Sliver / …) are correctly `false`. No
      flag changed, no fixture/dump impact (6 team fixtures byte-identical). Locked by a NEW exhaustive
      `spell-data-integrity` guard pinning the full 34-cantrip table + an exhaustiveness check, so a future
      cantrip can't ship an unverified flag (fail-before proven).
- [x] **Wrong-impl data fixes — Dueling rider on two-handed (W9) FIXED 2026-06-25.** RAW (`feat:dueling`):
      "a Melee weapon in one hand and no other weapons → +2 damage." The +2 rider was scoped `"melee-weapon"`
      so it rode any melee weapon (incl. a Two-Handed Greatsword + a Versatile weapon's two-handed stance). New
      `damage-rider` scope `"one-handed-melee"` gates it to a melee weapon that is NOT Ranged and NOT a
      Two-Handed-PROPERTY weapon (a Versatile weapon's one-handed grip qualifies) and never an Unarmed Strike;
      the "no other weapons"/Shield clause stays informational (engine can't see the live wielded set —
      override-first). Scope-matrix tests pin qualifying vs non-qualifying; 6 team fixtures byte-identical. The
      half-caster multiclass rounding is now VERIFIED correct per 2024 RAW (EN wikidot/PHB "round up" + IT SRD
      5.2.1 "arrotondati per eccesso"); `Math.ceil(level/2)` is right, no change — 2024 reversed the 2014
      round-down. Pinned by `tests/unit/multiclass-slots.test.ts`.
- [x] **W11 — `chargesFormula` owning-class resolution VERIFIED vs the 2024 SRD: all shipped formulas are
      character-wide — VERIFIED 2026-06-25 (Outcome A, no data/behaviour change).** `resolveChargesFormula`
      passes no `scalingLevel`, so a `"level"` term in a free-cast `chargesFormula` would resolve on the TOTAL
      character level (the B2 lesson). Enumerated EVERY shipped formula (5 sites, 3 distinct values) and
      confirmed each scales on a character-WIDE value — never a class-specific level, and none even uses a
      `"level"` token: `greater-mark-of-healing` Cure Wounds = `"PB"`, `forest-gnome` Speak with Animals =
      `"PB"`, `druid-stars-star-map` Guiding Bolt = `"WIS"`, `ranger-fey-wanderer-misty-wanderer` Misty Step =
      `"WIS"`, `artificer-cartographer-mapping-magic` Faerie Fire = `"INT"` (RAW-confirmed via
      `dnd2024.wikidot.com` — "Proficiency Bonus" / "Wisdom modifier" / "Intelligence modifier" per Long Rest).
      The data + total-level resolution are CORRECT; the latent code note holds and stays. Added a GUARD
      (`tracker-owning-class-level.test.ts` → "W11 …") pinning the set (PB×2/WIS×2/INT×1) + an exhaustiveness
      check that NO shipped `chargesFormula` references a `"level"` token — so a future MULTICLASS class-level
      charge formula can't silently ship resolving on total level (it would trip the guard, forcing the B2 fix).
      6 team fixtures byte-identical.
- [x] **D-cleanup cluster (rule-10 dead-code + B3 spillovers) — FIXED 2026-06-24.** Five independent
      cleanups in one commit: **(W10)** removed hardcoded subclass feature ids from the BASE `levels[]` tables
      of bard (Lore), druid (Circle of the Land) AND paladin (Oath of Devotion — caught by the new guard), with
      `base-levels-no-subclass.guard.test.ts` locking the seam for all 13 classes (inert — the apply path
      re-filters by chosen subclass; no behavior change). **(initiativeBonus)** deleted the dead
      `initiativeBonus(dexScore)` FUNCTION (no non-test caller; would bypass effective-scores) AND the legacy
      `CharacterData.initiativeBonus` FIELD (no writer; superseded by `initiativeBonusOverride`), keeping the
      two sanctioned bounded ONE-WAY read-normalizations (sanitize + cache-rehydrate, both on untyped records,
      never re-emitting). **(dev-scenarios)** routed the seeded `sessionSlots` key through `slotUsageKey`.
      **(ResourceRail)** keyed the combat pending-spend PREVIEW by `slotUsageKey` so a Sorlock's same-level
      normal+pact rows no longer both light a pending dot. **(chargesFormula)** a latent code comment + W11
      backlog line that it should resolve on the OWNING-class level if a multiclass magic-item charge formula
      ever references class level (no shipped item triggers it). All 6 team fixtures byte-identical.
- [x] **G7/W4 — Background ASI constrained to the 3 eligible abilities (FIXED 2026-06-24).** The
      creation +2/+1 (or +1/+1/+1) was placeable in ANY of the six abilities; each 2024 background lists
      exactly THREE (Acolyte = INT/WIS/CHA, Soldier = STR/DEX/CON…) → an invalid state was reachable
      (golden-rule-20 violation). Added `abilityOptions: readonly AbilityCode[]` to `SrdBackgroundData`
      and populated all 61 rows from the "Ability Scores:" line on `dnd2024.wikidot.com/background:<id>`
      (16 SRD rows cross-checked against the official 2024 PHB). `BgAsiPicker` disables every tile ∉ the
      selected background's `abilityOptions` (one-line predicate, reusing the existing tile disabled
      state); switching the background clears `bgAsiChoices` so a stale ineligible pick can't linger.
      Regressions: data-integrity (every background has exactly 3 distinct valid `AbilityCode`s + the 16
      SRD vs official PHB, in `background-feat-options.test.ts`) + a render pin (`bg-asi-picker-eligibility.test.tsx`:
      ineligible tiles disabled, eligible enabled) — fail-before proven. The picker is mounted ONLY at
      `/characters/new` and always starts empty: an EXISTING character is never re-run through it (its
      stored ASI is baked into `abilityScores` + kept as an inert codec round-trip record), so the new
      constraint touches NEW picks only. **Two LIVE party sheets predate the constraint and store an
      off-list increase — they load/view/save with it intact, untouched: the live Wizard fixture (Sage → eligible
      CON/INT/WIS, stores INT+DEX) and the live Paladin fixture (Wayfarer → eligible DEX/WIS/CHA, stores
      STR+CHA).** A grandfather-aware guard in `team-fixtures-legal.test.ts` pins every fixture's stored
      ASI ⊆ its background's eligible abilities, with those two off-list picks named in an explicit
      allow-list so the exception can't silently grow. 6 team fixtures byte-identical
      (`git status content-pack/fixtures/team/` clean).
- [x] **BUG-6 + G6/W3 — Metamagic correctness (FIXED 2026-06-24).** Two cast-modal fixes off the same
      predicate. **BUG-6 (one option per cast):** the modal SP-debited Quickened + Distant + Subtle all at
      once; RAW (`dnd2024.wikidot.com/sorcerer:metamagic`) allows ONE primary plus the two options whose text
      grants the explicit exception — **Empowered + Seeking** ("you can use … even if you've already used a
      different Metamagic option"). Added `stacksWithPrimary?: boolean` (TRUE on those two only) to
      `SrdMetamagicOption`; the pure shared reducer `toggleMetamagicSelection` (`lib/cast-options.ts`) makes a
      primary swap in as the SOLE primary (drops any other primary, keeps the stackers), Empowered/Seeking add
      on top; SP = sum of selected. **G6/W3 (cantrips):** dropped the blanket `if (spell.level === 0) return []`
      in `resolveMetamagicForCast`; the per-option `appliesWhen` now decides for cantrips too, gated by new
      structured facts `requiresDamage` (Empowered/Transmuted), `requiresAttack` (Seeking), `excludesCantrip`
      (Extended/Twinned). So Fire Bolt offers Empowered/Quickened/Distant/Seeking/Transmuted, Sacred Flame
      offers Heightened/Careful. The slotless cantrip cast (`SpellsTab.castCantrip` via a new `kind:"cantrip"`
      option + a footer Cast button in `CastLevelModal`) debits the Metamagic SP, spends NO slot, and undoes
      symmetrically. EN+IT: `metamagic.onePrimaryRule` / `metamagic.swapsPrimary` / `combat.cantripCastToast`.
      Regressions (fail-before proven): `cast-options.test.ts` (stacker flagging, per-option cantrip
      applicability, the `toggleMetamagicSelection` swap + SP-sum), `spell-cast-sources.test.ts` (Fire Bolt /
      Sacred Flame cantrip options), `spells-page.test.tsx` (cantrip + Quickened debits SP, no slot, undoes).
      6 team fixtures byte-identical — none is a Sorcerer (`git status content-pack/fixtures/team/` clean).

## Deferred / owner-gated

- **DM toolkit** (constitution §2.9 — optional, complements Owlbear/the in-person table, no battle
  map). **SHIPPED:** the **unified Party section** (`src/features/campaigns/Party.tsx` +
  `party-encounter.tsx`) — ONE in-hub surface, NO overlay/portal (the former full-screen
  `EncounterOverlay` + `PartyDashboard` were deleted, their rendering lifted inline). At rest it is the
  party **overview**: for the DM, each attached member is a LIVE card (AC · HP · passive Perception ·
  saves · senses · speed · conditions, computed from each member's real character doc via the
  `dmReaders` ACL + `getFullCharacter` + `party-stats.ts` over `compute`/`sheet-view`; single source of
  truth, no denormalized copies; progressive disclosure — at-a-glance → expand for saves/passives/senses
  → "Open sheet" reuses `MemberSheetView`); for a player, the denormalized snapshot roster (rules deny
  reading another member's live doc). With a running encounter the SAME section becomes the **inline
  initiative tracker** ("Run encounter" promotes the party: `campaign.encounter` additive state + pure
  reducers `src/features/campaigns/encounter.ts`, DM-typed initiative — NO dice, per-token monster HP,
  HP/conditions clamped, round + turn pointer; persisted DM-only via `firestore.rules`
  `encounterUnchanged()`). The DM gets the full editable tracker; a **player gets the SAME read-only
  live view** (order · AC · current/max HP · conditions · whose turn) — a shared-table feature.
  DM-role transfer also already shipped. **Advanced invite management
  shipped** — the DM can **remove a member** (`removeMember`: `arrayRemove` + `deleteField`, authorized
  by the unconstrained `isDm()` rule) and **lock joins** (an additive DM-only `joinsLocked` flag; a
  locked campaign refuses every self-join via `isSelfJoin`, the no-migration way to kill a leaked invite
  — true code _rotation_ stays out of scope since the invite code IS the campaign doc id). The **invite
  UX was simplified to one industry-standard link-based flow** (owner 2026-06-27): the redundant
  bare-code display was dropped in favour of a single "Invite link" (one shared `CopyButton` primitive
  across DmTools / create-success / the card menu), and the join dialog now accepts a pasted link _or_
  code (`inviteCodeFromInput`) — UI-only, the code/doc-id/`joinCampaign`/rules untouched so live links
  keep working. The **content-sharing lens shipped** (soft reveal, owner 2026-06-27): an additive
  optional `dmOnly?` flag on `SharedNote` lets a DM hold a note hidden from players (a render-level
  filter `isDm || !n.dmOnly` drops it from their list) and reveal it on demand via an Eye/EyeOff toggle
  with a "Hidden from players" badge — the soft, no-rules-change model (trusted-table convenience, not
  adversarial secrecy). **Admin god-mode shipped too** (v0.15.0 — inspect any user's characters,
  bug inbox, cascading `deleteUser`). **DROPPED:** AI session recaps (they belonged to the AI
  assistant, dropped 2026-07-06 — see _Open decisions_). (The shared-character view is already
  covered by the dashboard's "Open sheet".)
- **Guided tour / onboarding (#102)** — first-run walkthrough on top of the shipped glossary tooltips.

## Operating model

A single **orchestrator** delegates each track to scoped agents in **worktrees** — no PRs; each
track converges through `ponytail-review` and merges itself to `main` (the repo standard,
`docs/WORKTREES.md`). The full gate stays green; every schema / derived-value change is **validated
against the 6 team fixtures** (`content-pack/fixtures/team/*.json`). **Every visual change ships curated
screenshots to the owner's phone** (golden rule 15); **behaviour changes are WARNED before deploy**
(live users); **deploys are owner-fired only** (golden rule 22).

## R1–R8 — all shipped

The target-architecture campaign is closed; the design is now present reality, documented in
`docs/ARCHITECTURE.md` (see its "Architecture invariants" section), the history in git.

- **R1 — i18n completeness locks (chrome).** ✅ SHIPPED — throwing missing-key handler, no-`defaultValue` lint rule, en/it parity + no-empty test, locale-sweep render assertion.
- **R2 — `lib/views/` presenter seam + engine de-localization + toasts-as-data.** ✅ SHIPPED — engine-core takes no locale; only `lib/views/*` localizes.
- **R3 — SRD string externalization (`ui/` + `srd/`) + `localizeSrd` + lazy-per-locale load.** ✅ SHIPPED — ~5.5k BiText pairs lifted to `src/i18n/<lang>/{ui,srd}`; `src/data` is ids + mechanics only.
- **R4 — multiclass `classes[]` data model + one-time migration (schema 3).** ✅ SHIPPED — id-first `classes[]` is the sole source of truth; no legacy projection fields; v2→v3 migrated live + the converter deleted.
- **R5 — test fast/slow lanes + table-driven consolidation.** ✅ SHIPPED — Vitest `fast`/`slow` projects; 73 family files collapsed into `describe.each` suites, coverage identical.
- **R6 — heavy-component + `resolveActions` decomposition.** ✅ SHIPPED — the four heavy tabs + the `smart-tracker` monolith are thin orchestrators fed by `lib/views/*`.
- **R7 — dead-code elegance.** ✅ SHIPPED — dead shadcn marker removed; no parallel-component duplication.
- **R8 — doc-debt reconciliation.** ✅ SHIPPED — `docs/ARCHITECTURE.md` corrected to present reality (custom Radix UI, Vite 8, multiclass); the canonical-doc contract enforced.

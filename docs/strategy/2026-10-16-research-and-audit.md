# Research and audit for going public (2026-10-16)

Evidence behind the product brief and re-foundation plan in this folder. Facts are dated; re-check
the market section before any launch announcement. "Unverified" means no primary source was found.

## 1. Market and niche

| Product                  | Price                                                                     | 2024 rules                   | Table / VTT                           | Italian                                                                           | Gap it leaves                                                                       |
| ------------------------ | ------------------------------------------------------------------------- | ---------------------------- | ------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D&D Beyond               | free 6 slots; Hero ~$2.17/mo, Master ~$4.58/mo; books sold separately [1] | native                       | both; Maps VTT free since 2025-09 [2] | Italian PHB as a reading compendium only; builder, sheet and app English-only [3] | no Italian sheet; mobile has no combat tracker; users ask for manual dice entry [4] |
| Sigil (WotC 3D VTT)      | shutting down Oct 2026 [5]                                                | —                            | VTT                                   | —                                                                                 | WotC tools do not always last                                                       |
| Foundry VTT + dnd5e      | one-time licence (price unverified)                                       | partial 2024 automation [6]  | VTT                                   | unverified                                                                        | setup and hosting are hard for beginners [7]                                        |
| Roll20 (+ Demiplane)     | Plus $5.99, Pro $10.99/mo [8]                                             | 2024 sheet since 2024-09 [9] | VTT                                   | unverified                                                                        | lag on the D&D sheets through Aug 2026 [10]                                         |
| Owlbear Rodeo            | free + subscription                                                       | system-agnostic              | VTT                                   | unverified                                                                        | sheets only via extensions that embed D&D Beyond (Sheet from Beyond, Owl20) [11]    |
| Alchemy, Shard           | Shard tiers; Alchemy no WotC content [12][13]                             | third-party / 2024 pack      | VTT                                   | unverified                                                                        | small                                                                               |
| DiceCloud                | free, open source [14]                                                    | unverified                   | sheet                                 | no                                                                                | hard to learn                                                                       |
| Fight Club 5e            | paid app; last update 2023-04 [15]                                        | community XML only           | table, offline                        | unverified                                                                        | looks unmaintained                                                                  |
| Kanka, World Anvil       | free tiers + paid [16][17]                                                | —                            | prep / wiki                           | —                                                                                 | notes are written by hand                                                           |
| Archivist, SessionKeeper | paid after trial [18][19]                                                 | —                            | recap                                 | —                                                                                 | recap only by recording audio + AI                                                  |

**Licensing.** SRD 5.2.1 is CC-BY-4.0, irrevocable, commercial use allowed; one subclass per class,
16 feats, a few backgrounds [20][21]. Required: the attribution sentence naming SRD 5.2.1 and the
licence link. Forbidden: the "D&D" / "Dungeons & Dragons" trademarks and logo, and any non-SRD
content under CC-BY. Non-SRD content falls under the Fan Content Policy: free only, no paywall, no
forced registration, "unofficial" disclaimer [22]. An official Italian SRD 5.2.1 exists since
2025-12-08 (licence of the Italian file not stated on the page) [23]. The Italian 2024 PHB
translation had a public errata after community complaints [24].

**What follows for Folio.**

1. Nobody offers a 2024 sheet in Italian. That is the opening.
2. "Real dice, typed in" is asked for and nobody builds around it.
3. Recaps today need a microphone, AI and a subscription. A recap built from declared actions is
   unique, private and free.
4. Owlbear has an open slot for a native sheet extension.
5. A product that ships only SRD may charge money; one that ships non-SRD content must stay free.
   The name must not contain "D&D".

## 2. Building with agents, 2026 practice

- Instruction files: under ~200 lines, only facts that prevent mistakes; procedures go in skills,
  must-always rules go in hooks [25][26]. Codex merges AGENTS.md root → folder, 32 KiB cap [27].
- Structure: one package unless there is a second deployable; group by feature; deep modules; one
  home per concept; duplicate detection (knip/jscpd) and import-boundary lint in CI [28].
- Tests as spec: behaviour tests, fast-check properties for rules maths, a few Playwright journeys,
  visual baselines generated in CI's own image, Stryker mutation testing on the rules core
  nightly [29][30][31].
- Docs: short ADRs, a glossary, delete stale docs instead of annotating them [32].
- Release: Firebase Hosting preview channels per PR (they share prod data, so point them at the
  emulator or a staging project); flags for dark launches; changesets [33].
- Observability: Sentry free tier with PII stripped [34]; cookieless analytics (Plausible, or
  PostHog EU cookieless) avoid the consent banner under the Garante 2021 cookie guidelines [35][36].
  Firebase/Google Analytics would need consent.
- GDPR (Italy): the owner is controller, Google processor (accept the DPA); Firestore can live in
  the EU but Firebase Auth runs in the US, which the privacy policy must state; digital consent age
  in Italy is 14; self-service export and deletion [37][38].
- Accessibility: the European Accessibility Act likely does not apply (microenterprise, no
  consideration), WCAG 2.2 AA stays the bar [39][40].

## 3. Going public: needs and costs

Firebase cost estimate (us-central1 list prices; EU rates unverified), assuming one 3-hour session a
week in parties of five, ~6,000 reads and ~650 writes per user per month [41][42]:

| Monthly active users | 100 | 1,000 | 10,000  |
| -------------------- | --- | ----- | ------- |
| Estimated bill       | $0  | ~$2–5 | ~$40–60 |

Cost traps found in the code:

- The billing kill-switch (`functions/src/index.ts:390`) cuts billing above a budget the code calls
  £1 (docs say £15; the console value is the truth). At ~1,000 users it would take the app down.
- `firestore.rules` calls `get(/users/{uid})` on every character read and write, about a third of
  the read bill. A custom auth claim removes it.
- The roster listener has no `limit()`.
- One session log is one growing document (`arrayUnion`). It is re-sent whole to every listener
  and will hit the 1 MiB limit.
- Portraits are compressed to 2000 px; 800 px is enough.

Launch needs, against the current repo:

| Need                                      | Today                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Try without an account                    | missing: Google sign-in only, no anonymous mode                                                                                           |
| Landing page                              | missing: `/` redirects to the login                                                                                                       |
| Account deletion and data export          | `deleteUser` exists; self-service status to verify                                                                                        |
| Offline / PWA                             | present (Firestore cache + `vite-plugin-pwa`)                                                                                             |
| Feedback                                  | present: in-app report → public GitHub issue (`docs/BUG_REPORTING.md`)                                                                    |
| Error tracking, analytics                 | missing                                                                                                                                   |
| Privacy policy, SRD attribution           | present in `src/app/routes/legal.tsx`                                                                                                     |
| Terms of service, "unofficial" disclaimer | missing                                                                                                                                   |
| Signup notification                       | emails the owner on every signup: fine for 12 users, noise at 1,000                                                                       |
| Non-SRD content                           | the hosted build includes the private pack, so strangers can reach non-SRD text (`docs/POSITIONING.md`). **This blocks a public launch.** |

## 4. Repo audit: keep, simplify, delete, rebuild

Measured on `origin/main` e34d8bb8: 1,024 files under `src`; `src/lib` holds 318 files, 222 flat at
the top level; 864 test files.

**Keep.**

- The catalogue + typed Grants (127 kinds).
- i18n: 2,944 UI + 7,077 rules keys, equal EN/IT, checked in CI.
- The SRD/pack seam (`tsconfig.srd-only.json`, `just ci-srd-only`).
- Offline/PWA, the in-app bug report, the share links.
- `@axe-core/playwright` checks, the CI/Verify/Deploy split.
- `packages/folio-core` as the future public rules API.
- The token-based design system and the off-system guard (PRs #243/#280/#281).

**Simplify.**

- **One event log.** There are six parallel records today: action-journal, combat-log,
  combat-chronicle, session-log, play/log, plus 13 `combat-*.ts` modules. The engine session owns
  this work.
- **Very large modules.** `smart-tracker.ts` (8,816 lines), `characterStore.ts` (3,352) and about
  60 source files over 1,000 lines. The engine session owns this work.
- **`src/lib`.** Group the flat files by domain (see the architecture doc).
- **Firestore.** Fix the cost traps listed in §3.

**Delete.**

- Planning folders: `docs/superpowers/` (25 files) and `docs/plans/`.
- Stale docs: `PROGRESS.md` (429 KB), `AUTOMATION_HANDOFF.md`, `PROGRAM_STATUS.md`,
  `TEST_PORTFOLIO.md`, the generated automation-coverage JSON (once its guard test moves to
  generating the cases itself).
- `scripts/program-supervisor/` (4,907 lines of process tooling), once its use is checked.
- The 29 `mechanics-*.ts` files (28k lines), after the engine session retires them.
- `automation-compiler/corpus`, which only tests use.

**Rebuild.**

- **One product doc.** `PRODUCT.md`, `PRODUCT_CONSTITUTION.md`, `POSITIONING.md` and `VISION.md`
  contradict each other. VISION says "per noi, non commerciale"; POSITIONING says "GA, head-on vs
  D&D Beyond, premium tier"; PRODUCT says "resource tracking only, d20 Studio carries new work". One
  dated product brief replaces the first three; VISION keeps the interaction decisions.
- **`ARCHITECTURE.md`** (3,573 lines). Rebuild it as a short map plus ADRs.
- **`DESIGN.md`** (3,108 lines). Rebuild it from the tokens.
- **The onboarding funnel.** Landing page → try without an account → keep the character.

## Sources

[1] https://www.dndbeyond.com/en/subscribe · [2] https://www.wargamer.com/dnd/free-vtt-launch ·
[3] https://www.dndbeyond.com/it/italian-translation ·
[4] https://www.dndbeyond.com/forums/d-d-beyond-general/d-d-beyond-feedback/d-d-beyond-mobile-app-feedback ·
[5] https://www.rascal.news/wizards-of-the-coast-shutters-sigil-virtual-tabletop-project-lays-off-30-staff/ ·
[6] https://foundryvtt.com/packages/dnd5e · [7] https://reddit.rtrace.io/r/FoundryVTT/comments/1e1l4zz/im_the_opposite_of_tech_savvy_will_foundry_work ·
[8] https://help.roll20.net/hc/en-us/articles/28498571071255-Roll20-Subscriptions ·
[9] https://blog.roll20.net/posts/dd-2024-character-sheet-and-builder-now-in-beta-on-roll20/ ·
[10] https://app.roll20.net/forum/permalink/12805448/ · [11] https://extensions.owlbear.rodeo/sheet-from-beyond ·
[12] https://www.wargamer.com/dnd/alchemy-rpg-kickstarter · [13] https://www.shardtabletop.com/blog/dampd-2024 ·
[14] https://github.com/ThaumRystra/DiceCloud · [15] https://apps.apple.com/app/id901057473 ·
[16] https://kanka.io/features · [17] https://kindlepreneur.com/world-anvil/ ·
[18] https://myarchivist.ai/dnd-session-recap · [19] https://apps.apple.com/ly/app/sessionkeeper/id6737173822 ·
[20] https://www.dndbeyond.com/resources/1781-systems-reference-document-srd ·
[21] https://www.tribality.com/2025/04/23/dd-system-reference-document-v5-2/ ·
[22] https://company.wizards.com/en/legal/fancontentpolicy · [23] https://www.dndbeyond.com/community-update ·
[24] https://www.smartworld.it/videogiochi/d-e-d-manuale-del-giocatore-2024-italiano.html ·
[25] https://code.claude.com/docs/en/best-practices · [26] https://code.claude.com/docs/en/memory ·
[27] https://learn.chatgpt.com/docs/agent-configuration/agents-md ·
[28] https://codex.danielvaughan.com/2026/06/06/agent-ready-repository-architecture-codebase-patterns-codex-cli-productivity/ ·
[29] https://fast-check.dev/ · [30] https://playwright.dev/docs/test-snapshots ·
[31] https://stryker-mutator.io/docs/stryker-js/incremental/ · [32] https://adr.github.io/ ·
[33] https://firebase.google.com/docs/hosting/test-preview-deploy · [34] https://sentry.io/pricing/ ·
[35] https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/9677876 ·
[36] https://posthog.com/docs/privacy/cookieless-tracking · [37] https://firebase.google.com/support/privacy ·
[38] https://childreninthedigitalworld.twobirds.com/home/italy ·
[39] https://portolano.it/newsletter/portolano-cavallo-inform-digital-ip/italy-transposes-european-accessibility-act-directive-ue-2019882 ·
[40] https://www.w3.org/TR/WCAG22/ · [41] https://firebase.google.com/pricing ·
[42] https://cloud.google.com/firestore/pricing

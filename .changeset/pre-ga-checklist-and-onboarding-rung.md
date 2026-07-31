---
"d20-folio": patch
---

docs(progress): the pre-GA checklist fleshed out + the first-run onboarding rung — owner 2026-07-31

Docs-only capture wave (golden rule 4). Two owner ratifications land in the DDB-parity charter:

- **The pre-GA checklist, fleshed out** (extending the 2026-07-31 GA amendment's bare list), each
  item with its why: Firebase App Check + abuse-resistant quotas (public code → protect quota
  before advertising) · the budget posture decision (replace the £1 SAFE-01 tripwire with a
  consciously raised cap BEFORE any public push — the free tier carries ~100–150 DAU but only
  ~40 fresh installs/day against the 9 MB precache, so one successful advertising day trips the
  kill-switch; SAFE-01 stays ARMED until decided) · the first-load precache trim (scene art →
  cache-on-demand) · the license decision (recommendation on record: AGPL-3.0 at or before GA,
  the hosted-open-source-web-app standard, plus a DCO once external PRs start, preserving
  sole-author relicensing) · legal pages (privacy + GDPR basics + the
  required visible CC-BY-4.0 SRD attribution + terms) · trademark-safe branding ("5e /
  SRD-compatible", never the D&D/WotC marks) · the kept originals (auth breadth · react-router
  triage · backups · observability). The ratified monetization shape is recorded: core free
  forever, self-hosting free, a cheap supporter/premium tier on the hosted instance only,
  SRD-clean build only — mirrored in `docs/POSITIONING.md`'s GA paragraph (pointer intact).
- **First-run onboarding for D&D newcomers — a NEW epic rung** (SOTA shape settled): an
  interactive first-run guided tour (spotlight/coach-marks over the real UI, dismissible,
  replayable from settings), teaching empty states across surfaces, and a "New to D&D?" entry
  path into Quick Start / the Guided wizard + the tooltip/compendium glossary. Explicitly no
  in-app video tutorials — video, if ever, is marketing-side. Slotted in the attack order after
  compendium completeness, before the homebrew ladder's upper rungs.

`CLAUDE.md`'s frontier sentence reconciled to the fleshed-out checklist.

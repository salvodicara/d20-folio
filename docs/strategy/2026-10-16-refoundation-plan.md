# Re-foundation plan (2026-10-16)

How to turn d20 Folio from the owner's group tool into a product that strangers use, without ever
breaking live characters. Product decisions: [product brief](2026-10-16-product-brief.md). Target
shape: [target architecture](2026-10-16-target-architecture.md).

## Rules for every phase

- **Shippable on its own.** Each phase ends on `main`, live, with the app working throughout. No
  phase waits for a later one; that was the v2 mistake.
- **Live data stays safe.** Any change to stored data goes snapshot → dry-run → idempotent apply →
  verify. The agent does the snapshot and the dry-run; **each apply to live data needs the owner's
  yes**. The schema never downgrades, and old documents keep reading until a migration has run.
- **Owner gates.** Push to `main`, deploy and release need the owner's word. So does any spend,
  including raising the budget cap, and any visible change (shown first as screenshots).
- **Ownership stays.** The engine session owns `src/lib/play` and `characterStore`. The rules session
  owns rules data, grants and activities. This plan sequences their work; it does not take it over.
  Each phase below is split into sessions only after the owner approves it.

## Phases

| #   | Phase                         | What ships                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner yes needed for                                                                       |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0   | **Safe ground**               | Take the private pack out of the public bundle: allowlisted accounts load it at runtime from protected Storage, and the SRD-only build is the public one. Set a realistic budget cap with alerts at 50/90/100% (today's £1 kill-switch would switch the app off at ~1,000 users). Add error tracking with personal data stripped. Merge the docs into one brief and delete the stale ones (list in the audit, §4). Cut CLAUDE.md to the facts, with procedures moved into skills. | the budget figure; deploying the pack change (the owner's group must still see everything) |
| 1   | **Look and brand**            | The owner picks one of three directions on the real combat screen. The redesign session then restarts from that pick, reusing the tokens and the off-system guard from #243. Order: Play/combat, then sheet, creation, campaign, login. Phone and laptop are equal.                                                                                                                                                                                                               | the direction; every screen's screenshots                                                  |
| 2   | **Every number explained**    | One breakdown model for every derived value. Many already exist (about 55 files show breakdowns); this makes it universal, with the same tap-to-open pattern everywhere. A plain-language glossary of rule terms in EN and IT, written for beginners.                                                                                                                                                                                                                             | the explanation style (one example screen)                                                 |
| 3   | **The session writes itself** | The engine session's log-as-record work (VISION phase 1) becomes one campaign log. Every member's actions land there, including members who don't use the app, because the DM declares for them. Output: a per-round report and a "copy for AI" export. Storage moves to one document per event, so the 1 MiB growing document goes away.                                                                                                                                         | the migration apply                                                                        |
| 4   | **Homebrew for everything**   | Editors for spells, features, items, monsters and later subclasses and classes, on the same Grants. "Bring your own pack" import into one's own account. Sharing stays inside a campaign.                                                                                                                                                                                                                                                                                         | the editor's look                                                                          |
| 5   | **Ready for strangers**       | Landing page in EN/IT. Google sign-in plus an email link. Self-service export and account deletion. Privacy policy (Auth runs in the US), terms, the "unofficial" line. Cookieless analytics and in-app feedback. Firestore cost fixes: custom claims instead of `get()` in rules, a roster `limit()`, 800 px portraits. Signup email to the owner becomes a daily digest. Custom domain. A locale registry, so adding a third language is a data change.                         | legal texts; the domain purchase; deploy                                                   |
| 6   | **Launch beyond friends**     | A second naming round, then the final name. An illustrated guide and short videos. An Owlbear Rodeo extension that opens a character's Folio sheet. A Ko-fi link. A community channel. Announce first to Italian communities, then international ones.                                                                                                                                                                                                                            | name; announcement; any spend                                                              |

Phases 0 and 1 can run in parallel: 0 is plumbing, 1 is visual. Phases 2–4 overlap with the
engine and rules sessions' current work. Phase 5 must be complete before phase 6.

## What we stop doing

- **Process tooling nobody reads:** the program supervisor (4,907 lines), the superpowers plans, and
  `PROGRESS.md` as a log. The repository stays the memory, kept short.
- **Gates that rerun the same checks.** Each check lives in one place: the pre-commit hook for format
  and changeset, CI for everything else. A slow, nightly lane runs mutation tests on the rules core.

## Open decisions (asked one at a time)

1. Visual direction: A, B or C. The prototypes are ready.
2. Budget cap, for example €20/month, with alerts at €10 and €18.
3. Staging Firebase project. Recommendation: **keep it**. Hosting preview channels share production
   data, so per-PR previews belong on staging. It costs nothing on the free plan.
4. Final name (phase 6).

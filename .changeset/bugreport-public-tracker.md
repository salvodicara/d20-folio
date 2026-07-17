---
"d20-folio": patch
---

chore(functions): privacy-strip the public bug-report issue + single-source the tracker repo. Ahead
of the repo going public, `onBugReportCreated` now files a PRIVACY-STRIPPED issue body: the
user-written title/description, coarse metadata (type/severity/screen/locale), the Firestore doc id
as a non-identifying `Report ref`, and an ALLOWLISTED debug slice (appVersion/gitSha/mode/userAgent/
viewport/dpr/theme/locale/online/serviceWorker/capturedAt — any future debug field defaults to
private). The reporter uid, character/campaign ids, route paths, the recent-error ring, and the
screenshot (its URL embeds the uid; its pixels can show a character sheet) no longer reach the
issue — they stay in the Firestore doc the `/admin` inbox reads, and the body says "Reporter details
are retained privately." The issue target stays the `GITHUB_REPO` secret; its fallback now lives
ONCE as `DEFAULT_REPO` in `issue-format.ts` (index.ts's duplicate deleted). Client side, the admin
inbox's closed-issue lookup reads a shared exported `GITHUB_REPO` constant, overridable per-build
via `VITE_GITHUB_REPO`, defaulting to the production tracker. The crash-screen prefill no longer
bypasses the strip: machine-authored text stopped carrying the crash route entirely (admins still
get it privately via `debugContext`) and the error headline/stack are redacted of Firestore
`users/…` doc paths and secret-carrying `/characters/…` · `/campaigns/…` · `/join/…` (invite-code
capability token) route segments before they
enter the user-editable title/description. The `screen:` label is capped to GitHub's 50-char label
limit so a hand-crafted doc can't 400 `issues.create`. Runbook updated in
`docs/BUG_REPORTING.md`; the strip contract is pinned by `functions/src/issue-format.test.ts` and
`tests/unit/report-open.test.ts` (and the crash-entry wiring in
`tests/unit/error-boundary.test.tsx`, which now asserts the route is ABSENT from the prefill).

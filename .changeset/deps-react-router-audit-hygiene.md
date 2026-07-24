---
"d20-folio": patch
---

fix(deps): bump react-router to 7.18.1 (clears the 4 audit advisories, triaged non-exploitable)

Bumped `react-router` 7.15.1 → ^7.18.1, clearing the 4 open pnpm-audit advisories
(GHSA-wrjc-x8rr-h8h6, GHSA-h8fp-f39c-q6mh, GHSA-337j-9hxr-rhxg, GHSA-chx6-hx7r-mcp5) left out of
scope by the 2026-07-24 Dependabot remediation. Triage proved none are exploitable against this
pure client-side Data-Mode SPA (no RSC / no SSR-hydration / no Framework-mode server; the
open-redirect advisory has no attacker-controlled navigation sink) — this is a hygiene bump, not a
risk fix. `pnpm audit` now reports zero known vulnerabilities.

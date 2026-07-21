---
"d20-folio": patch
---

Remediated every open Dependabot alert across both packages with the minimal, safest change — scoped
version overrides, and no new dependency introduced. Every override is an exact same-major patched
pin (so no consumer is cross-major re-resolved) EXCEPT `uuid`, a necessary cross-major bump: advisory
GHSA-w5hq-g745-h8pq (uuid `<11.1.1`) has no same-major fix — 11.1.1 is the only patched release — and
the bump is API-safe because every consumer only calls `uuid.vX()` (verified, gate green). Root (pnpm)
pinned `vite` to the `~8.0.16` patched line and overrode the transitive `websocket-driver`, `form-data`,
`protobufjs`, `undici`, `@babel/core`, `uuid`, `js-yaml`, and `brace-expansion` chains; the standalone
Cloud Functions package bumped `nodemailer` to `^9.0.1` (the only patched line) and overrode its
transitive `form-data`, `protobufjs`, `uuid`, `brace-expansion`, and `body-parser`. Both audits go to
zero known vulnerabilities; the deployed Firebase client and the Cloud Functions signup email are
behavior-for-behavior unchanged.

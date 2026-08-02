---
"d20-folio": patch
---

Firebase App Check client scaffold (pre-GA hardening): `initializeAppCheck` +
`ReCaptchaV3Provider` wired into `src/lib/firebase.ts`, strictly gated on
`VITE_APPCHECK_SITE_KEY` being a non-empty string, with a `VITE_APPCHECK_DEBUG`
debug-token escape hatch for dev/CI/e2e — no key (every env today) means zero
new network calls. Console rollout steps documented in `docs/BUG_REPORTING.md`
→ "App Check rollout runbook".

---
"d20-folio": patch
---

test(auth): replace the dead app-shell e2e with a running LoginPage render test

`tests/e2e/app-shell.spec.ts` was permanently `test.skip()`'d (its whole describe, unconditional) —
it asserted login behaviour the dev-bypass makes unreachable in e2e, so it never executed in any
lane. Deleted it and added `tests/unit/login-page.test.tsx`: a thin jsdom render test that actually
runs, pinning that the pre-auth splash renders its Google sign-in CTA, wires the click to `signIn`,
and surfaces an auth error with a retry. The login surface previously had no running witness
(`auth-guard` only stubs the route).

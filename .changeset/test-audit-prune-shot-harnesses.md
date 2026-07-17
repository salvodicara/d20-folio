---
"d20-folio": patch
---

chore(tests): prune the spent one-mission screenshot harnesses from the e2e tree

The env-gated `_*-shots.spec.ts` capture harnesses are skipped in every lane (they assert nothing
the gate reads and add zero coverage) and each was built to preview ONE shipped mission. 52 spent
one-off captures are removed — git history is the archive (golden rule 10). The four standing,
general, non-mission-bound harnesses stay: `_polish-shots` (manifest-driven full-surface sweep),
`_identity-shots` (identity/theme surface sweep, de-missioned from the former `_bg3-identity-shots`),
`_scenario-shots` (mechanic-injection capture), and `_perf-probe` (runtime web-vitals probe).
`docs/CONTRIBUTING.md` now records the convention so mission-specific captures are `git rm`'d before
merge rather than accumulating on `main`.

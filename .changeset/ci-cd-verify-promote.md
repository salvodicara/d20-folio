---
"d20-folio": patch
---

CI/CD re-architecture — verify ambiently, promote on demand: every merge is now fully verified remotely (parallel SRD-only gate + a new composed Verify workflow running the full Playwright matrix sharded 8×, ~10 min instead of 48), deploys promote an already-verified commit (~6 min instead of 59) and refuse a composition the pack has drifted past, and the test policy is codified — every test must name the regression it catches.

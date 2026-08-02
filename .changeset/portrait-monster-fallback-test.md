---
"d20-folio": patch
---

Regression test pinning the Portrait primitive's fallback for a faceless monster: with
no uploaded art it renders the deterministic tinted-initial monogram (the same letter
fallback the party heroes use), and an uploaded portrait still wins — override-first.

---
---

Add `scripts/audit-codec-loss.ts`, the read-only ADR-0009 dry-run: it audits portable exports (byte-identity), a tagged migration directory, or a fresh production export written in that same format, and reports counts, hashed findings and lost key paths only.

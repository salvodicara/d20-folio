---
"d20-folio": patch
---

Codified an owner ruling into the golden rules (rule 2): the repo boundary is not a scope boundary.
Every change is reasoned against the full D&D 2024 game — the wikidot source, the BG3 reference, and
the private content pack's non-SRD content — never just the SRD subset the public repo ships, and when
a change touches the pack it is updated in the same unit of work rather than deferred (or, when the
pack is concurrently frozen by another worktree, tracked as an explicit handoff run the moment the
pack is workable — never a silent deferral). Internal contributor-process rule; no user-facing
behavior change.

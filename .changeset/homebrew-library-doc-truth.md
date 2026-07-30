---
"d20-folio": patch
---

docs: the homebrew-library architecture entry + the DDB-parity attack-order truth

`docs/ARCHITECTURE.md` gains "The account-level homebrew library
(`users/{uid}/library/index`)" beside the `combat/state` singleton — the one-doc rationale,
the model/IO/state/listener layering (including WHY the store's write seam is injected), and
its consumers; the listener-contract bullet now names the shell mount and the mounted-once
rule.

Tracking-doc reconciliation (golden rule 16 — a doc that disagrees with the code is a bug):
the homebrew ladder's rung (a) is marked SHIPPED with its charter detail, and the three lines
that still called the 2024-DMG difficulty calculator open — the bestiary section's "open half
of the flagship", the encounter-picker "NEXT:", and the sequencing amendment — now state what
the code actually does (difficulty calc + companions shipped 2026-07-25). The attack-order head
advances to `quickbuild`, with rung (b) campaign sharing queued behind it; `CLAUDE.md`'s
frontier sentence and `PROGRESS.md`'s status header match.

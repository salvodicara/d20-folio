---
"d20-folio": patch
---

test(e2e): open the notes/sessions disclosures in the CAMPAIGN-NOTES-UX journey

The campaigns-flow CAMPAIGN-NOTES-UX spec drove the long "Rumors" note clamp and the
Session 5 recap directly, but both now live inside the collapsible `SectionPanel`
detail (the owner-ratified fixed-panel + "All notes" / "Older sessions" disclosure
model) — only the most-recent pinned note and the latest session sit in the always-
visible fixed panel. The collapsed detail clipped the targets, so the "Show more"
click resolved onto the overlapping disclosure chevron / sticky topbar and timed out.
The spec now reveals the "All notes" and "Older sessions" details before driving their
clamps — a stale-selector fix (the UI legitimately reorganized), no product change.

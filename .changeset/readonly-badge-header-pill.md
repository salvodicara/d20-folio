---
"d20-folio": patch
---

fix(sheet): relocate the read-only marker off its own full-width row and onto the sheet header's identity line — one compact carved pill (an eye glyph + "Read-only" / "Sola lettura", `role="status"`) riding the level-chip's owner-only slot, so a read-only sheet is now structurally identical to the editable one. The single `.ro-pill` lives inside `CombatHeader`, so every read-only surface renders it in the SAME place through the shared cockpit — the public `/view` share sheet, the DM/member sheet, and the admin sheet — and each of those wrappers sheds its old `.toolbar-chip` row (the public view now owns no chrome at all; the member/admin views keep only their back button). Both themes, both locales, a11y-announced (owner 2026-07-31).

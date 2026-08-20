---
"d20-folio": minor
---

Every legacy vitals WRITE path now rides the canonical engine world: hp/temp/death-track edits, damage entries, the at-zero interrupt, slot and tracker pip taps, the slot/pool composite recoveries, exhaustion pips, the MechanicsCommand CAS conversions and manual condition chips all plan against the persisted world first and commit world + legacy session fields in one journal-mirrored store update — fail-closed to the exact legacy write when the world is absent or cannot express the transition — with journal-reverse undo for the committed families and a transitions-only death-track mirror closing the last mirror gap before the vitals arbitration flip.

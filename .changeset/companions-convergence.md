---
"d20-folio": patch
---

Companions convergence: the surface manifest gains four Companions rows — the
rail section at rest, the familiar stat-block modal, the familiar form picker
(all on the chain-master scenario, which now seeds an active Imp familiar via
the new `sessionFamiliar` scenario field), and the grant-companion stat-block
modal (pack Battle Smith) — bringing the surfaces under the a11y + locale
sweeps. The rail derives its companion rows AND modal views from ONE presenter
pass over the shared card views, the spent
`_companions-shots` throwaway harness is removed (the four standing harnesses
are the cap), the engine changeset's "all undoable" claim is corrected
(`setFamiliarDismissed` is a symmetric toggle), and the IT familiar rules line
takes the "Azione Bonus" register.

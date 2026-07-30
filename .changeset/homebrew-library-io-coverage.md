---
"d20-folio": patch
---

test(lib): pin the homebrew-library IO seam (strip-undefined write + defensive read)

`tests/unit/library-io.test.ts` covers the two bug classes `library-io` exists to
prevent, with `firebase/firestore` mocked (no emulator, no API key): the write goes
through `stripUndefined` (domain rule D1 — a homebrew item is nearly all optional
fields, and an `undefined` reaching Firestore throws and silently loses the save), and
the read DROPS malformed entries instead of crashing the surfaces (absent doc, missing
`entries`, null/string rows, empty id, unknown kind, non-numeric stamp, itemless row).
The strip assertion is mutation-proved.

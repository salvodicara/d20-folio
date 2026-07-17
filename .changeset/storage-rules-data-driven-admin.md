---
"d20-folio": patch
---

Storage rules: the bug-report screenshot admin override is now data-driven — the same `/users/{uid}.role == "admin"` field the client gate and the Firestore rules read, resolved via the cross-service `firestore.get()` — replacing the hardcoded admin uid. `pnpm test:rules` now also boots the Storage emulator and pins the full matrix (owner read/create, peer denied, role-admin read+delete, role revocation revokes access).

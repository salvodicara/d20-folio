---
---

Fix two unit-suite repository guards for the stage 4 combat lease/io modules: pin `src/lib/combat-io.ts` in the randomness allowlist and mock `firebase/firestore` in `combat-lease.test.ts` so it stays Firebase-free in CI.

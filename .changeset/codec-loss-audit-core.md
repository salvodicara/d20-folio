---
---

Add the pure codec-loss audit (`scripts/lib/codec-loss-audit.ts`): every stored document family is run through its real reader and writer and classified as byte-identical, equal, loss (with the lost key paths) or quarantine (typed code); `combat-state-codec` exports its closed world of keys.

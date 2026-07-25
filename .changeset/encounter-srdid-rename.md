---
"d20-folio": minor
---

feat(campaign): the encounter monster group gains an optional, additive `srdId` bestiary reference and a `setMonsterName` reducer — the foundation for the DM statblock disclosure and the picker's rename-in-place. `addMonster` stores `srdId` only when present (the minimal-doc `notes` pattern); every pre-picker doc and the 6 live fixtures load unchanged.

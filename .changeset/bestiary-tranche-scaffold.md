---
"d20-folio": patch
---

Bestiary scaffold: the pack monster corpus and its i18n move to a parallel-safe
alphabetical tranche layout (`content-pack/data/monsters/{a-b…t-z}.ts` + a
pre-wired barrel; `content-pack/i18n/{en,it}/srd/monsters/<tranche>.json`
fragments). The `@pack/monsters` alias now targets the tranche barrel, and the
lazy loader, the build-time leak/parity check, and the composed IT-name guard all
merge the per-tranche i18n fragments. No user-visible change — the corpus stays
lazy and behavior-preserving.

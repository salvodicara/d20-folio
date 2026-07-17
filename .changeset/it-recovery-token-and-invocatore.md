---
"d20-folio": patch
---

fix(i18n): the compendium mechanics panel localizes its tracker tokens; the Evoker is "Invocatore"

Two Italian-locale defects cleared. The compendium feature-detail mechanics grid printed the raw
engine recovery token ("Long-Rest") in both locales and a hardcoded English "Pool" literal: the
recovery code now resolves through one shared presenter (`localizeTrackerRecovery`, the sibling of
`localizeTrackerUnit`) that the Features tab, the feat spec, and the feature spec all route
through, and the pool flag reads as a localized "Yes"/"Sì". The raw-token class is pinned by unit
regressions plus a locale-agnostic raw-engine-token check in the locale-sweep e2e, run in BOTH
locale passes — a raw data token that never passes through `t()` leaks in every locale, and no
key-based i18n lock can catch it. And the Wizard Evoker
subclass's Italian name is corrected to the official IT SRD 5.2.1 "Invocatore" — matching the
app's own "Invocazione" school term ("Evocazione" is Conjuration).

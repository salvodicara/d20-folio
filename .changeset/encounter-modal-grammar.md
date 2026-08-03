---
"d20-folio": minor
---

Fix the unreadable compact encounter chip in the light theme and restore the end-encounter
Chronicle dialog's canonical frame margins, scrolling, and footer spacing. Harden every shared modal
against the same drift by requiring a guarded body primitive at each `ModalShell` call site. Recast
the active encounter summary as a struck folio dossier with an attached Chronicle timeline, and smooth
initiative reordering without compromising reduced motion.

Replace grouped monster tokens with independently targetable creature instances and unify encounter
attacks, saves, damage, healing, multi-target effects, and conditions behind one compact resolution
surface. Apply reviewed monster effects as one transaction only after the action economy commits, retain
explicit homebrew/target overrides, and let the DM reverse both HP and condition mistakes from the live
Chronicle.

Resolve slot level and upcast scaling before target choice, retain exact action provenance in the Chronicle,
support condition cures, group/full/pool healing, and deliver peer-player effects through an idempotent
owner-applied queue. Replace the light tome leaf with the owner-supplied PROMPT_28 parchment source.

Use the same locale-free combat plan for encounter and self-owned solo consequences. Resolve typed damage
defenses, PC/monster Temporary HP, linked self-healing, Grapple/Shove conditions and recurring spell
actions without spell-name branches. Persistent effects retain their original cast level, spend no second
slot, and restore concentration/active state atomically on undo. Keep one-roll spell bonuses separate from
per-instance formulas so the reviewed resolution applies them exactly once across a multi-instance cast.
Model spell miss/save damage outcomes as grants, letting Potent Cantrip resolve half damage without a
feature- or spell-name branch. Automate linked self-healing and maximized spell-healing through the same
cast-level-aware resolver for Blessed Healer and Supreme Healing.

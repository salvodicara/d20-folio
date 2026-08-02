---
"d20-folio": patch
---

Fix the `campaign-monster-statblock` E2E surface prepare so the a11y (and visual)
suites reliably open the DM statblock modal. The combat-chronicle feed now renders
monster-name target chips, so the old `getByRole("button", { name: /goblin/ })`
lookup grabbed a feed chip, left the DM disclosure closed, and the un-clickable
Statblock click — which had no action timeout — hung the surface until the test
timed out (a false a11y red, not a real contrast defect: the statblock modal has
zero serious/critical axe violations). Scope the toggle to the combatant `<li>` via
`.party-head-toggle` and bound every click. Test-harness only — no app or token
change.

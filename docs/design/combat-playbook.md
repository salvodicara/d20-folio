# Combat playbook (generated): design note, 2026-10-16

The Play tab's "Combat algorithm" becomes a playbook the app **generates** from the character's
actions: "on your turn, usually: move, then X; if Y, do Z". Deterministic, no AI, every line says
why. This note fixes the data shape; the Phase 1 redesign owns the UI.

**Prior art, copied.** D&D Beyond's Actions tab filters by economy (Attack, Action, Bonus Action,
Reaction, Other, Limited Use). Foundry dnd5e groups items by activation type, with favourites on
top. BG3 shows action, bonus and movement as separate resources and greys out what is spent. We keep
the same economy grouping and the spent/blocked state. **Beaten on clarity:** they list what is
_possible_; none says what to _choose_ or why. Each step here carries a trigger and reasons.

## Where it lives

`src/domains/play/playbook/` — the target architecture's play domain (turn economy). It is not
`packages/folio-core`: it reads today's action resolver (`resolveActions`) in `src/lib`, and core
may import nothing from `src`. Nothing goes into flat `src/lib`.

## Inputs

- **Actions**: `resolveActions(character)`, typed by economy (`action`, `bonus`, `reaction`, `free`),
  with their cost (spell slot level, tracker id and amount), concentration, area, healing, targeting,
  reaction trigger token, weapon mastery and once-per-turn riders.
- **Character facts**: attacks per Attack action, trackers left and their recovery, slots left,
  concentration held, Bloodied (from HP), Incapacitated (effective conditions).
- **Context** (optional, all fields unknown by default): round, ally down, enemies grouped, tough
  foe, enemy adjacent, can hide, target far, not moving, Bloodied override.

## Output

`buildCombatPlaybook(character, context?, overrides?) → Playbook`, in `types.ts`:

- `steps`: ordered by slot (movement, action, bonus, free, reaction), then priority. Each step has an
  `id` (`<slot>:<rule>`), `rule`, `options` (action ids best first, each with `spend`, turn-wide
  `limits` and `available`), `when` (trigger), `applies` (true, false or unknown against the
  context), `status` (ready, spent, blocked) and `why` (key, params, source, optional `when`).
- `plan`: one concrete turn for the context. Ready steps whose trigger applies, highest priority
  first, one per slot, at most one concentration spell and one slot spell per turn (SRD 5.2.1).
  Losers are listed in `skipped` with the reason.
- `authored`: the stored `combatAlgorithm`, untouched.

**Priority** is the rule's fixed number, +50 for a bonus-action step (it keeps the action free),
+1000 for a player pin: heal a downed ally 900, self-heal when Bloodied 800, area spell when 3+
enemies are grouped / limited burst on a tough foe 700, control a tough foe 650, concentration
opener in round 1 550, default attack 500, Steady Aim 460, Disengage 450, Hide 440, Dash 430,
defensive reaction 400, opportunity attack 300, movement 100. The default attack is the weapon or
damage cantrip with the best average damage per Attack action (Extra Attack counted); a tie goes to
the one that works at range.

## Overrides and stored data

The player can **hide** a step, **pin** steps (first in their slot, in pin order) and **prefer** an
option inside a step, all keyed by step id and action id, so they survive regeneration. A later PR
stores them as one optional build field (absent means none: reader-compatible, no migration). The
hand-written `combatAlgorithm` stays as it is and is returned as `authored`. A character who wrote
one keeps seeing it first; the generated playbook sits beside it until the player chooses.

## Guarantees

- Same character, context and overrides give a deep-equal, JSON-plain playbook.
- Every step has at least one reason; every reason is an id with params and a source (feature,
  spell, weapon or rule id). The view localizes keys in English and Italian.
- Unknown context never triggers a step: only "always" steps and known-true triggers enter the
  plan. A reaction enters it as the one to hold, ready for its trigger.
- Known gap: Sneak Attack's condition (Advantage or an ally next to the target) is a small table in
  the core until the rider grant declares it.

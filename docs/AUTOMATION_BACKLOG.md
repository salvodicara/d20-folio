# d20-folio Automation Backlog — the OPEN gap frontier

> **This doc is the SINGLE HOME of the open automation/interaction-cost frontier, as tick-boxes.**
> The per-entity coverage MATRIX (what is modeled, per feature/feat/trait) lives in
> `docs/AUTOMATION_COVERAGE.md`; the grant taxonomy that defines "modeled" lives in
> `docs/MECHANICS.md`; per-`Grant`-kind exposure is code-enforced by
> `tests/unit/grant-kind-exposure.guard.test.ts`. Keep those four boundaries clean — do not
> re-state the matrix or the per-kind table here.

## The acceptance bar — the minimum-interaction doctrine

> **The doctrine (owner, 2026-06-12, verbatim):** _"You need to think as a user and for each
> mechanic think 'what do I have to do to track/take care/enforce this?' — the answer should
> ALWAYS be that the user does the minimum interaction, the app takes care of everything, always
> allowing override."_

A mechanic counts as **automated** ONLY when interaction is **minimal-intent-only** — ONE tap
expresses the intent and ALL consequences flow (stats, AC, speed, damage formulas, advantage notes,
resource decrement, duration / end condition), with override always available. **"Modeled as a
Grant" is necessary but NOT sufficient:** a grant whose consumer is dead code, a rider that is
computed but rendered nowhere, or an effect gated on a SECOND manual toggle is **not automated**.
The canonical example: activating **Rage** should auto-light the rail chip, its stat/damage effects
flow while active, and one tap ends it — not three interactions plus a damage rider that never
appears on a weapon row.

> The obsolete "88 gaps / Wave 1 closed / Wave 2 open" framing that earlier organized this doc is
> **dead** and removed — its scope was fully shipped or reconciled. The current truth is the
> interaction-cost frontier below.

### Defect-class taxonomy (how each open item is tagged)

| Class | Name                                   | Definition                                                                                                                                                                                                                                                                               |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Activatable state, effects don't flow  | Activation is double-entry (use the action/cast the spell, then SEPARATELY toggle the rail chip), OR the effects don't propagate while active, OR no toggle exists at all (prose-only state).                                                                                            |
| **B** | Triggered consequence left to memory   | At the moment of use the user must remember/apply something the app already knows: a rider invisible on the action card, a resource never auto-debited, a missing prompt, an engine consumer with zero callers.                                                                          |
| **C** | Derived value the user must compute    | A number the rules fully determine is not folded into any displayed value (heal formulas, escalating DCs, set-score items vs attack math, speed-0 from conditions).                                                                                                                      |
| **D** | Duration/expiry/once-per-turn = memory | Cadence that would otherwise live in the player's head — 1-min/10-min/1-hour effects, "until your next turn", round-1 states, once-per-turn gates (Sneak Attack). The A2 cadence engine now models per-turn reset + round timers + round-1 clauses; residual gaps are unwired durations. |
| **E** | Double-entry / drift                   | The same fact maintained in two places (cast a spell AND tick its tracker; a rider modeled twice; concentration name vs rail toggle vs condition list).                                                                                                                                  |

---

## The 2024 core-rules SYSTEM audit — the ranked defect ledger (RA, 2026-07-11)

> **This ledger is a CLOSED audit record (all 35 findings resolved; campaign closed 2026-07-24).**
> Every RA entry is ticked — shipped, or a residual resolved by design (RA-31 self-side Cover toggle,
> RA-35 Musician self-grant). Kept for provenance, not as a work queue: the forward frontier now lives
> in `PROGRESS.md`. A full system-level audit of the D&D 2024 core play
> procedures (SRD 5.2.1 — the rules of PLAY, not per-entry SRD content; the per-entry
> content-fidelity sweep is a separate later phase) judged every core-rules area on four axes:
> **A modeled? · B correct vs the 2024 text? · C ideal interaction (the minimum-interaction
> doctrine)? · D override escape hatch?** Each finding below carries: **class**
> (CORRECTNESS = wrong rule/number taught or produced · GAP = rule absent · INTERACTION = modeled
> but the player does work the app could do, mapping onto defect classes A–E above ·
> OVERRIDE-GAP = no manual escape hatch), **severity** (**S1** wrong numbers/rules at a real
> table · **S2** the app has the facts but leaves the consequence to player memory/arithmetic ·
> **S3** completeness nicety), **frequency** (every-turn > every-combat > every-session > rare),
> the SRD 5.2.1 citation, the code seam, and the fix direction with its tier (**T2/T3** =
> mechanical Opus/Sonnet with a precise spec · **FABLE** = a design round with owner previews,
> rule 25). Ranked by severity × frequency. Rule citations are the SRD 5.2.1 chapter/glossary
> entry (the 2024 core procedures are NOT on `dnd2024.wikidot.com` — that wiki hosts character
> options only; the SRD PDF is the fetchable source, `https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf`).
>
> **What the audit verified as SOLID** (passed all four axes; do not re-audit): exhaustion −2×level
> on every d20-test surface + −5 ft×level Speed; concentration DC `max(10, ⌊dmg/2⌋)` per damage
> instance + outright drop at 0 HP + one-spell swap semantics with surgical undo; multiclass slots
> (half-casters round UP, third-casters ⌊/3⌋, Pact Magic separate incl. the `pact-` usage-key split);
> cantrip scaling at total level 5/11/17; per-spell owning-class DC/attack; 2024 ritual gating
> (prepared-only + Wizard any-on-sheet, no slot spent); TWF off-hand no-mod row + TWF-style restore +
> the Light-attack-first economy gate; finesse/versatile-stance/reach/thrown/range math; the weapon
> mastery pick system (counts per class table, ownership-gated chips); `netRollState` adv/dis
> cancellation; temp HP max-wins + long-rest clear; heal-from-0 clears death saves; PB `⌈L/4⌉+1`;
> initiative + Alert PB + adv tri-state; feat gating (origin/general L4/epic-boon L19, prereqs
> shown-disabled, repeatable); background-ASI constraint; carry capacity STR×15 with live inventory
> comparison (2024 RAW — variant encumbrance no longer exists); all 15 conditions present with
> hard-blocked economy slots under the incapacitated family + override-first advisory rendering for
> the rest; long/short rest recovery of trackers/slots/pact/exhaustion; Heroic Inspiration incl.
> Human Resourceful long-rest regain. Manual override paths exist on essentially every derived value
> (skills/saves/passives/AC/HP/initiative/speed/weapons/DC/attack/prepared-max/PB/spell-slot-counts)
> — the override axis now passes everywhere (RA-33 closed the last gap: durable per-level slot-count
> overrides).

### Band 1 — wrong numbers / wrong rules shipping today (S1)

- [x] **RA-01 — Long Rest regains HALF Hit Dice; 2024 RAW regains ALL.** _Resting · CORRECTNESS ·
      S1 · every-session._ SRD 5.2.1 Rules Glossary "Long Rest": "You regain all lost Hit Points and
      **all spent Hit Point Dice**" (the 2014 half-rule is gone). Code: `characterStore.ts` long-rest
      handler regains `max(1, floor(level/2))` (+ the RestModal preview mirrors it). Fix: regain all
      spent dice; delete the half-formula. **T3.** **SHIPPED wave 1 (2026-07-12):** `longRest()` now
      sets `hitDice.used = 0`; the RestModal long-rest preview + summary show the full spent count.
      Regression: the RA-01 trio in `character-store-rest.test.ts`.
- [x] **RA-02 — Short-rest Hit-Die spend heals by a fabricated AVERAGE, not a roll-entry.**
      _Resting · CORRECTNESS · S1 · every-session (+ a golden-rule-21 violation: the app never
      fabricates a die total)._ SRD "Short Rest": "roll the die and add your Constitution modifier".
      Code: `RestModal.handleShortRestConfirm` applies `previewShortRestHeal(...).avg`. Fix:
      roll-entry-then-apply per die batch (the shipped Second Wind `HealRollEntry` recipe), CON mod +
      min-1 folded deterministically. **T2.** **SHIPPED wave 1 (2026-07-12):** extracted
      `HealRollEntry` to `components/shared/` (reused by PlayTab + RestModal); the confirm-short phase
      now shows the roll-entry (`Nd{hitDie}` + N×CON, batch-floored at N) instead of applying the
      average — the summary reports the ACTUAL HP healed. The stale `shortRestExplain` avg-copy key
      was deleted. Regression: `rest-modal-short-rest-roll.test.tsx` + an e2e in `rest.spec.ts`.
- [x] **RA-03 — Damage while at 0 HP: auto death-save failure, crit = 2 failures,
      massive-damage instant death.** _Death & dying · GAP · S1 · rare but decisive._ SRD "Death
      Saving Throws — Damage at 0 Hit Points": any damage at 0 = 1 failure, crit = 2, damage ≥ HP max
      = death; plus "Instant Death — Massive Damage" (remainder ≥ max). SHIPPED (2026-07-12, the
      damage-and-dying round): the 0-HP rules live in `characterStore.applyDamage(amount, { crit })`
      — at 0, damage marks the failure(s) (a Stable creature's successes clear and the saves
      restart), damage ≥ max = 3 failures; on the CROSSING hit the remainder-≥-max check
      (`isMassiveDamageDeath`) kills outright. The header danger pill stays the one HP editor at 0
      (popover trigger) with a Critical-hit toggle; every consequence rides one undo entry
      (`restoreHpSnapshot`), pips stay hand-editable (override-first). Spec pinned in
      `tests/unit/character-store.test.ts` ("0-HP rules") + `damage-intake.test.ts`.
- [x] **RA-04 — Grapple/Shove taught as the 2014 "STR contest"; the 2024 save DC is dead code.**
      _Unarmed strikes · CORRECTNESS · S1 · every-combat (a teaching surface showing the wrong
      edition)._ SRD "Unarmed Strike": grapple/shove are Unarmed Strike OPTIONS resolved by a
      target's STR/DEX **save vs DC 8 + STR mod + PB** (shove = push 5 ft or Prone; grapple gated on
      size + free hand), not a contest and not standalone actions. Code: `BASE_ACTIONS`
      `base-grapple`/`base-shove` say "STR contest" and commit as full Actions;
      `compute.unarmedStrikeSaveDc` (8+PB+STR, RAW-correct) has ZERO app consumers. Fix: fold both
      into the Unarmed Strike row as options carrying the live computed DC; retire the two 2014
      cards. (Also: `BASE_ACTIONS` carries inline EN/IT strings in TS — route through i18n while
      touching, rule 9/GR7.) **T2.** **SHIPPED wave 1 (2026-07-12):** the core S1 defect is fixed —
      grapple/shove now carry the live `unarmedStrikeSaveDc` (8+STR+PB) on `summary.saveDC`/
      `saveAbility` (the DC chip renders on each card), and the effect copy is the 2024 Unarmed
      Strike option ("Str/Dex save …"), not the 2014 contest. **Deliberate deviation from the
      "retire the two cards / fold into the Unarmed Strike row" direction:** a universal Unarmed
      Strike attack row does NOT exist today (only Monk/Bard-Dance/Unarmed-Fighting upgrades mint
      one), so folding there would HIDE grapple/shove from the 5-of-6 team fixtures that lack it — a
      regression in availability. Keeping the two universal cards, corrected, preserves discovery
      while fixing the rule + wiring the dead DC. The broader base-action i18n routing is deferred to
      RA-20 (which reworks the whole generic list). Regression: the RA-04 block in
      `smart-tracker.test.ts`.
- [x] **RA-05 — Incoming damage applies the character's Resistances/Vulnerabilities/Immunities.**
      _Damage intake · INTERACTION (defect C) · S1-adjacent · every-hit for a resistant PC._ SRD
      "Damage and Healing — Resistance/Order of Application" (halve after modifiers, round down;
      vulnerability doubles; immunity zeroes; no stacking). SHIPPED (2026-07-12): the pure intake
      math is `lib/damage-intake.ts` (flat reduction → halve once → double, RAW order; a type
      resistance + a source resistance never stack); `deriveDamageDefenses` (sheet-view) assembles
      the effective sets from the SAME seams the rail renders (grants + #68 overrides + the session
      overlay + gated flat reductions). The HP popover offers one toggle chip per DEFENDED type
      (+ resisted sources) ONLY when the character defends something — minimum interaction — with
      the live math line ("12 → 6 · Resisted") and staged multi-type parts; an untyped amount
      applies verbatim (override-first, homebrew never fights the UI). Spec pinned in
      `tests/unit/damage-intake.test.ts` + the hook-level cases in
      `hp-controls-death-saves.test.tsx`.
- [x] **RA-06 — Gaining an incapacitating condition does NOT drop concentration (doc overclaim).**
      _Conditions × concentration · CORRECTNESS (of the tracked state) · S1 · every-combat when
      CC'd._ SRD "Concentration": "Your Concentration ends if you have the Incapacitated condition."
      The S5 tick below claimed "breaksConcentration → auto-drop … Render-site: the concentration
      store action" — FALSE vs code: `breaksConcentration` has no store consumer (grep:
      `ThisTurnTracker` banner hint only); `addCondition` never clears `session.concentration`. The
      S5 bullet is corrected in this commit (rule 16). Fix: `addCondition` → if the gate breaks
      concentration and one is held, drop it through the existing `setConcentration("")` beat
      (undo restores both). **T3.** **SHIPPED wave 1 (2026-07-12):** new
      `conditionBreaksConcentration(id)` predicate (reads the SAME `CONDITION_GATES` source);
      `addCondition` drops held concentration through `setConcentration("")` for the Incapacitated
      family (Incapacitated/Stunned/Paralyzed/Petrified/Unconscious), raising the standard undoable
      "stopped-concentrating" toast (undo restores the spell + its while-active chips). Regression:
      the RA-06 block in `character-store.test.ts`. The S5 tick below is now flipped to shipped.
- [x] **RA-07 — Upcast HEALING never scales (damage does).** _Spellcasting · CORRECTNESS/GAP ·
      S1 · every-session for healers._ SRD Cure Wounds: "the healing increases by **2d8** for each
      spell slot level above 1" (family-wide pattern). Code: `damageDicePerUpcast` + `scaleUpcastDice`
      shipped (S12c) but no `healDicePerUpcast` field exists and the cast modal's upcast preview
      carries damage fields only. Fix: mirror the damage seam (`healDicePerUpcast` + the same
      `scaleUpcastDice`), populate the heal-spell family. **T3.** **SHIPPED wave 1 (2026-07-12):**
      added `SrdSpellData.healDicePerUpcast`; the CastLevelModal previews a scaled `.cl-heal` chip per
      slot (reusing `scaleUpcastDice` with the heal fields); populated Cure Wounds/Prayer of Healing
      `2d8`, Healing Word `2d4`, Mass Healing Word `1d4`, Mass Cure Wounds `1d8`. Regression:
      `cast-level-modal-upcast.test.tsx` (heal preview + the 5-spell data table).

### Band 2 — the app has the facts and leaves the work to the player (S2, the Extra-Attack class)

- [x] **RA-08 — The 2024 "One Spell with a Spell Slot per Turn" rule is unenforced and unhinted.**
      _Spellcasting × economy · INTERACTION (defect B) · S2 · every-turn for casters._ SRD
      "Casting Spells": "On a turn, you can expend only one spell slot to cast a spell." Code: no
      gate or hint anywhere (`TurnEconomyProvider`/`cost-engine` grep negative); the 2014
      bonus-action-cantrip rule is correctly absent. Fix: track slot-spends-this-turn in the turn
      economy → advisory limiter line (the `composeTurnLimiters` register), never a hard block
      (override-first). **T2.** **SHIPPED wave 1 (2026-07-12):** `combatStore.spellSlotCastsThisTurn` + `commitSpellSlotCast()` (turn-scoped, undoable, incremented on a SLOT-paid cast in
      `commitCastOption` — cantrips/free casts don't count); `composeTurnLimiters` pushes a
      `spellSlotLimit` advisory (sorts last, never blocks) once >1 slot has been spent, rendered on
      the "what's limiting you this turn" banner (EN/IT `combat.limiterSpellSlotLimit`). Regression:
      the composer table in `combat-action-log-type.test.ts` + the counter block in
      `combat-store.test.ts`.
- [x] **RA-09 — Dash never extends the movement meter.** _Movement · INTERACTION (defect B) · S2 ·
      every-combat._ SRD "Dash": extra movement equal to your Speed. Code: the meter budget is
      `speedFt` only (`MovementSlider`), and committing `base-dash` changes nothing. Fix: a committed
      Dash adds +Speed to the turn's movement budget (per-turn, undoable, resets at turn-start);
      same seam serves Tactical Shift/Cunning-Strike speed riders later. **T2.** **SHIPPED wave 1
      (2026-07-12):** `combatStore.dashesThisTurn` + `commitDash()` (returns an undo restore, resets
      at every turn/round boundary, not persisted — re-derived like the economy budget);
      `TurnEconomyProvider.commitAction` calls `commitDash()` when `base-dash` commits (undo reverts
      it); ThisTurnTracker feeds the MovementSlider `speed × (1 + dashesThisTurn)`, so the meter total
      jumps 30 → 60 ft on a Dash. Regression: the RA-09 block in `combat-store.test.ts`.
- [x] **RA-10 — 0 HP applies the Unconscious condition; regaining HP sheds it.** _Death &
      dying · INTERACTION (defect B) · S2 · every-dying._ SRD "Falling Unconscious": at 0 HP you have
      the Unconscious condition until you regain HP. SHIPPED (2026-07-12): the knockout branch of
      `applyDamage` adds `unconscious` (skipped on instant death — a corpse is beyond dying), the
      heal-from-0 seam in `setHP` sheds it alongside the death-save reset (log-free; `applyHealing`
      logs the story beat), and the at-zero "drop to 1 instead" interrupt retracts it (you never
      fell). All undoable; the chip stays hand-removable (override-first). Pinned in
      `character-store.test.ts` + `character-store-rest.test.ts`.
- [x] **RA-11 — Death saves are roll-entry driven; the pips display engine state.**
      _Death & dying · INTERACTION (defect B) · S2 · rare, highest stakes._ SRD "Death Saving
      Throws": 10+ succeeds, nat 1 = two failures, nat 20 = regain 1 HP. SHIPPED (2026-07-12):
      `compute.deathSaveOutcome` (incl. the Champion-Survivor `deathSaveCritThreshold`) is now
      consumed by `useHpControls.applyDeathSave` — the DyingBanner carries a d20 roll-entry
      (NumberStepper 1–20 + Apply; golden rule 21: rolled in real life, interpreted here) whose
      outcome applies automatically (success/failure tally, nat-1 double failure, crit-threshold
      revive via the ONE heal-off-0 seam), each entry undoable. The banner label is the verdict
      register (Dying → Stable → Dead); pips stay directly tappable (override-first). Pinned in
      `hp-controls-death-saves.test.tsx` + `dying-banner.test.tsx`.
- [x] **RA-12 — Hide action: no DC 15, no Invisible-condition link.** _Stealth · INTERACTION
      (defect B) · S2 · every-session._ SRD "Hide [Action]": DC 15 Dexterity (Stealth); success =
      the Invisible condition; your check total is the finder's DC; ends on attack/V-spell/louder
      noise/found. Code: `base-hide` card said "Stealth check", nothing else. **SHIPPED wave 2
      (2026-07-21):** `base-hide` carries the structured `summary.skillCheck` (DC 15 · `stealth`,
      ids only); the card renders a d20 roll-entry whose bonus comes from the ONE shared skills
      derivation (`deriveSavesAndChecks` — override-aware by construction). A success applies the
      Invisible condition AND remembers the check total as `session.hiddenDc` (the SRD find-DC),
      shown as a " · DC N" suffix on the rail's Invisible chip and cleared (undoably) when
      Invisible is removed; a failed check is a plain notice. One undoable unit
      (`characterStore.applyHiddenState`); the end-conditions hint rides the expanded card.
      Regression: the RA-12 blocks in `smart-tracker.test.ts` + `character-store.test.ts` +
      `cockpit-economy-in-play.test.tsx`, and the `hiddenDc` codec round-trip in
      `character-codec.test.ts`.
- [x] **RA-13 — Weapon Mastery: properties are glossary chips only — Nick's economy, Topple's DC,
      Graze's number are left to memory.** _Weapon mastery · INTERACTION (defects B/C) · S2 ·
      every-turn for martials._ SRD "Mastery Properties". **SHIPPED wave 2 (2026-07-21):**
      **Nick** — a Nick-mastered OFF-HAND row rides the ATTACK action, not the Bonus Action: the
      row joins the FREE economy group (still UI-gated behind a committed Light attack) so the
      Bonus slot stays free. Nick changes the extra attack's ECONOMY, not its COUNT — the Light
      property still grants only ONE off-hand attack per turn, and the free slot is uncapped, so
      the once-per-turn cap is enforced directly: all `offhand` rows are ONE mutually-exclusive
      per-turn resource (PlayTab `committedOffHandId` → the committed-card "Used" grammar), so
      committing any one off-hand marks every other off-hand row "Used" (undo restores). Zero
      standing text, per the Extra-Attack grammar — placement + the chip's glossary tip teach it.
      **Topple** — the chip prints the live save DC (`masteryDetail.toppleDc` = 8 + attack mod +
      PB): "Topple · DC 14". **Graze** — the chip prints the on-miss damage (= the attack ability
      mod, floored at 0): "Graze · 3". The numbers resolve in the engine (`summary.masteryDetail`,
      locale-free) through the ONE `masteryNumbers` helper and flow through the ONE
      `buildWeaponFacts` seam, so the combat card and the inventory card agree by construction
      (incl. the off-hand row and `extraMasteries` — Battering Roots' Topple carries the DC too).
      The "DC"/"CD" word is composed at the presenter edge (the `OFFHAND_SUFFIX` pattern), so RA-13
      adds NO i18n keys. Vex/Sap/Slow/Push stay reminder chips (they need the un-modeled enemy).
      Regression: the RA-13 blocks in `smart-tracker.test.ts` + `weapon-facts.test.tsx` (Nick
      free-economy, Topple/Graze resolved chips, cross-surface parity) + the off-hand-cap block in
      `blocked-reason.test.ts` (`committedOffHandId` — one off-hand attack per turn across free+bonus).
      **Follow-up (2026-07-21):** the TWF off-hand REVEAL gate (`PlayTab.lightAttackCommitted`)
      previously read only `selected.action`, so an Extra-Attack martial (Fighter/Ranger/Barbarian
      dual-wielding two Light weapons) — whose main Light swing rides the Attack-action ledger
      (`attackSwingIds`), leaving only the anonymous `attack-group` entry in `selected.action` —
      never surfaced the off-hand (and thus never reached the Nick free-attack either). The gate now
      also recognizes a committed Light MAIN-HAND swing in `attackSwingIds`, so Two-Weapon Fighting
      works for the common Extra-Attack case; pinned by the two `twf-extra-attack` render tests in
      `combat-action-derivations.test.tsx`.
- [x] **RA-14 — Ammunition is never decremented; Loading is never capped.** _Attack procedure ·
      INTERACTION (defect B) · S2 · every-turn for archers._ SRD "Properties — Ammunition/Loading".
      Code: arrows were inventory `quantity` rows; firing debited nothing; Loading had no
      one-shot-per-turn hint. **SHIPPED wave 2 (2026-07-21):** a ranged weapon with the Ammunition
      property surfaces its live remaining count as one more `WeaponFacts` row ("Arrows · 18"),
      reading straight from the inventory (rule 6) — but ONLY when the player actually carries a
      matching tracked row (`equipmentQuantityOf` returns null for an untracked item, distinct from a
      tracked-but-empty 0). Committing the attack debits ONE unit
      (`characterStore.adjustEquipmentQuantity`, clamped at 0, KEEPS the row visible), credited back
      exactly on undo (the inverse op — a weapon attack carries no `costEquipment`, so this is the
      only restore path). Each weapon DECLARES the gear id it fires (`ammunitionId` on the SRD weapon
      data — Longbow/Shortbow→arrows, the crossbows→crossbow-bolts, Sling→sling-bullets,
      Blowgun→blowgun-needles, Musket/Pistol→firearm-bullets) and the resolver reads it DIRECTLY;
      the id is NEVER parsed from the `Ammunition (Range N/M; <Type>)` prose (ambiguous — the Sling
      and both firearms all print "; Bullet", so a firearm would wrongly debit the sling stock). A
      data-integrity test guards that every Ammunition-property weapon declares a valid gear id and
      no other weapon carries one (the rule-6 single-source guarantee). Three SRD ammo rows shipped
      (sling-bullets, blowgun-needles, firearm-bullets). An empty quiver DIMS the CTA with a soft
      advisory ("Out of Arrows") but keeps it TAPPABLE (the player may carry untracked ammo —
      override-first, never a hard block); a Loading weapon shows a once-per-action advisory on a 2nd
      Extra-Attack swing. The `ammo`/`loading` summary fields are locale-free — they flow through the
      presenter's `...rest` spread untouched (no presenter edit). Regression: `smart-tracker.test.ts`
      (declared-ammo data-integrity guard, per-weapon id resolution, quantity/stamp gating, firearm
      vs sling disambiguation), `character-store.test.ts` (`adjustEquipmentQuantity`
      debit-to-0-keeps-row/clamp/round-trip), `ammo-debit.test.tsx` (commit debits by 1, undo
      restores, untracked = no mutation, a musket debits firearm-bullets not sling-bullets), and
      `ammo-advisory.test.tsx` (ammo row + soft out-of-ammo/Loading advisories, CTA stays tappable).
- [x] **RA-15 — The concentration-save prompt hides concentration-save Advantage (War Caster /
      Eldritch Mind).** _Concentration · INTERACTION (defect B) · S2 · every-hit while
      concentrating for the grant's owner._ SRD 5.2.1 Eldritch Mind: "Advantage on Constitution
      saving throws that you make to maintain Concentration" (War Caster is the modeled PHB-feat
      twin). Code: the grant exists (an `advantage-on` clause with
      `vs: "concentration-con-save"`) but the `concentration-save` toast intent carries only the
      DC + a flat save bonus. Fix: thread the netted advantage flag into the intent + one word on
      the toast. **SHIPPED (2026-07-23):** the netted concentration-save Advantage (War Caster /
      Eldritch Mind) now rides the `concentration-save` toast intent via `hasConcentrationSaveAdvantage`
      (reads the already active-filtered aggregate, matches `vs: "concentration-con-save"` on both
      sides, nets a same-`vs` disadvantage through `netRollState`), and the presenter appends
      "Advantage"/"Vantaggio" through the `concentrationSaveAdvantageToast` key (one key per
      grammatical unit — no translatable text in TS). Regression: `condition-effects.test.ts`
      (the pure helper — all four net cases), `toast-intent.test.ts` (routes to the advantage
      template), `character-store.test.ts` (Eldritch Mind warlock → flag true; plain concentrator →
      false). **T3.**
- [x] **RA-16 — Passive Perception ignores the 2024 ±5 advantage/disadvantage step.** _Checks ·
      CORRECTNESS/C · S2 · every-session._ SRD "Passive Perception": advantage on the check = +5,
      disadvantage = −5. Code: `passiveScore` = 10 + skill bonus, no adv input; the aggregate already
      knows `advantage-on {check}` clauses. Fix: fold the netted ±5 into the three passives
      (override-first as today). **SHIPPED (2026-07-23):** a new pure `passiveAdvantageStep`
      helper nets ±5 by EXACT `vs` check-id match (`rollType: "check"` AND `vs === passiveId`),
      cancelling to 0 when both sides are present (RAW). It threads through the ONE `passiveScore` /
      `buildPassiveBreakdown` seam (a 7th/8th optional `advantageStep` param, default 0 — every
      existing caller behavior-preserving) into all three passive consumers: the cockpit LeftHud
      (`saves-checks-view`), the party dashboard (`party-stats`), and the PDF (`character-pdf-view`).
      The breakdown gains a `common.advantage`/`common.disadvantage` part so the tip sum still
      equals the headline (guard). Override-first preserved — the ±5 enters `computed`, a manual
      override still wins. Deliberately NOT folded (documented in MECHANICS.md as follow-ups):
      situational `vs: "perception-sight"` and ability-scoped `vs: "wisdom-checks"`/`"intelligence-checks"`
      clauses. Zero live-user impact (no fixture equips a perception-advantage item). Regression:
      `compute.test.ts` (the pure helper across all net/scope cases + the breakdown part),
      `value-breakdown.guard.test.ts` (sum==headline with the step, all 6 fixtures + mock),
      `passive-advantage-step.test.ts` (Sentinel Shield end-to-end: +5 on Perception only, initiative
      doesn't leak, override-first). **T3.**
- [x] **RA-17 — Heavy-property disadvantage (STR/DEX < 13) never derived.** _Attack procedure ·
      INTERACTION (defect C) · S2 · rare (low-score edge)._ SRD "Properties — Heavy". Code: Heavy
      gates GWM scope only; no `< 13` check. Fix: a disadvantage note on the weapon row from
      effective scores. **SHIPPED (2026-07-23):** a new pure `heavyWeaponDisadvantage(isHeavy,
isRanged, effectiveScores)` helper derives the SRD rule (Heavy + relevant EFFECTIVE score < 13:
      STR for Melee, DEX for Ranged) and threads a `heavyDisadvantage` flag through the ONE shared
      `buildWeaponFacts` seam (`WeaponFactsVM`), so the combat action card and the inventory
      WeaponCard render an identical quiet advisory note by construction (golden rule 6). Reads the
      EFFECTIVE scores (set-score item floors folded in), so a Gauntlets-of-Ogre-Power STR 19
      suppresses it; strict `< 13` boundary; no Grant kind (intrinsic to the property, like
      `isHeavyArmorEquipped`). Zero stored/derived-value change (render-time flag) — the only Heavy
      fixture (santaera greatsword, effective STR 19) correctly shows no note. Regression:
      `compute.test.ts` (the pure helper — every branch incl. the STR 13 boundary + melee/ranged
      independence), `weapon-facts.test.tsx` (greatsword flags on both surfaces, longbow reads DEX
      not STR, non-Heavy defaults off, the component note renders EN + IT). **T3.**

### Band 3 — completeness (S3)

- [x] **RA-18 — Ready action is a bare text card.** _Action economy · GAP · S3 · every-session._
      SRD "Ready [Action]": trigger + reaction; a readied SPELL is cast now (slot spent) + held with
      Concentration. Fix: minimal — the card notes the spell rule; readying a spell routes a real
      cast that engages concentration. **T2.** **SHIPPED (2026-07-24):** the Ready card now carries a
      `combat.readySpellNote` (on the engine `description` channel, rendered in the card accordion)
      teaching the readied-spell rule; the "route a real cast" clause was already delivered — casting
      a readied spell goes through the spell's own card on the same board (which spends the slot and
      engages Concentration on a concentration spell), so no held-spell state machine was built.
      Regression: the RA-18 block in `smart-tracker.test.ts`.
- [x] **RA-19 — Prone economics (stand = half Speed, crawl) absent from the movement meter.**
      _Movement · INTERACTION (defect C) · S3 · every-combat with knockdowns._ SRD "Prone —
      Restricted Movement". Fix: while `prone` is set, a one-tap "Stand (−⌊Speed/2⌋ ft)" on the meter
      clears the condition + debits movement. **T3.** **SHIPPED (2026-07-24):** while `prone` is set,
      a one-tap "Stand up (−⌊Speed/2⌋ ft)" `.conc-banner` on the turn meter clears the condition via
      the new `characterStore.removeConditionSilent` (the shared drop core `removeCondition` now
      delegates to) and debits half the BASE Speed through `setMovementUsed`, composed under ONE
      `registerUndoableResult` (turnScoped:false, delta-refund) — mirrors RA-12 Hide; reuses the
      `conc-banner` recipe (no new CSS). Crawl stays a narrative banner note (the 5-ft meter has no
      movement-mode concept). Regression: `character-store.test.ts` (removeConditionSilent) +
      `this-turn-condition-projection.test.tsx` (render + composite/delta undo).
- [x] **RA-20 — The 2024 generic action list is incomplete.** _Action economy · GAP · S3._
      `BASE_ACTIONS` lacks **Influence, Magic, Study, Utilize** (the `base-grapple`/`base-shove` cards
      stay — RA-04 corrected them to the 2024 Unarmed Strike options in place rather than retiring
      them, since no universal Unarmed Strike row exists to fold into); Search names
      Perception/Investigation only (SRD table adds Insight/Medicine/Survival).
      Fix: data-complete the list with 2024 one-liners. **T3.** **SHIPPED (2026-07-24):**
      `base-influence`/`base-magic`/`base-study`/`base-utilize` added as inline `lit` entries (the
      sanctioned bilingual form for engine-authored base actions); `base-search` corrected to the
      2024 Wisdom skills (Insight/Medicine/Perception/Survival) with Investigation moved to the new
      `base-study` card. IT names are the NOUN forms from the official IT SRD 5.2.1 "Azioni" table /
      glossary — Influenza / Magia / Studio / Utilizzo, plus Ricerca (Search, also corrected from the
      pre-existing "Cercare", and its `hideEndsHint` cross-reference realigned). Each new verdict chip
      is name-restating, so all four join `BASE_ACTIONS_NO_CHIP`. Regression: the RA-20 block in
      `smart-tracker.test.ts` + the auto-covering app-side `i18n-dynamic-key-coverage`,
      `action-subtitle-budget`, and `i18n-dedup` guards; the `BASE_ACTIONS_NO_CHIP` suppression is
      enforced in COMPOSED mode by the pack-side `chip-budget.guard.test.ts`.
- [x] **RA-21 — Exhaustion 6 = death is display-only.** _Conditions · GAP · S3 · rare._ SRD
      "Exhaustion": you die at level 6. Code: clamp + glossary text; no dead-state surfacing. Fix:
      level 6 surfaces the same dead verdict the death-save track uses. **T3.** **SHIPPED
      (2026-07-24):** level 6 folds into the ONE derived fallen predicate (`diedOfExhaustion` in
      `character-status.ts`, joined into `isCharacterDead`); Exhaustion is seeded into the roster
      projection (`cacheToRosterDoc` now reads `state.exhaustion` — the one parent-`state` field the
      projection reads) so the Fallen tile fires in prod, matching the dev path (prod == dev); the
      cockpit Exhaustion-death strip now reads the shared `character.deadLabel`, and the orphaned
      `character.exhaustionDeath` key was deleted. Reversible with no stored flag — lowering
      Exhaustion below 6 clears the fallen state. Regression: `character-status.test.ts` (the
      predicate) + `roster.test.tsx` (the prod projection + the render tile).
- [x] **RA-22 — A CON change outside level-up never retro-adjusts max HP.** _HP model ·
      INTERACTION (defect C) · S3 · rare._ 2024 CON rules (retroactive per-level HP). Code:
      `applyClassFeatureAbilityScores` adjusts on level-up CON RISES only; a direct sheet edit or a
      decrease leaves stored `hp.max` stale (override-first softens this — the breakdown shows the
      computed base). **SHIPPED (2026-07-24):** the breakdown CON term already self-heals from base
      CON — the real gap was the STORED `hp.max` (what `effectiveMaxHp` clamps/heals/displays
      against). The LeftHud ability editor now rebakes it on a CON edit by the pure CON-term delta
      (`retroactiveConHpMax`, reusing the ONE `inferHpMax` arithmetic, rule 6): symmetric across
      rises AND decreases, 0 when the CON MODIFIER is unchanged (even→odd bump), and pin-preserving
      (a rolled/hand-pinned max shifts by the delta, is never reset to the average). Fires ONLY on
      an explicit user CON edit — loading a fixture never mutates `hp.max`. The level-up ASI path
      already handled rises. Regression: `character-infer.test.ts` (the pure helper — rise/decrease/
      no-mod-change/pin-preserved/floor/husk) + `left-hud.test.tsx` (CON 14→16 → 71, 14→12 → 53).
      **T2.**
- [x] **RA-23 — Costly/consumed material components are not modeled.** _Spellcasting · GAP · S3 ·
      every-session at mid levels (Revivify's consumed 300 GP diamond, Chromatic Orb's 50 GP…)._
      SRD "Material (M)". Code: `components.m` is a bare boolean. Fix: optional `{costGp, consumed}`
      on `SrdSpellData.components` + a cast-card chip; the data fill rides the later content sweep.
      **SHIPPED wave 4 (2026-07-24):** additive optional `costGp?`/`consumed?` on
      `SrdSpellData.components` (the primary priced component + whether the spell consumes it), FILLED
      for all 53 gp-priced SRD spells (derived from each spell's shipped EN Components prose — the
      source of truth), plus a `buildMaterialCostTag` helper that leads the Spells-tab card's tag
      foot with a compact "M: 300 gp, consumed" chip (`spells.materialCost`/`materialCostConsumed`,
      EN gp / IT mo, EN + IT) on the surface you cast from. Never prose-parsed at render; custom
      spells never match. No character-schema/derived-value change → zero live-user impact.
      Regression: `spell-data-integrity.test.ts` (an equivalence lock deriving expected
      costGp/consumed from the EN prose across every SRD spell + a lean-data/pairing lock),
      `spell-card-material-cost.test.ts` (the chip helper — priced/consumed, priced-only,
      unpriced→null, custom→null). **PACK FOLLOW-UP:** 17 pack spells carry a priced material
      (`content-pack/i18n/en/srd/spells.json`) and need the same fill + a pack-side equivalence lock —
      out of scope here (frozen pack). **T2** schema + sweep.
- [x] **RA-24 — Ritual casts show no "+10 minutes" note.** _Spellcasting · GAP · S3._ SRD "Ritual".
      One localized line on the ritual affordance. **SHIPPED wave 4 (2026-07-24):** the Spells-tab
      card now carries a "+10 min · no slot" (`spells.ritualNote`, EN + IT) `uc-tag` chip gated on
      `vm.canRitual`, so it appears exactly beside the Ritual cast button — the 10-minute / no-slot
      trade-off is visible before you cast. Reused the existing footer `tags` recipe (no new CSS/
      component); deleted the two orphan `combat.ritualBadge`/`combat.ritualHint` keys the note
      supersedes. Regression: `spells-page.test.tsx` (Detect Magic prepared → the chip renders; a
      non-ritual spell has none). **T3.**
- [x] **RA-25 — Surprise (Disadvantage on initiative) unmodeled.** _Combat start · GAP · S3 ·
      rare._ SRD "Surprise". The initiative advantage tri-state had no disadvantage leg. Fix: extend
      the tri-state to adv/auto/off/dis. **T3.** **SHIPPED (2026-07-24):** the initiative override was
      widened from a boolean to the four-state `InitiativeAdvantageOverride` union
      (`"advantage" | "disadvantage" | "off" | null`) on the `initiativeAdvantageOverride` codec slot,
      with a ONE-WAY legacy-boolean decode at the read boundary
      (`normalizeInitiativeAdvantageOverride`: `true`→`"advantage"`, `false`→`"off"`, string legs
      pass through, else dropped — never written back, rule 10). The net roll state resolves through
      the new pure `initiativeRollState` reader in `compute.ts` (the three explicit override legs win
      outright; `null` defers to the grants, netting an initiative-`advantage-on` against an
      initiative-`disadvantage-on` by RAW cancellation), so Surprise rides the `"disadvantage"` leg —
      not a modeled grant, pinned by hand (the sheet can't see it). The CombatHeader Init-vital corner
      toggle cycles the four states in edit mode (auto→advantage→disadvantage→off→auto) and, in play
      mode, renders a quiet gold boon mark or a danger-hued (`data-adv="dis"`) penalty mark only when
      relevant. Override-first throughout. Regression: `compute.test.ts` (the pure netter across every
      override/grant leg + cancellation), `combat-header.test.tsx` (the cycle + the play-mode marks),
      `character-codec.test.ts` (the four-state round-trip + legacy-boolean decode).
- [x] **RA-26 — Jump distances are computed but dead.** _Movement · GAP · S3._ `compute.jumpDistance`
      (long = STR score ft, high = 3 + STR mod — RAW-correct) has zero callers. **SHIPPED
      (2026-07-24):** `jumpDistance(effectiveScores.STR)` now renders as two read-only rows (Long
      Jump / High Jump) in the LeftHud movement/senses rail beside the derived speeds, formatted via
      `localeDistance` (EN ft / IT metric, D3); reuses the pre-existing `abilities.longJump` /
      `abilities.highJump` keys (both locales already present — zero new i18n). Reads the EFFECTIVE
      STR (a set-STR item raises it), the same single source the encumbrance capacity uses (rule 6);
      read-only because no SRD grant modifies jump. Regression: `left-hud.test.tsx` (EN 8/2 ft, IT
      2,4/0,6 m). **T3.**
- [x] **RA-27 — Push/drag/lift (STR×30) computed but never shown.** _Encumbrance · GAP · S3._
      `carryingCapacity().pushDragLift` unused; the carry comparison ships. **SHIPPED (2026-07-24):**
      the push/drag/lift ceiling (STR × 30) now rides the inventory `EncumbranceVM` (`pushDragLift`,
      twice `capacity`, reusing the single `carryingCapacity` call whose dead half it was) and prints
      in the capacity chip's tooltip, locale-formatted via `formatWeight` (EN lb / IT kg). Reads the
      EFFECTIVE STR (rule 6). Regression: `inventory-encumbrance.test.ts` (VM value + the
      `{{pushDragLift}}` placeholder present in both locales). **T3.**
- [x] **RA-28 — Creation grants Common only; the 2024 "+2 languages" pick is never offered.**
      _Creation · GAP · S3 · once per character._ SRD "Creating a Character — languages" (Common + 2
      from the standard table). The `CreationWizard` seeded `["common"]` and left the two picks to
      hand-editing the Bio tab. **SHIPPED (2026-07-24):** a dedicated guided **Languages** step (after
      Background) + a matching Quick-Start section, both reusing the existing `LanguageChoicePicker`
      fed by ONE hand-built 2-pick `choice-language` slot over `STANDARD_LANGUAGE_IDS` minus Common
      (`SRD_LANGUAGE_IDS.slice(0, 10)` — the standard table; Common excluded because
      `applyLanguagePicks` dedupes against the seed, so a Common pick would silently yield only 1 new
      tongue). Mirrors the background-ASI sibling: its own rail step, TITLES/hint, `stepNextDisabled`
      gate, a single-source `createRequirements` entry (Create stays blocked until both are picked),
      and a review-recap row. The picks apply additively at `finalCharacter` via `applyLanguagePicks`
      as stable ids (`["common", …]`), so a tongue reads its canonical name on every surface; the Bio
      free editor stays the override for any other language (Rare/secret). No schema change
      (`languageIds` shape unchanged, additive VALUE only) → the 6 team fixtures are unaffected.
      Regression: `feat-language-choices.test.ts` (the standard-table roster) + `creation-completeness`
      (the RA-28 gate) + `creation-navigate` (additive `["common","draconic","dwarvish"]` landing) +
      the create-driving cases realigned to pick two languages. **T2.**
- [x] **RA-29 — Travel pace absent.** _Exploration · GAP · S3 · out-of-combat._ SRD "Travel Pace"
      table. Fix: a reference block (fast/normal/slow per hour/day) — display-only. **T3.**
      **SHIPPED W6 (2026-07-24):** a new `TRAVEL_PACE_REFERENCE` table (`src/data/travel-pace.ts`)
      mirrors the shipped `COVER_REFERENCE` exactly — pure authoritative SRD reference data (fast
      400 ft·4 mi·30 mi, normal 300·3·24, slow 200·2·18, assuming an 8-hour day; fast = -5 passive
      Perception, slow = may move stealthily), no per-character mechanic and no Grant. Display-only:
      like `cover.ts` it carries inline bilingual `BiText` behind a documented
      `no-srd-strings-in-data` whitelist bypass (same rationale). RENDERED on-demand in the Play
      tab's "Rules reference" panel (`SituationalRules`, collapsed by default — blooms on a header
      click since W9) — distances localize via `localeDistance` (feet) +
      the new `localeMiles` (overland). Pinned by `tests/unit/travel-pace.test.ts` + the surface's
      render test `tests/unit/situational-rules.test.tsx`.
- [x] **RA-30 — Mounted & underwater combat have no reference surface.** _Combat variants · GAP ·
      S3 · rare._ SRD "Mounted Combat"/"Underwater Combat". Same treatment as the shipped
      `COVER_REFERENCE`: pure reference data. **T3.**
      **SHIPPED W6 (2026-07-24):** `src/data/combat-variants.ts` exports `MOUNTED_COMBAT_REFERENCE`
      (5 lines: eligible mount, mount/dismount = ½ Speed round-down, controlled vs independent, DC 10
      DEX falling-off) + `UNDERWATER_COMBAT_REFERENCE` (3 lines: melee Disadvantage unless Piercing,
      ranged auto-miss beyond range + Disadvantage within, Fire Resistance) as inline-`BiText`
      reference data — the `cover.ts` recipe, whitelisted in `no-srd-strings-in-data.guard`. The
      2024 SRD facts (Piercing-not-the-2014-weapon-list; all ranged Disadvantaged) are pinned by
      `tests/unit/combat-variants.test.ts`. RENDERED on-demand in the Play tab's "Rules reference"
      panel (`SituationalRules`, collapsed by default since W9) alongside the Cover + Travel-pace
      tables (the shared surface built this
      wave; render test `tests/unit/situational-rules.test.tsx`). This also retrofits the previously
      data-only `COVER_REFERENCE` into that same panel — closing the "display-only, i.e. VISIBLE"
      ledger promise for all three. (RA-31's contested self-side AC toggle is the separate item
      below — resolved RESIDUAL.)
- [x] **RA-31 — Cover is reference-only; a self-side +2/+5 AC toggle is a defensible upgrade.**
      _Cover · INTERACTION · S3 (deliberate residual today; MECHANICS.md "battlefield geometry")._
      SRD "Cover": the bonus applies to the TARGET's AC/DEX saves — self-side, so it CAN ride the
      sheet without modeling enemies (a rail toggle like the buff chips). Contested design →
      **FABLE** (rule 26) or stays a triaged residual. **RESOLVED wave 7 (2026-07-24): RESIDUAL —
      the toggle is DECLINED (impeccable adjudication, rule 26; docs-only).** The decisive reasons:
      (1) **No enforceable lifetime.** Every sibling AC chip's state has a rules-defined lifetime
      the engine tracks — concentration-cleared (`activeKeysForConcentration`), round-timed
      (`effectTimers` auto-drop), or End-Turn-prompted (`maintained`). Cover ends on a geometry
      change the app cannot see (the very definition of the battlefield-geometry residual): a
      sticky chip leaves a silently-stale AC for whole turns (the app would TEACH a wrong number —
      the inverse of "trust it over paper"), and a turn-scoped clear is categorically backwards
      because cover's relevance window is OTHER creatures' turns (attacks/DEX saves against you) —
      an end-of-your-turn clear deletes the bonus precisely before it applies. (2) **Double-count
      with the table's real adjudicator.** Cover is the DM's per-attack ruling on geometry the DM
      tracks (VTT or theater-of-mind); a sheet-baked +2/+5 gets counted twice when the DM applies
      it to the attack roll, and poisons the §2.9 DM glance-pane — the pane would present a
      positional snapshot as the character's AC fact. (3) **The app's settled sibling precedent.**
      Dodge — equally universal, self-side, transient, enemy-turn-relevant — is deliberately a
      reference action card (`base-dodge`), never a state toggle; DDB models neither. (4) **The
      "native chip recipe" claim fails on contact:** cover has no granting source (it would need
      the first-ever synthetic universal grant source in `resolveAllGrantSources`) and
      half/three-quarters would need the rail's first-ever mutual-exclusion pair (the while-active
      seam is independent multi-toggle — both lit = an impossible +7). The REAL gap the FOR case
      identified is knowledge (players forget cover exists at the table) — and that treatment is
      already SHIPPED: the `COVER_REFERENCE` table renders on-demand in the Play tab's "Rules
      reference" panel (`SituationalRules`, W6; collapsed by default since W9), exactly where a
      player checks the rule mid-session. Recorded
      in `docs/MECHANICS.md` → "Battlefield geometry / encounter state" as already-settled. **T3.**
- [x] **RA-32 — Grappled shows blanket attack Disadvantage; RAW scopes it to targets OTHER than
      the grappler.** _Conditions · CORRECTNESS (advisory over-reach) · S3._ SRD "Grappled —
      Attacks Affected". The gate's clause is deliberately coarse (documented inline); fix = the
      chip's description says "vs targets other than the grappler" (the existing per-clause
      `description` channel). **T3.** **SHIPPED (2026-07-24):** the ledger's clause-`description`
      direction was a no-op (the clause `description` is unrendered for attack-rollType clauses), so
      the fix scopes the ONE rendered surface — the "what's limiting you this turn" summary. The
      `attackDisadvantage` limiter now carries a `scoped` flag set only for the stable `grappled` id
      (the ONE attack-dis condition that isn't blanket), and the edge renders
      `combat.limiterAttackDisadvantageScoped` ("against targets other than the grappler"); every
      other attack-dis condition (Blinded/Frightened/Poisoned/Prone/Restrained) keeps the blanket
      sentence. Regression: `combat-action-log-type.test.ts` (the flag) +
      `this-turn-condition-projection.test.tsx` (the rendered sentence + the blanket contrast).
- [x] **RA-33 — Spell-slot COUNTS have no manual override.** _Overrides · OVERRIDE-GAP · S3._ The
      one derived value found without an escape hatch: slots come only from `deriveSpellSlots` (+
      `scoped-extra-spell-slot` grants); homebrew slot tables can't be pinned. Fix: per-level
      max-override map on `SpellcastingConfig`, editable where slots render. **SHIPPED wave 4
      (2026-07-24):** correction — an inline slot-total editor ALREADY existed
      (`SpellsTab.updateSlotTotal`), so the real gap was DURABILITY: `character.spellSlots` is a
      materialized derived array clobbered by `reconcileBuildChoices` (any Bio class/level edit) and
      `levelUp`. Added an additive `slotMaxOverrides?: Record<string, number>` on `SpellcastingConfig`
      (keyed by `slotUsageKey`, so a Sorlock's normal + Pact rows at one level pin independently), a
      pure `applySlotMaxOverrides` helper (the SOLE guarded path from the map to a count — ignores
      non-finite/negative, floors non-integers, drops 0), and re-applied it at BOTH clobber sites +
      preserved the map across reconcile/level-up/rehydrate (dropping it on a class change, mirroring
      the DC/attack/preparedMax overrides). The existing editor now writes the durable override + a
      reset-to-auto affordance (`spells.ritualNote` sibling recipe: the shared `common.resetToAuto`
      button, gated on the presenter's `overridden` flag); the input clamps min 1 (a 0 override would
      strand the row). Additive/fixture-safe by construction (absent field = today's behavior; the 6
      team fixtures minimize byte-identically). Regression: `multiclass-slots.test.ts`
      (helper + pact independence + garbage-safety), `spell-slot-override.test.ts` (durability across
      reconcile level-only vs class-change + level-up + the presenter flag), `character-minimal.test.ts`
      (round-trip + fixture-safety), `spells-page.test.tsx` (the durable edit + reset wiring). **T2.**
- [x] **RA-34 — Crit consequences unstated at the moment of a crit.** _Attack procedure · GAP ·
      S3._ The crit-range chip ships; "double the dice" appears nowhere at commit time. Fix: one
      glossary line on the attack card's crit chip. **T3.** **SHIPPED (2026-07-24):** the ledger's
      "crit chip" anchor doesn't exist as a glossable surface (the crit-range fragment is a
      Champions-only join-string, and a default-20 character gets no crit text at all), so the rule
      was added to the ALWAYS-present attack-roll `GlossaryTip` body instead — it now states the 2024
      Critical Hit rule (roll all the attack's damage dice, including extra dice like Sneak Attack,
      twice; the modifier is added once), reaching every attack card (weapon + spell + non-weapon)
      and every character, not just Champions. Regression: `glossary-tip.test.tsx` (the crit clause
      in EN + IT).
- [x] **RA-35 — Musician's Encouraging Song grants no Heroic Inspiration.** _Feats (content seed) ·
      GAP · S3._ The feat models only the instrument picks (matrix row honestly notes "melody
      narrative"); the rest-time "give Heroic Inspiration to PB allies" half is ally-targeted
      (self-sheet can still one-tap SELF-grant). Seed for the content-fidelity sweep. **T3.**
      **RESOLVED W6 (2026-07-24) — residual by design (no new machinery, no ally modeling):**
      Encouraging Song gives Heroic Inspiration to up to PB _allies_ who hear the song, not the
      caster (`content-pack/i18n/en/srd/feats.json`, "…give Heroic Inspiration to allies who hear the
      song. The number of allies… equals your Proficiency Bonus"). The engine models ONE character,
      so there are no ally targets to grant; and the caster's own Heroic Inspiration is already a
      universal one-tap socket (the `insp-toggle` on `ResourceRail`). Whether the RAW even lets the
      caster include themselves is CONTESTED (the ally-vs-self debate over "allies who hear the song"),
      but the residual holds under EVERY reading: if the caster is excluded there is nothing to model,
      and if they are included the universal insp-toggle socket already covers them — so a
      Musician-specific self-grant would be redundant either way, and none was added. The feat
      description is already 2024-faithful in EN + IT. **Pack-side twin —
      TRACKED HANDOFF under D11's concurrency carve-out** (the pack was frozen read-only by a
      concurrent worktree this wave, so the twin rides an explicit handoff run the moment the pack is
      workable, still the same logical unit — never a silent deferral): sharpen the bundled
      crafter/musician/harper coverage row in `content-pack/docs/AUTOMATION_COVERAGE.md` (melody
      clause → "Encouraging Song = Heroic Inspiration to allies, residual by design") and add the
      status-quo guard to `content-pack/tests/unit/wave2-correctness.test.ts` (assert
      `getFeat("musician")` grants only the 3-instrument tool choice and no heroic-inspiration
      grant), so the residual can't later drift into the RAW-wrong caster self-grant.

> **Triaged non-findings re-confirmed by this audit** (already-settled residuals, MECHANICS.md
> "Non-automatable residuals" — do not re-open): attacker-side condition effects, battlefield
> geometry/line-of-sight/ranged-in-melee (including the self-side Cover AC/DEX-save toggle —
> RA-31, adjudicated RESIDUAL 2026-07-24 via impeccable, rule 26), per-target scoping
> (Hunter's-Mark-style), enemy modeling, auto-rolled anything (golden rule 21). The 2024 rules the
> app models were otherwise verified correct — see the SOLID list at the top of this section.

---

## The closing seams (S1–S13) — effectively CLOSED, tracked as tick-boxes

These cross-cutting seams convert the bulk of the interaction-cost findings; most are CONSUMERS for
things the engine ALREADY computes. Each tick-box names the consumer / render-site that closes it.
The seams map onto the active campaign workstreams: **A = combat mechanics (engine→render)**,
**B = BG3 can/cannot projection UX**.

### S1 — auto-activate-on-use _(workstream B; defect A)_

Using the action / spending the tracker / casting the buff spell AUTO-lights its `while-active` key;
deactivation un-spends nothing. (The `while-active` primitive + `activeFeatures` set + toggle UI all
exist — the AUTO link from use→toggle and from concentration-drop/expiry→un-toggle is wired.)
**SHIPPED (2026-06-24):** the commit/undo seam (`TurnEconomyProvider.commitAction`) is source-agnostic
— it reads only `action.activatesKey` — so a FEATURE action (Rage/Bladesong) and now a CAST while-active
buff spell both auto-light their chip in one tap, undoable; the concentration store action retracts the
dropped spell's chip on drop/swap/0-HP-break; duration-expiry retracts at the End-Turn tick (S3). The
chip stays MANUALLY toggleable throughout (override-first; the `activated` OFF-guard means undo never
clears a hand-set state).

- [x] Link "use the action / spend the tracker" → auto-set the feature's `activeKey` (one tap, undoable). Render-site: the rail Active-Features bar + the action card commit. Clears all class-A while-active rows (Rage, Bladesong, Innate Sorcery, Superior Defense, Sacred Weapon, Wrath of the Sea, Starry Form, Form of Dread, Goliath Large Form, Shifter Shifting…). `smart-tracker.ts` derives `activatesKey` from the feature's first `while-active` grant; `TurnEconomyProvider.commitAction` flips it on commit (+ undo).
- [x] Link "cast a `while-active` buff spell" → auto-light its chip (shield, mage-armor, shield-of-faith, aid, haste, barkskin, fly, stoneskin, foresight…). Render-site: cast commit → `activeFeatures`. `resolveSpellActions` now derives `activatesKey` from the cast SRD spell's first `while-active` grant (the stable `activeKey` on `SrdSpellData.grants`, never the spell name); the SAME source-agnostic commit/undo seam lights/clears it. A normal damage/utility cast (no such grant) lights nothing; custom homebrew spells carry no grants → stay unlit.
- [x] Concentration-drop → auto-clear the chip; duration-expiry → auto-clear (S3, shipped). Render-site: the concentration store action (`setConcentration` clear/swap + the 0-HP auto-drop in `applyDamage`) + the turn/round tick (`advanceEffectTimers`). The dropped spell's `activeKey`(s) resolve from `activeKeysForConcentration` (the stored concentration ref = the spell's bare srdId = the `activatableGroups.sourceId`; map to `.key`, never reconstruct `spell-<id>`); a swap strips ONLY the OLD spell's keys; undo is SURGICAL — it re-adds only the keys the drop stripped (`concentrationKeysToRestoreOnUndo`, never the whole prior `activeFeatures` snapshot), so a chip the player toggled off mid-undo-window is not resurrected. A `custom:`-marked / non-buff concentration spell clears nothing (no SRD while-active grant).

### S2 — rider-render _(workstream A; defects B, C)_

ONE component rendering the already-computed `summary.extraDamage` / `dieModifiers` / `onHitHeal` /
`extraMasteries` on attack/action cards, with one-tap debit of a rider's `resourceCost`. **SHIPPED
(2026-06-22):** rendered by `lib/views/rider-view.ts` + `components/shared/ActionRiders.tsx`, consumed
by PlayTab + the inventory WeaponCard.

- [x] Render `summary.extraDamage` on the qualifying attack/action card (Sneak Attack dice, Radiant Strikes, Berserker Frenzy, Divine/Blessed Strike, Colossus Slayer, Dreadful Strikes, Psionic Strike, Arcane Jolt, Eldritch Smite, Battering Roots `extraMasteries`, Assassinate extra). Render-site: a rider chip component on the smart-tracker weapon/action row in PlayTab.
- [x] Render `dieModifiers` (Savage Attacker "roll twice keep higher", reroll badges). Render-site: same row component.
- [x] Render `onHitHeal` (Lifedrinker heal-on-hit). Render-site: same row component.
- [x] Render fighting-style riders (Dueling / GWF / TWF / Thrown-Weapon-Fighting), GWM +PB, charger/crusher/piercer/slasher. Render-site: same.
- [x] One-tap debit of a rider's `resourceCost` (e.g. Mercy Hand of Harm's FP, Eldritch Smite slot) at the moment the rider is used. Render-site: rider chip → tracker spend, undoable.
- [x] **Companion `attacks` render (orphaned-value consumer gap) — SHIPPED 2026-06-26.** `resolveCompanion` returned each companion attack with a concrete to-hit + damage, but FeaturesTab's companion callout rendered ONLY AC/HP/speed — the attack rows rendered NOWHERE (Battle Smith Steel Defender's Force-Empowered Rend, Artillerist Eldritch Cannon's Force Ballista, the Beast Master/Reanimator strikes). Closed at the seam: FeaturesTab now threads the owner's effective spell-attack mod into `resolveCompanion` (the `attackBonus: "spell-attack"` to-hit, previously falling back to PB) and renders each `comp.attacks` row reusing the cockpit weapon-row recipe (`formatModifier` to-hit · word-free dice + `t(`srd.damage\_\*`)` type · `localeDistance` reach/range + the catalogue push/grapple rider). The resolver no longer bakes the raw damage-type token into the `damage` string — it returns `damageDice` + a `damageType` token localized at the render edge (rule 7) + a `ranged` flag (range vs reach). Render regression in `features-origin-feat.test.tsx`.
- [x] **Artificer Replicate Magic Item Plans-Known count render (orphaned-value consumer gap) — SHIPPED 2026-06-26.** `artificer.ts` computed `classSpecific.plansKnown` (4 at L2–5, 5 at L6–9, 6 at L10–13, 7 at L14–17, 8 at L18–20 — RAW `dnd2024.wikidot.com/artificer:main` → Artificer Features Part B, Plans Known column) but it had NO render consumer — orphaned. Surfaced via the EXISTING declarative rider recipe (rule 3, no parallel component): added `mechanics.rider: { sourceKey: "plansKnown", format: "passthrough" }` to the feature — the SAME passthrough chip druid-wild-shape's Max CR uses — so `resolveFeatureRider` reads the count off the class table and FeaturesTab renders it as the card's primary verdict chip ("Plans Known N"). Declared the LEAST (no new data; the count was already computed). EN "Plans Known" / IT "Piani Conosciuti" catalogue label (`artificer-replicate-magic-item.mechanics.rider.label`). Engine-fact + render regression: `feature-rider-parity.test.ts` (the L2–20 scaling table) + `artificer-replicate-plans-rider.test.tsx` (the chip reaches a pixel at L2/L6; absent for a non-Artificer); fail-before proven (chip absent pre-wire). **DEFERRED:** the sibling `magicItems` cap (2→6) as a second chip needs the rider widened to a list — one chip ships the headline count cleanly; the Magic-Items cap + plan selection + item instantiation remain the model-gap.

### S3 — duration + turn/round engine _(workstream A; defect D)_

A minimal expiry model plus a per-turn recovery cadence in the `Recovery` union plus round-1 state.
**SHIPPED (2026-06-22, the A2 cadence engine):** the `Recovery` union has a `per-turn` member;
`while-active.duration.maxRounds` arms a `session.effectTimers` countdown that the End-Turn seam
decrements and auto-drops; `advantage-on { round1 }` gates round-1 state. All undoable via the single
End-Turn undo.

- [x] Per-turn recovery cadence + the turn-meter tick that auto-resets it (Sneak Attack auto-resets every turn) + once-per-turn riders.
- [x] A duration model (`while-active.duration.maxRounds` → `effectTimers`) + auto-expiry at the End-Turn tick (Rage = 100 rounds, potion countdowns, the S1 expiry link).
- [x] Round-1 state primitive (`advantage-on { round1 }`, e.g. Assassinate; the `speed { round1 }`
      counterpart for Dread Ambusher's Ambusher's Leap, 2026-06-25). The specific NEW round-1 /
      cadence-dependent mechanics it unblocks are tracked below (Death Strike, Dread Ambusher, Studied
      Attacks, Stunning Strike).

### S5 — condition-consumer _(workstream B; defects C, B)_

Apply the computed-but-unconsumed condition effects from `condition-effects.ts`. **COMPLETE
(2026-06-24):** all five consumers ship — `speedZero` / `autoFailSaves` / `breaksConcentration`
(2026-06-22) plus `deathSaveCritThreshold` + a standalone Bloodied flag (2026-06-24).

- [x] `speedZero` → displayed speed / movement bar (grappled/restrained/paralyzed/petrified/unconscious — 2024 RAW drops Stunned's 2014 speed-0; Steady Aim; Sentinel-on-hit). Render-site: the header speed chip + movement bar.
- [x] `autoFailSaves` → save rows show auto-fail. Render-site: the Abilities save rows.
- [x] `breaksConcentration` → auto-drop concentration when Incapacitated. **RECONCILED 2026-07-11
      (rules-audit): the earlier tick OVERCLAIMED** — the shipped consumer was only the
      `ThisTurnTracker` concentration-banner HINT (`concBlockedReason`). **CLOSED wave 1 (2026-07-12,
      RA-06):** `addCondition` now clears `session.concentration` via `setConcentration("")` when the
      new condition breaks concentration (the `conditionBreaksConcentration` predicate over
      `CONDITION_GATES`), with the standard undoable toast. The banner HINT stays as the persistent
      "you can't concentrate" reminder while the condition is held.
- [x] `deathSaveCritThreshold` → death-save UI (Champion Survivor / Defy Death). The death-save control (`DeathSaves`, inside the `DyingBanner`) reads `aggregateCharacterGrants(...).deathSaveCritThreshold` and renders a "on a roll of N+ you regain 1 HP" chip ONLY below the RAW default 20 — source-agnostic numeric interpolation, no display-name leak (rule 7).
- [x] Auto-derive **Bloodied** from HP (`isBloodied` — `current > 0 && current ≤ ⌊effectiveMaxHp/2⌋`, the EFFECTIVE max so an Aid / hp-flat boon shifts the band) and surface a Bloodied mark on the HP control (`HeaderHpControl`, via the shared `useHpControls().bloodied`). The two Bloodied boon TOGGLES (Desperate Resilience, Furious Storm) are gated by the `-bloodied` activeKey suffix → `activatableToggles` carries `bloodiedGateUnmet` so the bar HINTS the precondition when not Bloodied (override-first, never hard-locked). The descriptive Bloodied features (Hungering Might, Last Stand, Sanguine Feast) self-state their "while Bloodied" precondition in their SRD text + the Champion Heroic Rally regen already surfaces conditionally; a dynamic per-feature-card highlight is a noted follow-up (it would thread `isBloodied` through the whole Features view).
- [x] `blockedSlots` → the **"what's limiting you this turn" banner** (2026-07-06). The Incapacitated/Stunned/Paralyzed family's forbidden action/bonus/reaction slots now surface as a `blockedEconomy` limiter in `composeTurnLimiters` ("You can't take Action, Bonus, Reaction (Stunned)"), reusing the SAME first-active-condition cause-naming as the other limiters. `breaksConcentration` stays OUT (owned by the concentration banner — DRY); depleted pools / already-spent economy stay out (shown on the coins/cards — golden rule 19). This is a SECOND consumer of `blockedSlots` alongside the persistent card disabled-state. Render-site: the `.turn-limiters` banner (`ThisTurnTracker`). Guard: `combat-action-log-type.test.ts` (composer order) + `this-turn-condition-projection.test.tsx` (banner text).

### S6 — play UI for modeled catalogues _(workstream A; defects B, D)_

Maneuvers + Metamagic + Cunning Strike + alt-recovery/alt-cost as one-tap combat affordances.
**SHIPPED (2026-06-22 + 2026-06-24):** Cunning Strike, the pack maneuvers, alt-recovery, and
alt-cost play in PlayTab / TurnEconomyProvider; the final three play affordances — **Metamagic
per-cast modal, EK War Magic note, familiar enhancements** — landed 2026-06-24 (S6 complete).

- [x] Cunning Strike / Improved / Devious Strikes / Scion Strike Fear options as a forgo-dice disclosure on the Sneak Attack commit. Consumer: `resolveCunningStrikeOptions` (DC + cost + maxSimultaneous) → `CunningStrikeOptions` in PlayTab. Render-site: an options disclosure on the immediate-commit Sneak Attack card.
- [x] The 20 pack maneuvers as combat rows (die spend + DC). Consumer: the `granted-action` aggregate resolved through `TurnEconomyProvider`. Render-site: PlayTab action list.
- [x] 10 Metamagic options as per-cast affordances (SP debit + per-option effect). Consumer: `metamagicOptionsForCast` (`lib/cast-options.ts`) + the shared `resolveMetamagicForCast`/`remainingSorceryPoints` (`lib/views/spell-cast-sources.ts`), surfaced as an amethyst multi-select chip row in `CastLevelModal` and debited from the `sorcerer-font-of-magic` pool in BOTH cast paths (`TurnEconomyProvider.commitCastOption` + `SpellsTab.castAtLevel/castFreeAt/castMastery`), undoable. Applicability (Heightened→save spells, Quickened→Action-time) is data-driven on the option id (`appliesWhen`), never a name regex. Render-site: the cast modal.
- [x] Alt-recovery buttons (`resolveAltRecovery` — Sorcerer SP-restore family, Know Your Enemy, etc.) → ResourceRail; alt-cost picker (`getActionCostOptions` — Druid Wild Companion slot-or-use) → TurnEconomyProvider. Render-site: the rail tracker row. **Extended 2026-06-26:** `AltRecoveryCost` is now a discriminated union — the existing pool-funded `{ amount, fromTracker }` plus a SLOT-funded `{ fromSpellSlot: <minLevel> }` variant for the two "restore by expending a level N+ spell slot" features (Cleric Divine Foreknowledge → 6, Ranger Persistent Wrath → 4). Consumer: `resolveSlotAltRecovery` (pure, reads live unspent slots) → `recoverTrackerByMinSlot` (spends the cheapest eligible slot, restores one use, undoable) → a second rail affordance ("spend a level N+ slot → recover"). Closes the previously-recorded slot-funded model gap.
- [x] EK War Magic note (`resolveReplaceAttackWithCast`, capped at `attacksPerAction`). Consumer wired into PlayTab — a display-only amethyst badge ("Replace 1 attack with a cantrip/spell") in the attacks-per-action cluster, keyed off the rider's numbers (`maxSpellLevel`); no debit. Render-site: the Attack-action affordance.
- [x] Investment of the Chain Master (`resolveFamiliarEnhancements`). Consumer wired into the invocation compendium spec (`specs/invocation.tsx`) — a display-only `InfoCard` callout (Fly/Swim 40 ft, Quick Attack, damage conversion, the owner's spell save DC via the spells-view presenter, Reaction Resistance) shown ONLY for `investment-of-the-chain-master` in character context. Render-site: the invocation detail `extras`.
- [x] **Metamagic applies to CANTRIPS (G6/W3, defect C).** _Landed 2026-06-24._ Dropped the blanket `if (spell.level === 0) return []` in `resolveMetamagicForCast`; the per-option `appliesWhen` predicate now decides for cantrips too. Added structured conditions `requiresDamage` (Empowered/Transmuted), `requiresAttack` (Seeking), and `excludesCantrip` (Extended/Twinned — neither is possible on a cantrip per RAW) alongside the existing `requiresSave` (Careful/Heightened) + `requiresActionCastingTime` (Quickened); `metamagicOptionsForCast` reads the spell's `level`/`damageDice`/`attackType` facts. So Fire Bolt offers Empowered/Quickened/Distant/Seeking/Transmuted (not the save/cantrip-excluded ones) and Sacred Flame offers Heightened/Careful. The slotless cantrip cast path is wired in `SpellsTab.castCantrip` (debits the Metamagic SP, spends NO slot, undoable) via a new `kind:"cantrip"` cast option + a footer Cast button in `CastLevelModal`. Render-site: `CastLevelModal`.
- [x] **Enforce ONE Metamagic option per cast (BUG-6, defect E).** _Landed 2026-06-24._ Added `stacksWithPrimary?: boolean` to `SrdMetamagicOption` (TRUE on `empowered-spell` + `seeking-spell` only — the two whose SRD text carries "you can use … even if you've already used a different Metamagic option"; verified against `dnd2024.wikidot.com/sorcerer:metamagic`). The pure reducer `toggleMetamagicSelection` (`lib/cast-options.ts`, shared by both cast modals) enforces it: a primary swaps in as the SOLE primary (drops any other primary, keeps the stackers), Empowered/Seeking add on top. SP cost = sum of the selected options. The modal surfaces the rule (`metamagic.onePrimaryRule`) + a swap hint (`metamagic.swapsPrimary`). Render-site: the cast modal.

### S7 — form-swap model _(workstream A; defects A, C)_

A stat-block swap primitive: Wild Shape (AC / attacks / speeds / scores / CON-save), the Armorer's
model-weapon attack rows, and the Starry Form Archer ray all now resolve into rendered attack rows
gated on the lit form (and, where the form has variants, the chosen option). **Polymorph / True
Polymorph SELF-swap is now SHIPPED for Phase 1** — the NEW primitive (CR-indexed Beast catalogue +
per-cast form picker + override-first self-swap applicator) landed; see the Polymorph item below.

- [x] Wild Shape (+Moon Circle Forms) — swap AC / attacks / speeds / ability scores / CON-save on assuming a form, and the Moon max-CR cap. Render-site: a form stat-block applied at the active-form toggle. **CLOSED** — AC-swap (formula + override-first), form attack rows, the while-active CON-save toggle, the speed-swap (declared movement modes auto-rendered + the per-beast walking/fly/swim/climb override-carried), the STAT-swap (the beast's STR/DEX/CON override-carried in `abilityScores`, so the concentration CON-save uses the beast's CON per RAW), and the max-CR override all shipped; see the sub-items.
  - [x] **max-CR override — DONE + PINNED, 2026-06-25.** The Wild Shape rider chip (`wildShapeMaxCR` passthrough) read the BASE druid cap (1/4 → 1/2 → 1) for EVERY druid, ignoring the subclass — so a Circle of the Moon druid showed CR 1 at every level ≥ 8 instead of the RAW Circle Forms cap. 2024 RAW (`dnd2024.wikidot.com/druid:circle-of-the-moon`): **"The maximum Challenge Rating for the form equals your Druid level divided by 3 (round down)"** — from L3 (Circle Forms). FIXED at the ONE seam the rider already reads: `featureClassRow` now substitutes `wildShapeMaxCR` = `floor(druid level / 3)` via `moonWildShapeMaxCROverride` when the owning druid entry's `subclassId === "circle-of-the-moon"` and the druid level ≥ 3 (branches on the stable subclassId, rule 7; resolved at the druid class level, rule 5; the static table is never mutated). Non-Moon druids keep the base table cap (declare the LEAST — only Moon diverges, rule 2). Both rider call-sites (`resolveFeatureRider` for the Features page + the rail tracker chip) flow through this seam, so the cockpit chip and any reader stay consistent by construction (rule 6). No new grant kind, no new value fabricated, no new string (numeric passthrough). Regression: `tests/unit/feature-rider-parity.test.ts` — Moon caps at floor(level/3) (L4→1, L6→2, L9→3, L15→5, L18→6) while a non-Moon druid (L4) and a Circle of the Land druid (L8) keep the base cap; fail-before proven (the pre-fix value read 1/2 / 1).
  - [x] **AC-swap — DONE + HARDENED across all three named forms.** The active while-active AC formulas (`agg.acFormulas`, already gated to the lit toggles) thread into the canonical `computeCharacterAC`/`computeCharacterAcBreakdown`, so a lit Moon form (13 + WIS), an active Mage Armor (13 + DEX `no-armor`), Shield/Shield-of-Faith (`ac-bonus` +5/+2), and a Barkskin floor (17, `always`) all reach the DISPLAYED AC — taken as the MAX vs the body AC, override-first. Routed through the ONE helper, so cockpit chip + AC medallion tip + Inventory/PDF/roster-snapshot all reflect it by construction (rule 6). Gated on stable keys + the formula `condition` only (rule 7). **The three forms the audit named, ruled per 2024 RAW:** (1) **Circle of the Moon** Wild Shape — a FORMULA (13 + WIS, `while-active`, MAX-vs-Beast-AC per RAW) — auto-computed + rendered; (2) **generic (non-Moon) Wild Shape** — the beast's NATURAL AC is a per-beast value with NO formula, so it is left to the override-first `acOverride` (which renders + auto-wins — declare the LEAST, never fabricate a wrong AC); (3) **2024 Armorer's Arcane Armor** — RAW sets NO fixed AC (it keeps the worn armor's AC: no STR req / quick don-doff / spellcasting focus only), so it correctly carries NO `ac-formula` (the 2014 "base 15 + DEx interplay" does not exist in 2024). Regression: `tests/unit/active-buff-ac.test.ts` — the value path (`effectiveAC`) AND the NEW keystone breakdown path (`computeCharacterAcBreakdown` shows the `formBase` SOURCE when lit, the body composition when off, override-wins; fail-before proven by dropping `agg.acFormulas`) — plus the `combat-header.test.tsx` chip-wiring case and the `compute.test.ts` form-parts case. Mechanic documented in `docs/MECHANICS.md` (the `ac-formula` row).
  - [x] **speed-swap — DONE + PINNED (correct-by-design, OVERRIDE-FIRST), exactly parallel to the AC-swap above.** Per 2024 RAW (`druid:main` Wild Shape: "Your game statistics are **replaced by the Beast's stat block**" — which includes its SPEEDS) the form's speeds apply, BUT a beast's walking speed is a PER-BEAST value with NO formula (every stat block differs), so — like the beast's natural AC — it rides override-first, NEVER fabricated: the walking-Speed vital pins it via `character.speedOverride` and each non-walking row via `character.speedOverrides[fly|swim|climb]` (LeftHud reads `speedOverride ?? effectiveWalkingSpeedFt(...)` / `speedOverrides[kind] ?? computed`, edit + reset-to-auto). **Circle of the Moon grants NO speed** (confirmed against `druid:circle-of-the-moon`: it grants ONLY Challenge Rating + AC `13 + WIS` + 3×level temp HP — no fixed walking/fly/swim speed), so no Moon form declares a fixed walking speed to wire — declare the LEAST (rule 2). **What IS auto-modeled + rendered is the DECLARED while-active movement MODE**: a feature/spell that grants a Fly/Swim/Climb Speed only while its toggle is lit (Circle of the Sea Stormborn → a Fly Speed `equal-to-walking` while Wrath of the Sea is active; Draconic Sorcery wings; Beast Barbarian forms; …) — these flow through the SAME `while-active` recursion the form AC uses (`applyGrant` descends into a lit block) → the aggregate `flySpeed`/`swimSpeed`/`climbSpeed` → the presenter `deriveSensesAndSpeeds` → the LeftHud speed rows, with the `equal-to-walking`/`twice-walking` sentinels resolved against the EFFECTIVE walking Speed; gated off (the row retracts) when the toggle isn't lit. **No new grant kind, no new value fabricated** — the seam was already complete; this ticked it after an end-to-end TRACE. Regression: `tests/unit/active-form-speed.test.ts` — the WHOLE seam (real Sea Druid → `session.activeFeatures` → aggregate → `deriveSensesAndSpeeds` speed rows): the Fly row surfaces when lit + retracts when off + resolves the sentinel against the effective walking Speed (fail-before proven by short-circuiting the `while-active` recursion so the form speed never reaches the aggregate), plus the override-first walking + per-mode pins win (rule 8). Gated on stable keys + the grant kind only (rule 7). Mechanic documented in `docs/MECHANICS.md` (the `fly-speed`/`swim-speed`/`climb-speed` rows). **CON-save toggle** already shipped (Increased Toughness `save-bonus` WIS→CON inside the `while-active` block, `druid-moon-improved-circle-forms`); the form ATTACK ROWS shipped earlier (S7 `form-attack`).
  - [x] **stat-swap + concentration CON-save — DONE + PINNED (correct-by-design, OVERRIDE-FIRST), exactly parallel to the AC / speed swaps above.** 2024 RAW (`druid:main` Wild Shape → **Game Statistics**): "Your game statistics are replaced by the Beast's stat block, but you retain ... **Intelligence, Wisdom, and Charisma scores** ...". So STR/DEX/CON are NOT retained — the beast's physical scores replace yours; only the three MENTAL scores stay. A beast's STR/DEX/CON is a PER-BEAST value with NO formula (every stat block differs), so — exactly like the beast's natural AC / walking speed — it rides OVERRIDE-FIRST: while transformed the player sets the beast's physical scores into the stored `character.abilityScores`, NEVER fabricated (declare the LEAST, rule 2). The effective-scores family (`effectiveAbilityScores`) layers item floors/bonuses on top of that SAME field (no double-count vs B4/B8 — those only ADD to the stored base), and every combat/save/cast consumer reads from it (rule 6). **THE SUBTLE ONE — the concentration CON-save while transformed:** RAW **No Spellcasting** ("shape-shifting doesn't break your Concentration") means a transformed Druid still rolls a CON save to MAINTAIN concentration — and because CON is replaced (not retained), that save uses the **BEAST's CON**. The engine gets this BY CONSTRUCTION: `characterStore.applyDamage` resolves `effectiveScores` ONCE and feeds `effectiveScores.CON` into `savingThrowBonus` for the concentration-save toast (B8), so the override-carried beast CON drives the save with zero special-casing. **No new grant kind, no new value fabricated, no per-beast stat declared** — the seam was already complete; this ticked it after an end-to-end TRACE. Regression: `tests/unit/character-store.test.ts` ("S7 — the Concentration CON save uses the BEAST's CON while Wild-Shaped") — the WHOLE store seam (real Druid concentrating → `applyDamage` → effective scores → `savingThrowBonus` → toast intent): the same Druid's concentration-save total moves by exactly the CON-modifier delta when the override-carried CON changes (body 14 → beast 18 ⇒ +2), proving the stat-swap reaches the save consumer (fail-before proven by feeding `savingThrowBonus` a constant CON so the override never reaches the save). Override-first throughout (a manual `savingThrowBonusOverrides.CON` still wins, rule 8). The whole S7 form-swap line is now closed.
- [x] **Armorer Arcane Armor model-weapon attack rows — DONE + PINNED (override-first), gated on the CHOSEN model. FIXED 2026-06-25.** The form-attack rows existed but always showed BOTH weapons and used the 2014 "Thunder Gauntlets" name with no Dreadnaught. Now gated on BOTH the donned-armor toggle AND the chosen Armor Model: a `choice-grant-bundle` (`bundleKey: "armorer-armor-model"`) nested inside the `while-active` Arcane-Armor block — the SAME pattern Monk Elemental Epitome / Barbarian Wild Heart use, so the existing rail `GrantBundleSelector` surfaces the model picker (Dreadnaught/Guardian/Infiltrator) and switching the model SWAPS the attack row; doffing the armor (toggle off) clears it. Modeled all THREE 2024 RAW models (`dnd2024.wikidot.com/artificer:armorer`): **Dreadnaught** Force Demolisher (Simple Melee, Reach, 1d10 Force → 2d6 at L15, push/pull reminder), **Guardian** Thunder Pulse (Simple Melee, 1d8 Thunder → 1d10 at L15, Disadvantage-on-others on-hit reminder), **Infiltrator** Lightning Launcher (Simple Ranged 90/300, 1d6 Lightning → 2d6 at L15, once-per-turn +1d6 Lightning rider). All three add INTELLIGENCE to attack & damage (effective-INT per B7 — a Headband lifts the to-hit) and are always proficient. **The minimal seam:** propagate the wrapping `while-active` `activeKey` through the `choice-grant-bundle` evaluator branch (a bundle nested in a lit form inherits the toggle, so its `form-attack` stays gated by both); extend `form-attack`/`FormAttack` with `oncePerTurnExtra` (folds into the existing `summary.extraDamage` chip — REUSING the `damage-rider` channel) + a catalogue-keyed on-hit `note` (presence-driven via `hasGrantField`, like `granted-action`'s `description`, routed to `summary.effect`). The L15 die bumps ride the existing `damageDieByLevel` (S12b). NO AC-swap (2024 Arcane Armor keeps the worn armor's AC — correctly carries no `ac-formula`). Old "Thunder Gauntlets" srd keys + the un-gated structure DELETED (rule 10). Regression: `tests/unit/form-swap-attacks.test.ts` — engine gating (no model → no row; each model shows ONLY its weapon; guardian↔infiltrator swap; the Disadvantage `note` + the Infiltrator `oncePerTurnExtra`) + the end-to-end `resolveActions` wiring (Headband Guardian Thunder Pulse +6 effective-INT with the `effect` reminder; switching to Infiltrator swaps to the Launcher with the +1d6 `extraDamage` chip). Fail-before proven (the bare-toggle armorer no longer yields rows without a model; old weapon ids 404). EN + IT keys added for the three weapons, the model labels, and the two reminders (IT SRD 5.2.1 terms: Demolitore di Forza / Impulso Tonante / Lancialampi).
- [x] **Starry Form (Circle of the Stars) Archer attack row — DONE + PINNED (override-first), gated on the lit form AND the chosen constellation. FIXED 2026-06-25.** The Archer ray's `form-attack` row existed but was a SIBLING `while-active` block gated on the Starry Form toggle ALONE — so the Archer ray leaked onto the Play board even when the player had chosen Chalice or Dragon (or NO constellation). Now gated on BOTH the `druid-stars-starry-form` toggle AND the Archer choice: the constellation chooser (`choice-grant-bundle`, `bundleKey: "druid-stars-constellation"`) was moved INSIDE the form's `while-active` block and the Archer `form-attack` was nested into the `archer` OPTION alongside its rail aura — the SAME pattern the Armorer Armor-Model uses (the wrapping `activeKey` already propagates through the `choice-grant-bundle` evaluator, so the inner form-attack stays gated by both). The existing rail `GrantBundleSelector` surfaces the Archer/Chalice/Dragon picker (no new UI); switching to Chalice/Dragon RETRACTS the Archer row; dismissing the form clears the picker + every constellation benefit (RAW: "your choice gives you certain benefits **while in the form**"). 2024 RAW (`dnd2024.wikidot.com/druid:circle-of-the-stars`): the Archer is a Bonus-Action **ranged spell attack** (WIS to-hit), one creature within **60 ft**, **Radiant** damage = **1d8 + WIS** (→ **2d8 + WIS** at druid L10, Twinkling Constellations — rides the existing `damageDieByLevel`, S12b). **No new grant kind, no new value fabricated** — pure data restructure reusing the Armorer seam + the i18n keys re-pathed to the nested location (EN + IT already present: Archer/Arciere, the ray name). **Chalice + Dragon** stay PASSIVE riders (not attacks): Chalice = a heal aura (1d8/2d8 + WIS within 30 ft on a HP-restoring slot cast), Dragon = a `roll-floor` aura (treat a d20 ≤9 as 10 on INT/WIS checks + CON Concentration saves) — both surface their rail formula via the existing `aura` kind and are now form-gated too; the L10 Dragon Fly-20/hover remains the only open Stars sub-item (tracked under G20/Twinkling). Regression: `tests/unit/form-swap-attacks.test.ts` — engine gating (form off → no row even with Archer chosen; lit + no constellation → no row; Archer → the ray with WIS to-hit + activeKey + the L10 die bump; Chalice/Dragon → no row; switching away from Archer retracts it) + the end-to-end `resolveActions` wiring (the ray reaches an attack row that RENDERS, +WIS to hit, radiant, localized EN "Starry Form: Archer" / IT "Forma Stellare: Arciere", 2d8 at L10). Fail-before proven (the un-gated structure leaked the row for Chalice/Dragon/no-choice — exactly the 5 new assertions failed on the pre-change data). Dev scenario `stars-archer` added for in-app verification. The `aggregated-primitives` aura-merge + `resource-rail` picker tests updated for the now-form-gated benefits.
- [x] **Polymorph / True Polymorph SELF-swap — SHIPPED (Phase 1), 2026-07-06.** The NEW primitive landed: a **CR-indexed Beast stat-block catalogue** (`src/data/beasts/*` — a curated starter set of ~18 iconic combat forms CR 1/4→8, ids+numbers only; names in the new `beasts` srd catalogue), a **per-cast Beast-form picker** (`BeastFormPicker`, opened from the Polymorph / True Polymorph spell card's "Transform" affordance, CR-gated by `resolvePolymorphForms` — form CR ≤ the caster's level), and the **override-first SELF-swap applicator** (`assumePolymorphForm` / `dropPolymorphForm` in `characterStore` + the pure `polymorphBuildPatch` in `lib/polymorph.ts`). Assuming a form STAMPS the Beast's AC → `acOverride`, walk/other speeds → `speedOverride`/`speedOverrides`, all six ability scores → `abilityScores` (RAW: Polymorph replaces ALL statistics, unlike Wild Shape), applies **Temp HP = the Beast's HP** (the `gainTempHp` max-wins seam), and engages Concentration by spell id — every stamped value stays hand-editable (override-first). The Beast's own PRINTED attack rows render on the Play board, resolved DIRECTLY from the catalogue at the render edge (`resolveBeastFormAttacks`, keeping `form-attack` unchanged — self-contained to-hit + dice, never re-scaled). The form ends on any of FOUR triggers — a manual Revert, **Temp-HP depletion** (2024 RAW's PRIMARY end-trigger: `applyDamage` ends the form the instant its Temp HP hits 0, OUTRIGHT — no Concentration maintenance save, routed through the `concentration-dropped` beat), the caster reaching **0 HP** (subsumed by Temp-HP depletion, since Temp absorbs first), and a **Concentration drop/swap** (`setConcentration` — casting another Concentration spell or clearing concentration ends the form, since the form's spell IS its sustaining Concentration) — each RESTORING the caster's own body + retracting the Temp HP from a session snapshot (`session.polymorphForm.prior`), all undoable (the manual-clear undo restores the whole pre-clear doc). Because the app models ONE character, polymorphing **another creature** is a **read-only reference card** in the picker (no second modeled character, no override writes) — consistent with the single-sheet architecture. The stat-swap reaches the **Concentration CON-save by construction** (the override-carried Beast CON drives `applyDamage`'s effective-CON save). Regression: `tests/unit/polymorph.test.ts` (catalogue integrity, CR gate, the whole self-swap seam → AC/speed/score/CON-save/attack-row, temp-HP retract-on-drop, undo). **Phase 2 — SHIPPED (2026-07-07):** the FULL CR 0-8 Beast catalogue is filled against the same `BeastStatBlock` shape — 73 more source-verified forms (CC-BY SRD 5.2.1 text, cross-checked against the 2024 XMM bestiary data) spanning CR 0-6, bringing the catalogue to 91 total forms (a `damageDice` may now be a bare flat integer for the weakest CR-0 beasts, and one CR-0 form — the Seahorse — genuinely prints zero attacks); True Polymorph's arbitrary NON-Beast creature/object forms remain narrative/override-first (out of scope by design). **Known read-only limitations (accepted, minor):** (a) the **reference-mode CR gate uses the CASTER's level** rather than the polymorphed target's own level/size (read-only reference card — the app models one character); (b) a form's **NON-walking speeds (fly/swim) do not surface as new LeftHud speed rows on the SELF sheet** — exact parity with the accepted Wild-Shape override-first speed limitation (a generic beast's per-mode speed has no formula, so it rides `speedOverrides` override-first, never fabricated as a row); the read-only **reference card DOES show** every non-walking speed + the beast's senses. The spell-DATA facts (level/school/`concentration: true`/WIS save + the 2024 IT SRD 5.2.1 names "Metamorfosi"/"Metamorfosi pura") stay pinned by `tests/unit/spell-data-integrity.test.ts`.
- [x] **Monk Martial-Arts die upgrades the Monk-WEAPON printed die (G10/W5, defect C) — FIXED 2026-06-24.** The MA die replaces the printed die of Unarmed **or Monk weapons** (Shortsword 1d6 → 1d8 at L5; a 1d4 Monk weapon → 1d6 even at L1). Added a `dieUpgrade` field on the existing `weapon-attack-ability` grant (the smaller, cleaner diff vs a new kind); the shared pure `effectiveWeaponDie` takes `max(weaponDie, martialArtsDie)` in BOTH weapon resolvers (the combat carried-row + inventory-view), resolved at the Monk's OWN level (multiclass-correct, via `featureClassRow`), mirroring `effectiveUnarmedStrike`. (Correctly upgraded the live Monk fixture's carried Dagger 1d4 → 1d6 at Monk L3 — RAW, fixture `.json` unchanged.)
- [x] **Form attacks must use EFFECTIVE scores for mental/spellcasting forms (B7, defect C). FIXED 2026-06-24.** `resolveFormAttacks` was called with `charData.abilityScores` (raw) while sibling resolvers use effective scores — Armorer + Headband of Intellect (sets INT 19) showed Thunder Gauntlets at +2 not +4; same for Starry Archer (WIS). FIXED exactly as prescribed (NOT a blanket swap): `resolveFormAttacks` now takes both score maps and selects EFFECTIVE when `fa.attackAbility` is set (mental/spellcasting forms), keeps RAW for physical Wild Shape natural weapons (an item STR floor does not carry into beast form). See the B7 entry under "Confirmed correctness bugs" for the full trace + regression.
- [x] **Stars Twinkling Constellations scaling 1d8 → 2d8 at L10 (G20/W6, defect C). FIXED 2026-06-25 (S12b).** The NEW `diceByLevel` field was added to the `aura` `ranged-attack`/`heal` effect kinds AND `damageDieByLevel` to the `form-attack` grant, with new consumer branches in `auraVMs` + `resolveFormAttacks` resolving via the SHARED `pickDiceByLevel` (the same "highest threshold ≤ level" rule `ActionAttack.diceByLevel` uses; the private smart-tracker `pickByLevel` was deleted in favour of it). The Stars Archer/Chalice die now resolves 1d8 below L10 and 2d8 at L10 on both the rail aura formula and the Archer attack row. `druid.ts` carries the level maps (`{ 3: "1d8", 10: "2d8" }`) instead of a hardcoded die.

### S9 — item charge-cast pipeline _(workstream A; defects B, C, D)_

Wand/staff charge items now emit a real cast row through the SAME `free-cast-spell` seam feats use,
debiting an item-charge tracker; consumed buff potions arm a round countdown.

- [x] Wand/staff/rod charge items emit a "Cast (charge)" row through the existing cast seam, debiting an item-charge tracker (= the item id) — Wand of Magic Missiles → Magic Missile (7 charges), Staff of Healing → Cure Wounds (10). A paired `always-prepared-spell` grant surfaces the spell on the Play board for any wielder; the charge pool shows + is editable in the rail Resources (`resolveFreeCastItemTrackers`, recovery `dawn`). `isDepletedAction` resolves depletion from `resolveSpellCastOptions` (a charged spell is never greyed while it has charges, even on a non-slot caster).
- [x] **Single-fixed-spell renewable-charge caster family — FULLY CLOSED, 13 enumerated members, 2026-06-25 (final: a pack-side weapon).** Every item whose RAW is "expend 1 charge to cast ONE fixed named spell from it" with a dawn-renewing pool AND whose spell exists in `data/spells/**` now rides the SAME grant pair (pure DATA add, no new grant kind, no new i18n string — names resolve through the srd catalogues). The full ENUMERATED membership:
  - **Wands:** Wand of Magic Missiles → Magic Missile (7 ch.), Wand of Web → Web (7 ch., save DC 13), Wand of Fireballs → Fireball (7 ch., DC 15), Wand of Lightning Bolts → Lightning Bolt (7 ch., DC 15), Wand of Polymorph → Polymorph (7 ch., DC 15), Wand of Magic Detection → Detect Magic (3 ch., regains 1d3 at dawn).
  - **Non-wand wondrous items (the closure fix — IDENTICAL mechanic, different `type`):** Helm of Teleportation → Teleport (3 ch., regains 1d3 at dawn), Medallion of Thoughts → Detect Thoughts (5 ch., DC 13, regains 1d4 at dawn), Eyes of Charming → Charm Person (3 ch., DC 13, regains all at dawn).
  - **Weapons that cast a fixed spell from charges:** Trident of Fish Command → Dominate Beast (3 ch., DC 15, regains 1d3 at dawn), plus 2 pack-side weapons (a Summon Celestial mace, 6 ch., regains 1d6; a Dominate Beast artifact trident, 3 ch., DC 20, regains 1d3).
  - **Staff (single-cast half):** Staff of Healing → Cure Wounds (10 ch.).
    **The full ENUMERATED membership (13 items) — the family is exactly these, no more:** the 6 wands (Magic Missiles, Web, Fireballs, Lightning Bolts, Polymorph, Magic Detection), Staff of Healing, the 3 wondrous (Helm of Teleportation, Medallion of Thoughts, Eyes of Charming), Trident of Fish Command, and the 2 pack-side weapons. A 39-candidate enumeration (2026-06-25) found the final un-wired member — a pack-side weapon carrying the byte-identical mechanic to Trident of Fish Command (Dominate Beast, 3 charges, regains 1d3 at dawn) but lacking the pair — now wired, completing the closure. (The prior adversarial re-verify had already added the five then-missing non-wand items — Helm of Teleportation, Medallion of Thoughts, Eyes of Charming, Trident of Fish Command, and a pack-side mace — after the claim was OVERSTATED as a wand-only closure.) The artifact trident keeps its standing initiative-advantage grant; the cast pair is ADDED, not replacing it. The wikidot save DC / `+9 to hit` is the item's fixed value for a non-caster wielder and stays prose; the engine resolves the spell's DC/attack from the wielder. The multi-charge UPCAST clause (Fireball/Lightning/Magic Missile/Eyes-of-Charming "expend extra charges to raise the level"), Polymorph's beast-form stat-swap, the tridents' "Beast with a Swim Speed" target restriction, the pack mace's fixed spell-attack rider, and the pack trident's SEPARATE charge-FREE once-per-dawn cast (it does NOT touch the 3-charge pool → a single-fixed-spell **charge-pool** caster it is not) all stay the player's manual spend / narrative — only the base charge-pool CAST affordance + the charge tracker are modeled. **Correctly EXCLUDED:** **Ring of Three Wishes → Wish** — its 3 charges NEVER regain (the ring becomes nonmagical on the last charge), so `rest: "long"` would mis-model it as renewable, and no non-renewing-finite-charge primitive exists → it is left UNWIRED **by design** (the only single-fixed-spell caster outside the family); the **multi-spell item-casters** — Wand of Binding / Wand of Fear / Ring of Animal Influence / Staff of Charming (cast ONE OF several spells from the charge pool → multi-spell choice, not a single fixed spell — these are NOT part of this single-fixed family; they SHIPPED as their own `free-cast-from-list` item-pool family, see the dedicated bullet below); Wand of Paralysis (an inline ray EFFECT applying Paralyzed, no named spell to free-cast); Wand of Wonder (random effect); and the non-spell utility wands (Secrets / Enemy Detection / Conducting / Pyrotechnics / the War Mage attack-bonus wand).
- [x] **Multi-spell item-casters (cast ONE OF several spells from one charge pool) — SHIPPED 2026-07-06.** Four items cast one of several spells from a shared charge pool: **Wand of Binding** (7 ch., regain 1d6+1 at dawn — Hold Monster **5** / Hold Person **2**), **Wand of Fear** (7 ch. — Command **1** / Fear **3**, both real spells, per-spell-different cost), **Ring of Animal Influence** (3 ch., regain 1d3 — Animal Friendship / Fear-beasts→Animal Friendship / Speak with Animals, **all 1**), **Staff of Charming** (10 ch., regain 1d8+2 — Charm Person / Command / Comprehend Languages, **all 1**, plus a Reaction redirect that stays narrative). Per-spell costs RAW-confirmed against the wiki + D&D Beyond. **Built by reusing `free-cast-from-list`** (Divine Intervention / War God's Blessing) — NO new grant kind: (1) a per-entry `spellCosts?: Record<string,number>` sidecar on the grant/`FreeCastFromListEntry`/evaluator → the consumer expands it into `FreeCastFromListPool.costBySpell` (default 1 for EVERY eligible spell, single source — golden rule 6), so the two feature pools that omit it are byte-unchanged; (2) a NEW **item→multi-spell-pool action bridge** `resolveItemPoolCastActions` (`smart-tracker.ts`, sibling of `resolveFreeCastItemTrackers`) walking the SAME equipped/attuned magic-item sources — for each source carrying a `free-cast-from-list` grant it emits ONE `RawResolvedAction` (`item-cast-<itemId>`, `costTracker=<itemId>`, slot `action`) into `resolveActions`, so the EXISTING `handleSelect` `costTracker`→pool match opens `DivineInterventionModal`; (3) `freeCastItemChargeMax` now also reads a `free-cast-from-list` grant's `chargesPerRest`, so the shared charge pool surfaces the SAME rail/inventory row single-fixed wands use; (4) the modal renders a per-row charge-cost chip + DISABLES a row when `remaining < cost`, keyed off the item-pool `sourceId`; (5) the confirm debits `useTracker(itemId, costBySpell[spellId])` and the undo restores EXACTLY that cost (fixed the prior hardcoded-`1` debit/undo). Each item also carries `always-prepared-spell` grants so its pool spells show on the Spells page (mirrors the single-fixed wands). Dawn dice-regain stays narrative (recovery `dawn`, never auto-refilled). Guard: `tests/unit/multi-spell-item-cast.test.ts` (the wired data shape + per-spell costs), `item-pool-cast-actions.test.ts` (the bridge + resolved pool), `item-pool-cast.test.tsx` (end-to-end debit/undo of the exact variable cost), `divine-intervention-modal.test.tsx` (the cost chip + disabled row). Render-site: the item's Play-board pool-picker card → `DivineInterventionModal`.
- [x] Consumed buff potions (Speed = 10 rounds, Giant Strength/Invisibility/Flying/Climbing/Resistance/Water Breathing = 600) arm a self-sustaining `potion:<id>` countdown in the A2 `effectTimers` map (`durationRounds` data + `consumePotionBuff` undoable store action), counted down + auto-expired at the End-Turn seam, surfaced as an "Active Potions" rail banner. Override-first — informational, never auto-applies the buff's stats. (Instant potions like Healing carry no `durationRounds` → no timer; Growth's variable 1d4 h stays manual.)
- [x] Set-score items (Headband of Intellect, Belt of Giant Strength…) reach attack/damage/DC math via `combatAbilityScores` → `effectiveAbilityScores(stored, abilityScoreFloors, itemBonus, itemCaps)`. The ADDITIVE item path (Belt of Dwarvenkind +2 CON, the six +2 Ioun stones) now rides the same chokepoint via the magic-item-only `itemAbilityScoreBonus` channel — see the correctness batch below.

### S8 — one-tap apply of computed numbers _(workstream A; defect E — supporting)_ **SHIPPED 2026-06-24**

Temp-HP "Gain N" cards, heal verdicts, regen-at-turn-start: the number is computed, the user re-typed
it into the HP control. One tap now applies (max-wins for temp HP), undoable. **Golden rule 21 gate:
DETERMINISTIC numbers (fixed formulas) one-tap-apply; DICE values NEVER auto-roll — they show the
formula + a roll-entry-then-apply input (the player supplies the die result; the app adds the fixed
part) or stay display-only. The app never fabricates a die total.**

- [x] **One-tap apply for slot-LESS DETERMINISTIC temp-HP grants** (Dark One's Blessing, Celestial Resilience, Vitality of the Tree, Inspiring Leader — all `CHA+level` / `level` / `max(WIS,CHA)+level`, dice-free by construction). The standalone `temphp-<sourceId>` card now carries the resolved amount as a structured `useEffects:[{kind:"temp-hp",amount,sourceId}]`; committing it applies via the store `gainTempHp` seam (ONE max-wins seam, golden rule 6) with the existing undo + `useGainedTempHp` toast — no re-typing. The slot-GATED case (Orc Adrenaline Rush) already auto-applied through its action card (the reference path this mirrors). `smart-tracker.resolveTemporaryHpActions` + `TurnEconomyProvider.commitAction`.
- [x] **One-tap apply for the regen-at-turn-start banner** (Heroic Rally: 5+CON while Bloodied — DETERMINISTIC). The banner gained a one-tap "Heal N" button (`combat.turnStartRegenApply`) that calls `applyHealing(amount)` (clamped to effective max, logs `hp-heal`) with an undoable heal toast (`onUndo: setHP(prev)`), reusing the `conc-banner-drop` recipe (golden rule 3). `ThisTurnTracker.applyRegen`.
- [x] **Roll-entry-then-apply for the Second Wind dice heal** (`1d10 + Fighter level` — DICE). The card shows the formula + a roll-entry: the player enters their externally-rolled d10, taps "Heal +N", and the app applies `enteredRoll + level` via `applyHealing` (clamped, undoable). Golden rule 21 — the d10 is NEVER auto-rolled/averaged. The presenter emits a structured `summary.healApply:{dice,bonus}` (the deterministic bonus is multiclass-correct, the owning class level). `combat-action-view` + `PlayTab.HealRollEntry`.
- [ ] **DEFERRED (DICE — display-only, NOT one-tap):** the pack-species Healing Hands (PB×d4 — now SURFACED via `ActionHeal.diceCount:"PB"`, G18 FIXED 2026-06-25; still display/roll-entry, never auto-applied), Wholeness of Body (Martial Arts die + WIS — not yet surfaced with a `heal:` at all), Form of Dread's Facsimile of Life (`1d10+level` — the engine deliberately omits it from the temp-hp grant grammar), Heightened Focus (buffs Wholeness's dice). These are dice quantities; per golden rule 21 they stay display-only (or would need a roll-entry like Second Wind once surfaced) — auto-apply is forbidden. Note: there are NO deterministic (dice-free) self-HEALS in the data, so the heal side of S8 is correctly roll-entry/display-only, never auto-apply.

### S10 — data-wiring batch _(workstreams A + D; pure declarations on existing kinds)_ **first wave SHIPPED 2026-06-24**

Pure declarations on existing grant kinds. **The premise "inert until S1–S3 land" is now obsolete —
the consumer seams (riders, cadence, condition projection, free-cast, trackers) SHIPPED 2026-06-22, so
a declared item renders as soon as its data lands.** First wave (2026-06-24) wired the genuinely-open
bare-prose items onto existing kinds + the ONE near-primitive (`chargesFormula` now resolves ability
mods, not just `"PB"`); the rest are deferred WITH a reason (each needs a NEW primitive — flagged, not
forgotten).

- [x] **`freeCastSource` links — wired (2026-06-24):** Star Map (Guiding Bolt, WIS-scaled), Misty
      Wanderer (Misty Step, WIS-scaled), Fey Reinforcements (Summon Fey 1/LR), Dragon Companion (Summon
      Dragon 1/LR), Mapping Magic (Faerie Fire, INT-scaled), Gift of the Depths (Water Breathing 1/LR,
      CHA — stale "resolves via cast-options" comment corrected). Each adds `always-prepared-spell` +
      `free-cast-spell`, debiting the feature's own tracker (single free-cast). Magic Initiate, Favored
      Enemy, Divine Intervention were ALREADY wired (re-grounded, no change). **WIS/INT-scaled count
      required extending `chargesFormula`** from a literal-`"PB"` match to the shared `resolveTrackerTotal`
      vocabulary (a new `resolveChargesFormula` used by both consumer sites). War God's Blessing: the two
      spells are `always-prepared-spell` (Shield of Faith + Spiritual Weapon) AND the CD-gated "pick ONE of
      two, slotless" cast is now a `free-cast-from-list` FIXED-set pool (closed 2026-06-26 — see below).
- [x] **Prose-only features given grants — partly wired (2026-06-24):** Zealot Divine Fury (`damage-rider`
      inside the Rage `while-active`, `oncePerTurn`, half-Barbarian-level via `diceByLevel`, Radiant — the
      Necrotic/Radiant per-hit choice stays descriptive), Trance of Order
      (three `roll-floor` 10 inside a `while-active`), Heroism (Frightened `condition-immunity` in a
      `while-active`; the recurring per-turn temp-HP half SHIPPED 2026-07-09 — see below).
- [x] **Missing action rows — partly wired (2026-06-24):** Thief Fast Hands (`mechanics.actions` bonus),
      Dhampir Vampiric Bite (bonus action beside its PB tracker).

**S10 OPEN — zero / parity-primitive declarations (no NEW primitive; reuse a shipped kind):**

- [x] **Vow of Enmity advantage chip (G16).** `paladin.ts:718` now carries
      `{type:"advantage-on", rollType:"attack", vs:"vow-of-enmity-target"}` — identical to Precise
      Hunter's shipped `advantage-on` + `vs:"hunters-mark-target"`. The `vs` value is a stable id token
      (never user-rendered); the human-readable clause lives in the catalogue at
      `paladin-vengeance-vow-of-enmity.grants.0.description` (en+it), the same way Precise Hunter does.
- [x] **Goliath Large Form STR-check advantage + Dwarf Stonecunning tremorsense (G17).** Added
      `advantage-on` (check, `vs:"strength-checks"`) inside the existing `goliath-large-form`
      while-active, and a new `dwarf-stonecunning` while-active wrapping `{type:"tremorsense",range:60}`
      (both surface only while the trait toggle is lit). Catalogue labels/descriptions added (en+it):
      `goliath.traits.large-form.grants.0.grants.1`, `dwarf.traits.stonecunning.grants.0`.
- [x] **Sentinel reaction row (G21 — FIXED 2026-06-25).** Added `mechanics:{actions:[{type:"reaction"}]}`
      to `sentinel` (feats.ts), matching every sibling reaction-feat (PAM, Shield Master, Protection). The
      Guardian reaction (an Opportunity Attack vs a creature within 5 ft that Disengages OR hits a target
      OTHER than you) surfaces as a named action card: catalogue key `sentinel.mechanics.actions.0`
      (en+it) supplies the "Guardian"/"Guardiano" name + the trigger fact, and a new tight
      `FEATURE_TRIGGER_PATTERN` ("target other than you" → "creature hits another target" /
      "creatura colpisce un altro bersaglio") renders the bilingual reaction trigger. PROSE (out of scope):
      Halt (the OA reduces the foe's Speed to 0 for the turn) + the 2024 RAW that a creature provokes an OA
      from you even when it Disengages. Regression: `s10-data-wiring.table.test.ts` Family G (the reaction
      row resolves; the localized name + trigger in en+it), fail-before proven (no `mechanics` → no row).
- [x] **Damage riders ride the Unarmed-Strike row (G25, Zealot Divine Fury — FIXED 2026-06-25).** The
      rider-resolution block was inline in the carried-weapon loop only; the `unarmed-strike-die` row
      built its summary with no rider attachment, so a "weapon OR an Unarmed Strike" rider (RAW Divine
      Fury) never showed on the Monk/Bard Unarmed Strike. Factored into ONE pure helper
      `resolveAttackDamageRiders(damageRiders, target, character, scores)` (`smart-tracker.ts`) fed by
      BOTH the carried-weapon loop AND the `unarmed-strike-die` row — so an applicable rider rides the
      Unarmed Strike BY CONSTRUCTION (golden rule 6). Scope-respecting: `"melee-weapon"` (Divine Fury)
      rides a melee weapon AND the Unarmed Strike; `"weapon"` rides weapons only (an Unarmed Strike is
      not a weapon); `"attack-or-spell"` rides neither row. The data fix: Divine Fury's `appliesTo`
      `"weapon"` → `"melee-weapon"` (RAW barbarian:path-of-the-zealot — "a weapon OR an Unarmed Strike").
- [x] **Reckless Attack defensive downside chip (— FIXED 2026-06-26).** The "attacks against you have
      Advantage" half now has a consumer via a self-defensive `incoming-attack-advantage` grant kind (a
      pure presence-flag marker, no dice/numbers). It rides the SAME `barbarian-reckless-attack`
      `while-active` toggle as the offensive STR-attack Advantage, so declaring Reckless lights both; the
      evaluator collects it into `aggregate.incomingAttackAdvantages` (tagging `whileActiveKey`), the
      `incomingAttackAdvantageVMs` presenter localizes it, and the ResourceRail Advantages section renders
      it as a clearly-framed Disadv. ("Attacks against you have Advantage · active") — a player-facing
      downside reminder, never enemy/target modeling. Bilingual catalogue
      (`barbarian-reckless-attack.grants.0.grants.1`, en+it). Regression: `advantage-rail.test.ts` +
      `grant-kind-exposure.guard.test.ts`. See `docs/MECHANICS.md` + `docs/AUTOMATION_COVERAGE.md`.

**S10 OPEN — small new consumers (modest extension of a shipped kind):**

- [x] **Fighter Tactical Mind (G23 — FIXED 2026-06-25).** Spend a Second Wind use → +1d10 to a FAILED
      ability check, refunded if it still fails. A new `SrdActionDef.checkBonus:{dice,refundOnFail}` field
      on a `free`-economy action on `fighter-tactical-mind` (the L2 feature — the natural level gate),
      `costTracker:"fighter-second-wind"` so the card shows the live Second Wind uses; the engine resolves
      it onto `summary.checkBonus` (locale-free, roll-entry — the app never rolls). The presenter (PlayTab
      gloss + accordion fact) composes the localized "+1d10 to a failed check (refunded if it still fails)"
      from `combat.checkBonus`/`checkBonusRefund`/`checkBonusLabel` (en+it). Tactical Shift (the bonus-action
      half-Speed move) stays narrative/positional. Regression: `s10-data-wiring.table.test.ts` Family G
      (`summary.checkBonus` = `{dice:"1d10",refundOnFail:true}`; spends the Second Wind pool; `free`
      economy), fail-before proven (no field → `checkBonus` undefined).
- [x] **Paladin Lay On Hands cure-condition (G19 — FIXED 2026-06-25).** As part of Lay On Hands you can
      expend HP FROM THE POOL to neutralize conditions (those points don't also restore HP — RAW). A new
      `SrdActionDef.cureConditions:[{condition,costHp,fromLevel?}]` field on the `paladin-lay-on-hands`
      action: base (L1) 5 HP ends **Poisoned**; L14 **Restoring Touch** also ends Blinded / Charmed /
      Deafened / Frightened / Paralyzed / Stunned (5 HP each), gated by `fromLevel:14` on the Paladin
      (owning-class) level so a low-level Paladin sees the Poisoned cure ALONE. Ids only (golden rule 7) —
      the engine resolves it onto `summary.cureOptions` (locale-free condition ids), the presenter
      (PlayTab gloss + accordion fact) localizes each via `conditionLabel` + `combat.cureConditions`/
      `cureConditionsLabel` (en+it). The pool is never auto-debited (override-first). Regression:
      `s10-data-wiring.table.test.ts` Family G (L2–3 → Poisoned only; L14 → all 7, 5 HP each), fail-before
      proven (no field → `cureOptions` undefined). Verified against the LIVE Paladin fixture (Oath of
      Vengeance L3): Lay on Hands now exposes exactly `[{poisoned, 5 HP}]`, RAW-correct (Restoring Touch
      gated out). The conformance dump is round-trip-stable (reads `cureOptions`, no golden file) — NO dump
      update; 6 team fixtures byte-identical.
- [x] **Monk Patient Defense L10 temp-HP (G22 — FIXED 2026-07-07).** Heightened Focus (monk:main, L10):
      "When you expend a Focus Point to use Patient Defense, you gain a number of Temporary Hit Points
      equal to TWO rolls of your Martial Arts die." A rolled temp-HP CANNOT ride the `temp-hp` Grant —
      that grammar is dice-FREE by construction and its consumers resolve a concrete number and
      AUTO-apply it (golden rule 21 forbids auto-applying a die). So it rides its action as a declarative
      roll-entry field, the twin of the sibling G23 `checkBonus` / G19 `cureConditions` action riders: a
      new `SrdActionDef.tempHpRoll:{rolls,die,fromLevel?}` on the `monk-patient-defense` bonus action,
      `die:"classSpecific:martialArtsDie"` resolved at the Monk OWNING-class level (d8 at L10 → "2d8",
      scaling to "2d10"/"2d12"), gated `fromLevel:10` so a low-level Monk sees the bare Bonus-Action
      Patient Defense. The engine resolves it onto `summary.tempHpRoll:{dice}` (locale-free, survives the
      summary spread); the presenter (PlayTab gloss + accordion fact) composes "gain 2d8 temporary HP" /
      "ottieni 2d8 PF temporanei". Override-first — display-only, never auto-applied (temp HP don't
      stack). Ids only. Regression: `s10-data-wiring.table.test.ts` Family G (L2/3/9 → no field; L10 →
      `{dice:"2d8"}`; L11 → "2d10", L17 → "2d12"; en+it localize), fail-before proven (no field →
      `tempHpRoll` undefined). Verified against the LIVE Monk fixture (Monk L3): the field is gated out, the
      fixture stays byte-identical. Flurry 2→3 + Step-of-the-Wind drag stay narrative riders.
- [x] **False Life per-spell temp-HP roll-entry (FIXED 2026-07-07).** False Life (spell:false-life): "You
      gain 2d4 + 4 Temporary Hit Points", +5/slot level above 1st. The SAME dice-free-Grant bar the Monk
      G22 rider hit (a `temp-hp` Grant auto-applies a resolved number — golden rule 21 forbids that for a
      die) is cleared the SAME way: a declarative `SrdSpellData.tempHpRoll:{dice,bonus,bonusPerUpcast?}`
      (`{dice:"2d4",bonus:4,bonusPerUpcast:5}`) that the engine resolves onto a NEW `summary.tempHpApply:
{dice?,bonus}` — the roll-entry-then-APPLY sibling of `healApply`. PlayTab's spell card renders a
      `TempHpRollEntry` (twin of `HealRollEntry`): enter the 2d4, tap once → gain `enteredRoll + 4`
      Temp HP via the store `gainTempHp` seam (MAX-WINS, undoable — never a fabricated die). **Fiendish
      Vigor** (which MAXIMIZES False Life — "you don't roll … you automatically get the highest number on
      the die" → 12) is the dice-FREE path: the engine reads the SAME `atWillCasts[].autoMaxTempHp` the
      Spells-page at-will row uses and emits `{bonus:12}` (no `dice`), so that card ONE-TAPS 12 (S8). Both
      surfaces can't disagree (one grant signal). Bilingual `combat.tempHpRoll*`/`combat.tempHpMax*` (en+it).
      Regression: `false-life-temp-hp.test.ts` (data shape; normal caster → `{dice:"2d4",bonus:4}`; Fiendish
      Vigor → `{bonus:12}`; gainTempHp max-wins + setTempHP undo), fail-before proven (no field →
      `tempHpApply` undefined). The 6 team fixtures carry no False Life → byte-identical (additive optional
      field). Two accepted nuances: (1) in-combat UPCAST of the roll-entry stays base-level — `+5`/slot is
      modeled in data but not auto-added by the decoupled card affordance (exactly like Second Wind's, which
      also can't see the chosen slot level); the temp-HP pool is override-first everywhere and False Life is
      a pre-combat buff rarely upcast in combat. (2) A multiclass caster with Fiendish Vigor who ALSO slot-casts
      False Life still sees the one-tap-12 (the maximize keys off HOLDING the invocation, not the specific cast
      source), but the at-will invocation strictly dominates a slot cast (free, always-maximized), so the case
      is moot.

**S10 DEFERRED (each needs a NEW primitive — no existing kind fits; flagged for a later wave):**

- **Sacred Weapon (to-hit buff) — FIXED 2026-06-25.** The defining "+CHA modifier (min 1) to attack rolls"
  is now modeled: `weapon-attack-bonus` gained an ability-derived `amount: {ability,min?}` variant (the
  to-hit twin of `weapon-damage-bonus`'s polymorphic amount, reusing the `{ability,min}` shape proven on
  bonus-to-save). It's carried UNRESOLVED through the evaluator and resolved per weapon in
  `resolveWeaponAttackBonuses` against the EFFECTIVE scores (`max(abilityMod, min)`). Wired onto
  `paladin-devotion-sacred-weapon` as `{ability:"CHA",min:1}`, melee scope, inside a self-keyed
  `while-active` wrapper (rides only while lit, mirrors Rage Damage). Override-first via the per-weapon
  `attackBonusOverride`. The optional Radiant-type election (no number change) + 20-ft light emission stay
  narrative by doctrine — NOT a misleading partial (the only mechanically-valued half is modeled in full).
- **Great Weapon Master — Heavy Weapon Mastery (G8) — FIXED 2026-06-24.** The 2024 constant **+PB damage on
  a Heavy-weapon hit** (not the old −5/+10). `weapon-damage-bonus` gained `scope:"heavy"` + an `amount:"PB"`
  sentinel (`resolveWeaponDamageBonuses` resolves "PB" → the character's PB and folds it into the Heavy
  weapon's damage formula); the grant is attached to `great-weapon-master`. Override-first via the existing
  per-weapon `damageOverride`.
- **Heavy Armor Master (G9) — FIXED 2026-06-24.** **−PB to incoming bludgeoning/piercing/slashing in Heavy
  armor.** New `flat-damage-reduction` grant kind (`{damageTypes, amount:number|"PB",
condition?:"wearing-heavy-armor"}`) — a FLAT subtraction (vs `damage-resistance`'s HALVING), aggregated +
  surfaced as a SELF-SIDE informational defenses LINE (`deriveFlatDamageReductions` resolves "PB" + gates on
  Heavy armor being worn; the engine subtracts nothing from a modeled foe — golden rule 21). REUSABLE.
- **Hex / Hunter's-Mark per-hit dice — FIXED 2026-07-07 (marked-target model).** Modeled as a
  `while-active` concentration buff (auto-lit on cast via S1, retracts on concentration drop) carrying a
  `damage-rider` with the minimal new **`vsMarkedTarget`** flag (∈ `"marked"` / `"cursed"`) — a
  DISPLAY-ONLY chip on weapon AND spell-attack rows the render edge LABELS "vs marked / cursed target"
  (`combat.vsMarkedTarget_<token>`). It is NEVER auto-summed into the base damage (dodging the
  over-application: the app models no enemy, so it can't know which hit lands on the marked creature — the
  player applies the +1d6 only on the right hit). REUSES the shipped `while-active` + `damage-rider` +
  chip-labeling machinery wholesale (one optional flag, no parallel rider system). **SPELL-ATTACK rows
  (task #27, 2026-07-09):** RAW deals the die "each time you hit … with an attack roll", which includes a
  SPELL attack — so the SAME rider now rides spell-attack rows (Eldritch Blast + Hex the canonical pair)
  via `resolveSpellAttackMarkedRiders` (smart-tracker), keyed purely off the `vsMarkedTarget` flag (the
  `appliesTo` scope stays weapon-only; both surfaces show the chip by construction, rule 6). Foe Slayer's d6→d10
  augment still lifts the spell-card `damageDice` chip; the residual is that it does NOT re-size the L20
  rider die (deferred — no live user is near L20). The move-the-mark, HM's find-Advantage, and Hex's
  ability-check Disadvantage stay narrative (no modeled enemy / per-target tracking).
- **War God's Blessing fixed-2-spell free cast — CLOSED 2026-06-26.** `free-cast-from-list` grew a
  FIXED-set pool shape: an optional `spellIds[]` (the entire pool when set) debiting a shared
  `trackerId`, with `chargesPerRest`/`rest` now optional (inferred from that tracker's resolved total
  when omitted — Channel Divinity 2/3/4, single source of truth). The two spells stay always-prepared;
  the bonus-action `costTracker` row routes the Play board to the SAME guided picker Divine Intervention
  uses (one picker, copy keyed off the pool's stable `sourceId`).
- **Gaze of Two Minds (action row) — FIXED 2026-07-07.** `SrdEldritchInvocation` grew an optional
  `mechanics: { actions?: SrdActionDef[] }` (the same `SrdActionDef` shape a class feature / feat /
  race trait carries — no parallel model), and `resolveFeatureActions` (smart-tracker.ts) grew a
  sibling "1c" invocation pass mirroring the race-trait branch (1b): scans the character's flattened
  `invocationChoices` (`allEntryPicks`), resolves each known invocation's `mechanics.actions` at the
  Warlock owning-class level (invocations are Warlock-only), and feeds the SAME action list every
  feature/race-trait/spell/weapon row flows through. Gaze of Two Minds is wired as a bare Bonus-Action
  row (`{ type: "bonus" }`, no slot/tracker cost per RAW) with an authored EN+IT effect summary
  (`gaze-of-two-minds.mechanics.actions.0`); the remote-sensing/senses-swap EFFECT itself stays
  narrative (no perception-swap primitive in the engine). No `tracker` sibling on the invocation shape
  (unlike the race-trait shape) — every current invocation action is a bare economy row, and a tracker
  ships only alongside a real consumer, never a half-wired untested primitive. Regression:
  `tests/unit/invocation-action-row.test.ts` (a Warlock who knows Gaze of Two Minds gets the row, one
  who doesn't gets none, fail-before proven) + `action-subtitle-budget.guard.test.ts` grew an
  invocation-action budget check. Additive-only (a new optional field); the 6 team fixtures (no
  Warlock among them) stay byte-identical.
- **Heroism's recurring per-turn temp-HP — SHIPPED 2026-07-09.** The `regen-at-turn-start` cadence
  primitive (Heroic Rally's start-of-turn heal) gained an optional **`asTempHp`** flag: same
  start-of-turn cadence + temp-HP amount grammar, but the amount routes to the max-wins `gainTempHp`
  seam (temp HP don't stack) instead of `applyHealing`, and it never gates on min HP (temp HP don't
  revive you). Wired inside Heroism's `while-active` block (`amount: "CHA"` — both Bard + Paladin cast
  with CHA, so the deterministic self-cast amount is the CHA modifier), lit on cast via S1, cleared on
  concentration drop. `resolveStartOfTurnRegen` now aggregates over the FULL source set (so a standing
  buff SPELL reaches it, not only features); `ThisTurnTracker` renders the same start-of-turn banner
  with a one-tap "Gain N temporary HP" (undoable via `setTempHP`). `grantSourceLabel` gained the spell
  catalogue so the note names "Heroism" (no id leak, rule 7). Regression: `regen-at-turn-start.test.ts`.
- **blur / mirror-image / warding-bond / death-ward — SHIPPED 2026-07-09.** The defensive-buff consumers,
  all display-only (the app models no enemy and never rolls — golden rule 21), each a `while-active` buff
  (the SELF buffs auto-lit on cast via S1, cleared on drop; Warding Bond target-only — see below):
  - **Blur** → a NEW `incoming-attack-disadvantage` grant kind (the mirror of Reckless Attack's
    `incoming-attack-advantage`): "attacks against you have Disadvantage" surfaces as a framed ADVANTAGE
    line in the rail's Advantages section, reusing the `incomingAttackAdvantageVMs` presenter.
  - **Warding Bond** → +1 AC (`ac-bonus`) + +1 all saves (`save-bonus`) via the existing while-active
    channels, plus the resistance-to-all / shared-damage posture as a NEW `defense-note` prose line in the
    rail's Defenses section (no clean numeric primitive for "resistance to ALL" — modeled as a reminder,
    worded neutrally so it reads correctly on whichever sheet has it lit). **TARGET-ONLY** (RAW: "you
    touch ANOTHER creature" — the caster never gains the buff, only shares the damage): the grant sets
    the NEW `while-active.autoActivateOnCast: false` opt-out, so the S1 cast→toggle seam stamps no
    `activatesKey` and casting never self-buffs; the WARDED creature's own sheet lights the toggle
    manually from the rail if the warded creature has the spell; otherwise the existing overrides
    carry it.
  - **Death Ward** → a deterministic 0-HP INTERRUPT in `characterStore.applyDamage`: when the ward toggle
    (`spell-death-ward`) is lit and damage would cross to 0, it clamps HP to 1 and ends the ward (removes
    the toggle key), logged; the HP-control edge (`use-hp-controls`) shows the localized toast and re-lights
    the ward on undo. RAW, not a roll.
  - **Mirror Image** → a `defense-note` rendering the structured three-duplicate + d6 ≥ 3 rule as a
    display-only reminder (fully player-managed; the app never rolls the d6). A decrementable per-duplicate
    pip would need a bespoke spell→tracker seam (spells carry no `mechanics.tracker`) — disproportionate for
    one player-managed spell (rule 19), so the count rides the reminder note. Regression:
    `defensive-buff-spells.test.ts` + `character-store.test.ts` (Death Ward interrupt).
- **CHIP-LABELING polish — SHIPPED (2026-06-26):** `damage-rider` / `AdvantageClause` / `RollFloorClause`
  now each carry an optional `whileActiveKey` (mirroring `weaponDamageBonuses.whileActiveKey`), threaded
  from the SAME while-active evaluator branch in `applyGrant` (`grants.ts`). It surfaces as a `whileActive`
  flag on the presenter VMs — `AdvantageChip`/`AdvantageChipVM` (`sheet-view`/`tracker-view`), `RollFloorVM`
  (`tracker-view`), and the rider VM (`RawActionSummary.extraDamage` → `RiderVM`, `smart-tracker`/`rider-view`)
  — so a while-active-gated advantage / floor / on-hit rider self-labels "· active" (the SAME
  `combat.whileActiveNote` key the weapon-damage breakdown shows), exactly like Rage Damage. Unconditional
  effects stay unlabeled. Pinned by `tests/unit/while-active-effect-chips.test.ts`.

> **S4 (event hooks reviving orphans) is SHIPPED** (2026-06-12) — initiative top-ups, long-rest
> Heroic Inspiration, short-rest Exhaustion, at-0-HP interrupts, slot→use conversion, and Arcane
> Recovery all have live callers.
> **On-cast hook — Arcane Ward refill + Expert Divination slot-regain legs DONE** (Arcane Ward 2026-06-26,
> Expert Divination 2026-06-27): a NARROW on-cast trigger primitive now exists, DISCRIMINATED on `effect`.
> `SrdClassFeatureData.mechanics.onCast` is `OnCastTriggerSpec = OnCastRefillTrackerSpec | OnCastRegainLowerSlotSpec`
> (shared `{ school, minSlotLevel }` base + per-effect data). A shared `matchingOnCastSpecs` enumeration
> (pure, leaf — `src/lib/on-cast-effects.ts`) resolves the cast spell's stable school token
> (`getSpellById(spellId).school`, rule 7) against every feature carrying an `onCast` spec, and each
> effect has its own resolver + applier:
> • `refill-tracker` (Wizard Abjurer **Arcane Ward**): `resolveOnCastTrackerRefills` →
> `applyOnCastTrackerRefills` reduces ward `used` by `refillTrackerPerSlotLevel × N`, clamp at 0 = max, with
> a clamp-aware undo.
> • `regain-lower-slot` (Wizard Diviner **Expert Divination**, L6): `resolveOnCastSlotRegain` →
> `applyOnCastSlotRegain` un-expends the HIGHEST expended NORMAL slot of a level LOWER than the cast slot and
> ≤ `maxRegainLevel` (5), via `restoreSpellSlot`, with an exact-slot re-expend undo. Fires only on a level-2+
> (`minSlotLevel: 2`) Divination cast; no frequency limit per 2024 RAW.
> Both hook the same `TurnEconomyProvider.commitCastOption` seam right after the slot spend (slot-paid casts
> only — RAW "with a spell slot"); override-first (slots/tracker stay editable) + folded into the cast's one
> undoable unit.
> **Wild Magic Surge on-cast — SHIPPED 2026-07-09** (the third `onCast` effect kind, `wild-magic-surge`).
> RAW (`sorcerer:wild-magic-sorcery`, L3): "Once per turn, you can roll 1d20 immediately after you cast a
> Sorcerer spell with a spell slot. If you roll a 20, roll on the Wild Magic Surge table." Modeled as a
> DISPLAY-ONLY post-cast reminder (no mutation, unlike the two effect legs above): the spec is
> school-AGNOSTIC (`school` optional on `OnCastTriggerBase` → any spell) with `minSlotLevel: 1`, and the
> consumer `resolveOnCastSurgeReminder` additionally requires the cast spell to be a Sorcerer spell. The
> SAME `commitCastOption` slot-paid seam surfaces a quiet toast ("roll a d20 — on a 20, roll on the Wild
> Magic Surge table"); the app NEVER rolls the d20 and NEVER auto-triggers the table (golden rule 21), and
> the once-per-turn limit is the player's judgment. Same register as the shipped EK War Magic note.
> Regression: `on-cast-ward-refill.test.ts` (a Wild Magic sorcerer's slot-paid Sorcerer cast fires; a
> cantrip / non-Sorcerer spell / non-Wild-Magic sorcerer never fires — fail-before proven).
> **Magical Cunning slot-recovery is now SHIPPED** (2026-06-26) — the PRIM-resource-conversion
> `pact-slot` produce path un-expends the Warlock's Pact-Magic slots (⌈max/2⌉ for Magical Cunning,
> ALL when Eldritch Master upgrades it) by spending the feature's 1/Long-Rest charge, surfaced as the
> rail "Restore Pact Magic slots" affordance (immediate-commit-with-undo). Eldritch Master's spurious
> duplicate 1/LR tracker was removed (rule 10) — it carries no own use, only flips `restoresAll`.

### S11 — save-based action primitive _(workstream A; defects C, B)_ **SHIPPED 2026-06-24**

`SrdActionDef` could carry `heal` but **could not declare a save-based attack** (damage dice + type +
level scaling alongside a save), so the dice/DC/type lived ONLY in i18n prose (the golden-rule-5 leak).
The fix EXTENDS the existing save fields (REUSE, not duplicate): the save half is the already-present
`saveAbility`/`saveDcAbility` pair (routed through the one `featureSaveDc` `8+PB+mod` formula —
override-aware); the new `attack?: ActionAttack` adds ONLY the damage half —
`{ dice?; diceByLevel?: Record<level,dice>; damageType? | damageTypeChoices? | damageTypeFromBundle? }`.
The shared `applySaveAttackSummary` resolver (called from BOTH the SRD-feature loop AND the race-trait
loop — single source of truth) resolves the dice at the action's `featureScalingLevel` (owning-class for
a class feature, character level for a race trait) via `pickByLevel` (the "highest threshold ≤ level"
rule cantrip `extraDamageByLevel` uses) onto `summary.damage`/`damageType`(`/damageTypes` +
`multiDamageTypeFlavor:"choice"`) — so the SAME chip + facts recipe a damage spell uses renders
"2d10 Fire · DC N DEX" with ZERO new view code or i18n key. Pinned by the `S11 save-based attacks` block
in `smart-tracker.test.ts` (per-feature, ≥2 levels for scaling + fail-before).

- [x] **Dragonborn Breath Weapon (G1)** — DEX save vs DC `8+CON+PB`, dice 1d10→2d10→3d10→4d10 by
      CHARACTER level (1/5/11/17), damage type DERIVED from the chosen Draconic Ancestry (the
      `dragonborn-ancestry` bundle's `damage-resistance` — single source of truth, `damageTypeFromBundle`).
- [x] **Cleric Divine Spark** — CON save vs the Cleric spell-save DC (`8+PB+WIS`), 1d8→4d8 by CLERIC
      level (2/7/13/18) **+ WIS mod** (`addMod:"WIS"` → chip "1d8+3"), Necrotic OR Radiant player choice
      (`damageTypeChoices`), **heal-or-damage** (`mode:"heal-or-damage"` → both a heal chip + the save-
      damage chip; the player picks one — S11b SHIPPED 2026-06-25).
- [x] **Cleric (Light) Radiance of the Dawn** — CON save vs `8+PB+WIS`, **2d10 + Cleric level** Radiant
      (`addLevel:true` resolving the OWNING-class level → chip "2d10+5" — S11b SHIPPED 2026-06-25).
- [x] **Lupin Howl (G15-DC)** — WIS save vs DC `8+CON+PB`, no damage (Disadvantage effect = the gloss).

### S11b — exotic save-attack shapes _(workstream A; deferred from S11 — each needs a NEW sub-shape)_

The clean dice+save primitive covers fixed/level-table dice. These needed additional shapes beyond it —
all GENERALIZED onto the existing fields (not parallel shapes) and **SHIPPED 2026-06-25**:

- [x] **`+ ability-mod` / `+ class-level` additive on save-attack damage** — Divine Spark (`+WIS mod`),
      Radiance of the Dawn (`+ Cleric level`). Added `ActionAttack.addMod?: AbilityCode` +
      `addLevel?: true`, each resolved to a NUMBER and folded into the dice via `appendAbilityModToDice`
      (chip "1d8+3" / "2d10+5"); `addLevel` resolves the OWNING-class `scalingLevel` (B2 lesson — Cleric
      level, not total). No new `HealTerm` parallel — flat number into the formula (declare the least).
- [x] **Heal-OR-damage toggle** — Divine Spark restores HP OR deals damage (player's choice each use).
      Added **`ActionAttack.mode:"heal-or-damage"`**: the SAME resolved total (dice + `addMod`) emits onto
      BOTH `summary.heal` (riding the existing Second-Wind heal-chip + roll-entry-apply seam) AND the
      save-damage chip, so both render on the one card (override-first — the engine never picks).
- [x] **Ability-count dice** — Cleric **Sear Undead** (`WIS-modifier` × d8 Radiant, min 1d8), riding
      Turn Undead (no own Channel-Divinity cost, no own save). GENERALIZED **`ActionHeal.diceCount`** +
      added **`ActionAttack.diceCount`** to a shared **`DiceCount = "PB" | AbilityCode`** (the ability mod,
      floored at 1), resolved by ONE `resolveDiceCount` helper; Sear Undead gained its own action card so
      the WIS-many-d8 value renders (chip "4d8" at WIS 18).

### S12 — spell-data structured dice _(workstream A; defects C, E)_ **SHIPPED 2026-06-24**

Two damage/heal display paths disagreed **by construction** (a golden-rule-5 seam violation): spell cards
read structured `damageDice`/`healDice` (unpopulated for ~125 spells → cards showed bare "Fire"/"Utility"),
while the combat tab regexed English prose (`extractDamageDice` / the heal regex). FIXED: populated the
data as the FACT (generated from the regex's own output as the ORACLE, then SRD-spot-checked), deleted
both prose regexes, and routed the combat tab to read the SAME structured field the cards read — one
source, identical output by construction.

- [x] **Populated `damageDice` on every dice-dealing spell + DELETED `extractDamageDice`** (G2/G5/W2/W7).
      `damageDice` went 7 → **126** spells (119 added: 113 single-`damageType` + 6 multi/choice spells —
      Chromatic Orb 3d8, Dragon's Breath 3d6, Glyph of Warding 5d8, Prismatic Spray 12d6, Prismatic Wall
      10d6, Storm of Vengeance 2d6). Headliners verified vs the live SRD: Fireball 8d6, Guiding Bolt 4d6,
      Spirit Guardians 3d8, Moonbeam 2d10, Divine Smite 2d8. Cantrips store the single-die BASE; the
      combat seam scales by character level via the new pure `scaleCantripDice` (`utils.ts`, 5/11/17 →
      ×1/2/3/4) so the card shows base, combat shows scaled — both from ONE field. ORACLE-EQUALITY proven:
      every reached spell's stored dice == the pre-deletion regex output (a temp generator ran the OLD
      regex over each spell's EN prose). `spell-data-integrity` locks: every damage-facet spell has
      `damageDice` (3 retaliation auras allowlisted), every `damageDice` is well-formed `NdM[+K]`.
- [x] **Populated `healDice` + `effectTag:"heal"` on every healer + DELETED the heal prose-regex** (G3/W7).
      `healDice` went 1 → **11** (8 dice healers — Cure Wounds 2d8, Mass Cure Wounds 5d8, Prayer of
      Healing 2d8, Mass Healing Word 2d4, Aura of Vitality 2d6, Alustriel's Mooncloak 4d10, Regenerate
      4d8, + the existing Healing Word — plus flat Heal 70 / Mass Heal 700 / Goodberry 1); `effectTag:"heal"`
      went 1 → **13** (the above + tag-only Power Word Heal / Arcane Vigor, which convey no fixed amount).
      A new structured `healAddsCastMod?: boolean` carries the 2024 "regains NdM + your spellcasting
      ability modifier" family (the 5 cure-family spells) — the combat chip folds the caster mod + the
      Disciple-of-Life rider; the card shows the base. Fixes the wrong "Utility" word/colour/no-dice
      verdict on every healer. Locked by `spell-data-integrity`.
- S12b ↓ **deferred multi-instance / level-scaling shapes (each a NEW sub-shape, out of a data-only fix).**
- [x] **Structured `instantaneous: boolean`** (or a duration enum) replacing the
      `duration.en !== "Instantaneous"` prose read. — DONE (S12b, 2026-06-26): `instantaneous`
      populated on 124 spells, consumed at smart-tracker.ts:4699, SRD-spell duration prose read
      deleted.
- [x] **Spell-area cadence `recurrence` (G24) — SHIPPED 2026-06-25.** `recurrence: SpellRecurrence`
      (`"on-enter-or-end-turn" | "bonus-action-move" | "action-retrigger"`) on `SrdSpellData` (Moonbeam /
      Spirit Guardians per-turn; Flaming Sphere bonus-action move; Call Lightning Magic-action re-fire — the
      SRD says Call Lightning re-fires with a MAGIC action, so a third `"action-retrigger"` token was added
      rather than forcing it into `bonus-action-move`). Surfaces a self-side cadence note on BOTH the spell
      card (a detail tag) AND the combat gloss line, localized via `spells.recurrence_<token>` (the analogue
      of the S3 feature cadence — feature recurrence had no i18n keys to reuse, so new ones were minted).
      Reconciled the bundled `description` prose of the two chip-bearing spells (Moonbeam, Spirit Guardians)
      to 2024 RAW — the recurrence clause was stale 2014 wording ("starts its turn there" / IT "inizia il
      suo turno lì") and silently contradicted the new "end of turn" cadence chip on the expanded card. Fixed
      EN → "ends its turn there" (wikidot 2024) and IT → "vi termina il suo turno" (anchored on the official
      IT SRD 5.2.1: Bagliore lunare "o vi termina il suo turno", Guardiani spirituali "ogni volta che vi
      termina lì il turno") so prose + chip now agree in BOTH locales, both 2024-correct.
- [x] **Catalogue-wide 2014→2024 area-spell prose audit (follow-up — separate from G24) — SHIPPED 2026-06-25.**
      VERIFY-EACH sweep of the 17 area spells whose bundled `description` carried a "starts its turn there" /
      IT "inizia il suo turno lì" recurrence clause. Each was checked against the 2024 source (EN wiki +
      dndbeyond; IT anchored on the official IT SRD 5.2.1 PDF). **8 FIXED** — 2024 RAW changed them to
      "ends its turn there" (EN) / "vi termina il suo turno" (IT, PDF-anchored, matching insect-plague's
      "o vi termina il suo turno" and the already-reconciled Moonbeam/Spirit-Guardians lines): **Blade Barrier,
      Cloud of Daggers, Cloudkill, Conjure Animals, Black Tentacles** (recurrence clause only — the
      separate 2014 "already-Restrained re-tick" sentence is a removed-mechanic question, left for a future
      mechanic sweep), **Forbiddance, Insect Plague, Gust of Wind** (the line "ends its turn in the Line" /
      IT SRD "termina il suo turno sulla linea"). **9 deliberately LEFT** because 2024 RAW genuinely keeps a
      start-of-turn trigger: **Stinking Cloud** (IT SRD "inizi il proprio turno", poison-on-start), **Web** &
      **Zone of Truth** (IT SRD "inizia lì/qui il suo turno" — 2024 retained "starts its turn there"),
      **Sleet Storm** (2024 kept "starts its turn there", the buff is Concentration-loss not a cadence change),
      **Conjure Elemental** ("starts its turn within 5 feet" proximity trigger, IT SRD "inizia il suo turno
      entro 1,5 metri"), a pack Warlock spell (already correct: start-of-turn Cold + end-of-turn Acid),
      **Aura of Life** (start-of-turn HEAL, not a recurrence-save), **Dawn** & **Sickening Radiance** (older-printing reprints with no 2024 page — they retain 2014 "starts its turn
      there"). 16 strings changed (8 EN + 8 IT); IT is PDF-anchored, not ad-hoc.

### S12b — multi-instance + level-scaling spell dice _(workstream A; deferred from S12)_ — **SHIPPED 2026-06-25**

S12 stored the per-instance / base-level dice FACT; these refinements each needed a NEW structured shape
(an instance count / a level map on `SrdSpellData`), so they were deferred rather than half-built. Both
landed 2026-06-25.

- [x] **Multi-instance total (Magic Missile 3×(1d4+1), Scorching Ray 3×2d6) — SHIPPED 2026-06-25.** Added
      `instances` + `instancesPerUpcast` on `SrdSpellData` (Magic Missile 3 darts +1/slot above 1st;
      Scorching Ray 3 rays +1/slot above 2nd — exact PHB 2024). The shared pure `spellInstanceCount(spell,
castLevel)` resolves the count; both surfaces render `N × {dice}` via the `spells.multiInstance` key
      (`combatVerdict` + the card `buildVerdict`). The per-instance `damageDice` stays intact (a flat rider
      folds per instance, THEN the UI multiplies — `summary.instances` is carried separately so the rider
      math is unchanged). LIVE-FIXTURE EFFECT: the live Wizard fixture's Magic Missile card + combat verdict now read
      "3 × 1d4+1" (was "1d4+1") — a CORRECTNESS improvement; the `.json` is byte-identical (the dump dir is
      gitignored; no committed expectation changed).
- [x] **Stars Druid `diceByLevel` (Starry Form, G20/W6) — SHIPPED 2026-06-25.** The Starry-Form Archer/Chalice
      die scales 1d8→2d8 at Druid 10 (Twinkling Constellations). Added `diceByLevel` to the `aura`
      `ranged-attack` / `heal` effect kinds AND `damageDieByLevel` to the `form-attack` grant; the aura
      presenter (`auraVMs`) + `resolveFormAttacks` resolve it via the SHARED `pickDiceByLevel` (`lib/utils`)
      — the SAME "highest threshold ≤ level" helper `ActionAttack.diceByLevel` uses (the private
      `pickByLevel` in smart-tracker was deleted in favour of the shared one). Closes the G20 deferral note
      below.

### S12c — leveled-spell upcast damage scaling _(workstream A; defect C)_ — **SHIPPED 2026-06-26**

S12 stored each leveled spell's BASE-level dice; the chosen slot level was DROPPED before the damage was
displayed, so the combat card + cast modal showed the base dice at EVERY slot (Fireball read "8d6"
whether cast at 3rd or 9th). The cast modal's slot rows now PREVIEW the dice each slot deals — the S12b
`instancesPerUpcast` precedent extended from instance counts to dice counts.

- [x] **Per-spell upcast dice increment + the slot-row preview — SHIPPED 2026-06-26.** Added
      `damageDicePerUpcast?: string` (a plain `NdM` per-slot-level increment) on `SrdSpellData` and the pure
      `scaleUpcastDice(spell, castLevel)` helper (`lib/utils`) — base count + increment-count × (castLevel −
      baseLevel), same die face, with any flat tail (`"10d6+40"` → `+40`) preserved; the SAME "steps above
      base, scale the count" rule as `scaleCantripDice` / `spellInstanceCount`. Backfilled **60 damage
      spells** (51 SRD + a 9-spell follow-up sweep — SRD Wall of Ice +2d6 and 8 pack-side damage
      spells — found still unscaled by an adversarial enumeration of all
      110 leveled damage spells) (each increment + threshold confirmed against the 2024 "Using a Higher-Level Spell
      Slot" clause on the wiki): the +1d6 family (Fireball/Lightning Bolt/Burning Hands/Guiding Bolt/Vampiric Touch/…), +1d8 (Thunderwave/Shatter/Spirit Guardians/Spiritual Weapon/Heat Metal/Wall of
      Fire/Glyph of Warding/…), +1d10 (Inflict Wounds/Hellish Rebuke/Moonbeam/Ice Storm/Call Lightning/Insect
      Plague/Conjure Animals/Phantasmal Killer), +1d12 (Witch Bolt/Conjure Celestial), and the multi-die steps
      (Cloud of Daggers/Vitriolic Sphere +2d4, Circle of Death +2d8, Disintegrate +3d6). Corrected
      Circle of Death's base from a stale `8d6` to the 2024-RAW `8d8` (so the `2d8` increment shares its face).
      The cast modal (`CastLevelModal`) carries the spell's structured facts (`upcast`) and renders a per-slot
      `.cl-dmg` chip resolving `scaleUpcastDice` / `spellInstanceCount` at each slot level — threaded from BOTH
      cast surfaces (`SpellsTab` from `vm.data`, `TurnEconomyProvider` via `getSpellById`). **Ray-count spells
      stay on the existing `instancesPerUpcast` path** (Scorching Ray / Magic Missile carry NO
      `damageDicePerUpcast`; their slot rows scale "N × dice"). Override-first preserved (a per-spell
      `overrides.damage` still pins the formula). Locks in `spell-data-integrity` (every `damageDicePerUpcast`
      is well-formed + shares the base die face; a RAW slot-total table across the backfill; ray-count spells
      scale instances not dice) + `utils` (the helper) + a thin `cast-level-modal-upcast.test.tsx` render
      (the modal reflects the scaled chip). Fail-before proven (the helper stubbed to return base dice fails the
      engine, data-integrity, and render assertions). NO leak — dice render numerically (rule 7).

### S13 — effective-Speed render _(workstream A; defect C)_ — **SHIPPED 2026-06-24**

The effective-walking-Speed pipeline now reaches the UI. Was: `CombatHeader.tsx:563` rendered
`formatSpeed(charData.speed)` with NO `computedValue`, so already-aggregated grants (Mobile, Boots of
Speed ×2, exhaustion, heavy-armor STR penalty, Roving) were invisible; `effectiveWalkingSpeedFt` had
exactly one caller (Champion movement) and `armorEffects` / `effectiveWalkingSpeed` (`compute.ts`)
were DEAD duplicates.

- [x] **Walking-speed vital now reads `computedValue` from `effectiveWalkingSpeedFt(...)`** (G4),
      override-first via the new `character.speedOverride` field, exactly as AC does (computed value +
      reset-to-auto, edited in locale units). **No new grant kind.** The PDF main Speed + non-walking
      sentinels (LeftHud + PDF) now resolve against the effective walking Speed too.
- [x] **Folded the heavy-armor STR-requirement −10 ft penalty (G11, vs the wearer's EFFECTIVE STR) +
      `agg.speedMultiplier` (Boots of Speed ×2, G12, applied AFTER the additive stack per RAW) into the
      live `effectiveWalkingSpeedFt`** (now aggregating over `resolveAllGrantSources` so item-sourced
      multipliers count). DELETED the dead `armorEffects` + `effectiveWalkingSpeed` + the now-orphaned
      `exhaustionSpeedReduction` twins in `compute.ts` (+ their tests) — verified ZERO production
      callers first (rule 10).
- [x] **Emit unproficient-armor Disadvantage as `AdvantageClause`s (G13)** via `resolveArmorEffects`
      (the `condition-effects.ts` pattern) + the doc-level `armorDisadvantageClauses` resolver
      (multiclass-aware effective armor proficiencies via `featGateCtx` + `armorProficiencyOverrides`),
      merged into the combat advantage/disadvantage list (PlayTab attack gloss + the rail's Advantages
      section). The Inventory "Untrained" gloss and the combat clause share the ONE `isArmorProficient`
      predicate (rule 6).

### Creation-wizard — Background ASI constraint _(golden rule 20)_

- [x] **Constrain the Background ASI to the 3 abilities the background lists (G7/W4).** ✅ DONE.
      Added `abilityOptions: readonly AbilityCode[]` to `SrdBackgroundData` and populated all 61
      background rows from the "Ability Scores:" line on `dnd2024.wikidot.com/background:<id>` (the 16
      SRD rows cross-checked against the official 2024 PHB — Acolyte = INT/WIS/CHA, Soldier =
      STR/DEX/CON…). `BgAsiPicker` now disables every tile whose code ∉ the selected background's
      `abilityOptions` (predicate `!abilityOptions.includes(code) || <full>`), so the +2/+1 (or
      +1/+1/+1) can only land on the 3 eligible abilities — an invalid state is unreachable (golden
      rule 20), not validated-and-scolded. Switching the background clears `bgAsiChoices` so a stale
      now-ineligible pick can't linger. The picker is mounted ONLY at `/characters/new` and always starts
      from an empty pick — an EXISTING character is never re-run through it (its stored ASI is already
      baked into `abilityScores` and kept only as an inert codec round-trip record), so the constraint
      governs NEW picks; no edit path force-clears or re-validates a stored value, and no grandfather
      predicate in the picker is needed (dead code avoided). **Two LIVE party sheets predate the
      constraint and store an off-list increase — they keep loading/viewing/saving with it intact:
      the live Wizard fixture (Sage → eligible CON/INT/WIS, stores INT+DEX) and the live Paladin fixture (Wayfarer →
      eligible DEX/WIS/CHA, stores STR+CHA).** Locks: a data-integrity test (every background has exactly
      3 distinct valid `AbilityCode`s + the 16 SRD vs official PHB) + a `BgAsiPicker` render test
      (ineligible tiles disabled, eligible enabled) + a grandfather-aware fixture guard
      (`team-fixtures-legal.test.ts`: every fixture's stored ASI ⊆ its background's eligible abilities,
      with the two off-list live characters named in an explicit allow-list so the exception can't
      silently grow). Pure data + a one-line predicate, as scoped.

---

## Confirmed correctness bugs (shipped defects)

> **Audit backlog CLOSED (2026-06-25): B1–B8 + S11/S12/S13 + the full G/W series + BUG-6 — 21 merges**
> (`cc377f99`…`20a5492c` on `main`). The multi-week wiki-vs-implementation audit shipped every confirmed
> correctness bug below + the Tier-3 primitives (S11/S11b, S12/S12b, S13) + the per-feature G/W series, each
> with its fail-before/pass-after regression and all 6 team fixtures byte-identical. The area-spell
> 2014→2024 prose-corpus sweep (the S12/G24 follow-up at the S12 section) is now CLOSED (2026-06-25:
> 8 spells fixed to "ends its turn there", 9 verified-and-left). The **half-caster multiclass rounding**
> (`multiclass-slots.ts:91`) is now RESOLVED — VERIFIED correct per 2024 RAW (see below), no change. (W8
> cantrip-concentration flags and W9 Dueling one-handed scope are now FIXED, and W11 `chargesFormula`
> owning-class is VERIFIED — all shipped formulas are character-wide; see their ticked entries below.)

> These are DEFECTS in shipped code — wrong numbers/dice/triggers a user sees today — not unbuilt
> frontier. Each names the trace + the optimal root-cause fix (golden rule 2). B1–B3 are CRITICAL: B1
> hits a live user's Barbarian; B2/B3 are multiclass shipped defects (latent for the 6 single-class
> L2–3 fixtures, live the moment a user multiclasses). **Every fix ships its regression test in the same
> commit** (golden rule 13); a correctness-only fix that changes a pinned value updates that test in the
> same commit.

- [x] **B1 (CRITICAL, live data) — Rage auto-expires at round 10, not round 100.** FIXED 2026-06-24.
      `barbarian.ts:175` now `maxRounds:100` (RAW: 10 minutes = 100 rounds @ 6 s/round) so the End-Turn
      countdown no longer drops Rage 90 rounds early. Fixed every "Rage = 10 rounds" doc-comment across
      the engine (`smart-tracker.ts`, `grants.ts`, `types/character.ts`, `types/combat-log.ts`,
      `characterStore.ts`, `sanitize-session.ts`, `TurnEconomyProvider.tsx`). The pinned tests now assert
      the 100-round cap: `character-store.test.ts:1318,1323` (arm → 100; `:1396` is the unrelated
      potion-of-speed 10-round timer, unchanged) + `turn-round-engine.test.ts` (cap 100, arm to 99,
      countdown 99→1, auto-drop on the 100th End Turn). `maxMinutes:10` stays. (= W2/W-Rage.)
- [x] **B2 (CRITICAL, multiclass) — tracker level-scaling used TOTAL level, not owning-class level (4 seams).**
      FIXED 2026-06-24. The action card (`resolveActions`) disagreed with the rail (`resolveTrackers`, which
      already used `classEntryLevel`) and with RAW — on BOTH an action's OWN-feature tracker AND a tracker an
      action CROSS-REFERENCES via `costTracker`; `resolveTrackerTotal` bound `level` to total (Monk5/Rogue3
      Focus = 8 not 5 — and the Flurry-of-Blows card, which has no own tracker and cross-references the Focus
      pool, ALSO showed 8, contradicting the corrected Focus card + rail; Paladin5/Sorc3 Lay On Hands = 40 not
      25); `getShortRestRecoveries` wrongly short-rest-recovered Bard4/Cleric2 Bardic Inspiration (Font of
      Inspiration is a Bard-5 gate). Fix: ONE shared owning-class-level resolver — the already-existing
      `featureScalingLevel(sourceId, character)` (a class feature → its owning-class level via
      `classEntryLevel`; a feat / race trait → total) — now feeds ALL FOUR seams; the cross-ref seam passes it
      the CROSS-REFERENCED feature's id (`action.costTracker`). Threaded an optional `scalingLevel?` param
      through `resolveTrackerTotal` (PB stays on total — proficiency bonus is character-level even in a
      multiclass) and reused `resolveTrackerSpec`'s existing `level` param; deleted the rail's now-redundant
      inline `classEntryLevel` branch (rule 10). Table-driven multiclass regression
      `tests/unit/tracker-owning-class-level.test.ts` (the 4 scenarios → RAW on action card + rail + short
      rest, incl. the Monk5/Rogue3 Flurry cross-ref Focus pool → 5 agreeing with the rail; a feat tracker
      still scales on total; single-class unchanged), fail-before/pass-after. Verified byte-identical across
      all 6 single-class team fixtures.
- [x] **B3 (CRITICAL, Sorlock) — Pact Magic + shared slots at the same level shared ONE usage counter.**
      FIXED 2026-06-24. `session.spellSlots` was keyed by level only; Sorc3/Warlock2 spending one shared L1
      slot made the Pact L1 cell drop too, and `paymentAffordable`/`buildCastOptions` summed BOTH pools'
      totals (4 normal + 2 pact) against the single counter → over-spend across pools. Fix: one pure
      `slotUsageKey(slot)` helper in `lib/cast-options.ts` (a pact slot → `pact-<level>`, a normal/shared slot
      → the bare `String(level)` — so a legacy `"1"` doc resolves the normal pool UNCHANGED; back-compat is
      free, no migration). EVERY read + write routes through it: the store `useSpellSlot`/`restoreSpellSlot`
      (now `(level, pactMagic?)`), `recoverTrackerFromSpellSlot`, `applyArcaneRecovery`, the short rest (now
      restores ONLY `pact-*` keys, never wiping the normal pool); `buildCastOptions`; `paymentAffordable` +
      the Arcane Recovery read in `TurnEconomyProvider`; the rail slot grid (`ResourceRail`, pact-distinct
      React key + per-pool spend/restore), the Spells-page summary (`spells-view` → `SlotSummaryVM` gains
      `pactMagic`; `SpellCastSummary` distinct key + "P" badge), `PlayTab` slot pips, the Font-of-Magic
      conversions (`ResourceConversions`, resolved to the non-pact pool), and `getSpellSlotTrackerRecovery`
      (`smart-tracker`). The two pact-aware cast commits thread `opt.pactMagic` (`commitCastOption`,
      SpellsTab `castAtLevel`); the two bare level-only commit sites (reaction / feature) resolve the pool via
      `bareSlotIsPact` (normal if present, else pact for a pure Warlock). Arcane Recovery's `!pactMagic`
      filter stays as RAW domain logic (pact slots aren't Wizard slots) — no longer a collision workaround now
      the keys are distinct. Regression `tests/unit/pact-slot-key.test.ts` (Sorc3/Warlock2: spending a shared
      L1 leaves Pact L1 at 2; no cross-pool over-spend; legacy `"1"` resolves the normal pool; short rest
      restores only pact), fail-before/pass-after. Verified byte-identical across all 6 single-class team
      fixtures.
- [x] **B4 (HIGH, every item-buffed weapon) — inventory weapon to-hit/damage + finesse stat + carrying
      capacity use RAW scores, diverging from combat. FIXED 2026-06-24.** The weapon-row builder resolved from
      `character.abilityScores` (base) while combat uses `combatAbilityScores` (effective) — Gauntlets of Ogre
      Power: combat +8, inventory +3; a finesse weapon could pick a different stat; `carryingCapacity` was
      understated (8×15 not 19×15). FIXED at the ONE seam (rule 6): `buildInventoryViewModel` resolves
      `effectiveScores` ONCE via the canonical `aggregateCharacterGrants(character, session)`
      (`resolveAllGrantSources` — sees EQUIPPED items, threads session toggles, exactly as `combatAbilityScores`) + `effectiveAbilityScores(...)`, threads it into `buildWeaponVM` (the 3 raw `character.abilityScores`
      reads — `resolveWeaponStat` STR/DEX, `abilityModifier[stat]`, and the now-dead `const character` —
      DELETED) and `carryingCapacity(effectiveScores.STR)`. Regression `inventory-view.test.ts`: Gauntlets →
      inventory quarterstaff to-hit EQUALS the combat to-hit (+8, NOT raw +3), rises +5, capacity 285 not 120,
      behaviour-preserving with no item. Fail-before proven (3→8, +0→5, 120→285). A carried weapon is always
      wielded in the character's OWN body, so the blanket effective-score swap is correct (it mirrors combat).
- [x] **inventory-monk-DEX (B4-family — inventory weapon stat ignored the Monk Martial-Arts swap. FIXED
      2026-06-25).** The inventory weapon-row called `resolveWeaponStat` (finesse STR-vs-DEX only) but NOT
      the 2024 Monk MONK-MELEE stat swap (`weaponScope:"monk-melee"` → DEX for Monk weapons + Unarmed) the
      COMBAT path applies — so a Monk's inventory weapon showed a STR to-hit while combat showed DEX (rule-6
      divergence; the inventory comment FALSELY claimed it "can never disagree with the Play card"). FIXED by
      unifying the attack-stat math: the combat carried-weapon loop, manifested weapons, AND the inventory row
      now ALL resolve through ONE authority `resolveWeaponAttackStat({weaponType, properties, scores,
weaponAttackAbilities, isMonkMelee})` (`compute.ts`, replacing `resolveWeaponStat`) — finesse (by
      MODIFIER, ties→DEX, closing a second latent score-vs-modifier divergence) + the monk-melee DEX swap,
      identical by construction. The false comment was corrected. Regression in `monk-weapon-dex.test.ts`
      (the live Monk fixture: inventory Spear to-hit EQUALS combat to-hit = +5 DEX, damage mod +3) + the migrated/extended
      `compute.test.ts` (monk-melee swap on/off, finesse modifier-tie). Fail-before proven (inventory Spear
      +1 STR → +5 DEX). The live Monk fixture's Spear: inventory to-hit +1 (STR −1 + PB 2) → +5 (DEX +3 + PB 2),
      AGREEING with combat (already +5) — a correctness fix; the Dagger (finesse, already DEX) is unchanged.
      `.json` byte-identical; the conformance dump reads the combat path (already +5) so NO dump update.
- [x] **B5 (MODERATE) — max-HP breakdown tip disagreed with the headline by +5 (FIXED 2026-06-24).** Aid's
      `hp-flat:5` lives inside a `while-active`; the headline read recursively-aggregated `agg.hpFlat` (+5)
      but `hpFlatBreakdownParts` re-walked sources TOP-LEVEL only and never descended into while-active
      (rule-6 invariant broken; was latent for `hp-per-level`). FIX: `evaluateGrants` now accumulates an
      ATTRIBUTED `hpFlatParts: Array<{ ref: {kind,key}; amount }>` inside `applyGrant` at the SAME seam
      `hpFlat += g.amount` runs — so it INHERITS the identical recursion + while-active descent + source-name
      attribution (the `ref` is an ID, GR7; localized only at the view edge). `effectiveMaxHpBreakdown` MAPS
      that list (the dead re-walk `hpFlatBreakdownParts` is deleted); `sum(hpFlatParts) === agg.hpFlat` and
      `breakdownTotal(base) === character.hp.max`, so `breakdownTotal === effectiveMaxHp` BY CONSTRUCTION. The
      Aid row falls out (label byte-identical: `srd spell/aid/name`). Shipped WITH the `aidBonus` deletion
      below. Regression in `crit-range-hp-flat.test.ts` (fail-before: breakdown summed to −5 + no Aid row).
- [x] **B6 (MODERATE, narrow multiclass) — class-scoped spell DC/attack bump applied to the wrong spells
      when two caster classes share a casting ability. FIXED 2026-06-24.** The per-spell DC/attack recompute
      gate keyed on ability ONLY (`diverges = refAbility !== casterAbility`): Bard6/Sorc3 (both CHA) + Innate
      Sorcery (`scope:"sorcerer"` +1) → a Sorcerer-only spell had `diverges=false`, fell to the
      primary-bard-scoped precomputed DC, and DROPPED the +1 (mirror OVER-count when Sorcerer is primary and a
      Bard-only spell inherited it; same drop for Rod of the Pact Keeper `scope:"warlock"`). FIXED at the ONE
      gate in BOTH per-spell seams — `spells-view.ts` (Spells tab + PDF + compendium-familiar reuse it) AND
      `smart-tracker.ts` (the combat/action path, which already threads `session.activeFeatures` so the
      while-active Innate Sorcery bump surfaces there): recompute now fires when ability OR owning CLASS
      diverges (`overrideAbility !== null || owningClassId !== classId`), feeding
      `resolveCastingModifier(entries, owningClassId)` (already wired) and the owning ability's effective score
      (`dcAbility = refAbility ?? casterAbility`, null-guarded for a non-caster/custom spell). The
      `overrideAbility` VM field KEPT its ability-only meaning (it drives the SpellCard "ability differs" hint);
      only the recompute CONDITION widened. The compendium familiar "Your Save DC" line correctly stays on the
      primary headline `castSummary.saveDC` (not a per-spell value) — no change. Regressions:
      `spells-view.test.ts` (Rod/warlock, always-on grant, observable in the view) + `smart-tracker.test.ts`
      (Innate Sorcery `scope:"sorcerer"` while-active + the mirror no-over-count + a Rod analog). Fail-before
      proven (4 assertions). 6 team fixtures byte-identical (all single-class → `owningClassId === classId`).
- [x] **B6 follow-up — thread `session.activeFeatures` into the spells-view aggregate. FIXED 2026-06-25.**
      `buildSpellsViewModel` called `evaluateGrants(resolveAllGrantSources(character))` WITHOUT the active-feature + bundle-choice context the combat path passes (`smart-tracker.ts` `spellGrantAggregate`), so the Spells-tab
      DC/attack reflected NO `while-active` casting bump — Innate Sorcery (`spell-save-dc-bonus` +1,
      `scope:"sorcerer"`) and Robe-of-the-Archmagi-while-active surfaced in combat but NOT on the spell card (a
      cross-surface divergence, rule 6). FIXED by mirroring the combat call EXACTLY:
      `evaluateGrants(resolveAllGrantSources(character), new Set(session.activeFeatures ?? []), new Map(Object.entries(session.grantBundleChoices ?? {})))`
      (`session` already in scope — the presenter builds rows from `character` + `session`). The Spells-tab per-card
      DC now EQUALS the combat-tab `summary.saveDC` for a while-active class-scoped bump BY CONSTRUCTION (both route
      the same aggregate input + the same `effectiveSpellSaveDc` + `resolveCastingModifier(entries, owningClassId)`
      formula). Override-first preserved (a manual global DC override still wins; the pure reset target folds the +1).
      Regression: `spells-view.test.ts` (pure Sorcerer 3 + Acid Splash — Innate Sorcery ACTIVE → card DC 15,
      INACTIVE → 14, AND card DC == combat DC in both states). Fail-before proven (pre-fix the ACTIVE card stayed
      14). 6 team fixtures byte-identical (none is a Sorcerer / has a while-active casting bump).
- [x] **B7 (LOW, Armorer/Starry) — form attacks use RAW stored scores. FIXED 2026-06-24.** The
      `resolveActions` caller passed `charData.abilityScores` (raw) to `resolveFormAttacks` while every sibling
      row passes `ctx.abilityScores` (effective). FIXED as the S7 item prescribes — NOT a blanket swap:
      `resolveFormAttacks` now takes BOTH `abilityScores` (raw) AND `effectiveScores`, selecting per row on
      `fa.attackAbility` — EFFECTIVE for a MENTAL/spellcasting form (Armorer INT Thunder Gauntlets, Starry WIS
      Archer: a Headband of Intellect lifts them, matching every INT/WIS-keyed combat row), RAW for a PHYSICAL
      natural weapon (a beast's bite uses the FORM's body, so an item STR floor does not carry into beast form;
      the deeper "model the beast's own STR scores" gap is separate + out of scope). Regression
      `form-swap-attacks.test.ts`: Headband Armorer Thunder Gauntlets → +6 (effective INT 19), NOT +2 (raw);
      Gauntlets Moon-druid bite STAYS +3 (raw STR 10). Fail-before proven for the mental form (2→6); the
      physical bite is unchanged by construction.
- [x] **B8 (MODERATE, every ability-keyed bonus layer) — additive ability-keyed layers still read RAW scores
      while their sibling base mod uses EFFECTIVE. FIXED 2026-06-24.** B4 routed the inventory/carrying/form
      math through `effectiveAbilityScores`; an adversarial sweep found the SAME defect family in four
      additive ability-keyed layers that scale a derived bonus with a CURRENT ability mod (RAW 2024: the bonus
      scales with the effective score, so a magic item raising the keyed ability raises the bonus). FIXED at
      each call site by passing the SAME effective map the base mod already uses (rule 6 — never a per-caller
      reinvention; the producing functions were already correct): - **Save-bonus ability layer (MAIN target).** `resolveSaveBonus` (Aura of Protection +CHA, Increased
      Toughness +WIS) was fed RAW `abilityScores` at all three callers — `characterStore.ts:434` (concentration
      toast), `LeftHud.tsx:156` (the hand-summed `saveBonusFlat` Aura layer), `character-pdf-view.ts:415` (same).
      A Paladin with a CHA-boosting item under-added Aura of Protection. FIXED: the store resolves
      `effectiveScores` ONCE and feeds the base CON save + `resolveSaveBonus` + `resolveConcentrationSaveBonus`
      (Bladesong Focus +INT) from it; LeftHud + the PDF swap their `saveBonusAbilities` reduce to the
      `effectiveScores` already computed for the base mod (the raw `charData.abilityScores[b.ability]` reads
      DELETED). The conformance harness `tests/_harness/sheet-dump.ts` now resolves the FULL effective channels
      (floors + additive + caps), matching LeftHud/PDF (was floors-only). - **Companion AC owner-mod.** `resolveCompanion(..., charData.abilityScores)` at `FeaturesTab.tsx:608`
      (Steel Defender / Eldritch Cannon AC = base + owner INT mod) fed RAW — a Headband of Intellect should
      raise it. FIXED: the `features` memo resolves effective scores once and feeds them. The companion's OWN
      fixed scores (`block.abilityScores` inside the helper, `compute.ts:1814/1816`) stay correctly RAW. - **Short-rest heal CON preview.** `RestModal.tsx:115` used RAW CON while the REAL heal engine
      (`smart-tracker` `combatAbilityScores`, "Amulet of Health") uses EFFECTIVE CON — the preview disagreed
      with the actual heal. FIXED: the preview routes through the same effective CON. - **Aura effect-line dice.** `ResourceRail.tsx:537` `auraEffectLine(a, charData.abilityScores, …)` →
      `resolveAuraDice` resolves ability tokens in an aura's dice (a Paladin/Cleric aura keying CHA/WIS);
      FIXED to effective for consistency with every other ability-derived display.
      Regression coverage (function + SURFACE pins): a store-level fail-before (`character-store.test.ts` B8) —
      a Bladesinger Wizard, Bladesong active + Headband of Intellect equipped, takes damage while concentrating →
      the toast's `saveBonus` rises by exactly the Focus delta (+4 effective vs +0 raw/floored, PROVEN delta
      0 → 4). The per-cluster RAW-vs-EFFECTIVE facts (Aura +5 not +1, companion AC 16 not 12, rest CON preview
      +4 not −1, concentration Focus +4 not 0) are pinned in `ability-score-set.test.ts` against the producing
      functions (rule 13). On top of those, each FIXED surface WIRING now carries ≥1 fail-before/pass-after pin
      (golden rule 13 — reverting any one surface's line to raw FAILS a test): the **LeftHud save medallion**
      (`left-hud.test.tsx`, WIS save +6 not +5) and the **PDF save VM** (`character-pdf.test.ts`,
      `buildCharacterPdfViewModel` WIS save +6 not +5) — these two duplicated the same `saveBonusFlat` reduce, now
      EXTRACTED into one shared pure `flatSaveBonus(aggregate, effectiveScores)` in `compute.ts` (rule 6; the
      duplicated reduce DELETED from both, a single `ability-score-set.test.ts` helper pin covers both: eff CHA 20
      → +5, raw 12 → +1); the **companion AC** (`features-origin-feat.test.tsx`, Steel Defender AC 16 not 12 with
      a Headband); the **short-rest CON preview** (`rest-modal-con-preview.test.tsx`, `1d8 +4 HP (avg 9)` not
      `1d8 -1 HP (avg 4)` with an Amulet of Health); the **aura effect-line dice** (`resource-rail.test.tsx`,
      Wrath of the Sea `3d6 Cold` not `2d6` with an Ioun Stone of Insight). NO site was left raw-by-design: the
      four sites are all effective-correct per 2024 RAW; the three EXCLUDED sites (`feat-prereq.ts` base-score
      prereqs, `compute.ts` companion-OWN stat block, `InventoryTab.tsx` transient pre-persist AC) stay RAW
      correctly. Verified byte-identical across all 6 team fixtures (none carries a save/companion-keyed boosting
      item).
      LATENT GAP (recorded, NOT fixed — out of scope): the HP-max / multiclass-prereq / `bestAbility` cluster
      reads BASE ability scores by design (max-HP locked to base CON; multiclass + feat prereqs check the innate
      score per RAW) — a future "should HP scale with effective CON?" RAW decision, out of scope here.

**Wrong-implementation data fixes (W-series not already covered by a B above):**

- [x] **W8 — cantrip `concentration` flags VERIFIED against the 2024 SRD: ZERO mismatches (data already
      correct) — 2026-06-25.** Enumerated all 34 level-0 spells in `src/data/spells/cantrips.ts` and checked
      each one's stored `concentration` flag against its 2024 Duration line on `dnd2024.wikidot.com/spell:<id>`
      ("does it start with 'Concentration'?"). The original suspicion was wrong: Guidance and Resistance are
      NOT reactions in 2024 — both have Duration "Concentration, up to 1 minute" and were ALREADY correctly
      flagged `true`; likewise blade-ward / dancing-lights / friends. Exactly 5 cantrips are concentration
      (blade-ward, dancing-lights, friends, guidance, resistance); the other 29 (every damage/utility cantrip —
      Fire Bolt, Sacred Flame, Eldritch Blast, Toll the Dead, Mind Sliver, …) are correctly `false`. No flag
      changed; no fixture/dump impact (all 6 team fixtures byte-identical). Locked by a NEW exhaustive
      `spell-data-integrity` guard (`pins every cantrip's 2024 concentration flag (W8 …)`) — a full
      `{id → concentration}` table for all 34 cantrips PLUS an exhaustiveness check (the shipped cantrip-id set
      must equal the table), so a future cantrip can't ship an unverified flag. Fail-before proven (flip any
      flag → guard fails with a clear message).
- [x] **W9 — Dueling damage rider applied to two-handed melee — FIXED 2026-06-25.** RAW (`feat:dueling`):
      "When you're holding a Melee weapon in one hand and no other weapons, you gain a +2 bonus to damage
      rolls with that weapon." The +2 rider was scoped `appliesTo:"melee-weapon"`, so it rode ANY melee
      weapon — incl. a Two-Handed Greatsword and a Versatile weapon's two-handed stance. Added a new
      `damage-rider` scope `appliesTo:"one-handed-melee"` (Dueling now uses it): the carried-/manifested-weapon
      resolver (`resolveAttackDamageRiders`) gates it to a melee weapon that is NEITHER Ranged NOR a
      Two-Handed-PROPERTY weapon (a Versatile weapon's one-handed grip still qualifies; the two-handed
      `versatileDamage` stance is a separate display formula it never touches), and NEVER an Unarmed Strike.
      A strict `/\btwo-?handed\b/i` property check feeds the new `isTwoHanded` target flag (distinct from the
      Versatile-inclusive `isTwoHandedCapable` GWF uses). The "no other weapons" (dual-wield) clause stays
      informational — the engine can't see the live wielded set (a carried backup ≠ dual-wielding) and a
      Shield is allowed — so only the determinable grip is gated (override-first). Scope-matrix tests
      (qualifying one-handed/Versatile-one-handed vs non-qualifying Greatsword/Versatile-two-handed/ranged/
      unarmed) pin both the pure resolver and the end-to-end carried-weapon row; fail-before proven. The
      `rider-stack` worst-case dev scenario dropped Dueling (two-handed-incompatible: it never fired on its
      Greatsword) → 7 rider tokens, honest. 6 team fixtures byte-identical. LOW.
- [x] **W10 — base `levels[]` arrays hardcoded subclass feature ids — FIXED 2026-06-24 (rule 10).** Inert
      today (the apply path `applyNewFeatures` reads `getFeaturesAtLevel` + re-filters by the CHOSEN subclass,
      and the level-up cards render that FILTERED change — never the base `levels[].featureIds` verbatim), but
      it mis-described the level table + was a trap. Removed the subclass ids from the base `levels[]`
      generation in **bard** (College of Lore: bonus-proficiencies/cutting-words/additional-magical-secrets/
      peerless-skill), **druid** (Circle of the Land: circle-spells/lands-aid/natural-recovery/natures-ward/
      natures-sanctuary) and **paladin** (Oath of Devotion: sacred-weapon/aura-of-devotion/smite-of-protection/
      holy-nimbus — caught by the new guard, NOT named in the original W10 scope). New guard
      `tests/unit/base-levels-no-subclass.guard.test.ts` resolves EVERY base `levels[].featureIds` entry against
      `classFeatureIndex` and fails if any carries a `subclass` tag — locks the seam for every class (12 public + the pack’s Artificer).
      Verified no behavior change (level-up/aggregation suites green) + byte-identical against the 6 team fixtures.
- [x] **W11 (LATENT — VERIFIED 2026-06-25, all shipped formulas character-wide; owning-class path remains a
      documented latent for a future multiclass class-level item) — `resolveChargesFormula` resolves on TOTAL
      character level, not the owning-class level (the B2 lesson).** `resolveChargesFormula` passes no
      `scalingLevel` to `resolveTrackerTotal`, so a `"level"` term in a free-cast `chargesFormula` would scale on
      total character level. **VERIFIED against the 2024 SRD that this is correct for EVERY shipped formula** —
      all five scale on a character-WIDE value (PB or an ability modifier), NONE on a class-specific level, and
      NONE even uses a `"level"` token: `greater-mark-of-healing` Cure Wounds = `"PB"` ("Proficiency Bonus");
      `forest-gnome` Speak with Animals = `"PB"` ("Proficiency Bonus"); `druid-stars-star-map` Guiding Bolt =
      `"WIS"` ("Wisdom modifier"); `ranger-fey-wanderer-misty-wanderer` Misty Step = `"WIS"` ("Wisdom modifier");
      `artificer-cartographer-mapping-magic` Faerie Fire = `"INT"` ("Intelligence modifier"). Data + total-level
      resolution are CORRECT; the latent note holds. **No data/behaviour change (Outcome A).** Added a GUARD
      (`tracker-owning-class-level.test.ts` → "W11 — every shipped free-cast `chargesFormula` scales on a
      character-WIDE value") that PINS the current set (PB×2, WIS×2, INT×1) and asserts EXHAUSTIVELY that no
      shipped `chargesFormula` references a `"level"` token — so a future MULTICLASS magic-item charge formula
      referencing CLASS level CANNOT silently ship resolving on total level (it would trip the guard, forcing the
      B2 fix: thread `featureScalingLevel(...)` as the 3rd arg to `resolveChargesFormula`, as
      `resolveTrackerTotal` already does for class trackers). The latent note stays at the resolution site
      (`lib/smart-tracker.ts`). LOW (the owning-class path is built only when a triggering item lands).

**✅ RESOLVED — half-caster multiclass rounding VERIFIED correct per 2024 RAW (2026-06-25; no change).**
`multiclass-slots.ts:91 casterLevelContribution` uses `Math.ceil(level/2)` (round UP) for
Paladin/Ranger/Artificer and rounds **per entry then sums** — this is RIGHT per 2024 RAW: EN
(`dnd2024.wikidot.com/class:multiclassing`) "Half your levels **(round up)** in the Paladin and Ranger
classes"; IT SRD 5.2.1 (p.29) "Metà dei suoi livelli **(arrotondati per eccesso)**" = rounded UP. 2024
REVERSED the 2014 round-down. So Paladin5/Wizard5 correctly yields combined caster-level 8 (ceil(5/2)=3 + 5).
The third-caster `Math.floor(level/3)` (EK/AT) is likewise confirmed correct ("one third … round down"). The
code, comment, and tests are all correct — pinned by `tests/unit/multiclass-slots.test.ts`.

**Dead-code cleanups (rule 10 — ship with the related fix, each verified to have no non-test writer/caller):**

- [x] **`session.hp.aidBonus` (DELETED 2026-06-24, shipped with B5)** — was read in `effectiveMaxHp`/breakdown + plumbed through codec/sanitize/cache, but NO writer set it non-zero (superseded by the Aid while-active
      grant; a not-yet-migrated import carrying `aidBonus:5` + the toggle = +10 double-count). DELETED: the
      `SessionState.hp.aidBonus` field + the `+aid` term in `effectiveMaxHp`/`effectiveMaxHpBreakdown` + every
      plumbing site (codec write/read, sanitize-session, character-cache, HeaderHpControl passthrough — confirmed
      pure passthrough, NO editing UI — CreationWizard, characterStore long-rest, mock, dev-scenarios). A
      one-way read-normalization at the three input boundaries (codec parse, sanitize-session, cache) silently
      DROPS an incoming `aidBonus` (never re-emitted). The correct Aid breakdown row falls out of B5's
      `hpFlatParts`. `grep aidBonus src/` is clean (comments only). Regression in `sanitize-session-partial` + `crit-range-hp-flat` (an imported `aidBonus:5` adds nothing).
- [x] **`armorEffects` / `effectiveWalkingSpeed` / `exhaustionSpeedReduction` (`compute.ts`) — DELETED
      2026-06-24 (shipped with S13)** — dead duplicates of `effectiveWalkingSpeedFt`. S13 folded the
      heavy-armor STR penalty (G11) into the live function, applied `agg.speedMultiplier` (G12), and
      moved the unproficient-armor disadvantage emission to `resolveArmorEffects` (condition-effects).
      Verified ZERO production callers (only the defs + doc comments referenced them); deleted the
      functions + their tests (`armorEffects` describe, the `exhaustionSpeedReduction` it, and the
      `effectiveWalkingSpeed`-consumer block which was rewritten to drive the LIVE function).
- [x] **`initiativeBonus(dexScore)` FUNCTION — DELETED 2026-06-24 (rule 10).** No non-test caller (only its
      definition + two `compute.test.ts` assertions referenced it); took raw DEX and would bypass the
      effective-scores chokepoint (`effectiveAbilityScores`) if re-wired. The live path is `computeInitiative`.
      Deleted the function + its `describe("initiativeBonus")` block + the unused import.
- [x] **`CharacterData.initiativeBonus` legacy FIELD — DELETED 2026-06-24 (rule 10).** Superseded by
      `initiativeBonusOverride` (the 2026-05-28 split). NO writer set it; the only readers were the two
      sanctioned bounded ONE-WAY read-normalizations — `migrateInitiativeBonus` (`sanitize-character.ts`, folds
      a legacy stored value into `initiativeBonusOverride`) and `rehydrateCharacter`'s `delete c.initiativeBonus`
      (`character-minimal.ts`, drops it at the cache boundary). Both operate on untyped `Record<string, unknown>`
      so they KEPT working with NO typed field (they recognize the legacy key at the untrusted input boundary,
      never re-emit it). The codec's `["initiativeBonusOverride", "initiativeBonus"]` is the LIVE override's
      export-key mapping (`build.overrides.initiativeBonus`), unrelated to the dead field — untouched. Removed
      the field + its doc comment from `CharacterData`; stripped the pointless `initiativeBonus:` line from ~27
      typed test fixtures (kept the 4 `sanitize-character.test.ts` raw-input cases — they pin the read-norm).
      Regression: `sanitize-character.test.ts` (legacy `initiativeBonus` still migrates) + a new
      `character-minimal.test.ts` case (a cached doc carrying a stray legacy key rehydrates WITHOUT it). Verified
      byte-identical against the 6 team fixtures.
- [x] **B3 spillover (dev-only) — `dev-scenarios.ts` seeded `sessionSlots[String(level)]` by bare level —
      FIXED 2026-06-24.** Routed through the canonical `slotUsageKey(slot)` so a dev Sorlock's two same-level
      pools seed under distinct counters (`pact-N` vs `N`), no parallel keying convention. Behavior-identical
      for the single-class caster scenarios (normal pool → `String(level)`); only warlock/pact pools re-key.
- [x] **B3 spillover (cosmetic) — `ResourceRail` pending-spend PREVIEW keyed by bare level — FIXED 2026-06-24.**
      The transient `pendingSlots` map (built from the active combat selection) keyed by `slot.level`, so a
      Sorlock queuing a normal L1 cast OVER-PREVIEWED a pending dot on BOTH same-level rail rows (normal AND
      pact). Now keyed by `slotUsageKey({ level, pactMagic: bareSlotIsPact(slotTable, level) })` — the SAME key
      the real spend (B3) writes — so the pending dot lands only on the row that will actually be spent.
      Regression in `resource-rail.test.tsx` (a normal-L1 preview lights the normal row, not the pact row),
      fail-before/pass-after.

---

## Correctness + exposure batch (workstream D)

Ranked correctness gaps and the per-kind exposure gaps the `grant-kind-exposure.guard.test.ts`
pins to this list. Each names the consumer / helper that closes it.

- [x] **`hp-flat` → effective max HP (was the #1 ranked exposure gap) — SHIPPED (2026-06-22).** `effectiveMaxHp(doc)` (`lib/aggregate-character.ts`) folds `hpFlat` (Draconic Resilience +3, Tough, Boon of Fortitude +40, the Aid spell's while-active +5) + the standing Aid bonus onto the stored base, and is now adopted by every `hp.max` reader (HP control, roster card, Party/member-snapshot, RestModal, smart-tracker, dying thresholds). Verified against the 6 team fixtures.
- [x] **Additive item ability-score bonuses reach all combat math — SHIPPED (2026-06-24).** The evaluator splits the additive `ability-score` aggregate BY SOURCE KIND: a new `itemAbilityScoreBonus` (+ tightest-cap `itemAbilityScoreCap`) channel is fed ONLY when the grant's `gref.kind === "magic-item"` (preserved through `while-active`/`choice-grant-bundle` recursion), so FEAT/class/race ASIs — already baked into the stored scores at the ASI / level-up step — can NEVER double-count. The single `effectiveAbilityScores(base, floors, additive, caps)` chokepoint folds the bonus AFTER the floor and clamps to the per-item resulting-score cap (RAW max 20); every combat/cast/display/PDF/save consumer (`combatAbilityScores`, `aggregate-character` AC, `spells-view`, `character-pdf-view`, concentration CON save, the **`ThisTurnTracker` Play-board initiative total**, `CombatHeader`/`LeftHud`) routes through it (rule 6). Item bonuses gate on equipped+attuned via the existing equipment seam; manual stored-score overrides still win. Data: Belt of Dwarvenkind (+2 CON) already wired; the six +2 Ioun stones (Agility/Strength/Fortitude/Insight/Intellect/Leadership) now emit `ability-score` options. (Efreeti Chain carries no ability-score grant — only fire-immunity/+3 AC/Primordial — so it is correctly out of scope.) Verified byte-identical against the 6 team fixtures (no additive-stat item → effective === stored). **The ONE documented exception is max-HP-from-CON:** it reads raw stored CON today for set-score items too, so the additive path stays consistent with that precedent (a future, separately-scoped change) — it is deliberately NOT rerouted. (`ThisTurnTracker` initially read the RAW stored DEX for its displayed initiative total, missing item bonuses + set-score floors while `CombatHeader`'s DEX numbers folded them on the same screen — a visible 6b divergence; the initiative DEX read now routes through `aggregateCharacterGrants` → `effectiveAbilityScores`, the same chokepoint, pinned by `tests/unit/this-turn-condition-projection.test.tsx`.)
- [x] **Additive darkvision stacking — SHIPPED (2026-06-22).** An additive `darkvision` variant + consumer (Gloom Stalker Umbral Sight +60 → 120 for a ≥60-ft species, not capped at MAX).
- [x] **Epic Boon L19 framing — SHIPPED (2026-06-22).** L19 surfaces as the per-class Epic Boon feat rather than a 5th generic `*-asi`.

**Already correct — do NOT re-open (verified against the data):**

- ~~Bardic Inspiration PB→CHA~~ — `bard.ts` already declares `bardicInspirationUses:"CHA"`; `resolveTrackerTotal` resolves CHA mod (min 1). The old "BUG: total:'PB'" flag was STALE.
- ~~Barbarian Rage long-rest-only~~ — `barbarian.ts` already has `recovery:"short-rest"` + `shortRestRecovery:1`. STALE.
- ~~Divine Intervention 2014→2024~~, ~~2024 core-trait lists (Druid armor/weapons + Herbalism, metamagic list+count, EK/AT no-school +3rd cantrip, Monk/Rogue tools, Sorcerer/Wizard weapon+skill lists)~~ — shipped in the 2024-correctness batches; see CHANGELOG + git. Re-confirm any that surface in the matrix regen, but treat them as closed.

---

## Cadence-dependent mechanics unblocked by S3 (record so they survive — golden rule 16)

> **S2 + S3 + the duration data SHIPPED on `main` (2026-06-22).** The old `feat/cadence-data` held
> branch was rebuilt fresh on current `main` (golden rule 10) and **deleted**. The 4 owner taste forks
> it carried (rider spend model, rider visibility, provenance placement, Hit-Die pool reuse) are
> **RESOLVED in the shipped implementation** — the decisions now live in the code. The 4 mechanics
> fenced behind "review S3 cadence first" were UNBLOCKED; **3 are now WIRED on existing primitives**
> (Stunning Strike, Studied Attacks, 2026-06-24; Dread Ambusher's Ambusher's Leap, 2026-06-25) and
> **the 4th — Death Strike — is now SHIPPED 2026-07-09** as a display-only round-1 note (a NEW
> `round1-damage-double` grant kind; no auto-doubling, since the app models no enemy and never rolls):

- [x] **Stunning Strike — WIRED (2026-06-24).** A SELF-SIDE Ki affordance: the Monk's `free`
      Stunning Strike action (already costing 1 `monk-focus`) now also surfaces the "CON save · DC N"
      line, where the DC routes through the ONE `featureSaveDc` formula (8 + PB + WIS mod). Wired with
      ZERO new primitives: a generic `saveAbility` + `saveDcAbility` pair on `SrdActionDef` (the target's
      save vs the character ability that governs the DC), resolved in the feature-action branch of
      `resolveActions`, rendered by the EXISTING action-card save line. The app NEVER models the enemy
      nor applies a Stunned condition (BG3 on-rails — no modeled enemies; golden rule 21). The DM/player
      rolls the save externally.
- [x] **Death Strike — SHIPPED 2026-07-09 (display-only round-1 note).** Resolved as a NEW
      `round1-damage-double` grant kind (`{ saveAbility: "CON", saveDcAbility: "DEX" }`) — the round-1
      counterpart of Assassinate's `advantage-on { round1 }`. It is NOT a real doubler (the app models
      no enemy and never rolls — golden rule 21): the grant carries the ability pair,
      `resolveRound1DamageDoubles` resolves the concrete DC (8 + PB + DEX mod via the ONE `featureSaveDc`
      formula, over EFFECTIVE scores), and `ThisTurnTracker` renders a DISPLAY-ONLY reminder ("on a hit,
      the target makes a DC N CON save or the attack's damage is doubled") ONLY while combat round === 1
      (the SAME round-1 gate Assassinate uses). The DM/player runs the save + applies the doubling
      externally. Regression: `death-strike.test.ts` (the DC resolves; a non-Assassin yields nothing —
      fail-before proven).
- [x] **Studied Attacks — WIRED (2026-06-24).** A player-armed SELF-SIDE toggle: a `while-active`
      (key `fighter-studied-attacks`) wrapping an `advantage-on { rollType: "attack" }` clause, with a
      `timed` `maxRounds: 2` duration — the SHIPPED S3 until-next-turn cadence. There is no hit/miss
      outcome event in the immediate-commit combat model (the engine never learns a roll missed — no
      dice, golden rule 21), so the engine cannot auto-arm: the player flips the toggle ON after a miss
      (override-first). `advanceEffectTimers` decrements 2→1 at THIS End Turn and drops it 1→0 at the END
      of the player's NEXT turn — exactly "until the end of your next turn". The "against that creature"
      scoping stays narrative (no modeled enemies). ZERO new primitives — composed from `while-active` +
      `advantage-on` + the `timed`/`effectTimers` cadence.
- [x] **Dread Ambusher — FULLY WIRED (2026-06-25).** All three 2024 benefits are auto-modeled:
      Dreadful Strike (once-per-turn extra 2d6→2d8 Psychic, `damage-rider` + `diceByLevel`), the WIS
      Initiative bonus (`initiative-bonus`), and **Ambusher's Leap** — "At the start of your first turn
      of each combat, your Speed increases by 10 feet until the end of that turn" — now a `round1`
      `speed` grant. This is the SPEED counterpart of Assassinate's `advantage-on { round1 }` (no new
      gate mechanism): the +10 routes into the `round1SpeedBonusFt` aggregate bucket and
      `effectiveWalkingSpeedFt(char, resolveSrd, round)` adds it only when passed `round === 1`, then it
      auto-clears from round 2+. Override-first (`speedOverride` still pins the Speed). **The 2014
      "first-turn EXTRA ATTACK" is GONE in 2024** — verified vs `http://dnd2024.wikidot.com/ranger:gloom-stalker`
      ("Ambusher's Leap … your Speed increases by 10 feet"; Dreadful Strike; Initiative Bonus — no extra
      attack) — so there is no extra-attack gap to defer; the stale note is dropped (golden rule 10).

---

## `srdEn` shrink-list (R3 STAGE 2 — drive the EN-fact exemption toward zero)

> `src/i18n/srd-en.ts` — `srdEn(kind, key, field)` — is the pure English-only accessor the engine
> uses to PARSE FACTS out of canonical SRD wording (damage dice, durations, reaction triggers). It is
> the ONE i18n module engine-core may import (a narrow, architecture-direction-guard-whitelisted
> exemption; see the i18n-completeness locks + dependency rules in `docs/ARCHITECTURE.md` →
> "Architecture invariants"). The exemption is tracked + shrinking: each genuine
> fact-parse site below becomes a STRUCTURED data field, after which the `srdEn` call disappears.
> **Goal: zero `srdEn` call sites; then delete `srd-en.ts` + its guard whitelist.**
>
> **Scope note (2026-06-26):** the true current count is **~27 `srdEn(` call sites across ~12 files**
> (`smart-tracker.ts` now has 5 — the reaction-trigger read retired with row 4's action path), so the
> 5-row table below is a non-exhaustive SAMPLE of the highest-value fact-parse families, not the full
> inventory — a complete re-ground is owed alongside the matrix regen.

| #     | Call site (file:line)                           | Reads (English fact)                                               | Structured field that retires it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [x] 1 | ~~`lib/smart-tracker.ts` `extractDamageDice`~~  | _retired_ (was `spell.description.en` → damage dice)               | **DONE (S12, 2026-06-24):** `damageDice` populated on all 126 dice spells; combat reads it + `scaleCantripDice`; regex deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [x] 2 | ~~`lib/smart-tracker.ts` heal-dice extraction~~ | _retired_ (was `spell.description.en` → heal dice)                 | **DONE (S12, 2026-06-24):** `healDice`/`effectTag:"heal"`/`healAddsCastMod` populated; combat reads them; regex deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [x] 3 | ~~`lib/smart-tracker.ts` duration branch~~      | _retired_ (was `spell.duration.en !== "Instantaneous"`)            | **DONE (2026-06-26):** structured `instantaneous` fact; the SRD-spell duration `srdEn`/`duration.en` read is retired.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| [x] 4 | ~~`lib/smart-tracker.ts` `extractTrigger`~~     | _retired_ (was action desc / spell castingTime → reaction trigger) | **DONE (action path, 2026-06-26; spell path, B5):** a structured `trigger: ReactionTrigger` token on `SrdActionDef` (34 reaction actions backfilled) AND the SAME `reactionTrigger: ReactionTrigger` token on `SrdSpellData` (Counterspell → `creatureCastsSpell`, reusing the B4 token); the presenter localizes `combat.reactionTrigger_<token>` (EN+IT, every free-text leak now translated). `extractTrigger`+`FEATURE_TRIGGER_PATTERNS` AND `extractSpellTrigger`+`SPELL_TRIGGER_PATTERNS` deleted (`descEn` `srdEn` read + the `castingTime` `litText` leak both gone). Both reaction-trigger prose parsers are now retired — row fully closed. |
| [ ] 5 | `lib/smart-tracker.ts` weapon-prof match        | `mw.name.en` as a weapon identity token                            | already an id-shaped match; switch to the weapon `id`, drop the `.name.en` token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Not in the shrink-list** (already correct after STAGE 2): ID-token sites (`race:${id}:${trait.name.en}`)
are golden-rule-7 violations tracked under the R3 reroute, NOT `srdEn` facts; display
`.name[locale]`/forced `.name.en` in smart-tracker/level-up/character-infer/the cockpit tabs are the
localization-line reverse-leaks (engine must emit ids/keys, `lib/views/` localizes; see
`docs/ARCHITECTURE.md` → "The presenter layer") tracked under the R3 reroute +
the `lib/views` seam — not here.

**Data-side GR7 closed:**

- [x] **`advantage-on`/`disadvantage-on` `vs` id-slug normalization (2026-06-24).** The `vs` field
      across `src/data/**` held English display strings (66 literals — "Death Saving Throws", "Charmed",
      "Dexterity (Stealth) checks", …), a golden-rule-7 leak by construction (a display-shaped string in
      code) even though it never rendered: the rail shows the clause's localized SRD-catalogue
      `description` (gated by `rollType`/`mode`, never `vs`; `hasInitiativeAdvantage` gates on `rollType`),
      so EN/IT were already correct. Normalized every `vs` to a stable id-slug (conditions reuse the
      existing condition ids, mirroring `condition-effects.ts`; abilities → codes/`<code>-save`; abstract
      phrases → kebab tokens like `death-saving-throws`/`scrying-spell`/`concentration-con-save`). EN
      display byte-identical (the `description` i18n key is positional, not `vs`-derived). Locked by
      `advantage-vs-slug.guard.test.ts` (every data `vs` matches `^[a-z0-9-]+$`) — a future English literal
      fails CI.

---

## Keep the docs honest

- [x] **Regenerate the per-entity coverage matrix against `HEAD` — DONE (2026-06-25, audit-backlog-CLOSED reconcile).** `docs/AUTOMATION_COVERAGE.md` was re-grounded to current `main`: the grounding banner now reads "Grounded to current `main` on 2026-06-25" and the campaign-closed rows were flipped to match the data. **Flipped → automated:** Cunning Strike / Devious Strikes / Maneuvers / War Magic (S6 — RENDERED, no longer "dead-code"), all damage spells + all heal spells (S12 — structured `damageDice`/`healDice`, prose-regex deleted), multi-instance + spell-area recurrence (S12b/G24), Metamagic per-cast + cantrips (S6/BUG-6/G6/W3), Cleric Divine Spark / Radiance of the Dawn / Sear Undead (S11/S11b), the pack-species revelation forms + Healing Hands + shroud save (G14/G18/S11b), GWM Heavy Weapon Mastery + Heavy Armor Master (G8/G9), Monk Martial-Arts weapon-die upgrade (G10), Sentinel reaction / Fighter Tactical Mind / Lay on Hands cure-conditions / Studied Attacks (G21/G23/G19), Stars Twinkling 1d8→2d8 (G20, now `partial`→scaling modeled, Fly-20 still open), effective walking Speed (S13), Goliath Large-Form STR-check + Dwarf Stonecunning tremorsense + Vow of Enmity advantage (G16/G17), two formerly-absent pack subclasses now PRESENT (were "MISSING"), bard/sorcerer/warlock Epic Boon (dedicated `*-epic-boon` feature, no longer generic ASI), and the Background-ASI 3-ability constraint (G7/W4). **Honest gaps kept** in the matrix (Notable gaps + per-row Notes): the area-spell 2014→2024 prose-corpus sweep (below), W8/W9, and the residual upcast/instantaneous spell-data follow-ups. (The half-caster multiclass rounding has since been VERIFIED correct per 2024 RAW — RESOLVED, no longer a gap.) (A full row-by-row re-walk of every ~3000-row entity remains ongoing inline maintenance, not a blocking task — the campaign-touched surface is now current.)

---

## Shipped — provenance in git / CHANGELOG

> Everything that closed the original automation campaign is shipped and lives in git history +
> `CHANGELOG.md` — it is NOT re-listed here (this doc is the OPEN frontier only). For the record:
>
> - **The full architectural lever set** (advantage/disadvantage chips, equipment→grant pipeline,
>   class/subclass-feature choice-grant pickers, fixed prof consumers, immunity render block,
>   non-walking speeds/senses, ability-score grant applier, `choice-expertise`, the damage-rider /
>   pact-weapon-rider / unarmed-strike-die / cunning-strike-option / choice-grant-bundle / `while-active`
>   primitives, third-caster spellcasting, the niche primitives) — all SHIPPED + merged.
> - **The combat-model layer** (`cost-engine`, `CONDITION_GATES`, `granted-action`, `netRollState`)
>   - the immediate-commit-per-action-with-undo Combat page + condition slot-gating — SHIPPED.
> - **The data-wiring batches** (subclass expanded-spells, always-prepared/free-cast singles,
>   resistance/speed/sense grants, tracker corrections, cross-feature cost-tracker linkage,
>   background grant routing) — SHIPPED.
> - **The 2024-correctness batches** (2014-holdover fixes across every class/feat/species, the 7
>   pack setting subclasses, all named "missing" entities + spells, Metamagic→grant + invocation→grant
>   seams, the Wizard school-savant recurring `choice-spell`, multi-list `choice-spell`,
>   `spell-damage-bonus`/`heal-bonus`/`spell-damage-type-override`/`aura`/`resource-conversion`/
>   `item-bound-bonus`/`copy-to-2nd-target`/`spell-die-augment` primitives) — SHIPPED.
> - **The minimal-representation campaign** (store by id, drop derived `hp.max`/spellcasting
>   sub-fields, subset-minimized `spells[]`, the persistence-path fixes, the 6 team fixtures as the
>   conformance probe) — SHIPPED. Verified against `content-pack/fixtures/team/*.json`.
> - **S4 event hooks** (initiative top-ups, long-rest Heroic Inspiration, short-rest Exhaustion,
>   at-0-HP interrupts, slot→use conversion, Arcane Recovery) — SHIPPED 2026-06-12.
> - **The ENFORCE multiclass sweep** (extra-attack count, Martial-Arts/Bardic die, weapon profs,
>   `damage-rider` `diceByLevel`, per-spell DC/attack by owning class) — SHIPPED 2026-06-12.
>
> Per-commit detail is in git; per-release narrative is in `CHANGELOG.md`.

---

## Open architecture items (deferred, owner-gated)

Durable open ARCHITECTURAL seams (distinct from the data-wiring frontier above).

### The seam contract (the durable how-to)

Adding a mechanic is always the same four-step seam — **never a regex over prose, never a
hand-declared derived value:** (1) a `Grant` kind (`src/lib/grants.ts`), (2) an evaluator branch +
an `AggregatedGrants` field, (3) a pure `src/lib` consumer (compute / smart-tracker / cast-options),
(4) SRD-data emission (`src/data/*`) — the UI then renders automatically. **Layer discipline:** the
engine ships AGGREGATE FIELDS + pure tests only; render sites are UI-owned (the presentation branch).
**Data-sourcing rule:** EN mechanics are verified against `http://dnd2024.wikidot.com`; verify each
spell slug against `spellIndex`; IT follows the golden-rules D2 cascade, never empty. (The sourcing
workflow detail lives with the content pack's own docs.)

### Source-seam gaps still open

- [ ] **Route all backgrounds' full benefits through `evaluateGrants`.** The idempotent skill/tool grants are routed (`resolveGrantSourcesForBackground`); the broader ASI / origin-feat propagation is still snapshotted at creation, so SRD edits don't propagate. Low severity (not broken, off-architecture) but a propagation-model change with regression risk — owner-gated to a dedicated session.
- [ ] **All species lineages' casting-ability ruling.** Lineage cantrip/spell grants need a casting-ability default / `choice-casting-ability` ruling before they can be modeled cleanly. Owner-deferred.

### Features-tab full engine derivation (OWN-34, Phase 2 — deferred)

> Phase 1 (a display-only union onto `features[]`, additive `idx:-1`) SHIPPED. Phase 2 is the
> architectural cleanup, deferred to a dedicated high-blast-radius session.

**The decision (owner, 2026-06-05):** derive EVERY SRD feature from
`class + level + subclass + species + background + feats + magic-items` via the grants engine.
`character.features[]` stops being the source of truth for SRD grants and is kept ONLY for
custom/homebrew features. The build is a pure `src/lib/derive-character-features.ts` reusing the
canonical indexes already imported by `resolve-grant-sources.ts`, then a presentational `FeaturesTab`
consuming it via the shared `UniversalCard` / `KindSeal` atoms. **Blast radius:** level-up scaling,
combat, and spells all read `features[]` today, so the dedicated session must point them at the
derivation or guarantee it is a superset — verified by tests + the cockpit-render-isolation guard.
The mock (Lyra Voss, Elf Bard 9 Lore) is the acceptance fixture.

### Residual non-automatable (display-only, by design)

Per-character spell-damage overrides (Foe Slayer Hunter's-Mark die, Improved Elemental Fury range —
spell damage renders from static spell text); GoO Psychic Spells component-waiver / Arcane Necrosis
ignore-resistance; Diviner Third Eye one-of-three; Hit-Dice-funded tracker recovery (Berserker /
Paladin variants — they spend Hit Dice, not a tracker pool); companion stat-block engine breadth.
Niche, low value — recorded so they are not re-discovered as "gaps".

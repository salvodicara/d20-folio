/**
 * attack-scope — the single, pure decision of how many foes a committed action can
 * strike, derived from the action's OWN modeled shape (auto-narrated combat, Phase 2).
 *
 * The app already models an action's multi-target capacity at use-time: a spell that
 * creates several SEPARATE damage instances — Magic Missile's darts, Scorching Ray's
 * rays — carries {@link import("@/lib/smart-tracker").ActionSummary.instances} > 1,
 * each instance able to strike a DIFFERENT creature. That count is the ONLY
 * shape-derived multi-target signal the data holds today: there is deliberately no
 * area geometry / target list (an AoE save-spell like Fireball is, by shape,
 * indistinguishable from a single-target save cantrip like Sacred Flame — both are
 * just `saveAbility` + `damageDice`), so a save-area's target set is NOT inferable and
 * stays single here; the genuinely multi-target actions are the multi-instance ones.
 *
 * Returns the TARGET CAP: the maximum number of distinct foes the declaration picker
 * lets the player mark (`> 1` ⇒ the multi-select picker; `1` ⇒ Phase-1 single-select).
 * A weapon swing (no `instances`) is always 1 — Phase 1 unchanged.
 *
 * PURE (a total function of the action's summary) — no React, no Firebase, no clock —
 * so both the sheet gate and its tests read the SAME truth (golden rule 6).
 */

import type { ResolvedAction } from "@/lib/smart-tracker";

/**
 * The number of distinct foes {@link action} can strike in one use — the declaration
 * picker's selection cap. `> 1` for a multi-instance spell (Magic Missile 3, Scorching
 * Ray 3); `1` for every single-target action (weapons, single-instance spells).
 */
export function attackTargetCap(action: ResolvedAction): number {
  const instances = action.summary.instances ?? 1;
  return instances > 1 ? instances : 1;
}

/**
 * Whether a committed action should open the in-encounter declaration banner at all —
 * a weapon swing (Phase 1) OR a genuinely multi-target action (Phase 2). Single-target
 * non-weapon actions (a single-target spell, a utility feature) stay out of scope.
 */
export function shouldDeclareAttack(action: ResolvedAction): boolean {
  return action.source === "weapon" || attackTargetCap(action) > 1;
}

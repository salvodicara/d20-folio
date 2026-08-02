/**
 * attack-scope — the single, pure decision of how many foes a committed action can
 * strike, derived from the action's OWN modeled shape (auto-narrated combat, Phase 2).
 *
 * The app models an action's multi-target capacity at use-time via TWO shape signals:
 *  - {@link import("@/lib/smart-tracker").ActionSummary.instances} > 1 — a spell that
 *    creates several SEPARATE damage instances (Magic Missile's darts, Scorching Ray's
 *    rays), each able to strike a DIFFERENT creature (Phase 2, attack-roll hit/miss);
 *  - {@link import("@/lib/smart-tracker").ActionSummary.area} — an AREA save-for-half
 *    burst (Fireball class — Phase 3): every creature in it saves, and the per-target
 *    outcome is decided by the DM's HP delta, not a hit/miss. The `area` flag is what
 *    finally distinguishes an AoE save-spell (Fireball) from a single-target save cantrip
 *    (Sacred Flame) — both are `saveAbility` + `damageDice`, but only the area one opens a
 *    multi-target SAVE declaration ({@link isSaveDeclaration}).
 *
 * Returns the TARGET CAP: the maximum number of distinct foes the declaration picker
 * lets the player mark (`Infinity` ⇒ an unbounded area burst; `> 1` ⇒ the multi-select
 * picker; `1` ⇒ Phase-1 single-select). A weapon swing (no `instances`/`area`) is always
 * 1 — Phase 1 unchanged.
 *
 * PURE (a total function of the action's summary) — no React, no Firebase, no clock —
 * so both the sheet gate and its tests read the SAME truth (golden rule 6).
 */

import type { ResolvedAction } from "@/lib/smart-tracker";

/**
 * The number of distinct foes {@link action} can strike in one use — the declaration
 * picker's selection cap. `Infinity` for an AREA save spell (Fireball class — Phase 3, a
 * burst hits every creature in it, so the picker is UNBOUNDED); `> 1` for a multi-instance
 * spell (Magic Missile 3, Scorching Ray 3); `1` for every single-target action (weapons,
 * single-instance spells).
 */
export function attackTargetCap(action: ResolvedAction): number {
  if (action.summary.area) return Infinity;
  const instances = action.summary.instances ?? 1;
  return instances > 1 ? instances : 1;
}

/**
 * Whether the committed action resolves by a SAVING THROW over an AREA (Fireball class —
 * Phase 3) rather than an attack-roll hit/miss. The declaration then captures the target
 * SET and the DM's per-target HP delta decides each outcome (damaged for the DM's real
 * number, or resisted for no damage), so there is no HIT/MISS tap. Reads the pure `area`
 * shape signal ({@link import("@/lib/smart-tracker").ActionSummary.area}).
 */
export function isSaveDeclaration(action: ResolvedAction): boolean {
  return action.summary.area === true;
}

/**
 * The stable CONDITION ids this action applies on a hit as a RIDER — the DM-side
 * correlation credits a matching `condition-gain` on a declared target to the caster.
 * Today the modelled source is a weapon's TOPPLE Mastery (→ Prone); the list is
 * deliberately extensible as more applied-condition riders are modelled. Empty when the
 * action carries none. Pure (a total function of the summary).
 */
export function actionRiderConditions(action: ResolvedAction): string[] {
  const riders: string[] = [];
  // Topple Weapon Mastery: on a hit the target makes a CON save or is knocked Prone.
  if (action.summary.masteryDetail?.toppleDc !== undefined) riders.push("prone");
  return riders;
}

/**
 * Whether a committed action should open the in-encounter declaration banner at all —
 * a weapon swing (Phase 1), a genuinely multi-target action (Phase 2), OR an area save
 * spell (Phase 3). Single-target non-weapon actions (a single-target save cantrip, a
 * utility feature) stay out of scope.
 */
export function shouldDeclareAttack(action: ResolvedAction): boolean {
  return (
    action.source === "weapon" || isSaveDeclaration(action) || attackTargetCap(action) > 1
  );
}

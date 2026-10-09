/**
 * The optional "On whom?" step (owner 2026-10-09): after an action is chosen (and its
 * slot, when it has one) and before it commits, the player may say who it affects —
 * like picking the enemy to attack. Skipping is always allowed; the table still
 * resolves dice and damage. The pick tags the log line and, for a spell that leaves a
 * state on its recipient, picking oneself lights that state on this sheet.
 *
 * The step appears only when the pick can change something: inside an encounter there
 * are creatures to name; solo, only a recipient state that would light on "me".
 */
import type { ResolvedAction } from "@/lib/smart-tracker";
import { combatResolutionSpec, shouldResolveCombatAction } from "@/lib/combat-resolution";

/** One creature the sheet knows about: the encounter's visible rows. */
export interface TargetRosterRow {
  id: string;
  kind: "pc" | "monster";
  side?: "ally" | "enemy";
  name: string;
}

export interface TargetRoster {
  /** This player's combatant id (`pc-<uid>`), used for the "me" row. */
  selfId: string;
  selfName: string;
  /** The live encounter's visible rows; empty when no encounter is running. */
  rows: ReadonlyArray<TargetRosterRow>;
}

export interface TargetCandidate {
  id: string;
  name: string;
  side: "ally" | "enemy";
  self: boolean;
}

export interface TargetStep {
  /** How many may be picked: 1 = a tap commits; more = tick then confirm. */
  max: number;
  candidates: TargetCandidate[];
}

/** A standing state the cast leaves on its chosen recipient (Mage Armor, Bless). */
export function recipientStateKey(action: ResolvedAction): string | undefined {
  const standing = action.standingEffect;
  return standing && !standing.markScope ? standing.activeKey : undefined;
}

export function targetStepFor(
  action: ResolvedAction,
  roster: TargetRoster
): TargetStep | null {
  if (!shouldResolveCombatAction(action)) return null;
  const spec = combatResolutionSpec(action);
  if (spec.targetAffinity === "self") return null;
  const wantsAllies = spec.targetAffinity !== "enemy";
  const wantsEnemies = spec.targetAffinity !== "ally";

  const allies: TargetCandidate[] = [];
  const enemies: TargetCandidate[] = [];
  if (wantsAllies && !spec.excludeSelf)
    allies.push({ id: roster.selfId, name: roster.selfName, side: "ally", self: true });
  for (const row of roster.rows) {
    if (row.id === roster.selfId) continue;
    const side = row.side ?? (row.kind === "pc" ? "ally" : "enemy");
    const candidate = {
      id: row.id,
      name: row.name,
      side,
      self: false,
    };
    if (side === "ally" && wantsAllies) allies.push(candidate);
    if (side === "enemy" && wantsEnemies) enemies.push(candidate);
  }
  const candidates =
    spec.targetAffinity === "enemy" ? [...enemies, ...allies] : [...allies, ...enemies];
  if (candidates.length === 0) return null;
  // Solo, naming only "me" is worth a step only when it lights a state.
  const onlyMe = candidates.every((candidate) => candidate.self);
  if (onlyMe && !recipientStateKey(action)) return null;
  return {
    max: Math.max(1, Math.min(spec.targetCap, candidates.length)),
    candidates,
  };
}

/**
 * The action as committed for these targets: when "me" is among them and the spell
 * leaves a state on its recipient, the cast lights that state here (with its countdown).
 */
export function withSelfRecipient(
  action: ResolvedAction,
  targets: ReadonlyArray<string>,
  selfId: string
): ResolvedAction {
  const standing = action.standingEffect;
  if (!standing || !recipientStateKey(action) || !targets.includes(selfId)) return action;
  return {
    ...action,
    activatesKey: standing.activeKey,
    activeDurationRounds: standing.maxRounds,
    activeTurnBoundary: standing.turnBoundary,
  };
}

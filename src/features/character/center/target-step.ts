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
import type { PortraitCrop } from "@/types/character";
import { combatResolutionSpec, shouldResolveCombatAction } from "@/lib/combat-resolution";
import { getSpellById } from "@/data/spells";

/** One creature the sheet knows about: the encounter's visible rows. */
export interface TargetRosterRow {
  id: string;
  kind: "pc" | "monster";
  side?: "ally" | "enemy";
  name: string;
  /** At 0 Hit Points (a monster there is dead; a PC is dying). */
  down?: boolean;
  deathSaves?: { successes: number; failures: number };
  /** The creature's portrait, for the row's round medallion. */
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
}

/** Dead: a monster at 0 Hit Points, a PC with three failed death saves. */
export function isDead(row: TargetRosterRow): boolean {
  return row.kind === "pc" ? (row.deathSaves?.failures ?? 0) >= 3 : row.down === true;
}

export interface TargetRoster {
  /** This player's combatant id (`pc-<uid>`), used for the "me" row. */
  selfId: string;
  selfName: string;
  selfPortraitUrl?: string | null;
  selfPortraitCrop?: PortraitCrop | null;
  /** The live encounter's visible rows; empty when no encounter is running. */
  rows: ReadonlyArray<TargetRosterRow>;
  /** Out of a fight in a campaign, the rows are the party («Il gruppo»): only a state
   *  the use leaves on its recipient reaches them (on the campaign clock). */
  party?: boolean;
}

export interface TargetCandidate {
  id: string;
  name: string;
  side: "ally" | "enemy";
  self: boolean;
  portraitUrl?: string | null;
  portraitCrop?: PortraitCrop | null;
}

const portraitOf = (url?: string | null, crop?: PortraitCrop | null) => ({
  ...(url ? { portraitUrl: url } : {}),
  ...(url && crop ? { portraitCrop: crop } : {}),
});

export interface TargetStep {
  /** How many may be picked: 1 = a tap commits; more = tick then confirm. */
  max: number;
  candidates: TargetCandidate[];
  /** Out of a fight: the candidates are the party, one group («Il gruppo»). */
  party?: true;
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
  // Out of a fight, the party is offered only for a state left on its recipient.
  if (roster.party && !recipientStateKey(action)) return null;
  // Help names a creature with nothing to resolve: the pick only tags the log line.
  if (!shouldResolveCombatAction(action) && !action.namesTarget) return null;
  const spec = combatResolutionSpec(action);
  if (spec.targetAffinity === "self") return null;
  // An area with no declared "creatures of your choice" catches everyone in it:
  // allies and the caster are offered too, after the enemies.
  const areaCatchesAll =
    spec.area && spec.targetAffinity === "enemy" && !action.summary.targeting?.affinity;
  const wantsAllies = spec.targetAffinity !== "enemy" || areaCatchesAll;
  const wantsEnemies = spec.targetAffinity !== "ally";

  const allies: TargetCandidate[] = [];
  const enemies: TargetCandidate[] = [];
  if (wantsAllies && !spec.excludeSelf)
    allies.push({
      id: roster.selfId,
      name: roster.selfName,
      side: "ally",
      self: true,
      ...portraitOf(roster.selfPortraitUrl, roster.selfPortraitCrop),
    });
  for (const row of roster.rows) {
    if (row.id === roster.selfId) continue;
    // Only a spell that reaches the dead (Revivify) offers them.
    if (isDead(row) && !action.summary.targeting?.includesDead) continue;
    const side = row.side ?? (row.kind === "pc" ? "ally" : "enemy");
    const candidate = {
      id: row.id,
      name: row.name,
      side,
      self: false,
      ...portraitOf(row.portraitUrl, row.portraitCrop),
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
    ...(roster.party ? { party: true as const } : {}),
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
  // A state that ends on its holder's own acts (Invisibility: "after the target makes
  // an attack roll, deals damage, or casts a spell") belongs to the target. Cast on
  // someone else, the caster lights none, so the caster's attack can't end it.
  if (
    !standing &&
    action.activatesKey &&
    targets.length > 0 &&
    !targets.includes(selfId) &&
    stateEndsOnHolderActs(action)
  ) {
    const rest = { ...action };
    delete rest.activatesKey;
    delete rest.activeDurationRounds;
    delete rest.activeTurnBoundary;
    return rest;
  }
  if (!standing || !recipientStateKey(action) || !targets.includes(selfId)) return action;
  return {
    ...action,
    activatesKey: standing.activeKey,
    activeDurationRounds: standing.maxRounds,
    activeTurnBoundary: standing.turnBoundary,
  };
}

/** Whether the spell's own state ends early on its holder's acts (attack, damage, a
 *  spell): the state of the creature it was cast on. */
function stateEndsOnHolderActs(action: ResolvedAction): boolean {
  const spell = action.spellId ? getSpellById(action.spellId) : undefined;
  return (spell?.grants ?? []).some(
    (g) =>
      g.type === "while-active" &&
      g.activeKey === action.activatesKey &&
      g.duration !== undefined &&
      "endsEarlyOn" in g.duration &&
      (g.duration.endsEarlyOn?.length ?? 0) > 0
  );
}

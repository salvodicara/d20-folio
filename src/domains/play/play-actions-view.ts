/**
 * The Play screen's actions table: every action in the engine's order (`sortActions`),
 * filed under D&D Beyond's groups (Azioni · Azioni bonus · Reazioni · Altro), with what
 * a row shows at a glance (range, to-hit or save DC, effect, the uses left) and the
 * filter chips' counts. Rows read the engine's own facts (`actionRowFacts`): a
 * condition that blocks a slot marks its rows blocked.
 */
import { effectiveConditions } from "@/lib/aggregate-character";
import { resolveConditionEffects } from "@/lib/condition-effects";
import { conditionFactsFor, type ConditionEncounter } from "@/lib/condition-sources";
import type { Locale } from "@/lib/locale";
import {
  actionFilterCounts,
  actionRowFacts,
  type ActionFilterCounts,
  type ActionGroup,
} from "@/lib/views/action-row-view";
import {
  localizeActions,
  sortActions,
  type CombatAction,
} from "@/lib/views/combat-action-view";
import {
  actionCtaView,
  type ActionCta,
  type ActionTurnState,
} from "@/lib/views/action-cta-view";
import { attacksPerActionForCharacter } from "@/lib/smart-tracker";
import type { CharacterDoc } from "@/types/character";

/** A turn with nothing taken yet (outside a fight every action is open). */
export const FRESH_TURN: ActionTurnState = {
  selected: { action: [], bonus: [], free: [] },
  budget: { action: 1, bonus: 1 },
  attackBudget: 1,
  attacksUsed: 0,
  attackSwingIds: [],
  reactionUsed: false,
  reactionUsedId: null,
  movementUsedFt: 0,
  warMagicMax: -1,
};

export interface PlayActionRow {
  id: string;
  action: CombatAction;
  name: string;
  spellId?: string;
  /** Spell level (0 = cantrip), null for anything that is not a spell. */
  level: number | null;
  concentration: boolean;
  ritual: boolean;
  range?: string;
  attackBonus?: number;
  saveDc?: number;
  saveAbility?: string;
  damage?: string;
  damageType?: string;
  healing?: string;
  uses?: { current: number; total: number };
  attack: boolean;
  limited: boolean;
  blocked: boolean;
  /** Its button this turn: verb, spent or live, why it is blocked. */
  cta: ActionCta;
}

/** The note beside a group's heading (prototype .agroup__note): the attacks one Attack
 *  action makes, a bonus action or reaction already spent this turn, the one reaction
 *  a round. */
export type ActionGroupNote =
  | { kind: "attacks"; count: number }
  | { kind: "spent" }
  | { kind: "per-round" };

export interface PlayActionsView {
  groups: { group: ActionGroup; rows: PlayActionRow[]; note?: ActionGroupNote }[];
  counts: ActionFilterCounts;
}

const ORDER: readonly ActionGroup[] = ["actions", "bonus", "reactions", "other"];

export function playActionsView(
  doc: CharacterDoc,
  locale: Locale,
  turn: ActionTurnState = FRESH_TURN,
  /** "spellbook" keeps the spells that aren't prepared too (the Spells tab). */
  scope: "combat" | "spellbook" = "combat",
  /** The fight around the sheet, so a Frightened source's sight can be derived. */
  encounter?: ConditionEncounter
): PlayActionsView {
  const conditions = effectiveConditions(doc);
  const conditionFacts = conditionFactsFor(doc, encounter);
  const effects = resolveConditionEffects(conditions, conditionFacts);
  const blocked = effects.blockedSlots;
  const all = sortActions(localizeActions(doc, locale, scope));
  const ctas = actionCtaView(doc, all, turn, {
    list: conditions,
    effects,
    facts: conditionFacts,
  });
  // Two-Weapon Fighting: an off-hand attack is not offered (nor counted) yet.
  const actions = all.filter((a) => !ctas.get(a.id)?.hidden);
  const facts = actions.map((a) => actionRowFacts(doc, a, blocked));
  const rows = actions.map((a, i): { group: ActionGroup; row: PlayActionRow } => {
    const f = facts[i] ?? actionRowFacts(doc, a, blocked);
    const s = a.summary;
    // actionCtaView keys every action it was given.
    const cta = ctas.get(a.id);
    if (!cta) throw new Error(`no button state for action ${a.id}`);
    const row: PlayActionRow = {
      id: a.id,
      action: a,
      name: a.name,
      ...(a.spellId ? { spellId: a.spellId } : {}),
      level: a.spellLevel,
      concentration: a.concentration,
      ritual: f.ritual,
      range: a.weaponFacts?.range ?? s.range,
      attackBonus: a.weaponFacts?.attackBonus ?? s.attackBonus,
      saveDc: f.saveDc?.total ?? s.saveDC,
      saveAbility: s.saveAbility,
      damage: a.weaponFacts?.damageOneHanded ?? s.damage,
      damageType: a.weaponFacts?.damageTypeId ?? s.damageType,
      healing: s.healing,
      ...(s.uses ? { uses: { current: s.uses.current, total: s.uses.total } } : {}),
      attack: f.attack,
      limited: f.limitedUse,
      blocked: f.availability.kind === "blocked",
      cta,
    };
    return { group: f.group, row };
  });
  return {
    groups: ORDER.flatMap((group) => {
      const inGroup = rows.filter((r) => r.group === group).map((r) => r.row);
      if (inGroup.length === 0) return [];
      const note = groupNote(doc, group, inGroup, turn);
      return [note ? { group, rows: inGroup, note } : { group, rows: inGroup }];
    }),
    counts: actionFilterCounts(facts),
  };
}

function groupNote(
  doc: CharacterDoc,
  group: ActionGroup,
  rows: readonly PlayActionRow[],
  turn: ActionTurnState
): ActionGroupNote | undefined {
  if (group === "actions" && rows.some((r) => r.attack))
    return { kind: "attacks", count: attacksPerActionForCharacter(doc) };
  if (
    group === "bonus" &&
    turn.budget.bonus > 0 &&
    turn.selected.bonus.length >= turn.budget.bonus
  )
    return { kind: "spent" };
  if (group === "reactions")
    return turn.reactionUsed ? { kind: "spent" } : { kind: "per-round" };
  return undefined;
}

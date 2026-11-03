/**
 * The Play screen's actions table: every action in the engine's order (`sortActions`),
 * filed under D&D Beyond's groups (Azioni · Azioni bonus · Reazioni · Altro), with what
 * a row shows at a glance (range, to-hit or save DC, effect, the uses left) and the
 * filter chips' counts. Rows read the engine's own facts (`actionRowFacts`): a
 * condition that blocks a slot marks its rows blocked.
 */
import { effectiveConditions } from "@/lib/aggregate-character";
import { resolveConditionEffects } from "@/lib/condition-effects";
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

export interface PlayActionsView {
  groups: { group: ActionGroup; rows: PlayActionRow[] }[];
  counts: ActionFilterCounts;
}

const ORDER: readonly ActionGroup[] = ["actions", "bonus", "reactions", "other"];

export function playActionsView(
  doc: CharacterDoc,
  locale: Locale,
  turn: ActionTurnState = FRESH_TURN,
  /** "spellbook" keeps the spells that aren't prepared too (the Spells tab). */
  scope: "combat" | "spellbook" = "combat"
): PlayActionsView {
  const conditions = effectiveConditions(doc);
  const effects = resolveConditionEffects(conditions);
  const blocked = effects.blockedSlots;
  const all = sortActions(localizeActions(doc, locale, scope));
  const ctas = actionCtaView(doc, all, turn, { list: conditions, effects });
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
      return inGroup.length > 0 ? [{ group, rows: inGroup }] : [];
    }),
    counts: actionFilterCounts(facts),
  };
}

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
import type { CharacterDoc } from "@/types/character";

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
}

export interface PlayActionsView {
  groups: { group: ActionGroup; rows: PlayActionRow[] }[];
  counts: ActionFilterCounts;
}

const ORDER: readonly ActionGroup[] = ["actions", "bonus", "reactions", "other"];

export function playActionsView(doc: CharacterDoc, locale: Locale): PlayActionsView {
  const blocked = resolveConditionEffects(effectiveConditions(doc)).blockedSlots;
  const actions = sortActions(localizeActions(doc, locale));
  const facts = actions.map((a) => actionRowFacts(doc, a, blocked));
  const rows = actions.map((a, i): { group: ActionGroup; row: PlayActionRow } => {
    const f = facts[i] ?? actionRowFacts(doc, a, blocked);
    const s = a.summary;
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

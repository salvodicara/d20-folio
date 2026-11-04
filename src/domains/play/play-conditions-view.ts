/**
 * The Play «Condizioni» panel (prototype x-play-cond): each condition the player can
 * take off, with its first effect line, its source's name when the fight knows it,
 * and, for a source-gated one the sheet can't decide (`needsSeesAnswer`), the table's
 * «Non vedo la fonte» answer. Exhaustion is a level (1–6), not a chip. What can be
 * added, and who in the fight could be a condition's source.
 */
import { SRD_CONDITIONS } from "@/data/conditions";
import { hasSrd, localizeSrd, localizeSrdList } from "@/i18n/resolver";
import { conditionSourceInstances, needsSeesAnswer } from "@/lib/condition-sources";
import type { Locale } from "@/lib/locale";
import type { CharacterDoc } from "@/types/character";

/** The fight around the sheet: each combatant with its name when known. */
export interface PanelEncounter {
  rows: ReadonlyArray<{
    id: string;
    name?: string;
    /** A player's row: the character it is. */
    characterId?: string;
    conditions: ReadonlyArray<string>;
  }>;
}

export interface ConditionPanelRow {
  id: string;
  name: string;
  effect: string;
  /** The combatant that caused it, by name. */
  source?: string;
  /** «Non vedo la fonte»: the answer's key and whether it is pressed. */
  ask?: { key: string; pressed: boolean };
}

export interface ConditionsPanelView {
  rows: ConditionPanelRow[];
  /** Exhaustion level, 0 when none. */
  exhaustion: number;
  /** What the chip counts: the conditions, Exhaustion once. */
  count: number;
  addable: string[];
  /** The fight's other combatants, for «Da chi?». */
  sources: { id: string; name: string }[];
}

/** Conditions that have a source worth naming when added by hand. */
const SOURCED = new Set(["grappled", "frightened", "charmed"]);
export const asksSource = (conditionId: string): boolean => SOURCED.has(conditionId);

export function conditionsPanelView(
  doc: CharacterDoc,
  locale: Locale,
  encounter?: PanelEncounter
): ConditionsPanelView {
  const held = doc.session.conditions;
  const asks = conditionSourceInstances(doc, encounter).filter(needsSeesAnswer);
  const nameOf = (id: string | undefined) =>
    encounter?.rows.find((r) => r.id === id)?.name;
  const rows = held.map((id): ConditionPanelRow => {
    const ask = asks.find((a) => a.key === `condition:${id}`);
    const source = nameOf(doc.session.conditionSources?.[id]);
    return {
      id,
      name: localizeSrd("condition", id, "name", locale),
      effect: hasSrd("condition", id, "effects", locale)
        ? (localizeSrdList("condition", id, "effects", locale)[0] ?? "")
        : "",
      ...(source ? { source } : {}),
      ...(ask ? { ask: { key: ask.key, pressed: ask.seesSource === false } } : {}),
    };
  });
  const exhaustion = doc.session.exhaustion;
  return {
    rows,
    exhaustion,
    count: held.length + (exhaustion > 0 ? 1 : 0),
    addable: SRD_CONDITIONS.map((c) => c.id).filter(
      (id) => !held.includes(id) && !(id === "exhaustion" && exhaustion > 0)
    ),
    sources: (encounter?.rows ?? [])
      .filter((r) => r.characterId !== doc.id && r.name)
      .map((r) => ({ id: r.id, name: r.name ?? "" })),
  };
}

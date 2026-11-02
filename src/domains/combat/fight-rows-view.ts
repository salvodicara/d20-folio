/**
 * The Scontro tab's initiative list: one row per turn in order, the current one marked.
 * A character shows HP numbers; a creature shows only how hurt it looks (`hpBand`),
 * never a number, so a player can't read the DM's monster sheet off the list. The same
 * creature acting one after another in the same state reads as one row with a count;
 * the creature whose turn it is always stands alone.
 */
import type { PartyChip } from "@/domains/campaign/party-rows-view";
import type { EncounterCombatantView } from "@/features/campaigns/encounter-view";
import { hpBand, type HpBandValue } from "@/lib/hp-band";
import type { Locale } from "@/lib/locale";
import { conditionLabel } from "@/lib/views/tracker-view";

export interface FightRow {
  /** Every combatant this line stands for, in turn order. */
  ids: string[];
  kind: "pc" | "monster";
  name: string;
  count: number;
  initiative: number | null;
  current: boolean;
  hp: { current: number; max: number; temp: number } | null;
  band: HpBandValue | null;
  chips: PartyChip[];
}

/** "Goblin 2" and "Goblin 3" are the same creature. */
const baseName = (name: string) => name.replace(/\s+\d+$/, "");

export function fightRows(
  rows: readonly EncounterCombatantView[],
  currentId: string | null,
  /** Extra chips per combatant id, shown first (a character's Concentration). */
  extraChips: Readonly<Record<string, PartyChip[]>>,
  locale: Locale
): FightRow[] {
  const out: FightRow[] = [];
  for (const c of rows) {
    const current = c.id === currentId;
    const chips = [
      ...(extraChips[c.id] ?? []),
      ...c.conditions.map((id) => ({
        kind: "cond" as const,
        label: conditionLabel(id, locale),
      })),
    ];
    if (c.kind === "pc") {
      out.push({
        ids: [c.id],
        kind: "pc",
        name: c.name,
        count: 1,
        initiative: c.initiative,
        current,
        hp: { current: c.currentHp, max: c.maxHp, temp: c.tempHp },
        band: null,
        chips,
      });
      continue;
    }
    const name = baseName(c.name);
    const band = hpBand(c.currentHp, c.maxHp);
    const last = out[out.length - 1];
    if (
      last?.kind === "monster" &&
      !last.current &&
      !current &&
      last.name === name &&
      last.band === band &&
      last.initiative === c.initiative &&
      last.chips.length === 0 &&
      chips.length === 0
    ) {
      last.ids.push(c.id);
      last.count += 1;
      continue;
    }
    out.push({
      ids: [c.id],
      kind: "monster",
      name,
      count: 1,
      initiative: c.initiative,
      current,
      hp: null,
      band,
      chips,
    });
  }
  return out;
}

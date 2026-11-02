/**
 * The Scontro tab's initiative list: one row per turn in order, the current one marked.
 * A character shows HP numbers; a creature shows only how hurt it looks (`hpBand`),
 * never a number, so a player can't read the DM's monster sheet off the list. The same
 * creature on the same initiative is always one row with a count («Goblin ×3»), whatever
 * state each is in (counted by state) and even on its turn, which marks the whole row:
 * no half grouping (owner review, 2026-11-02). A character who hasn't rolled is
 * never hidden: they sit under the rolled ones, marked to roll (owner, 2026-11-02).
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
  /** A character who hasn't rolled initiative yet. */
  mustRoll: boolean;
  hp: { current: number; max: number; temp: number } | null;
  /** How hurt the creatures look, by state, from the healthiest (none for a character). */
  bands: { band: HpBandValue; count: number }[];
  chips: PartyChip[];
}

const BAND_ORDER: readonly HpBandValue[] = ["healthy", "bloodied", "nearDeath", "down"];

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
  const waiting: FightRow[] = [];
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
      const mustRoll = c.initiative === null;
      (mustRoll ? waiting : out).push({
        ids: [c.id],
        kind: "pc",
        name: c.name,
        count: 1,
        initiative: c.initiative,
        current,
        mustRoll,
        hp: { current: c.currentHp, max: c.maxHp, temp: c.tempHp },
        bands: [],
        chips,
      });
      continue;
    }
    const name = baseName(c.name);
    const band = hpBand(c.currentHp, c.maxHp);
    const last = out[out.length - 1];
    if (
      last?.kind === "monster" &&
      last.name === name &&
      last.initiative === c.initiative
    ) {
      last.ids.push(c.id);
      last.count += 1;
      last.current ||= current;
      const seen = last.bands.find((b) => b.band === band);
      if (seen) seen.count += 1;
      else last.bands.push({ band, count: 1 });
      last.bands.sort((a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band));
      for (const chip of chips)
        if (!last.chips.some((x) => x.kind === chip.kind && x.label === chip.label))
          last.chips.push(chip);
      continue;
    }
    out.push({
      ids: [c.id],
      kind: "monster",
      name,
      count: 1,
      initiative: c.initiative,
      current,
      mustRoll: false,
      hp: null,
      bands: [{ band, count: 1 }],
      chips,
    });
  }
  return [...out, ...waiting];
}

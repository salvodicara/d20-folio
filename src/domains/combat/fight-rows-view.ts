/**
 * The Scontro tab's initiative list: one row per turn in order, the current one marked.
 * A character shows HP numbers; a creature shows only how hurt it looks (`hpBand`),
 * never a number, so a player can't read the DM's monster sheet off the list. The same
 * creature on the same initiative is always one row with a count («Goblin ×3»), whatever
 * state each is in (counted by state) and even on its turn, which marks the whole row:
 * no half grouping (owner review, 2026-11-02). A character who hasn't rolled is
 * never hidden: they sit under the rolled ones, marked to roll (owner, 2026-11-02).
 * The DM decides who the players see: a revealed monster or an ally shows its numbers
 * (classic MonsterCard), and the line carries its marks (hidden, revealed, ally).
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
  /** The line's art: a monster's painting, a character's portrait or class crest. */
  art: FightArt | null;
  /** What the DM set on the line's creatures, each counted (none for a character). */
  marks: { mark: FightMark; count: number }[];
}

export type FightMark = "hidden" | "revealed" | "ally";
const MARK_ORDER: readonly FightMark[] = ["hidden", "revealed", "ally"];

function marksOf(c: EncounterCombatantView): FightMark[] {
  if (c.kind !== "monster") return [];
  return MARK_ORDER.filter((m) =>
    m === "hidden" ? c.hidden : m === "revealed" ? c.revealed === true : c.side === "ally"
  );
}

/** A player reads a monster's numbers when the DM revealed them, or when it fights on
 *  their side. */
const numbersShown = (c: EncounterCombatantView) =>
  c.revealed === true || c.side === "ally";

const monsterHp = (c: EncounterCombatantView) => ({
  current: c.currentHp,
  max: c.maxHp,
  temp: c.tempHp,
});

export type FightArt = { kind: "monster" | "class"; id: string } | { url: string };

function artOf(c: EncounterCombatantView): FightArt | null {
  if (c.portraitUrl) return { url: c.portraitUrl };
  if (c.kind === "monster") return c.srdId ? { kind: "monster", id: c.srdId } : null;
  const main = [...(c.classes ?? [])].sort((a, b) => b.level - a.level)[0];
  return main ? { kind: "class", id: main.classId } : null;
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
        art: artOf(c),
        marks: [],
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
      // A group shows numbers only while every creature in it does.
      last.hp = last.hp && numbersShown(c) ? addHp(last.hp, monsterHp(c)) : null;
      for (const mark of marksOf(c)) {
        const had = last.marks.find((m) => m.mark === mark);
        if (had) had.count += 1;
        else last.marks.push({ mark, count: 1 });
      }
      last.marks.sort((a, b) => MARK_ORDER.indexOf(a.mark) - MARK_ORDER.indexOf(b.mark));
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
      hp: numbersShown(c) ? monsterHp(c) : null,
      bands: [{ band, count: 1 }],
      chips,
      art: artOf(c),
      marks: marksOf(c).map((mark) => ({ mark, count: 1 })),
    });
  }
  return [...out, ...waiting];
}

function addHp(
  a: { current: number; max: number; temp: number },
  b: { current: number; max: number; temp: number }
) {
  return { current: a.current + b.current, max: a.max + b.max, temp: a.temp + b.temp };
}

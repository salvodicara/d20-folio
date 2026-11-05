/**
 * The full-height level-up («Momento BG3», owner's pick 2026-11-05, prototype in
 * ~/Workspace/Codex/folio-design-scratch/mockups-2026-11-05/levelup-a.html):
 *
 *   - the step rail: Hit Points, then one step per question, each done, owed
 *     (a red «!») or optional (a swap), with what was picked;
 *   - the live summary: the character the commit would save — its level, abilities,
 *     Hit Points, Armor Class, and its cantrips and spells with their school, so the
 *     card can draw them as coloured icons.
 *
 * Pure: names resolve here in the reader's language.
 */
import { spells as allSpells } from "@/data/spells";
import type { SpellSchool } from "@/data/types";
import type { AskKey, LevelUpAsks } from "@/domains/leveling/level-up-asks";
import { playHeaderView } from "@/domains/play/play-header-view";
import { localizeSrd } from "@/i18n/resolver";
import { totalLevel } from "@/lib/classes";
import type { Locale } from "@/lib/locale";
import type { AbilityCode } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";

export type StepState = "done" | "owed" | "optional";

export interface LevelUpStep {
  key: "hp" | AskKey;
  title: string;
  state: StepState;
  /** The options taken so far, by name. */
  picked: string[];
}

/** Hit Points (always answered: the average until a roll is entered), then each question. */
export function levelUpSteps(asks: LevelUpAsks): LevelUpStep[] {
  return [
    { key: "hp", title: "", state: "done", picked: [] },
    ...asks.rows.map((row): LevelUpStep => {
      const names = new Map(row.options.map((o) => [o.id, o.label]));
      return {
        key: row.key,
        title: row.title,
        state:
          row.count === 0 ? "optional" : row.picked.length >= row.count ? "done" : "owed",
        picked: row.picked.map((id) => names.get(id) ?? id),
      };
    }),
  ];
}

export interface KnownSpell {
  id: string;
  name: string;
  school: SpellSchool;
}

export interface LevelUpSummary {
  level: number;
  hp: number;
  ac: number;
  abilities: { id: AbilityCode; score: number }[];
  cantrips: KnownSpell[];
  spells: KnownSpell[];
}

const SPELLS = new Map(allSpells.map((s) => [s.id, s]));

export function levelUpSummary(doc: CharacterDoc, locale: Locale): LevelUpSummary {
  const header = playHeaderView(doc, locale);
  const known = doc.character.spells.flatMap((ref) => {
    const spell = "srdId" in ref ? SPELLS.get(ref.srdId) : undefined;
    return spell
      ? [
          {
            id: spell.id,
            name: localizeSrd("spell", spell.id, "name", locale),
            school: spell.school,
            level: spell.level,
          },
        ]
      : [];
  });
  const strip = ({ id, name, school }: KnownSpell) => ({ id, name, school });
  return {
    level: totalLevel(doc.character),
    hp: header.hp.max,
    ac: header.numbers.ac,
    abilities: header.abilities.map(({ id, score }) => ({ id, score })),
    cantrips: known.filter((s) => s.level === 0).map(strip),
    spells: known.filter((s) => s.level > 0).map(strip),
  };
}

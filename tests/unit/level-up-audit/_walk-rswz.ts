/**
 * The level-up audit's walker: a real level-1 character (built by character creation)
 * taken from 1 to 20 through the new level-up screen's questions (`levelUpAsks` +
 * `toggleAnswer`) and the one commit (`commitLevelUp`), keeping what each level asked
 * and the character after it. Plus the sheet readers the audits assert on.
 *
 * Nothing here is an expectation: the per-class files take every expected value from
 * the SRD 5.2.1 text (scratchpad srd.txt), never from src/data.
 */
import { buildNewCharacter } from "@/lib/creation/build";
import { creationDraftReducer, initialCreationDraft } from "@/lib/creation/draft";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskRow,
  type LevelUpAnswers,
  type LevelUpAsks,
} from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import { resolveTrackers } from "@/lib/smart-tracker";
import { srdEn } from "@/i18n/srd-en";
import { getSpellById } from "@/data/spells";
import { eligibleSpellMasteryPicks } from "@/lib/spell-mastery-pick";
import { eligibleSignatureSpells } from "@/lib/signature-spells-pick";
import type { AbilityCode } from "@/data/types";
import type { CharacterData, CharacterDoc, SrdSpellRef } from "@/types/character";
import "@/i18n";
import { makeCharacterDoc } from "../_helpers";

export interface Step {
  level: number;
  /** What the level asked (null at level 1: creation, not a level-up). */
  asks: LevelUpAsks | null;
  doc: CharacterDoc;
}

export interface WalkOptions {
  classId: string;
  subclassId: string;
  primary: AbilityCode;
  /** The SRD's recommended Epic Boon for the class. */
  boon: string;
  /** The level-1 character as the SRD describes it, laid over the built one. */
  level1: Partial<CharacterData>;
  /** Spells the walker never picks (the subclass's always-prepared ones, so a pick
   *  never collides with a spell the subclass hands out later). */
  avoidSpells?: readonly string[];
}

/** A real level-1 character from character creation, with the SRD's level-1 picks. */
export function buildLevel1(o: WalkOptions): CharacterDoc {
  const draft = [
    { type: "setName", name: "Audit" } as const,
    { type: "selectClass", classId: o.classId } as const,
    { type: "setLevel", level: 1 } as const,
  ].reduce(creationDraftReducer, initialCreationDraft());
  const result = buildNewCharacter(draft, { displayName: "Audit" });
  if (!result.ok) throw new Error(`creation failed: ${result.error}`);
  const built = result.payload.character;
  const character = { ...built, ...o.level1 };
  return makeCharacterDoc(character, {
    hp: { current: character.hp.max, temp: 0 },
  });
}

const spellLevel = (id: string) => getSpellById(id)?.level ?? -1;

/** Options to try, highest spell level first for spell rows (a real player's habit). */
function ordered(row: AskRow, avoid: readonly string[]): string[] {
  const ids = row.options.map((o) => o.id);
  if (!row.spell) return ids;
  const free = ids.filter((id) => !avoid.includes(id));
  return [...free].sort((a, b) => spellLevel(b) - spellLevel(a));
}

function answer(doc: CharacterDoc, o: WalkOptions): LevelUpAsks {
  let a: LevelUpAnswers = NO_ANSWERS;
  const scores = doc.character.abilityScores;
  const plusTwoTarget = (open: string[]): string | undefined => {
    if (open.includes(o.primary) && scores[o.primary] <= 18) return o.primary;
    return (["WIS", "INT", "CHA", "DEX", "STR"] as AbilityCode[]).find(
      (ab) => ab !== o.primary && open.includes(ab) && scores[ab] <= 18
    );
  };
  for (let pass = 0; pass < 12; pass++) {
    const asks = levelUpAsks(doc, o.classId, a, "en");
    if (asks.complete) return asks;
    for (const row0 of asks.rows) {
      const row = levelUpAsks(doc, o.classId, a, "en").rows.find(
        (r) => r.key === row0.key
      );
      if (!row || row.count === 0) continue;
      if (row.key === "asiMode") {
        if (!row.picked.includes("plus2")) a = toggleAnswer(a, row, "plus2");
        continue;
      }
      if (row.picked.length >= row.count) continue;
      let pick: string | undefined;
      if (row.key === "subclass") pick = o.subclassId;
      else if (row.key === "asiPlusTwo")
        pick = plusTwoTarget(row.options.map((x) => x.id));
      else if (row.key === "feat")
        pick = row.options.some((x) => x.id === o.boon) ? o.boon : row.options[0]?.id;
      else if (row.key === "featAbility")
        pick = row.options.some((x) => x.id === o.primary)
          ? o.primary
          : row.options[0]?.id;
      if (pick !== undefined) {
        a = toggleAnswer(a, row, pick);
        continue;
      }
      for (const id of ordered(row, o.avoidSpells ?? [])) {
        const now = levelUpAsks(doc, o.classId, a, "en").rows.find(
          (r) => r.key === row.key
        );
        if (!now || now.picked.length >= now.count) break;
        if (!now.picked.includes(id)) a = toggleAnswer(a, now, id);
      }
    }
  }
  return levelUpAsks(doc, o.classId, a, "en");
}

/** Level 1 → 20 through the real level-up path. */
export function walk(o: WalkOptions): Step[] {
  let doc = buildLevel1(o);
  const steps: Step[] = [{ level: 1, asks: null, doc }];
  for (let level = 2; level <= 20; level++) {
    const asks = answer(doc, o);
    let picks = asks.picks;
    // Spell Mastery / Signature Spells: the new screen marks these levels
    // unsupported and commits empty picks (the classic wizard takes them). Give
    // the commit what the classic wizard would, so later levels see the result.
    if (asks.plan.needsSpellMastery) {
      const l1 = eligibleSpellMasteryPicks(doc.character.spells, 1)[0]?.id;
      const l2 = eligibleSpellMasteryPicks(doc.character.spells, 2)[0]?.id;
      picks = { ...picks, spellMastery: { level1: l1, level2: l2 } };
    }
    if (asks.plan.needsSignatureSpells) {
      const [first, second] = eligibleSignatureSpells(doc.character.spells);
      picks = { ...picks, signatureSpells: { first: first?.id, second: second?.id } };
    }
    doc = commitLevelUp(doc, picks);
    steps.push({ level, asks, doc });
  }
  return steps;
}

// ── sheet readers ────────────────────────────────────────────────────────────

export const pb = (doc: CharacterDoc) => sheetNumbers(doc).proficiencyBonus.total;
export const maxHp = (doc: CharacterDoc) => sheetNumbers(doc).maxHp.total;

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();

/** The English names of the class features on the character. */
export function featureNames(doc: CharacterDoc): string[] {
  return doc.character.features.flatMap((f) =>
    "custom" in f ? [] : [norm(srdEn("class-feature", f.srdId, "name") ?? f.srdId)]
  );
}
export const hasFeature = (doc: CharacterDoc, srdName: string) =>
  featureNames(doc).some(
    (n) => n === norm(srdName) || n.startsWith(`${norm(srdName)} (`)
  );

export function spellsVm(doc: CharacterDoc, classId: string) {
  return buildSpellsViewModel(doc, classId, "en", false);
}

/** Slots as the Spells tab shows them: [count per spell level 1..9]. */
export function slotRow(doc: CharacterDoc, classId: string): number[] {
  const row = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const s of spellsVm(doc, classId).slots) row[s.level - 1] = s.total;
  return row;
}

export function tracker(doc: CharacterDoc, id: string) {
  return resolveTrackers(doc).find((t) => t.id === id);
}

export const row = (asks: LevelUpAsks | null, key: string) =>
  asks?.rows.find((r) => r.key === key);
export const rowsLike = (asks: LevelUpAsks | null, re: RegExp) =>
  asks?.rows.filter((r) => re.test(r.key)) ?? [];
export const asksAsi = (asks: LevelUpAsks | null) =>
  !!asks && (row(asks, "asiMode") !== undefined || row(asks, "feat") !== undefined);

export const srdSpell = (id: string) => getSpellById(id);
export const spellRefs = (doc: CharacterDoc): SrdSpellRef[] =>
  doc.character.spells.filter((s): s is SrdSpellRef => !("custom" in s));
export const levelOf = spellLevel;

/** The class-feature id → English name of the class, for messages. */
export const SRD_PB = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6];

/** The feat list the level offers once the player is on the feat picker. */
export function featOptions(prev: CharacterDoc, classId: string): string[] {
  const a: LevelUpAnswers = { ...NO_ANSWERS, asi: { ...NO_ANSWERS.asi, mode: "feat" } };
  return (
    levelUpAsks(prev, classId, a, "en")
      .rows.find((r) => r.key === "feat")
      ?.options.map((o) => o.id) ?? []
  );
}

/** The SRD's level-19 checks, shared by the four classes ("Level 19: Epic Boon"). */
export function epicBoonChecks(
  at: string,
  prev: CharacterDoc,
  step: Step,
  classId: string,
  boon: string,
  softExpect: (
    v: unknown,
    m: string
  ) => { toBe(x: unknown): void; toContain(x: unknown): void }
) {
  softExpect(
    step.asks?.rows.some((r) => r.key === "feat"),
    `${at} the level opens on the Epic Boon feat picker`
  ).toBe(true);
  softExpect(
    step.asks?.rows.some((r) => r.key === "asiPlusTwo" || r.key === "asiPlusOne"),
    `${at} the level offers no plain +2 / +1+1 ability increase in place of the boon`
  ).toBe(false);
  const feats = featOptions(prev, classId);
  softExpect(feats, `${at} the feat picker offers the Epic Boon`).toContain(boon);
  softExpect(
    feats,
    `${at} the feat picker also offers "another feat of your choice" (Ability Score Improvement)`
  ).toContain("ability-score-improvement");
  softExpect(
    step.doc.character.features.some((f) => !("custom" in f) && f.srdId === boon),
    `${at} an Epic Boon is saved on the character`
  ).toBe(true);
}

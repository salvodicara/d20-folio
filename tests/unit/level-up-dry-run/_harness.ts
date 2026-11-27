/**
 * The level-up dry run: a build combination ("bard/college-of-lore:3", "fighter/
 * champion:3 + wizard:1") taken one and two levels up through the NEW level-up
 * screen's own code — `levelUpAsks` (what the screen asks), each owed row answered
 * the way a player would with `toggleAnswer`, then `commitLevelUp` (what Confirm
 * saves). Each step is checked against the SRD 5.2.1 tables in `_srd.ts`:
 *
 *   - every pick the level owes is asked, with the SRD's count;
 *   - nothing is asked twice, and no option is something the character already has
 *     (a known spell, an always-prepared spell, a taken feat, a held mastery …);
 *   - after Confirm: Proficiency Bonus, max HP, spell slots, the prepared cap, the
 *     cantrip count and the level's features match the SRD.
 *
 * A check returns its failures as plain sentences, so a red test names the defect.
 * The pack's tests import this file (`@tests/unit/level-up-dry-run/_harness`).
 */
import { SRD_FEATS } from "@/data/feats";
import { getSpellById } from "@/data/spells";
import type { AbilityCode } from "@/data/types";
import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskRow,
  type LevelUpAnswers,
  type LevelUpAsks,
} from "@/domains/leveling/level-up-asks";
import { srdEn } from "@/i18n/srd-en";
import { getClasses, totalLevel } from "@/lib/classes";
import { buildNewCharacter } from "@/lib/creation/build";
import {
  creationDraftReducer,
  creationFacts,
  initialCreationDraft,
  missingCreationRequirements,
  type CreationDraftAction,
} from "@/lib/creation/draft";
import { buildScenario } from "@/lib/dev-scenarios";
import { resolveEffectiveSpells } from "@/lib/expanded-spells";
import { commitLevelUp } from "@/lib/level-up-commit";
import { sheetNumbers } from "@/lib/views/sheet-numbers";
import { buildSpellsViewModel } from "@/lib/views/spells-view";
import type { CharacterDoc, SrdSpellRef } from "@/types/character";
import "@/i18n";
import {
  SRD_CLASSES,
  SRD_PB,
  SRD_SUBCLASS,
  SRD_SUBCLASS_FEATURES,
  SRD_SUBCLASS_FIGHTING_STYLE,
  SRD_SUBCLASS_HP_PER_LEVEL,
  srdAt,
  srdPact,
  srdSlots,
} from "./_srd";

// ── combos ───────────────────────────────────────────────────────────────────

export interface ClassLevel {
  classId: string;
  /** null: the build has no subclass (even past the subclass level). */
  subclassId: string | null;
  level: number;
}

export interface Combo {
  /** The survey's key: `<class>[/<subclass>]:<level>` joined by " + ". */
  key: string;
  classes: ClassLevel[];
}

/** A value the dry run needs; throws (failing the test) when it is missing. */
function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`dry run: missing ${what}`);
  return v;
}

/** One survey key → a combo ("rogue:6", "fighter/champion:3 + wizard:1"). */
export function parseCombo(key: string): Combo {
  const classes = key.split("+").map((part) => {
    const m = /^\s*([a-z-]+)(?:\/([a-z0-9-]+))?:(\d+)\s*$/.exec(part);
    if (!m) throw new Error(`bad combo part: "${part}"`);
    return {
      classId: must(m[1], "class id"),
      subclassId: m[2] ?? null,
      level: Number(m[3]),
    };
  });
  return { key, classes };
}

const firstClass = (combo: Combo) => must(combo.classes[0], `a class in ${combo.key}`);

// ── the starting character ───────────────────────────────────────────────────

/** Scores that open every multiclass (13+ everywhere) and leave room for +2. */
const SCORES: Record<AbilityCode, number> = {
  STR: 15,
  DEX: 14,
  CON: 14,
  INT: 14,
  WIS: 14,
  CHA: 15,
};

const PRIMARY: Record<string, AbilityCode> = {
  barbarian: "STR",
  bard: "CHA",
  cleric: "WIS",
  druid: "WIS",
  fighter: "STR",
  monk: "DEX",
  paladin: "CHA",
  ranger: "DEX",
  rogue: "DEX",
  sorcerer: "CHA",
  warlock: "CHA",
  wizard: "INT",
};

/** A real level-1 character from character creation (the ready-made picks). */
function levelOne(classId: string): CharacterDoc {
  const actions: CreationDraftAction[] = [
    { type: "setName", name: "Dry Run" },
    { type: "setAlignment", alignment: "neutral" },
    { type: "selectClass", classId },
    { type: "selectRace", raceId: "halfling" },
    { type: "fillReadyMade" },
  ];
  const d = actions.reduce(creationDraftReducer, initialCreationDraft());
  const missing = missingCreationRequirements(d, creationFacts(d));
  if (missing.length)
    throw new Error(`creation incomplete: ${missing.map((m) => m.key).join()}`);
  const built = buildNewCharacter(d, { displayName: null });
  if (!built.ok) throw new Error(built.error);
  const doc: CharacterDoc = {
    id: "dry-run",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    revision: 0,
    ...built.payload,
  };
  return { ...doc, character: { ...doc.character, abilityScores: { ...SCORES } } };
}

/** Options to try, highest spell level first for spell rows (a player's habit). */
function ordered(row: AskRow): string[] {
  const ids = row.options.map((o) => o.id);
  if (!row.spell) return ids;
  const lvl = (id: string) => getSpellById(id)?.level ?? -1;
  return [...ids].sort((a, b) => lvl(b) - lvl(a));
}

/**
 * The screen's rows answered like a player: the combo's subclass (none when it has
 * none), +2 to the class's primary ability, then the first legal options. The
 * optional swaps (count 0) are left alone.
 */
export function answerLikeAPlayer(
  doc: CharacterDoc,
  classId: string,
  subclassId: string | null
): LevelUpAsks {
  let a: LevelUpAnswers = NO_ANSWERS;
  const primary = PRIMARY[classId] ?? "CON";
  const scores = doc.character.abilityScores;
  const find = (key: string) =>
    levelUpAsks(doc, classId, a, "en").rows.find((r) => r.key === key);
  for (let pass = 0; pass < 12; pass++) {
    const asks = levelUpAsks(doc, classId, a, "en");
    if (asks.complete) return asks;
    let changed = false;
    for (const row0 of asks.rows) {
      const row = find(row0.key);
      if (!row || row.count === 0) continue;
      if (row.key === "asiMode") {
        if (!row.picked.includes("plus2")) {
          a = toggleAnswer(a, row, "plus2");
          changed = true;
        }
        continue;
      }
      if (row.picked.length >= row.count) continue;
      let want: string[];
      if (row.key === "subclass") {
        if (!subclassId) continue;
        want = [subclassId];
      } else if (row.key === "asiPlusTwo") {
        const open = row.options.map((o) => o.id) as AbilityCode[];
        const pick =
          open.includes(primary) && scores[primary] <= 18
            ? primary
            : open.find((ab) => scores[ab] <= 18);
        want = pick ? [pick] : [];
      } else want = ordered(row);
      for (const id of want) {
        const now = find(row.key);
        if (!now || now.picked.length >= now.count) break;
        if (!now.picked.includes(id)) {
          a = toggleAnswer(a, now, id);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return levelUpAsks(doc, classId, a, "en");
}

/**
 * The combo's character: built at level 1 by creation and levelled through the
 * real screen to the combo's levels (the first class first, then each next class
 * as a multiclass). A combo with a missing subclass past its subclass level is a
 * dev scenario instead (`buildScenario`): the screen would not let a walk skip it.
 */
export function startingDoc(combo: Combo): CharacterDoc {
  const owesSubclass = combo.classes.some(
    (e) => !e.subclassId && e.level >= (SRD_CLASSES[e.classId]?.subclassLevel ?? 3)
  );
  if (owesSubclass) {
    const first = firstClass(combo);
    const rest = combo.classes.slice(1);
    return buildScenario({
      name: "Dry Run",
      raceId: "halfling",
      background: "",
      classId: first.classId,
      level: first.level,
      ...(first.subclassId ? { subclassId: first.subclassId } : {}),
      abilityScores: { ...SCORES },
      skills: {
        stealth: "proficient",
        perception: "proficient",
        acrobatics: "proficient",
        athletics: "proficient",
      },
      secondaryClasses: rest.map((e) => ({
        classId: e.classId,
        level: e.level,
        ...(e.subclassId ? { subclassId: e.subclassId } : {}),
      })),
    });
  }
  let doc = levelOne(firstClass(combo).classId);
  for (const target of combo.classes) {
    const levelIn = () =>
      getClasses(doc.character).find((e) => e.classId === target.classId)?.level ?? 0;
    while (levelIn() < target.level) {
      const asks = answerLikeAPlayer(doc, target.classId, target.subclassId);
      doc = commitLevelUp(doc, asks.picks);
    }
  }
  return doc;
}

// ── one level up, checked ────────────────────────────────────────────────────

export interface Step {
  /** "bard 3→4". */
  label: string;
  classId: string;
  before: CharacterDoc;
  asks: LevelUpAsks;
  after: CharacterDoc;
}

export function levelUpOnce(
  doc: CharacterDoc,
  classId: string,
  subclassId: string | null
): Step {
  const from = getClasses(doc.character).find((e) => e.classId === classId)?.level ?? 0;
  const asks = answerLikeAPlayer(doc, classId, subclassId);
  const after = commitLevelUp(doc, asks.picks);
  return { label: `${classId} ${from}→${from + 1}`, classId, before: doc, asks, after };
}

/**
 * The combo taken one and two levels up in `classId` (default: its first class).
 * A class without a subclass picks `futureSubclass` (the SRD subclass by default)
 * when the screen asks it: at the subclass level, or at once when it is overdue.
 */
export function dryRun(
  combo: Combo,
  classId = firstClass(combo).classId,
  futureSubclass: string | null = SRD_SUBCLASS[classId] ?? null
): Step[] {
  const entry = combo.classes.find((e) => e.classId === classId);
  const sub = entry?.subclassId ?? futureSubclass;
  const first = levelUpOnce(startingDoc(combo), classId, sub);
  const second = levelUpOnce(first.after, classId, sub);
  return [first, second];
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").trim();
const featureIds = (doc: CharacterDoc) =>
  doc.character.features.flatMap((f) => ("custom" in f ? [] : [f.srdId]));
const featureNames = (doc: CharacterDoc) =>
  featureIds(doc).map((id) => norm(srdEn("class-feature", id, "name") ?? id));
const hasFeature = (doc: CharacterDoc, name: string) =>
  featureNames(doc).some((n) => n === norm(name) || n.startsWith(`${norm(name)} (`));
const srdRefs = (doc: CharacterDoc): SrdSpellRef[] =>
  doc.character.spells.filter((s): s is SrdSpellRef => !("custom" in s));
const effectiveIds = (doc: CharacterDoc) =>
  new Set(
    resolveEffectiveSpells(doc.character, doc.session).flatMap((s) =>
      "srdId" in s ? [s.srdId] : []
    )
  );
const ownCantrips = (doc: CharacterDoc) =>
  srdRefs(doc).filter((s) => !s.alwaysPrepared && getSpellById(s.srdId)?.level === 0)
    .length;
const entryOf = (doc: CharacterDoc, classId: string) =>
  getClasses(doc.character).find((e) => e.classId === classId);
const dupes = (ids: readonly string[]) => [
  ...new Set(ids.filter((id, i) => ids.indexOf(id) !== i)),
];

/** Feats and invocations the SRD lets a character take more than once. */
const REPEATABLE_FEATS = new Set(SRD_FEATS.filter((f) => f.repeatable).map((f) => f.id));
const REPEATABLE_INVOCATIONS = new Set([
  "agonizing-blast",
  "eldritch-spear",
  "repelling-blast",
  "lessons-of-the-first-ones",
]);

/** The rows a level owes by the SRD, with their counts. */
export function owedBySrd(before: CharacterDoc, classId: string): Map<string, number> {
  const srd = SRD_CLASSES[classId];
  const owed = new Map<string, number>();
  if (!srd) return owed;
  const entry = entryOf(before, classId);
  const from = entry?.level ?? 0;
  const to = from + 1;
  const isNew = from === 0;
  if (!entry?.subclassId && to >= srd.subclassLevel) owed.set("subclass", 1);
  if (srd.asi.includes(to)) owed.set("asiMode", 1);
  if (!isNew && srd.expertise.includes(to)) owed.set("expertise", 2);
  const subStyles = SRD_SUBCLASS_FIGHTING_STYLE[entry?.subclassId ?? ""] ?? [];
  if (!isNew && (srd.fightingStyle.includes(to) || subStyles.includes(to)))
    owed.set("fightingStyle", 1);
  const grow = (col: number[] | undefined) =>
    isNew ? 0 : Math.max(0, srdAt(col, to) - srdAt(col, from));
  // A mastery the column adds is asked with any the character still owes.
  if (grow(srd.weaponMastery))
    owed.set(
      "weaponMasteries",
      srdAt(srd.weaponMastery, to) - (entry?.weaponMasteries?.length ?? 0)
    );
  if (grow(srd.invocations)) owed.set("invocations", grow(srd.invocations));
  if (grow(srd.metamagic)) owed.set("metamagic", grow(srd.metamagic));
  const cantrips = isNew ? srdAt(srd.cantrips, 1) : grow(srd.cantrips);
  if (cantrips) owed.set("newCantrips", cantrips);
  const spells =
    classId === "wizard"
      ? isNew
        ? 6
        : 2
      : isNew
        ? srdAt(srd.prepared, 1)
        : grow(srd.prepared);
  if (spells) owed.set("newSpells", spells);
  return owed;
}

/** Row keys the SRD columns govern: asked when, and only when, `owedBySrd` says. */
const GOVERNED = [
  "subclass",
  "asiMode",
  "expertise",
  "fightingStyle",
  "weaponMasteries",
  "invocations",
  "metamagic",
  "newCantrips",
  "newSpells",
];

/** What the screen asks against the SRD: missing, extra, doubled, already owned. */
export function checkAsks(step: Step): string[] {
  const { before, asks, classId, label } = step;
  const out: string[] = [];
  const keys = asks.rows.map((r) => r.key);
  for (const k of dupes(keys)) out.push(`${label}: the row "${k}" is asked twice`);
  const owed = owedBySrd(before, classId);
  // Expertise is asked either as its own row or as the feature's skill slots.
  const asked = (key: string) => {
    const rows = asks.rows.filter(
      (r) => r.key === key || (key === "expertise" && r.key.startsWith("slot:expertise"))
    );
    return rows.length ? rows.reduce((n, r) => n + r.count, 0) : null;
  };
  for (const [key, count] of owed) {
    const n = asked(key);
    if (n === null)
      out.push(
        `${label}: the SRD owes "${key}" (${count}) but the screen does not ask it`
      );
    else if (n !== count)
      out.push(`${label}: "${key}" asks ${n}, the SRD gives ${count}`);
  }
  for (const row of asks.rows) {
    if (GOVERNED.includes(row.key) && !owed.has(row.key) && row.count > 0)
      out.push(
        `${label}: the screen asks "${row.key}" (${row.count}), the SRD owes none`
      );
  }
  if (!asks.supported)
    out.push(`${label}: the new screen sends this level to the classic wizard`);
  if (!asks.complete) {
    const open = asks.rows
      .filter((r) => r.picked.length < r.count)
      .map((r) => `${r.key} ${r.picked.length}/${r.count} (${r.options.length} options)`);
    out.push(`${label}: a player cannot finish the screen: ${open.join(", ")}`);
  }

  // Nothing offered that the character already has.
  const c = before.character;
  const entry = entryOf(before, classId);
  const knownSpells = effectiveIds(before);
  const feats = new Set(
    [...featureIds(before), c.bgFeat, c.humanOriginFeat].filter(Boolean)
  );
  const expertised = new Set(
    Object.entries(c.skills).flatMap(([id, v]) => (v === "expertise" ? [id] : []))
  );
  const proficient = new Set(
    Object.entries(c.skills).flatMap(([id, v]) =>
      v === "proficient" || v === "expertise" ? [id] : []
    )
  );
  const owned: Partial<Record<string, ReadonlySet<string>>> = {
    newCantrips: knownSpells,
    newSpells: knownSpells,
    swapReplace: knownSpells,
    cantripReplace: knownSpells,
    discoveryReplace: knownSpells,
    feat: new Set([...feats].filter((id) => !REPEATABLE_FEATS.has(id))),
    weaponMasteries: new Set(entry?.weaponMasteries ?? []),
    expertise: expertised,
    mcSkills: proficient,
    metamagic: new Set(entry?.metamagicChoices ?? []),
    metamagicReplace: new Set(entry?.metamagicChoices ?? []),
    invocations: new Set(
      (entry?.invocationChoices ?? []).filter((id) => !REPEATABLE_INVOCATIONS.has(id))
    ),
    invocationReplace: new Set(
      (entry?.invocationChoices ?? []).filter((id) => !REPEATABLE_INVOCATIONS.has(id))
    ),
    fightingStyle: new Set(featureIds(before)),
    fightingStyleReplace: new Set(featureIds(before)),
  };
  for (const row of asks.rows) {
    const ids = row.options.map((o) => o.id);
    for (const id of dupes(ids)) out.push(`${label}: "${row.key}" offers ${id} twice`);
    const have =
      owned[row.key] ??
      (row.key.startsWith("slot:") && row.spell ? knownSpells : undefined);
    if (!have) continue;
    const already = ids.filter((id) => have.has(id));
    if (already.length)
      out.push(
        `${label}: "${row.key}" offers what the character already has: ${already.join(", ")}`
      );
  }
  if (entry?.subclassId && keys.includes("subclass"))
    out.push(`${label}: asks the subclass again (the character has ${entry.subclassId})`);
  return out;
}

/** The character after Confirm against the SRD tables. */
export function checkAfter(step: Step): string[] {
  const { before, after, classId, label, asks } = step;
  const out: string[] = [];
  const srd = SRD_CLASSES[classId];
  if (!srd) return [`${label}: no SRD table for ${classId}`];
  const entry = entryOf(after, classId);
  const to = entry?.level ?? 0;
  const total = totalLevel(after.character);
  if (total !== totalLevel(before.character) + 1)
    out.push(
      `${label}: total level ${total}, expected ${totalLevel(before.character) + 1}`
    );

  const pb = sheetNumbers(after).proficiencyBonus.total;
  if (pb !== SRD_PB[total - 1])
    out.push(`${label}: Proficiency Bonus ${pb}, SRD ${SRD_PB[total - 1]}`);

  // Hit Points: the advancing class's average (die/2 + 1) + CON, plus a subclass's
  // per-level HP (counted for every level of the class when the subclass arrives).
  const con = Math.floor((after.character.abilityScores.CON - 10) / 2);
  const sub = entry?.subclassId ?? "";
  const perLevel = SRD_SUBCLASS_HP_PER_LEVEL[sub] ?? 0;
  const subNew = sub && !entryOf(before, classId)?.subclassId;
  const conBefore = Math.floor((before.character.abilityScores.CON - 10) / 2);
  const hpGain =
    srd.hitDie / 2 +
    1 +
    con +
    (total - 1) * (con - conBefore) +
    (subNew ? perLevel * to : perLevel);
  const hpDelta = sheetNumbers(after).maxHp.total - sheetNumbers(before).maxHp.total;
  if (hpDelta !== hpGain) out.push(`${label}: max HP +${hpDelta}, SRD +${hpGain}`);

  // Spell slots (the sheet's Spells tab) and Pact Magic.
  const classes = getClasses(after.character).map((e) => ({
    classId: e.classId,
    level: e.level,
  }));
  const vm = buildSpellsViewModel(after, classId, "en", false);
  const slots: number[] = [];
  for (const s of vm.slots.filter((x) => !x.pactMagic)) slots[s.level - 1] = s.total;
  const wantSlots = srdSlots(classes);
  const norm0 = (r: number[]) => Array.from({ length: 9 }, (_, i) => r[i] ?? 0).join("/");
  if (norm0(slots) !== norm0(wantSlots))
    out.push(`${label}: spell slots ${norm0(slots)}, SRD ${norm0(wantSlots)}`);
  const pact = srdPact(classes);
  const pactRows = vm.slots.filter((x) => x.pactMagic);
  if (pact) {
    const got = pactRows.map((r) => `${r.total}@${r.level}`).join(",");
    if (got !== `${pact.count}@${pact.level}`)
      out.push(`${label}: Pact Magic ${got || "none"}, SRD ${pact.count}@${pact.level}`);
  }

  // The prepared cap and the class's own cantrips (single-class builds).
  if (classes.length === 1 && srd.prepared) {
    const cap = vm.castSummary?.preparedMax;
    if (cap !== srdAt(srd.prepared, to))
      out.push(`${label}: prepared cap ${cap}, SRD ${srdAt(srd.prepared, to)}`);
  }
  if (srd.cantrips) {
    const want =
      ownCantrips(before) + (asks.rows.find((r) => r.key === "newCantrips")?.count ?? 0);
    const gained = srdAt(srd.cantrips, to) - srdAt(srd.cantrips, to - 1);
    if (
      ownCantrips(after) !== want ||
      (to > 1 && ownCantrips(after) - ownCantrips(before) !== gained)
    )
      out.push(
        `${label}: cantrips ${ownCantrips(before)}→${ownCantrips(after)}, SRD adds ${gained}`
      );
  }

  // The level's features (class column + the SRD subclass's), none twice.
  const names = [
    ...(srd.features[to] ?? []),
    ...(SRD_SUBCLASS_FEATURES[sub]?.[to] ?? []),
  ];
  // A subclass arriving late brings its earlier features too.
  if (subNew)
    for (let l = srd.subclassLevel; l < to; l++)
      names.push(...(SRD_SUBCLASS_FEATURES[sub]?.[l] ?? []));
  for (const n of names)
    if (!hasFeature(after, n)) out.push(`${label}: missing the feature "${n}"`);
  for (const id of dupes(featureIds(after)))
    out.push(`${label}: the feature ${id} is held twice`);

  // Spells: none twice, and no pick that is also always prepared (a wasted pick).
  const refs = srdRefs(after);
  for (const id of dupes(refs.map((s) => s.srdId)))
    out.push(`${label}: the spell ${id} is held twice`);
  for (const id of [...asks.picks.newSpells, ...asks.picks.newCantrips]) {
    if (refs.find((s) => s.srdId === id)?.alwaysPrepared)
      out.push(`${label}: picked ${id}, which the level also makes always prepared`);
  }
  return out;
}

export const checkStep = (step: Step) => [...checkAsks(step), ...checkAfter(step)];

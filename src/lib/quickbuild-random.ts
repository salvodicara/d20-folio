/**
 * The quickbuild RANDOMIZER — reroll a character's flavour, never its class.
 *
 * A tap on Randomize keeps the class the player chose (and the class's
 * standard-array priority: a rolled character must still be PLAYABLE) and draws
 * everything else afresh from the COMPOSED pools — species and its lineage, the
 * background and which of its abilities take the +2/+1, class skills, level-1
 * cantrips and spells, origin languages, the Human origin feat, and every
 * follow-up pick a feat or feature asks for.
 *
 * It produces a {@link QuickbuildPreset} — the SAME shape the hand-authored
 * presets use — so the rolled build flows through the very same applicator,
 * choice-slot filling and Create gate. Nothing here knows about the wizard.
 *
 * **This is not dice** (golden rule 21). The app never rolls for a player: no
 * attack, no damage, no ability check is generated here. This draws a character
 * SHEET at creation time, the way a "surprise me" button does, and every value
 * it picks is immediately editable on the page it lands on.
 *
 * The randomness is INJECTED ({@link Rng}) so the whole thing is a pure
 * function under test — a fixed seed always yields the same character. The one
 * entropy source the UI passes in, {@link cryptoRng}, is the only impure line
 * in the module and is confined to the bottom of this file.
 */
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import { classTables } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_RACES } from "@/data/races";
import { spells as ALL_SPELLS } from "@/data/spells";
import type { AbilityCode } from "@/data/types";
import type { QuickbuildPreset } from "@/data/quickbuild";
import { skillNameToId } from "@/lib/compute";
import { creationChoiceSlots, ORIGIN_LANGUAGE_SLOTS } from "@/lib/creation-choices";
import { listAvailableForLanguageSlot } from "@/lib/feat-language-choices";
import { listAvailableForSlot } from "@/lib/feat-spell-choices";
import { ALL_SKILLS } from "@/lib/skills";
import { SRD_TOOLS_2024 } from "@/lib/tools";

/** A source of `0 ≤ x < 1`. Injected so a roll is reproducible under test. */
export type Rng = () => number;

/** One element, uniformly. Callers pass a non-empty pool; an empty one yields `undefined`. */
function pick<T>(rng: Rng, pool: readonly T[]): T | undefined {
  return pool[Math.floor(rng() * pool.length)];
}

/**
 * `n` elements WITHOUT repetition (a partial Fisher–Yates over a copy). When the
 * pool is smaller than `n` it yields the whole pool — the caller's slot then
 * simply cannot be filled to its count, which the preset guard would catch.
 */
function sample<T>(rng: Rng, pool: readonly T[], n: number): T[] {
  const rest = [...pool];
  const out: T[] = [];
  while (out.length < n && rest.length > 0) {
    const [taken] = rest.splice(Math.floor(rng() * rest.length), 1);
    if (taken !== undefined) out.push(taken);
  }
  return out;
}

/** Skill ids a background grants (locked in the picker — never a class pick). */
function backgroundSkillIds(backgroundId: string): string[] {
  const bg = SRD_BACKGROUNDS.find((b) => b.id === backgroundId);
  return (bg?.skillProficiencies ?? [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null);
}

/**
 * Roll a class's flavour. `base` supplies the one thing a roll must NOT touch:
 * the class's ability priority, so the standard array always lands where the
 * class needs it.
 */
export function rollQuickbuildFlavor(
  classId: string,
  base: QuickbuildPreset,
  rng: Rng
): QuickbuildPreset {
  const table = classTables.find((c) => c.id === classId);
  const primary = base.abilityOrder[0];

  // ── Species + its creation-time lineage ────────────────────────────────────
  const race = pick(rng, SRD_RACES) ?? SRD_RACES[0];
  const lineage: Record<string, string> = {};
  for (const trait of race?.traits ?? []) {
    for (const grant of trait.grants ?? []) {
      if (grant.type !== "choice-grant-bundle" || grant.choiceFrequency !== "creation") {
        continue;
      }
      const option = pick(rng, grant.options);
      if (option) lineage[grant.bundleKey] = option.id;
    }
  }

  // ── Background: RAW keeps the +2 on the class's primary ability, so only the
  // backgrounds offering that ability are eligible. (Should a class's primary
  // appear in no background's trio, the whole roster stays eligible and the +2
  // lands on the best ability that background does offer — still legal.)
  const eligible = SRD_BACKGROUNDS.filter((b) =>
    b.abilityOptions.includes(primary as AbilityCode)
  );
  const background =
    pick(rng, eligible.length > 0 ? eligible : SRD_BACKGROUNDS) ?? SRD_BACKGROUNDS[0];
  const backgroundId = background?.id ?? base.backgroundId;
  // +2 then +1, following the class's own priority through what the background
  // allows — a rolled character is flavour-random, never build-random.
  const boostable = base.abilityOrder.filter((code) =>
    (background?.abilityOptions ?? []).includes(code)
  );
  const boost: readonly [AbilityCode, AbilityCode] = [
    boostable[0] ?? base.boost[0],
    boostable[1] ?? base.boost[1],
  ];

  // ── Class skills (the background's are already granted, so never re-picked) ─
  const bgSkills = new Set(backgroundSkillIds(backgroundId));
  const skillPool = (table?.skillChoices.from ?? [])
    .map(skillNameToId)
    .filter((id): id is string => id !== null && !bgSkills.has(id));
  const classSkills = sample(rng, skillPool, table?.skillChoices.count ?? 0);

  // ── Spells the class knows at level 1 ──────────────────────────────────────
  const row = table?.levels[0];
  const maxSpellLevel = (row?.spellSlots ?? []).reduce(
    (max, slots, i) => (slots > 0 ? i + 1 : max),
    0
  );
  const onList = (level: (l: number) => boolean) =>
    ALL_SPELLS.filter((s) => s.classes.includes(classId) && level(s.level)).map(
      (s) => s.id
    );
  const cantrips = sample(
    rng,
    onList((l) => l === 0),
    row?.cantripsKnown ?? 0
  );
  const spells = sample(
    rng,
    onList((l) => l > 0 && l <= maxSpellLevel),
    row?.spellsKnown ?? 0
  );

  // ── Origin languages ───────────────────────────────────────────────────────
  const [languageSlot] = ORIGIN_LANGUAGE_SLOTS;
  const languagePool = languageSlot ? listAvailableForLanguageSlot(languageSlot) : [];
  const [firstLanguage, secondLanguage] = sample(
    rng,
    languagePool,
    languageSlot?.amount ?? 2
  );

  // ── The Human "Versatile" origin feat (never the one the background grants) ─
  const bgFeat = background?.feat ?? "";
  const humanFeat =
    race?.id === "human"
      ? pick(
          rng,
          SRD_FEATS.filter((f) => f.category === "origin" && f.id !== bgFeat).map(
            (f) => f.id
          )
        )
      : undefined;

  // ── Everything those choices then ASK for ──────────────────────────────────
  // The slots depend on the picks above, so they are collected only now — the
  // same seam the wizard renders and the presets fill.
  const slots = creationChoiceSlots({
    classId,
    level: 1,
    subclassId: "",
    backgroundId,
    humanFeat: humanFeat ?? "",
    bgFeat,
  });
  const proficientSkills = new Set([...bgSkills, ...classSkills]);
  const ownedSpells = new Set([...cantrips, ...spells]);
  /** Draw across a kind's slots in order, never repeating a pick within a kind. */
  const drawAcross = <T extends { slotId: string }>(
    kindSlots: readonly T[],
    amountOf: (slot: T) => number,
    poolOf: (slot: T) => readonly string[]
  ): string[] => {
    const taken = new Set<string>();
    const out: string[] = [];
    for (const slot of kindSlots) {
      const drawn = sample(
        rng,
        poolOf(slot).filter((id) => !taken.has(id)),
        amountOf(slot)
      );
      for (const id of drawn) taken.add(id);
      out.push(...drawn);
    }
    return out;
  };
  const openSkillPool = ALL_SKILLS.map((s) => s.id).filter(
    (id) => !proficientSkills.has(id)
  );
  const choices = {
    skill: drawAcross(
      slots.skill,
      (s) => s.amount,
      (s) => (s.options.length > 0 ? s.options : openSkillPool)
    ),
    tool: drawAcross(
      slots.tool,
      (s) => s.amount,
      (s) => (s.options.length > 0 ? s.options : SRD_TOOLS_2024.map((t) => t.id))
    ),
    // A Skilled-style slot takes a skill OR a tool; skills the character does
    // not already have are the useful half of that pool.
    skillOrTool: drawAcross(
      slots.skillOrTool,
      (s) => s.amount,
      () => openSkillPool
    ),
    language: drawAcross(
      slots.language,
      (s) => s.amount,
      (s) => listAvailableForLanguageSlot(s)
    ),
    expertise: drawAcross(
      slots.expertise,
      (s) => s.amount,
      () => [...proficientSkills]
    ),
    feat: drawAcross(
      slots.feat,
      (s) => s.amount,
      (s) =>
        SRD_FEATS.filter((f) => f.category === s.category && f.id !== bgFeat).map(
          (f) => f.id
        )
    ),
    spell: drawAcross(
      slots.spell,
      (s) => s.count,
      (s) => listAvailableForSlot(s, ownedSpells).map((s2) => s2.id)
    ),
  };

  return {
    raceId: race?.id ?? base.raceId,
    backgroundId,
    abilityOrder: base.abilityOrder,
    boost,
    classSkills,
    languages: [firstLanguage ?? base.languages[0], secondLanguage ?? base.languages[1]],
    ...(cantrips.length > 0 ? { cantrips } : {}),
    ...(spells.length > 0 ? { spells } : {}),
    ...(Object.keys(lineage).length > 0 ? { lineage } : {}),
    ...(humanFeat ? { humanFeat } : {}),
    choices,
  };
}

/**
 * The UI's entropy source — the ONLY impure line in this module.
 *
 * `crypto.getRandomValues` is the platform's own generator (the same one the
 * campaign invite codes use); no `Math.random`, and — again — no dice: this
 * seeds a character sheet, never a roll (golden rule 21). The `undefined` check
 * is a boundary assertion, not a fallback: a length-1 `Uint32Array` always has
 * index 0, and if that ever stopped being true a silent 0 would quietly make
 * every "random" character identical.
 */
export const cryptoRng: Rng = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  const [value] = buffer;
  if (value === undefined) throw new Error("crypto.getRandomValues returned no value");
  return value / 2 ** 32;
};

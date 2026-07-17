import type { SrdFeatData } from "./types";
import { ALL_FEAT_CATEGORIES } from "./types";
import { mergePack } from "@/lib/pack-merge";
import { packFeats } from "@pack";

const PUBLIC_FEATS: SrdFeatData[] = [
  // ============================================================
  // Origin Feats
  // ============================================================
  {
    id: "alert",
    category: "origin",
    repeatable: false,
    source: "SRD",
  },
  {
    id: "magic-initiate-cleric",
    category: "origin",
    repeatable: false,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    grants: [
      // Magic Initiate (Cleric): 2 cantrips + 1 L1 spell from the Cleric list. The
      // L1 spell is always-prepared + free-cast 1× LR (the tracker above is the
      // gate). 2024 RAW: the casting ability is the player's choice of Int/Wis/Cha
      // (auto-defaulted to the character's best, override-first), not pinned WIS.
      {
        type: "choice-cantrip",
        classSpellList: "cleric",
        amount: 2,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
      },
      {
        type: "choice-spell",
        classSpellList: "cleric",
        maxLevel: 1,
        amount: 1,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
        // 2024 Magic Initiate: cast the chosen L1 spell once WITHOUT a slot, 1/LR
        // (the feat's own tracker above is the gate). Single free-cast → bare key.
        freeCastSource: {
          sourceId: "magic-initiate-cleric",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "magic-initiate-druid",
    category: "origin",
    repeatable: false,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    grants: [
      // 2024 RAW: the casting ability is the player's choice of Int/Wis/Cha
      // (auto-defaulted to the character's best, override-first), not pinned WIS.
      {
        type: "choice-cantrip",
        classSpellList: "druid",
        amount: 2,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
      },
      {
        type: "choice-spell",
        classSpellList: "druid",
        maxLevel: 1,
        amount: 1,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
        // 2024 Magic Initiate: the chosen L1 spell is castable 1/LR without a slot.
        freeCastSource: {
          sourceId: "magic-initiate-druid",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "magic-initiate-wizard",
    category: "origin",
    repeatable: false,
    mechanics: {
      tracker: { total: "1", recovery: "long-rest" },
    },
    grants: [
      // 2024 RAW: the casting ability is the player's choice of Int/Wis/Cha
      // (auto-defaulted to the character's best, override-first), not pinned INT.
      {
        type: "choice-cantrip",
        classSpellList: "wizard",
        amount: 2,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
      },
      {
        type: "choice-spell",
        classSpellList: "wizard",
        maxLevel: 1,
        amount: 1,
        spellAbilityChoice: ["INT", "WIS", "CHA"],
        // 2024 Magic Initiate: the chosen L1 spell is castable 1/LR without a slot.
        freeCastSource: {
          sourceId: "magic-initiate-wizard",
          rest: "long",
          usesPerRest: 1,
        },
      },
    ],
    source: "SRD",
  },
  {
    id: "savage-attacker",
    category: "origin",
    repeatable: false,
    // Wiki: once per turn when you hit with a weapon, roll the weapon's damage
    // dice twice and use either roll. Modeled as a "reroll-keep-higher" die
    // modifier on any weapon attack; the attack-row consumer annotates the
    // matching rows (engine shows formulas, never rolls).
    grants: [
      {
        type: "damage-die-modifier",
        mode: "reroll-keep-higher",
        appliesTo: "weapon",
        oncePerTurn: true,
      },
    ],
    source: "SRD",
  },
  {
    id: "skilled",
    category: "origin",
    // PROSE-SWEPT 2026-06-10 — wiki: "Repeatable. You can take this feat more
    // than once." (was modeled non-repeatable).
    repeatable: true,
    // RAW 2024: "any combination of three skills or tools." Surfaces a
    // unified picker at level-up / creation; picks resolve into
    // character.skills and character.toolProficiencies respectively.
    grants: [{ type: "choice-skill-or-tool-proficiency", amount: 3 }],
    source: "SRD",
  },
  // ============================================================
  // General Feats (Level 4+)
  // ============================================================
  {
    id: "ability-score-improvement",
    category: "general",
    repeatable: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — Source: PHB 2024 (`feat:grappler` wiki).
    // Italian name "Lottatore" verified against the IT SRD 5.2.1 (page 98) —
    // included verbatim with the SRD's "Colpisci e afferra" / "Attacco con
    // vantaggio" / "Lottatore rapido" sub-feature names.
    id: "grappler",
    category: "general",
    repeatable: false,
    prereq: { abilities: [{ anyOf: ["STR", "DEX"], min: 13 }] },
    grants: [
      { type: "choice-ability-score", abilities: ["STR", "DEX"], amount: 1, cap: 20 },
    ],
    source: "SRD",
  },
  // ============================================================
  // Fighting Style Feats
  // ============================================================
  {
    id: "archery",
    category: "fighting-style",
    repeatable: false,
    // Wiki (feat:archery): "You gain a +2 bonus to attack rolls you make with
    // Ranged weapons." Modeled as a flat to-hit bonus scoped to ranged weapons;
    // the attack-row consumer sums it into every Ranged weapon's attack bonus.
    grants: [{ type: "weapon-attack-bonus", amount: 2, scope: "ranged" }],
    source: "SRD",
  },
  {
    id: "defense",
    category: "fighting-style",
    repeatable: false,
    // Wiki: "+1 bonus to Armor Class" while wearing armor. effectiveAC consumes
    // ac-bonus; the "while wearing armor" condition is the common case and stays
    // informational (a Defense-fighting-style character is essentially always
    // armored).
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "great-weapon-fighting",
    category: "fighting-style",
    repeatable: false,
    // Wiki: treat any 1 or 2 on a damage die as a 3, on a Melee weapon held in
    // two hands (Two-Handed or Versatile property). Modeled as a "floor" die
    // modifier scoped to two-handed melee weapons; the attack-row consumer
    // annotates the matching weapon rows (engine shows formulas, never rolls).
    grants: [
      {
        type: "damage-die-modifier",
        mode: "floor",
        appliesTo: "two-handed-melee",
        floorBelow: 2,
        floorTo: 3,
      },
    ],
    source: "SRD",
  },
  {
    id: "two-weapon-fighting",
    category: "fighting-style",
    repeatable: false,
    // Wiki: add your ability modifier to the off-hand (Light-weapon extra)
    // attack's damage, which RAW omits by default. Modeled as an
    // "offhand-ability-mod" die modifier; the dual-wield consumer adds the
    // modifier back to the off-hand attack-row damage formula.
    grants: [
      {
        type: "damage-die-modifier",
        mode: "offhand-ability-mod",
        appliesTo: "light-melee",
      },
    ],
    source: "SRD",
  },
  // ============================================================
  // Epic Boon Feats
  // ============================================================
  {
    id: "boon-of-combat-prowess",
    category: "epic-boon",
    repeatable: false,
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-dimensional-travel",
    category: "epic-boon",
    repeatable: false,
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-fate",
    category: "epic-boon",
    repeatable: false,
    // PROSE-SWEPT 2026-06-10 — Improve Fate fires on any nearby D20 Test
    // result (no action slot); the free row spends the use. RAW it also
    // recharges when you roll Initiative — the rest recovery is the modeled
    // floor (override-first).
    mechanics: {
      tracker: { total: "1", recovery: "short-rest", die: "2d4" },
      actions: [{ type: "free" }],
    },
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-irresistible-offense",
    category: "epic-boon",
    repeatable: false,
    grants: [
      // Lvl-19+ Epic Boon: the ASI explicitly caps at 30 (wiki + feat text:
      // "Increase your Strength or Dexterity score by 1, to a maximum of 30").
      { type: "choice-ability-score", abilities: ["STR", "DEX"], amount: 1, cap: 30 },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-spell-recall",
    category: "epic-boon",
    repeatable: false,
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-the-night-spirit",
    category: "epic-boon",
    repeatable: false,
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
    ],
    source: "SRD",
  },
  {
    id: "boon-of-truesight",
    category: "epic-boon",
    repeatable: false,
    grants: [
      {
        type: "choice-ability-score",
        abilities: ["STR", "DEX", "CON", "INT", "WIS", "CHA"],
        amount: 1,
        cap: 30,
      },
      // Wiki: "Truesight. You have Truesight with a range of 60 feet."
      { type: "truesight", range: 60 },
    ],
    source: "SRD",
  },
];

/**
 * All feats — public SRD + content pack, sorted by (category, id) so the
 * browse order keeps its category clustering and is identical in both build
 * modes (the raw file order would strand pack feats at the end).
 */
export const SRD_FEATS: SrdFeatData[] = mergePack("feat", PUBLIC_FEATS, packFeats).sort(
  (a, b) =>
    ALL_FEAT_CATEGORIES.indexOf(a.category) - ALL_FEAT_CATEGORIES.indexOf(b.category) ||
    a.id.localeCompare(b.id)
);

/** Get a feat by its ID */
export function getFeat(id: string): SrdFeatData | undefined {
  return FEATS_BY_ID.get(id);
}

/** Get all Origin feats */
export function getOriginFeats(): SrdFeatData[] {
  return SRD_FEATS.filter((feat) => feat.category === "origin");
}

/** Get all General feats */
export function getGeneralFeats(): SrdFeatData[] {
  return SRD_FEATS.filter((feat) => feat.category === "general");
}

/** Get all Fighting Style feats */
export function getFightingStyleFeats(): SrdFeatData[] {
  return SRD_FEATS.filter((feat) => feat.category === "fighting-style");
}

/** Get all Epic Boon feats */
export function getEpicBoonFeats(): SrdFeatData[] {
  return SRD_FEATS.filter((feat) => feat.category === "epic-boon");
}

/** Fast ID lookup for feats */
export const FEATS_BY_ID: ReadonlyMap<string, SrdFeatData> = new Map(
  SRD_FEATS.map((f) => [f.id, f])
);

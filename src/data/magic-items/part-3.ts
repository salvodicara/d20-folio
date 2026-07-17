import type { SrdMagicItemData } from "../types";
import { RESISTANCE_TYPE_BUNDLE } from "./_resistance";

export const MAGIC_ITEMS_PART_3: SrdMagicItemData[] = [
  {
    // Phase E ingestion — magic-item:dwarven-plate (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dwarven-plate",
    rarity: "very-rare",
    type: "armor",
    attunement: false,
    properties: ["+2 AC"],
    // +2 AC (ref.acBonus → computeAC). The anti-forced-movement Reaction stays
    // descriptive (it is a manual, situational reaction, not a numeric).
    grants: [{ type: "ac-bonus", amount: 2 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dwarven-thrower (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dwarven-thrower",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:efreeti-bottle (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "efreeti-bottle",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:energy-bow (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "energy-bow",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:hat-of-many-spells (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "hat-of-many-spells",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:helm-of-brilliance (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "helm-of-brilliance",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:horn-of-valhalla (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "horn-of-valhalla",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:horseshoes-of-a-zephyr (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "horseshoes-of-a-zephyr",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:manual-of-bodily-health (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "manual-of-bodily-health",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:manual-of-gainful-exercise (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "manual-of-gainful-exercise",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:manual-of-golems (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "manual-of-golems",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:manual-of-quickness-of-action (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "manual-of-quickness-of-action",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:mirror-of-life-trapping (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "mirror-of-life-trapping",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:oathbow (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "oathbow",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:oil-of-sharpness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "oil-of-sharpness",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-longevity (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-longevity",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-vitality (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-vitality",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:quarterstaff-of-the-acrobat (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "quarterstaff-of-the-acrobat",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-regeneration (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-regeneration",
    rarity: "very-rare",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-shooting-stars (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-shooting-stars",
    rarity: "very-rare",
    type: "ring",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 6"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-telekinesis (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-telekinesis",
    rarity: "very-rare",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:robe-of-scintillating-colors (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "robe-of-scintillating-colors",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:robe-of-stars (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "robe-of-stars",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    properties: ["+1 saves"],
    // +1 to ALL saving throws while worn (save-bonus flat). The six Magic Missile
    // stars (recharge 1d6/dusk) and the Astral-Plane travel stay manual.
    grants: [{ type: "save-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-absorption (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-absorption",
    rarity: "very-rare",
    type: "rod",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-alertness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-alertness",
    rarity: "very-rare",
    type: "rod",
    attunement: true,
    // "Alertness" property is always-on while holding: Advantage on Wisdom
    // (Perception) checks AND on Initiative rolls. The stored spells + the
    // Protective Aura (charge/action-gated, 1/dawn) stay descriptive.
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "perception",
      },
      {
        type: "advantage-on",
        rollType: "check",
        vs: "initiative",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-security (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-security",
    rarity: "very-rare",
    type: "rod",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:scimitar-of-speed (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "scimitar-of-speed",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:shield-of-the-cavalier (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "shield-of-the-cavalier",
    rarity: "very-rare",
    type: "armor",
    attunement: true,
    properties: ["+2 AC"],
    // +2 AC in addition to the shield's normal bonus (ref.acBonus → computeAC).
    // Forceful Bash (attack option) and Protective Field (Reaction) stay manual.
    grants: [{ type: "ac-bonus", amount: 2 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:spellguard-shield (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "spellguard-shield",
    rarity: "very-rare",
    type: "armor",
    attunement: true,
    // Always-on: Advantage on saves vs spells & magical effects. The
    // "spell attack rolls have Disadvantage against you" half is on attackers,
    // not the wearer's own roll, so it stays descriptive (no against-you path).
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "spells-magic",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-fire (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-fire",
    rarity: "very-rare",
    type: "staff",
    attunement: true,
    // Static "Resistance to Fire damage while you hold this staff" is modeled
    // (mirrors Frost Brand). The charge-gated Burning Hands / Fireball / Wall of
    // Fire casting + recharge stay descriptive (charges ride the tracker seam).
    grants: [{ type: "damage-resistance", damageType: "fire" }],
    properties: ["charges: 10"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-frost (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-frost",
    rarity: "very-rare",
    type: "staff",
    attunement: true,
    // Static "Resistance to Cold damage while you hold this staff" is modeled
    // (mirrors Frost Brand). The charge-gated Cone of Cold / Fog Cloud / Ice
    // Storm / Wall of Ice casting + recharge stay descriptive.
    grants: [{ type: "damage-resistance", damageType: "cold" }],
    properties: ["charges: 10"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-striking (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-striking",
    rarity: "very-rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 10"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-thunder-and-lightning (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-thunder-and-lightning",
    rarity: "very-rare",
    type: "staff",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sword-of-sharpness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sword-of-sharpness",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:thunderous-greatclub (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "thunderous-greatclub",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:tome-of-clear-thought (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "tome-of-clear-thought",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:tome-of-leadership-and-influence (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "tome-of-leadership-and-influence",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:tome-of-understanding (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "tome-of-understanding",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-polymorph (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-polymorph",
    rarity: "very-rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    // S9 — single-fixed-spell wand: casts Polymorph from its 7-charge pool (1
    // charge per cast; RAW save DC 15 in the item prose). Same pipeline Wand of
    // Magic Missiles ships — the paired `always-prepared-spell` makes Polymorph
    // castable on the Play board, the `free-cast-spell` debits the
    // `wand-of-polymorph` tracker, `rest: "long"` = "regains daily at dawn".
    // Polymorph's own beast-form STAT SWAP stays the user override (the spell's
    // automation is deferred) — only the CAST affordance + charges are modeled.
    grants: [
      { type: "always-prepared-spell", spellId: "polymorph" },
      {
        type: "free-cast-spell",
        spellId: "polymorph",
        chargesPerRest: 7,
        rest: "long",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:armor-of-invulnerability (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "armor-of-invulnerability",
    rarity: "legendary",
    type: "armor",
    attunement: true,
    // Always-on B/P/S resistance; the 10-minute B/P/S Immunity is the "Metal
    // Shell" activated property (1/dawn) — ALL-IN: modeled behind a while-active
    // toggle. Charges/duration stay manual (the engine doesn't tick the dawn
    // recharge or the 10-minute timer).
    grants: [
      { type: "damage-resistance", damageType: "bludgeoning" },
      { type: "damage-resistance", damageType: "piercing" },
      { type: "damage-resistance", damageType: "slashing" },
      {
        type: "while-active",
        activeKey: "armor-of-invulnerability-metal-shell",
        grants: [
          { type: "damage-immunity", damageType: "bludgeoning" },
          { type: "damage-immunity", damageType: "piercing" },
          { type: "damage-immunity", damageType: "slashing" },
        ],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:cloak-of-invisibility (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "cloak-of-invisibility",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:crystal-ball-of-mind-reading (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "crystal-ball-of-mind-reading",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:crystal-ball-of-telepathy (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "crystal-ball-of-telepathy",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:crystal-ball-of-true-seeing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "crystal-ball-of-true-seeing",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:cubic-gate (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "cubic-gate",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:defender (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "defender",
    rarity: "legendary",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:hammer-of-thunderbolts (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "hammer-of-thunderbolts",
    rarity: "legendary",
    type: "weapon",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 5"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:plate-armor-of-etherealness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "plate-armor-of-etherealness",
    rarity: "legendary",
    type: "armor",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-djinni-summoning (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-djinni-summoning",
    rarity: "legendary",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-spell-turning (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-spell-turning",
    rarity: "legendary",
    type: "ring",
    attunement: true,
    // Always-on: Advantage on saving throws against spells. The "no effect on a
    // success vs level ≤7" + the Reaction deflection stay descriptive (no
    // deterministic engine path; the deflection is a charge-free reaction).
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "spells",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-three-wishes (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-three-wishes",
    rarity: "legendary",
    type: "ring",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:robe-of-the-archmagi (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "robe-of-the-archmagi",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    properties: [
      "base AC 15 + DEX (unarmored)",
      "advantage on saves vs spells",
      "+2 spell DC",
      "+2 spell attack",
    ],
    // Three always-on benefits while worn (attunement-gated):
    //  - Armor → an `ac-formula` (base 15 + DEX, applies only with no armor);
    //    rendered by `computeAC`'s equipment-formula pass (highest applicable AC
    //    wins, so it loses to better-armored alternatives automatically).
    //  - Magic Resistance → `advantage-on` save vs spells/magic.
    //  - War Mage → +2 spell save DC AND +2 spell attack bonus (all classes).
    grants: [
      {
        type: "ac-formula",
        base: 15,
        bonuses: ["DEX"],
        condition: "no-armor",
      },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "spells-magic",
      },
      { type: "spell-save-dc-bonus", amount: 2, scope: "all" },
      { type: "spell-attack-bonus", amount: 2, scope: "all" },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-lordly-might (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-lordly-might",
    rarity: "legendary",
    type: "rod",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-resurrection (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-resurrection",
    rarity: "legendary",
    type: "rod",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 5"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:scarab-of-protection (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "scarab-of-protection",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    properties: ["charges: 12", "+1 AC", "advantage on saves vs spells"],
    // Defense → +1 AC (ref.acBonus → computeAC). Spell Resistance → `advantage-on`
    // save vs spells. Preservation (12-charge auto-succeed-on-failed-save vs
    // Necromancy/Undead) stays a manual reaction — charges remain manual.
    grants: [
      { type: "ac-bonus", amount: 1 },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "spells",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sovereign-glue (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sovereign-glue",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sphere-of-annihilation (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sphere-of-annihilation",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:talisman-of-pure-good (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "talisman-of-pure-good",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:talisman-of-the-sphere (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "talisman-of-the-sphere",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:talisman-of-ultimate-evil (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "talisman-of-ultimate-evil",
    rarity: "legendary",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 6"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:universal-solvent (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "universal-solvent",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:well-of-many-worlds (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "well-of-many-worlds",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  // ── Repatriated 2026-07-17 — SRD 5.2.1 items whose prose was re-sourced
  // from the SRD itself (the verifier's KEEP-PACK residual-prose list). ──
  {
    // Rarity varies by stone type (Rare→Legendary, per the SRD 5.2.1 list);
    // "rare" is the lowest actual tier (Awareness/Protection/Reserve/
    // Sustenance) — "common" matched no stone type at all.
    id: "ioun-stone",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // NOTE: keep "AC" out of these property strings — `parseMagicItemAcBonus`
    // would parse a flat ref.acBonus that the chooser-nested ac-bonus shouldn't
    // double with (and the grant-parity test asserts top-level grant == hint).
    properties: [
      "pick a stone type",
      "Protection: bonus to Armor Class",
      "Awareness: advantage init + perception",
    ],
    // Single-select chooser over the stone TYPES. The DETERMINISTIC,
    // render-consumed effects are wired:
    //  - Protection → `ac-bonus` +1 (declarative; see the AC-render note below).
    //  - Awareness → `advantage-on` Initiative + Perception checks (rendered as
    //    chips by the Abilities/Combat consumers).
    //  - The six ability-+2 stones (Agility → DEX, Strength → STR, Fortitude →
    //    CON, Insight → WIS, Intellect → INT, Leadership → CHA) → an ADDITIVE
    //    `ability-score` (+2, cap 20). These ride the magic-item additive channel
    //    (`itemAbilityScoreBonus`), which `effectiveAbilityScores` folds in AFTER
    //    the floor, so the +2 reaches every combat/cast/display surface. Source-
    //    kind-filtered to magic-item, so it never double-counts a feat/class ASI
    //    (those bake into the stored scores).
    // Still descriptive (non-deterministic or charge-gated): Mastery (+1 PB),
    // Regeneration (HP/hour), Sustenance, Absorption/Greater Absorption/Reserve
    // (Reaction / charge spell store). Note: the Protection `ac-bonus` rides the
    // `evaluateGrants().acBonus` aggregate (parity-correct), but the live sheet AC
    // reads flat item bonuses from `ref.acBonus` (set from top-level `properties`),
    // so a bundle-option ac-bonus is not yet summed into AC at render — same
    // standing gap as any chooser-nested ac-bonus; manual override covers it until
    // the aggregate is threaded into `computeAC`.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "ioun-stone-type",
        options: [
          {
            id: "protection",
            grants: [{ type: "ac-bonus", amount: 1 }],
          },
          {
            id: "awareness",
            grants: [
              {
                type: "advantage-on",
                rollType: "check",
                vs: "initiative",
              },
              {
                type: "advantage-on",
                rollType: "check",
                vs: "perception",
              },
            ],
          },
          {
            id: "agility",
            grants: [{ type: "ability-score", ability: "DEX", amount: 2, cap: 20 }],
          },
          {
            id: "strength",
            grants: [{ type: "ability-score", ability: "STR", amount: 2, cap: 20 }],
          },
          {
            id: "fortitude",
            grants: [{ type: "ability-score", ability: "CON", amount: 2, cap: 20 }],
          },
          {
            id: "insight",
            grants: [{ type: "ability-score", ability: "WIS", amount: 2, cap: 20 }],
          },
          {
            id: "intellect",
            grants: [{ type: "ability-score", ability: "INT", amount: 2, cap: 20 }],
          },
          {
            id: "leadership",
            grants: [{ type: "ability-score", ability: "CHA", amount: 2, cap: 20 }],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "oil-of-slipperiness",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    id: "philter-of-love",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    id: "cloak-of-the-bat",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // Always-on: Advantage on Dexterity (Stealth). The conditional Fly 40 ft
    // (requires Dim Light/Darkness + gripping the edges) is modeled behind a
    // while-active toggle the player flips when those conditions hold; the
    // lighting/grip preconditions stay manual. The 1/dawn Polymorph (Bat)
    // self-cast stays descriptive.
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "stealth",
      },
      {
        type: "while-active",
        activeKey: "cloak-of-the-bat",
        grants: [{ type: "fly-speed", amount: 40 }],
      },
    ],
    source: "SRD",
  },
  {
    id: "cube-of-force",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    id: "potion-of-gaseous-form",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    id: "ring-of-resistance",
    rarity: "rare",
    type: "ring",
    attunement: false,
    // Choose which of the 10 damage types this ring resists (the gemstone's
    // type; modeled as a single-select bundle the player picks once).
    grants: [RESISTANCE_TYPE_BUNDLE("ring-of-resistance")],
    source: "SRD",
  },
  {
    id: "ammunition-of-slaying",
    rarity: "very-rare",
    type: "weapon",
    attunement: false,
    source: "SRD",
  },
  {
    id: "candle-of-invocation",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    id: "iron-flask",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    id: "ring-of-elemental-command",
    rarity: "legendary",
    type: "ring",
    attunement: true,
    properties: ["element-keyed focus", "5 charges (1d4+1 at dawn)"],
    // Per-element focus modelled as a single-select choice-grant-bundle keyed by
    // the ring's linked plane. The selector surfaces once the ring is equipped +
    // attuned (equipment grant seam — `attunement: true`). Each option grants the
    // plane's language + damage resistance/immunity + movement. Elemental Bane
    // (Advantage on attacks vs Elementals — a creature-type-conditional with no
    // deterministic consumer) and the Spellcasting charges stay descriptive.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "ring-of-elemental-command-plane",
        options: [
          {
            id: "air",
            grants: [
              { type: "language", language: "Auran" },
              { type: "damage-resistance", damageType: "lightning" },
              { type: "fly-speed", amount: "equal-to-walking" },
            ],
          },
          {
            id: "earth",
            grants: [
              { type: "language", language: "Terran" },
              { type: "damage-resistance", damageType: "acid" },
            ],
          },
          {
            id: "fire",
            grants: [
              { type: "language", language: "Ignan" },
              { type: "damage-immunity", damageType: "fire" },
            ],
          },
          {
            id: "water",
            grants: [
              { type: "language", language: "Aquan" },
              { type: "swim-speed", amount: 60 },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
];

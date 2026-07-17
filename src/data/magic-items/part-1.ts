import type { SrdMagicItemData } from "../types";
import { asProficiencyToken } from "@/lib/proficiency-tokens";

export const MAGIC_ITEMS_PART_1: SrdMagicItemData[] = [
  // ============================================================
  // Potions (10)
  // ============================================================
  {
    id: "potion-of-healing",
    rarity: "common",
    type: "potion",
    attunement: false,
    price: "50 GP",
    // 0.5 lb (the SRD equipment weight) so it still feeds the encumbrance sum now
    // that the duplicate mundane-gear copy is removed — Potion of Healing lives in
    // the Magic Items catalogue only.
    weight: 0.5,
    potionFormula: "2d4+2",
    properties: ["healing: 2d4+2", "bonus action"],
    source: "SRD",
  },
  {
    id: "potion-of-giant-strength",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    price: "200 GP",
    properties: ["duration: 1 hour"],
    // S9 — 1 hour = 600 combat rounds; drinking arms a round-countdown.
    durationRounds: 600,
    source: "SRD",
  },
  {
    id: "potion-of-resistance",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    price: "200 GP",
    properties: ["duration: 1 hour", "resistance"],
    durationRounds: 600,
    source: "SRD",
  },
  {
    id: "potion-of-climbing",
    rarity: "common",
    type: "potion",
    attunement: false,
    price: "50 GP",
    properties: ["climbing speed", "duration: 1 hour"],
    durationRounds: 600,
    source: "SRD",
  },
  {
    id: "potion-of-water-breathing",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    price: "100 GP",
    properties: ["duration: 1 hour"],
    durationRounds: 600,
    source: "SRD",
  },
  {
    id: "potion-of-growth",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    price: "200 GP",
    properties: ["duration: 1d4 hours", "extra damage: 1d4"],
    source: "SRD",
  },
  {
    id: "potion-of-speed",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    price: "5000 GP",
    properties: ["duration: 1 minute", "haste"],
    // S9 — 1 minute = 10 combat rounds.
    durationRounds: 10,
    source: "SRD",
  },
  {
    id: "potion-of-invisibility",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    price: "5000 GP",
    properties: ["duration: 1 hour", "invisibility"],
    durationRounds: 600,
    source: "SRD",
  },
  {
    id: "potion-of-flying",
    rarity: "very-rare",
    type: "potion",
    attunement: false,
    price: "5000 GP",
    properties: ["flying speed", "duration: 1 hour"],
    durationRounds: 600,
    source: "SRD",
  },
  // ============================================================
  // Weapons (15)
  // ============================================================
  {
    id: "weapon-plus-1",
    rarity: "uncommon",
    type: "weapon",
    attunement: false,
    price: "400 GP",
    properties: ["+1 bonus"],
    // PRIM-item-bound-bonus — "+N bonus to attack and damage rolls made with
    // this magic weapon." Rides ONLY this weapon's row (`resolveItemBoundWeaponBonus`),
    // never every attack — replacing the manual `attackBonusOverride` seam.
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 }],
    source: "SRD",
  },
  {
    id: "weapon-plus-2",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    price: "4000 GP",
    properties: ["+2 bonus"],
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 2 }],
    source: "SRD",
  },
  {
    id: "weapon-plus-3",
    rarity: "very-rare",
    type: "weapon",
    attunement: false,
    price: "40000 GP",
    properties: ["+3 bonus"],
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 3 }],
    source: "SRD",
  },
  {
    id: "flame-tongue",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    price: "5000 GP",
    properties: ["+2d6 fire damage", "bonus action ignite"],
    source: "SRD",
  },
  {
    id: "frost-brand",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    price: "25000 GP",
    properties: ["+1d6 cold damage", "fire resistance"],
    // Fire resistance while held is modeled; the +1d6 cold rider + light stay
    // descriptive (weapon damage riders resolve through the attack pipeline).
    grants: [{ type: "damage-resistance", damageType: "fire" }],
    source: "SRD",
  },
  {
    id: "vorpal-sword",
    rarity: "legendary",
    type: "weapon",
    attunement: true,
    price: "100000 GP",
    properties: ["+3 bonus", "decapitate on nat 20"],
    // PRIM-item-bound-bonus — +3 to attack and damage with this sword (the nat-20
    // decapitation stays descriptive — no dice/threshold engine field).
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 3 }],
    source: "SRD",
  },
  {
    id: "sun-blade",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    price: "12000 GP",
    properties: ["+2 bonus", "radiant damage", "+1d8 vs undead", "sunlight"],
    // PRIM-item-bound-bonus — +2 to attack and damage (Radiant). The +1d8 vs
    // Undead rider + sunlight stay descriptive.
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 2 }],
    source: "SRD",
  },
  {
    id: "dragon-slayer",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    price: "8000 GP",
    properties: ["+1 bonus", "+3d6 vs dragons"],
    // PRIM-item-bound-bonus — +1 to attack and damage. The +3d6 vs Dragons rider
    // stays descriptive.
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 }],
    source: "SRD",
  },
  {
    id: "giant-slayer",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    price: "7000 GP",
    properties: ["+1 bonus", "+2d6 vs giants", "DC 15 STR prone"],
    // PRIM-item-bound-bonus — +1 to attack and damage. The +2d6 vs Giants + prone
    // riders stay descriptive.
    grants: [{ type: "item-bound-bonus", target: "weapon-attack-and-damage", amount: 1 }],
    source: "SRD",
  },
  {
    id: "dagger-of-venom",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    price: "2500 GP",
    properties: ["+1 bonus", "+2d10 poison 1/day", "DC 15 CON"],
    source: "SRD",
  },
  {
    id: "javelin-of-lightning",
    rarity: "uncommon",
    type: "weapon",
    attunement: false,
    price: "400 GP",
    properties: ["4d6 lightning", "DC 13 DEX", "1/dawn"],
    source: "SRD",
  },
  {
    id: "holy-avenger",
    rarity: "legendary",
    type: "weapon",
    attunement: true,
    price: "150000 GP",
    properties: [
      "+3 bonus",
      "+2d10 radiant vs fiends/undead",
      "aura: 10 ft save advantage",
    ],
    source: "SRD",
  },
  {
    id: "luck-blade",
    rarity: "legendary",
    type: "weapon",
    attunement: true,
    price: "120000 GP",
    properties: ["+1 bonus", "+1 saves", "reroll 1/dawn", "wish charges"],
    // +1 to ALL saving throws while the weapon is on your person (save-bonus
    // flat). The +1 attack/damage rides the weapon-attack pipeline (the item's
    // `+1 bonus` weapon enchant), and the reroll / Wish charges stay manual.
    grants: [{ type: "save-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "nine-lives-stealer",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    price: "30000 GP",
    properties: ["+2 bonus", "charges: 1d8+1", "instant death on crit DC 15 CON"],
    source: "SRD",
  },
  // ============================================================
  // Armor & Shields (10)
  // ============================================================
  {
    id: "armor-plus-1",
    rarity: "rare",
    type: "armor",
    attunement: false,
    price: "1500 GP",
    properties: ["+1 AC"],
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "armor-plus-2",
    rarity: "very-rare",
    type: "armor",
    attunement: false,
    price: "6000 GP",
    properties: ["+2 AC"],
    grants: [{ type: "ac-bonus", amount: 2 }],
    source: "SRD",
  },
  {
    id: "armor-plus-3",
    rarity: "legendary",
    type: "armor",
    attunement: false,
    price: "50000 GP",
    properties: ["+3 AC"],
    grants: [{ type: "ac-bonus", amount: 3 }],
    source: "SRD",
  },
  {
    id: "shield-plus-1",
    rarity: "uncommon",
    type: "armor",
    attunement: false,
    price: "500 GP",
    properties: ["+1 AC"],
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "shield-plus-2",
    rarity: "rare",
    type: "armor",
    attunement: false,
    price: "3000 GP",
    properties: ["+2 AC"],
    grants: [{ type: "ac-bonus", amount: 2 }],
    source: "SRD",
  },
  {
    id: "shield-plus-3",
    rarity: "very-rare",
    type: "armor",
    attunement: false,
    price: "15000 GP",
    properties: ["+3 AC"],
    grants: [{ type: "ac-bonus", amount: 3 }],
    source: "SRD",
  },
  {
    id: "adamantine-armor",
    rarity: "uncommon",
    type: "armor",
    attunement: false,
    price: "500 GP",
    properties: ["critical hits become normal hits"],
    source: "SRD",
  },
  {
    id: "mithral-armor",
    rarity: "uncommon",
    type: "armor",
    attunement: false,
    price: "800 GP",
    properties: ["no stealth disadvantage", "no strength requirement"],
    source: "SRD",
  },
  {
    id: "elven-chain",
    rarity: "rare",
    type: "armor",
    attunement: false,
    price: "4000 GP",
    properties: ["+1 AC", "no proficiency needed"],
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    id: "glamoured-studded-leather",
    rarity: "rare",
    type: "armor",
    attunement: false,
    price: "2000 GP",
    properties: ["+1 AC", "disguise appearance"],
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  // ============================================================
  // Wondrous Items, Rings, Rods, Staves (25)
  // ============================================================
  {
    id: "bag-of-holding",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    price: "400 GP",
    properties: ["capacity: 500 lb / 64 cu ft"],
    source: "SRD",
  },
  {
    id: "cloak-of-protection",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1500 GP",
    properties: ["+1 AC", "+1 saves"],
    // +1 AC (rendered via `parseMagicItemAcBonus` → ref.acBonus → computeAC) AND
    // +1 to ALL saving throws (save-bonus flat → savingThrowBonus). The ac-bonus
    // grant mirrors the properties hint (parity-tested); the save-bonus is the
    // newly-wired half — previously only the AC half was modeled.
    grants: [
      { type: "ac-bonus", amount: 1 },
      { type: "save-bonus", amount: 1 },
    ],
    source: "SRD",
  },
  {
    id: "boots-of-speed",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "4000 GP",
    properties: ["double speed", "duration: 10 min", "recharge: long rest"],
    // ALL-IN: the heel-click is an activated property, modeled behind a
    // while-active toggle. The boots "double your Speed" — modeled as a
    // `speed-multiplier` (factor 2), which the `effectiveWalkingSpeedFt` consumer
    // applies to the character's REAL base+bonus Speed. This correctly doubles a
    // 25-, 30-, or 40-ft Speed (the old `{type:"speed",amount:30}` hack only
    // doubled the default 30-ft case). The 10-minute timer + Long-Rest recharge +
    // the Opportunity-Attack disadvantage stay descriptive (no engine field).
    grants: [
      {
        type: "while-active",
        activeKey: "boots-of-speed",
        grants: [{ type: "speed-multiplier", factor: 2 }],
      },
    ],
    source: "SRD",
  },
  {
    id: "bracers-of-defense",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "6000 GP",
    properties: ["+2 AC", "no armor/shield"],
    // +2 AC, but only "if you are wearing no armor and using no shield". The flat
    // `ac-bonus` path (ref.acBonus → computeAC) does NOT gate on armor state, so
    // the +2 is applied unconditionally; the unarmored-only restriction stays in
    // `properties`/description for the player to honor (override-first — the
    // player can clear the AC override if they armor up). Not modeled as an
    // `ac-formula` because the bracers ADD to the base 10+DEX rather than
    // replacing it; an unconditional flat +2 is the closest faithful render.
    grants: [{ type: "ac-bonus", amount: 2 }],
    source: "SRD",
  },
  {
    id: "amulet-of-health",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "8000 GP",
    properties: ["CON = 19"],
    grants: [{ type: "ability-score-set", ability: "CON", value: 19 }],
    source: "SRD",
  },
  {
    id: "belt-of-giant-strength",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "8000 GP",
    properties: ["STR = 21/23/25/27/29"],
    // Composes the shipped primitives: pick the belt type (choice-grant-bundle),
    // each option sets STR to its floor (ability-score-set). The selector shows
    // on the sheet once the belt is equipped + attuned (equipment grant seam).
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "belt-of-giant-strength-type",
        options: [
          {
            id: "hill",
            grants: [{ type: "ability-score-set", ability: "STR", value: 21 }],
          },
          {
            id: "frost-stone",
            grants: [{ type: "ability-score-set", ability: "STR", value: 23 }],
          },
          {
            id: "fire",
            grants: [{ type: "ability-score-set", ability: "STR", value: 25 }],
          },
          {
            id: "cloud",
            grants: [{ type: "ability-score-set", ability: "STR", value: 27 }],
          },
          {
            id: "storm",
            grants: [{ type: "ability-score-set", ability: "STR", value: 29 }],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    id: "headband-of-intellect",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1500 GP",
    properties: ["INT = 19"],
    grants: [{ type: "ability-score-set", ability: "INT", value: 19 }],
    source: "SRD",
  },
  {
    id: "gauntlets-of-ogre-power",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1500 GP",
    properties: ["STR = 19"],
    grants: [{ type: "ability-score-set", ability: "STR", value: 19 }],
    source: "SRD",
  },
  {
    id: "cloak-of-displacement",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "12000 GP",
    properties: ["attacks have disadvantage against you"],
    source: "SRD",
  },
  {
    id: "cloak-of-elvenkind",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "500 GP",
    properties: ["advantage: Stealth", "disadvantage to spot"],
    // Advantage on Dexterity (Stealth) checks to hide (hood up). The
    // "Disadvantage to see you" half is on observers, not the wearer, so it
    // stays descriptive (no consumer for an against-you penalty).
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "stealth",
      },
    ],
    source: "SRD",
  },
  {
    id: "boots-of-elvenkind",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    price: "250 GP",
    properties: ["advantage: Stealth (silent movement)"],
    // Advantage on Dexterity (Stealth) checks that rely on moving silently.
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "stealth-silent",
      },
    ],
    source: "SRD",
  },
  {
    id: "ring-of-protection",
    rarity: "rare",
    type: "ring",
    attunement: true,
    price: "3500 GP",
    properties: ["+1 AC", "+1 saves"],
    // +1 AC (ref.acBonus → computeAC) + +1 to ALL saving throws (newly wired).
    grants: [
      { type: "ac-bonus", amount: 1 },
      { type: "save-bonus", amount: 1 },
    ],
    source: "SRD",
  },
  {
    id: "ring-of-spell-storing",
    rarity: "rare",
    type: "ring",
    attunement: true,
    price: "12000 GP",
    properties: ["spell storage: 5 levels"],
    source: "SRD",
  },
  {
    id: "ring-of-invisibility",
    rarity: "legendary",
    type: "ring",
    attunement: true,
    price: "80000 GP",
    properties: ["invisibility at will"],
    source: "SRD",
  },
  {
    id: "pearl-of-power",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1000 GP",
    properties: ["recover spell slot ≤ 3rd", "1/dawn"],
    source: "SRD",
  },
  {
    id: "winged-boots",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "2000 GP",
    properties: ["fly speed: 30 ft", "charges: 4", "recharge: 1d4 / dawn"],
    // ALL-IN: the activated Fly Speed is modeled behind a while-active toggle.
    // 2024 value = Fly 30 ft (DMG scrape; supersedes the legacy "equal to your
    // walking speed" text). Charges (4, regain 1d4/dawn) + the 1-hour duration
    // stay manual — the engine doesn't tick charges or durations.
    grants: [
      {
        type: "while-active",
        activeKey: "winged-boots",
        grants: [{ type: "fly-speed", amount: 30 }],
      },
    ],
    source: "SRD",
  },
  {
    id: "cape-of-the-mountebank",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    price: "3000 GP",
    properties: ["Dimension Door 1/dawn"],
    source: "SRD",
  },
  {
    id: "boots-of-levitation",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "4000 GP",
    properties: ["Levitate at will (self)"],
    source: "SRD",
  },
  {
    id: "stone-of-good-luck-luckstone",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1000 GP",
    properties: ["+1 ability checks", "+1 saves"],
    // +1 to ALL saving throws (save-bonus flat) AND +1 to ALL ability checks
    // (ability-check-bonus scoped "all-checks", flat). On your person — no
    // attunement gate beyond the item's own `attunement: true`.
    grants: [
      { type: "save-bonus", amount: 1 },
      { type: "ability-check-bonus", appliesTo: "all-checks", value: 1 },
    ],
    source: "SRD",
  },
  {
    id: "periapt-of-wound-closure",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    price: "1000 GP",
    properties: ["auto-stabilize", "double Hit Dice healing"],
    source: "SRD",
  },
  {
    id: "necklace-of-fireballs",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    price: "3000 GP",
    properties: ["charges: 1d6+3", "8d6 fire per bead", "DC 15 DEX"],
    source: "SRD",
  },
  {
    id: "staff-of-power",
    rarity: "very-rare",
    type: "staff",
    attunement: true,
    price: "60000 GP",
    properties: ["+2 bonus", "+2 AC", "+2 saves", "charges: 20", "retributive strike"],
    // While holding: +2 AC (ref.acBonus → computeAC), +2 to ALL saves
    // (save-bonus flat), and +2 to spell attack rolls (spell-attack-bonus, all
    // classes). The +2 quarterstaff enchant rides the weapon pipeline; the 20
    // charges of stored spells + Retributive Strike stay manual.
    grants: [
      { type: "ac-bonus", amount: 2 },
      { type: "save-bonus", amount: 2 },
      { type: "spell-attack-bonus", amount: 2, scope: "all" },
    ],
    source: "SRD",
  },
  {
    id: "staff-of-the-magi",
    rarity: "legendary",
    type: "staff",
    attunement: true,
    price: "200000 GP",
    properties: [
      "+2 spell attacks",
      "charges: 50",
      "advantage vs spells",
      "spell absorption",
    ],
    source: "SRD",
  },
  {
    id: "mantle-of-spell-resistance",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    price: "12000 GP",
    properties: ["advantage on saves vs spells"],
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "spells",
      },
    ],
    source: "SRD",
  },
  // ============================================================
  // Scrolls & Misc (5)
  // ============================================================
  {
    id: "spell-scroll",
    rarity: "common",
    type: "scroll",
    attunement: false,
    properties: ["single use", "DC varies by spell level"],
    source: "SRD",
  },
  {
    id: "deck-of-many-things",
    rarity: "legendary",
    type: "wondrous",
    attunement: false,
    price: "100000 GP",
    properties: ["draw 1-5 cards", "permanent effects"],
    source: "SRD",
  },
  {
    id: "portable-hole",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    price: "8000 GP",
    properties: ["capacity: 10 ft deep cylinder", "extradimensional"],
    source: "SRD",
  },
  {
    id: "bag-of-tricks",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    price: "500 GP",
    properties: ["summon beast", "uses: 3/dawn"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bead-of-nourishment (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bead-of-nourishment",
    rarity: "common",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:figurine-of-wondrous-power (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "figurine-of-wondrous-power",
    rarity: "common",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ammunition-1-2-or-3 (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ammunition-1-2-or-3",
    rarity: "uncommon",
    type: "weapon",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:amulet-of-proof-against-detection-and-location (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "amulet-of-proof-against-detection-and-location",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:boots-of-striding-and-springing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "boots-of-striding-and-springing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // "Speed becomes 30 feet unless your Speed is higher" is modeled as a
    // `speed-floor` grant — a MAX (not a flat add, which would wrongly stack a
    // +30 onto a 30-ft base to 60), so a ≤30-ft base floors to 30 and a higher
    // base is untouched. The carry-weight / Heavy-Armor reduction exemption +
    // the 30-ft jump stay descriptive (no engine mechanic).
    grants: [{ type: "speed-floor", minFt: 30 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:boots-of-the-winterlands (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "boots-of-the-winterlands",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Cold resistance is modeled; the temperature tolerance + ice/snow
    // Difficult-Terrain clauses stay descriptive (no engine mechanic).
    grants: [{ type: "damage-resistance", damageType: "cold" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bracers-of-archery (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bracers-of-archery",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Longbow + Shortbow proficiency is modeled (unioned into the equipment /
    // attack proficiency list). The +2 damage bonus rides the attack pipeline
    // and stays descriptive.
    grants: [
      { type: "weapon-proficiency", proficiency: asProficiencyToken("longbows") },
      { type: "weapon-proficiency", proficiency: asProficiencyToken("shortbows") },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:brooch-of-shielding (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "brooch-of-shielding",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Force resistance is modeled; the Magic-Missile-only immunity is a
    // spell-specific carve-out the engine doesn't model (stays descriptive).
    grants: [{ type: "damage-resistance", damageType: "force" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:broom-of-flying (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "broom-of-flying",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — riding the hovering broom is a toggle: Fly
    // Speed 50 while astride (the 30-ft heavy-load reduction + autonomous
    // travel stay descriptive). Same while-active pattern as Boots of Speed.
    grants: [
      {
        type: "while-active",
        activeKey: "broom-of-flying",
        grants: [{ type: "fly-speed", amount: 50 }],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:circlet-of-blasting (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "circlet-of-blasting",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:cloak-of-the-manta-ray (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "cloak-of-the-manta-ray",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Swim Speed 60 ft. The underwater-breathing clause has no engine field and
    // stays descriptive.
    grants: [{ type: "swim-speed", amount: 60 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:decanter-of-endless-water (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "decanter-of-endless-water",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:deck-of-illusions (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "deck-of-illusions",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dust-of-disappearance (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dust-of-disappearance",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dust-of-dryness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dust-of-dryness",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dust-of-sneezing-and-choking (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dust-of-sneezing-and-choking",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:elemental-gem (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "elemental-gem",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:eversmoking-bottle (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "eversmoking-bottle",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:eyes-of-charming (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "eyes-of-charming",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-25 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    // S9 — single-fixed-spell caster (NON-wand wondrous; IDENTICAL mechanic to the
    // wand family). RAW: "expend 1 or more charges to cast Charm Person (save DC 13)
    // … the lenses regain all expended charges daily at dawn" (3-charge pool). Same
    // pair as Wand of Magic Missiles (which is likewise upcastable): the
    // `always-prepared-spell` surfaces the cast; the `free-cast-spell` debits the
    // `eyes-of-charming` charge tracker. The per-charge UPCAST ("increase the level
    // by one per extra charge") stays the player's manual spend, exactly as for the
    // upcastable wands — only the base CAST affordance + the charge pool are modeled.
    grants: [
      { type: "always-prepared-spell", spellId: "charm-person" },
      {
        type: "free-cast-spell",
        spellId: "charm-person",
        chargesPerRest: 3,
        rest: "long",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:eyes-of-minute-seeing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "eyes-of-minute-seeing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:eyes-of-the-eagle (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "eyes-of-the-eagle",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    // Advantage on Wisdom (Perception) checks that rely on sight. The "see fine
    // detail at great distance" flavor is descriptive (no engine mechanic).
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "perception-sight",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:gem-of-brightness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "gem-of-brightness",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 50"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:gloves-of-missile-snaring (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "gloves-of-missile-snaring",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:gloves-of-swimming-and-climbing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "gloves-of-swimming-and-climbing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Climb + Swim Speed equal to walking speed. The +5 to climb/swim-specific
    // Athletics checks is a situational sub-skill bonus the engine doesn't model
    // (Athletics is one skill; this only applies to the climb/swim use of it),
    // so it stays descriptive.
    grants: [
      { type: "climb-speed", amount: "equal-to-walking" },
      { type: "swim-speed", amount: "equal-to-walking" },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:gloves-of-thievery (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "gloves-of-thievery",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    // +5 flat bonus scoped to the Sleight of Hand skill (DEX check). Rendered by
    // `resolveAbilityCheckBonus` (appliesTo === skillId), additive, override-safe.
    grants: [{ type: "ability-check-bonus", appliesTo: "sleight-of-hand", value: 5 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:goggles-of-night (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "goggles-of-night",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    // Darkvision 60 ft. The "+60 ft if you already have Darkvision" clause is
    // NOT modeled: the engine merges darkvision by MAX (a 120-ft natural sense
    // wins, a 60-ft one is matched), not by stacking — the racial-stack bonus
    // stays descriptive. The flat 60-ft grant covers the common case (a species
    // without Darkvision gaining it).
    grants: [{ type: "darkvision", range: 60 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:hat-of-disguise (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "hat-of-disguise",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:helm-of-comprehending-languages (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "helm-of-comprehending-languages",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:helm-of-telepathy (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "helm-of-telepathy",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:immovable-rod (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "immovable-rod",
    rarity: "uncommon",
    type: "rod",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:lantern-of-revealing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "lantern-of-revealing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:medallion-of-thoughts (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "medallion-of-thoughts",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 5"],
    // S9 — single-fixed-spell caster (NON-wand wondrous; IDENTICAL mechanic to the
    // wand family). RAW: "expend 1 charge to cast Detect Thoughts (save DC 13) from
    // it; the medallion regains 1d4 expended charges daily at dawn" (5-charge pool).
    // Same pair as the wands: `always-prepared-spell` surfaces the cast on the Play
    // board; `free-cast-spell` debits the `medallion-of-thoughts` charge tracker;
    // `rest: "long"` models the dawn cadence (the 1d4 recharge die is prose).
    grants: [
      { type: "always-prepared-spell", spellId: "detect-thoughts" },
      {
        type: "free-cast-spell",
        spellId: "detect-thoughts",
        chargesPerRest: 5,
        rest: "long",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:necklace-of-adaptation (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "necklace-of-adaptation",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Advantage on saves vs the Poisoned condition is modeled; the "breathe in
    // any environment" clause stays descriptive (no engine mechanic).
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "poisoned",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:periapt-of-health (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "periapt-of-health",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Advantage on saves vs Poisoned is modeled; the 1/dawn 2d4+2 heal stays
    // descriptive (a dice-based, charge-gated heal — no engine mechanic).
    grants: [
      {
        type: "advantage-on",
        rollType: "save",
        vs: "poisoned",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:pipes-of-haunting (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "pipes-of-haunting",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:pipes-of-the-sewers (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "pipes-of-the-sewers",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-animal-friendship (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-animal-friendship",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
];

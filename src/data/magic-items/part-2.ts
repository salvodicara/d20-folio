import type { SrdMagicItemData } from "../types";
import { RESISTANCE_TYPE_BUNDLE } from "./_resistance";

export const MAGIC_ITEMS_PART_2: SrdMagicItemData[] = [
  {
    // Phase E ingestion — magic-item:potion-of-poison (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-poison",
    rarity: "uncommon",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-jumping (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-jumping",
    rarity: "uncommon",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-mind-shielding (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-mind-shielding",
    rarity: "uncommon",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-swimming (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-swimming",
    rarity: "uncommon",
    type: "ring",
    attunement: false,
    grants: [{ type: "swim-speed", amount: 40 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-warmth (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-warmth",
    rarity: "uncommon",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-water-walking (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-water-walking",
    rarity: "uncommon",
    type: "ring",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:robe-of-useful-items (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "robe-of-useful-items",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rope-of-climbing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rope-of-climbing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sending-stones (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sending-stones",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sentinel-shield (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sentinel-shield",
    rarity: "uncommon",
    type: "armor",
    attunement: false,
    // Advantage on Initiative rolls + Wisdom (Perception) checks (the +2 AC of
    // the shield base rides the armor pipeline; this item is a shield).
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
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:slippers-of-spider-climbing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "slippers-of-spider-climbing",
    rarity: "uncommon",
    type: "wondrous",
    attunement: true,
    // Climb Speed equal to walking speed. The "no slippery surfaces" caveat
    // stays descriptive (situational, DM-adjudicated).
    grants: [{ type: "climb-speed", amount: "equal-to-walking" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-the-python (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-the-python",
    rarity: "uncommon",
    type: "staff",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:trident-of-fish-command (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "trident-of-fish-command",
    rarity: "uncommon",
    type: "weapon",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ],
    // The "Beast with a Swim Speed" target restriction remains table-facing;
    // the cast cost and exact 1d3 dawn recovery are engine-owned.
    grants: [
      { type: "always-prepared-spell", spellId: "dominate-beast" },
      {
        type: "free-cast-spell",
        spellId: "dominate-beast",
        resourceCost: { resourceId: "charges" },
        castOverrides: { saveDC: 15 },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-magic-detection (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-magic-detection",
    rarity: "uncommon",
    type: "wand",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ],
    grants: [
      { type: "always-prepared-spell", spellId: "detect-magic" },
      {
        type: "free-cast-spell",
        spellId: "detect-magic",
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-magic-missiles (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-magic-missiles",
    rarity: "uncommon",
    type: "wand",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [
                {
                  kind: "set-item-disposition",
                  disposition: "destroyed",
                },
              ],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Magic Missile can be cast at levels 1–3 for 1–3 charges. The paired
    // prepared grant surfaces it for any wielder without copying it into spells[].
    grants: [
      { type: "always-prepared-spell", spellId: "magic-missile" },
      {
        type: "free-cast-spell",
        spellId: "magic-missile",
        resourceCost: { resourceId: "charges" },
        castLevels: [
          { level: 1, cost: 1 },
          { level: 2, cost: 2 },
          { level: 3, cost: 3 },
        ],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-secrets (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-secrets",
    rarity: "uncommon",
    type: "wand",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-the-war-mage-1-2-or-3 (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-the-war-mage-1-2-or-3",
    rarity: "uncommon",
    type: "wand",
    attunement: true,
    // Uncommon variant = +1 to spell attack rolls (Rare +2 / Very Rare +3 are
    // the same item at higher rarity — this row is uncommon). Scoped to ALL
    // spells. The "ignore Half Cover on spell attacks" clause stays descriptive
    // (no cover model in the engine).
    grants: [{ type: "spell-attack-bonus", amount: 1, scope: "all" }],
    source: "SRD",
  },
  {
    // Rare (+2) tier of magic-item:wand-of-the-war-mage-1-2-or-3.
    id: "wand-of-the-war-mage-plus-2",
    rarity: "rare",
    type: "wand",
    attunement: true,
    grants: [{ type: "spell-attack-bonus", amount: 2, scope: "all" }],
    source: "SRD",
  },
  {
    // Very Rare (+3) tier of magic-item:wand-of-the-war-mage-1-2-or-3.
    id: "wand-of-the-war-mage-plus-3",
    rarity: "very-rare",
    type: "wand",
    attunement: true,
    grants: [{ type: "spell-attack-bonus", amount: 3, scope: "all" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-web (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-web",
    rarity: "uncommon",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Web spends 1 charge; dawn recovery and last-charge destruction are exact
    // typed facts rather than long-rest aliases.
    grants: [
      { type: "always-prepared-spell", spellId: "web" },
      {
        type: "free-cast-spell",
        spellId: "web",
        resourceCost: { resourceId: "charges" },
        castOverrides: { saveDC: 13 },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:weapon-of-warning (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "weapon-of-warning",
    rarity: "uncommon",
    type: "weapon",
    attunement: true,
    // The wielder's own Advantage on Initiative (Supernatural Readiness) is
    // modeled (mirrors Sentinel Shield / Helm of Awareness). The 30-ft ally aura
    // + Alarm awaken-sleepers half stay narrative.
    grants: [
      {
        type: "advantage-on",
        rollType: "check",
        vs: "initiative",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wind-fan (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wind-fan",
    rarity: "uncommon",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  // ============================================================
  // Phase E — Wiki ingestion: Rare (72)
  // ============================================================
  // Source: wiki dnd2024.wikidot.com (non-SRD 2024 PHB content).
  // IT translations marked '// AI-translated, no authoritative IT source
  // found' — to be replaced when authoritative IT terms become available.

  {
    // Phase E ingestion — magic-item:armor-of-resistance (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "armor-of-resistance",
    rarity: "rare",
    type: "armor",
    attunement: true,
    // Choose which of the 10 damage types this armor resists (DM-assigned at
    // creation; modeled as a single-select bundle the player picks once).
    grants: [RESISTANCE_TYPE_BUNDLE("armor-of-resistance")],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:armor-of-vulnerability (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "armor-of-vulnerability",
    rarity: "rare",
    type: "armor",
    attunement: true,
    // Cursed: attuning always curses you, so each picked type grants Resistance
    // to it AND Vulnerability to the other two B/P/S types (the curse is
    // permanent while worn). Modeled as a single-select chooser; the
    // Remove-Curse escape stays descriptive.
    grants: [
      {
        type: "choice-grant-bundle",
        bundleKey: "armor-of-vulnerability-type",
        options: [
          {
            id: "bludgeoning",
            grants: [
              { type: "damage-resistance", damageType: "bludgeoning" },
              { type: "damage-vulnerability", damageType: "piercing" },
              { type: "damage-vulnerability", damageType: "slashing" },
            ],
          },
          {
            id: "piercing",
            grants: [
              { type: "damage-resistance", damageType: "piercing" },
              { type: "damage-vulnerability", damageType: "bludgeoning" },
              { type: "damage-vulnerability", damageType: "slashing" },
            ],
          },
          {
            id: "slashing",
            grants: [
              { type: "damage-resistance", damageType: "slashing" },
              { type: "damage-vulnerability", damageType: "bludgeoning" },
              { type: "damage-vulnerability", damageType: "piercing" },
            ],
          },
        ],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:arrow-catching-shield (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "arrow-catching-shield",
    rarity: "rare",
    type: "armor",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bag-of-beans (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bag-of-beans",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bead-of-force (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bead-of-force",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:belt-of-dwarvenkind (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "belt-of-dwarvenkind",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // Senses milestone: Darkvision 60 ft + Resilience (poison resistance + save
    // advantage) RAW only grant "if you aren't a dwarf or duergar"; the engine
    // doesn't read species, so both grants are flat — darkvision is harmless
    // (merges by MAX, a dwarf's 60-ft+ sense already wins) and poison
    // resistance/advantage are a pure bonus with no dwarf-specific downside.
    // PROSE-SWEPT 2026-06-10 — Toughness (+2 CON, max 20) and the Dwarvish
    // language were hidden in prose; both are standing while-attuned stats.
    // Friend of Dwarvenkind (Persuasion advantage vs dwarves) is situational —
    // descriptive.
    grants: [
      { type: "darkvision", range: 60 },
      { type: "ability-score", ability: "CON", amount: 2, cap: 20 },
      { type: "language", language: "Dwarvish" },
      { type: "damage-resistance", damageType: "poison" },
      { type: "advantage-on", rollType: "save", vs: "poisoned" },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:berserker-axe (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "berserker-axe",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    // "Hit Point maximum increases by 1 for each level you have attained" while
    // attuned is modeled via hp-per-level (the evaluator multiplies amount by
    // character level). The +1 attack/damage rides the attack seam; the curse /
    // berserk DC-15 WIS save stay narrative.
    grants: [{ type: "hp-per-level", amount: 1 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bowl-of-commanding-water-elementals (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bowl-of-commanding-water-elementals",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:brazier-of-commanding-fire-elementals (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "brazier-of-commanding-fire-elementals",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:censer-of-controlling-air-elementals (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "censer-of-controlling-air-elementals",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:chime-of-opening (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "chime-of-opening",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dimensional-shackles (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dimensional-shackles",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:elixir-of-health (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "elixir-of-health",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:folding-boat (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "folding-boat",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:gem-of-seeing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "gem-of-seeing",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:helm-of-teleportation (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "helm-of-teleportation",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ],
    grants: [
      { type: "always-prepared-spell", spellId: "teleport" },
      {
        type: "free-cast-spell",
        spellId: "teleport",
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:horn-of-blasting (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "horn-of-blasting",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:horseshoes-of-speed (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "horseshoes-of-speed",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:mace-of-disruption (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "mace-of-disruption",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:mace-of-smiting (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "mace-of-smiting",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:mace-of-terror (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "mace-of-terror",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:necklace-of-prayer-beads (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "necklace-of-prayer-beads",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:oil-of-etherealness (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "oil-of-etherealness",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:periapt-of-proof-against-poison (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "periapt-of-proof-against-poison",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    grants: [
      { type: "damage-immunity", damageType: "poison" },
      { type: "condition-immunity", condition: "poisoned" },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-clairvoyance (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-clairvoyance",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-diminution (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-diminution",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-heroism (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-heroism",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-invulnerability (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-invulnerability",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:potion-of-mind-reading (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "potion-of-mind-reading",
    rarity: "rare",
    type: "potion",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-animal-influence (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-animal-influence",
    rarity: "rare",
    type: "ring",
    attunement: false,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 3 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 3 } },
          },
        ],
      },
    ],
    // All three spells spend 1 charge. Fear's Beast-only target restriction stays
    // table-facing; the exact shared pool and fixed save DC are engine-owned.
    grants: [
      { type: "always-prepared-spell", spellId: "animal-friendship" },
      { type: "always-prepared-spell", spellId: "fear" },
      { type: "always-prepared-spell", spellId: "speak-with-animals" },
      {
        type: "free-cast-from-list",
        spellIds: ["animal-friendship", "fear", "speak-with-animals"],
        castOverrides: { saveDC: 13 },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-evasion (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-evasion",
    rarity: "rare",
    type: "ring",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-feather-falling (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-feather-falling",
    rarity: "rare",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-free-action (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-free-action",
    rarity: "rare",
    type: "ring",
    attunement: true,
    // RAW only blocks MAGIC-caused Paralyzed/Restrained; the engine models a
    // blanket immunity (it doesn't track condition source). The "magic can't
    // reduce Speed" / Difficult-Terrain clauses stay descriptive.
    grants: [
      { type: "condition-immunity", condition: "paralyzed" },
      { type: "condition-immunity", condition: "restrained" },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-the-ram (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-the-ram",
    rarity: "rare",
    type: "ring",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:ring-of-x-ray-vision (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "ring-of-x-ray-vision",
    rarity: "rare",
    type: "ring",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:robe-of-eyes (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "robe-of-eyes",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // Darkvision + Truesight 120 ft + Advantage on sight-based Perception. The
    // Light/Daylight Blinded drawback is situational (DM-triggered) and stays
    // descriptive.
    grants: [
      { type: "darkvision", range: 120 },
      { type: "truesight", range: 120 },
      {
        type: "advantage-on",
        rollType: "check",
        vs: "perception-sight",
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rod-of-rulership (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rod-of-rulership",
    rarity: "rare",
    type: "rod",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:rope-of-entanglement (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "rope-of-entanglement",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:shield-of-missile-attraction (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "shield-of-missile-attraction",
    rarity: "rare",
    type: "armor",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — "Resistance to damage from attacks made with
    // Ranged weapons" is a SOURCE-keyed resistance (the Abjurer Spell
    // Resistance shape); the union gained "ranged-weapon" for it. The curse's
    // retargeting stays descriptive.
    grants: [{ type: "damage-resistance-source", source: "ranged-weapon" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-charming (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-charming",
    rarity: "rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 10"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 10 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 8, modifier: 2 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // The three spells all spend 1 charge. Reflect Enchantment remains a reaction
    // authoring gap; its spend must eventually bind this same physical-item pool.
    grants: [
      { type: "always-prepared-spell", spellId: "charm-person" },
      { type: "always-prepared-spell", spellId: "command" },
      { type: "always-prepared-spell", spellId: "comprehend-languages" },
      {
        type: "free-cast-from-list",
        spellIds: ["charm-person", "command", "comprehend-languages"],
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-healing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-healing",
    rarity: "rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 10"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 10 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 4 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Cure Wounds levels 1–4 cost their cast level; the fixed-cost spells share
    // the same physical-item pool through the list-pool sibling.
    grants: [
      { type: "always-prepared-spell", spellId: "cure-wounds" },
      { type: "always-prepared-spell", spellId: "lesser-restoration" },
      { type: "always-prepared-spell", spellId: "mass-cure-wounds" },
      {
        type: "free-cast-spell",
        spellId: "cure-wounds",
        resourceCost: { resourceId: "charges" },
        castLevels: [
          { level: 1, cost: 1 },
          { level: 2, cost: 2 },
          { level: 3, cost: 3 },
          { level: 4, cost: 4 },
        ],
      },
      {
        type: "free-cast-from-list",
        spellIds: ["lesser-restoration", "mass-cure-wounds"],
        spellCosts: { "lesser-restoration": 2, "mass-cure-wounds": 5 },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-swarming-insects (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-swarming-insects",
    rarity: "rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 10"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 10 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 4 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    grants: [
      { type: "always-prepared-spell", spellId: "giant-insect" },
      { type: "always-prepared-spell", spellId: "insect-plague" },
      {
        type: "free-cast-from-list",
        spellIds: ["giant-insect", "insect-plague"],
        spellCosts: { "giant-insect": 4, "insect-plague": 5 },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-the-woodlands (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-the-woodlands",
    rarity: "rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose, and
    // "+2 bonus to spell attack rolls while holding it" is a standing stat
    // (the quarterstaff's own +2 attack/damage stays the item-bound weapon
    // bonus model gap — per-weapon attackBonusOverride is the seam today).
    properties: ["charges: 6"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 6 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: { kind: "entered-roll", roll: { dice: 1, sides: 6 } },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "nonmagical" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    grants: [
      { type: "spell-attack-bonus", amount: 2, scope: "all" },
      { type: "always-prepared-spell", spellId: "animal-friendship" },
      { type: "always-prepared-spell", spellId: "awaken" },
      { type: "always-prepared-spell", spellId: "barkskin" },
      { type: "always-prepared-spell", spellId: "locate-animals-or-plants" },
      { type: "always-prepared-spell", spellId: "pass-without-trace" },
      { type: "always-prepared-spell", spellId: "speak-with-animals" },
      { type: "always-prepared-spell", spellId: "speak-with-plants" },
      { type: "always-prepared-spell", spellId: "wall-of-thorns" },
      {
        type: "free-cast-from-list",
        spellIds: [
          "animal-friendship",
          "awaken",
          "barkskin",
          "locate-animals-or-plants",
          "pass-without-trace",
          "speak-with-animals",
          "speak-with-plants",
          "wall-of-thorns",
        ],
        spellCosts: {
          "animal-friendship": 1,
          awaken: 5,
          barkskin: 2,
          "locate-animals-or-plants": 2,
          "pass-without-trace": 2,
          "speak-with-animals": 1,
          "speak-with-plants": 3,
          "wall-of-thorns": 6,
        },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:staff-of-withering (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "staff-of-withering",
    rarity: "rare",
    type: "staff",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 3"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:stone-of-controlling-earth-elementals (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "stone-of-controlling-earth-elementals",
    rarity: "rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sword-of-life-stealing (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sword-of-life-stealing",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:sword-of-wounding (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "sword-of-wounding",
    rarity: "rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:vicious-weapon (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "vicious-weapon",
    rarity: "rare",
    type: "weapon",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-binding (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-binding",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Hold Monster costs 5 charges; Hold Person costs 2. Recovery and the
    // last-charge d20 consequence are exact typed facts.
    grants: [
      { type: "always-prepared-spell", spellId: "hold-monster" },
      { type: "always-prepared-spell", spellId: "hold-person" },
      {
        type: "free-cast-from-list",
        spellIds: ["hold-monster", "hold-person"],
        spellCosts: { "hold-monster": 5, "hold-person": 2 },
        castOverrides: { saveDC: 17 },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-enemy-detection (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-enemy-detection",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-fear (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-fear",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Command costs 1 charge; Fear costs 3. The command-word and cone constraints
    // remain table-facing; recovery and depletion are typed.
    grants: [
      { type: "always-prepared-spell", spellId: "command" },
      { type: "always-prepared-spell", spellId: "fear" },
      {
        type: "free-cast-from-list",
        spellIds: ["command", "fear"],
        spellCosts: { command: 1, fear: 3 },
        castOverrides: { saveDC: 15 },
        resourceCost: { resourceId: "charges" },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-fireballs (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-fireballs",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Fireball levels 3–5 cost 1–3 charges through the shared cast picker.
    grants: [
      { type: "always-prepared-spell", spellId: "fireball" },
      {
        type: "free-cast-spell",
        spellId: "fireball",
        resourceCost: { resourceId: "charges" },
        castOverrides: { saveDC: 15 },
        castLevels: [
          { level: 3, cost: 1 },
          { level: 4, cost: 2 },
          { level: 5, cost: 3 },
        ],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-lightning-bolts (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-lightning-bolts",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    resources: [
      {
        kind: "counter",
        id: "charges",
        unit: "charges",
        capacity: { kind: "fixed", amount: 7 },
        initial: { kind: "full" },
        recoveries: [
          {
            trigger: { kind: "dawn" },
            amount: {
              kind: "entered-roll",
              roll: { dice: 1, sides: 6, modifier: 1 },
            },
          },
        ],
        onEmpty: {
          kind: "entered-d20",
          bands: [
            {
              min: 1,
              max: 1,
              outcomes: [{ kind: "set-item-disposition", disposition: "destroyed" }],
            },
            { min: 2, max: 20, outcomes: [] },
          ],
        },
      },
    ],
    // Lightning Bolt levels 3–5 cost 1–3 charges through the same picker.
    grants: [
      { type: "always-prepared-spell", spellId: "lightning-bolt" },
      {
        type: "free-cast-spell",
        spellId: "lightning-bolt",
        resourceCost: { resourceId: "charges" },
        castOverrides: { saveDC: 15 },
        castLevels: [
          { level: 3, cost: 1 },
          { level: 4, cost: 2 },
          { level: 5, cost: 3 },
        ],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-paralysis (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-paralysis",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wand-of-wonder (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wand-of-wonder",
    rarity: "rare",
    type: "wand",
    attunement: true,
    // PROSE-SWEPT 2026-06-10 — the charge counter was hidden in prose.
    properties: ["charges: 7"],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:wings-of-flying (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "wings-of-flying",
    rarity: "rare",
    type: "wondrous",
    attunement: true,
    // ALL-IN: the activated wings are modeled behind a timed while-active
    // toggle. Fly 60 ft. The variable 1d12-hour cooldown is a manual-recovery
    // tracker: the table rolls it, and the app never fabricates elapsed time.
    grants: [
      {
        type: "while-active",
        activeKey: "wings-of-flying",
        activation: {
          action: "action",
          // The 1d12-hour recharge is rolled at the table; `manual` prevents a
          // rest from pretending that variable real time has elapsed.
          tracker: { total: "1", recovery: "manual" },
        },
        duration: { kind: "timed", minutes: 60, maxRounds: 600 },
        grants: [{ type: "fly-speed", amount: 60 }],
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:amulet-of-the-planes (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "amulet-of-the-planes",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:animated-shield (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "animated-shield",
    rarity: "very-rare",
    type: "armor",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:bag-of-devouring (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "bag-of-devouring",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:carpet-of-flying (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "carpet-of-flying",
    rarity: "very-rare",
    type: "wondrous",
    attunement: false,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:cloak-of-arachnida (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "cloak-of-arachnida",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    resources: [
      {
        kind: "counter",
        id: "uses",
        unit: "uses",
        capacity: { kind: "fixed", amount: 1 },
        initial: { kind: "full" },
        recoveries: [{ trigger: { kind: "dawn" }, amount: { kind: "full" } }],
      },
    ],
    // Poison Resistance + Spider Climb are always on while worn. The once-per-
    // dawn Web cast rides the standard item free-cast pool; only the doubled-area
    // geometry and Spider Walk remain table-facing.
    grants: [
      { type: "damage-resistance", damageType: "poison" },
      { type: "climb-speed", amount: "equal-to-walking" },
      { type: "always-prepared-spell", spellId: "web" },
      {
        type: "free-cast-spell",
        spellId: "web",
        resourceCost: { resourceId: "uses" },
        castOverrides: { saveDC: 13 },
      },
    ],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:crystal-ball (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "crystal-ball",
    rarity: "very-rare",
    type: "wondrous",
    attunement: true,
    grants: [{ type: "at-will-cast-spell", spellId: "scrying" }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dancing-sword (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dancing-sword",
    rarity: "very-rare",
    type: "weapon",
    attunement: true,
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:demon-armor (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "demon-armor",
    rarity: "very-rare",
    type: "armor",
    attunement: true,
    properties: ["+1 AC"],
    // +1 AC (ref.acBonus → computeAC). The Abyssal language, the 1d8-Slashing /
    // +1 Unarmed Strike enchant, and the curse (Disadvantage vs demons) stay
    // descriptive — the curse is not a deterministic always-on numeric.
    grants: [{ type: "ac-bonus", amount: 1 }],
    source: "SRD",
  },
  {
    // Phase E ingestion — magic-item:dragon-scale-mail (wiki provenance).
    // IT translation: pattern-based, mark for owner review if a more authoritative term exists.
    id: "dragon-scale-mail",
    rarity: "very-rare",
    type: "armor",
    attunement: true,
    properties: ["+1 AC", "advantage on saves vs dragon breath"],
    // +1 AC (ref.acBonus → computeAC, mirrored by the ac-bonus grant for parity)
    // + Advantage on saves vs Dragon breath weapons + a single-select chooser
    // over the ten dragon colors for the damage Resistance. The dragon-sense
    // Magic action (1/dawn) stays descriptive.
    grants: [
      { type: "ac-bonus", amount: 1 },
      {
        type: "advantage-on",
        rollType: "save",
        vs: "dragon-breath",
      },
      {
        type: "choice-grant-bundle",
        bundleKey: "dragon-scale-mail-ancestry",
        options: [
          {
            id: "black",
            grants: [{ type: "damage-resistance", damageType: "acid" }],
          },
          {
            id: "blue",
            grants: [{ type: "damage-resistance", damageType: "lightning" }],
          },
          {
            id: "brass",
            grants: [{ type: "damage-resistance", damageType: "fire" }],
          },
          {
            id: "bronze",
            grants: [{ type: "damage-resistance", damageType: "lightning" }],
          },
          {
            id: "copper",
            grants: [{ type: "damage-resistance", damageType: "acid" }],
          },
          {
            id: "gold",
            grants: [{ type: "damage-resistance", damageType: "fire" }],
          },
          {
            id: "green",
            grants: [{ type: "damage-resistance", damageType: "poison" }],
          },
          {
            id: "red",
            grants: [{ type: "damage-resistance", damageType: "fire" }],
          },
          {
            id: "silver",
            grants: [{ type: "damage-resistance", damageType: "cold" }],
          },
          {
            id: "white",
            grants: [{ type: "damage-resistance", damageType: "cold" }],
          },
        ],
      },
    ],
    source: "SRD",
  },
];

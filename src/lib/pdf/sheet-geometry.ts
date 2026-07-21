/**
 * Measured geometry of the official D&D 2024 character sheet — the functional
 * FORM layout only (panel boxes, field anchors, table columns, the ability-block
 * stacking rule), in pdf-lib's coordinate space (origin bottom-left, y up,
 * 603×774 pt). This is what makes the export a faithful recreation: the renderer
 * (`character-pdf.ts`) draws its scaffold + places values at these coordinates,
 * so the result is geometrically indistinguishable from the official sheet.
 *
 * This file is PURE NUMERIC DATA — there are NO display strings here. Every label
 * the sheet prints is resolved through an i18n key by the view-model
 * (`character-pdf-view.ts`); this module only says *where* each element sits, the
 * functional skeleton a form layout is. Stable semantic ids (ability codes, field
 * keys) are ids, not localized text. No WotC artwork, logo, or font is reproduced
 * — only the measured positions of a functional form, re-drawn from scratch.
 *
 * Coordinates were measured from the official PDF; values are the box/anchor
 * positions, not copied content.
 */
import type { AbilityCode } from "@/data/types";

export const PAGE = { w: 603, h: 774 } as const;

/** A rounded rectangle (lower-left x/y, size, corner radius). */
export interface RRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

/** A caption/value anchor: baseline position (+ optional right edge for r-align). */
export interface Anchor {
  x: number;
  y: number;
  /** Right edge, when the value/caption is right-aligned or centered in a span. */
  x2?: number;
}

/** A refined double-rule page border (a thin outer rule + an inner rule with a
 *  deliberate gap, smaller radius) — reads as fine stationery, not a fuzzy box. */
export const FRAME = { x: 9, y: 9, w: 585, h: 756, r: 12 } as const;
export const FRAME_OUTER = { x: 6, y: 6, w: 591, h: 762, r: 14 } as const;

// ════════════════════════ PAGE 1 — the main sheet ════════════════════════
//
// Header band (three panels across the top), a secondary stat bar, the six
// ability blocks in two columns with each ability's skills grouped beneath it,
// and the right-hand content panels (weapons/cantrips, class features, species
// traits, feats, equipment training).

export const P1 = {
  /** Identity panel: name + class/level + species/subclass + background. */
  identity: { x: 9.4, y: 689.4, w: 249.6, h: 75.2, r: 9 },
  identityFields: {
    name: { x: 24.9, y: 735.5 } as Anchor, // caption; value drawn above it
    nameValue: { x: 24, y: 745 } as Anchor,
    background: { x: 24.9, y: 714 } as Anchor,
    backgroundValue: { x: 24, y: 723 } as Anchor,
    class: { x: 148.8, y: 714 } as Anchor,
    classValue: { x: 148, y: 723 } as Anchor,
    species: { x: 24.8, y: 692.4 } as Anchor,
    speciesValue: { x: 24, y: 701 } as Anchor,
    subclass: { x: 148.6, y: 692.4 } as Anchor,
    subclassValue: { x: 148, y: 701 } as Anchor,
  },
  /** Level + XP panel (laid out by the renderer). */
  levelXp: { x: 247.3, y: 691.9, w: 58.3, h: 68.4, r: 9 },
  /** Armor Class + shield panel (laid out by the renderer). */
  ac: { x: 313.6, y: 689.9, w: 51.6, h: 72.1, r: 9 },
  /** Combat panel: hit points / hit dice / death saves (laid out by the renderer). */
  combat: { x: 373.2, y: 689.4, w: 220.5, h: 75.2, r: 9 },

  /** Secondary stat bar — proficiency bonus + initiative + speed + size + passive. */
  statBar: {
    profBonus: {
      box: { x: 9.4, y: 595.8, w: 96.4, h: 66.2, r: 9 },
      label: { x: 17.4, y: 647.5 } as Anchor,
      value: { x: 9.4, y: 628, x2: 105.8 } as Anchor,
    },
    initiative: {
      box: { x: 222.4, y: 621.1, w: 80.2, h: 40.8, r: 9 },
      label: { x: 242.9, y: 649.4 } as Anchor,
      value: { x: 222.4, y: 628, x2: 302.6 } as Anchor,
    },
    speed: {
      box: { x: 313.7, y: 621.1, w: 86.4, h: 40.8, r: 9 },
      label: { x: 344.3, y: 649.4 } as Anchor,
      value: { x: 313.7, y: 628, x2: 400.1 } as Anchor,
    },
    size: {
      box: { x: 411.1, y: 621.1, w: 80.2, h: 40.8, r: 9 },
      label: { x: 443, y: 649.4 } as Anchor,
      value: { x: 411.1, y: 628, x2: 491.3 } as Anchor,
    },
    passivePerception: {
      box: { x: 502.3, y: 621.1, w: 88.6, h: 40.8, r: 9 },
      label: { x: 507.5, y: 649.4 } as Anchor,
      value: { x: 502.3, y: 628, x2: 590.9 } as Anchor,
    },
  },

  /**
   * Ability blocks — the official's FIXED, content-filled boxes (measured from
   * the sheet). Left column stacks STR → DEX → CON, right column INT → WIS → CHA;
   * each box is sized to its skill count so both columns fill the page height with
   * even gaps and ZERO dead space. The renderer lays each box out internally
   * (header band → modifier medallion + score → saving throw → skills, distributed
   * to fill) — it does not compute the stacking, it just fills these boxes.
   */
  abilities: {
    order: ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as AbilityCode[],
    boxes: {
      STR: { x: 9.4, y: 477, w: 96.4, h: 108, r: 9 },
      DEX: { x: 9.4, y: 331, w: 96.4, h: 136, r: 9 },
      CON: { x: 9.4, y: 233, w: 96.4, h: 88, r: 9 },
      INT: { x: 115.6, y: 498, w: 96.4, h: 164, r: 9 },
      WIS: { x: 115.6, y: 324, w: 96.4, h: 164, r: 9 },
      CHA: { x: 115.6, y: 164, w: 96.4, h: 150, r: 9 },
    } as Record<AbilityCode, RRect>,
  },

  /** Heroic Inspiration — bottom-left, below the Constitution block. */
  heroicInspiration: {
    box: { x: 9.4, y: 165.2, w: 96.4, h: 57.3, r: 9 },
  },

  /** Weapons & damage / cantrips table (top-right). */
  weapons: {
    box: { x: 222, y: 455.8, w: 371.7, h: 154.9 } as RRect & { r?: number },
    cols: {
      name: { x: 228.2, y: 577.9 },
      atk: { x: 336.6, y: 577.9 },
      notes: { x: 462.1, y: 577.9 },
    },
    firstRowY: 564,
    rowStep: 14,
    rows: 7,
  },

  /** Class features panel (right, middle). */
  classFeatures: {
    box: { x: 222, y: 214.7, w: 371.7, h: 231.4 } as RRect & { r?: number },
    bodyTop: 418,
    bodyLeft: 230,
    bodyRight: 586,
  },

  /** Species traits + feats panels (bottom-right pair). */
  speciesTraits: {
    box: { x: 222, y: 9.4, w: 174.9, h: 195.4 } as RRect & { r?: number },
    bodyTop: 177,
    bodyLeft: 229,
    bodyRight: 392,
  },
  feats: {
    box: { x: 406.6, y: 9.4, w: 187, h: 195.4, r: 9 },
    bodyTop: 177,
    bodyLeft: 413,
    bodyRight: 588,
  },

  /** Equipment training & proficiencies panel (laid out by the renderer). */
  equipmentTraining: {
    box: { x: 9.4, y: 9.4, w: 202.8, h: 145.8, r: 9 },
  },
} as const;

// ════════════════════════ PAGE 2 — spells + details ════════════════════════

export const P2 = {
  /** Spellcasting panel (top-left): ability + modifier + save DC + attack bonus. */
  spellcasting: {
    box: { x: 9.4, y: 645.1, w: 128.3, h: 119.5, r: 9 },
    ability: { x: 21, y: 751 } as Anchor, // "spellcasting ability" caption (panel top)
    abilityBox: { x: 14, y: 727, w: 110, h: 18, r: 3 }, // value chip, inside the panel
    abilityDivY: 723, // divider sits in the clear gap under the ability chip
    // three stat chips (h20) with even 5pt gaps, all BELOW the divider
    modifier: {
      label: { x: 56.3, y: 714.6 }, // "spellcasting modifier"
      box: { x: 13.1, y: 697, w: 33.9, h: 20, r: 4 },
      value: { x: 13.1, y: 706, x2: 47 } as Anchor,
    },
    saveDc: {
      label: { x: 56.3, y: 682.9 },
      box: { x: 13.1, y: 672, w: 33.9, h: 20, r: 4 },
      value: { x: 13.1, y: 678, x2: 47 } as Anchor,
    },
    attackBonus: {
      label: { x: 56.3, y: 659.2 }, // "spell attack bonus"
      box: { x: 13.1, y: 647, w: 33.9, h: 20, r: 4 },
      value: { x: 13.1, y: 652, x2: 47 } as Anchor,
    },
  },

  /** Spell-slots grid (top-middle): levels 1-9 in a 3×3 of total/expended cells. */
  spellSlots: {
    box: { x: 147.8, y: 645.1, w: 249.2, h: 74.5 } as RRect & { r?: number },
    // column x for each of the 3 columns; row y for each of the 3 rows
    levelLabelX: [154.8, 242.8, 321.4],
    totalX: [185, 273, 352],
    expendedX: [206, 294, 373],
    rowY: [678.9, 664.9, 650.9],
    colHeaderY: 689.7,
    // level n -> (col, row): cols hold {1,2,3},{4,5,6},{7,8,9}
  },

  /** Cantrips & prepared spells table (big left panel). */
  spells: {
    box: { x: 9.4, y: 9.4, w: 387.3, h: 626.4 } as RRect & { r?: number },
    title: { x: 138.6, y: 620.9, x2: 138.6 } as Anchor,
    cols: {
      level: { x: 19.1, y: 597.6, x2: 38 },
      name: { x: 42.4, y: 597.6 },
      time: { x: 154.7, y: 597.6 },
      range: { x: 188.8, y: 597.6 },
      crm: { x: 234.5, y: 597.6 },
      notes: { x: 305, y: 597.6 },
    },
    crmCols: { c: 249.1, r: 270.8, m: 292.5 },
    firstRowY: 584.6,
    rowStep: 19.4,
    rows: 29,
    bodyLeft: 13,
  },

  /** Right column: appearance, backstory, alignment, languages, equipment, coins. */
  appearance: {
    box: { x: 406.6, y: 666.9, w: 187, h: 97.8, r: 9 },
    body: { x: 413, top: 738, right: 588 },
  },
  backstory: {
    box: { x: 406.6, y: 463.3, w: 187, h: 193.8 } as RRect & { r?: number },
    body: { x: 413, top: 632, right: 588 },
    alignment: { label: { x: 412.7, y: 486.5 }, value: { x: 460, y: 486.5, x2: 588 } },
  },
  languages: {
    box: { x: 406.6, y: 395.2, w: 187, h: 58.3 } as RRect & { r?: number },
    body: { x: 413, top: 429, right: 588 },
  },
  equipment: {
    box: { x: 406.6, y: 115, w: 187, h: 270.5 } as RRect & { r?: number },
    body: { x: 413, top: 361, right: 588 },
    attunement: { label: { x: 412.7, y: 178.2 }, top: 168 },
  },
  coins: {
    box: { x: 406.6, y: 26.5, w: 187, h: 78.6, r: 9 },
    cols: {
      cp: { x: 415.4, y: 47, w: 25.9, h: 26.4, labelX: 424.3 },
      sp: { x: 451.2, y: 47, w: 25.9, h: 26.4, labelX: 460.4 },
      ep: { x: 486.7, y: 47, w: 25.9, h: 26.4, labelX: 495.8 },
      gp: { x: 521.8, y: 47, w: 25.9, h: 26.4, labelX: 530.4 },
      pp: { x: 556.9, y: 47, w: 25.9, h: 26.4, labelX: 566 },
    },
    labelY: 74.8,
    valueY: 56,
  },
} as const;

// ════════════════════ PAGE 3+ — resources / trackers ledger ════════════════════
//
// The official sheet tracks class resources (Rage, Bardic Inspiration, Channel
// Divinity, Ki, Sorcery Points, magic-item charges) alongside the spell slots.
// Pages 1–2 are pixel-packed, so the resource ledger gets its own panel on an
// appended page: a header band + one row per tracker (name + die badge ·
// pips-or-count · recovery cadence). The panel is inset from the page frame and
// its HEIGHT is sized to the rows on the page (a tidy top-anchored table, not a
// page-filling empty box), so the anchors below are baselines measured DOWN from
// the panel's top edge — the renderer sits the top at `top` and computes the box
// height from the row count. A long ledger paginates onto further pages (never
// clips).

export const P3 = {
  resources: {
    /** Panel left edge, width, top edge, corner — inset clear of the page frame. */
    x: 22,
    w: 559,
    top: 752,
    r: 10,
    /** Column-caption baseline, measured DOWN from the panel top. */
    captionDrop: 24,
    /** First tracker-row baseline, measured DOWN from the panel top. */
    firstRowDrop: 42,
    rowStep: 22,
    /** Gap from the last row's rule to the box bottom. */
    bottomPad: 12,
    cols: {
      /** Tracker name column x (bold name + trailing die badge). */
      name: 37,
      /** Uses column x — pips (≤5, non-pool) or the "remaining / total" count. */
      uses: 300,
      /** Recovery-cadence column x (Short Rest / Long Rest / Dawn / Manual). */
      recovery: 470,
    },
    /** Right edge available to a name before it must clip. */
    nameRight: 292,
    /** Tracker rows one page holds before the ledger paginates. */
    rowsPerPage: 30,
  },
} as const;

/**
 * The 2024 SRD TOOL CATALOGUE — the single registry of tool ids + category
 * (+ the umbrella flag), plus the derived per-category id lists.
 *
 * NAMES LIVE IN ONE PLACE (#107). A tool is BOTH a proficiency and an equipment
 * item, and the proficiency surface used to drift from the inventory surface
 * because each named the same physical tool independently (e.g. IT "Strumenti da
 * Scasso" on the right-rail vs "Strumenti da Ladro" in the bag). To make that
 * drift class IMPOSSIBLE, this module carries NO display strings: the tool's
 * EN/IT name lives ONCE in the SRD equipment catalogue
 * (`src/i18n/{en,it}/srd/equipment.json`, keyed by the SAME tool id) and EVERY
 * surface — the right-rail/Bio proficiency chips, the inventory item, the
 * creation/level-up wizards, the PDF — resolves the name from there via
 * `localizeSrd("equipment", id, "name", locale)` / `srdEn(...)`. So a tool reads
 * one canonical name everywhere by construction (golden rule 6).
 *
 * Lives in its OWN DEPENDENCY-LIGHT module (no `compute` / `classes` / SRD-content
 * imports) so that class data (`src/data/classes/{monk,bard}.ts`) can pull the
 * tool-id lists for their `choice-tool-proficiency` grants WITHOUT forming an
 * import cycle (`classes → bard → feat-skill-tool-choices → compute → classes`)
 * AND without dragging the EN SRD corpus into the `srd-classes` bundle chunk. The
 * NAME resolvers that read `srdEn` (`toolEnNameById`, `umbrellaToolChoiceOptions`,
 * `isUmbrellaTool`) therefore live in the consumer-side `@/lib/tool-names` module,
 * imported only by the proficiency/inventory consumers — never by class data. The
 * skill-or-tool RESOLVER stays in `feat-skill-tool-choices.ts` and re-exports
 * these for its existing consumers.
 *
 * Pure module — no React / store / engine-graph / SRD-content deps. Carries ids +
 * categories + derived id-lists ONLY; CI-pure (no Firebase, no active-locale dep).
 */

/**
 * Every tool's category — an EXPLICIT, exhaustive tag (no "unmarked default").
 * `category` drives the picker seal glyph (one icon per tool category — see
 * `toolSealIcon`): a hammer for the artisan crafts, dice for gaming, a note for
 * instruments, a case for kits, a compass for the navigator, a key for the thief.
 * It is REQUIRED on every entry — an uncategorized tool is unrepresentable, so a
 * new tool can never silently fall into "artisan" by omission.
 */
export type ToolCategory =
  | "artisan"
  | "instrument"
  | "gaming"
  | "kit"
  | "navigator"
  | "thieves";

/** One tool catalogue entry — id + category (+ the umbrella flag). NO name: the
 *  display name lives in the SRD equipment catalogue keyed by this id (#107). */
export interface SrdTool {
  id: string;
  category: ToolCategory;
  /**
   * `false` = a generic UMBRELLA a grant surfaces ("a Musical Instrument of your
   * choice") that can appear in `character.toolProficiencies` and must localize,
   * but is NOT offered as a concrete pick in the tool dropdowns (you pick a
   * specific instrument/set/tool instead). Omitted = a concrete, pickable tool.
   */
  pickable?: boolean;
}

/**
 * 2024 SRD tool list. Curated from the PHB "Tools" appendix — Artisan's Tools (the
 * individual crafts), Gaming Sets, Musical Instruments, the utility kits, and the two
 * universal tools. Names are resolved by id from the equipment catalogue (#107).
 */
export const SRD_TOOLS_2024: ReadonlyArray<SrdTool> = [
  // Artisan's tools — each tagged `category: "artisan"` (explicit, never implied).
  { id: "alchemists-supplies", category: "artisan" },
  { id: "brewers-supplies", category: "artisan" },
  { id: "calligraphers-supplies", category: "artisan" },
  { id: "carpenters-tools", category: "artisan" },
  { id: "cartographers-tools", category: "artisan" },
  { id: "cobblers-tools", category: "artisan" },
  { id: "cooks-utensils", category: "artisan" },
  { id: "glassblowers-tools", category: "artisan" },
  { id: "jewelers-tools", category: "artisan" },
  { id: "leatherworkers-tools", category: "artisan" },
  { id: "masons-tools", category: "artisan" },
  { id: "painters-supplies", category: "artisan" },
  { id: "potters-tools", category: "artisan" },
  { id: "smiths-tools", category: "artisan" },
  { id: "tinkers-tools", category: "artisan" },
  { id: "weavers-tools", category: "artisan" },
  { id: "woodcarvers-tools", category: "artisan" },
  // Utility kits
  { id: "disguise-kit", category: "kit" },
  { id: "forgery-kit", category: "kit" },
  { id: "herbalism-kit", category: "kit" },
  { id: "poisoners-kit", category: "kit" },
  // Gaming sets — generic
  { id: "dice-set", category: "gaming" },
  { id: "playing-card-set", category: "gaming" },
  // Musical instruments — generic
  { id: "bagpipes", category: "instrument" },
  { id: "drum", category: "instrument" },
  { id: "dulcimer", category: "instrument" },
  { id: "flute", category: "instrument" },
  { id: "horn", category: "instrument" },
  { id: "lute", category: "instrument" },
  { id: "lyre", category: "instrument" },
  { id: "pan-flute", category: "instrument" },
  { id: "shawm", category: "instrument" },
  { id: "viol", category: "instrument" },
  // Universal
  { id: "navigators-tools", category: "navigator" },
  { id: "thieves-tools", category: "thieves" },
  // ── Generic umbrellas ─────────────────────────────────────────────────
  // A grant surfaces these instead of a specific item ("a Musical Instrument of
  // your choice"); they localize when held but aren't offered as concrete picks.
  { id: "musical-instrument", category: "instrument", pickable: false },
  { id: "gaming-set", category: "gaming", pickable: false },
  { id: "artisans-tools", category: "artisan", pickable: false },
];

/** Every tool id (the stable single-valued tool tokens). */
export const TOOL_IDS: ReadonlySet<string> = new Set(SRD_TOOLS_2024.map((t) => t.id));

/**
 * The concrete (pickable) tool ids by category — DERIVED from `SRD_TOOLS_2024`,
 * the single source. Used to build `choice-tool-proficiency` grant option lists
 * (Monk: "Artisan's Tools OR Musical Instrument"; Bard: "3 Musical Instruments")
 * so the list can't drift from the catalogue. The generic UMBRELLA ids
 * (`pickable: false`) are excluded — a player picks a concrete tool, never the
 * umbrella.
 */
export const ARTISAN_TOOL_IDS: ReadonlyArray<string> = SRD_TOOLS_2024.filter(
  (t) => t.category === "artisan" && t.pickable !== false
).map((t) => t.id);

export const MUSICAL_INSTRUMENT_IDS: ReadonlyArray<string> = SRD_TOOLS_2024.filter(
  (t) => t.category === "instrument" && t.pickable !== false
).map((t) => t.id);

// The NAME resolvers that read the EN SRD catalogue — `toolEnNameById`,
// `isUmbrellaTool`, `umbrellaToolChoiceOptions` — live in `@/lib/tool-names`
// (the consumer-side seam), NOT here, so importing this catalogue never drags the
// EN SRD corpus into the `srd-classes` chunk via the class-data tool-id lists.

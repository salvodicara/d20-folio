/**
 * TOOL NAME + UMBRELLA RESOLVERS (#107) — the consumer-side seam that bridges the
 * dependency-light tool CATALOGUE (`@/lib/tools` — ids + categories only) to the
 * canonical SRD equipment NAMES (`@/i18n/srd-en`).
 *
 * ## Why this is a SEPARATE module from `@/lib/tools`
 *
 * A tool is BOTH a proficiency and an equipment item, and its EN/IT name lives
 * ONCE in the SRD equipment catalogue keyed by the tool id (#107, golden rules
 * 6b + 6c) — so EVERY surface reads one canonical name and the proficiency surface
 * can't drift from the inventory surface.
 *
 * But `@/lib/tools` must stay DEPENDENCY-LIGHT: class data
 * (`src/data/classes/{monk,bard}.ts`) imports its pure tool-id lists
 * (`ARTISAN_TOOL_IDS` / `MUSICAL_INSTRUMENT_IDS`) for `choice-tool-proficiency`
 * grants, and `src/data/classes/**` is bundled as the `srd-classes` chunk. If
 * `tools.ts` itself imported the EN SRD catalogue (`@/i18n/srd-en` statically
 * bundles the whole ~250 KB-gz corpus), every importer of `tools.ts` — including
 * the class data — would drag the entire EN SRD into `srd-classes`, ballooning the
 * eager bundle (the `bundle-budget.guard` correctly fails on it). So the
 * NAME-resolving helpers (the ones that read `srdEn`) live HERE, imported only by
 * the proficiency/inventory CONSUMERS (`resolve-grant-sources`, `backgrounds`,
 * pickers) and NEVER by `src/data/classes/**`.
 *
 * Pure module — no React / store / Firebase. It DOES read the EN SRD catalogue
 * (`srdEn`) for the EN-name FACT anchor; EN is the always-loaded facts source, so
 * this stays CI-pure (no Firebase, no active-locale dependency). Engine modules
 * already import `@/i18n/srd-en` directly (smart-tracker / grants / level-up), so
 * this carries no new eager weight beyond the corpus those modules already pull.
 */
import { srdEn } from "@/i18n/srd-en";
import { SRD_TOOLS_2024, TOOL_IDS, type ToolCategory } from "@/lib/tools";

/**
 * Resolve a catalogue tool id to its canonical EN NAME — the stable FACT anchor
 * (NOT a localized display string): the SAME EN name the FIXED `tool-proficiency`
 * grants carry (`{ type: "tool-proficiency", tool: "Smith's Tools" }`). It reads
 * the always-loaded EN SRD equipment catalogue by id, so there is ONE EN name per
 * tool (no second copy to drift). The tool-CHOICE grant source uses it so a chosen
 * tool id flows into the proficiency aggregate exactly like a fixed grant and
 * re-localizes by id at display (`displayToolProficiencies`). Returns `undefined`
 * for an unknown id (homebrew / future tool) so the caller skips it rather than
 * leaking a raw id.
 */
export function toolEnNameById(id: string): string | undefined {
  if (!TOOL_IDS.has(id)) return undefined;
  return srdEn("equipment", id, "name");
}

/**
 * The inverse of {@link toolEnNameById}: a catalogue tool's stable EN NAME → its
 * STABLE ID (locale-AGNOSTIC, the FACT anchor) — `"Smith's Tools"` →
 * `"smiths-tools"`. Used when an engine fact carries a tool by its EN name (a
 * multiclass entry-grant's `mc.toolProficiencies`) and we must store the player's
 * MANUAL pick as an ID, not a localized string (golden rule 7). Case- and
 * punctuation-tolerant (folds apostrophes / accents). Returns `undefined` for an
 * unknown name OR an UMBRELLA phrase ("One Musical Instrument of your choice") —
 * the caller skips it (an umbrella is a CHOICE, never a finished proficiency).
 */
export function toolIdByEnName(name: string): string | undefined {
  const folded = name.trim().toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (!folded) return undefined;
  for (const id of TOOL_IDS) {
    const en = srdEn("equipment", id, "name");
    if (en && en.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "") === folded) {
      return id;
    }
  }
  return undefined;
}

/**
 * The generic UMBRELLA tool ids — a grant surfaces one ("a Musical Instrument of
 * your choice") as a CHOICE PLACEHOLDER that must NEVER survive into a final
 * created character (neither as a proficiency nor as an equipment item). Derived
 * from the `pickable: false` rows, so the set can't drift from the catalogue.
 */
const UMBRELLA_TOOLS = SRD_TOOLS_2024.filter((t) => t.pickable === false);
const UMBRELLA_ID_SET = new Set(UMBRELLA_TOOLS.map((t) => t.id));

/** Lowercase the EN name of an umbrella id (its match anchor). */
function umbrellaNameTokens(id: string): string[] {
  const out: string[] = [];
  const en = srdEn("equipment", id, "name");
  if (en) out.push(en.toLowerCase());
  // IT name (if the IT catalogue is loaded) — so a stored IT umbrella token still
  // matches. EN is always present; IT is added when its catalogue has loaded.
  return out;
}

const UMBRELLA_NAME_SET = new Set(
  UMBRELLA_TOOLS.flatMap((t) => umbrellaNameTokens(t.id))
);

/**
 * True when a stored tool token (an id OR an EN name) is a generic UMBRELLA —
 * "Musical Instrument" / "Gaming Set" / "Artisan's Tools". An umbrella is a
 * "Choose one kind of X" CHOICE placeholder, never a concrete proficiency; a
 * background carrying one is resolved into a `choice-tool-proficiency` over its
 * category's pickable ids, and the player's pick becomes the proficiency. The
 * data layer (`backgrounds.ts`) passes the stable EN name, the FACT anchor.
 */
export function isUmbrellaTool(token: string): boolean {
  const t = token.trim();
  return UMBRELLA_ID_SET.has(t) || UMBRELLA_NAME_SET.has(t.toLowerCase());
}

/**
 * The concrete pickable tool ids in a given {@link ToolCategory} — DERIVED from
 * the catalogue (umbrellas excluded). The single map a `choice-tool-proficiency`
 * grant uses to expand an umbrella into its picker options.
 */
function pickableIdsForCategory(category: ToolCategory): ReadonlyArray<string> {
  return SRD_TOOLS_2024.filter(
    (t) => t.category === category && t.pickable !== false
  ).map((t) => t.id);
}

/**
 * The pickable option ids an umbrella token ("Musical Instrument", "Gaming Set",
 * "Artisan's Tools", by id or EN name) expands to — the concrete tools of that
 * umbrella's category. Returns `undefined` for a non-umbrella token (a fixed tool
 * stays a fixed proficiency). The SINGLE seam mapping an umbrella → its
 * `choice-tool-proficiency` options, shared by class data and background grants.
 */
export function umbrellaToolChoiceOptions(
  token: string
): ReadonlyArray<string> | undefined {
  const t = token.trim();
  const folded = t.toLowerCase();
  const umbrella = UMBRELLA_TOOLS.find(
    (u) => u.id === t || srdEn("equipment", u.id, "name")?.toLowerCase() === folded
  );
  return umbrella ? pickableIdsForCategory(umbrella.category) : undefined;
}

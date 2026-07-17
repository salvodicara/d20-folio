/**
 * Feat-pick presenter (`lib/views`) — the render-ready view-models for the
 * wizard F feat LIST (the read-then-choose morphing accordion both wizards
 * mount for "large pool" feat choices: the level-up boon, the Human Versatile
 * origin feat).
 *
 * Pure: SRD data + a `locale` in, plain VMs out — no React, no stores, no
 * i18next (the UI formats labels at the edge via `t`). Identity is the stable
 * feat id; every display string resolves HERE through {@link localizeSrd}
 * (golden rules 5 + 7).
 *
 * RAW-illegal options are NOT options (owner round-5 verdict): a feat whose
 * 2024 prerequisite the character does not meet — or a non-repeatable feat
 * already taken — is FILTERED OUT of the offered pool, never greyed out.
 * Homebrew overrides live in the cockpit, not in the on-rails wizard.
 */
import { SRD_FEATS } from "@/data/feats";
import type { FeatCategory, SrdFeatData } from "@/data/types";
import { featAsi } from "@/lib/feat-asi";
import { featCategoryOffered, featPrereqMet, type FeatGateCtx } from "@/lib/feat-prereq";
import { proseCorpus } from "@/lib/search";
import { localizeSrd } from "@/i18n/resolver";
import { abilityLabel } from "@/lib/views/level-up-view";
import type { Locale } from "@/lib/locale";

/** One render-ready feat entry for the wizard F morphing list. */
export interface FeatPickVM {
  /** Stable feat id — the list binds to and emits THIS. */
  id: string;
  /** Localized display name. */
  name: string;
  /** Tier-1 search corpus (localized + EN name anchor). */
  searchText: string;
  /** Tier-2 search corpus (localized + EN description, markdown flattened) —
   *  resolved lazily on first access (only a ≥3-char query reaches tier 2). */
  readonly searchDesc: string;
  category: FeatCategory;
  /** Localized half-feat clause ("+1 STR/DEX"), or null when the feat has none. */
  halfFeat: string | null;
  /** Full localized SRD description (markdown — the reading prose). */
  description: string;
  /** The expert scan line — the feat's OWN benefit headings, derived from the
   *  SRD markdown (one source of truth, never a hand-written catalogue). */
  summary: string;
  /** The raw SRD entry — feeds the shared compendium read view. */
  entry: SrdFeatData;
}

/** Strip markdown + the boilerplate lead so a gloss says something useful. */
function excerptOf(description: string): string {
  const flat = description
    .replace(/You gain the following benefits:\s*/i, "")
    .replace(/Ottieni i seguenti benefici:\s*/i, "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return flat.length > 120 ? `${flat.slice(0, 117).trimEnd()}…` : flat;
}

/**
 * The expert scan line: join the feat's OWN `**Benefit.**` headings from the
 * SRD markdown ("Initiative Proficiency · Initiative Swap"). The ASI clause is
 * skipped (the row's "+1" badge already says it). Derived, never stored — one
 * source of truth. Falls back to the excerpt when the text has no headed
 * benefits (fighting styles read fine as-is).
 */
function summaryOf(description: string): string | null {
  const heads = [...description.matchAll(/\*\*([^*\n]+?)\.?\*\*/g)]
    .map((m) => (m[1] ?? "").trim())
    .filter(
      (h) =>
        h.length > 0 &&
        h.length < 40 &&
        !/ability score increase/i.test(h) &&
        !/aumento dei punteggi di caratteristica/i.test(h) &&
        !/^repeatable$/i.test(h) &&
        !/^ripetibile$/i.test(h)
    );
  if (heads.length === 0) return null;
  const line = heads.join(" · ");
  return line.length > 110 ? `${line.slice(0, 107).trimEnd()}…` : line;
}

/** Build ONE feat's VM (exported for table-driven tests). */
export function featPickVM(feat: SrdFeatData, locale: Locale): FeatPickVM {
  const name = localizeSrd("feat", feat.id, "name", locale);
  const description = localizeSrd("feat", feat.id, "description", locale);
  const asi = featAsi(feat);
  let searchDesc: string | undefined;
  return {
    id: feat.id,
    name,
    searchText: `${name} ${localizeSrd("feat", feat.id, "name", "en")}`,
    // LAZY + cached (D): the EN twin + markdown flattening resolve only when a
    // ≥3-char query actually reaches tier 2, then stick for the VM's lifetime.
    get searchDesc() {
      searchDesc ??= proseCorpus(
        description,
        locale === "en" ? undefined : localizeSrd("feat", feat.id, "description", "en")
      );
      return searchDesc;
    },
    category: feat.category,
    halfFeat: asi
      ? `+${asi.amount} ${asi.abilities.map((a) => abilityLabel(a, locale)).join("/")}`
      : null,
    description,
    summary: summaryOf(description) ?? excerptOf(description),
    entry: feat,
  };
}

/**
 * The OFFERED feat pool for a wizard feat list: every feat whose category is
 * offered at this gate (Epic Boons only at 19+, Fighting-Style feats only with
 * the feature) AND whose 2024 prerequisites the character meets AND that is not
 * an already-taken non-repeatable — RAW-illegal entries are filtered, not
 * greyed. The redundant "Ability Score Improvement" feat is always excluded
 * (the wizard's +2 / +1+1 fork IS that feat).
 */
export function offeredFeatVMs(
  gate: FeatGateCtx,
  takenFeatIds: ReadonlySet<string>,
  locale: Locale,
  pool: ReadonlyArray<SrdFeatData> = SRD_FEATS
): FeatPickVM[] {
  return pool
    .filter(
      (f) =>
        f.id !== "ability-score-improvement" &&
        featCategoryOffered(f.category, gate) &&
        featPrereqMet(f, gate) &&
        (f.repeatable || !takenFeatIds.has(f.id))
    )
    .map((f) => featPickVM(f, locale));
}

/** The ORIGIN feat pool (creation: Human Versatile / background swaps). */
export function originFeatVMs(
  locale: Locale,
  takenFeatIds: ReadonlySet<string> = new Set()
): FeatPickVM[] {
  return SRD_FEATS.filter(
    (f) => f.category === "origin" && (f.repeatable || !takenFeatIds.has(f.id))
  ).map((f) => featPickVM(f, locale));
}

/** The distinct categories present in a pool, in first-seen order. */
export function featPickCategories(pool: ReadonlyArray<FeatPickVM>): FeatCategory[] {
  return [...new Set(pool.map((f) => f.category))];
}

/**
 * Rules-prose MATCH vocabulary — the per-locale word-stock behind the BG3
 * rules-text colour grammar (`highlightRulesText`).
 *
 * These are locale-bound words, so they live under `src/i18n/**` (golden rule
 * 7) — but they are MATCH data, never display strings: nothing here is ever
 * rendered. Each entry is a small regex FRAGMENT (alternations + character
 * classes only), typed exhaustively over `DamageType` and `Locale` so a new
 * damage type or language is a compile error until its vocabulary exists.
 *
 * Case convention: the 2024 SRD writes damage types both as defined terms
 * ("8d6 Fire damage") and as plain nouns ("2d6 fire damage" on items), so each
 * fragment carries a first-letter class (`[Ff]ire`). Italian inflects — plural
 * adjectives ("danni contundenti") and gendered condition forms ("Spaventata")
 * — so the IT fragments carry the inflection classes and the condition
 * variants list the extra full forms beyond the catalogue name.
 */

import type { DamageType } from "@/data/types";
import type { Locale } from "@/lib/locale";

export interface RulesProseVocab {
  /**
   * Per-damage-type fragment, substituted into {@link damagePhrase}'s
   * `%TYPES%` slot. Alternations only — no capture groups.
   */
  damageTypes: Record<DamageType, string>;
  /**
   * The damage-phrase template around the type word — `%TYPES%` marks the
   * slot (EN "Fire damage" is type-first; IT "danni da fuoco" noun-first).
   * The highlighter prepends an optional dice/modifier amount itself, and
   * substitutes a LIST of types (joined by {@link damageListSep}) into the slot
   * so "Acid, Cold, or Fire damage" is one match, each type inked in its hue.
   */
  damagePhrase: string;
  /**
   * The connective between damage types in a multi-type list — the locale's
   * comma / "and" / "or" ("e" / "o" in IT). Alternations only, no captures.
   */
  damageListSep: string;
  /** The save-DC token ("DC 15" EN · "CD 15" IT). */
  saveDc: string;
  /** A measured quantity: a number FOLLOWED BY a unit (never a bare integer).
   *  The number atom accepts decimal/thousand separators ("1,5 metri" IT,
   *  "1,000 feet" EN) so a separated value is one whole token. */
  units: string;
  /** The Advantage defined term (capitalized — the SRD's defined-term cap). */
  advantage: string;
  /** The Disadvantage defined term (capitalized). */
  disadvantage: string;
  /**
   * The verb-phrase LOOKBEHIND that unlocks the lowercase Advantage/Disadvantage
   * forms — the SRD writes "has/have/with/gains advantage" (EN) and the verb
   * forms "ha/hai/hanno/avere (anche) (s)vantaggio" + "con (s)vantaggio" (IT) in
   * lower case, all mechanical. Only the adv/dis word is inked, never the verb
   * (this gates it). Alternations only, no captures.
   */
  advGate: string;
  /**
   * The follow-context that unlocks a LOWERCASE "invisible" — objects are
   * "invisible" without bearing the condition (a Shield's "invisible barrier"),
   * so lowercase inks only before "creature(s)"/"condition" (EN); the
   * capitalized defined term always inks. `null` where the locale inks the
   * capitalized defined term ONLY: Italian writes native adjective-order
   * ("creatura invisibile"), so an English-style lowercase-context lookahead can
   * never fire — and the corpus's mechanical uses are the capitalized
   * "Invisibile"/"Invisibili" (×44+), so IT inks capital-only. Alternations only.
   */
  invisibleContext: string | null;
  /**
   * EXTRA inflected condition forms beyond the localized catalogue name
   * (`localizeSrd("condition", id, "name", …)` stays the base). Keyed by
   * condition id; integrity pinned by the grammar's unit tests.
   */
  conditionVariants: Readonly<Record<string, readonly string[]>>;
}

/** The per-locale vocabulary — the ONE seam that indexes by locale (kept
 *  inside `src/i18n/**`, where the bitext guard allows it). */
export function rulesProseVocab(locale: Locale): RulesProseVocab {
  return RULES_PROSE[locale];
}

export const RULES_PROSE: Record<Locale, RulesProseVocab> = {
  en: {
    damageTypes: {
      acid: "[Aa]cid",
      bludgeoning: "[Bb]ludgeoning",
      cold: "[Cc]old",
      fire: "[Ff]ire",
      force: "[Ff]orce",
      lightning: "[Ll]ightning",
      necrotic: "[Nn]ecrotic",
      piercing: "[Pp]iercing",
      poison: "[Pp]oison",
      psychic: "[Pp]sychic",
      radiant: "[Rr]adiant",
      slashing: "[Ss]lashing",
      thunder: "[Tt]hunder",
    },
    damagePhrase: "%TYPES%\\s+[Dd]amage",
    damageListSep: "(?:,\\s+(?:and\\s+|or\\s+)?|\\s+(?:and|or)\\s+)",
    saveDc: "DC\\s?\\d+",
    units:
      "\\d+(?:[.,]\\d+)*[-\\s](?:foot|feet|ft|inch|inches|mile|hour|minute|round|day)s?",
    advantage: "Advantage",
    disadvantage: "Disadvantage",
    advGate: "(?:has|have|with|gains?)\\s",
    invisibleContext: "creatures?|condition",
    conditionVariants: {},
  },
  it: {
    damageTypes: {
      acid: "[Aa]cido",
      bludgeoning: "[Cc]ontundent[ei]",
      cold: "[Ff]reddo",
      fire: "[Ff]uoco",
      force: "[Ff]orza",
      lightning: "[Ff]ulmine",
      necrotic: "[Nn]ecrotic[oi]",
      piercing: "[Pp]erforant[ei]",
      poison: "[Vv]eleno",
      psychic: "[Pp]sichic[oi]",
      radiant: "[Rr]adiant[ei]",
      slashing: "[Tt]aglient[ei]",
      thunder: "[Tt]uono",
    },
    damagePhrase: "[Dd]ann[oi]\\s+(?:da\\s+)?%TYPES%",
    damageListSep: "(?:,\\s+(?:e\\s+|o\\s+)?|\\s+(?:e|o)\\s+)",
    saveDc: "CD\\s?\\d+",
    units:
      "\\d+(?:[.,]\\d+)*[-\\s](?:piede|piedi|centimetr[oi]|metr[oi]|chilometr[oi]|migli[oa]|or[ae]|minut[oi]|round|giorn[oi])",
    advantage: "Vantaggio",
    disadvantage: "Svantaggio",
    advGate: "(?:[Hh]a|[Hh]ai|[Hh]anno|[Aa]vere|[Cc]on)\\s+(?:anche\\s+)?",
    invisibleContext: null,
    conditionVariants: {
      blinded: ["Accecata", "Accecati", "Accecate"],
      charmed: ["Affascinata", "Affascinati", "Affascinate"],
      deafened: ["Assordata", "Assordati", "Assordate"],
      exhaustion: [],
      frightened: ["Spaventata", "Spaventati", "Spaventate"],
      grappled: ["Afferrata", "Afferrati", "Afferrate"],
      incapacitated: ["Incapacitata", "Incapacitati", "Incapacitate"],
      invisible: ["Invisibili"],
      paralyzed: ["Paralizzata", "Paralizzati", "Paralizzate"],
      petrified: ["Pietrificata", "Pietrificati", "Pietrificate"],
      poisoned: ["Avvelenata", "Avvelenati", "Avvelenate"],
      prone: ["Prona", "Proni", "Prone"],
      restrained: ["Trattenuta", "Trattenuti", "Trattenute"],
      stunned: ["Stordita", "Storditi", "Stordite"],
      unconscious: ["Priva di Sensi", "Privi di Sensi", "Prive di Sensi"],
    },
  },
};

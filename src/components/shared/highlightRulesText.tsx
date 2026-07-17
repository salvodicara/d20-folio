/**
 * `highlightRulesText` — the BG3 rules-text colour grammar: a pure,
 * locale-parameterized RENDER-TIME formatter for rules prose (compendium
 * descriptions, picker details, sheet feature/spell/item cards). It reads a
 * PLAIN prose run (one line's string leaf, post-markdown) and lifts the tokens
 * a player scans for, the way BG3's tooltips do:
 *
 *   - DAMAGE PHRASES ("8d6 Fire damage" · "danni contundenti") → `.rt-dmg`,
 *     inked in the type's canonical hue (`--dmg-<type>-ink`) — the SAME hue
 *     the verdict chips wear, so prose and chip agree by construction.
 *   - CONDITION names (localized, capitalized defined terms, IT inflections
 *     included) → `.rt-cond`, inked in the condition's hue (`--cond-<id>-ink`).
 *   - VALUES (dice `1d6` · save `DC 15`/`CD 15` · measured distance/duration
 *     `30-foot` · `10 minuti`) → `.rt-value`, the lit special-ink register.
 *   - ADVANTAGE / DISADVANTAGE (capitalized defined terms) → `.rt-adv` /
 *     `.rt-dis`, the success/danger inks.
 *
 * It edits ZERO SRD strings and does NOT touch `parseInline` (the shared
 * tokenizer stays byte-identical): it is OPT-IN via `InlineMarkdown`'s
 * `highlight` prop, passed only where RULES text renders. It is wired across
 * every SRD rules-prose surface AND on user-authored CUSTOM/homebrew feature
 * descriptions (FeaturesTab's "custom" group) — homebrew rules text
 * DELIBERATELY wears the grammar, because a homebrew feature IS rules text.
 * Chronicle / session / player-note prose stays untouched (the prop is simply
 * never passed there), so the "opt-in seam" is what keeps free prose plain.
 *
 * Bare integers are never lifted (a number needs a unit or dice to be a
 * measured fact); a measured number keeps its decimal/thousand separators as
 * one token ("1,5 metri", "1,000 feet"). Condition names match with
 * word-initial case flexibility — the corpus writes both "the Paralyzed
 * condition" and "be paralyzed", and in rules prose both ARE the condition —
 * except "invisible", which objects wear without the condition ("an invisible
 * barrier"): EN inks its lowercase form only in creature/condition context,
 * while IT — native adjective order ("creatura invisibile"), where the
 * mechanical uses are the capitalized "Invisibile" — inks the defined term
 * only. Advantage/Disadvantage ink their capitalized defined term AND their
 * lowercase verb-phrase forms ("has advantage" / "ha svantaggio"), gated so
 * only the adv/dis word lifts, never the verb. A multi-type damage list
 * ("Acid, Cold, or Fire damage") inks EACH type word in its own hue.
 *
 * Locale words live in `src/i18n/rules-prose.ts` (typed, both locales);
 * condition base names come from the localized SRD catalogue. The built
 * highlighter is cached per locale; each call spins a FRESH `RegExp` (its own
 * `lastIndex`), so nothing mutable is shared.
 */

import { Fragment, type ReactNode } from "react";
import type { Locale } from "@/lib/locale";
import { useLocale } from "@/hooks/useLocale";
import { ALL_DAMAGE_TYPES, type DamageType } from "@/data/types";
import { getAllConditionIds } from "@/data/conditions";
import { localizeSrd } from "@/i18n/resolver";
import { rulesProseVocab } from "@/i18n/rules-prose";

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Dice: `1d6`, `2d8+3`, `1d10 − 1` — locale-invariant. The optional modifier arm
// accepts the ASCII hyphen AND the Unicode minus (U+2212) the SRD sometimes uses.
const DICE = "\\d+d\\d+(?:\\s?[+−-]\\s?\\d+)?";

type Highlighter = (plain: string) => ReactNode;

/** Build the per-locale grammar: one ordered named-group alternation. */
function build(locale: Locale): Highlighter {
  const vocab = rulesProseVocab(locale);

  // Damage phrase — an optional dice amount + the locale's phrase template with
  // a LIST of the 13 type fragments in its %TYPES% slot. Tried FIRST, so "8d6
  // Fire damage" is one damage token, never a bare-dice value + plain words; a
  // multi-type list ("Acid, Cold, or Fire damage") matches whole and is
  // sub-inked per type at render (renderDamage).
  const typesAlt = ALL_DAMAGE_TYPES.map((t) => vocab.damageTypes[t]).join("|");
  const typesList = `(?:${typesAlt})(?:${vocab.damageListSep}(?:${typesAlt}))*`;
  const dmgArm = `\\b(?:${DICE}\\s+)?${vocab.damagePhrase.replace(
    "%TYPES%",
    typesList
  )}\\b`;

  // Localized condition names + inflected variants, LONGEST-FIRST so a
  // multi-word form ("Privi di Sensi") is tried before any shorter name.
  // Matched with word-initial case flexibility: the corpus writes both the
  // defined term ("has the Paralyzed condition") and the adjectival form
  // ("be paralyzed for the duration"), and in rules prose BOTH are the
  // mechanical condition — verified corpus-wide, zero non-mechanical uses.
  const flexCase = (name: string): string =>
    escapeRegExp(name).replace(
      /(^|\s)(\p{L})/gu,
      (_all, pre: string, ch: string) => `${pre}[${ch.toUpperCase()}${ch.toLowerCase()}]`
    );
  const conditionByText = new Map<string, string>();
  for (const id of getAllConditionIds()) {
    conditionByText.set(localizeSrd("condition", id, "name", locale).toLowerCase(), id);
    for (const variant of vocab.conditionVariants[id] ?? []) {
      conditionByText.set(variant.toLowerCase(), id);
    }
  }
  // "invisible" is inked more strictly than the other conditions: objects are
  // "invisible" without bearing the condition ("an invisible barrier of force"),
  // so its lowercase form inks ONLY in creature/condition context, while the
  // capitalized defined term ("Invisible creature", "the Invisible condition")
  // always inks. Every other condition keeps the word-initial case flexibility.
  const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  const invisibleTexts: string[] = [];
  const otherCondTexts: string[] = [];
  for (const [text, id] of conditionByText) {
    (id === "invisible" ? invisibleTexts : otherCondTexts).push(text);
  }
  // With a follow-context (EN), lowercase "invisible" inks before it; where the
  // locale has none (IT — `invisibleContext: null`, native adjective order) only
  // the capitalized defined term inks.
  const invisibleArm = invisibleTexts
    .flatMap((text) =>
      vocab.invisibleContext
        ? [
            escapeRegExp(capFirst(text)),
            `${escapeRegExp(text)}(?=\\s+(?:${vocab.invisibleContext}))`,
          ]
        : [escapeRegExp(capFirst(text))]
    )
    .join("|");
  const condFragments = otherCondTexts.sort((a, b) => b.length - a.length).map(flexCase);
  if (invisibleArm) condFragments.push(invisibleArm);
  const condArm = `\\b(?:${condFragments.join("|")})\\b`;

  // Values: dice · save DC · measured distance/duration. Never a bare integer.
  const valArm = `\\b(?:${DICE}|${vocab.saveDc}|${vocab.units})\\b`;

  // Advantage / Disadvantage: the capitalized defined term ALWAYS, plus the
  // lowercase verb-phrase form ("has advantage" / "con vantaggio") — gated by a
  // lookbehind so only the adv/dis word inks, never the verb. "disadvantage"
  // starts with 'd', so the adv arm can never match the "advantage" inside it.
  const advArm = `\\b${vocab.advantage}\\b|(?<=${vocab.advGate})${vocab.advantage.toLowerCase()}\\b`;
  const disArm = `\\b${vocab.disadvantage}\\b|(?<=${vocab.advGate})${vocab.disadvantage.toLowerCase()}\\b`;

  const src =
    `(?<dmg>${dmgArm})|(?<cond>${condArm})` +
    `|(?<adv>${advArm})|(?<dis>${disArm})` +
    `|(?<val>${valArm})`;

  // Per-type probe sources — re-run globally to locate EVERY type word inside a
  // matched damage phrase (a list carries several). A fresh RegExp per use keeps
  // `lastIndex` private.
  const typeProbeSrc = ALL_DAMAGE_TYPES.map(
    (t) => [t, `\\b(?:${vocab.damageTypes[t]})\\b`] as const
  );

  // The ordered, non-overlapping type-word spans within a matched damage phrase.
  const damageSpans = (
    phrase: string
  ): { start: number; end: number; type: DamageType }[] => {
    const spans: { start: number; end: number; type: DamageType }[] = [];
    for (const [t, reSrc] of typeProbeSrc) {
      const re = new RegExp(reSrc, "g");
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(phrase)) !== null) {
        spans.push({ start: mm.index, end: mm.index + mm[0].length, type: t });
      }
    }
    spans.sort((a, b) => a.start - b.start);
    const out: typeof spans = [];
    let lastEnd = -1;
    for (const s of spans) {
      if (s.start >= lastEnd) {
        out.push(s);
        lastEnd = s.end;
      }
    }
    return out;
  };

  const inkedDmg = (text: string, type: DamageType | undefined, k: string): ReactNode => (
    <strong
      key={k}
      className="rt-dmg"
      style={type ? { color: `var(--dmg-${type}-ink)` } : undefined}
    >
      {text}
    </strong>
  );

  // A single-type phrase keeps the whole-phrase treatment (dice + type + damage
  // noun in one inked token). A multi-type list inks EACH type word in its own
  // hue; the leading/trailing damage noun ("danni …" / "… damage") rides with
  // the first/last type so the terminal token reads like the single-type form,
  // and the bare connectors (", " / " and " / " or ") stay plain.
  const renderDamage = (phrase: string, at: number): ReactNode => {
    const spans = damageSpans(phrase);
    if (spans.length <= 1) return inkedDmg(phrase, spans[0]?.type, `dmg-${at}`);
    const parts: ReactNode[] = [];
    let cursor = 0;
    spans.forEach((span, i) => {
      const isFirst = i === 0;
      const isLast = i === spans.length - 1;
      const tokStart = isFirst ? 0 : span.start;
      const tokEnd = isLast ? phrase.length : span.end;
      if (!isFirst && span.start > cursor) parts.push(phrase.slice(cursor, span.start));
      parts.push(inkedDmg(phrase.slice(tokStart, tokEnd), span.type, `dmg-${at}-${i}`));
      cursor = tokEnd;
    });
    return <Fragment key={`dmg-${at}`}>{parts}</Fragment>;
  };

  return (plain: string): ReactNode => {
    // A FRESH regex per call (parseInline's lesson): a shared global `lastIndex`
    // would corrupt re-entrant or repeat calls.
    const re = new RegExp(src, "g");
    const out: ReactNode[] = [];
    let last = 0;
    let key = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain)) !== null) {
      if (m.index > last) out.push(plain.slice(last, m.index));
      const tok = m[0];
      const g = m.groups ?? {};
      if (g.dmg !== undefined) {
        out.push(renderDamage(tok, m.index));
      } else if (g.cond !== undefined) {
        const id = conditionByText.get(tok.toLowerCase());
        out.push(
          <strong
            key={key++}
            className="rt-cond"
            style={id ? { color: `var(--cond-${id}-ink)` } : undefined}
          >
            {tok}
          </strong>
        );
      } else {
        const cls =
          g.adv !== undefined ? "rt-adv" : g.dis !== undefined ? "rt-dis" : "rt-value";
        out.push(
          <strong key={key++} className={cls}>
            {tok}
          </strong>
        );
      }
      last = m.index + tok.length;
    }
    if (last < plain.length) out.push(plain.slice(last));
    // No match → hand back the original string (simplest structure for callers).
    return out.length === 1 && typeof out[0] === "string" ? out[0] : out;
  };
}

const cache = new Map<Locale, Highlighter>();

/**
 * The per-locale rules-prose highlighter — a pure mapping from a plain string
 * leaf to keyed React nodes. Built once per locale from the localized
 * catalogues (post-bootstrap, so the active locale is always loaded) and
 * cached; the returned closure is safely shareable.
 */
export function highlightRulesText(locale: Locale): Highlighter {
  let fn = cache.get(locale);
  if (!fn) {
    fn = build(locale);
    cache.set(locale, fn);
  }
  return fn;
}

/** The active-locale highlighter, for component callsites that don't already
 *  carry a `locale` — the one-liner that wires a rules-prose surface in. */
export function useRulesTextHighlight(): Highlighter {
  const { language } = useLocale();
  return highlightRulesText(language);
}

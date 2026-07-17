/**
 * `highlightRulesText` — the BG3 rules-text colour grammar. Damage phrases wear
 * their type's ink (`.rt-dmg`), condition names their condition's ink
 * (`.rt-cond`), values the lit special register (`.rt-value`), Advantage /
 * Disadvantage the success/danger inks (`.rt-adv`/`.rt-dis`). Both locales are
 * first-class (IT inflections included); ZERO SRD strings are edited; the shared
 * `parseInline` tokenizer is untouched, so chronicle/session prose is provably
 * unaffected (the prop is opt-in).
 *
 * Slow lane (jsdom + EN/IT eagerly loaded by setup.ts), so `localizeSrd`
 * resolves the localized condition names synchronously.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { highlightRulesText } from "@/components/shared/highlightRulesText";
import { InlineMarkdown } from "@/components/shared/InlineMarkdown";
import { RULES_PROSE } from "@/i18n/rules-prose";
import { getAllConditionIds } from "@/data/conditions";
import { LOCALES, type Locale } from "@/lib/locale";

/** Render a bare highlighted run and hand back its container for querying. */
function hl(locale: Locale, input: string): HTMLElement {
  return render(<div>{highlightRulesText(locale)(input)}</div>).container;
}

/** Render through the FULL InlineMarkdown path with the highlighter wired in. */
function md(locale: Locale, text: string): HTMLElement {
  return render(<InlineMarkdown text={text} highlight={highlightRulesText(locale)} />)
    .container;
}

/** All tokens of a class, as [textContent, inline colour] pairs. */
const toks = (c: HTMLElement, cls: string): [string | null, string][] =>
  [...c.querySelectorAll<HTMLElement>(`strong.${cls}`)].map((n) => [
    n.textContent,
    n.style.color,
  ]);

describe("highlightRulesText — damage phrases (.rt-dmg)", () => {
  it("(a) EN: dice + capitalized type + damage = ONE token in the type's ink", () => {
    const c = hl("en", "A target takes 8d6 Fire damage on a failed save.");
    expect(toks(c, "rt-dmg")).toEqual([["8d6 Fire damage", "var(--dmg-fire-ink)"]]);
    // The dice are INSIDE the damage token, never a second bare value.
    expect(c.querySelector(".rt-value")).toBeNull();
  });

  it("(b) EN: lowercase item prose and standalone type-damage both match", () => {
    expect(
      toks(hl("en", "it deals an extra 2d6 fire damage on a hit"), "rt-dmg")
    ).toEqual([["2d6 fire damage", "var(--dmg-fire-ink)"]]);
    expect(toks(hl("en", "You have Resistance to Necrotic damage."), "rt-dmg")).toEqual([
      ["Necrotic damage", "var(--dmg-necrotic-ink)"],
    ]);
  });

  it("(c) IT: noun-first phrase, 'da'-form and plural-adjective form", () => {
    expect(
      toks(hl("it", "Un bersaglio subisce 8d6 danni da fuoco se fallisce."), "rt-dmg")
    ).toEqual([["8d6 danni da fuoco", "var(--dmg-fire-ink)"]]);
    expect(toks(hl("it", "subisce 2d6 danni contundenti"), "rt-dmg")).toEqual([
      ["2d6 danni contundenti", "var(--dmg-bludgeoning-ink)"],
    ]);
    // The SRD-normalized CAPITAL damage-type noun (the house convention — every IT
    // catalogue writes "danni da Fuoco" / "danni Necrotici" as the defined term)
    // inks identically to the lowercase form: the vocabulary is first-letter
    // case-flexible, so the corpus-wide capitalization is render-safe by construction.
    expect(toks(hl("it", "subisce 8d6 danni da Fuoco"), "rt-dmg")).toEqual([
      ["8d6 danni da Fuoco", "var(--dmg-fire-ink)"],
    ]);
    expect(toks(hl("it", "subisce 3d6 danni Necrotici"), "rt-dmg")).toEqual([
      ["3d6 danni Necrotici", "var(--dmg-necrotic-ink)"],
    ]);
  });

  it("(d) a type word WITHOUT the damage noun stays plain (no false positives)", () => {
    // EN: "The fire spreads…" is scenery, not a damage fact.
    expect(
      hl("en", "The fire spreads around corners.").querySelector(".rt-dmg")
    ).toBeNull();
    // IT: "Il fuoco si propaga…" likewise; and IT "Forza" (the ability) is never inked.
    expect(
      hl("it", "Il fuoco si propaga oltre gli angoli.").querySelector(".rt-dmg")
    ).toBeNull();
    expect(hl("it", "una prova di Forza (Atletica)").querySelector(".rt-dmg")).toBeNull();
    // Wrong-locale phrasing stays plain prose.
    expect(hl("it", "takes 8d6 Fire damage").querySelector(".rt-dmg")).toBeNull();
    expect(hl("en", "subisce 8d6 danni da fuoco").querySelector(".rt-dmg")).toBeNull();
  });
});

describe("highlightRulesText — multi-type damage lists (.rt-dmg)", () => {
  it("(a2) EN: a 3-type list inks each type in its own hue, damage noun rides the last", () => {
    const c = hl("en", "The target takes Bludgeoning, Piercing, and Slashing damage.");
    expect(toks(c, "rt-dmg")).toEqual([
      ["Bludgeoning", "var(--dmg-bludgeoning-ink)"],
      ["Piercing", "var(--dmg-piercing-ink)"],
      ["Slashing damage", "var(--dmg-slashing-ink)"],
    ]);
  });

  it("(a3) EN: Glyph of Warding's 5-type 'or' list inks all five, the last carries 'damage'", () => {
    const c = hl("en", "You choose Acid, Cold, Fire, Lightning, or Thunder damage.");
    expect(toks(c, "rt-dmg")).toEqual([
      ["Acid", "var(--dmg-acid-ink)"],
      ["Cold", "var(--dmg-cold-ink)"],
      ["Fire", "var(--dmg-fire-ink)"],
      ["Lightning", "var(--dmg-lightning-ink)"],
      ["Thunder damage", "var(--dmg-thunder-ink)"],
    ]);
  });

  it("(a4) IT: noun-first list inks each adjective; 'danni' rides the first type", () => {
    const c = hl("it", "Il bersaglio subisce danni contundenti, perforanti e taglienti.");
    expect(toks(c, "rt-dmg")).toEqual([
      ["danni contundenti", "var(--dmg-bludgeoning-ink)"],
      ["perforanti", "var(--dmg-piercing-ink)"],
      ["taglienti", "var(--dmg-slashing-ink)"],
    ]);
  });

  it("(a5) single-type phrases are unchanged (one whole-phrase token)", () => {
    expect(toks(hl("en", "takes 8d6 Fire damage"), "rt-dmg")).toEqual([
      ["8d6 Fire damage", "var(--dmg-fire-ink)"],
    ]);
    // Two SEPARATE single-type phrases never merge into a list.
    expect(toks(hl("en", "Fire damage and later Cold damage"), "rt-dmg")).toEqual([
      ["Fire damage", "var(--dmg-fire-ink)"],
      ["Cold damage", "var(--dmg-cold-ink)"],
    ]);
    // IT single-type slashing — the standard adjective "danni Taglienti" (never the
    // nonstandard "danni da Taglio") inks as one whole-phrase token, dice included.
    // Pins the normalized magic-items phrasing (Axe of the Dwarvish Lords, et al.).
    expect(
      toks(hl("it", "l'ascia infligge 20 danni Taglienti aggiuntivi."), "rt-dmg")
    ).toEqual([["danni Taglienti", "var(--dmg-slashing-ink)"]]);
    expect(toks(hl("it", "subisce 2d6 danni Taglienti aggiuntivi"), "rt-dmg")).toEqual([
      ["2d6 danni Taglienti", "var(--dmg-slashing-ink)"],
    ]);
  });

  it("(a6) IT: capitalized 3-type immunity list inks all three (Daern's Instant Fortress)", () => {
    // The entry writes the standard "Taglienti" (not the nonstandard "da Taglio"),
    // so the whole "danni Contundenti, Perforanti e Taglienti" list inks per type.
    const c = hl(
      "it",
      "Immunità ai danni Contundenti, Perforanti e Taglienti tranne quelli."
    );
    expect(toks(c, "rt-dmg")).toEqual([
      ["danni Contundenti", "var(--dmg-bludgeoning-ink)"],
      ["Perforanti", "var(--dmg-piercing-ink)"],
      ["Taglienti", "var(--dmg-slashing-ink)"],
    ]);
  });
});

describe("highlightRulesText — condition names (.rt-cond)", () => {
  it("(e) inks the localized capitalized name in the condition's own hue", () => {
    expect(toks(hl("en", "has the Frightened condition"), "rt-cond")).toEqual([
      ["Frightened", "var(--cond-frightened-ink)"],
    ]);
    expect(toks(hl("it", "ha la condizione Spaventato"), "rt-cond")).toEqual([
      ["Spaventato", "var(--cond-frightened-ink)"],
    ]);
  });

  it("(f) IT inflections and multi-word names match as ONE token", () => {
    expect(toks(hl("it", "La creatura è Spaventata dalla fonte."), "rt-cond")).toEqual([
      ["Spaventata", "var(--cond-frightened-ink)"],
    ]);
    expect(toks(hl("it", "Cade Privo di Sensi immediatamente."), "rt-cond")).toEqual([
      ["Privo di Sensi", "var(--cond-unconscious-ink)"],
    ]);
    expect(toks(hl("it", "Cadono Privi di Sensi."), "rt-cond")).toEqual([
      ["Privi di Sensi", "var(--cond-unconscious-ink)"],
    ]);
  });

  it("(g) adjectival lowercase forms are matched too (the corpus writes both)", () => {
    expect(toks(hl("en", "or be paralyzed for the duration"), "rt-cond")).toEqual([
      ["paralyzed", "var(--cond-paralyzed-ink)"],
    ]);
    expect(toks(hl("en", "falls prone and is stunned"), "rt-cond")).toEqual([
      ["prone", "var(--cond-prone-ink)"],
      ["stunned", "var(--cond-stunned-ink)"],
    ]);
    // Word-boundary gated: a word merely CONTAINING a condition stem stays plain.
    expect(hl("en", "a pronounced effect").querySelector(".rt-cond")).toBeNull();
  });

  it("(g2) 'invisible' inks only as the condition, never on objects", () => {
    // Shield's "invisible barrier" is an object — not the Invisible condition —
    // and "force" here is not a damage phrase, so the whole sentence is plain.
    const shield = hl("en", "An invisible barrier of magical force appears.");
    expect(shield.querySelector(".rt-cond")).toBeNull();
    expect(shield.querySelector(".rt-dmg")).toBeNull();
    // The capitalized defined term and the creature-context lowercase both ink.
    expect(
      toks(hl("en", "You can see any Invisible creature nearby."), "rt-cond")
    ).toEqual([["Invisible", "var(--cond-invisible-ink)"]]);
    expect(
      toks(hl("en", "It becomes invisible, gaining the Invisible condition."), "rt-cond")
    ).toEqual([["Invisible", "var(--cond-invisible-ink)"]]);
    // IT: the object form stays plain; the capitalized defined term inks.
    expect(
      hl("it", "una barriera invisibile di forza").querySelector(".rt-cond")
    ).toBeNull();
    expect(toks(hl("it", "una creatura Invisibile"), "rt-cond")).toEqual([
      ["Invisibile", "var(--cond-invisible-ink)"],
    ]);
  });

  it("(g3) IT inks 'invisible' capital-only — native-order lowercase stays plain", () => {
    // Italian writes native adjective order ("creatura invisibile"), and the
    // corpus's mechanical uses are the capitalized "Invisibile"/"Invisibili"
    // (×44+), so IT inks the defined term ONLY; a lowercase native-order
    // "creatura invisibile" stays plain (as do lowercase objects/verbs).
    expect(
      hl("it", "Una creatura invisibile evita il tuo colpo.").querySelector(".rt-cond")
    ).toBeNull();
    expect(
      toks(hl("it", "ha la condizione Invisibile per la durata"), "rt-cond")
    ).toEqual([["Invisibile", "var(--cond-invisible-ink)"]]);
    expect(toks(hl("it", "vedi le creature Invisibili nel raggio"), "rt-cond")).toEqual([
      ["Invisibili", "var(--cond-invisible-ink)"],
    ]);
    // The old IT lowercase arm was a dead English-order lookahead — it could only
    // fire on adjective-first adjacency Italian never writes. It is gone, so even
    // that contrived adjacency no longer inks (fails-before, when the arm existed).
    expect(
      hl("it", "invisibile creatura non bersagliabile").querySelector(".rt-cond")
    ).toBeNull();
  });

  it("(h) vocabulary integrity: every variant key is a real condition id", () => {
    const ids = new Set(getAllConditionIds());
    for (const locale of LOCALES) {
      for (const key of Object.keys(RULES_PROSE[locale].conditionVariants)) {
        expect(ids.has(key), `${locale} variant key "${key}"`).toBe(true);
      }
    }
  });
});

describe("highlightRulesText — values (.rt-value)", () => {
  it("(i) lifts dice (1d6, 2d8+3) as the lit value register, locale-invariant", () => {
    for (const loc of LOCALES) {
      const texts = toks(hl(loc, "Roll 1d6 and 2d8+3 for the effect"), "rt-value").map(
        ([t]) => t
      );
      expect(texts).toContain("1d6");
      expect(texts).toContain("2d8+3");
    }
  });

  it("(j) lifts the save DC token for the ACTIVE locale only", () => {
    expect(
      hl("en", "on a failed DC 15 save").querySelector(".rt-value")?.textContent
    ).toBe("DC 15");
    expect(
      hl("it", "con un tiro salvezza CD 15").querySelector(".rt-value")?.textContent
    ).toBe("CD 15");
    expect(hl("en", "tiro CD 15").querySelector(".rt-value")).toBeNull();
    expect(hl("it", "a DC 15 save").querySelector(".rt-value")).toBeNull();
  });

  it("(k) lifts measured distance/duration but never a bare integer", () => {
    const en = hl("en", "a 30-foot cone for 10 minutes near 5 creatures");
    const enVals = toks(en, "rt-value").map(([t]) => t);
    expect(enVals).toContain("30-foot");
    expect(enVals).toContain("10 minutes");
    expect(enVals.some((t) => t?.includes("5"))).toBe(false);
    // A word that merely BEGINS with a unit stem is not partially lifted:
    // "10 daylight" must not surface a "10 day" fragment.
    const day = hl("en", "in 10 daylight hours");
    expect(toks(day, "rt-value").some(([t]) => t?.includes("day"))).toBe(false);

    // EN small-scale unit: inch / inches (item prose — "a 1-inch cube",
    // "at least 1 cubic inch"), hyphen and space forms both lift.
    const inch = hl("en", "a 1-inch cube and a wall 6 inches thick");
    const inchVals = toks(inch, "rt-value").map(([t]) => t);
    expect(inchVals).toContain("1-inch");
    expect(inchVals).toContain("6 inches");
    // The number must sit immediately before the unit — "pinch" (which merely
    // CONTAINS "inch") and "1 cubic inch" (number split off by "cubic") never lift.
    expect(hl("en", "a pinch of powdered iron").querySelector(".rt-value")).toBeNull();
    expect(
      toks(hl("en", "a diamond of 1 cubic inch"), "rt-value").some((t) =>
        t[0]?.includes("inch")
      )
    ).toBe(false);

    const itVals = toks(hl("it", "un cono di 9 metri per 10 minuti"), "rt-value").map(
      ([t]) => t
    );
    expect(itVals).toContain("9 metri");
    expect(itVals).toContain("10 minuti");
    // IT small-scale unit: centimetr[oi] (magic-item prose — "misura circa 2
    // centimetri di diametro", "ha un diametro di circa 30 centimetri").
    const cm = hl("it", "una sfera di 30 centimetri di diametro");
    expect(toks(cm, "rt-value").map(([t]) => t)).toContain("30 centimetri");
  });

  it("(k2) a decimal/thousand-separated measure is ONE token, not split mid-number", () => {
    // IT "1,5 metri" (×153 in the corpus) must lift whole, never plain-"1," + "5 metri".
    const it = hl("it", "ogni creatura entro 1,5 metri da te");
    expect(toks(it, "rt-value")).toEqual([["1,5 metri", ""]]);
    expect(it.textContent).toBe("ogni creatura entro 1,5 metri da te");
    // EN thousands separator likewise.
    expect(toks(hl("en", "with a range of 1,000 feet"), "rt-value")).toEqual([
      ["1,000 feet", ""],
    ]);
    // Guard: a plain integer + unit still works (no separator).
    expect(hl("en", "a 20-foot cone").querySelector(".rt-value")?.textContent).toBe(
      "20-foot"
    );
    // IT decimal small-scale measure lifts whole ("2,5 centimetri", the Pearl of
    // Power / Bowl of Commanding item prose), never plain-"2," + "5 centimetri".
    expect(toks(hl("it", "misura circa 2,5 centimetri di diametro"), "rt-value")).toEqual(
      [["2,5 centimetri", ""]]
    );
  });
});

describe("highlightRulesText — Advantage / Disadvantage (.rt-adv / .rt-dis)", () => {
  it("(l) inks the capitalized defined terms per locale; lowercase stays plain", () => {
    const en = hl("en", "Attack rolls have Advantage; its rolls have Disadvantage.");
    expect(en.querySelector(".rt-adv")?.textContent).toBe("Advantage");
    expect(en.querySelector(".rt-dis")?.textContent).toBe("Disadvantage");
    const it = hl("it", "I tiri hanno Vantaggio; i suoi hanno Svantaggio.");
    expect(it.querySelector(".rt-adv")?.textContent).toBe("Vantaggio");
    expect(it.querySelector(".rt-dis")?.textContent).toBe("Svantaggio");
    expect(
      hl("en", "this is an advantage in combat").querySelector(".rt-adv")
    ).toBeNull();
  });

  it("(l2) lowercase adv/dis ink in verb phrases; only the word, never the verb", () => {
    // EN: "has/have/with/gains advantage|disadvantage" — the mechanical lowercase
    // forms the corpus writes (Charm Person's IT twin etc.).
    const en = hl(
      "en",
      "The attacker has advantage and the target rolls with disadvantage."
    );
    // Exactly the adv/dis WORD is lifted — never "has advantage" / "with disadvantage".
    expect(toks(en, "rt-adv")).toEqual([["advantage", ""]]);
    expect(toks(en, "rt-dis")).toEqual([["disadvantage", ""]]);
    // IT: "con (s)vantaggio".
    expect(
      hl("it", "il tiro è effettuato con vantaggio").querySelector(".rt-adv")?.textContent
    ).toBe("vantaggio");
    expect(
      hl("it", "la creatura tira con svantaggio").querySelector(".rt-dis")?.textContent
    ).toBe("svantaggio");
    // False-positive guard: a free-standing lowercase word (no verb gate) stays plain.
    expect(hl("en", "a real advantage over foes").querySelector(".rt-adv")).toBeNull();
    expect(hl("it", "un grande vantaggio tattico").querySelector(".rt-adv")).toBeNull();
  });

  it("(l3) IT lowercase adv/dis ink after the corpus's real verb forms, not 'con' only", () => {
    // The IT corpus writes "ha/hai/hanno/avere (anche) (s)vantaggio" in lower
    // case (×20+), all mechanical — the old `con`-only gate missed every one.
    expect(
      toks(hl("it", "ogni creatura ha svantaggio ai tiri per colpire"), "rt-dis")
    ).toEqual([["svantaggio", ""]]);
    expect(
      toks(hl("it", "le altre creature hanno vantaggio sul tiro"), "rt-adv")
    ).toEqual([["vantaggio", ""]]);
    // The intervening "anche" is spanned, and the sentence-initial capital verb works.
    expect(
      hl("it", "Hai anche vantaggio contro quel bersaglio").querySelector(".rt-adv")
        ?.textContent
    ).toBe("vantaggio");
    // Only the adv/dis WORD lifts — never the verb.
    expect(
      hl("it", "ogni creatura ha svantaggio").querySelector(".rt-dis")?.textContent
    ).toBe("svantaggio");
    // Guard: a bare "il vantaggio" (no verb gate) stays plain.
    expect(
      hl("it", "questo è il vantaggio del piano").querySelector(".rt-adv")
    ).toBeNull();
  });
});

describe("highlightRulesText — mark safety through InlineMarkdown", () => {
  it("(m) keeps markdown structure: **Label.** = one <strong>, code/links never lifted", () => {
    const c = md("en", "**Frightened.** near `1d6` and [1d6](https://x.y). Deal 1d6.");
    // The bold label is exactly one <strong>, is NOT a grammar token, and its
    // inner condition word is NOT re-processed (elements pass through untouched).
    const label = [...c.querySelectorAll("strong")].filter(
      (n) => n.textContent === "Frightened."
    );
    expect(label).toHaveLength(1);
    expect(label[0]?.className).toBe("");
    expect(c.querySelector(".rt-cond")).toBeNull();
    // The code span stays literal — no highlight inside.
    const code = c.querySelector("code.md-code");
    expect(code?.textContent).toBe("1d6");
    expect(code?.querySelector(".rt-value")).toBeNull();
    // The link label passes through — its 1d6 is not lifted.
    const link = c.querySelector("a.md-link");
    expect(link?.textContent).toBe("1d6");
    expect(link?.querySelector(".rt-value")).toBeNull();
    // Only the trailing PLAIN "1d6" is lifted → exactly one .rt-value.
    const vals = c.querySelectorAll("strong.rt-value");
    expect(vals).toHaveLength(1);
    expect(vals[0]?.textContent).toBe("1d6");
  });

  it("(n) WITHOUT the highlight prop, InlineMarkdown never lifts (shared prose safe)", () => {
    const { container } = render(
      <InlineMarkdown text="Deal 8d6 Fire damage while Frightened for 10 minutes" />
    );
    expect(container.querySelector(".rt-dmg")).toBeNull();
    expect(container.querySelector(".rt-cond")).toBeNull();
    expect(container.querySelector(".rt-value")).toBeNull();
  });
});

describe("highlightRulesText — purity", () => {
  it("(o) is structurally pure — same input, same nodes", () => {
    const fn = highlightRulesText("en");
    const input = "Deal 8d6 Fire damage while Frightened for 10 minutes";
    const a = render(<div>{fn(input)}</div>).container.innerHTML;
    const b = render(<div>{fn(input)}</div>).container.innerHTML;
    expect(a).toBe(b);
  });
});

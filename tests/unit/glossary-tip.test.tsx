/**
 * GlossaryTip — the ONE plain-language glossary primitive (P2) + its catalogue.
 *
 * Behaviour: the trigger is a real button wearing the term label, carrying the
 * "Learn about …" accessible name; clicking it opens the branded popover with
 * the term's rubric + plain-language body; it renders in BOTH locales (the body
 * resolves from `glossary.term.<id>` in the active catalogue).
 *
 * Catalogue guards (table-driven):
 *  - every glossary id resolves to a non-empty body in EN AND IT (the parity
 *    test already pins key equality; this pins resolution through i18next);
 *  - NO DEAD ENTRY: every catalogue id is actually referenced from src/ (a
 *    `term="<id>"` / `term: "<id>"` site) — rule 19, the catalogue can't bloat.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { join } from "node:path";
import { srcFiles, readSrc } from "./__helpers__/src-files";
import i18n from "@/i18n";
import { GlossaryTip } from "@/components/shared/GlossaryTip";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";

const EN_TERMS = enGlossary.glossary.term;
const IT_TERMS = itGlossary.glossary.term;
const TERM_IDS = Object.keys(EN_TERMS) as (keyof typeof EN_TERMS)[];

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("GlossaryTip — behaviour", () => {
  it("renders the label as a button with the 'Learn about' accessible name", () => {
    render(
      <GlossaryTip term="armorClass" rubric="Armor Class">
        AC
      </GlossaryTip>
    );
    const trigger = screen.getByRole("button", { name: "Learn about Armor Class" });
    expect(trigger).toHaveTextContent("AC");
    expect(trigger).toHaveClass("glossary-term");
  });

  it("falls back to the rubric as the visible label when no children are given", () => {
    render(<GlossaryTip term="hitDice" rubric="Hit Dice" />);
    expect(
      screen.getByRole("button", { name: "Learn about Hit Dice" })
    ).toHaveTextContent("Hit Dice");
  });

  it("opens the popover with the rubric head + the EN body on click", () => {
    render(
      <GlossaryTip term="proficiencyBonus" rubric="Proficiency Bonus">
        PB
      </GlossaryTip>
    );
    fireEvent.click(screen.getByRole("button", { name: /learn about/i }));
    const pop = screen.getByRole("dialog");
    expect(pop).toHaveTextContent("Proficiency Bonus");
    expect(pop).toHaveTextContent(EN_TERMS.proficiencyBonus);
  });

  it("renders the IT body when the locale is Italian", async () => {
    await i18n.changeLanguage("it");
    render(
      <GlossaryTip term="armorClass" rubric="Classe Armatura">
        CA
      </GlossaryTip>
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Scopri cosa significa Classe Armatura" })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(IT_TERMS.armorClass);
  });
});

describe("glossary catalogue — completeness (table-driven)", () => {
  it.each(TERM_IDS)("'%s' resolves to a non-empty body in EN and IT", (id) => {
    const en = EN_TERMS[id];
    const itBody = IT_TERMS[id];
    expect(typeof en, `EN glossary.term.${id}`).toBe("string");
    expect(en.trim().length, `EN glossary.term.${id} is empty`).toBeGreaterThan(0);
    expect(typeof itBody, `IT glossary.term.${id}`).toBe("string");
    expect(itBody.trim().length, `IT glossary.term.${id} is empty`).toBeGreaterThan(0);
    // An IT body byte-identical to EN is an untranslated leak (rule 6).
    expect(itBody, `IT glossary.term.${id} is identical to EN`).not.toBe(en);
  });

  // RA-34 — the always-present attack-roll tip now states the 2024 Critical Hit
  // rule (roll ALL the attack's damage dice, incl. Sneak Attack, twice; modifier
  // added once), so the crit consequence reaches every attack card (weapon +
  // spell) rather than nowhere. Content-level pin (cheapest that fixes the fact).
  it("RA-34 — the attack-roll body states the Critical Hit damage-dice doubling (EN + IT)", () => {
    expect(EN_TERMS.attackRoll).toMatch(/Critical Hit/);
    expect(EN_TERMS.attackRoll.toLowerCase()).toContain("twice");
    expect(IT_TERMS.attackRoll).toMatch(/Colpo Critico/);
    expect(IT_TERMS.attackRoll.toLowerCase()).toContain("due volte");
  });

  it("has no dead entry: every catalogue id is referenced from src/", () => {
    const i18nDir = join("src", "i18n");
    const corpus = srcFiles({ exts: [".ts", ".tsx", ".json"] })
      .filter((p) => !p.includes(i18nDir))
      .map((p) => readSrc(p))
      .join("\n");
    const unused = TERM_IDS.filter(
      (id) => !corpus.includes(`term="${id}"`) && !corpus.includes(`term: "${id}"`)
    );
    expect(
      unused,
      `these glossary entries are wired nowhere — wire them or delete them:\n${unused.join("\n")}`
    ).toEqual([]);
  });
});

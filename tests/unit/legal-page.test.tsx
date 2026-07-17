/**
 * LegalPage — the Legal & Attribution colophon spread (`/legal`).
 *
 * Pins the load-bearing legal obligation: the shipped prose draws on BOTH the
 * SRD 5.2.1 and the SRD 5.1 (each CC-BY-4.0), and each document's license
 * requires its own EXACT attribution statement — both must render verbatim (an
 * accidental reword would break the CC-BY-4.0 attribution term) — struck as
 * engraved plaques (quotable `<blockquote>`s) — the four colophon sections are
 * present as headings with their anchor ids, and the license links resolve.
 * All four verbatim statements (EN + WotC's official IT texts) are also
 * asserted byte-exact in BOTH locale catalogues so none can silently drift.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LegalPage } from "@/app/routes/legal";
import enLegal from "@/i18n/en/ui/legal.json";
import itLegal from "@/i18n/it/ui/legal.json";

// The exact attributions the CC-BY-4.0 licenses require for SRD 5.2.1 and
// SRD 5.1 content (from the "Legal Information" pages of WotC's
// SRD_CC_v5.2.1.pdf / SRD_CC_v5.1.pdf and their official Italian editions
// IT_SRD_CC_v5.2.1.pdf / SRD_CC_v5.1_IT.pdf). Each is reproduced verbatim and
// must never be reworded.
const REQUIRED_EN_521 =
  "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.";
const REQUIRED_EN_51 =
  "This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.";
const REQUIRED_IT_521 =
  "Quest'opera include materiale tratto dal System Reference Document 5.2.1 (\"SRD 5.2.1\") di Wizards of the Coast LLC, disponibile all'indirizzo https://www.dndbeyond.com/srd. Il SRD 5.2.1 è concesso in licenza ai sensi della licenza di attribuzione 4.0 Internazionale di Creative Commons, disponibile all'indirizzo https://creativecommons.org/licenses/by/4.0/legalcode.";
const REQUIRED_IT_51 =
  "Questo lavoro include materiale del System Reference Document 5.1 (“SRD 5.1”) di Wizards of the Coast LLC disponibile al sito https://dnd.wizards.com/it/resources/systems-reference-document. L’SRD 5.1 è concesso in licenza sotto l’Attribuzione 4.0 Internazionale di Creative Commons disponibile al sito https://creativecommons.org/licenses/by/4.0/legalcode.it.";

describe("LegalPage colophon", () => {
  it("renders BOTH exact required SRD CC-BY-4.0 attribution statements verbatim, as quotable blockquotes", () => {
    render(
      <MemoryRouter>
        <LegalPage />
      </MemoryRouter>
    );
    for (const required of [REQUIRED_EN_521, REQUIRED_EN_51]) {
      const statement = screen.getByText(required);
      // Each plaque is a real <blockquote> — the statement stays a quoted, verbatim block.
      expect(statement.tagName).toBe("BLOCKQUOTE");
    }
  });

  it("renders the four colophon section headings and the license links", () => {
    render(
      <MemoryRouter>
        <LegalPage />
      </MemoryRouter>
    );
    for (const heading of ["Attribution", "Licenses", "Trademarks", "The App"]) {
      expect(
        screen.getByRole("heading", { name: heading, level: 2 })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", {
        name: /Creative Commons Attribution 4\.0 International/i,
      })
    ).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/legalcode");
    expect(screen.getByRole("link", { name: /MIT License/i })).toHaveAttribute(
      "href",
      "https://opensource.org/license/mit"
    );
    // The page owns the single <h1> the a11y gate anchors on.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Legal & Attribution"
    );
  });

  it("keeps the four section anchors and sets the two licenses as definition terms", () => {
    render(
      <MemoryRouter>
        <LegalPage />
      </MemoryRouter>
    );
    // The section anchor ids survive (deep links keep working; the spread deleted the
    // rail, not the anchors).
    for (const id of ["attribution", "licenses", "trademarks", "app"]) {
      expect(document.getElementById(id)).not.toBeNull();
    }
    // The twin license columns are a real definition list: term → definition —
    // pinned against the catalogue (structure + order, never frozen copy).
    const terms = screen.getAllByRole("term").map((dt) => dt.textContent);
    expect(terms).toEqual([
      enLegal.legal.licenses.srdTerm,
      enLegal.legal.licenses.appTerm,
    ]);
  });

  it("keeps all four verbatim attribution strings byte-exact in both locale catalogues", () => {
    expect(enLegal.legal.attribution.statement).toBe(REQUIRED_EN_521);
    expect(enLegal.legal.attribution.statement51).toBe(REQUIRED_EN_51);
    // WotC's official Italian statements (IT_SRD_CC_v5.2.1.pdf / SRD_CC_v5.1_IT.pdf).
    expect(itLegal.legal.attribution.statement).toBe(REQUIRED_IT_521);
    expect(itLegal.legal.attribution.statement51).toBe(REQUIRED_IT_51);
  });
});

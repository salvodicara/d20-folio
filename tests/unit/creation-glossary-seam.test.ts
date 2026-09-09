import { describe, expect, it } from "vitest";
import enGlossary from "@/i18n/en/ui/glossary.json";
import { CREATION_GLOSSARY, creationGlossaryTerm } from "@/lib/views/creation-glossary";

describe("creation glossary seam", () => {
  it("maps every creation rubric to a term the catalogue carries", () => {
    const ids = new Set(Object.keys(enGlossary.glossary.term));
    for (const [rubric, { term }] of Object.entries(CREATION_GLOSSARY))
      expect(ids.has(term), `${rubric} → ${term}`).toBe(true);
  });
  it("answers the rubrics the audit named and nothing for an unknown one", () => {
    expect(creationGlossaryTerm("class")).toBe("characterClass");
    expect(creationGlossaryTerm("skills")).toBe("skillProficiency");
    expect(creationGlossaryTerm("not-a-rubric")).toBeUndefined();
  });
});

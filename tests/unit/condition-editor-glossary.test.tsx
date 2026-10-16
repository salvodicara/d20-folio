/**
 * ConditionEditor teaches what a condition does: the chip's name is a GlossaryTip
 * (tap opens the plain-language line) and each picker row carries the same line
 * as its hover gloss. The × stays its own control.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import i18n from "@/i18n";
import { ConditionEditor } from "@/features/character/molecules/ConditionEditor";
import enGlossary from "@/i18n/en/ui/glossary.json";
import itGlossary from "@/i18n/it/ui/glossary.json";

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("ConditionEditor: beginner glossary", () => {
  it("tapping a condition chip's name opens its plain-language line", () => {
    const onToggle = vi.fn();
    render(<ConditionEditor conditions={["prone"]} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Learn about Prone" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(enGlossary.glossary.term.prone);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("speaks Italian with the official condition name", async () => {
    await i18n.changeLanguage("it");
    render(<ConditionEditor conditions={["restrained"]} onToggle={() => {}} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Scopri cosa significa Trattenuto" })
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      itGlossary.glossary.term.restrained
    );
  });

  it("each picker row carries the condition's line as its gloss", () => {
    render(<ConditionEditor conditions={[]} onToggle={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
    expect(screen.getByRole("option", { name: "Poisoned" })).toHaveAttribute(
      "title",
      enGlossary.glossary.term.poisoned
    );
  });
});

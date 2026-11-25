/**
 * Tappable rule words (#1230, gap map E2; Foundry's `&Reference`, D&D Beyond's tap
 * on a condition): on the new UI a condition, Advantage, Disadvantage, Bonus Action
 * or Reaction inside rules prose is a button that opens a pane with the term's plain
 * explanation from the glossary. The classic sheet's highlighter stays as it was:
 * the same ink, no button.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { highlightRulesText } from "@/components/shared/highlightRulesText";
import i18n from "@/i18n";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});

const tappable = (locale: "en" | "it", text: string) =>
  render(
    <div className="fui">{highlightRulesText(locale, { tappable: true })(text)}</div>
  );

describe("tappable rule words", () => {
  it("a condition opens its explanation, keeping its ink", () => {
    tappable("en", "The target is frightened until the end of its next turn.");
    const word = screen.getByRole("button", { name: /frightened/i });
    expect(word.querySelector("strong.rt-cond")).not.toBeNull();
    fireEvent.click(word);
    const pane = screen.getByRole("dialog", { name: "Frightened" });
    expect(pane.textContent).toContain(i18n.t("glossary.term.frightened"));
  });

  it("Advantage, Disadvantage, Bonus Action and Reaction are tappable; a bare Action is not", () => {
    tappable(
      "en",
      "Take the Dash action as a Bonus Action. You have Advantage; it has Disadvantage. Use your Reaction."
    );
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    expect(names).toEqual(["Bonus Action", "Advantage", "Disadvantage", "Reaction"]);
  });

  it("works in Italian, inflected forms included", async () => {
    await i18n.changeLanguage("it");
    try {
      tappable("it", "Il bersaglio è spaventata fino alla fine del suo turno.");
      fireEvent.click(screen.getByRole("button", { name: /spaventata/i }));
      expect(screen.getByRole("dialog").textContent).toContain(
        i18n.t("glossary.term.frightened")
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("the classic highlighter is untouched: the same ink, no button", () => {
    const { container } = render(
      <div>{highlightRulesText("en")("The target is frightened and has Advantage.")}</div>
    );
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("strong.rt-cond")?.textContent).toBe("frightened");
  });
});

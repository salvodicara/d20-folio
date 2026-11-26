/**
 * A sheet number's pane (#1230, gap map E2; D&D Beyond's tap-a-number pane): the
 * total is the tile's number for every number the sheet shows, the pane lists where it
 * comes from, «Customize» sets a fixed value and «Use the computed value» takes it
 * back, speed is typed in the player's units (metres in Italian) and stored in feet,
 * and a read-only sheet shows the number with no controls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({}));
import { fireEvent, render, screen } from "@testing-library/react";

import { playHeaderView } from "@/domains/play/play-header-view";
import { playLeftView } from "@/domains/play/play-left-view";
import { playNumberView } from "@/domains/play/play-number-view";
import { deriveMaxHp } from "@/lib/aggregate-character";
import { PlayNumberPane } from "@/domains/play/ui/PlayNumberPane";
import i18n from "@/i18n";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import { ABILITY_CODES } from "@/types/ability";
import type { CharacterDoc } from "@/types/character";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
  useUndoStore.getState().clear();
  const doc = structuredClone(MOCK_CHARACTER);
  doc.character.acOverride = null;
  doc.character.speedOverride = null;
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
  });
});

const live = () => useCharacterStore.getState().character as CharacterDoc;

describe("the pane's total is the tile's number", () => {
  it("for the header numbers, the six abilities, their saves and every skill", () => {
    const doc = live();
    const head = playHeaderView(doc, "en");
    const total = (key: Parameters<typeof playNumberView>[2]) =>
      playNumberView(doc, "en", key).total;
    expect(total({ kind: "ac" })).toBe(head.numbers.ac);
    expect(total({ kind: "initiative" })).toBe(head.numbers.initiative);
    expect(total({ kind: "speed" })).toBe(head.numbers.speedFt);
    expect(total({ kind: "proficiency" })).toBe(head.numbers.proficiency);
    expect(total({ kind: "maxHp" })).toBe(head.hp.max);
    for (const a of head.abilities) {
      expect(total({ kind: "ability", ability: a.id })).toBe(a.score);
      expect(total({ kind: "save", ability: a.id })).toBe(a.saveTotal);
    }
    expect(head.abilities.map((a) => a.id)).toEqual(ABILITY_CODES);
    for (const s of playLeftView(doc, "en").allSkills)
      expect(total({ kind: "skill", id: s.id })).toBe(s.bonus);
  });
});

function open(
  key: Parameters<typeof playNumberView>[2],
  locale: "en" | "it" = "en",
  readonly = false
) {
  return render(
    <PlayNumberPane
      numberKey={key}
      doc={live()}
      locale={locale}
      readonly={readonly}
      onClose={() => undefined}
    />
  );
}

describe("the pane", () => {
  it("lists where the number comes from", () => {
    open({ kind: "ac" });
    const parts = screen.getByRole("list", { name: "Breakdown" });
    const view = playNumberView(live(), "en", { kind: "ac" });
    expect(parts.querySelectorAll("li")).toHaveLength(view.parts?.length ?? 0);
    expect(view.parts?.length).toBeGreaterThan(0);
  });

  it("Customize sets a fixed value; the pane then says so and lists the manual adjustment", () => {
    const first = open({ kind: "ac" });
    fireEvent.change(screen.getByLabelText("Fixed value"), { target: { value: "21" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(live().character.acOverride).toBe(21);
    first.unmount();
    open({ kind: "ac" });
    expect(screen.getByText("Set by hand")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Breakdown" }).textContent).toContain(
      "Manual adjustment"
    );
    fireEvent.click(screen.getByRole("button", { name: "Use the computed value" }));
    expect(live().character.acOverride).toBeNull();
  });

  it("a value that is not a number can't be saved", () => {
    open({ kind: "initiative" });
    fireEvent.change(screen.getByLabelText("Fixed value"), { target: { value: "abc" } });
    expect(
      screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")
    ).toBe("true");
  });

  it("speed is typed in metres in Italian and stored in feet", async () => {
    await i18n.changeLanguage("it");
    try {
      open({ kind: "speed" }, "it");
      fireEvent.change(screen.getByLabelText("Valore fisso (m)"), {
        target: { value: "12" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Salva" }));
      expect(live().character.speedOverride).toBe(40);
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("speed's parts are in the player's units, as its total", async () => {
    await i18n.changeLanguage("it");
    try {
      open({ kind: "speed" }, "it");
      const parts = screen.getByRole("list", { name: "Scomposizione" }).textContent;
      expect(parts).toMatch(/\+9\s?m/);
      expect(parts).not.toContain("+30");
    } finally {
      await i18n.changeLanguage("en");
    }
  });

  it("a read-only sheet shows the number and its parts, with no controls", () => {
    open({ kind: "skill", id: "stealth" }, "en", true);
    expect(screen.queryByLabelText("Fixed value")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("each pane says the rule its number follows (D&D Beyond's pane opens with the rule)", () => {
  const cases: [Parameters<typeof playNumberView>[2], string][] = [
    [{ kind: "ac" }, "armorClass"],
    [{ kind: "initiative" }, "initiative"],
    [{ kind: "speed" }, "speed"],
    [{ kind: "proficiency" }, "proficiencyBonus"],
    [{ kind: "ability", ability: "DEX" }, "abilityScores"],
    [{ kind: "save", ability: "WIS" }, "savingThrow"],
    [{ kind: "skill", id: "stealth" }, "skillCheck"],
    [{ kind: "maxHp" }, "hitPoints"],
  ];
  it.each(cases)("%o → the glossary's %s sentence", (key, term) => {
    open(key);
    const rule = i18n.t(`glossary.term.${term}`);
    expect(rule).not.toContain("glossary.");
    expect(screen.getByRole("dialog").textContent).toContain(rule);
  });

  it("in Italian too, and on a read-only sheet", async () => {
    await i18n.changeLanguage("it");
    try {
      open({ kind: "ac" }, "it", true);
      expect(screen.getByRole("dialog").textContent).toContain(
        i18n.t("glossary.term.armorClass")
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

describe("the max HP pane says what is stored: a correction that keeps moving", () => {
  it("its field is the current maximum and its help names the correction typed", () => {
    const doc = live();
    doc.character.hpBonus = undefined;
    doc.character.hp = { max: deriveMaxHp(doc.character) };
    useCharacterStore.setState({ character: doc });
    open({ kind: "maxHp" });
    const max = playNumberView(live(), "en", { kind: "maxHp" }).total;
    expect(screen.queryByLabelText("Fixed value")).toBeNull();
    fireEvent.change(screen.getByLabelText("Current maximum"), {
      target: { value: String(max - 4) },
    });
    expect(screen.getByRole("dialog").textContent).toContain(
      "We save the difference as a correction (−4)"
    );
  });

  it("a corrected max is tagged «Adjusted», not «Set by hand»", () => {
    const doc = live();
    doc.character.hpBonus = 3;
    useCharacterStore.setState({ character: doc });
    open({ kind: "maxHp" });
    const text = screen.getByRole("dialog").textContent;
    expect(text).toContain("Adjusted");
    expect(text).not.toContain("Set by hand");
  });
});

/**
 * A fight line's marks and numbers, as each side reads them: the DM sees every mark the
 * line carries; a player sees a revealed monster's numbers and, of the marks, only «Ally».
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import type { FightRow } from "@/domains/combat/fight-rows-view";
import { FightLine } from "@/domains/combat/ui/FightLine";

const ogre: FightRow = {
  ids: ["m1"],
  kind: "monster",
  name: "Ogre",
  count: 1,
  initiative: 12,
  current: false,
  mustRoll: false,
  hp: { current: 40, max: 59, temp: 0 },
  bands: [{ band: "healthy", count: 1 }],
  chips: [],
  art: null,
  marks: [
    { mark: "hidden", count: 1 },
    { mark: "revealed", count: 1 },
    { mark: "ally", count: 1 },
  ],
};

describe("FightLine marks", () => {
  it("a player reads the numbers and only «Ally»", () => {
    render(<FightLine row={ogre} />);
    expect(screen.getByText("40/59")).toBeInTheDocument();
    expect(screen.getByText("Ally")).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).toBeNull();
    expect(screen.queryByText("HP shown")).toBeNull();
  });

  it("the DM reads every mark", () => {
    render(
      <FightLine
        row={ogre}
        dm={{
          hp: { current: 40, max: 59 },
          label: "Damage and healing: Ogre",
          onHp: () => {},
        }}
      />
    );
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("HP shown")).toBeInTheDocument();
    expect(screen.getByText("Ally")).toBeInTheDocument();
  });

  it("a group counts each mark", () => {
    render(
      <FightLine
        row={{ ...ogre, count: 3, marks: [{ mark: "hidden", count: 2 }] }}
        dm={{
          hp: { current: 40, max: 59 },
          label: "Damage and healing: Ogre",
          onHp: () => {},
        }}
      />
    );
    expect(screen.getByText("2 hidden")).toBeInTheDocument();
  });
});

/**
 * The new Gruppo tab's party table for the DM (the classic DM tab's «Il gruppo a colpo
 * d'occhio»): one row per hero with AC, max HP, initiative, the three passives, speed,
 * senses and the six saves; the best of each comparable column is marked in words as
 * well as in gold, and a proficient save says so.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));

import { PartyTable } from "@/domains/campaign/ui/PartyTable";
import { partySummary } from "@/features/campaigns/party-summary";
import { formatModifier } from "@/lib/utils";
import type { PartyMemberStats } from "@/features/campaigns/party-stats";

const stats = (extra: Partial<PartyMemberStats>): PartyMemberStats =>
  ({
    level: 3,
    ac: 14,
    currentHp: 20,
    maxHp: 24,
    tempHp: 0,
    passivePerception: 12,
    passiveInsight: 11,
    passiveInvestigation: 10,
    saves: (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((code) => ({
      code,
      bonus: 1,
      proficient: code === "DEX",
    })),
    senses: [],
    speeds: [],
    walkingSpeedFt: 30,
    initiativeBonus: 2,
    conditions: [],
    ...extra,
  }) as PartyMemberStats;

const view = {
  ...partySummary([
    {
      uid: "a",
      name: "Ana",
      stats: stats({ ac: 18, senses: [{ kind: "darkvision", rangeFt: 60 }] }),
    },
    { uid: "b", name: "Bo", stats: stats({ passivePerception: 15 }) },
  ]),
  loading: 0,
};

describe("the DM's party table", () => {
  it("one row per hero, with the passives, speed, senses and saves", () => {
    render(<PartyTable view={view} locale="en" />);
    const table = screen.getByRole("table", { name: "Party at a glance" });
    expect(within(table).getAllByRole("row")).toHaveLength(4); // two header rows + two heroes
    const ana = within(table).getByRole("row", { name: /Ana/ });
    expect(ana).toHaveTextContent("Darkvision");
    expect(
      within(table).getByRole("columnheader", { name: "Insight" })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Saving Throws" })
    ).toBeInTheDocument();
  });

  it("the best value says so in words, not only in gold", () => {
    render(<PartyTable view={view} locale="en" />);
    const ana = screen.getByRole("row", { name: /Ana/ });
    const bo = screen.getByRole("row", { name: /Bo/ });
    expect(within(ana).getByText("18").closest("[data-best]")).toHaveTextContent(
      "Best in the party"
    );
    expect(within(bo).getByText("15").closest("[data-best]")).not.toBeNull();
    expect(within(ana).queryAllByText("Best in the party")).toHaveLength(1);
  });

  it("a plain legend says what gold means", () => {
    render(<PartyTable view={view} locale="en" />);
    expect(screen.getAllByText("In gold: the highest value in the party")).toHaveLength(
      1
    );
  });

  it("a negative save reads through the shared formatter", () => {
    const low = {
      ...partySummary([
        {
          uid: "c",
          name: "Cy",
          stats: stats({
            saves: (["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((code) => ({
              code,
              bonus: code === "STR" ? -1 : 0,
              proficient: false,
            })),
          }),
        },
      ]),
      loading: 0,
    };
    render(<PartyTable view={low} locale="en" />);
    const cy = screen.getByRole("row", { name: /Cy/ });
    expect(within(cy).getByText(formatModifier(-1))).toBeInTheDocument();
  });

  it("on a phone, one card per hero with every number labelled", () => {
    render(<PartyTable view={view} locale="en" />);
    const card = screen.getByRole("listitem", { name: /Ana/ });
    expect(within(card).getByText("AC")).toBeInTheDocument();
    expect(within(card).getByText("Insight")).toBeInTheDocument();
    expect(within(card).getByText("18").closest("[data-best]")).not.toBeNull();
    expect(card).toHaveTextContent("Darkvision");
  });

  it("a proficient save says so", () => {
    render(<PartyTable view={view} locale="en" />);
    const ana = screen.getByRole("row", { name: /Ana/ });
    expect(within(ana).getAllByText("save proficiency")).toHaveLength(1);
  });
});

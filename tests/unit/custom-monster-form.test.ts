/**
 * The DM's own monster, typed on the new fight screen (the classic AddMonsterForm):
 * a name, Armor Class, maximum HP, an optional Challenge Rating (whole numbers or the
 * three fractions the rules print) and notes. An edit keeps what the form does not
 * show (a portrait, homebrew defenses, the structured stat block).
 */
import { describe, expect, it } from "vitest";

import {
  customMonsterFromForm,
  parseCrInput,
} from "@/domains/combat/custom-monster-form";
import type { CustomMonster } from "@/types/campaign";

const form = {
  name: " Ash Raider ",
  ac: "13",
  maxHp: "22",
  cr: "1/2",
  notes: " Hates fire ",
};

describe("parseCrInput", () => {
  it("reads whole numbers and the printed fractions", () => {
    expect(parseCrInput("1/8")).toBe("0.125");
    expect(parseCrInput("1/4")).toBe("0.25");
    expect(parseCrInput("0.5")).toBe("0.5");
    expect(parseCrInput(" 5 ")).toBe("5");
    expect(parseCrInput("")).toBeUndefined();
  });

  it("refuses anything else", () => {
    expect(parseCrInput("1/3")).toBeNull();
    expect(parseCrInput("31")).toBeNull();
    expect(parseCrInput("abc")).toBeNull();
  });
});

describe("customMonsterFromForm", () => {
  it("a new monster, trimmed", () => {
    expect(customMonsterFromForm(form)).toEqual({
      name: "Ash Raider",
      ac: 13,
      maxHp: 22,
      cr: "0.5",
      notes: "Hates fire",
    });
  });

  it("no CR and no notes leave them out", () => {
    expect(customMonsterFromForm({ ...form, cr: "", notes: "  " })).toEqual({
      name: "Ash Raider",
      ac: 13,
      maxHp: 22,
    });
  });

  it("an edit keeps what the form does not show", () => {
    const before: CustomMonster = {
      name: "Old",
      ac: 10,
      maxHp: 5,
      portraitUrl: "https://img/raider.webp",
      creatureType: "humanoid",
    };
    expect(customMonsterFromForm(form, before)).toMatchObject({
      name: "Ash Raider",
      ac: 13,
      portraitUrl: "https://img/raider.webp",
      creatureType: "humanoid",
    });
  });

  it("a blank name, an AC out of 0–40, HP out of 1–9999 or a bad CR is no monster", () => {
    expect(customMonsterFromForm({ ...form, name: "  " })).toBeNull();
    expect(customMonsterFromForm({ ...form, ac: "41" })).toBeNull();
    expect(customMonsterFromForm({ ...form, maxHp: "0" })).toBeNull();
    expect(customMonsterFromForm({ ...form, cr: "1/3" })).toBeNull();
  });
});

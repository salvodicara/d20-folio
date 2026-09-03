import { describe, expect, it } from "vitest";
import en from "@/i18n/en/ui/combatLog.json";
import it_ from "@/i18n/it/ui/combatLog.json";
import { ROLL_PURPOSES, type RollRecord } from "@/lib/combat/dice";
import { rollLine } from "@/lib/views/roll-view";

type Dict = Record<string, unknown>;
function translator(dict: Dict) {
  return (key: string, args: Record<string, string | number> = {}) => {
    const value = key
      .split(".")
      .reduce<unknown>((node, part) => (node as Dict | undefined)?.[part], dict);
    if (typeof value !== "string") throw new Error(`missing key ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(args[name]));
  };
}
const tEn = translator(en);
const tIt = translator(it_);
const base: RollRecord = {
  formula: "2d20kh1+5",
  faces: [7, 18],
  total: 23,
  seed: 4,
  source: "app",
  hidden: false,
  roller: "hero",
  purpose: "attack",
  label: null,
};

describe("rollLine", () => {
  it("renders an app roll with faces and total", () => {
    expect(rollLine(tEn, base, "p1", { uid: "p2", dm: false }, "Marco")).toBe(
      "Marco rolls 2d20kh1+5 for an attack: [7, 18] = 23"
    );
    expect(rollLine(tIt, base, "p1", { uid: "p2", dm: false }, "Marco")).toBe(
      "Marco tira 2d20kh1+5 per un attacco: [7, 18] = 23"
    );
  });
  it("renders a manual roll as entered from real dice", () => {
    expect(
      rollLine(
        tEn,
        { ...base, source: "manual", seed: null },
        "p1",
        { uid: "p1", dm: false },
        "Marco"
      )
    ).toContain("from real dice");
  });
  it("hides the faces of a hidden roll from everyone but the DM and the roller", () => {
    const hidden = { ...base, hidden: true };
    expect(rollLine(tEn, hidden, "dm", { uid: "p1", dm: false }, "The DM")).toBe(
      "The DM rolls hidden dice for an attack"
    );
    expect(rollLine(tEn, hidden, "dm", { uid: "dm", dm: true }, "The DM")).toContain(
      "= 23"
    );
    expect(rollLine(tEn, hidden, "p1", { uid: "p1", dm: false }, "Marco")).toContain(
      "= 23"
    );
    expect(rollLine(tEn, hidden, "p1", { uid: "dm", dm: true }, "Marco")).toContain(
      "= 23"
    );
  });
  it("names every purpose in both languages", () => {
    for (const purpose of ROLL_PURPOSES) {
      expect(() =>
        rollLine(tEn, { ...base, purpose }, "p1", { uid: "p1", dm: false }, "x")
      ).not.toThrow();
      expect(() =>
        rollLine(tIt, { ...base, purpose }, "p1", { uid: "p1", dm: false }, "x")
      ).not.toThrow();
    }
  });
});

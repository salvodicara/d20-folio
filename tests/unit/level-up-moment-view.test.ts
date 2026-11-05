/**
 * The full-height level-up («Momento BG3», owner's pick 2026-11-05): the step rail
 * says which questions are answered, owed or optional, and the live summary reads
 * the character the commit would save.
 */
import { describe, expect, it } from "vitest";

import { spells } from "@/data/spells";
import { levelUpAsks, NO_ANSWERS, toggleAnswer } from "@/domains/leveling/level-up-asks";
import { levelUpSteps, levelUpSummary } from "@/domains/leveling/level-up-moment-view";
import { commitLevelUp } from "@/lib/level-up-commit";
import { MOCK_CHARACTER } from "@/lib/mock";

const SCHOOL = new Map(spells.map((s) => [s.id, s.school]));
const doc = MOCK_CHARACTER; // Lyra Voss, Bard 9: level 10 asks a cantrip and a spell
const asks = (a = NO_ANSWERS) => levelUpAsks(doc, "bard", a, "it");

describe("levelUpSteps", () => {
  it("starts with Hit Points, then one step per question, in order", () => {
    const steps = levelUpSteps(asks());
    expect(steps[0]).toMatchObject({ key: "hp", state: "done" });
    expect(steps.slice(1).map((s) => s.key)).toEqual(asks().rows.map((r) => r.key));
  });

  it("marks a question owed until its picks are made, and a swap optional", () => {
    const first = asks();
    const byKey = new Map(levelUpSteps(first).map((s) => [s.key, s]));
    expect(byKey.get("newCantrips")?.state).toBe("owed");
    expect(byKey.get("swapRemove")?.state).toBe("optional");

    const row = first.rows.find((r) => r.key === "newCantrips");
    if (!row) throw new Error("level 10 asks a cantrip");
    const id = row.options[0]?.id ?? "";
    const answered = asks(toggleAnswer(NO_ANSWERS, row, id));
    const step = levelUpSteps(answered).find((s) => s.key === "newCantrips");
    expect(step).toMatchObject({ state: "done", picked: [row.options[0]?.label] });
  });

  it("counts what is still owed", () => {
    expect(levelUpSteps(asks()).filter((s) => s.state === "owed")).toHaveLength(2);
  });
});

describe("levelUpSummary", () => {
  it("reads the character the commit would save", () => {
    const after = commitLevelUp(doc, asks().picks);
    const s = levelUpSummary(after, "it");
    expect(s.level).toBe(10);
    expect(s.hp).toBe(after.character.hp.max);
    expect(s.abilities.map((a) => a.id)).toEqual([
      "STR",
      "DEX",
      "CON",
      "INT",
      "WIS",
      "CHA",
    ]);
    expect(s.abilities.find((a) => a.id === "CHA")?.score).toBe(20);
  });

  it("lists the known cantrips and spells with their school, cantrips apart", () => {
    const s = levelUpSummary(doc, "it");
    const known = doc.character.spells.flatMap((r) => ("srdId" in r ? [r.srdId] : []));
    expect([...s.cantrips, ...s.spells].map((x) => x.id).sort()).toEqual(
      [...known].sort()
    );
    for (const x of [...s.cantrips, ...s.spells]) expect(x.school).toBe(SCHOOL.get(x.id));
    expect(s.cantrips.map((x) => x.name)).toContain("Mano Magica");
    expect(
      s.cantrips.every((x) => spells.find((sp) => sp.id === x.id)?.level === 0)
    ).toBe(true);
    expect(s.spells.some((x) => x.name === "Parola Guaritrice")).toBe(true);
  });
});

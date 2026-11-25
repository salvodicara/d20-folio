/**
 * The level-up's optional «replace one» of a class pick (SRD 5.2.1):
 *   - Sorcerer: «Whenever you gain a Sorcerer level, you can replace one of your
 *     Metamagic options with one you don't know»;
 *   - Warlock: «Whenever you gain a Warlock level, you can replace one of your
 *     invocations with another one for which you qualify. You can't replace an
 *     invocation if it's a prerequisite for another invocation that you have»;
 *   - Fighter: «Whenever you gain a Fighter level, you can replace the feat you chose
 *     with a different Fighting Style feat».
 * Like the spell swap: a skippable row of what is known, then, once one is picked, a
 * row of what can take its place. Nothing changes unless the player opts in.
 */
import { describe, expect, it } from "vitest";

import {
  levelUpAsks,
  NO_ANSWERS,
  toggleAnswer,
  type AskKey,
  type LevelUpAnswers,
} from "@/domains/leveling/level-up-asks";
import { commitLevelUp } from "@/lib/level-up-commit";
import type { CharacterDoc, ClassEntry } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const ask = (doc: CharacterDoc, classId: string, a: LevelUpAnswers = NO_ANSWERS) =>
  levelUpAsks(doc, classId, a, "en");
const row = (doc: CharacterDoc, classId: string, key: AskKey, a = NO_ANSWERS) =>
  ask(doc, classId, a).rows.find((r) => r.key === key);
/** Toggle `id` in the row `key` as it stands after `a`. */
function pick(
  doc: CharacterDoc,
  classId: string,
  a: LevelUpAnswers,
  key: AskKey,
  id: string
): LevelUpAnswers {
  const r = row(doc, classId, key, a);
  if (!r) throw new Error(`no row ${key}`);
  return toggleAnswer(a, r, id);
}
const ids = (r: { options: ReadonlyArray<{ id: string }> } | undefined) =>
  r?.options.map((o) => o.id) ?? [];

describe("Sorcerer: replace one Metamagic option", () => {
  const known = [
    "quickened-spell",
    "distant-spell",
    "empowered-spell",
    "heightened-spell",
  ];
  const classes: ClassEntry[] = [
    { classId: "sorcerer", level: 10, metamagicChoices: known },
  ];
  const doc = makeCharacterDoc({ classes });

  it("offers the known options as an optional row", () => {
    const r = row(doc, "sorcerer", "metamagicRemove");
    expect(r?.count).toBe(0);
    expect(ids(r).sort()).toEqual([...known].sort());
    expect(ask(doc, "sorcerer").rows.some((x) => x.key === "metamagicReplace")).toBe(
      false
    );
  });

  it("skipped, the known options stay as they were", () => {
    const after = commitLevelUp(doc, ask(doc, "sorcerer").picks);
    expect(after.character.classes[0]?.metamagicChoices).toEqual(known);
  });

  it("the replacement is one the Sorcerer does not know, and owed once opened", () => {
    const a = pick(doc, "sorcerer", NO_ANSWERS, "metamagicRemove", "distant-spell");
    const replace = row(doc, "sorcerer", "metamagicReplace", a);
    expect(replace?.count).toBe(1);
    expect(ids(replace)).toContain("careful-spell");
    for (const id of known) expect(ids(replace)).not.toContain(id);

    const done = pick(doc, "sorcerer", a, "metamagicReplace", "careful-spell");
    const after = commitLevelUp(doc, ask(doc, "sorcerer", done).picks);
    expect([...(after.character.classes[0]?.metamagicChoices ?? [])].sort()).toEqual(
      ["quickened-spell", "careful-spell", "empowered-spell", "heightened-spell"].sort()
    );
  });

  it("no row before the Sorcerer knows any option, nor for another class", () => {
    const fresh = makeCharacterDoc({ classes: [{ classId: "sorcerer", level: 1 }] });
    expect(row(fresh, "sorcerer", "metamagicRemove")).toBeUndefined();
    const wizard = makeCharacterDoc({ classes: [{ classId: "wizard", level: 3 }] });
    expect(row(wizard, "wizard", "metamagicRemove")).toBeUndefined();
  });

  it("at 10 the replacement leaves out this level's two new options", () => {
    const nine = makeCharacterDoc({
      classes: [{ classId: "sorcerer", level: 9, metamagicChoices: known.slice(0, 2) }],
    });
    let a = pick(nine, "sorcerer", NO_ANSWERS, "metamagic", "careful-spell");
    a = pick(nine, "sorcerer", a, "metamagic", "subtle-spell");
    a = pick(nine, "sorcerer", a, "metamagicRemove", "quickened-spell");
    expect(ids(row(nine, "sorcerer", "metamagicRemove", a))).not.toContain(
      "careful-spell"
    );
    const replace = ids(row(nine, "sorcerer", "metamagicReplace", a));
    expect(replace).not.toContain("careful-spell");
    expect(replace).not.toContain("subtle-spell");
  });
});

describe("Warlock: replace one invocation", () => {
  const known = ["pact-of-the-blade", "thirsting-blade", "agonizing-blast"];
  const doc = makeCharacterDoc({
    classes: [{ classId: "warlock", level: 6, invocationChoices: known }],
  });

  it("offers the known invocations, but not one another one needs", () => {
    const r = row(doc, "warlock", "invocationRemove");
    expect(r?.count).toBe(0);
    expect(ids(r).sort()).toEqual(["agonizing-blast", "thirsting-blade"]);
  });

  it("skipped, the invocations stay as they were", () => {
    const after = commitLevelUp(doc, ask(doc, "warlock").picks);
    expect(after.character.classes[0]?.invocationChoices).toEqual(known);
  });

  it("the replacement is one the Warlock qualifies for and does not know", () => {
    const a = pick(doc, "warlock", NO_ANSWERS, "invocationRemove", "agonizing-blast");
    const replace = ids(row(doc, "warlock", "invocationReplace", a));
    expect(replace).toContain("devils-sight");
    for (const id of known) expect(replace).not.toContain(id);
    // Level 9+ only: a Warlock reaching 7 does not qualify yet.
    expect(replace).not.toContain("visions-of-distant-realms");

    const done = pick(doc, "warlock", a, "invocationReplace", "devils-sight");
    const after = commitLevelUp(doc, ask(doc, "warlock", done).picks);
    expect([...(after.character.classes[0]?.invocationChoices ?? [])].sort()).toEqual(
      ["pact-of-the-blade", "thirsting-blade", "devils-sight"].sort()
    );
  });

  it("an invocation that needs the one replaced is not offered in its place", () => {
    const blade = makeCharacterDoc({
      classes: [
        { classId: "warlock", level: 6, invocationChoices: ["pact-of-the-blade"] },
      ],
    });
    const a = pick(blade, "warlock", NO_ANSWERS, "invocationRemove", "pact-of-the-blade");
    expect(ids(row(blade, "warlock", "invocationReplace", a))).not.toContain(
      "thirsting-blade"
    );
  });
});

describe("Fighter: replace the Fighting Style feat", () => {
  const doc = makeCharacterDoc({
    classes: [{ classId: "fighter", level: 3 }],
    features: [{ srdId: "fighter-fighting-style" }, { srdId: "archery" }],
  });

  it("offers the Fighting Style feat taken as an optional row", () => {
    const r = row(doc, "fighter", "fightingStyleRemove");
    expect(r?.count).toBe(0);
    expect(ids(r)).toEqual(["archery"]);
  });

  it("skipped, the style stays", () => {
    const after = commitLevelUp(doc, ask(doc, "fighter").picks);
    const feats = after.character.features.flatMap((f) =>
      "srdId" in f ? [f.srdId] : []
    );
    expect(feats).toContain("archery");
  });

  it("the replacement is a different Fighting Style feat for a Fighter", () => {
    const a = pick(doc, "fighter", NO_ANSWERS, "fightingStyleRemove", "archery");
    const replace = ids(row(doc, "fighter", "fightingStyleReplace", a));
    expect(replace).toContain("defense");
    expect(replace).not.toContain("archery");
    expect(replace).not.toContain("blessed-warrior");

    const done = pick(doc, "fighter", a, "fightingStyleReplace", "defense");
    const after = commitLevelUp(doc, ask(doc, "fighter", done).picks);
    const feats = after.character.features.flatMap((f) =>
      "srdId" in f ? [f.srdId] : []
    );
    expect(feats).toContain("defense");
    expect(feats).not.toContain("archery");
  });

  it("a level with nothing else to ask stays complete until a swap is half made", () => {
    const four = makeCharacterDoc({
      classes: [{ classId: "fighter", level: 4 }],
      features: [{ srdId: "fighter-fighting-style" }, { srdId: "archery" }],
    });
    expect(ask(four, "fighter").complete).toBe(true);
    const a = pick(four, "fighter", NO_ANSWERS, "fightingStyleRemove", "archery");
    expect(ask(four, "fighter", a).complete).toBe(false);
    const done = pick(four, "fighter", a, "fightingStyleReplace", "defense");
    expect(ask(four, "fighter", done).complete).toBe(true);
  });

  it("no row for a Paladin, whose style has no such rule", () => {
    const paladin = makeCharacterDoc({
      classes: [{ classId: "paladin", level: 3 }],
      features: [{ srdId: "paladin-fighting-style" }, { srdId: "defense" }],
    });
    expect(row(paladin, "paladin", "fightingStyleRemove")).toBeUndefined();
  });
});

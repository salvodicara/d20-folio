/**
 * Every option the pickers offer says what it does (owner, 2026-11-05: «like BG3's
 * tooltips, so the choice is informed»): spells, feats and fighting styles,
 * invocations, Metamagic, weapon masteries and skills each get a card with their
 * name, a subtitle, chips, and the gist or the full text from the catalogue.
 */
import { describe, expect, it } from "vitest";

import { SRD_FEATS } from "@/data/feats";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_METAMAGIC } from "@/data/metamagic";
import { SRD_WEAPONS } from "@/data/weapons";
import { optionInfo, type InfoKind } from "@/domains/spells/option-info";
import { localizeSrd } from "@/i18n/resolver";

const LOCALES = ["en", "it"] as const;

describe("optionInfo", () => {
  it("a spell: level · school, its effect and gist, the casting facts", () => {
    const fb = optionInfo("spell", "fireball", "it");
    expect(fb).toMatchObject({ name: "Palla di Fuoco", sub: "Livello 3 · Invocazione" });
    expect(fb?.effect).toBe("8d6 Fuoco");
    expect(fb?.gist).toBe(localizeSrd("spell", "fireball", "gist", "it"));
    expect(fb?.chips).toEqual(["Azione", "45 metri"]);
    expect(fb?.text).toBe(localizeSrd("spell", "fireball", "description", "it"));
  });

  it("a feat: its category, prerequisite as a chip, gist and text", () => {
    const g = optionInfo("feat", "grappler", "en");
    expect(g?.name).toBe(localizeSrd("feat", "grappler", "name", "en"));
    expect(g?.chips.join(" ")).toContain(
      localizeSrd("feat", "grappler", "prerequisite", "en")
    );
    expect(g?.text).toBe(localizeSrd("feat", "grappler", "description", "en"));
  });

  it("a weapon mastery: the weapon, its mastery as the subtitle and the mastery's rule", () => {
    const mastery =
      SRD_WEAPONS.find((x) => x.id === "longsword")?.mastery?.toLowerCase() ?? "";
    const m = optionInfo("weapon", "longsword", "it");
    expect(m?.sub).toBe(localizeSrd("weapon-mastery", mastery, "name", "it"));
    expect(m?.gist).toBe(localizeSrd("weapon-mastery", mastery, "summary", "it"));
    expect(m?.text).toBe(localizeSrd("weapon-mastery", mastery, "description", "it"));
  });

  it("Metamagic: its Sorcery Point cost as a chip", () => {
    const first = SRD_METAMAGIC[0];
    const m = optionInfo("metamagic", first?.id ?? "", "it");
    expect(m?.chips).toContain(`${String(first?.cost)} PS`);
  });

  it("a skill: the ability it uses", () => {
    expect(optionInfo("skill", "stealth", "it")).toMatchObject({
      name: "Furtività",
      sub: "Destrezza",
    });
  });

  it("every feat, invocation, Metamagic option and masterable weapon has words to read", () => {
    const ids: [InfoKind, string][] = [
      ...SRD_FEATS.map((f): [InfoKind, string] => ["feat", f.id]),
      ...SRD_INVOCATIONS.map((i): [InfoKind, string] => ["invocation", i.id]),
      ...SRD_METAMAGIC.map((m): [InfoKind, string] => ["metamagic", m.id]),
      ...SRD_WEAPONS.filter((w) => w.mastery).map((w): [InfoKind, string] => [
        "weapon",
        w.id,
      ]),
    ];
    for (const locale of LOCALES)
      for (const [kind, id] of ids) {
        const info = optionInfo(kind, id, locale);
        expect(info?.gist || info?.text, `${kind}:${id} ${locale}`).toBeTruthy();
      }
  });

  it("knows nothing of an unknown id", () => {
    expect(optionInfo("feat", "no-such-feat", "en")).toBeNull();
  });
});

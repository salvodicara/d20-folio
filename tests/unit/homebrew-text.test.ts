/**
 * Homebrew text a player authored: a plain string (every entry stored before
 * per-language text, language unknown, so the text for every locale) or a
 * partial per-locale map, read with one fallback rule — the viewer's locale,
 * else the source locale, else any present one. Both shapes round-trip through
 * the character codec verbatim, and every presenter reads through `homebrewText`.
 */
import { describe, expect, it } from "vitest";
import {
  conformHomebrewText,
  homebrewLocaleText,
  homebrewTextKey,
} from "@/lib/homebrew-text";
import { editHomebrewText, homebrewText } from "@/lib/views/homebrew-text-view";
import { customText } from "@/lib/loc-text";
import { localizeText } from "@/lib/views/srd-i18n";
import {
  parseCharacterEnvelope,
  serializeCharacterEnvelope,
} from "@/lib/character-codec";
import { homebrewFeatureGrants } from "@/lib/homebrew-grants";
import { concentrationSpellData, homebrewSpellData } from "@/lib/homebrew-spells";
import {
  customSpellConcentrationValue,
  holdsCustomSpellConcentration,
} from "@/lib/concentration";
import type {
  CustomEquipment,
  CustomFeature,
  CustomSpell,
  CustomWeapon,
} from "@/types/character";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";

describe("homebrewText — the fallback chain", () => {
  it("a plain string is the text for every locale", () => {
    expect(homebrewText("Morso", "en")).toBe("Morso");
    expect(homebrewText("Morso", "it")).toBe("Morso");
  });

  it("the viewer's locale wins when it was authored", () => {
    const text = { en: "Bite", it: "Morso" };
    expect(homebrewText(text, "it")).toBe("Morso");
    expect(homebrewText(text, "en")).toBe("Bite");
  });

  it("a missing locale falls back to the source locale", () => {
    expect(homebrewText({ en: "Bite" }, "it")).toBe("Bite");
  });

  it("with neither the viewer's nor the source locale, any present one", () => {
    expect(homebrewText({ it: "Morso" }, "en")).toBe("Morso");
  });

  it("an empty authored string counts as missing", () => {
    expect(homebrewText({ en: "", it: "Morso" }, "en")).toBe("Morso");
  });

  it("the stable key is the source-locale fallback, the same on every device", () => {
    expect(homebrewTextKey({ en: "Bite", it: "Morso" })).toBe("Bite");
    expect(homebrewTextKey({ it: "Morso" })).toBe("Morso");
    expect(homebrewTextKey("Morso")).toBe("Morso");
  });

  it("absent text is empty", () => {
    expect(homebrewText(undefined, "en")).toBe("");
    expect(homebrewText({}, "en")).toBe("");
  });
});

describe("conformHomebrewText — the stored shapes it reads", () => {
  it("accepts a string and a partial locale map", () => {
    expect(conformHomebrewText("Bite")).toBe("Bite");
    expect(conformHomebrewText({ it: "Morso" })).toEqual({ it: "Morso" });
  });

  it("refuses an unknown language key, a non-string value, an empty map", () => {
    expect(conformHomebrewText({ fr: "Morsure" })).toBeNull();
    expect(conformHomebrewText({ en: 3 })).toBeNull();
    expect(conformHomebrewText({})).toBeNull();
    expect(conformHomebrewText(["Bite"])).toBeNull();
    expect(conformHomebrewText(null)).toBeNull();
  });
});

describe("editHomebrewText — a form editing one language keeps the others", () => {
  it("a plain string stays a plain string", () => {
    expect(editHomebrewText("Bite", "it", "Morso")).toBe("Morso");
  });

  it("a map changes only the edited locale", () => {
    expect(editHomebrewText({ en: "Bite", it: "Morso" }, "it", "Morsa")).toEqual({
      en: "Bite",
      it: "Morsa",
    });
  });

  it("editing a locale the map lacks adds it", () => {
    expect(editHomebrewText({ en: "Bite" }, "it", "Morso")).toEqual({
      en: "Bite",
      it: "Morso",
    });
  });
});

describe("customText — the LocText a presenter resolves", () => {
  it("a string stays a custom text, shown verbatim", () => {
    expect(customText("Bite")).toEqual({ custom: "Bite" });
  });

  it("a map becomes a lit filled for every locale (a row every reader knows)", () => {
    expect(customText({ it: "Morso" })).toEqual({ lit: { en: "Morso", it: "Morso" } });
    expect(homebrewLocaleText({ en: "Bite", it: "Morso" })).toEqual({
      en: "Bite",
      it: "Morso",
    });
  });

  it("localizeText resolves both in the viewer's locale", () => {
    const text = customText({ en: "Bite", it: "Morso" });
    expect(localizeText(text, "it")).toBe("Morso");
    expect(localizeText(text, "en")).toBe("Bite");
    expect(localizeText(customText("Morso"), "en")).toBe("Morso");
  });
});

describe("the character codec reads both shapes, verbatim", () => {
  const spell: CustomSpell = {
    custom: true,
    name: { en: "Ember Lash", it: "Frusta di Brace" },
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "30 feet",
    components: { v: true, s: true, m: false },
    duration: "Instantaneous",
    concentration: false,
    description: { it: "Una frusta di fuoco." },
    higherLevels: { en: "+1d6 per slot level." },
    instanceId: customInstanceId("ember-lash"),
  };
  const feature: CustomFeature = {
    custom: true,
    title: { it: "Signore del Terrore" },
    subtitle: { en: "Homebrew boon" },
    emoji: "🕯️",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    instanceId: customInstanceId("dread-lord"),
  };
  const weapon: CustomWeapon = {
    custom: true,
    name: { en: "Thorn Whip", it: "Frusta di Spine" },
    quantity: 1,
    damageDie: "1d6",
    damageType: "piercing",
    attackStat: "DEX",
    properties: "",
    description: { it: "Spinosa." },
    instanceId: customInstanceId("thorn-whip"),
  };
  const item: CustomEquipment = {
    custom: true,
    name: { it: "Lanterna" },
    description: "A plain old lantern.",
    instanceId: customInstanceId("lantern"),
  };

  function roundTrip() {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 3,
      features: [feature],
      spells: [spell],
      weapons: [weapon],
      equipment: [item],
    });
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    const parsed = parseCharacterEnvelope(stored.build, stored.state);
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.character;
  }

  it("keeps every per-locale field exactly as authored", () => {
    const character = roundTrip();
    const readSpell = character.spells.find((s) => "custom" in s) as CustomSpell;
    expect(readSpell.name).toEqual(spell.name);
    expect(readSpell.description).toEqual(spell.description);
    expect(readSpell.higherLevels).toEqual(spell.higherLevels);
    const readFeature = character.features.find((f) => "custom" in f) as CustomFeature;
    expect(readFeature.title).toEqual(feature.title);
    expect(readFeature.subtitle).toEqual(feature.subtitle);
    const readWeapon = character.weapons.find((w) => "custom" in w) as CustomWeapon;
    expect(readWeapon.name).toEqual(weapon.name);
    expect(readWeapon.description).toEqual(weapon.description);
    const readItem = character.equipment.find((e) => "custom" in e) as CustomEquipment;
    expect(readItem.name).toEqual(item.name);
    expect(readItem.description).toBe("A plain old lantern.");
  });

  it("a malformed text (unknown language) still quarantines, as before", () => {
    const doc = makeCharacterDoc({
      classId: "wizard",
      level: 3,
      spells: [{ ...spell, name: { fr: "Fouet" } as unknown as string }],
    });
    const stored = JSON.parse(JSON.stringify(serializeCharacterEnvelope(doc))) as {
      build: Record<string, unknown>;
      state: Record<string, unknown>;
    };
    expect(parseCharacterEnvelope(stored.build, stored.state).ok).toBe(false);
  });
});

describe("a homebrew grant's text is partial with the fallback, not every language", () => {
  const base = {
    custom: true as const,
    title: "Ember Ward",
    emoji: "🔥",
    source: "Homebrew",
    tags: [],
    contentBlocks: [],
    instanceId: customInstanceId("ember-ward"),
  };

  it("a label in one language is filled for the others", () => {
    const [grant] = homebrewFeatureGrants({
      ...base,
      grants: [
        {
          type: "choice-resistance",
          amount: 1,
          choiceKey: "ember-ward",
          options: ["fire", "cold"],
          label: { it: "Resistenza scelta" },
        } as never,
      ],
    });
    expect(grant).toMatchObject({
      label: { en: "Resistenza scelta", it: "Resistenza scelta" },
    });
  });

  it("a plain-string label is the text for every language", () => {
    const [grant] = homebrewFeatureGrants({
      ...base,
      grants: [
        {
          type: "choice-resistance",
          amount: 1,
          choiceKey: "ember-ward",
          options: ["fire"],
          label: "Chosen resistance",
        } as never,
      ],
    });
    expect(grant).toMatchObject({
      label: { en: "Chosen resistance", it: "Chosen resistance" },
    });
  });
});

describe("a spell named per language keeps one Concentration identity", () => {
  const glow: CustomSpell = {
    custom: true,
    name: { en: "Warding Glow", it: "Bagliore Protettivo" },
    level: 1,
    school: "abjuration",
    castingTime: "bonus action",
    range: "Self",
    components: { v: true, s: true, m: false },
    duration: "Concentration, up to 1 minute",
    concentration: true,
    description: "A soft light wards you.",
    instanceId: customInstanceId("warding-glow"),
    mechanics: {
      duration: { kind: "minutes", amount: 1 },
      grants: [{ type: "ac-bonus", amount: 2 }],
    },
  };

  it("the stamp carries the source-locale name, the same on every device", () => {
    expect(customSpellConcentrationValue(glow)).toBe(
      `custom:#${glow.instanceId}#Warding Glow`
    );
  });

  it("the held spell's data is found from the id stamp (and the legacy name one)", () => {
    expect(concentrationSpellData(customSpellConcentrationValue(glow), [glow])).toBe(
      homebrewSpellData(glow)
    );
    expect(concentrationSpellData("custom:Warding Glow", [glow])).toBe(
      homebrewSpellData(glow)
    );
    expect(holdsCustomSpellConcentration("custom:Warding Glow", glow)).toBe(true);
  });
});

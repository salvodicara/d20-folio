/**
 * A spell that changes ONE chosen weapon while it lasts (`weapon-binding`): Magic
 * Weapon's +1/+2/+3 and Shillelagh's ability, die and Force option. Every number is
 * read from the spell's own SRD 5.2.1 English text, the cast names the weapon, and
 * the change rides that weapon's row only while the spell's state is lit.
 */
import { describe, expect, it } from "vitest";
import { getSpellById } from "@/data/spells";
import type { SrdSpellData } from "@/data/types";
import { evaluateGrants } from "@/lib/grants";
import { castStateChoiceKeys } from "@/lib/play/states";
import { resolveActions } from "@/lib/smart-tracker";
import {
  castWeaponBinding,
  decodeWeaponAddress,
  eligibleBindingWeapons,
  encodeWeaponAddress,
  resolveWeaponBindings,
  type WeaponAddress,
} from "@/lib/weapon-binding";
import type { CharacterDoc, SessionState } from "@/types/character";
import { srd } from "../_harness/loc";
import { makeCharacterDoc } from "./_helpers";

const text = (id: string, field: "description" | "higherLevels"): string =>
  srd("spell", id, field, "en");

function spell(id: string): SrdSpellData {
  const data = getSpellById(id);
  if (!data) throw new Error(`no spell ${id}`);
  return data;
}

/** The weapon row of a carried SRD weapon. */
function row(doc: CharacterDoc, srdId: string) {
  const found = resolveActions(doc).find(
    (a) => a.source === "weapon" && a.weaponId === srdId
  );
  if (!found) throw new Error(`no ${srdId} row`);
  return found.summary;
}

/** The doc after the cast: its state lit at `castLevel`, its picks stored. */
function cast(
  doc: CharacterDoc,
  spellId: string,
  weapon: WeaponAddress,
  options: { castLevel?: number; damageType?: string } = {}
): CharacterDoc {
  const result = castWeaponBinding(
    {
      spell: spell(spellId),
      weapon,
      ...(options.damageType ? { damageType: options.damageType } : {}),
    },
    doc
  );
  if (!result.ok) throw new Error(`cast rejected: ${result.reason}`);
  const choices = Object.fromEntries(
    Object.entries(result.choices).filter((e): e is [string, string] => e[1] !== null)
  );
  const session: SessionState = {
    ...doc.session,
    activeFeatures: [...(doc.session.activeFeatures ?? []), result.activeKey],
    ...(options.castLevel
      ? { activeSpellCastLevels: { [result.activeKey]: options.castLevel } }
      : {}),
    grantBundleChoices: { ...doc.session.grantBundleChoices, ...choices },
  };
  return { ...doc, session };
}

const srdWeapon = (index: number, srdId: string): WeaponAddress => ({
  kind: "srd",
  index,
  srdId,
});

describe("Magic Weapon — the chosen nonmagical weapon's bonus by slot level", () => {
  const description = text("magic-weapon", "description");
  const higher = text("magic-weapon", "higherLevels");
  const base = Number(
    /a \+(\d) bonus to attack rolls and damage rolls/.exec(description)?.[1]
  );
  const midTier = /\+(\d) with a level (\d)–(\d) spell slot/.exec(higher);
  const topTier = /\+(\d) with a level (\d)\+ spell slot/.exec(higher);
  const bonusAt = (slot: number): number =>
    slot >= Number(topTier?.[2])
      ? Number(topTier?.[1])
      : slot >= Number(midTier?.[2])
        ? Number(midTier?.[1])
        : base;

  const paladin = (enchant?: string): CharacterDoc =>
    makeCharacterDoc(
      {
        classId: "paladin",
        level: 11,
        abilityScores: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 10, CHA: 14 },
        spells: [{ srdId: "magic-weapon", prepared: true }],
        weapons: [
          {
            srdId: "longsword",
            quantity: 1,
            ...(enchant ? { enchantItemId: enchant } : {}),
          },
          { srdId: "dagger", quantity: 1 },
        ],
      },
      { activeFeatures: [] }
    );

  it("reads +1 / +2 at levels 3–5 / +3 at level 6+ from the text", () => {
    expect([base, midTier?.slice(1), topTier?.slice(1)]).toEqual([
      1,
      ["2", "3", "5"],
      ["3", "6"],
    ]);
  });

  it.each([2, 4, 6])("a slot-%i cast adds its bonus to the Longsword only", (slot) => {
    const before = paladin();
    const longsword = row(before, "longsword");
    const dagger = row(before, "dagger");
    const after = cast(before, "magic-weapon", srdWeapon(0, "longsword"), {
      castLevel: slot,
    });
    const bonus = bonusAt(slot);
    expect(row(after, "longsword").attackBonus).toBe(
      (longsword.attackBonus ?? 0) + bonus
    );
    expect(row(after, "longsword").damage).toBe(`1d8+${3 + bonus}`);
    expect(row(after, "longsword").versatileDamage).toBe(`1d10+${3 + bonus}`);
    // The other weapon's row does not change.
    expect(row(after, "dagger")).toEqual(dagger);
  });

  it("the binding ends with the spell: an unlit state leaves the weapon as printed", () => {
    const before = paladin();
    const lit = cast(before, "magic-weapon", srdWeapon(0, "longsword"), { castLevel: 4 });
    const ended: CharacterDoc = {
      ...lit,
      session: { ...lit.session, activeFeatures: [] },
    };
    expect(row(ended, "longsword")).toEqual(row(before, "longsword"));
  });

  it("refuses a weapon that is already magical", () => {
    const doc = paladin("weapon-plus-1");
    expect(
      castWeaponBinding(
        { spell: spell("magic-weapon"), weapon: srdWeapon(0, "longsword") },
        doc
      )
    ).toEqual({ ok: false, reason: "magical-weapon" });
    expect(eligibleBindingWeapons(spell("magic-weapon"), doc)).toEqual([
      srdWeapon(1, "dagger"),
    ]);
  });
});

describe("Shillelagh — a Club or Quarterstaff takes the spellcasting ability and a bigger die", () => {
  const description = text("shillelagh", "description");
  const higher = text("shillelagh", "higherLevels");
  const allowed = /A (\w+) or (\w+) you are holding/
    .exec(description)
    ?.slice(1)
    .map((w) => w.toLowerCase());
  const baseDie = /damage die becomes a (d\d+)/.exec(description)?.[1];
  const tiers = [...higher.matchAll(/(\d+) \((\d*d\d+)\)/g)].map((m) => ({
    level: Number(m[1]),
    die: m[2] ?? "",
  }));
  const dieAt = (level: number): string => {
    const die = tiers.filter((t) => level >= t.level).at(-1)?.die ?? baseDie ?? "";
    return /^\d/.test(die) ? die : `1${die}`;
  };
  const forceOption = /it can be (\w+) damage or the weapon's normal damage type/
    .exec(description)?.[1]
    ?.toLowerCase();

  const druid = (level: number): CharacterDoc =>
    makeCharacterDoc(
      {
        classId: "druid",
        level,
        abilityScores: { STR: 10, DEX: 12, CON: 14, INT: 10, WIS: 16, CHA: 10 },
        spellcasting: {
          ability: "WIS",
          preparedCaster: true,
          preparedMax: 4,
          saveDCOverride: null,
          attackBonusOverride: null,
        },
        spells: [{ srdId: "shillelagh", prepared: true }],
        weapons: [
          { srdId: "quarterstaff", quantity: 1 },
          { srdId: "longsword", quantity: 1 },
        ],
      },
      { activeFeatures: [] }
    );

  it("reads the weapons, the dice and the Force option from the text", () => {
    expect(allowed).toEqual(["club", "quarterstaff"]);
    expect(baseDie).toBe("d8");
    expect(tiers).toEqual([
      { level: 5, die: "d10" },
      { level: 11, die: "d12" },
      { level: 17, die: "2d6" },
    ]);
    expect(forceOption).toBe("force");
  });

  it.each([1, 5, 11, 17])(
    "a level-%i Druid's Quarterstaff attacks with WIS and the scaled die",
    (level) => {
      const before = druid(level);
      const plain = row(before, "quarterstaff");
      expect(plain.damage).toBe("1d6");
      const after = cast(before, "shillelagh", srdWeapon(0, "quarterstaff"));
      const staff = row(after, "quarterstaff");
      // WIS +3 instead of STR +0, on both the attack and the damage.
      expect(staff.attackBonus).toBe((plain.attackBonus ?? 0) + 3);
      expect(staff.damage).toBe(`${dieAt(level)}+3`);
      expect(staff.damageType).toBe("bludgeoning");
      // One die in either grip: no two-handed stance left to offer.
      expect(staff.versatileDamage).toBeUndefined();
      expect(row(after, "longsword")).toEqual(row(before, "longsword"));
    }
  );

  it("deals Force damage when the caster picks it, never a type the spell does not offer", () => {
    const doc = druid(5);
    const force = cast(doc, "shillelagh", srdWeapon(0, "quarterstaff"), {
      damageType: forceOption ?? "",
    });
    expect(row(force, "quarterstaff").damageType).toBe("force");
    expect(
      castWeaponBinding(
        {
          spell: spell("shillelagh"),
          weapon: srdWeapon(0, "quarterstaff"),
          damageType: "fire",
        },
        doc
      )
    ).toEqual({ ok: false, reason: "damage-type-not-offered" });
  });

  it("rejects a Longsword, and a forged pick on one changes nothing", () => {
    const doc = druid(5);
    expect(
      castWeaponBinding(
        { spell: spell("shillelagh"), weapon: srdWeapon(1, "longsword") },
        doc
      )
    ).toEqual({ ok: false, reason: "weapon-not-allowed" });
    expect(eligibleBindingWeapons(spell("shillelagh"), doc)).toEqual([
      srdWeapon(0, "quarterstaff"),
    ]);
    const forged: CharacterDoc = {
      ...doc,
      session: {
        ...doc.session,
        activeFeatures: ["spell-shillelagh"],
        grantBundleChoices: {
          "spell-shillelagh:weapon": encodeWeaponAddress(srdWeapon(1, "longsword")),
        },
      },
    };
    expect(row(forged, "longsword")).toEqual(row(doc, "longsword"));
  });

  it("a new cast asks for the weapon again", () => {
    expect(castStateChoiceKeys(getSpellById("shillelagh"), "spell-shillelagh")).toEqual([
      "spell-shillelagh:weapon",
      "spell-shillelagh:damage-type",
    ]);
  });
});

describe("a homebrew weapon-binding spell", () => {
  const emberEdge: Pick<SrdSpellData, "grants"> = {
    grants: [
      {
        type: "while-active",
        activeKey: "spell-ember-edge",
        grants: [
          {
            type: "weapon-binding",
            choiceKey: "ember-edge-weapon",
            bonus: 2,
            damageDie: "1d10",
            damageTypeChoice: { choiceKey: "ember-edge-type", options: ["fire"] },
          },
        ],
      },
    ],
  };
  const doc = makeCharacterDoc({
    classId: "fighter",
    level: 3,
    weapons: [
      { srdId: "dagger", quantity: 1 },
      {
        custom: true,
        instanceId: "item-blade-1",
        name: "Ash Blade",
        quantity: 1,
        damageDie: "1d6",
        damageType: "slashing",
        attackStat: "STR",
        properties: "",
      },
    ],
  });

  it("binds any weapon, a homebrew one included, and resolves only while lit", () => {
    const weapon: WeaponAddress = { kind: "custom", instanceId: "item-blade-1" };
    const result = castWeaponBinding(
      { spell: emberEdge, weapon, damageType: "fire" },
      doc
    );
    expect(result).toEqual({
      ok: true,
      activeKey: "spell-ember-edge",
      choices: { "ember-edge-weapon": "custom:item-blade-1", "ember-edge-type": "fire" },
    });
    expect(decodeWeaponAddress("custom:item-blade-1")).toEqual(weapon);
    const choices = new Map(
      Object.entries(result.ok ? result.choices : {}).filter(
        (e): e is [string, string] => e[1] !== null
      )
    );
    const sources = [{ id: "ember-edge", grants: emberEdge.grants ?? [] }];
    const lit = evaluateGrants(sources, new Set(["spell-ember-edge"]), choices);
    const bound = resolveWeaponBindings(lit.weaponBindings, {
      ...doc,
      session: { ...doc.session, grantBundleChoices: Object.fromEntries(choices) },
    });
    expect([...bound.entries()]).toEqual([
      [
        1,
        {
          sourceId: "ember-edge",
          activeKey: "spell-ember-edge",
          bonus: 2,
          damageDie: "1d10",
          damageType: "fire",
          damageTypeOptions: ["fire"],
          damageTypeChoiceKey: "ember-edge-type",
        },
      ],
    ]);
    const unlit = evaluateGrants(sources, new Set(), choices);
    expect(unlit.weaponBindings).toEqual([]);
  });
});

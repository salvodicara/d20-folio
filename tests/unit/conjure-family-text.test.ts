// The Conjure family and Animate Objects read the SRD 5.2.1 text, not the 2014
// or paraphrased versions, and the spell data agrees with that text. Cases come
// from SRD 5.2.1 (EN pp. 108, 117-118; IT pp. 122, 145-146).
import { describe, expect, it } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import itSpells from "@/i18n/it/srd/spells.json";
import { getSpellById } from "@/data/spells";

type SpellText = { description: string; higherLevels?: string };
const en = enSpells as unknown as Record<string, SpellText>;
const it_ = itSpells as unknown as Record<string, SpellText>;

function text(catalogue: Record<string, SpellText>, id: string): SpellText {
  const entry = catalogue[id];
  if (!entry) throw new Error(`no text for ${id}`);
  return entry;
}

describe("Conjure family text (SRD 5.2.1)", () => {
  it("Conjure Animals: a spectral pack that moves with you, 3d10 Slashing on a failed save only", () => {
    const e = text(en, "conjure-animals");
    expect(e.description).toContain(
      "You conjure nature spirits that appear as a Large pack of spectral, intangible animals in an unoccupied space you can see within range."
    );
    expect(e.description).toContain(
      "when you move on your turn, you can also move the pack up to 30 feet"
    );
    expect(e.description).toContain(
      "On a failed save, the creature takes 3d10 Slashing damage. A creature makes this save only once per turn."
    );
    expect(e.description).not.toMatch(/half as much/);
    expect(e.higherLevels).toBe(
      "The damage increases by 1d10 for each spell slot level above 3."
    );
    const i = text(it_, "conjure-animals");
    expect(i.description).toContain(
      "L'incantatore evoca degli spiriti della natura che appaiono come un branco Grande di animali spettrali e intangibili"
    );
    expect(i.description).toContain(
      "In caso di fallimento, subisce 3d10 danni taglienti."
    );
    expect(i.higherLevels).toBe(
      "I danni aumentano di 1d10 per ogni slot di livello superiore al 3°."
    );
  });

  it("Conjure Celestial: Healing Light and Searing Light, and a Cylinder that moves", () => {
    const e = text(en, "conjure-celestial");
    expect(e.description).toContain(
      "Healing Light. The target regains Hit Points equal to 4d12 plus your spellcasting ability modifier."
    );
    expect(e.description).toContain(
      "Searing Light. The target makes a Dexterity saving throw, taking 6d12 Radiant damage on a failed save or half as much damage on a successful one."
    );
    expect(e.description).toContain("you can also move the Cylinder up to 30 feet");
    expect(e.higherLevels).toBe(
      "The healing and damage increase by 1d12 for each spell slot level above 7."
    );
    const i = text(it_, "conjure-celestial");
    expect(i.description).toContain("Luce curatrice. Il bersaglio recupera");
    expect(i.description).toContain(
      "Luce ustionante. Il bersaglio effettua un tiro salvezza su Destrezza"
    );
    expect(i.higherLevels).toBe(
      "I danni e la guarigione aumentano di 1d12 per ogni slot di livello superiore al 7°."
    );
  });

  it("Conjure Elemental: no damage on a successful save; the Restrained target takes 4d8 on a failed repeat", () => {
    const e = text(en, "conjure-elemental");
    expect(e.description).toContain(
      "On failed save, the target takes 8d8 damage of the spirit's type, and the target has the Restrained condition until the spell ends."
    );
    expect(e.description).toContain(
      "On a failed save, the target takes 4d8 damage of the spirit's type. On a successful save, the target isn't Restrained by the spirit."
    );
    expect(e.description).not.toMatch(/half/);
    expect(e.higherLevels).toBe(
      "The damage increases by 1d8 for each spell slot level above 5."
    );
    const i = text(it_, "conjure-elemental");
    expect(i.description).toContain(
      "il bersaglio subisce 4d8 danni del tipo determinato dallo spirito"
    );
    // The official IT SRD prints "al 4º" here, a typo for the spell's own level 5.
    expect(i.higherLevels).toBe(
      "I danni aumentano di 1d8 per ogni slot di livello superiore al 5°."
    );
  });

  it("Conjure Minor Elementals: 2d8 Acid, Cold, Fire, or Lightning against creatures in the Emanation", () => {
    const e = text(en, "conjure-minor-elementals");
    expect(e.description).toContain(
      "any attack you make deals an extra 2d8 damage when you hit a creature in the Emanation. This damage is Acid, Cold, Fire, or Lightning (your choice when you make the attack)."
    );
    expect(e.description).toContain(
      "the ground in the Emanation is Difficult Terrain for your enemies"
    );
    expect(e.description).not.toMatch(/Thunder/);
    expect(e.higherLevels).toBe(
      "The damage increases by 1d8 for each spell slot level above 4."
    );
    const i = text(it_, "conjure-minor-elementals");
    expect(i.description).toContain(
      "I danni inflitti sono da acido, freddo, fuoco o fulmine"
    );
    expect(i.higherLevels).toBe(
      "I danni aumentano di 1d8 per ogni slot di livello superiore al 4°."
    );
  });

  it("Conjure Woodland Beings: 5d8 Force in the Emanation, and Disengage as a Bonus Action", () => {
    const e = text(en, "conjure-woodland-beings");
    expect(e.description).toContain(
      "The creature takes 5d8 Force damage on a failed save or half as much damage on a successful one."
    );
    expect(e.description).toContain(
      "you can take the Disengage action as a Bonus Action for the spell's duration"
    );
    expect(e.higherLevels).toBe(
      "The damage increases by 1d8 for each spell slot level above 4."
    );
    const i = text(it_, "conjure-woodland-beings");
    expect(i.description).toContain("l'azione di Disimpegno come azione bonus");
    expect(i.higherLevels).toBe(
      "I danni aumentano di 1d8 per ogni slot di livello superiore al 4°."
    );
  });

  it("Animate Objects (IT): the official third-person text", () => {
    const i = text(it_, "animate-objects");
    expect(i.description).toContain("Gli oggetti si animano su ordine dell'incantatore.");
    expect(i.description).toContain("a patto che si trovi entro 150 metri da sé");
    expect(i.higherLevels).toBe(
      "I danni da Schianto della creatura aumentano di 1d4 (taglia Media o inferiore), 1d6 (taglia Grande) o 1d12 (taglia Enorme) per ogni slot di livello superiore al 5°."
    );
  });
});

describe("Conjure family data agrees with the SRD 5.2.1 text", () => {
  it("Conjure Animals deals no damage on a successful save and moves with the caster, not as a Bonus Action", () => {
    const s = getSpellById("conjure-animals");
    expect(s?.damageOnSave).toBeUndefined();
    expect(s?.recurrence).toBe("on-enter-or-end-turn");
    expect(s?.resolveOnCast).toBe(false);
  });

  it("Conjure Woodland Beings is an Emanation around the caster, not a Bonus Action move", () => {
    const s = getSpellById("conjure-woodland-beings");
    expect(s?.damageOnSave).toBe("half");
    expect(s?.recurrence).toBe("on-enter-or-end-turn");
    expect(s?.resolveOnCast).toBe(false);
  });

  it("Conjure Elemental deals no damage on a successful save and scales 1d8 per slot level", () => {
    const s = getSpellById("conjure-elemental");
    expect(s?.damageOnSave).toBeUndefined();
    expect(s?.damageDicePerUpcast).toBe("1d8");
  });
});

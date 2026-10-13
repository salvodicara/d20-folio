// Conjure Fey reads the SRD 5.2.1 text (a Medium spirit from the Feywild that
// makes a Psychic melee spell attack), not the 2014 "summon a fey creature of
// challenge rating 6" version. Cases come from SRD 5.2.1 (EN p. 118, IT p. 145).
import { describe, expect, it } from "vitest";
import enSpells from "@/i18n/en/srd/spells.json";
import itSpells from "@/i18n/it/srd/spells.json";

const en = enSpells["conjure-fey"];
const it_ = itSpells["conjure-fey"];

describe("Conjure Fey text (SRD 5.2.1)", () => {
  it("EN: a Medium Feywild spirit dealing 3d12 Psychic and Frightened", () => {
    expect(en.description).toContain(
      "You conjure a Medium spirit from the Feywild in an unoccupied space you can see within range."
    );
    expect(en.description).toContain(
      "takes Psychic damage equal to 3d12 plus your spellcasting ability modifier"
    );
    expect(en.description).toContain(
      "Frightened condition until the start of your next turn"
    );
    expect(en.description).toContain("teleport the spirit to an unoccupied space");
    expect(en.description).not.toMatch(/challenge rating/i);
    expect(en.duration).toBe("Concentration, up to 10 minutes");
    expect(en.range).toBe("60 feet");
    expect(en.higherLevels).toBe(
      "The damage increases by 1d12 for each spell slot level above 6."
    );
  });

  it("IT: uno spirito di taglia Media dalla Selva Fatata, 3d12 psichici e spaventato", () => {
    expect(it_.description).toContain(
      "L'incantatore evoca uno spirito di taglia Media dalla Selva Fatata"
    );
    expect(it_.description).toContain("danni psichici pari a 3d12");
    expect(it_.description).toContain(
      "è spaventato fino all'inizio del turno successivo"
    );
    expect(it_.description).toContain("teletrasportare lo spirito");
    expect(it_.description).not.toMatch(/grado di sfida/i);
    expect(it_.duration).toBe("Concentrazione, fino a 10 minuti");
    expect(it_.range).toBe("18 metri");
    expect(it_.higherLevels).toBe(
      "I danni aumentano di 1d12 per ogni slot di livello superiore al 6°."
    );
  });
});

import { describe, expect, it } from "vitest";
import { getBeast } from "@/data/beasts";
import { fallsIfProne, proneInFlight } from "@/lib/play/flight";
import { assumeBeastForm } from "@/lib/play/forms";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

const winged = (conditions: CharacterDoc["session"]["conditions"] = []) =>
  makeCharacterDoc(
    {
      equipment: [
        { srdId: "wings-of-flying", quantity: 1, equipped: true, attuned: true },
      ],
    },
    { activeFeatures: ["wings-of-flying"], conditions }
  );

describe("flying and prone", () => {
  it("a walker never falls", () => {
    expect(fallsIfProne(makeCharacterDoc())).toBe(false);
  });

  it("worn wings that are not spread don't fly", () => {
    const folded = makeCharacterDoc({
      equipment: [
        { srdId: "wings-of-flying", quantity: 1, equipped: true, attuned: true },
      ],
    });
    expect(fallsIfProne(folded)).toBe(false);
  });

  it("Prone on a flyer that can't hover is the falling cue", () => {
    expect(proneInFlight(winged())).toBe(false);
    expect(proneInFlight(winged(["prone"]))).toBe(true);
  });

  it("a hovering source keeps a flyer up, even beside one that can't hover", () => {
    const both = makeCharacterDoc(
      {
        classId: "wizard",
        level: 5,
        spells: [{ srdId: "fly", prepared: true }] as never,
        equipment: [
          { srdId: "wings-of-flying", quantity: 1, equipped: true, attuned: true },
        ],
      },
      {
        activeFeatures: ["wings-of-flying", "spell-fly"],
        conditions: ["prone"],
      }
    );
    expect(proneInFlight(both)).toBe(false);
  });

  it("a form's flight replaces the character's", () => {
    const eagle = getBeast("giant-eagle") ?? getBeast("eagle");
    if (!eagle) throw new Error("no eagle");
    const { doc } = assumeBeastForm(makeCharacterDoc(), eagle, "polymorph");
    expect(fallsIfProne(doc)).toBe(true);
    const wolf = getBeast("wolf");
    if (!wolf) throw new Error("no wolf");
    const { doc: grounded } = assumeBeastForm(winged(), wolf, "polymorph");
    expect(fallsIfProne(grounded)).toBe(false);
  });
});

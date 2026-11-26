/**
 * The title of the sheet after a Long Rest names what it holds (D&D Beyond's Long Rest
 * dialog lists each «you may change» item in its own section): spells only keep
 * «Incantesimi preparati»; spells beside another change (a Druid's known Wild Shape
 * form, a High Elf's lineage cantrip) read «Dopo il riposo lungo». Outside a rest the
 * sheet is «Gestisci incantesimi».
 */
import { describe, expect, it } from "vitest";

import { asRaceId } from "@/data/srd-names";
import { prepareSheetTitle } from "@/domains/play/long-rest-change";
import { makeCharacterDoc } from "./_helpers";

const druid = (wildShapeForms?: string[]) =>
  makeCharacterDoc({ classes: [{ classId: "druid", level: 4 }], wildShapeForms });
const highElf = makeCharacterDoc(
  { race: asRaceId("elf"), classes: [{ classId: "fighter", level: 3 }] },
  { grantBundleChoices: { "elf-lineage": "high-elf" } }
);

describe("the title of the sheet after a Long Rest", () => {
  it("spells only: «Prepared spells»", () => {
    expect(prepareSheetTitle(druid(), { longRest: "any", afterLongRest: true })).toBe(
      "create.screen.preparedSpells"
    );
  });

  it("spells and a known form to swap: «After the Long Rest»", () => {
    expect(
      prepareSheetTitle(druid(["wolf", "ape"]), { longRest: "any", afterLongRest: true })
    ).toBe("play.rest.afterTitle");
  });

  it("a lineage cantrip only: «After the Long Rest»", () => {
    expect(prepareSheetTitle(highElf, { afterLongRest: true })).toBe(
      "play.rest.afterTitle"
    );
  });

  it("outside a rest: «Manage spells»", () => {
    expect(prepareSheetTitle(druid(["wolf"]), {})).toBe("play.spells.manage");
  });
});

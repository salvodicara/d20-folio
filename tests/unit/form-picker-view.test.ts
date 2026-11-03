/**
 * The Play screen's form picker: the forms `formPool` allows (Wild Shape by the
 * druid's table, Polymorph by level), grouped by Challenge Rating, found by name in
 * either language, and the Temporary HP the form brings when they are the same for
 * every form (Wild Shape: the Druid level).
 */
import { describe, expect, it } from "vitest";
import { formPickerView } from "@/domains/play/form-picker-view";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { formPool } from "@/lib/form-pool";
import { makeCharacterDoc } from "./_helpers";

/** A level 7 druid with its class features (Wild Shape up to CR 1/2, no Fly). */
function druid() {
  const doc = buildDevScenario("potent-druid");
  if (!doc) throw new Error("the potent-druid scenario is missing");
  return doc;
}
const wizard = makeCharacterDoc({ classId: "wizard", level: 9 });

describe("formPickerView", () => {
  it("lists exactly the pool, grouped by Challenge Rating from the lowest", () => {
    const doc = druid();
    const view = formPickerView(doc, "druid-wild-shape", "en", "");
    const ids = view.groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).toEqual(formPool(doc, "druid-wild-shape").map((b) => b.id));
    expect(view.groups.map((g) => g.cr)).toEqual(["0", "1/8", "1/4", "1/2"]);
  });

  it("finds a beast by its name in the player's language", () => {
    const rows = formPickerView(druid(), "druid-wild-shape", "it", "lupo").groups.flatMap(
      (g) => g.rows
    );
    expect(rows.map((r) => r.name)).toEqual(["Ragno lupo gigante", "Lupo"]);
  });

  it("gives each form its AC, Hit Points and speeds", () => {
    const row = formPickerView(druid(), "druid-wild-shape", "en", "wolf")
      .groups.flatMap((g) => g.rows)
      .find((r) => r.id === "wolf");
    expect(row).toMatchObject({ id: "wolf", name: "Wolf", ac: 12, hp: 11 });
    expect(row?.speeds).toEqual([{ mode: "walk", ft: 40 }]);
  });

  it("says Wild Shape's Temporary HP once: the Druid level", () => {
    expect(formPickerView(druid(), "druid-wild-shape", "en", "").tempHp).toBe(7);
  });

  it("leaves Polymorph's Temporary HP to each form (its own Hit Points)", () => {
    expect(formPickerView(wizard, "polymorph", "en", "").tempHp).toBeNull();
  });

  it("is empty when nothing matches", () => {
    expect(formPickerView(druid(), "druid-wild-shape", "en", "dragon").groups).toEqual(
      []
    );
  });
});

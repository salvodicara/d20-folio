/**
 * Every SRD magic item whose text rolls a d20 when its last charge is spent, and
 * says what a 1 does to it (destroyed, or a nonmagical item), declares that roll on
 * its charge pool. The outcome is read from the text, never typed twice.
 */
import { describe, expect, it } from "vitest";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { srd } from "../_harness/loc";

const LAST_CHARGE =
  /If you expend the (?:wand['’]s )?last charge, roll 1d20\. On a 1, ([^.]+)\./;

/** What a 1 does, read from the text: a nonmagical item, or gone for good. A
 *  partial loss (Staff of Power keeps its +2) is no disposition. */
function dispositionOf(outcome: string): "nonmagical" | "destroyed" | undefined {
  if (/nonmagical/i.test(outcome)) return "nonmagical";
  if (/destroy|disappears|vanishes|lost forever/i.test(outcome)) return "destroyed";
  return undefined;
}

const stated = SRD_MAGIC_ITEMS.flatMap((item) => {
  const m = LAST_CHARGE.exec(srd("magic-item", item.id, "description", "en"));
  const disposition = m?.[1] === undefined ? undefined : dispositionOf(m[1]);
  return disposition ? [{ item, disposition }] : [];
});

describe("last-charge d20 against the catalogue text", () => {
  it("finds the items whose text rolls on the last charge", () => {
    expect(stated.map(({ item }) => item.id)).toEqual(
      expect.arrayContaining([
        "wand-of-fireballs",
        "staff-of-healing",
        "staff-of-striking",
      ])
    );
  });

  it.each(stated.map(({ item, disposition }) => [item.id, item, disposition] as const))(
    "%s rolls the d20 its text states",
    (_id, item, disposition) => {
      const pool = item.resources?.find((r) => r.id === "charges");
      expect(pool?.onEmpty).toEqual({
        kind: "entered-d20",
        bands: [
          {
            min: 1,
            max: 1,
            outcomes: [{ kind: "set-item-disposition", disposition }],
          },
          { min: 2, max: 20, outcomes: [] },
        ],
      });
    }
  );
});

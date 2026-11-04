/**
 * A spell's range, compact for a table column («Sé · 4,5 m», "Self · 15 ft"): the
 * catalogue's full text («Sé stessi (emanazione di 4,5 metri)») stays the cell's
 * tooltip. Cases are the catalogue's own texts.
 */
import { describe, expect, it } from "vitest";

import { compactRange } from "@/lib/views/compact-range";

describe("compactRange", () => {
  it("a range around the caster: Self and the size", () => {
    expect(compactRange("Sé stessi (emanazione di 4,5 metri)")).toBe("Sé · 4,5 m");
    expect(compactRange("Se stessi (cono di 4,5 metri)")).toBe("Sé · 4,5 m");
    expect(compactRange("Sé stessi (sfera di 3 metri di raggio)")).toBe("Sé · 3 m");
    expect(compactRange("Sé stessi (raggio di 7,5 km)")).toBe("Sé · 7,5 km");
    expect(compactRange("Self (15-foot emanation)")).toBe("Self · 15 ft");
    expect(compactRange("Self (10-foot-radius sphere)")).toBe("Self · 10 ft");
    expect(compactRange("Self (5-mile radius)")).toBe("Self · 5 mi");
  });

  it("a plain distance takes the short unit", () => {
    expect(compactRange("18 metri")).toBe("18 m");
    expect(compactRange("1,5 chilometri")).toBe("1,5 km");
    expect(compactRange("120 feet")).toBe("120 ft");
    expect(compactRange("1 mile")).toBe("1 mi");
    expect(compactRange("500 miles")).toBe("500 mi");
  });

  it("words stay as they are; Self alone is just Self", () => {
    expect(compactRange("Contatto")).toBe("Contatto");
    expect(compactRange("Touch")).toBe("Touch");
    expect(compactRange("Se stessi")).toBe("Sé");
    expect(compactRange("Sé stessi")).toBe("Sé");
    expect(compactRange("Self")).toBe("Self");
  });
});

/** Authored prose keeps a distance's number and unit on one line («6 m», "30 ft"). */
import { describe, expect, it } from "vitest";

import { keepDistancesTogether } from "@/lib/utils";

describe("keepDistancesTogether", () => {
  it("glues the number to its unit", () => {
    expect(keepDistancesTogether("spinto di 6 m o 1,5 m")).toBe("spinto di 6 m o 1,5 m");
    expect(keepDistancesTogether("pushed 10 ft")).toBe("pushed 10 ft");
  });

  it("leaves other words alone", () => {
    expect(keepDistancesTogether("2 mostri, 3 minuti")).toBe("2 mostri, 3 minuti");
  });
});

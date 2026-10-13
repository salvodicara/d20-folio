/**
 * The pack's English descriptions load lazily (`@pack/i18n-en-prose`). Until they
 * land, a description lookup is a quiet blank that asks for the load; it is never a
 * crash. Other misses still fail loudly in dev/test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { localizeSrd } from "@/i18n/resolver";
import {
  __resetEnProseForTest,
  hasEnProse,
  registerEnProse,
  setEnProseLoader,
} from "@/i18n/srd-en";

afterEach(() => {
  setEnProseLoader(() => undefined);
});

describe("lazy pack English prose", () => {
  it("a not-yet-loaded description is a blank that asks for the load, then resolves", () => {
    registerEnProse({ spell: { "zz-probe-spell": { name: "Probe" } } });
    __resetEnProseForTest();
    const load = vi.fn();
    setEnProseLoader(load);

    expect(localizeSrd("spell", "zz-probe-spell", "description", "en")).toBe("");
    expect(load).toHaveBeenCalledTimes(1);
    expect(localizeSrd("spell", "zz-probe-spell", "name", "en")).toBe("Probe");

    registerEnProse({ spell: { "zz-probe-spell": { description: "It probes." } } });
    expect(hasEnProse()).toBe(true);
    expect(localizeSrd("spell", "zz-probe-spell", "description", "en")).toBe(
      "It probes."
    );
    expect(localizeSrd("spell", "zz-probe-spell", "name", "en")).toBe("Probe");
  });

  it("once the prose is in, a missing description fails loudly again", () => {
    registerEnProse({ spell: { "zz-probe-spell-2": { name: "Probe 2" } } });
    expect(() => localizeSrd("spell", "zz-probe-spell-2", "description", "en")).toThrow(
      /missing SRD string/
    );
  });

  it("any other missing field still fails loudly while the prose is loading", () => {
    registerEnProse({ spell: { "zz-probe-spell-3": { name: "Probe 3" } } });
    __resetEnProseForTest();
    expect(() => localizeSrd("spell", "zz-probe-spell-3", "range", "en")).toThrow(
      /missing SRD string/
    );
  });
});

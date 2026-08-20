import { describe, expect, it } from "vitest";

import {
  canonicalFingerprint,
  canonicalJson,
  conformCanonicalFingerprint,
} from "@/lib/canonical-fingerprint";

describe("canonical mechanics fingerprint", () => {
  it.each([
    [null, "sha256:74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"],
    ["abc", "sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25"],
    ["é🐉", "sha256:a309c62cc629cd53c1e2a742cd72c3054b26f4b2bd2af868522630e4b175a766"],
    [
      "a".repeat(100),
      "sha256:9391a07725c98cf85690b4a992a923ca96c7026e9291ef811844d9868734f4e3",
    ],
  ])("matches the SHA-256 vector for canonical %j", (value, expected) => {
    expect(canonicalFingerprint(value)).toBe(expected);
  });

  it("sorts object keys while preserving array order", () => {
    const first = { b: 2, nested: { z: true, a: null }, a: [1, 2] };
    const reordered = { a: [1, 2], nested: { a: null, z: true }, b: 2 };

    expect(canonicalJson(first)).toBe('{"a":[1,2],"b":2,"nested":{"a":null,"z":true}}');
    expect(canonicalFingerprint(first)).toBe(canonicalFingerprint(reordered));
    expect(canonicalFingerprint({ a: [1, 2] })).not.toBe(
      canonicalFingerprint({ a: [2, 1] })
    );
  });

  it("conforms only exact lowercase prefixed digests", () => {
    const digest = canonicalFingerprint({ exact: true });
    expect(conformCanonicalFingerprint(digest)).toBe(digest);
    expect(conformCanonicalFingerprint(digest.toUpperCase())).toBeNull();
    expect(conformCanonicalFingerprint(`sha256:${"0".repeat(63)}`)).toBeNull();
    expect(conformCanonicalFingerprint(`sha512:${"0".repeat(64)}`)).toBeNull();
  });

  it.each([undefined, Symbol("x"), 1n, Number.NaN, Infinity, -Infinity, -0])(
    "rejects the non-JSON scalar %s",
    (value) => {
      expect(() => canonicalFingerprint(value)).toThrow(TypeError);
    }
  );

  it("rejects cycles, executable properties, non-plain objects, sparse arrays and unsafe keys", () => {
    const cycle: { self?: unknown } = {};
    cycle.self = cycle;
    const accessor = {};
    Object.defineProperty(accessor, "value", {
      enumerable: true,
      get: () => 1,
    });
    const unsafe = Object.create(Object.prototype) as Record<string, unknown>;
    Object.defineProperty(unsafe, "__proto__", { enumerable: true, value: {} });
    const sparse = Array(2);
    sparse[1] = true;
    const symbolKey = { safe: true };
    Object.defineProperty(symbolKey, Symbol("hostile"), {
      enumerable: true,
      value: true,
    });
    const hidden = { safe: true };
    Object.defineProperty(hidden, "hidden", { value: true });

    for (const value of [
      cycle,
      accessor,
      unsafe,
      sparse,
      symbolKey,
      hidden,
      Object.create(null),
      new Date(0),
    ]) {
      expect(() => canonicalFingerprint(value)).toThrow(TypeError);
    }
  });

  it("rejects excessive depth before recursing without bound", () => {
    let value: unknown = null;
    for (let index = 0; index < 130; index += 1) value = [value];
    expect(() => canonicalFingerprint(value)).toThrow(TypeError);
  });
});

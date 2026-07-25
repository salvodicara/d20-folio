/**
 * Find Familiar eligible-form resolver — the corpus-DERIVED pool guard (rule 13).
 *
 * The subjects are DERIVED from the composed corpus, never hand-listed: the base
 * pool is recomputed here independently (every CR-0 Beast) and compared to
 * `resolveFamiliarForms`, so a drift in the resolver's filter fails. The one
 * justified hand list is the spell's named-11 (the SRD sentence itself), each id
 * carrying its provenance — a guard that the corpus still holds every named form.
 *
 * BLIND SPOT (rule 13): this cannot see the SRD TEXT. If a future SRD renames a
 * form, the named-11 assertion catches the id break; it CANNOT detect an
 * eligibility RULE change (e.g. the CR cap moving off 0). Mutation-proved: flip the
 * resolver's `crMax: 0` to `crMax: 0.25` and the base-equality assertion fails.
 */
import { describe, it, expect } from "vitest";
import { MONSTERS } from "@/data/monsters";
import { resolveFamiliarForms } from "@/lib/familiar";

/** The 11 forms the SRD 5.2.1 Find Familiar text names by hand (its provenance). */
const NAMED_ELEVEN = [
  "bat",
  "cat",
  "frog",
  "hawk",
  "lizard",
  "octopus",
  "owl",
  "rat",
  "raven",
  "spider",
  "weasel",
] as const;

describe("resolveFamiliarForms — the corpus-derived eligible pool", () => {
  it("with no special forms, equals EXACTLY every CR-0 Beast (recomputed independently)", () => {
    const expected = MONSTERS.filter((m) => m.cr === 0 && m.type === "beast").map(
      (m) => m.id
    );
    const got = resolveFamiliarForms(new Set()).map((m) => m.id);
    expect(got).toEqual(expected);
  });

  it("is non-empty (the picker can never be empty)", () => {
    expect(resolveFamiliarForms(new Set()).length).toBeGreaterThan(0);
  });

  it("contains all 11 SRD-named forms (they are all CR-0 Beasts)", () => {
    const ids = new Set(resolveFamiliarForms(new Set()).map((m) => m.id));
    for (const id of NAMED_ELEVEN) expect(ids.has(id), id).toBe(true);
  });

  it("appends unlocked special forms AFTER the beasts (Pact of the Chain)", () => {
    const base = resolveFamiliarForms(new Set());
    const withSpecial = resolveFamiliarForms(new Set(["imp", "quasit"]));
    expect(withSpecial.length).toBe(base.length + 2);
    // The specials append after the beasts (corpus order for the base).
    const specialIds = withSpecial.slice(base.length).map((m) => m.id);
    expect(new Set(specialIds)).toEqual(new Set(["imp", "quasit"]));
  });

  it("never double-lists a special id that is already a CR-0 Beast", () => {
    const base = resolveFamiliarForms(new Set());
    const firstBeast = base[0]?.id;
    expect(firstBeast).toBeDefined();
    const withDup = resolveFamiliarForms(new Set([firstBeast as string]));
    expect(withDup.length).toBe(base.length);
  });

  it("drops an unknown special id quietly (a pack-only form in an SRD-only build)", () => {
    const base = resolveFamiliarForms(new Set());
    const got = resolveFamiliarForms(new Set(["not-a-real-monster-id"]));
    expect(got.length).toBe(base.length);
  });
});

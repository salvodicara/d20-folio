/**
 * R6+R3 SLICE 7c — the Grant-engine BiText-carrier conversion guard.
 *
 * After 7c the Grant aggregate carries every localizable string (granted-action
 * name/description/trigger, manifested/pact-weapon names, cunning-strike,
 * advantage/roll-floor descriptions, while-active / choice-grant-bundle labels)
 * as a {@link LocText} REF instead of a materialized `BiText` — the engine emits
 * a `{ srd: { kind, key, field } }` pointer the view resolves via `localizeSrd`.
 *
 * This guard runs the evaluator over EVERY grant-bearing SRD source (class
 * features, feats, race traits, invocations, maneuvers, magic items,
 * backgrounds) and asserts that EVERY `srd` LocText the aggregate emits RESOLVES
 * in BOTH locales — i.e. the engine's positional `.grants.<seg>` key derivation
 * (`srdGrantSegment`) reproduces the EXACT catalogue key the codemod wrote. If it
 * ever drifts, `localizeSrd` throws (dev/test) and this fails. This is the proof
 * that the data strip is PURE for grant-internal strings: the engine never reads
 * the soon-deleted `src/data/**` BiText — it resolves from the catalogue.
 */
import { describe, expect, it } from "vitest";
import { evaluateGrants, type GrantSource } from "@/lib/grants";
import { localizeSrd } from "@/i18n/resolver";
import { srdRefForFeatureSource } from "@/lib/srd-feature-lookup";
import { classFeatureIndex } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { raceFeatureEntries } from "@/data/races";
import { SRD_INVOCATIONS } from "@/data/invocations";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { SRD_BACKGROUNDS } from "@/data/backgrounds";
import {
  resolveGrantSourcesForManeuvers,
  resolveGrantSourcesForRace,
} from "@/lib/resolve-grant-sources";
import { SRD_MANEUVERS } from "@/data/maneuvers";
import type { LocText } from "@/lib/loc-text";

// Every `srd` LocText the aggregate can carry must resolve in both locales.
function assertResolves(text: LocText | undefined): void {
  if (!text || !("srd" in text)) return; // lit / custom carry their own string
  for (const locale of ["en", "it"] as const) {
    // localizeSrd THROWS (dev/test) on a missing kind/key/field — so a wrong
    // positional key derivation surfaces as a thrown error here.
    expect(typeof localizeSrd(text.srd.kind, text.srd.key, text.srd.field, locale)).toBe(
      "string"
    );
  }
}

/** Pull every LocText off one aggregate (across every carrier field) + resolve. */
function checkAggregate(sources: ReadonlyArray<GrantSource>): void {
  // Activate every while-active toggle + select every bundle option so the
  // evaluator recurses into the gated inner grants too (their labels/strings key
  // under the nested path).
  const probe = evaluateGrants(sources);
  const activeKeys = new Set(probe.activatableGroups.map((g) => g.key));
  const bundleChoices = new Map(
    probe.grantBundles.flatMap((b) => b.options.map((o) => [b.bundleKey, o.id] as const))
  );
  const agg = evaluateGrants(sources, activeKeys, bundleChoices);

  for (const a of agg.grantedActions) {
    assertResolves(a.name);
    assertResolves(a.description);
    assertResolves(a.trigger);
  }
  for (const w of agg.manifestedWeapons) {
    assertResolves(w.name);
    assertResolves(w.bonusAction?.name);
  }
  for (const p of agg.pactWeapons) assertResolves(p.name);
  for (const r of agg.pactWeaponRiders) assertResolves(r.name);
  for (const c of agg.cunningStrikeOptions) {
    assertResolves(c.name);
    assertResolves(c.description);
  }
  for (const adv of [...agg.advantages, ...agg.disadvantages]) {
    assertResolves(adv.description);
  }
  for (const f of agg.rollFloors) assertResolves(f.description);
  for (const t of agg.tempHpGrants) assertResolves(t.trigger);
  for (const g of agg.activatableGroups) assertResolves(g.label);
  for (const b of agg.grantBundles) {
    assertResolves(b.label);
    for (const o of b.options) assertResolves(o.label);
  }
  for (const cr of agg.choiceResistances) assertResolves(cr.label);
}

describe("R6+R3 7c — every grant LocText `srd` ref resolves in the catalogue", () => {
  it("class features: each feature's grants resolve in EN + IT", () => {
    for (const src of classFeatureIndex.values()) {
      if (!src.grants?.length) continue;
      checkAggregate([
        {
          id: src.id,

          grants: src.grants,
          ref: srdRefForFeatureSource(src),
        },
      ]);
    }
  });

  it("feats: each feat's grants resolve in EN + IT", () => {
    for (const src of SRD_FEATS) {
      if (!src.grants?.length) continue;
      checkAggregate([
        {
          id: src.id,

          grants: src.grants,
          ref: srdRefForFeatureSource(src),
        },
      ]);
    }
  });

  it("race traits: each species' trait grants resolve in EN + IT", () => {
    const raceIds = [...new Set(raceFeatureEntries.map((e) => e.raceId))];
    for (const raceId of raceIds) {
      checkAggregate(resolveGrantSourcesForRace(raceId));
    }
  });

  it("invocations: each invocation's grants resolve in EN + IT", () => {
    for (const inv of SRD_INVOCATIONS) {
      if (!inv.grants?.length) continue;
      checkAggregate([
        {
          id: inv.id,

          grants: inv.grants,
          ref: { kind: "invocation", key: inv.id },
        },
      ]);
    }
  });

  it("maneuvers: each maneuver's runtime granted-action resolves in EN + IT", () => {
    checkAggregate(resolveGrantSourcesForManeuvers(SRD_MANEUVERS.map((m) => m.id)));
  });

  it("magic items: each item's grants resolve in EN + IT", () => {
    for (const item of SRD_MAGIC_ITEMS) {
      if (!item.grants?.length) continue;
      checkAggregate([
        {
          id: item.id,

          grants: item.grants,
          ref: { kind: "magic-item", key: item.id },
        },
      ]);
    }
  });

  it("backgrounds: each background's grants resolve in EN + IT", () => {
    for (const bg of SRD_BACKGROUNDS) {
      if (!bg.grants?.length) continue;
      checkAggregate([
        {
          id: bg.id,

          grants: bg.grants,
          ref: { kind: "background", key: bg.id },
        },
      ]);
    }
  });
});

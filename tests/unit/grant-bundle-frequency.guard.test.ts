/**
 * When each variant choice of the public catalogue may change (`choiceFrequency`).
 *
 * A choice is fixed once made (`once`, the default: Primal Order, Divine Order, an
 * item's type) unless its 2024 rule says otherwise. This guard lists every public
 * choice that says otherwise, with the rule, so a new bundle cannot become
 * re-pickable by forgetting a field (the v0.25.0 bug: the default was `rest`, and the
 * classic rail let a Druid swap Primal Order at will). The private pack keeps its own
 * list, in the pack.
 */
import { describe, expect, it } from "vitest";
import {
  packClassFeatures,
  packFeats,
  packMagicItems,
  packRaces,
  packSpells,
} from "@pack";

import { classFeatures } from "@/data/classes";
import { SRD_FEATS } from "@/data/feats";
import { SRD_MAGIC_ITEMS } from "@/data/magic-items";
import { raceFeatureEntries } from "@/data/races";
import { spells } from "@/data/spells";
import type { Grant } from "@/lib/grants";

/** Re-chosen at a rest. */
const REST: Record<string, string> = {
  "druid-land-terrain":
    "Circle of the Land Spells: whenever you finish a Long Rest, choose one type of land",
  "ranger-hunter-prey":
    "Hunter's Prey: whenever you finish a Short or Long Rest, you can replace the option",
  "ranger-hunter-defensive-tactics":
    "Defensive Tactics: whenever you finish a Short or Long Rest, you can replace the option",
};

/** Chosen each time the spell is cast. */
const CAST: Record<string, string> = {
  "spell-alter-self": "Alter Self: choose one of the options when you cast it",
  "spell-enhance-ability": "Enhance Ability: choose an ability for the spell's duration",
  "spell-enlarge-reduce": "Enlarge/Reduce: choose Enlarge or Reduce when you cast it",
  "spell-guidance": "Guidance: you touch a willing creature and choose a skill",
  "spell-resistance": "Resistance: you touch a willing creature and choose a damage type",
  "spell-fire-shield": "Fire Shield: a warm shield or a chill shield, chosen on casting",
};

type Bundle = Extract<Grant, { type: "choice-grant-bundle" }>;

function bundlesIn(grants: ReadonlyArray<Grant> | undefined): Bundle[] {
  return (grants ?? []).flatMap((grant): Bundle[] => {
    if (grant.type === "while-active") return bundlesIn(grant.grants);
    if (grant.type === "choice-grant-bundle")
      return [grant, ...grant.options.flatMap((option) => bundlesIn(option.grants))];
    return [];
  });
}

const packIds = new Set(
  [...packClassFeatures, ...packFeats, ...packMagicItems, ...packSpells].map((e) => e.id)
);
const packRaceIds = new Set(packRaces.map((race) => race.id));

const publicSources = [
  ...[...classFeatures, ...SRD_FEATS, ...SRD_MAGIC_ITEMS, ...spells].filter(
    (entry) => !packIds.has(entry.id)
  ),
  ...raceFeatureEntries.filter((entry) => !packRaceIds.has(entry.raceId)),
];

/** bundleKey → its frequency (`once` when the grant declares none). */
function frequencies(sources: ReadonlyArray<{ grants?: ReadonlyArray<Grant> }>) {
  const out = new Map<string, string>();
  for (const source of sources)
    for (const bundle of bundlesIn(source.grants))
      out.set(bundle.bundleKey, bundle.choiceFrequency ?? "once");
  return out;
}

describe("when a public variant choice may change", () => {
  const all = frequencies(publicSources);
  const keysWith = (frequency: string) =>
    [...all].filter(([, f]) => f === frequency).map(([key]) => key);

  it("re-chosen at a rest: exactly the listed choices", () => {
    expect(keysWith("rest").sort()).toEqual(Object.keys(REST).sort());
  });

  it("chosen at each cast: exactly the listed choices", () => {
    expect(keysWith("cast").sort()).toEqual(Object.keys(CAST).sort());
  });

  it("a species choice is made at creation (2024 species: chosen with the species)", () => {
    const species = frequencies(
      raceFeatureEntries.filter((entry) => !packRaceIds.has(entry.raceId))
    );
    expect(species.size).toBeGreaterThan(0);
    for (const [key, frequency] of species) expect(frequency, key).toBe("creation");
  });

  it("everything else is fixed once made (a level-up pick, an item's type)", () => {
    for (const key of ["druid-primal-order", "cleric-divine-order", "ioun-stone-type"])
      expect(all.get(key), key).toBe("once");
  });
});

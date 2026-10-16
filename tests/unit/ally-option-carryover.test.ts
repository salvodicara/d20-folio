/**
 * An option spell cast on an ally (Enlarge/Reduce landing on their sheet through
 * the peer path) keeps the ally's pick for THAT occurrence only: the ally's own
 * next cast of the spell asks again, a new occurrence from the caster asks again,
 * and the ally's own pick never pre-selects a landed occurrence. The real store,
 * hydrated with MOCK; the landed effect is projected the way the campaign feed
 * projects it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import { activateActionState } from "@/features/character/center/action-state-commit";
import { useCharacterStore } from "@/stores/characterStore";
import type { ActiveCombatEffect } from "@/types/combat-effect";

const SPELL = "enlarge-reduce";
const KEY = "spell-enlarge-reduce";

function landed(id: string): ActiveCombatEffect {
  return {
    id,
    actor: { kind: "pc", combatantId: "pc-caster", memberUid: "caster" },
    target: {
      kind: "pc",
      combatantId: "pc-ally",
      memberUid: "ally",
      characterId: MOCK_CHARACTER.id,
    },
    source: { kind: "spell", id: SPELL, actionId: KEY, castLevel: 2 },
    payload: { kind: "grant-group", activeKey: KEY },
    duration: { kind: "encounter" },
  } as ActiveCombatEffect;
}

function load(): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: {
      ...base,
      character: {
        ...base.character,
        spells: [...base.character.spells, { srdId: SPELL, prepared: true }],
      },
    },
    loading: false,
    error: null,
    readonly: false,
    encounterEffectProjection: null,
  });
}

const store = () => useCharacterStore.getState();

/** The Enlarge/Reduce choosers the ally's rail shows right now. */
function bundles() {
  const doc = store().character;
  if (!doc) throw new Error("no character");
  return aggregateCharacterGrants(doc.character, doc.session).grantBundles.filter((b) =>
    b.options.some((o) => o.id === "enlarge")
  );
}

/** The ally picks on the chooser the rail shows (the single one lit). */
function pick(optionId: string): void {
  const [bundle] = bundles();
  if (!bundle) throw new Error("no chooser lit");
  store().setGrantBundleChoice(bundle.bundleKey, optionId);
}

function castOnSelf(): void {
  activateActionState(
    { source: "spell", spellId: SPELL, activatesKey: KEY } as ResolvedAction,
    2
  );
}

beforeEach(load);

describe("an option spell cast on an ally", () => {
  it("the ally's pick holds for the landed occurrence", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-1")]);
    pick("enlarge");
    expect(bundles().map((b) => b.selected)).toEqual(["enlarge"]);
  });

  it("the ally's own next cast asks again", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-1")]);
    pick("enlarge");
    store().setEncounterEffects(MOCK_CHARACTER.id, []);
    castOnSelf();
    expect(bundles().map((b) => b.selected)).toEqual([null]);
  });

  it("a new occurrence from the caster asks again", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-1")]);
    pick("reduce");
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-2")]);
    expect(bundles().map((b) => b.selected)).toEqual([null]);
  });

  it("a pick on a new occurrence drops the stale one, so picks never pile up", () => {
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-1")]);
    pick("reduce");
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-2")]);
    pick("enlarge");
    const keys = Object.keys(store().character?.session.grantBundleChoices ?? {});
    expect(keys.filter((k) => k.startsWith(KEY))).toHaveLength(1);
    // Other choices (the mock's elf lineage) are untouched.
    expect(store().character?.session.grantBundleChoices?.["elf-lineage"]).toBe(
      "high-elf"
    );
  });

  it("the ally's own pick never pre-selects a landed occurrence", () => {
    castOnSelf();
    pick("reduce");
    store().setActiveFeature(KEY, false);
    store().setEncounterEffects(MOCK_CHARACTER.id, [landed("occ-1")]);
    expect(bundles().map((b) => b.selected)).toEqual([null]);
  });
});

/**
 * Drinking a timed potion lights its standing effect for as long as its
 * `potion:<id>` countdown runs, and the countdown's expiry clears it. The cases
 * come from the catalogue text (`src/i18n/en/srd/magic-items.json`).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { SRD_MAGIC_ITEMS, getMagicItem } from "@/data/magic-items";
import magicItemsEn from "@/i18n/en/srd/magic-items.json";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { POTION_TIMER_PREFIX, potionTimerKey } from "@/lib/smart-tracker";
import { deriveStatuses } from "@/lib/status";
import { deriveSensesAndSpeeds } from "@/lib/views/sheet-view";
import { potionTimerVMs } from "@/lib/views/tracker-view";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

import { makeCharacterDoc } from "./_helpers";

const text = (id: string): string =>
  (magicItemsEn as Record<string, { description?: string }>)[id]?.description ?? "";

/** A standing effect the existing grant kinds can state, named in the text. */
const STANDING_EFFECT =
  /\b(climbing speed|flying speed|speed doubles|breathe underwater|resistance|strength score)\b/i;

function potionStateGrant(itemId: string) {
  return getMagicItem(itemId)?.grants?.find(
    (grant) => grant.type === "while-active" && grant.activeKey === potionTimerKey(itemId)
  );
}

function drinker(): CharacterDoc {
  return makeCharacterDoc({
    classId: "fighter",
    level: 5,
    equipment: [
      { srdId: "potion-of-flying", quantity: 1 },
      { srdId: "potion-of-water-breathing", quantity: 1 },
    ],
  });
}

function current(): CharacterDoc {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  return doc;
}

function view(doc: CharacterDoc) {
  const aggregate = aggregateCharacterGrants(doc.character, doc.session);
  return { aggregate, ...deriveSensesAndSpeeds(aggregate, 30) };
}

describe("timed potions declare their standing effect", () => {
  const timed = SRD_MAGIC_ITEMS.filter(
    (item) => item.type === "potion" && item.durationRounds !== undefined
  );

  it("every timed potion whose text names a speed, resistance, breathing or score declares it", () => {
    const named = timed.filter((item) => STANDING_EFFECT.test(text(item.id)));
    expect(named.map((item) => item.id).sort()).toEqual([
      "potion-of-climbing",
      "potion-of-flying",
      "potion-of-giant-strength",
      "potion-of-invulnerability",
      "potion-of-resistance",
      "potion-of-speed",
      "potion-of-water-breathing",
    ]);
    expect(named.filter((item) => !potionStateGrant(item.id)).map((i) => i.id)).toEqual(
      []
    );
  });

  it("a declared state lasts exactly the potion's countdown", () => {
    for (const item of SRD_MAGIC_ITEMS.filter((i) => potionStateGrant(i.id))) {
      const grant = potionStateGrant(item.id);
      const duration = grant?.type === "while-active" ? grant.duration : undefined;
      expect(item.id.startsWith("potion-"), item.id).toBe(true);
      expect(duration, item.id).toMatchObject({
        kind: "timed",
        maxRounds: item.durationRounds,
        minutes: (item.durationRounds ?? 0) / 10,
      });
    }
  });
});

describe("drinking a potion lights its state until the countdown ends", () => {
  beforeEach(() => {
    useCharacterStore.getState().setCharacter(drinker());
  });

  it("Potion of Flying: a fly speed equal to your walking speed for 1 hour", () => {
    expect(text("potion-of-flying")).toMatch(
      /flying speed equal to your walking speed for 1 hour/
    );
    expect(view(current()).speeds.some((s) => s.kind === "fly")).toBe(false);

    useCharacterStore.getState().consumePotionBuff("potion-of-flying");
    const lit = current();
    expect(lit.session.activeFeatures).toContain(
      `${POTION_TIMER_PREFIX}potion-of-flying`
    );
    expect(lit.session.effectTimers?.["potion:potion-of-flying"]).toMatchObject({
      roundsLeft: 600,
    });
    expect(view(lit).speeds).toContainEqual({ kind: "fly", rangeFt: 30 });

    for (let round = 0; round < 600; round++) {
      useCharacterStore.getState().advanceEffectTimers();
    }
    const expired = current();
    expect(expired.session.activeFeatures ?? []).not.toContain("potion:potion-of-flying");
    expect(expired.session.effectTimers?.["potion:potion-of-flying"]).toBeUndefined();
    expect(view(expired).speeds.some((s) => s.kind === "fly")).toBe(false);
  });

  it("undoing the drink puts the state back off", () => {
    const undo = useCharacterStore
      .getState()
      .consumePotionBuff("potion-of-water-breathing");
    expect(view(current()).airAndWaterBreathing).toBe(true);
    undo?.();
    expect(view(current()).airAndWaterBreathing).toBe(false);
    expect(current().session.activeFeatures ?? []).toEqual([]);
    expect(current().session.effectTimers).toBeUndefined();
  });

  it("Potion of Invulnerability: Resistance to all damage for 1 minute", () => {
    expect(text("potion-of-invulnerability")).toMatch(
      /1 minute .* Resistance to all damage/
    );
    useCharacterStore.getState().consumePotionBuff("potion-of-invulnerability");
    expect(
      current().session.effectTimers?.["potion:potion-of-invulnerability"]
    ).toMatchObject({ roundsLeft: 10 });
    expect(view(current()).aggregate.allDamageResistance).toBe(true);
  });

  it("Potion of Giant Strength: the giant picked once drunk sets the Strength score", () => {
    expect(text("potion-of-giant-strength")).toMatch(/Storm \(29\)/);
    useCharacterStore.getState().consumePotionBuff("potion-of-giant-strength");
    const doc = current();
    const { aggregate } = view(doc);
    expect(
      aggregate.grantBundles
        .find((b) => b.bundleKey === "potion-of-giant-strength-giant")
        ?.options.map((o) => o.id)
    ).toEqual(["hill", "frost-stone", "fire", "cloud", "storm"]);
    doc.session.grantBundleChoices = { "potion-of-giant-strength-giant": "storm" };
    expect(view(doc).aggregate.abilityScoreFloors).toMatchObject({ STR: 29 });
  });

  it("a carried, undrunk potion contributes nothing", () => {
    const doc = drinker();
    doc.character.equipment = doc.character.equipment.map((ref) => ({
      ...ref,
      equipped: true,
    }));
    const { aggregate } = view(doc);
    expect(aggregate.activatableGroups.filter((g) => g.key.includes("potion"))).toEqual(
      []
    );
    expect(aggregate.flySpeed).toBeNull();
  });
});

describe("the Active Potions rail section", () => {
  it("lists a bare potion countdown once, and leaves a lit potion state to its chip", () => {
    useCharacterStore.getState().setCharacter(drinker());
    useCharacterStore.getState().consumePotionBuff("potion-of-flying");
    useCharacterStore.getState().consumePotionBuff("potion-of-invisibility");
    const doc = current();
    // Both SRD potions now light a state, so neither repeats as a bare countdown.
    expect(potionTimerVMs(deriveStatuses(doc), "en", doc.session.activeFeatures)).toEqual(
      []
    );
    // A countdown with no lit state (Invisibility's state ended by hand) still lists.
    const bare = {
      ...doc,
      session: {
        ...doc.session,
        activeFeatures: ["potion:potion-of-flying"],
      },
    };
    expect(
      potionTimerVMs(deriveStatuses(bare), "en", bare.session.activeFeatures).map(
        (p) => p.itemId
      )
    ).toEqual(["potion-of-invisibility"]);
  });
});

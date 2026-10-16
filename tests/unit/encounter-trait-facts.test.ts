/**
 * Regeneration at the monster's turn start — the DM's one tap books the printed
 * amount through the engine heal path, logged as the Regeneration beat, once
 * per round; the offer hides when it cannot apply (full HP, or a needs-1-HP
 * regenerator at 0 HP). Numbers from the SRD prints: Troll 15 (any HP), Oni 10
 * (only with at least 1 HP).
 */
import i18next from "i18next";
import { describe, expect, it } from "vitest";

import enCommon from "@/i18n/en/ui/common.json";
import enCreate from "@/i18n/en/ui/create.json";
import enMonster from "@/i18n/en/ui/monster.json";
import enSrd from "@/i18n/en/ui/srd.json";
import itCommon from "@/i18n/it/ui/common.json";
import itCreate from "@/i18n/it/ui/create.json";
import itMonster from "@/i18n/it/ui/monster.json";
import itSrd from "@/i18n/it/ui/srd.json";
import {
  addMonster,
  advanceTurn,
  beginEncounterTurns,
  startEncounter,
} from "@/features/campaigns/encounter";
import {
  applyAdversaryDamage,
  applyAdversaryHeal,
} from "@/features/campaigns/encounter-world-command";
import {
  REGENERATION_ACTION,
  applyRegeneration,
  regenerationDue,
  regenerationOffer,
  regeneratedThisRound,
  traitFactLabel,
} from "@/features/campaigns/encounter-trait-facts";
import type { MonsterTraitFact } from "@/data/types";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

const CAMPAIGN_ID = "campaign-under-test";
type Regeneration = Extract<MonsterTraitFact, { kind: "regeneration" }>;
const TROLL: Regeneration = {
  kind: "regeneration",
  amount: 15,
  suppressedBy: ["acid", "fire"],
};
const ONI: Regeneration = { kind: "regeneration", amount: 10, needsHp: true };

function fight(): EncounterState {
  let state = startEncounter({}, [], 1_000);
  state = addMonster(state, {
    ac: 15,
    count: 1,
    initiative: 14,
    maxHp: 94,
    name: "Troll",
    srdId: "troll",
  });
  state = addMonster(state, {
    ac: 13,
    count: 1,
    initiative: 3,
    maxHp: 20,
    name: "Bandit",
  });
  return beginEncounterTurns(state, ["monster-1", "monster-2"]);
}

function troll(state: EncounterState): EncounterMonster {
  const monster = state.combatants.find((c) => c.id === "monster-1");
  if (!monster || monster.kind !== "monster") throw new Error("missing troll");
  return monster;
}

describe("regeneration offer", () => {
  it("offers the printed amount only while the monster is hurt", () => {
    const hurt = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 30);
    expect(regenerationOffer(troll(fight()), TROLL)).toBeNull();
    expect(regenerationOffer(troll(hurt), TROLL)).toBe(15);
  });

  it("a needs-1-HP regenerator gets no offer at 0 HP; the Troll still does", () => {
    const down = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 94);
    expect(troll(down).hp.current).toBe(0);
    expect(regenerationOffer(troll(down), ONI)).toBeNull();
    expect(regenerationOffer(troll(down), TROLL)).toBe(15);
  });
});

describe("when the regeneration is offered", () => {
  it("a hurt regenerator is offered on its own turn only", () => {
    const hurt = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 30);
    expect(regenerationDue(troll(hurt), TROLL, true)).toBe(true);
    expect(regenerationDue(troll(hurt), TROLL, false)).toBe(false);
  });

  it("a Troll at 0 HP never gets a turn, so its regeneration is offered all round", () => {
    const down = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 94);
    // The turn engine skips a monster at 0 HP: the Troll's turn never starts…
    const stepped = advanceTurn(advanceTurn(down));
    expect(stepped.currentCombatantId).not.toBe("monster-1");
    // …so the one tap that keeps it alive stands outside its turn.
    expect(regenerationDue(troll(down), TROLL, false)).toBe(true);
    expect(regenerationDue(troll(down), ONI, false)).toBe(false);
  });
});

describe("applyRegeneration", () => {
  it("heals the printed amount and logs it as the monster's Regeneration", () => {
    const hurt = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 30);
    const next = applyRegeneration(hurt, CAMPAIGN_ID, "monster-1", 15);
    expect(troll(next).hp.current).toBe(79);
    expect(next.events?.at(-1)).toMatchObject({
      kind: "hp-heal",
      amount: 15,
      targetId: "monster-1",
      actorId: "monster-1",
      action: REGENERATION_ACTION,
    });
    expect(regeneratedThisRound(next, "monster-1")).toBe(true);
  });

  it("books once per round: a second tap is a no-op until the next round", () => {
    const hurt = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 60);
    const once = applyRegeneration(hurt, CAMPAIGN_ID, "monster-1", 15);
    expect(applyRegeneration(once, CAMPAIGN_ID, "monster-1", 15)).toBe(once);
    const nextRound = advanceTurn(advanceTurn(once));
    expect(nextRound.round).toBe(2);
    expect(regeneratedThisRound(nextRound, "monster-1")).toBe(false);
    expect(
      troll(applyRegeneration(nextRound, CAMPAIGN_ID, "monster-1", 15)).hp.current
    ).toBe(64);
  });

  it("a Troll at 0 HP regenerates through the revive path, logged the same way", () => {
    const down = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 94);
    const next = applyRegeneration(down, CAMPAIGN_ID, "monster-1", 15);
    expect(troll(next).hp.current).toBe(15);
    expect(next.events?.at(-1)).toMatchObject({
      kind: "hp-heal",
      amount: 15,
      actorId: "monster-1",
      action: REGENERATION_ACTION,
    });
    expect(applyRegeneration(next, CAMPAIGN_ID, "monster-1", 15)).toBe(next);
  });

  it("an ordinary DM heal does not count as the round's regeneration", () => {
    const hurt = applyAdversaryDamage(fight(), CAMPAIGN_ID, "monster-1", 30);
    const healed = applyAdversaryHeal(hurt, CAMPAIGN_ID, "monster-1", 5);
    expect(healed.events?.at(-1)).toMatchObject({ kind: "hp-heal", amount: 5 });
    expect(regeneratedThisRound(healed, "monster-1")).toBe(false);
  });
});

describe("trait fact chips", () => {
  const i18n = i18next.createInstance();
  void i18n.init({
    lng: "it",
    fallbackLng: "en",
    resources: {
      it: { translation: { ...itCommon, ...itCreate, ...itMonster, ...itSrd } },
      en: { translation: { ...enCommon, ...enCreate, ...enMonster, ...enSrd } },
    },
  });
  const label = (fact: MonsterTraitFact, locale: "it" | "en" = "it") => {
    const t = i18n.getFixedT(locale);
    return traitFactLabel(fact, (key, args) => t(key, args));
  };

  it("reads each fact in Italian and English with the printed numbers", () => {
    expect(label({ kind: "advantage", rolls: ["save"], when: "vs-spells" })).toBe(
      "Vantaggio TS contro incantesimi"
    );
    expect(label({ kind: "advantage", rolls: ["save"], when: "vs-spells" }, "en")).toBe(
      "Advantage on saves vs spells"
    );
    expect(
      label({ kind: "advantage", rolls: ["attack", "save"], when: "bloodied" })
    ).toBe("Vantaggio attacchi e TS da Sanguinante");
    expect(
      label({ kind: "advantage", rolls: ["attack"], when: "ally-near-target" })
    ).toBe("Vantaggio attacchi con un alleato a 1,5 m dal bersaglio");
    expect(label(TROLL)).toBe(
      "Rigenera 15 a inizio turno, non dopo danni da Acido o Fuoco"
    );
    expect(label(ONI)).toBe("Rigenera 10 a inizio turno se ha almeno 1 PF");
    expect(label({ kind: "absorb", damageType: "lightning" })).toBe(
      "I danni da Fulmine lo curano"
    );
    expect(label({ kind: "siege" }, "en")).toBe(
      "Double damage to objects and structures"
    );
  });
});

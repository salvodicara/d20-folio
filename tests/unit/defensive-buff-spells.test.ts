/**
 * Defensive-buff spell consumers (display-only; the app models no enemy and never
 * rolls — golden rule 21). 2024 RAW, verified against the published 2024 rules text:
 *
 *  - **Blur** (spell:blur): "any creature has Disadvantage on attack rolls against
 *    you." Modeled as a `while-active` `incoming-attack-disadvantage` clause — a
 *    self-side benefit framed as an Advantage in the rail (the mirror of Reckless
 *    Attack's incoming-attack-ADVANTAGE downside).
 *  - **Warding Bond** (spell:warding-bond): "You touch ANOTHER creature… it gains
 *    a +1 bonus to AC and saving throws" — TARGET-ONLY, the caster never benefits.
 *    Modeled as a `while-active` +1 AC (`ac-bonus`) + +1 all saves (`save-bonus`)
 *    with `autoActivateOnCast: false`, so CASTING never self-buffs (no
 *    `activatesKey` on the cast action); the WARDED creature's sheet lights the
 *    toggle manually from the rail. The shared-damage / resistance posture is a
 *    neutrally-worded defenses reminder line.
 *  - **Death Ward** (spell:death-ward): "The first time the target would drop to 0
 *    Hit Points before the spell ends, the target instead drops to 1 Hit Point,
 *    and the spell ends." A deterministic 0-HP interrupt in the damage seam.
 *  - **Mirror Image** (spell:mirror-image): three duplicates; a 3-charge tracker +
 *    the d6 ≥ 3 note, player-managed.
 */
import { describe, it, expect } from "vitest";
import { aggregateCharacterGrants } from "@/lib/aggregate-character";
import { resolveActions } from "@/lib/smart-tracker";
import { incomingAttackAdvantageVMs } from "@/lib/views/tracker-view";
import { concentrationValue } from "@/lib/concentration";
import { getSpellById } from "@/data/spells";
import { MOCK_CHARACTER } from "@/lib/mock";
import type { CharacterDoc } from "@/types/character";

/** MOCK caster with `spellId` prepared; `activeKeys` lights the buff toggle. */
function buffed(spellId: string, activeKeys: string[]): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      spells: [{ srdId: spellId, prepared: true }],
    },
    session: {
      ...MOCK_CHARACTER.session,
      concentration: concentrationValue(spellId),
      activeFeatures: activeKeys,
    },
  };
}

// ── Blur — incoming-attack-disadvantage ─────────────────────────────────────

describe("Blur — attackers have Disadvantage against you (display-only)", () => {
  it("declares a while-active incoming-attack-disadvantage clause", () => {
    const wa = (getSpellById("blur")?.grants ?? []).find(
      (g) => g.type === "while-active"
    );
    expect(wa && "activeKey" in wa && wa.activeKey).toBe("spell-blur");
  });

  it("LIT: the aggregate reports the clause with its while-active key", () => {
    const on = aggregateCharacterGrants(buffed("blur", ["spell-blur"]).character, {
      ...MOCK_CHARACTER.session,
      activeFeatures: ["spell-blur"],
    });
    expect(on.incomingAttackDisadvantages).toHaveLength(1);
    expect(on.incomingAttackDisadvantages[0]?.whileActiveKey).toBe("spell-blur");

    const [vmEn] = incomingAttackAdvantageVMs(on.incomingAttackDisadvantages, "en");
    expect(vmEn?.whileActive).toBe(true);
    expect(vmEn?.description).toMatch(/disadvantage/i);
    const [vmIt] = incomingAttackAdvantageVMs(on.incomingAttackDisadvantages, "it");
    expect(vmIt?.description).toMatch(/svantaggio/i);
    expect(vmIt?.description).not.toMatch(/disadvantage/i); // no EN leak
  });

  it("FAIL-BEFORE: OFF, no incoming-attack-disadvantage clause is reported", () => {
    const off = aggregateCharacterGrants(buffed("blur", []).character, {
      ...MOCK_CHARACTER.session,
      activeFeatures: [],
    });
    expect(off.incomingAttackDisadvantages).toHaveLength(0);
  });
});

// ── Warding Bond — TARGET-ONLY +1 AC, +1 saves, shared-damage reminder ──────

describe("Warding Bond — target-only +1 AC + +1 saves (manual toggle, no self-buff)", () => {
  // The toggle is lit MANUALLY (the warded creature's sheet, via the rail) — never
  // auto-lit on cast (the caster never benefits; `autoActivateOnCast: false`).
  const sessionOn = { ...MOCK_CHARACTER.session, activeFeatures: ["spell-warding-bond"] };
  const sessionOff = { ...MOCK_CHARACTER.session, activeFeatures: [] };
  const char = buffed("warding-bond", ["spell-warding-bond"]).character;

  it("FAIL-BEFORE (target-only): the CAST action carries NO activatesKey — casting never self-buffs", () => {
    // Warding Bond opts out of the S1 cast→toggle auto-light; a SELF buff (Shield
    // of Faith) keeps it. Pin both sides of the seam on the resolved cast actions.
    const doc: CharacterDoc = {
      ...MOCK_CHARACTER,
      character: {
        ...MOCK_CHARACTER.character,
        spells: [
          { srdId: "warding-bond", prepared: true },
          { srdId: "shield-of-faith", prepared: true },
        ],
      },
      session: { ...MOCK_CHARACTER.session, activeFeatures: [] },
    };
    const actions = resolveActions(doc);
    const wardingBond = actions.find((a) => a.spellId === "warding-bond");
    const shieldOfFaith = actions.find((a) => a.spellId === "shield-of-faith");
    expect(wardingBond).toBeDefined();
    expect(wardingBond?.activatesKey).toBeUndefined();
    // The self-buff control: the auto-light stamp still works where RAW self-buffs.
    expect(shieldOfFaith?.activatesKey).toBe("spell-shield-of-faith");
  });

  it("manual toggle ON → +1 to the AC bonus (ac-bonus channel)", () => {
    // Assert the aggregate `acBonus` (the ac-bonus channel Shield of Faith uses);
    // the displayed AC folds this via computeAC unless a manual acOverride wins
    // (override-first, rule 8 — the MOCK pins its AC, so effectiveAC is override-led).
    const off = aggregateCharacterGrants(char, sessionOff);
    const on = aggregateCharacterGrants(char, sessionOn);
    expect(on.acBonus - off.acBonus).toBe(1);
  });

  it("manual toggle ON → +1 to the flat save bonus (save-bonus channel)", () => {
    const off = aggregateCharacterGrants(char, sessionOff);
    const on = aggregateCharacterGrants(char, sessionOn);
    expect(on.saveBonusFlat - off.saveBonusFlat).toBe(1);
  });

  it("surfaces the shared-damage / resistance reminder as a NEUTRALLY-worded defense note (en+it)", () => {
    const on = aggregateCharacterGrants(char, sessionOn);
    expect(on.defenseNotes).toHaveLength(1);
    expect(on.defenseNotes[0]?.whileActiveKey).toBe("spell-warding-bond");
    const [vmEn] = incomingAttackAdvantageVMs(on.defenseNotes, "en");
    expect(vmEn?.description).toMatch(/resistance to all damage/i);
    // Neutral third-person wording — reads correctly on whichever sheet has it
    // lit (never "you"/"your", which would be wrong on one of the two sheets).
    expect(vmEn?.description).toMatch(/warded creature/i);
    expect(vmEn?.description).not.toMatch(/\byou\b|\byour\b/i);
    const [vmIt] = incomingAttackAdvantageVMs(on.defenseNotes, "it");
    expect(vmIt?.description).toMatch(/resistenza a tutti i danni/i);
    expect(vmIt?.description).not.toMatch(/resistance to all/i); // no EN leak
  });

  it("FAIL-BEFORE: OFF, no AC/save bump and no defense note", () => {
    const off = aggregateCharacterGrants(char, sessionOff);
    expect(off.defenseNotes).toHaveLength(0);
    expect(off.saveBonusFlat).toBe(0);
  });
});

// ── Mirror Image — the three-duplicate d6 reminder (display-only) ───────────

describe("Mirror Image — the three-duplicate reminder (display-only)", () => {
  it("LIT: surfaces the structured d6-threshold note (en+it), while-active", () => {
    const on = aggregateCharacterGrants(buffed("mirror-image", []).character, {
      ...MOCK_CHARACTER.session,
      activeFeatures: ["spell-mirror-image"],
    });
    expect(on.defenseNotes).toHaveLength(1);
    expect(on.defenseNotes[0]?.whileActiveKey).toBe("spell-mirror-image");
    const [vmEn] = incomingAttackAdvantageVMs(on.defenseNotes, "en");
    expect(vmEn?.description).toMatch(/three duplicates/i);
    expect(vmEn?.description).toMatch(/3\+/);
    const [vmIt] = incomingAttackAdvantageVMs(on.defenseNotes, "it");
    expect(vmIt?.description).toMatch(/duplicati/i);
    expect(vmIt?.description).not.toMatch(/duplicates/i); // no EN leak
  });

  it("FAIL-BEFORE: OFF, no reminder is reported", () => {
    const off = aggregateCharacterGrants(buffed("mirror-image", []).character, {
      ...MOCK_CHARACTER.session,
      activeFeatures: [],
    });
    expect(off.defenseNotes).toHaveLength(0);
  });
});

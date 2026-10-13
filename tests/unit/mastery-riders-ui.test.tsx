/**
 * The mastery rider row on the attack card: it reads with the live number in the
 * player's language, and a tap logs a rider-use line (Vex also lights the
 * next-attack Advantage) that one undo reverses exactly.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import i18n from "@/i18n";
import { MasteryRiders } from "@/components/shared/MasteryRiders";
import { applyMasteryRider } from "@/features/character/center/mastery-rider-commit";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { localizeActions } from "@/lib/views/combat-action-view";
import { useCharacterStore } from "@/stores/characterStore";
import { useCombatStore } from "@/stores/combatStore";
import { useUndoStore } from "@/stores/undoStore";
import { damageTrayPlan, initialTrayRow, toggleCondition } from "@/lib/play/damage-tray";
import type { CharacterDoc } from "@/types/character";

function fighter(weapons: string[]): CharacterDoc {
  const doc = buildDevScenario("weapon-mastery-numbers");
  if (!doc) throw new Error("scenario missing");
  doc.character.weapons = weapons.map((srdId) => ({ srdId, quantity: 1 }));
  const entry = doc.character.classes[0];
  if (!entry) throw new Error("no class entry");
  entry.weaponMasteries = weapons;
  return doc;
}

function card(doc: CharacterDoc, weaponId: string) {
  const action = localizeActions(doc, "it").find((a) => a.id === `weapon-${weaponId}`);
  if (!action) throw new Error(`no ${weaponId} card`);
  return action;
}

afterEach(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
});

describe("mastery rider row", () => {
  it("reads Topple's DC and Graze's damage from the character, in Italian", async () => {
    await i18n.changeLanguage("it");
    const doc = fighter(["quarterstaff", "glaive"]);
    const riders = [
      ...(card(doc, "quarterstaff").masteryRiders ?? []),
      ...(card(doc, "glaive").masteryRiders ?? []),
    ];
    render(<MasteryRiders riders={riders} onApply={() => undefined} />);
    // STR 16 (+3), PB 3 → Topple DC 14; Graze = the STR modifier.
    expect(screen.getByText("Rovesciamento: TS COS CD 14 → Prono")).toBeTruthy();
    expect(screen.getByText("Colpo di Striscio: danni 3 se manchi")).toBeTruthy();
  });

  it("tapping a row hands that rider to the apply handler", () => {
    const doc = fighter(["quarterstaff"]);
    const riders = card(doc, "quarterstaff").masteryRiders ?? [];
    const applied: string[] = [];
    render(<MasteryRiders riders={riders} onApply={(r) => applied.push(r.id)} />);
    fireEvent.click(screen.getByRole("button"));
    expect(applied).toEqual(["topple"]);
  });
});

describe("declaring a mastery rider", () => {
  beforeEach(() => {
    useUndoStore.setState({ past: [], future: [] });
    useCombatStore.setState({ nextAttackAdvantage: false });
  });

  function riderLogs(): number {
    return (useCharacterStore.getState().character?.session.logEntries ?? []).filter(
      (e) => e.event.kind === "rider-use"
    ).length;
  }

  it("Vex logs a rider-use and grants Advantage on the next attack; undo reverses both", () => {
    const doc = fighter(["shortsword"]);
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    const action = card(doc, "shortsword");
    const vex = action.masteryRiders?.[0];
    expect(vex?.id).toBe("vex");
    if (!vex) return;

    act(() => applyMasteryRider(action, vex, { applied: "ok", blocked: "no" }));
    expect(useCombatStore.getState().nextAttackAdvantage).toBe(true);
    expect(riderLogs()).toBe(1);

    act(() => {
      useUndoStore.getState().undo();
    });
    expect(useCombatStore.getState().nextAttackAdvantage).toBe(false);
    expect(riderLogs()).toBe(0);
  });

  it("Topple puts an opt-in Prone chip on each damage-tray row; other masteries none", () => {
    const doc = fighter(["quarterstaff", "glaive"]);
    const tray = damageTrayPlan(card(doc, "quarterstaff"), ["monster-1"], "pc-me");
    expect(tray?.conditions?.options).toEqual(["prone"]);
    // Topple needs a hit and a failed save: the chip starts off.
    if (!tray) return;
    const row = initialTrayRow(tray, "monster-1");
    expect(row.conditions).toEqual([]);
    expect(toggleCondition(row, "prone", tray).conditions).toEqual(["prone"]);
    // SRD 5.2.1 Topple: a Constitution save, DC 8 + the attack's ability modifier
    // + PB. STR 16 (+3), PB 3 → DC 14, shown on the Prone chip.
    expect(tray.conditions?.save).toEqual({ ability: "CON", dc: 14 });
    expect(
      damageTrayPlan(card(doc, "glaive"), ["monster-1"], "pc-me")?.conditions
    ).toBeUndefined();
  });

  it("Topple only logs — the Prone lands from the damage tray", () => {
    const doc = fighter(["quarterstaff"]);
    useCharacterStore.setState({ character: doc, loading: false, error: null });
    const action = card(doc, "quarterstaff");
    const topple = action.masteryRiders?.[0];
    if (!topple) throw new Error("no topple");

    act(() => applyMasteryRider(action, topple, { applied: "ok", blocked: "no" }));
    expect(riderLogs()).toBe(1);
    expect(useCombatStore.getState().nextAttackAdvantage).toBe(false);
  });

  it("the log names the mastery with its weapon in brackets; a resource keeps 'spent'", async () => {
    // The target is not known when the rider is declared, and "Topple on
    // Quarterstaff" reads as toppling the weapon: the weapon goes in brackets.
    const args = { rider: "Topple", name: "Quarterstaff" };
    expect(i18n.t("combatLog.masteryUse", args)).toBe("Topple (Quarterstaff)");
    expect(i18n.t("combatLog.riderUse", { rider: "Sneak Attack", name: "Dagger" })).toBe(
      "Spent Sneak Attack on Dagger"
    );
    await i18n.changeLanguage("it");
    expect(
      i18n.t("combatLog.masteryUse", { rider: "Rovesciamento", name: "Bastone Ferrato" })
    ).toBe("Rovesciamento (Bastone Ferrato)");
    expect(
      i18n.t("combatLog.riderUse", { rider: "Attacco Furtivo", name: "Pugnale" })
    ).toBe("Attacco Furtivo speso su Pugnale");
  });
});

/**
 * Toast-intent presenter (`lib/views/toast-intent.ts`) — the toasts-as-data
 * localization seam (§3.2). The store emits structured intents (ids + numbers);
 * this presenter maps each `kind` to its i18n template and resolves the one id
 * arg (a condition id → its localized name) via an injected resolver. Pure: the
 * `t` + name resolver are passed in, so the test uses trivial fakes — no i18n
 * runtime, no React. Fast-lane (jsdom-free).
 */
import { describe, it, expect } from "vitest";
import { localizeToastIntent } from "@/lib/views/toast-intent";
import type { ToastIntent } from "@/types/toast";

/** Fake translator: echoes the key + interpolated args so we can assert routing. */
const t = (key: string, args?: Record<string, string | number>): string =>
  args ? `${key} ${JSON.stringify(args)}` : key;

const resolveConditionName = (id: string): string => `«${id}»`;
// Concentration is stored as a spell id (golden rule 7); the injected resolver
// localizes it. A marker so the test asserts it is consulted on EVERY spell arg.
const resolveSpellName = (value: string): string => `⟨${value}⟩`;

const localize = (intent: ToastIntent): string =>
  localizeToastIntent(intent, t, resolveConditionName, resolveSpellName);

describe("localizeToastIntent", () => {
  it("resolves the concentration spell id for concentration-dropped", () => {
    expect(localize({ kind: "concentration-dropped", spell: "bless" })).toBe(
      'combat.concentrationDroppedToast {"spell":"⟨bless⟩"}'
    );
  });

  it("resolves the spell id for concentration-save (+ dc + the formatted save)", () => {
    expect(
      localize({
        kind: "concentration-save",
        spell: "hex",
        dc: 12,
        saveBonus: 7,
        advantage: false,
      })
    ).toBe('combat.concentrationSaveToast {"spell":"⟨hex⟩","dc":12,"save":"+7"}');
    // Negative saves keep their sign (no "+-2").
    expect(
      localize({
        kind: "concentration-save",
        spell: "hex",
        dc: 12,
        saveBonus: -2,
        advantage: false,
      })
    ).toBe('combat.concentrationSaveToast {"spell":"⟨hex⟩","dc":12,"save":"-2"}');
  });

  // RA-15 — a War Caster / Eldritch Mind concentrator routes to the Advantage
  // template (still carrying spell/dc/save).
  it("routes concentration-save to the Advantage template when advantage is set", () => {
    expect(
      localize({
        kind: "concentration-save",
        spell: "hex",
        dc: 12,
        saveBonus: 7,
        advantage: true,
      })
    ).toBe(
      'combat.concentrationSaveAdvantageToast {"spell":"⟨hex⟩","dc":12,"save":"+7"}'
    );
  });

  it("resolves BOTH previous + next spell ids for concentration-replaced", () => {
    expect(
      localize({ kind: "concentration-replaced", previous: "hex", next: "bless" })
    ).toBe('combat.concentrationReplacedToast {"previous":"⟨hex⟩","next":"⟨bless⟩"}');
  });

  it("resolves the spell id for stopped-concentrating", () => {
    expect(localize({ kind: "stopped-concentrating", spell: "bless" })).toBe(
      'combat.stoppedConcentratingToast {"spell":"⟨bless⟩"}'
    );
  });

  it("resolves the condition id to a localized name for condition-removed", () => {
    expect(localize({ kind: "condition-removed", conditionId: "Frightened" })).toBe(
      'combat.conditionRemovedToast {"condition":"«Frightened»"}'
    );
  });

  // PLAY-NO-EDIT — defense-removed routes by defense KIND and resolves the id:
  // damage kinds through the `srd.damage_*` keys, condition immunities through
  // the injected condition-name resolver.
  it("routes defense-removed per kind with the localized damage-type name", () => {
    expect(
      localize({ kind: "defense-removed", defenseKind: "resistance", defenseId: "fire" })
    ).toBe('combat.resistanceRemovedToast {"name":"srd.damage_fire"}');
    expect(
      localize({ kind: "defense-removed", defenseKind: "immunity", defenseId: "poison" })
    ).toBe('combat.immunityRemovedToast {"name":"srd.damage_poison"}');
    expect(
      localize({
        kind: "defense-removed",
        defenseKind: "vulnerability",
        defenseId: "cold",
      })
    ).toBe('combat.vulnerabilityRemovedToast {"name":"srd.damage_cold"}');
  });

  it("resolves a condition-immunity defense id via the condition-name resolver", () => {
    expect(
      localize({
        kind: "defense-removed",
        defenseKind: "conditionImmunity",
        defenseId: "frightened",
      })
    ).toBe('combat.conditionImmunityRemovedToast {"name":"«frightened»"}');
  });
});

/**
 * Monster damage defenses — the DM's damage entry on a monster runs through the
 * shared damage intake with the monster's own resistances / vulnerabilities /
 * immunities, and the condition editor refuses a condition the monster is
 * immune to. Cases come from the real bestiary.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import i18n, { ensureSrdKind } from "@/i18n";

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/dm-readers", () => ({
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

import { MONSTERS } from "@/data/monsters";
import { addMonster, startEncounter } from "@/features/campaigns/encounter";
import { toMonsterInput } from "@/features/campaigns/encounter-monster-input";
import { applyAdversaryDamageParts } from "@/features/campaigns/encounter-world-command";
import { monsterConditionImmunities } from "@/features/campaigns/encounter-view";
import { MonsterCard } from "@/features/campaigns/party-encounter";
import { ConditionEditor } from "@/features/character/molecules/ConditionEditor";
import { conditionOptions } from "@/lib/views/tracker-view";
import type { MonsterStatBlock } from "@/data/types";
import type { DamageType } from "@/types/damage";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

await ensureSrdKind("monster");

beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

/** One bestiary monster alone in a fresh encounter, with room for 20 damage. */
function encounterWith(m: MonsterStatBlock, tempHp = 0): EncounterState {
  let state = addMonster(startEncounter({}, [], 1), {
    ...toMonsterInput(m, "en", 1),
    maxHp: 100,
  });
  if (tempHp > 0) {
    state = {
      ...state,
      combatants: state.combatants.map((c) =>
        c.kind === "monster" ? { ...c, hp: { ...c.hp, temp: tempHp } } : c
      ),
    };
  }
  return state;
}

function monsterOf(state: EncounterState): EncounterMonster {
  return state.combatants[0] as EncounterMonster;
}

/** The value, or a loud failure when the bestiary/DOM lacks it. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing ${what}`);
  return value;
}

/** Every (monster, type, expected net of 10) the bestiary declares. Immunity wins;
 *  a type both resisted and doubled nets 10 (RAW order: halve, then double). */
const DAMAGE_CASES: Array<[string, DamageType, number]> = MONSTERS.flatMap((m) => {
  const types = new Set<DamageType>([
    ...(m.damageResistances ?? []),
    ...(m.damageImmunities ?? []),
    ...(m.damageVulnerabilities ?? []),
  ]);
  return [...types].map((type): [string, DamageType, number] => {
    if (m.damageImmunities?.includes(type)) return [m.id, type, 0];
    let net = 10;
    if (m.damageResistances?.includes(type)) net = Math.floor(net / 2);
    if (m.damageVulnerabilities?.includes(type)) net *= 2;
    return [m.id, type, net];
  });
});

describe("applyAdversaryDamageParts — the monster's own defenses apply (bestiary)", () => {
  it("the bestiary has resistance, immunity and vulnerability cases", () => {
    expect(DAMAGE_CASES.some(([, , n]) => n === 5)).toBe(true);
    expect(DAMAGE_CASES.some(([, , n]) => n === 0)).toBe(true);
    expect(DAMAGE_CASES.some(([, , n]) => n === 20)).toBe(true);
  });

  it.each(DAMAGE_CASES)("%s takes 10 %s as %i", (id, type, expected) => {
    const m = must(
      MONSTERS.find((x) => x.id === id),
      "monster"
    );
    const before = encounterWith(m);
    const after = applyAdversaryDamageParts(before, "camp-test", "monster-1", [
      { amount: 10, type },
    ]);
    expect(monsterOf(after).hp.current).toBe(100 - expected);
    // The chronicle beat reads the APPLIED amount (no beat when nothing landed).
    const beat = (after.events ?? []).find((e) => e.kind === "hp-damage");
    if (expected === 0) expect(beat).toBeUndefined();
    else expect(beat).toMatchObject({ amount: expected, targetId: "monster-1" });
  });

  it("untyped damage applies verbatim, even on a defended monster", () => {
    const m = must(
      MONSTERS.find((x) => x.damageResistances?.includes("fire")),
      "monster"
    );
    const after = applyAdversaryDamageParts(encounterWith(m), "camp-test", "monster-1", [
      { amount: 10 },
    ]);
    expect(monsterOf(after).hp.current).toBe(90);
  });

  it("temp HP absorbs the reduced amount first", () => {
    const m = must(
      MONSTERS.find((x) => x.damageResistances?.includes("fire")),
      "monster"
    );
    const after = applyAdversaryDamageParts(
      encounterWith(m, 3),
      "camp-test",
      "monster-1",
      [{ amount: 10, type: "fire" }]
    );
    expect(monsterOf(after).hp).toEqual({ current: 98, temp: 0, max: 100 });
  });
});

// A first card render is heavy (the whole hub module graph): give it room on a busy box.
describe(
  "MonsterCard — the DM's HP popover offers the monster's damage types",
  { timeout: 30_000 },
  () => {
    it("picking Fire on a fire-resistant monster shows 10 → 5 and applies 5", () => {
      const m = must(
        MONSTERS.find(
          (x) => x.damageResistances?.includes("fire") && !x.damageImmunities?.length
        ),
        "monster"
      );
      let encounter = encounterWith(m);
      const apply = vi.fn((fn: (e: EncounterState) => EncounterState) => {
        encounter = fn(encounter);
      });
      const name = monsterOf(encounter).name;
      render(
        <MonsterCard
          campaignId="camp-test"
          monster={monsterOf(encounter)}
          isCurrent={false}
          apply={apply}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: `Hit points for ${name}` }));
      fireEvent.change(screen.getByLabelText(/amount of damage/i), {
        target: { value: "10" },
      });
      const group = screen.getByRole("group", { name: /damage type/i });
      fireEvent.click(within(group).getByRole("button", { name: "Fire" }));
      expect(screen.getByText("10 → 5 · Resistance")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /^Damage$/ }));
      expect(monsterOf(encounter).hp.current).toBe(95);
      expect(encounter.events?.[0]).toMatchObject({ kind: "hp-damage", amount: 5 });
    });

    it("an undefended monster keeps the plain editor (no type chips)", () => {
      const m = must(
        MONSTERS.find(
          (x) =>
            !x.damageResistances?.length &&
            !x.damageImmunities?.length &&
            !x.damageVulnerabilities?.length
        ),
        "monster"
      );
      const encounter = encounterWith(m);
      render(
        <MonsterCard
          campaignId="camp-test"
          monster={monsterOf(encounter)}
          isCurrent={false}
          apply={vi.fn()}
        />
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: `Hit points for ${monsterOf(encounter).name}`,
        })
      );
      expect(screen.queryByRole("group", { name: /damage type/i })).toBeNull();
    });
  }
);

/** Each distinct unconditional condition-immunity set in the bestiary, once. */
const IMMUNITY_SETS: Array<[string, string[]]> = [
  ...new Map(
    MONSTERS.flatMap((m): Array<[string, [string, string[]]]> => {
      const set = [
        ...(monsterConditionImmunities(toMonsterInput(m, "en", 1).defenses) ?? []),
      ].sort();
      return set.length > 0 ? [[set.join(","), [m.id, set]]] : [];
    })
  ).values(),
];

describe(
  "ConditionEditor — a monster's condition immunities are not addable (bestiary)",
  { timeout: 30_000 },
  () => {
    it("the bestiary has condition immunities", () => {
      expect(IMMUNITY_SETS.length).toBeGreaterThan(0);
    });

    it.each(IMMUNITY_SETS)("%s: %j are not offered", (_id, immune) => {
      render(
        <ConditionEditor
          conditions={[]}
          immunities={new Set(immune)}
          onToggle={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
      const offered = screen
        .getAllByRole("option")
        .map((option) => option.getAttribute("data-condition"));
      for (const id of immune) expect(offered).not.toContain(id);
      // Every other condition is still offered, and none of them is greyed out.
      expect(offered).toHaveLength(conditionOptions("en").length - immune.length);
      for (const option of screen.getAllByRole("option")) {
        expect(option).toHaveProperty("disabled", false);
        expect(option.getAttribute("title")).toBeNull();
      }
    });

    it("an immune condition already on the monster stays removable from the picker", () => {
      const onToggle = vi.fn();
      render(
        <ConditionEditor
          conditions={["poisoned"]}
          immunities={new Set(["poisoned"])}
          onToggle={onToggle}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
      const poisoned = must(
        screen
          .getAllByRole("option")
          .find((o) => o.getAttribute("data-condition") === "poisoned"),
        "poisoned option"
      );
      fireEvent.click(poisoned);
      expect(onToggle).toHaveBeenCalledWith("poisoned");
    });

    it("the monster card wires the monster's immunities into its condition editor", () => {
      const m = must(
        MONSTERS.find(
          (x) =>
            x.conditionImmunities?.includes("poisoned") &&
            x.conditionImmunities.every((c) => typeof c === "string")
        ),
        "monster"
      );
      const encounter = encounterWith(m);
      const apply = vi.fn();
      const { container } = render(
        <MonsterCard
          campaignId="camp-test"
          monster={monsterOf(encounter)}
          isCurrent={false}
          apply={apply}
        />
      );
      fireEvent.click(
        must(
          container.querySelector("[aria-controls='monster-detail-monster-1']"),
          "card toggle"
        )
      );
      fireEvent.click(screen.getByRole("button", { name: /add condition/i }));
      const offered = screen
        .getAllByRole("option")
        .map((o) => o.getAttribute("data-condition"));
      expect(offered).not.toContain("poisoned");
      expect(offered.length).toBeGreaterThan(0);
    });
  }
);

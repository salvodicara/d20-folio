/**
 * The DM's monster counters on the stat-block disclosure: every Recharge, N/Day,
 * per-day spell and legendary pool the bestiary prints renders a control; tapping
 * one spends or restores it in the encounter's `spent`; a per-day spell also reports
 * the cast so it reaches the chronicle. Cases come from the bestiary itself.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18n, { ensureSrdKind } from "@/i18n";
import type { MonsterStatBlock } from "@/data/types";
import { EncounterStatblockModal } from "@/features/campaigns/encounter-bestiary";
import {
  addMonster,
  monsterLimitedUses,
  startEncounter,
} from "@/features/campaigns/encounter";
import { localizeSrd } from "@/i18n/resolver";
import type { EncounterMonster, EncounterState } from "@/types/campaign";

// encounter-bestiary → party-encounter → campaign-io → firestore → firebase.
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/campaigns/dm-readers", () => ({
  recomputeDmReadersForChars: vi.fn(() => Promise.resolve()),
}));

let MONSTERS: ReadonlyArray<MonsterStatBlock> = [];
beforeAll(async () => {
  if (i18n.language !== "en") await i18n.changeLanguage("en");
  await ensureSrdKind("monster");
  ({ MONSTERS } = await import("@/data/monsters"));
});

/** The modal over a live one-monster encounter, as MonsterCard mounts it for the DM. */
function Harness({
  srdId,
  onCast,
  onState,
}: {
  srdId: string;
  onCast?: (spellId: string) => void;
  onState: (state: EncounterState) => void;
}) {
  const [state, setState] = useState(() =>
    addMonster(startEncounter({}, [], 1), {
      name: "Foe",
      ac: 15,
      maxHp: 100,
      count: 1,
      initiative: 10,
    })
  );
  onState(state);
  const monster = state.combatants[0] as EncounterMonster;
  return (
    <EncounterStatblockModal
      srdId={srdId}
      combatantName="Foe"
      combatantId={monster.id}
      spent={monster.spent}
      apply={(fn) => setState((live) => fn(live))}
      onCastSpell={onCast}
      onClose={vi.fn()}
    />
  );
}

function mount(srdId: string, onCast?: (spellId: string) => void) {
  let latest: EncounterState | null = null;
  const view = render(
    <Harness srdId={srdId} onCast={onCast} onState={(s) => (latest = s)} />
  );
  const spent = () => (latest?.combatants[0] as EncounterMonster | undefined)?.spent;
  return { ...view, spent };
}

const control = (key: string) => {
  const el = document.querySelector<HTMLElement>(`[data-use="${key}"]`);
  if (!el) throw new Error(`no control for ${key}`);
  return el;
};
const pips = (key: string) => within(control(key)).getAllByRole("button");

describe("monster counters on the DM statblock", () => {
  it("every limited use and every listed spell in the bestiary renders its control", () => {
    const tracked = MONSTERS.filter(
      (m) =>
        monsterLimitedUses(m).length > 0 ||
        [...m.actions, ...(m.bonusActions ?? [])].some((e) => e.kind === "spellcasting")
    );
    expect(tracked.length).toBeGreaterThan(60);
    for (const m of tracked) {
      const { unmount } = render(
        <EncounterStatblockModal
          srdId={m.id}
          combatantName={m.id}
          combatantId="monster-1"
          apply={vi.fn()}
          onClose={vi.fn()}
        />
      );
      for (const use of monsterLimitedUses(m)) {
        const el = control(use.key);
        if (use.kind === "recharge") {
          expect(el.getAttribute("aria-pressed"), `${m.id} ${use.key}`).toBe("false");
        } else {
          expect(within(el).getAllByRole("button"), `${m.id} ${use.key}`).toHaveLength(
            use.max
          );
        }
      }
      for (const section of ["traits", "actions", "bonusActions", "reactions"] as const) {
        for (const entry of m[section] ?? []) {
          if (entry.kind !== "spellcasting") continue;
          const ids = [
            ...(entry.atWill ?? []),
            ...(entry.perDay ?? []).flatMap((t) => t.spellIds),
          ];
          for (const id of ids) {
            expect(
              document.querySelector(`[data-spell="${id}"]`),
              `${m.id} spell ${id}`
            ).toBeTruthy();
          }
        }
      }
      unmount();
    }
  }, 30_000);

  it("a player (no apply) sees the plain statblock, no controls", () => {
    render(
      <EncounterStatblockModal
        srdId="adult-red-dragon"
        combatantName="Dragon"
        combatantId="monster-1"
        onClose={vi.fn()}
      />
    );
    expect(document.querySelector("[data-use]")).toBeNull();
    expect(document.querySelector("[data-spell]")).toBeNull();
  });

  it("the dragon's legendary pips, recharge toggle and Legendary Resistance spend and restore", () => {
    const { spent } = mount("adult-red-dragon");
    // Legendary pool: tap lit pips to spend, a spent pip to restore.
    for (let i = 0; i < 3; i++) {
      const lit = pips("legendary").find((b) => b.dataset.on === "true");
      if (!lit) throw new Error("a lit pip expected");
      fireEvent.click(lit);
    }
    expect(spent()).toEqual({ legendary: 3 });
    fireEvent.click(pips("legendary")[0] as HTMLElement);
    expect(spent()).toEqual({ legendary: 2 });

    // Fire Breath (Recharge 5–6): used, then recharged.
    fireEvent.click(control("actions:fire-breath"));
    expect(spent()?.["actions:fire-breath"]).toBe(1);
    expect(control("actions:fire-breath").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(control("actions:fire-breath"));
    expect(spent()?.["actions:fire-breath"]).toBeUndefined();

    // Legendary Resistance (3/Day): three pips.
    expect(pips("traits:legendary-resistance")).toHaveLength(3);
    fireEvent.click(pips("traits:legendary-resistance")[0] as HTMLElement);
    expect(spent()?.["traits:legendary-resistance"]).toBe(1);
  });

  it("the mage casts a per-day spell with one tap, and its name opens the spell", () => {
    const onCast = vi.fn();
    const { spent } = mount("mage", onCast);
    const key = "actions:spellcasting:fireball";
    expect(pips(key)).toHaveLength(2);
    fireEvent.click(pips(key)[0] as HTMLElement);
    expect(spent()?.[key]).toBe(1);
    expect(onCast).toHaveBeenCalledExactlyOnceWith("fireball");
    // Tapping the spent pip gives the use back without logging another cast.
    const spentPip = pips(key).find((b) => b.dataset.on === "false");
    if (!spentPip) throw new Error("a spent pip expected");
    fireEvent.click(spentPip);
    expect(spent()?.[key]).toBeUndefined();
    expect(onCast).toHaveBeenCalledTimes(1);

    // The spell's name opens its compendium entry over the statblock.
    const fireball = localizeSrd("spell", "fireball", "name", "en");
    expect(screen.queryByRole("dialog", { name: fireball })).toBeNull();
    const link = control(key).closest("[data-spell-row]")?.querySelector("[data-spell]");
    fireEvent.click(link as HTMLElement);
    expect(screen.getByRole("dialog", { name: fireball })).toBeTruthy();
  });
});

/**
 * A spell whose standing state carries an option choice (Enlarge/Reduce, Alter
 * Self) asks again on every new cast: lighting the state by a cast clears the
 * remembered option, whether the previous cast ended or is still lit, and the
 * cast's undo puts the prior choice back. Cases come from the spell catalogue.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { spells } from "@/data/spells";
import type { Grant } from "@/lib/grants";
import type { ResolvedAction } from "@/lib/smart-tracker";
import { MOCK_CHARACTER } from "@/lib/mock";
import { activateActionState } from "@/features/character/center/action-state-commit";
import { useCharacterStore } from "@/stores/characterStore";

interface OptionSpell {
  spellId: string;
  level: number;
  activeKey: string;
  bundleKey: string;
  optionId: string;
}

function choiceBundles(
  grants: ReadonlyArray<Grant>
): Array<{ bundleKey: string; optionId: string }> {
  return grants.flatMap((g) => {
    if (g.type === "choice-grant-bundle") {
      return [{ bundleKey: g.bundleKey, optionId: g.options[0]?.id ?? "" }];
    }
    return "grants" in g && Array.isArray(g.grants)
      ? choiceBundles(g.grants as ReadonlyArray<Grant>)
      : [];
  });
}

const OPTION_SPELLS: OptionSpell[] = spells.flatMap((spell) =>
  (spell.grants ?? []).flatMap((g) =>
    g.type === "while-active"
      ? choiceBundles(g.grants).map((b) => ({
          spellId: spell.id,
          level: spell.level,
          activeKey: g.activeKey,
          ...b,
        }))
      : []
  )
);

function load(s: OptionSpell, lit: boolean): void {
  const base = structuredClone(MOCK_CHARACTER);
  useCharacterStore.setState({
    character: {
      ...base,
      character: {
        ...base.character,
        spells: [...base.character.spells, { srdId: s.spellId, prepared: true }],
      },
      session: {
        ...base.session,
        activeFeatures: lit ? [s.activeKey] : [],
        grantBundleChoices: {
          ...base.session.grantBundleChoices,
          [s.bundleKey]: s.optionId,
        },
      },
    },
    loading: false,
    error: null,
    readonly: false,
  });
}

function cast(s: OptionSpell) {
  return activateActionState(
    { source: "spell", spellId: s.spellId, activatesKey: s.activeKey } as ResolvedAction,
    s.level
  );
}

const choices = () => useCharacterStore.getState().character?.session.grantBundleChoices;

beforeEach(() => {
  useCharacterStore.setState({ character: null, loading: false, error: null });
});

describe("option spells ask again on each cast", () => {
  it("the catalogue holds the option spells", () => {
    const ids = OPTION_SPELLS.map((s) => s.spellId);
    expect(ids).toEqual(expect.arrayContaining(["enlarge-reduce", "alter-self"]));
  });

  describe.each(OPTION_SPELLS)("$spellId ($bundleKey)", (s) => {
    it("a new cast after the last one ended starts with no option chosen", () => {
      load(s, false);
      const { restore } = cast(s);
      expect(choices()?.[s.bundleKey]).toBeUndefined();
      // Other choices (the mock's elf lineage) are untouched.
      expect(choices()?.["elf-lineage"]).toBe("high-elf");
      restore();
      expect(choices()?.[s.bundleKey]).toBe(s.optionId);
    });

    it("recasting while the state is still lit asks again too", () => {
      load(s, true);
      const { restore } = cast(s);
      expect(choices()?.[s.bundleKey]).toBeUndefined();
      restore();
      expect(choices()?.[s.bundleKey]).toBe(s.optionId);
    });
  });

  it("a feature lighting a state never touches the choices", () => {
    const s = OPTION_SPELLS[0];
    if (!s) throw new Error("no option spell");
    load(s, false);
    activateActionState({
      source: "feature",
      activatesKey: s.activeKey,
    } as ResolvedAction);
    expect(choices()?.[s.bundleKey]).toBe(s.optionId);
  });
});

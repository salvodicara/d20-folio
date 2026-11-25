/**
 * Magical Discoveries saved before the mark existed: a College of Lore Bard of
 * level 6+ holding spells from the Cleric, Druid or Wizard list (not the Bard's)
 * as ordinary prepared spells. The sheet flags them; only the player's confirm
 * writes the mark, which keeps them always prepared and frees the Bard's normal
 * prepared places. Cases from the feature (src/data/classes/bard.ts) and the
 * spell catalogue's class lists.
 */
import { afterEach, describe, expect, it } from "vitest";

import i18n from "i18next";

import { inferSpellcasting } from "@/lib/character-infer";
import { minimizeCharacter, rehydrateCharacter } from "@/lib/character-minimal";
import {
  applyChoicePicks,
  collectChoiceSlots,
  EMPTY_CHOICE_PICKS,
} from "@/lib/feature-choices";
import { markDiscoveries, unmarkedDiscoveries } from "@/lib/magical-discoveries";
import { reconcileBuildChoices } from "@/lib/reconcile-build";
import { resolveGrantSourcesForFeatures } from "@/lib/resolve-grant-sources";
import { discoverySentence } from "@/lib/views/species-choices-view";
import { unresolvedBuildChoices } from "@/lib/unresolved-build-choices";
import { preparedLevelledCount } from "@/lib/wizard-spellbook";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterData, SrdSpellRef } from "@/types/character";
import { DISCOVERIES, loreBardDoc } from "./_lore-bard";

const MARK = { prepared: true, alwaysPrepared: true, grantedBy: DISCOVERIES };

const ref = (character: CharacterData, id: string) =>
  character.spells.find((s): s is SrdSpellRef => !("custom" in s) && s.srdId === id);
const marked = (character: CharacterData) =>
  character.spells.flatMap((s) =>
    !("custom" in s) && s.grantedBy === DISCOVERIES ? [s.srdId] : []
  );

describe("unmarkedDiscoveries", () => {
  it("flags a Lore Bard 9 holding two off-list spells as plain prepared spells", () => {
    expect(unmarkedDiscoveries(loreBardDoc().character)).toEqual({
      candidates: ["fireball", "spirit-guardians"],
      missing: 2,
    });
  });

  it("is an owed choice of the build", () => {
    const { character, session } = loreBardDoc();
    expect(unresolvedBuildChoices(character, session)).toEqual([
      {
        kind: "discovery-mark",
        candidates: ["fireball", "spirit-guardians"],
        missing: 2,
      },
    ]);
  });

  it("never flags a Bard whose two discoveries are marked", () => {
    const doc = loreBardDoc([
      { srdId: "healing-word", prepared: true },
      { srdId: "fireball", ...MARK },
      { srdId: "spirit-guardians", ...MARK },
      // an off-list spell beyond the two (added by hand) is never asked about
      { srdId: "shield", prepared: true },
    ]);
    expect(unmarkedDiscoveries(doc.character)).toBeNull();
  });

  it("asks only for the one still missing when one is marked", () => {
    const doc = loreBardDoc([
      { srdId: "fireball", ...MARK },
      { srdId: "spirit-guardians", prepared: true },
    ]);
    expect(unmarkedDiscoveries(doc.character)).toEqual({
      candidates: ["spirit-guardians"],
      missing: 1,
    });
  });

  it("does not flag another college, a Lore Bard 5, or a Bard with no off-list spell", () => {
    expect(
      unmarkedDiscoveries(
        loreBardDoc(undefined, { subclassId: "college-of-elsewhere" }).character
      )
    ).toBeNull();
    expect(
      unmarkedDiscoveries(loreBardDoc(undefined, { level: 5 }).character)
    ).toBeNull();
    expect(
      unmarkedDiscoveries(
        loreBardDoc([
          { srdId: "healing-word", prepared: true },
          { srdId: "cure-wounds", prepared: true },
        ]).character
      )
    ).toBeNull();
  });

  it("never offers a Bard-list spell, an always-prepared one, or another source's pick", () => {
    const doc = loreBardDoc([
      // on the Cleric list AND the Bard's: an ordinary Bard spell
      { srdId: "cure-wounds", prepared: true },
      { srdId: "bless", prepared: true, alwaysPrepared: true },
      { srdId: "shield", prepared: true, grantedBy: "magic-initiate" },
      { srdId: "fireball", prepared: true },
    ]);
    expect(unmarkedDiscoveries(doc.character)?.candidates).toEqual(["fireball"]);
  });

  it("counts an off-list always-prepared spell saved before the source was recorded as a pick made", () => {
    // A Bard 10 whose level-6 picks were stored always prepared (no source yet),
    // with a Magical Secrets spell from the Wizard list prepared as usual.
    const doc = loreBardDoc(
      [
        { srdId: "fireball", prepared: true, alwaysPrepared: true },
        { srdId: "spirit-guardians", prepared: true, alwaysPrepared: true },
        { srdId: "shield", prepared: true },
      ],
      { level: 10 }
    );
    expect(unmarkedDiscoveries(doc.character)).toBeNull();
  });

  it("leaves a multiclass's other class spells alone", () => {
    const base = loreBardDoc();
    const character = {
      ...base.character,
      classes: [...base.character.classes, { classId: "cleric", level: 1 }],
    };
    expect(unmarkedDiscoveries(character)?.candidates).toEqual(["fireball"]);
  });
});

describe("markDiscoveries", () => {
  it("marks the chosen refs only, with the feature's own flags, and frees their places", () => {
    const { character } = loreBardDoc();
    expect(preparedLevelledCount(character)).toBe(3);
    const next = markDiscoveries(character, ["fireball"]);
    expect(ref(next, "fireball")).toEqual({ srdId: "fireball", ...MARK });
    expect(ref(next, "spirit-guardians")).toEqual({
      srdId: "spirit-guardians",
      prepared: true,
    });
    expect(preparedLevelledCount(next)).toBe(2);
  });

  it("writes what the feature's own pick writes", () => {
    // The level-up's path (level-up-plan): the gained feature's slots, then the picks.
    const bard = { ...loreBardDoc().character, spells: [] };
    const slots = collectChoiceSlots(
      resolveGrantSourcesForFeatures([{ srdId: DISCOVERIES }])
    );
    const slot = slots.spell.find((s) => s.sourceId === DISCOVERIES);
    if (!slot) throw new Error("no Magical Discoveries slot");
    const picked = applyChoicePicks(bard, slots, {
      ...EMPTY_CHOICE_PICKS,
      spell: { [slot.slotId]: ["fireball"] },
    });
    const viaPick = ref(picked, "fireball");
    const viaMark = ref(
      markDiscoveries(loreBardDoc().character, ["fireball"]),
      "fireball"
    );
    expect(viaMark).toEqual(viaPick);
  });

  it("never marks a spell that is not a candidate, nor more than are missing", () => {
    const doc = loreBardDoc([
      { srdId: "healing-word", prepared: true },
      { srdId: "fireball", prepared: true },
      { srdId: "spirit-guardians", prepared: true },
      { srdId: "shield", prepared: true },
    ]);
    const next = markDiscoveries(doc.character, [
      "healing-word",
      "fireball",
      "spirit-guardians",
      "shield",
    ]);
    expect(marked(next)).toEqual(["fireball", "spirit-guardians"]);
    expect(unmarkedDiscoveries(next)).toBeNull();
  });

  it("keeps the mark through the stored (minimal) form", () => {
    const next = markDiscoveries(loreBardDoc().character, [
      "fireball",
      "spirit-guardians",
    ]);
    const back = rehydrateCharacter(minimizeCharacter(next));
    expect(unmarkedDiscoveries(back)).toBeNull();
    expect(ref(back, "fireball")).toEqual({ srdId: "fireball", ...MARK });
    expect(ref(back, "spirit-guardians")).toEqual({
      srdId: "spirit-guardians",
      ...MARK,
    });
  });
});

describe("a marked Bard's build edits", () => {
  // A full Bard list prepared, so a level down has prepared spells to take away.
  const BARD_SPELLS = [
    "bane",
    "charm-person",
    "command",
    "comprehend-languages",
    "cure-wounds",
    "disguise-self",
    "dissonant-whispers",
    "faerie-fire",
    "feather-fall",
    "healing-word",
    "heroism",
    "sleep",
  ].map((srdId) => ({ srdId, prepared: true }));

  it.each([10, 6])(
    "keep both discoveries, prepared and marked, through a reconcile to level %i",
    (level) => {
      const marked = markDiscoveries(
        loreBardDoc([
          ...BARD_SPELLS,
          // last on the list, where a level down starts unpreparing
          { srdId: "fireball", prepared: true },
          { srdId: "spirit-guardians", prepared: true },
        ]).character,
        ["fireball", "spirit-guardians"]
      );
      const prev = {
        ...marked,
        spellcasting: inferSpellcasting({
          classId: "bard",
          subclassId: "college-of-lore",
          level: 9,
        }),
      };
      const next = reconcileBuildChoices(prev, {
        ...prev,
        classes: [{ classId: "bard", subclassId: "college-of-lore", level }],
      });
      expect(ref(next, "fireball")).toEqual({ srdId: "fireball", ...MARK });
      expect(ref(next, "spirit-guardians")).toEqual({
        srdId: "spirit-guardians",
        ...MARK,
      });
      // the level down did take normal prepared places away: the case is real
      if (level < 9) expect(preparedLevelledCount(next)).toBeLessThan(BARD_SPELLS.length);
    }
  );
});

describe("discoverySentence", () => {
  it("says it in Italian too", () => {
    const t = i18n.getFixedT("it");
    expect(
      discoverySentence(
        loreBardDoc().character,
        ["fireball", "spirit-guardians"],
        t,
        "it"
      )
    ).toBe(
      "Palla di Fuoco e Guardiani Spirituali sono le tue Scoperte Magiche. Confermando restano sempre preparati e recuperi 2 dei tuoi posti normali per gli incantesimi preparati."
    );
  });
});

describe("characterStore.confirmDiscoveries", () => {
  afterEach(() => useCharacterStore.getState().setCharacter(null));

  it("writes the mark in one undoable change", () => {
    useCharacterStore.getState().setCharacter(loreBardDoc());
    const undo = useCharacterStore
      .getState()
      .confirmDiscoveries(["fireball", "spirit-guardians"]);
    const after = useCharacterStore.getState().character?.character;
    if (!after || !undo) throw new Error("not written");
    expect(preparedLevelledCount(after)).toBe(1);
    expect(unmarkedDiscoveries(after)).toBeNull();
    expect(undo()).toBe(true);
    const back = useCharacterStore.getState().character?.character;
    if (!back) throw new Error("no character");
    expect(preparedLevelledCount(back)).toBe(3);
    expect(unmarkedDiscoveries(back)?.missing).toBe(2);
  });

  it("writes nothing, and offers no undo, when nothing is owed", () => {
    useCharacterStore.getState().setCharacter(loreBardDoc(undefined, { level: 5 }));
    expect(useCharacterStore.getState().confirmDiscoveries(["fireball"])).toBeNull();
  });
});

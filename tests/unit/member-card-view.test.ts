/**
 * The campaign Gruppo card's view model (design session, 2026-10-18): each member's
 * name, portrait, species/classes/level, role, HP, AC and passives. Identity, AC and
 * max HP come from the party card a member's own app keeps in the campaign; the party
 * card now carries the three passives too (Perception, Investigation, Insight, the
 * sheet's own derivation). Current and temporary HP come from the live play state
 * when the caller has it; without it HP is unknown (null), never guessed.
 */
import { describe, expect, it } from "vitest";

import { buildMemberSnapshot } from "@/features/campaigns/member-snapshot";
import { memberCardView } from "@/features/campaigns/member-card-view";
import { deriveCharacter } from "@/lib/views/derive-character";
import { makeCharacterDoc } from "./_helpers";

const hero = makeCharacterDoc({ classId: "fighter", level: 3, name: "Mara" as never });

describe("the party card carries the passives", () => {
  it("as the sheet derives them", () => {
    const { passives } = deriveCharacter(hero);
    expect(buildMemberSnapshot(hero).passives).toEqual({
      perception: passives.perception,
      investigation: passives.investigation,
      insight: passives.insight,
    });
  });
});

describe("memberCardView", () => {
  const member = {
    displayName: "Ana",
    characterId: "c1",
    role: "player" as const,
    character: buildMemberSnapshot(hero),
  };

  it("identity, AC and passives from the card; HP from the live state", () => {
    const view = memberCardView(member, { currentHp: 18, tempHp: 3 });
    expect(view).toMatchObject({
      name: "Mara",
      role: "player",
      classes: [{ classId: "fighter", level: 3 }],
      level: 3,
      ac: member.character.ac,
      hp: { current: 18, max: member.character.hpMax, temp: 3 },
      passives: member.character.passives,
    });
  });

  it("without the live state, HP is unknown, not guessed", () => {
    expect(memberCardView(member).hp).toBeNull();
  });

  it("a card written before the passives existed reads none", () => {
    const { passives: _old, ...card } = member.character;
    void _old;
    expect(memberCardView({ ...member, character: card }).passives).toBeNull();
  });

  it("a member with no character shows their account name and photo", () => {
    const view = memberCardView({
      displayName: "Dana (DM)",
      photoURL: "https://example.test/dana.png",
      characterId: null,
      role: "dm",
      character: null,
    });
    expect(view).toMatchObject({
      name: "Dana (DM)",
      portraitUrl: "https://example.test/dana.png",
      role: "dm",
      classes: [],
      level: null,
      ac: null,
      hp: null,
      passives: null,
    });
  });
});

/**
 * Gift of the Protectors gets its counter. Cases come from the invocation's
 * catalogue text (src/i18n/en/srd/invocations.json): "When any creature whose
 * name is on the page is reduced to 0 Hit Points but not killed outright, the
 * creature magically drops to 1 Hit Point instead. Once this magic is triggered,
 * no creature can benefit from it until you finish a Long Rest."
 *
 *  - one use, back on a Long Rest (`invocation:gift-of-the-protectors`);
 *  - the warlock's own 0-HP prompt offers it while unspent (their name may be on
 *    the page; the player decides), and not once it has triggered.
 */
import { describe, expect, it } from "vitest";
import enInvocations from "@/i18n/en/srd/invocations.json";
import { MOCK_CHARACTER } from "@/lib/mock";
import { resolveAtZeroHpInterrupts, resolveTrackers } from "@/lib/smart-tracker";
import { grantSourceLabel } from "@/lib/views/tracker-view";
import type { CharacterDoc, SessionState } from "@/types/character";

const GIFT = "invocation:gift-of-the-protectors";

function warlock(
  invocations: string[],
  session: Partial<SessionState> = {}
): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    character: {
      ...MOCK_CHARACTER.character,
      race: MOCK_CHARACTER.character.race,
      classes: [{ classId: "warlock", level: 9, invocationChoices: invocations }],
      features: [],
    },
    session: { ...MOCK_CHARACTER.session, trackers: {}, ...session },
  };
}

const withGift = () => warlock(["pact-of-the-tome", "gift-of-the-protectors"]);

describe("Gift of the Protectors — the catalogue text", () => {
  it("is the rule this batch encodes", () => {
    const text = (enInvocations as Record<string, { description?: string }>)[
      "gift-of-the-protectors"
    ]?.description;
    expect(text).toContain("drops to 1 Hit Point instead");
    expect(text).toContain(
      "no creature can benefit from it until you finish a Long Rest"
    );
  });
});

describe("Gift of the Protectors — the once-per-Long-Rest counter", () => {
  it("a warlock who knows it has one use, back on a Long Rest", () => {
    const tracker = resolveTrackers(withGift()).find((t) => t.id === GIFT);
    expect(tracker).toMatchObject({ total: 1, used: 0, recovery: "long-rest" });
    expect(tracker?.label).toEqual({
      srd: { kind: "invocation", key: "gift-of-the-protectors", field: "name" },
    });
  });

  it("a warlock without it has no such counter", () => {
    expect(
      resolveTrackers(warlock(["pact-of-the-tome"])).some((t) => t.id === GIFT)
    ).toBe(false);
  });
});

describe("Gift of the Protectors — drops to 1 Hit Point instead", () => {
  it("the 0-HP prompt offers it while the use is unspent", () => {
    expect(resolveAtZeroHpInterrupts(withGift())).toContainEqual({
      sourceId: "gift-of-the-protectors",
      trackerId: GIFT,
    });
  });

  it("the prompt names the invocation, in both languages", () => {
    expect(grantSourceLabel("gift-of-the-protectors", "en")).toBe(
      "Gift of the Protectors"
    );
    expect(grantSourceLabel("gift-of-the-protectors", "it")).toBe("Dono del Protettore");
  });

  it("once triggered, it is not offered again until the Long Rest", () => {
    const spent = warlock(["pact-of-the-tome", "gift-of-the-protectors"], {
      trackers: { [GIFT]: { used: 1 } },
    });
    expect(resolveAtZeroHpInterrupts(spent)).toEqual([]);
  });
});

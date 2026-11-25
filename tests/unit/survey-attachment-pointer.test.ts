import { describe, it, expect } from "vitest";

import { surveyAttachmentPointers } from "../../scripts/survey-attachment-pointer";

describe("surveyAttachmentPointers (#1217, counts only)", () => {
  it("counts each campaign member's character by what its own document says", () => {
    const campaigns = [
      {
        id: "c1",
        data: {
          memberDetails: {
            dm: { role: "dm", characterId: null },
            a: { role: "player", characterId: "ha" },
            b: { role: "player", characterId: "hb" },
            c: { role: "player", characterId: "hc" },
            d: { role: "player", characterId: "hd" },
            e: { role: "player", characterId: null },
          },
        },
      },
    ];
    const pointers: Record<string, unknown> = {
      "a/ha": "c1",
      "b/hb": undefined,
      "c/hc": "c9",
      // d/hd: the document is missing
    };
    const survey = surveyAttachmentPointers(campaigns, (uid, id) =>
      `${uid}/${id}` in pointers ? { attachedCampaignId: pointers[`${uid}/${id}`] } : null
    );
    expect(survey).toEqual({
      campaigns: 1,
      memberCharacters: 4,
      pointerMatches: 1,
      pointerMissing: 1,
      pointerElsewhere: 1,
      documentMissing: 1,
    });
    expect(JSON.stringify(survey)).not.toMatch(/"(c1|c9|ha|hb|hc|hd)"/);
  });
});

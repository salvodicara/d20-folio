/**
 * The d20s a feature recorded in advance (a Diviner's Portent: two d20s rolled at a
 * Long Rest, each to replace a d20 Test of yours) offered as the face of a save the
 * sheet takes in. Only a d20-range recorded roll counts, and each offer names its
 * slot so the save spends exactly that one.
 */
import { describe, expect, it } from "vitest";
import { recordedD20Faces } from "@/lib/play/tracker-rolls";
import { makeCharacterDoc } from "./_helpers";
import { customInstanceId } from "./__helpers__/custom-items";
import { resolveTrackers } from "@/lib/smart-tracker";

const portent = {
  custom: true as const,
  title: "Foretelling",
  emoji: "",
  source: "Homebrew",
  tags: [],
  contentBlocks: [],
  trackers: [
    {
      id: "foretelling",
      label: "Foretelling",
      total: "2",
      recovery: "long-rest",
      recordedRolls: { min: 1, max: 20 },
    },
  ],
  instanceId: customInstanceId("Foretelling"),
};

describe("recorded d20 faces a save can use", () => {
  it("lists each recorded d20 with its slot", () => {
    const base = makeCharacterDoc({ features: [portent as never] });
    const id = resolveTrackers(base).find((t) => t.recordedRolls)?.id ?? "";
    const doc = {
      ...base,
      session: { ...base.session, trackers: { [id]: { used: 0, rolls: [17, 3] } } },
    };
    const faces = recordedD20Faces(doc);
    expect(faces.map((f) => [f.face, f.index])).toEqual([
      [17, 0],
      [3, 1],
    ]);
  });

  it("lists nothing without recorded rolls", () => {
    expect(recordedD20Faces(makeCharacterDoc({}))).toEqual([]);
  });
});

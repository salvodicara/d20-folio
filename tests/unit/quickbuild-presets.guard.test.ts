/**
 * Guard: every quickbuild preset is a LEGAL, COMPLETE level-1 build.
 *
 * Creation opens on one of these, so a preset that names a skill outside its
 * class pool, mis-spends the point budget, or leaves a grant-driven slot
 * half-filled would hand the player a broken sheet — silently, because the
 * wizard would simply refuse to create and they would have no idea which of
 * twenty prefilled controls was wrong.
 *
 * The table is `QUICKBUILD_PRESETS` itself (public + pack, whichever mode
 * composes) and the battery is the shared `expectLegalPreset`, which derives
 * every legal option set from the composed data (golden rule 13) — the same one
 * the ROLLED presets are held to.
 *
 * BLIND SPOTS — what this guard cannot see:
 *   - Whether the wizard's Create gate accepts the applied build end to end.
 *     That is `quickbuild-path.test.tsx`, which drives the real UI per preset.
 *   - TASTE: whether a preset's species/background/spell choices are GOOD
 *     picks. It only pins that they are legal and complete.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUICKBUILD_CLASS,
  DEFAULT_QUICKBUILD_PRESET,
  QUICKBUILD_PRESETS,
} from "@/data/quickbuild";
import { classTables } from "@/data/classes";
import { expectLegalPreset } from "./__helpers__/quickbuild-legality";

const presets = Object.entries(QUICKBUILD_PRESETS);

describe("quickbuild presets", () => {
  it("the page's default build IS the composed preset for the default class", () => {
    // `DEFAULT_QUICKBUILD_PRESET` is what the creation page opens with; if it
    // ever stopped being the composed entry (a pack override, a renamed class),
    // the page would open on a build nothing else agrees with.
    expect(QUICKBUILD_PRESETS[DEFAULT_QUICKBUILD_CLASS]).toBe(DEFAULT_QUICKBUILD_PRESET);
    expect(classTables.some((c) => c.id === DEFAULT_QUICKBUILD_CLASS)).toBe(true);
  });

  it("covers every composed class exactly once", () => {
    expect(classTables.length).toBeGreaterThan(0);
    expect(presets.length).toBe(classTables.length);
    for (const table of classTables) {
      expect(QUICKBUILD_PRESETS[table.id], table.id).toBeDefined();
    }
  });

  it.each(presets)("%s is a legal, complete level-1 build", (classId, preset) => {
    expectLegalPreset(classId, preset);
  });
});

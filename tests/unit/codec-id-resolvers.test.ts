/**
 * STAGE 0 — the id primitives the v2 portable-schema codec is built on.
 *
 * The codec stores `race` / `background` / `alignment` as STABLE IDS (never
 * localized display strings) and restores the EN label on read. These resolvers
 * are the bijection that makes that lossless: `id(label)` then `label(id)` must
 * recover the canonical EN display, for every standard option.
 */
import { describe, it, expect } from "vitest";
import {
  raceIdByName,
  asRaceId,
  backgroundIdByName,
  backgroundNameById,
  RACE_NAMES,
  BACKGROUND_NAMES,
} from "@/data/srd-names";
import { ALIGNMENTS, alignmentIdByLabel, asAlignmentId } from "@/lib/lore-utils";

describe("race id resolvers", () => {
  it("resolves an EN name, an IT name, and an id to the canonical id", () => {
    expect(raceIdByName("Elf")).toBe("elf");
    expect(raceIdByName("Elfo")).toBe("elf"); // IT
    expect(raceIdByName("elf")).toBe("elf"); // id passthrough
    // (Multi-word pack-race names — e.g. Lorwyn Changeling — are pinned in
    // content-pack/tests/unit/codec-id-resolvers.pack.test.ts.)
  });

  it("resolves every standard race EN name + id to the canonical id", () => {
    for (const r of RACE_NAMES) {
      expect(raceIdByName(r.name.en)).toBe(r.id);
      expect(raceIdByName(r.id)).toBe(r.id); // id passthrough is idempotent
    }
  });

  it("falls back to the lower-cased input for an unknown race (homebrew)", () => {
    expect(raceIdByName("Mongrelfolk")).toBe("mongrelfolk");
    expect(raceIdByName("")).toBe("");
  });

  it("brands a resolved id as a RaceId without altering its value", () => {
    expect(asRaceId(raceIdByName("Elf"))).toBe("elf");
    expect(asRaceId("lorwyn-changeling")).toBe("lorwyn-changeling");
  });
});

describe("background id resolvers", () => {
  it("resolves an EN name, an IT name, and an id to the canonical id", () => {
    expect(backgroundIdByName("Criminal")).toBe("criminal");
    expect(backgroundIdByName("Criminale")).toBe("criminal"); // IT
    expect(backgroundIdByName("criminal")).toBe("criminal");
  });

  it("round-trips every standard background id ⇄ EN label", () => {
    for (const b of BACKGROUND_NAMES) {
      expect(backgroundNameById(b.id)).toBe(b.name.en);
      expect(backgroundIdByName(b.name.en)).toBe(b.id);
      expect(backgroundIdByName(backgroundNameById(b.id))).toBe(b.id);
    }
  });

  it("falls back to the lower-cased input for an unknown background", () => {
    expect(backgroundIdByName("Stowaway")).toBe("stowaway");
    expect(backgroundNameById("stowaway")).toBe("");
  });
});

describe("alignment id resolvers", () => {
  it("slugifies the EN label to its stable id", () => {
    expect(alignmentIdByLabel("True Neutral")).toBe("true-neutral");
    expect(alignmentIdByLabel("Chaotic Good")).toBe("chaotic-good");
  });

  it("resolves every standard alignment EN label + id to the canonical id", () => {
    for (const label of ALIGNMENTS) {
      const id = alignmentIdByLabel(label);
      expect(id).toBeTruthy();
      expect(alignmentIdByLabel(id)).toBe(id); // id passthrough is idempotent
    }
  });

  it("tolerates an already-slugged id and rejects junk", () => {
    expect(alignmentIdByLabel("true-neutral")).toBe("true-neutral"); // idempotent
    expect(alignmentIdByLabel("")).toBe("");
    expect(alignmentIdByLabel("Definitely Not An Alignment")).toBe("");
  });

  it("brands a resolved id as an AlignmentId without altering its value", () => {
    expect(asAlignmentId(alignmentIdByLabel("Chaotic Good"))).toBe("chaotic-good");
    expect(asAlignmentId("true-neutral")).toBe("true-neutral");
  });
});

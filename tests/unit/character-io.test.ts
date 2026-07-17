/**
 * character-io — the user-facing facade over the v2 portable-schema codec.
 *
 * Covers: the v2 export envelope (`{ schema, build, state }`), SRD-ref + custom-item
 * pass-through across a round-trip, import error handling, the embedded portrait,
 * the `downloadCharacterJSON` DOM path, and `importCharacterFromFile`. The codec's
 * own contract (byte-identity, tolerance, state restoration) is pinned by
 * `character-codec.test.ts`; this file pins the I/O shell + the wiring.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { asRaceId } from "@/data/srd-names";
import { asAlignmentId } from "@/lib/lore-utils";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import { primaryClassId, primaryClassName } from "@/lib/classes";
import {
  serializeCharacter,
  parseCharacter,
  importCharacter,
  importCharacterFromFile,
  downloadCharacterJSON,
  buildCharacterExport,
  isRecovery,
} from "@/lib/character-io";
import type {
  CharacterDoc,
  CustomWeapon,
  CustomEquipment,
  CustomFeature,
} from "@/types/character";

/**
 * The export's ONE portrait reader (`portraitToDataUrl` in `@/lib/storage`,
 * lazy-imported by `buildCharacterExport`), mocked so this file stays CI-pure
 * (no Firebase env). Each portrait test sets its resolution; everything else
 * never triggers it (portrait-less docs skip the lazy import entirely).
 */
const portraitToDataUrl = vi.hoisted(() =>
  vi.fn<(url: string) => Promise<string | null>>()
);
vi.mock("@/lib/storage", () => ({ portraitToDataUrl }));

// ─── Test Fixture ─────────────────────────────────────────────────────────────

function mockCharacter(overrides?: Partial<CharacterDoc>): CharacterDoc {
  return {
    id: "test-char-1",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    portraitUrl: null,
    portraitCrop: null,
    shareId: null,
    status: "active",
    character: {
      name: assertNonEmptyString("Test Hero"),
      quote: "",
      race: asRaceId("human"),
      classes: [{ classId: "fighter", level: 5 }],
      background: "Soldier",
      alignment: asAlignmentId("neutral-good"),
      playerName: "Tester",
      speed: "30",
      ac: 16,
      armorNote: "Chain Mail",
      hp: { max: 44 },
      hitDieType: 10,
      languageIds: ["common", "elvish"],
      customLanguages: [],
      toolProficiencyIds: [],
      customToolProficiencies: [],
      abilityBudget: 27,
      proficiencyBonusOverride: null,
      levelUpChecklist: null,
      backgroundAsi: { STR: 2, CON: 1 },
      humanOriginFeat: "",
      bgFeat: "",
      lore: {
        traits: "Brave",
        ideals: "",
        bonds: "",
        flaws: "",
        backstory: "",
        age: "",
        height: "",
        weight: "",
        eyes: "",
        hair: "",
        skin: "",
      },
      abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
      savingThrows: ["STR", "CON"],
      skills: { athletics: "proficient", perception: "proficient" },
      spellcasting: null,
      spellSlots: [],
      spells: [{ srdId: "fireball", prepared: true, notes: "scroll" }],
      weapons: [{ srdId: "longsword", quantity: 1, notes: "family blade" }],
      equipment: [{ srdId: "potion-of-healing", quantity: 3, tracked: true }],
      features: [],
      combatAlgorithm: [],
      customConditions: [],
      sidebar: [],
    },
    session: {
      hp: { current: 44, temp: 0 },
      hitDice: { used: 0 },
      trackers: {},
      spellSlots: {},
      currency: { pp: 0, gp: 50, ep: 0, sp: 10, cp: 5 },
      concentration: "",
      initiative: "",
      conditions: [],
      deathSucc: 0,
      deathFail: 0,
      inspiration: false,
      exhaustion: 0,
      pinnedActions: [],
      unpinnedActions: [],
      notes: "",
      logEntries: [],
    },
    ...overrides,
  };
}

function reimport(doc: CharacterDoc, portrait?: string | null) {
  const res = parseCharacter(serializeCharacter(doc, portrait));
  if (!res.success) throw new Error(`parse failed: ${res.error}`);
  return res;
}

/** The data URL the mocked Storage reader yields — shared by every portrait test. */
const STUB_PORTRAIT = "data:image/png;base64,ZmFrZQ==";

// ─── Export envelope ──────────────────────────────────────────────────────────

describe("character-io — export envelope", () => {
  it("emits a v3 { schema, build, state } envelope, id-based and minimal", () => {
    const json = serializeCharacter(mockCharacter());
    const env = JSON.parse(json) as {
      schema: number;
      build: Record<string, unknown>;
      state: Record<string, unknown>;
      character?: unknown;
      session?: unknown;
    };
    expect(env.schema).toBe(3);
    // R4 — the multiclass `classes[]` (id-first); no stored `class` display string.
    expect(env.build.classes).toEqual([{ classId: "fighter", level: 5 }]);
    expect(env.build).not.toHaveProperty("class");
    expect(env.build.race).toBe("human");
    expect(env.build.background).toBe("soldier");
    expect(env.build.alignment).toBe("neutral-good");
    // No legacy keys, no derived snapshots in build.
    expect(env.character).toBeUndefined();
    expect(env.session).toBeUndefined();
    expect(env.build).not.toHaveProperty("ac");
    expect(env.build).not.toHaveProperty("armorNote");
    expect(env.build).not.toHaveProperty("savingThrows"); // derived → dropped
  });

  it("puts the 2024 background ASI under build.asi.background", () => {
    const env = JSON.parse(serializeCharacter(mockCharacter())) as {
      build: { asi?: { background?: Record<string, number> } };
    };
    expect(env.build.asi?.background).toEqual({ STR: 2, CON: 1 });
  });

  it("keeps only non-empty lore fields", () => {
    const env = JSON.parse(serializeCharacter(mockCharacter())) as {
      build: { lore?: Record<string, string> };
    };
    expect(env.build.lore).toEqual({ traits: "Brave" });
  });
});

// ─── SRD-ref pass-through ─────────────────────────────────────────────────────

describe("character-io — SRD-ref pass-through", () => {
  it("preserves SrdSpellRef / SrdWeaponRef / SrdEquipmentRef optional fields", () => {
    const back = reimport(mockCharacter()).doc.character;
    const spell = back.spells.find((s) => "srdId" in s && s.srdId === "fireball");
    expect(spell).toMatchObject({ srdId: "fireball", prepared: true, notes: "scroll" });
    const weapon = back.weapons.find((w) => "srdId" in w && w.srdId === "longsword");
    expect(weapon).toMatchObject({
      srdId: "longsword",
      quantity: 1,
      notes: "family blade",
    });
    const potion = back.equipment.find(
      (e) => "srdId" in e && e.srdId === "potion-of-healing"
    );
    expect(potion).toMatchObject({
      srdId: "potion-of-healing",
      quantity: 3,
      tracked: true,
    });
  });

  it("preserves equipment AC fields across the round-trip (IM-2)", () => {
    const doc = mockCharacter();
    doc.character.equipment = [
      { srdId: "plate-armor", equipped: true, acBonus: 1, attuned: true },
    ];
    const back = reimport(doc).doc.character;
    expect(back.equipment[0]).toMatchObject({
      srdId: "plate-armor",
      equipped: true,
      acBonus: 1,
      attuned: true,
    });
  });
});

// ─── Custom-item pass-through ─────────────────────────────────────────────────

describe("character-io — custom-item pass-through", () => {
  it("preserves a custom weapon (e.g. the party's Talon)", () => {
    const doc = mockCharacter();
    const talon: CustomWeapon = {
      custom: true,
      name: "Talon",
      quantity: 1,
      damageDie: "1d8",
      damageType: "slashing",
      attackStat: "STR",
      properties: "Versatile (1d10)",
      description: "A +1 longsword",
      attackBonusOverride: 1,
    };
    doc.character.weapons = [talon];
    const back = reimport(doc).doc.character;
    expect(back.weapons.find((w) => "custom" in w && w.name === "Talon")).toEqual(talon);
  });

  it("preserves a custom equipment item", () => {
    const doc = mockCharacter();
    const item: CustomEquipment = {
      custom: true,
      name: "Bag of Tricks",
      description: "Pull out a beast",
      emoji: "🎒",
      tracked: true,
      quantity: 3,
    };
    doc.character.equipment = [item];
    const back = reimport(doc).doc.character;
    expect(
      back.equipment.find((e) => "custom" in e && e.name === "Bag of Tricks")
    ).toEqual(item);
  });

  it("preserves a custom (homebrew) feature under build.customs.features", () => {
    const doc = mockCharacter();
    const feat: CustomFeature = {
      custom: true,
      title: "Lucky Streak",
      emoji: "🍀",
      source: "Homebrew",
      tags: [],
      contentBlocks: [{ type: "text", text: "Reroll a 1." }],
    };
    doc.character.features = [feat];
    const env = JSON.parse(serializeCharacter(doc)) as {
      build: { customs?: { features?: unknown[] } };
    };
    expect(env.build.customs?.features).toEqual([feat]);
    const back = reimport(doc).doc.character;
    expect(
      back.features.find((f) => "custom" in f && f.title === "Lucky Streak")
    ).toEqual(feat);
  });

  it("preserves custom conditions under build.customs.conditions", () => {
    const doc = mockCharacter();
    doc.character.customConditions = ["Marked", "Blessed"];
    const env = JSON.parse(serializeCharacter(doc)) as {
      build: { customs?: { conditions?: string[] } };
    };
    expect(env.build.customs?.conditions).toEqual(["Marked", "Blessed"]);
    expect(reimport(doc).doc.character.customConditions).toEqual(["Marked", "Blessed"]);
  });
});

// ─── Import ───────────────────────────────────────────────────────────────────

describe("character-io — import", () => {
  it("round-trips identity, keeping race + alignment as ids, de-iding class/background to labels", () => {
    const back = reimport(mockCharacter()).doc.character;
    expect(back.name).toBe("Test Hero");
    // Race is the stable, branded RaceId (golden rule 7): it round-trips as
    // the id, never a display name (display localizes via `localizeRaceName`).
    expect(back.race).toBe("human");
    expect(primaryClassName(back)).toBe("Fighter");
    expect(primaryClassId(back)).toBe("fighter");
    expect(back.background).toBe("Soldier");
    // Alignment is the stable, branded AlignmentId now (golden rule 7): it
    // round-trips as the id, never a display label (display localizes via i18n).
    expect(back.alignment).toBe("neutral-good");
  });

  it("restores the session vitals + currency", () => {
    const res = reimport(mockCharacter());
    expect(res.doc.session.hp.current).toBe(44);
    expect(res.doc.session.currency).toEqual({ pp: 0, gp: 50, ep: 0, sp: 10, cp: 5 });
  });

  it("clears the portrait URL and Firestore-only fields on import", () => {
    const res = reimport(mockCharacter());
    expect(res.doc.portraitUrl).toBeNull();
    expect(res.doc.shareId).toBeNull();
    expect(res.doc.status).toBe("active");
  });

  it("rejects invalid JSON", () => {
    const res = importCharacter("not json {{{");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/JSON/i);
  });

  it("rejects an unrecognized (schema-less) format", () => {
    const res = importCharacter(JSON.stringify({ foo: "bar" }));
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/schema/i);
  });

  it("rejects a build without a name / class / valid level", () => {
    const noName = importCharacter(
      JSON.stringify({ schema: 2, build: { race: "human", class: "monk", level: 3 } })
    );
    expect(noName.success).toBe(false);
    const noClass = importCharacter(
      JSON.stringify({ schema: 2, build: { name: "X", level: 3 } })
    );
    expect(noClass.success).toBe(false);
    const badLevel = importCharacter(
      JSON.stringify({ schema: 2, build: { name: "X", class: "monk", level: 99 } })
    );
    expect(badLevel.success).toBe(false);
  });

  it("rejects a future schema version", () => {
    const res = importCharacter(JSON.stringify({ schema: 99, build: {}, state: {} }));
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/schema 99/);
  });
});

// ─── Portrait round-trip ──────────────────────────────────────────────────────

describe("character-io — portrait round-trip", () => {
  it("embeds the portrait under meta.portrait and recovers it on import", () => {
    const portrait = "data:image/png;base64,ZmFrZQ==";
    const json = serializeCharacter(mockCharacter(), portrait);
    const env = JSON.parse(json) as { meta?: { portrait?: string } };
    expect(env.meta?.portrait).toBe(portrait);
    const res = importCharacter(json);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.portraitBase64).toBe(portrait);
  });

  it("omits meta entirely when no portrait is provided", () => {
    const env = JSON.parse(serializeCharacter(mockCharacter())) as Record<
      string,
      unknown
    >;
    expect("meta" in env).toBe(false);
    const res = importCharacter(serializeCharacter(mockCharacter()));
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.portraitBase64).toBeNull();
  });

  // REGRESSION (owner 2026-06-08): "I set a portrait with a crop, exported,
  // re-imported the json and the portrait wasn't there." This pins the FULL
  // real export→import chain (not just the codec): `buildCharacterExport` reads
  // the Storage portrait via the SDK, base64-encodes it, and embeds the image AND
  // its framing CROP under `meta`; `importCharacter` must recover BOTH so the
  // re-imported character keeps its face and its framing. Survives end-to-end.
  describe("export→import keeps the portrait AND its crop (real I/O path)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    const PORTRAIT = STUB_PORTRAIT;
    const CROP = { x: 12, y: 8, width: 64, height: 64 };

    function stubPortraitRead() {
      portraitToDataUrl.mockReset().mockResolvedValue(PORTRAIT);
    }

    it("embeds meta.portrait + meta.portraitCrop on export and restores both on import", async () => {
      stubPortraitRead();
      const char = mockCharacter({
        portraitUrl: "https://example.com/img.png",
        portraitCrop: CROP,
      });

      const { json } = await buildCharacterExport(char);
      const env = JSON.parse(json) as {
        meta?: { portrait?: string; portraitCrop?: unknown };
      };
      // Export embedded BOTH the image and the crop under meta.
      expect(env.meta?.portrait).toBe(PORTRAIT);
      expect(env.meta?.portraitCrop).toEqual(CROP);

      // Re-import recovers BOTH — the import flow re-uploads `portraitBase64` to
      // Storage and attaches `portraitCrop`, so the face AND framing come back.
      const res = importCharacter(json);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.portraitBase64).toBe(PORTRAIT);
      expect(res.portraitCrop).toEqual(CROP);
      expect(res.doc.portraitCrop).toEqual(CROP);
    });

    it("embeds the image even when no crop was set (uncropped portrait)", async () => {
      stubPortraitRead();
      const char = mockCharacter({
        portraitUrl: "https://example.com/img.png",
        portraitCrop: null,
      });
      const { json } = await buildCharacterExport(char);
      const env = JSON.parse(json) as {
        meta?: { portrait?: string; portraitCrop?: unknown };
      };
      expect(env.meta?.portrait).toBe(PORTRAIT);
      expect(env.meta?.portraitCrop).toBeUndefined();
      const res = importCharacter(json);
      expect(res.success).toBe(true);
      if (!res.success) return;
      expect(res.portraitBase64).toBe(PORTRAIT);
      expect(res.portraitCrop).toBeNull();
    });

    // REGRESSION (owner 2026-06-08, settled 2026-06-10 — the ACTUAL root cause):
    // in prod (and any localhost carrying a service worker) the portrait DISPLAYS
    // but the export JSON has no `meta.portrait`. The display `<img>` is no-cors,
    // so the Workbox runtime cache holds an OPAQUE response (status 0, `ok: false`,
    // unreadable) under that exact URL, and any HTTP `fetch()` of it is served the
    // opaque entry. The export therefore NEVER fetches the display URL over HTTP —
    // it reads the bytes through the Storage SDK. This pins the structural
    // decoupling: even with `fetch` permanently serving the opaque entry (the
    // owner's environment at its worst), the export embeds the portrait and the
    // global fetch is never even called.
    it("embeds the portrait via the Storage SDK — never an HTTP fetch of the display URL", async () => {
      stubPortraitRead();
      const opaqueFetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 0,
          type: "opaque",
          blob: () => Promise.resolve(new Blob()),
        })
      );
      vi.stubGlobal("fetch", opaqueFetch);

      const url =
        "https://firebasestorage.googleapis.com/v0/b/d20-folio.firebasestorage.app/o/p?alt=media&token=t";
      const { json } = await buildCharacterExport(
        mockCharacter({ portraitUrl: url, portraitCrop: CROP })
      );
      const env = JSON.parse(json) as { meta?: { portrait?: string } };

      // The portrait IS in the export despite the poisoned HTTP cache…
      expect(env.meta?.portrait).toBe(PORTRAIT);
      // …because the bytes came from the SDK, keyed off the doc's portraitUrl…
      expect(portraitToDataUrl).toHaveBeenCalledWith(url);
      // …and the display URL was never fetched over HTTP at all.
      expect(opaqueFetch).not.toHaveBeenCalled();
    });

    // A genuinely unreadable portrait (offline / object deleted) drops the image
    // but must NOT throw, and the rest of the export still succeeds — a missing
    // face is recoverable on re-import, a crashed export is not.
    it("omits the portrait (no throw) when the Storage read fails", async () => {
      portraitToDataUrl.mockReset().mockResolvedValue(null);
      const char = mockCharacter({
        portraitUrl: "https://firebasestorage.googleapis.com/o/p?alt=media&token=t",
        portraitCrop: CROP,
      });
      const exported = await buildCharacterExport(char);
      const env = JSON.parse(exported.json) as { schema?: number; meta?: unknown };
      expect(env.meta).toBeUndefined();
      expect(env.schema).toBe(3); // the rest of the export is intact
      expect(exported.portraitDropped).toBe(true); // …and the drop is REPORTED
    });
  });
});

// ─── downloadCharacterJSON (DOM path) ─────────────────────────────────────────

describe("character-io — downloadCharacterJSON", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function stubDomApis(clickSpy = vi.fn()) {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:mock-url"),
      revokeObjectURL: vi.fn(),
    });
    const anchor = { href: "", download: "", click: clickSpy };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLElement);
    return anchor;
  }

  it("triggers a download with the slugified filename when portraitUrl is null", async () => {
    const anchor = stubDomApis();
    await downloadCharacterJSON(mockCharacter({ portraitUrl: null }));
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe("test-hero.d20-folio.json");
  });

  it("reads + embeds the portrait via the Storage SDK when portraitUrl is set", async () => {
    portraitToDataUrl.mockReset().mockResolvedValue(STUB_PORTRAIT);
    const char = mockCharacter({ portraitUrl: "https://example.com/img.png" });
    const anchor = stubDomApis();
    const { portraitDropped } = await downloadCharacterJSON(char);
    expect(portraitToDataUrl).toHaveBeenCalledWith("https://example.com/img.png");
    expect(portraitDropped).toBe(false);
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("still downloads (reporting the drop) when the Storage read fails", async () => {
    portraitToDataUrl.mockReset().mockResolvedValue(null);
    const anchor = stubDomApis();
    const { portraitDropped } = await downloadCharacterJSON(
      mockCharacter({ portraitUrl: "https://example.com/x.png" })
    );
    expect(portraitDropped).toBe(true);
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it("never touches Storage when portraitUrl is null", async () => {
    portraitToDataUrl.mockReset();
    stubDomApis();
    const { portraitDropped } = await downloadCharacterJSON(
      mockCharacter({ portraitUrl: null })
    );
    expect(portraitDropped).toBe(false);
    expect(portraitToDataUrl).not.toHaveBeenCalled();
  });
});

// ─── importCharacterFromFile ──────────────────────────────────────────────────

describe("character-io — importCharacterFromFile", () => {
  it("imports from a valid .json File", async () => {
    const json = serializeCharacter(mockCharacter());
    const file = new File([json], "test-hero.d20-folio.json", {
      type: "application/json",
    });
    const result = await importCharacterFromFile(file);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.doc.character.name).toBe("Test Hero");
  });

  it("rejects files without a .json extension", async () => {
    const file = new File(["{}"], "portrait.png", { type: "image/png" });
    const result = await importCharacterFromFile(file);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain(".json");
  });

  it("rejects files larger than 5 MB", async () => {
    const file = new File(["x".repeat(5 * 1024 * 1024 + 1)], "huge.json", {
      type: "application/json",
    });
    const result = await importCharacterFromFile(file);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("too large");
  });
});

// ─── re-exported validators ───────────────────────────────────────────────────

describe("character-io — re-exported validators", () => {
  it("isRecovery still resolves through the facade", () => {
    expect(isRecovery("long-rest")).toBe(true);
    expect(isRecovery("never")).toBe(false);
    // FRONTIER-S3 — the new per-turn cadence is a valid recovery (Sneak Attack).
    expect(isRecovery("per-turn")).toBe(true);
  });
});

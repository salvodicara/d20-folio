import { describe, expect, it } from "vitest";
import {
  applyMechanicsPlanToCharacter,
  planMechanicsRevert,
  prepareMechanicsCommand,
  type MechanicsCommand,
  type MechanicsPlan,
  type ResourceConversionSelection,
} from "@/lib/mechanics-command";
import type { CharacterDoc } from "@/types/character";
import { makeCharacterDoc } from "./_helpers";

function command(
  doc: CharacterDoc,
  sourceId: string,
  conversionId: string,
  selection: ResourceConversionSelection
): MechanicsCommand {
  return {
    kind: "resource-conversion",
    occurrenceId: "conversion-1",
    characterId: doc.id,
    sourceId,
    conversionId,
    selection,
  };
}

function fontDoc(
  session: Parameters<typeof makeCharacterDoc>[1] = {},
  level = 5
): CharacterDoc {
  return makeCharacterDoc(
    {
      classId: "sorcerer",
      level,
      features: [{ srdId: "sorcerer-font-of-magic" }],
      spellSlots: [
        { level: 1, total: 4 },
        { level: 2, total: 3 },
      ],
    },
    session
  );
}

describe("MechanicsCommand resource conversions", () => {
  it("plans and atomically applies both Font of Magic directions", () => {
    const createDoc = fontDoc({ spellSlots: { "2": { used: 1 } } });
    const create = prepareMechanicsCommand(
      createDoc,
      command(createDoc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
        kind: "create-slot",
        via: "cost-table",
        slotLevel: 2,
      })
    );
    expect(create.status).toBe("planned");
    if (create.status !== "planned") return;
    expect(create.plan.ownerOperations).toEqual([
      {
        address: { kind: "tracker", trackerId: "sorcerer-font-of-magic" },
        expectedTotal: 5,
        expectedUsed: 0,
        nextUsed: 3,
      },
      {
        address: { kind: "spell-slot", level: 2, pactMagic: false },
        expectedTotal: 3,
        expectedUsed: 1,
        nextUsed: 0,
      },
    ]);
    const created = applyMechanicsPlanToCharacter(createDoc, create.plan);
    expect(created.status).toBe("applied");
    if (created.status !== "applied") return;
    expect(created.character.session.trackers["sorcerer-font-of-magic"]?.used).toBe(3);
    expect(created.character.session.spellSlots["2"]).toBeUndefined();

    const pointsDoc = fontDoc({
      trackers: { "sorcerer-font-of-magic": { used: 4 } },
    });
    const points = prepareMechanicsCommand(
      pointsDoc,
      command(pointsDoc, "sorcerer-font-of-magic", "font-converting-spell-slots", {
        kind: "slot-to-points",
        slotLevel: 1,
      })
    );
    expect(points.status).toBe("planned");
    if (points.status !== "planned") return;
    const converted = applyMechanicsPlanToCharacter(pointsDoc, points.plan);
    expect(converted.status).toBe("applied");
    if (converted.status !== "applied") return;
    expect(converted.character.session.spellSlots["1"]?.used).toBe(1);
    expect(converted.character.session.trackers["sorcerer-font-of-magic"]?.used).toBe(3);
  });

  it("supports tracker-unit slot creation and one consolidated Pact owner leg", () => {
    const druid = makeCharacterDoc(
      {
        classId: "druid",
        level: 20,
        features: [{ srdId: "druid-wild-shape" }, { srdId: "druid-archdruid" }],
        spellSlots: [{ level: 2, total: 3 }],
      },
      { spellSlots: { "2": { used: 1 } } }
    );
    const nature = prepareMechanicsCommand(
      druid,
      command(druid, "druid-archdruid", "nature-magician", {
        kind: "create-slot",
        via: "tracker-units",
        units: 1,
      })
    );
    expect(nature.status).toBe("planned");
    if (nature.status === "planned") {
      expect(nature.plan.ownerOperations).toHaveLength(2);
    }

    const warlock = makeCharacterDoc(
      {
        classId: "warlock",
        level: 2,
        features: [{ srdId: "warlock-magical-cunning" }],
        spellSlots: [{ level: 1, total: 2, pactMagic: true }],
      },
      { spellSlots: { "pact-1": { used: 2 } } }
    );
    const pact = prepareMechanicsCommand(
      warlock,
      command(warlock, "warlock-magical-cunning", "magical-cunning", {
        kind: "restore-pact",
        slotLevel: 1,
        amount: 1,
      })
    );
    expect(pact.status).toBe("planned");
    if (pact.status !== "planned") return;
    expect(pact.plan.ownerOperations).toEqual([
      {
        address: { kind: "tracker", trackerId: "warlock-magical-cunning" },
        expectedTotal: 1,
        expectedUsed: 0,
        nextUsed: 1,
      },
      {
        address: { kind: "spell-slot", level: 1, pactMagic: true },
        expectedTotal: 2,
        expectedUsed: 2,
        nextUsed: 1,
      },
    ]);
  });

  it("rejects stale choices, removed sources, wrong characters, and missing owners", () => {
    const gated = fontDoc({ spellSlots: { "2": { used: 1 } } }, 2);
    expect(
      prepareMechanicsCommand(
        gated,
        command(gated, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "choice-unavailable" });

    const doc = fontDoc({ spellSlots: { "2": { used: 1 } } });
    const missingSource = {
      ...doc,
      character: { ...doc.character, features: [] },
    };
    expect(
      prepareMechanicsCommand(
        missingSource,
        command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "source-unavailable" });
    expect(
      prepareMechanicsCommand(doc, {
        ...command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        }),
        characterId: "someone-else",
      })
    ).toMatchObject({ status: "rejected", reason: "character-mismatch" });

    const ambiguous = {
      ...doc,
      character: {
        ...doc.character,
        spellSlots: [...doc.character.spellSlots, { level: 2, total: 3 }],
      },
    };
    expect(
      prepareMechanicsCommand(
        ambiguous,
        command(ambiguous, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "resource-unavailable" });

    const duplicateSource = {
      ...doc,
      character: {
        ...doc.character,
        features: [
          { srdId: "sorcerer-font-of-magic" },
          { srdId: "sorcerer-font-of-magic" },
        ],
      },
    };
    expect(
      prepareMechanicsCommand(
        duplicateSource,
        command(duplicateSource, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "source-unavailable" });
  });

  it("rejects insufficient budgets, missing headroom, and stale Pact amounts", () => {
    const noBudget = fontDoc({
      spellSlots: { "2": { used: 1 } },
      trackers: { "sorcerer-font-of-magic": { used: 4 } },
    });
    expect(
      prepareMechanicsCommand(
        noBudget,
        command(noBudget, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "choice-unavailable" });

    const noHeadroom = fontDoc({
      trackers: { "sorcerer-font-of-magic": { used: 1 } },
    });
    expect(
      prepareMechanicsCommand(
        noHeadroom,
        command(noHeadroom, "sorcerer-font-of-magic", "font-converting-spell-slots", {
          kind: "slot-to-points",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "choice-unavailable" });

    const warlock = makeCharacterDoc(
      {
        classId: "warlock",
        level: 2,
        features: [{ srdId: "warlock-magical-cunning" }],
        spellSlots: [{ level: 1, total: 2, pactMagic: true }],
      },
      { spellSlots: { "pact-1": { used: 2 } } }
    );
    expect(
      prepareMechanicsCommand(
        warlock,
        command(warlock, "warlock-magical-cunning", "magical-cunning", {
          kind: "restore-pact",
          slotLevel: 1,
          amount: 2,
        })
      )
    ).toMatchObject({ status: "rejected", reason: "choice-unavailable" });
  });

  it.each([NaN, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-positive or non-safe selection input %s",
    (value) => {
      const doc = fontDoc({ spellSlots: { "2": { used: 1 } } });
      const unsafe = {
        ...command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        }),
        selection: { kind: "create-slot", via: "cost-table", slotLevel: value },
      } as unknown as MechanicsCommand;
      expect(prepareMechanicsCommand(doc, unsafe)).toMatchObject({
        status: "rejected",
        reason: "invalid-command",
      });
    }
  );

  it.each([
    ["tracker-unit fraction", { kind: "create-slot", via: "tracker-units", units: 1.5 }],
    [
      "slot-to-points unsafe",
      { kind: "slot-to-points", slotLevel: Number.MAX_SAFE_INTEGER + 1 },
    ],
    ["Pact slot NaN", { kind: "restore-pact", slotLevel: NaN, amount: 1 }],
    [
      "Pact amount unsafe",
      { kind: "restore-pact", slotLevel: 1, amount: Number.MAX_SAFE_INTEGER + 1 },
    ],
  ])("rejects invalid %s input", (_label, selection) => {
    const doc = fontDoc({ spellSlots: { "2": { used: 1 } } });
    const invalid = {
      ...command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
        kind: "create-slot",
        via: "cost-table",
        slotLevel: 2,
      }),
      selection,
    } as unknown as MechanicsCommand;
    expect(prepareMechanicsCommand(doc, invalid)).toMatchObject({
      status: "rejected",
      reason: "invalid-command",
    });
  });

  it("keeps normal and Pact pools distinct and rejects out-of-range resource state", () => {
    const doc = fontDoc({
      spellSlots: { "2": { used: 1 }, "pact-2": { used: 1 } },
    });
    doc.character.spellSlots.push({ level: 2, total: 1, pactMagic: true });
    const prepared = prepareMechanicsCommand(
      doc,
      command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
        kind: "create-slot",
        via: "cost-table",
        slotLevel: 2,
      })
    );
    expect(prepared.status).toBe("planned");
    if (prepared.status === "planned") {
      expect(prepared.plan.ownerOperations[1]?.address).toEqual({
        kind: "spell-slot",
        level: 2,
        pactMagic: false,
      });
    }
    const invalid = fontDoc({ spellSlots: { "2": { used: 4 } } });
    expect(
      prepareMechanicsCommand(
        invalid,
        command(invalid, "sorcerer-font-of-magic", "font-creating-spell-slots", {
          kind: "create-slot",
          via: "cost-table",
          slotLevel: 2,
        })
      )
    ).toMatchObject({ status: "rejected" });
  });

  it("round-trips JSON, preserves tracker rolls, and reverses after source removal", () => {
    const doc = fontDoc({
      trackers: {
        "sorcerer-font-of-magic": { used: 4, rolls: [2, null] },
      },
    });
    const prepared = prepareMechanicsCommand(
      doc,
      command(doc, "sorcerer-font-of-magic", "font-converting-spell-slots", {
        kind: "slot-to-points",
        slotLevel: 1,
      })
    );
    expect(prepared.status).toBe("planned");
    if (prepared.status !== "planned") return;
    const roundTripped = JSON.parse(JSON.stringify(prepared.plan)) as MechanicsPlan;
    const applied = applyMechanicsPlanToCharacter(doc, roundTripped);
    expect(applied.status).toBe("applied");
    if (applied.status !== "applied") return;
    expect(applied.character.session.trackers["sorcerer-font-of-magic"]?.rolls).toEqual([
      2,
      null,
    ]);
    const withoutSource = {
      ...applied.character,
      character: { ...applied.character.character, features: [] },
    };
    const reverted = applyMechanicsPlanToCharacter(
      withoutSource,
      planMechanicsRevert(applied.receipt)
    );
    expect(reverted.status).toBe("applied");
    if (reverted.status === "applied") {
      expect(reverted.character.session.spellSlots["1"]).toBeUndefined();
      expect(reverted.character.session.trackers["sorcerer-font-of-magic"]?.used).toBe(4);
    }
  });

  it("rejects stale and crafted forward plans all-or-nothing", () => {
    const doc = fontDoc({ spellSlots: { "2": { used: 1 } } });
    const prepared = prepareMechanicsCommand(
      doc,
      command(doc, "sorcerer-font-of-magic", "font-creating-spell-slots", {
        kind: "create-slot",
        via: "cost-table",
        slotLevel: 2,
      })
    );
    expect(prepared.status).toBe("planned");
    if (prepared.status !== "planned") return;
    const stale = {
      ...doc,
      session: {
        ...doc.session,
        trackers: { "sorcerer-font-of-magic": { used: 1 } },
      },
    };
    expect(applyMechanicsPlanToCharacter(stale, prepared.plan)).toMatchObject({
      status: "rejected",
      reason: "stale-plan",
    });
    const lostClassGate = {
      ...doc,
      character: {
        ...doc.character,
        classes: [{ classId: "sorcerer", level: 2 }],
      },
    };
    expect(applyMechanicsPlanToCharacter(lostClassGate, prepared.plan)).toMatchObject({
      status: "rejected",
      reason: "stale-plan",
    });
    const crafted: MechanicsPlan = {
      ...prepared.plan,
      ownerOperations: prepared.plan.ownerOperations.map((operation, index) =>
        index === 0 ? { ...operation, nextUsed: operation.nextUsed + 1 } : operation
      ),
    };
    expect(applyMechanicsPlanToCharacter(doc, crafted)).toMatchObject({
      status: "rejected",
      reason: "stale-plan",
    });
  });
});

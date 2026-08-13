import { describe, expect, it, vi } from "vitest";

import {
  conformDamageAllocationObservations,
  conformDamageComputation,
  conformDamageDefenseProfile,
  conformDamageDefenseRule,
  conformDamagePacket,
  conformDamageResolution,
  conformDamageTableOverride,
  resolveDamage,
  withDamageTableOverride,
} from "@/lib/damage";
import { DAMAGE_TYPES, type DamageDefenseSelector } from "@/types/damage";

const target = {
  entityId: "target",
  material: { campaignId: "campaign", kind: "shared-combat" },
} as const;

const all = {
  damageTypes: [],
  deliveries: [],
  forbiddenTraits: [],
  requiredTraits: [],
} as const satisfies DamageDefenseSelector;

const packet = {
  delivery: "attack",
  packetId: "packet-1",
  parts: [
    { amount: 5, damageType: "slashing", partId: "blade" },
    { amount: 5, damageType: "fire", partId: "flame" },
  ],
  target,
  traits: ["weapon", "magical"],
} as const;

const noDefenses = { damageThreshold: null, rules: [] } as const;

function resolved(value: ReturnType<typeof resolveDamage>) {
  if (!value || value.kind !== "resolved") throw new Error("expected resolution");
  return value.resolution;
}

describe("damage exact grammar", () => {
  it("exports every 2024 damage type and accepts one canonical concrete packet", () => {
    expect(DAMAGE_TYPES).toEqual([
      "acid",
      "bludgeoning",
      "cold",
      "fire",
      "force",
      "lightning",
      "necrotic",
      "piercing",
      "poison",
      "psychic",
      "radiant",
      "slashing",
      "thunder",
    ]);
    expect(conformDamagePacket(packet)).toEqual(packet);
  });

  it("rejects aliases, extra fields, hostile ids, duplicate ids, and noncanonical sets", () => {
    expect(conformDamagePacket({ ...packet, critical: true })).toBeNull();
    expect(
      conformDamagePacket({
        ...packet,
        packetId: "__proto__",
      })
    ).toBeNull();
    expect(
      conformDamagePacket({
        ...packet,
        parts: [packet.parts[0], { ...packet.parts[1], partId: "blade" }],
      })
    ).toBeNull();
    expect(conformDamagePacket({ ...packet, traits: ["magical", "weapon"] })).toBeNull();
    expect(
      conformDamagePacket({
        ...packet,
        parts: [{ amount: "1d6", damageType: "fire", partId: "flame" }],
      })
    ).toBeNull();
    expect(conformDamagePacket({ ...packet, parts: [] })).toBeNull();
  });

  it("requires exact canonical selectors and unique ordered rules", () => {
    const profile = {
      damageThreshold: 5,
      rules: [
        {
          kind: "resistance",
          selector: { ...all, damageTypes: ["fire"] },
          sourceId: "fire-resistance",
        },
      ],
    } as const;
    expect(conformDamageDefenseProfile(profile)).toEqual(profile);
    expect(conformDamageDefenseRule(profile.rules[0])).toEqual(profile.rules[0]);
    expect(
      conformDamageDefenseProfile({
        ...profile,
        rules: [profile.rules[0], profile.rules[0]],
      })
    ).toBeNull();
    expect(
      conformDamageDefenseRule({
        kind: "resistance",
        selector: { ...all, damageTypes: ["fire", "acid"] },
        sourceId: "unordered-selector",
      })
    ).toBeNull();
    expect(
      conformDamageDefenseRule({
        amount: 0,
        kind: "flat-adjustment",
        selector: all,
        sourceId: "inert",
      })
    ).toBeNull();
    expect(
      conformDamageDefenseProfile({
        ...profile,
        rules: [
          {
            ...profile.rules[0],
            selector: { ...all, damageTypes: ["fire", "acid"] },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformDamageDefenseProfile({
        ...profile,
        rules: [
          {
            ...profile.rules[0],
            selector: {
              ...all,
              forbiddenTraits: ["spell"],
              requiredTraits: ["spell"],
            },
          },
        ],
      })
    ).toBeNull();
    expect(
      conformDamageDefenseProfile({
        damageThreshold: null,
        rules: [
          {
            amount: 0,
            kind: "flat-adjustment",
            selector: all,
            sourceId: "inert",
          },
        ],
      })
    ).toBeNull();
  });

  it("returns fresh deeply frozen canonical values", () => {
    const input = structuredClone(packet);
    const result = conformDamagePacket(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.parts)).toBe(true);
    expect(Object.isFrozen(result?.parts[0])).toBe(true);
  });
});

describe("damage resolution", () => {
  it("resolves mixed damage with selectors and detailed ordered provenance", () => {
    const result = resolved(
      resolveDamage(
        packet,
        {
          damageThreshold: null,
          rules: [
            {
              kind: "resistance",
              selector: { ...all, damageTypes: ["fire"] },
              sourceId: "fire-resistance",
            },
          ],
        },
        []
      )
    );

    expect(result.computed).toMatchObject({
      adjustedTotal: 10,
      netTotal: 7,
      rawTotal: 10,
      resolvedTotal: 7,
      thresholdApplied: false,
    });
    expect(result.packet).toEqual(packet);
    expect(result.packet).not.toBe(packet);
    expect(result.packet.parts).not.toBe(packet.parts);
    expect(Object.isFrozen(result.packet)).toBe(true);
    expect(Object.isFrozen(result.packet.parts)).toBe(true);
    expect(result.computed.parts[0]).toMatchObject({
      adjustedAmount: 5,
      netAmount: 5,
      resolvedAmount: 5,
      ruleApplications: [],
    });
    expect(result.computed.parts[1]?.ruleApplications).toEqual([
      {
        after: 2,
        applied: true,
        before: 5,
        kind: "resistance",
        sourceId: "fire-resistance",
      },
    ]);
  });

  it("applies adjustments, immunity, one resistance, then one vulnerability", () => {
    const onePart = { ...packet, parts: [packet.parts[1]] } as const;
    const result = resolved(
      resolveDamage(
        onePart,
        {
          damageThreshold: null,
          rules: [
            {
              amount: 3,
              kind: "flat-adjustment",
              selector: all,
              sourceId: "bonus",
            },
            { kind: "resistance", selector: all, sourceId: "resistance-a" },
            { kind: "resistance", selector: all, sourceId: "resistance-b" },
            { kind: "vulnerability", selector: all, sourceId: "vulnerability-a" },
            { kind: "vulnerability", selector: all, sourceId: "vulnerability-b" },
          ],
        },
        []
      )
    );
    expect(result.computed.parts[0]).toMatchObject({
      adjustedAmount: 8,
      resolvedAmount: 8,
    });
    expect(
      result.computed.parts[0].ruleApplications.map((rule) => [
        rule.kind,
        "applied" in rule ? rule.applied : rule.allocatedAmount,
        rule.after,
      ])
    ).toEqual([
      ["flat-adjustment", 3, 8],
      ["resistance", true, 4],
      ["resistance", false, 4],
      ["vulnerability", true, 8],
      ["vulnerability", false, 8],
    ]);

    const immune = resolved(
      resolveDamage(
        onePart,
        {
          damageThreshold: null,
          rules: [
            { kind: "immunity", selector: all, sourceId: "immune" },
            { kind: "resistance", selector: all, sourceId: "resist" },
            { kind: "vulnerability", selector: all, sourceId: "vulnerable" },
          ],
        },
        []
      )
    );
    expect(immune.computed.netTotal).toBe(0);
    expect(
      immune.computed.parts[0].ruleApplications.map((rule) =>
        "applied" in rule ? rule.applied : true
      )
    ).toEqual([true, false, false]);
  });

  it("automates an allocation whose final outcome is invariant", () => {
    const result = resolved(
      resolveDamage(
        packet,
        {
          damageThreshold: null,
          rules: [
            {
              amount: -3,
              kind: "flat-adjustment",
              selector: all,
              sourceId: "armor-reduction",
            },
          ],
        },
        []
      )
    );
    expect(result.computed.adjustedTotal).toBe(7);
    expect(result.computed.parts.map((part) => part.adjustedAmount)).toEqual([2, 5]);
  });

  it("requires allocation review exactly when mixed defenses make it consequential", () => {
    const profile = {
      damageThreshold: null,
      rules: [
        {
          amount: -3,
          kind: "flat-adjustment",
          selector: all,
          sourceId: "armor-reduction",
        },
        {
          kind: "resistance",
          selector: { ...all, damageTypes: ["fire"] },
          sourceId: "fire-resistance",
        },
      ],
    } as const;
    const attempt = resolveDamage(packet, profile, []);
    expect(attempt).toEqual({
      kind: "review-required",
      requirement: {
        amount: 3,
        operation: "reduction",
        packetId: "packet-1",
        parts: [
          { maximumAmount: 5, partId: "blade" },
          { maximumAmount: 5, partId: "flame" },
        ],
        sourceId: "armor-reduction",
      },
    });

    const bladeAllocation = resolved(
      resolveDamage(packet, profile, [
        { parts: [{ amount: 3, partId: "blade" }], sourceId: "armor-reduction" },
      ])
    );
    const flameAllocation = resolved(
      resolveDamage(packet, profile, [
        { parts: [{ amount: 3, partId: "flame" }], sourceId: "armor-reduction" },
      ])
    );
    expect(bladeAllocation.computed.netTotal).toBe(4);
    expect(flameAllocation.computed.netTotal).toBe(6);
  });

  it("distinguishes resistance from resistance followed by vulnerability", () => {
    const attempt = resolveDamage(
      packet,
      {
        damageThreshold: null,
        rules: [
          {
            amount: 1,
            kind: "flat-adjustment",
            selector: all,
            sourceId: "damage-bonus",
          },
          { kind: "resistance", selector: all, sourceId: "all-resistance" },
          {
            kind: "vulnerability",
            selector: { ...all, damageTypes: ["fire"] },
            sourceId: "fire-vulnerability",
          },
        ],
      },
      []
    );
    expect(attempt?.kind).toBe("review-required");
  });

  it("does not ask for allocation when the packet threshold makes it irrelevant", () => {
    const result = resolved(
      resolveDamage(
        packet,
        {
          damageThreshold: 100,
          rules: [
            {
              amount: -3,
              kind: "flat-adjustment",
              selector: all,
              sourceId: "armor-reduction",
            },
            {
              kind: "resistance",
              selector: { ...all, damageTypes: ["fire"] },
              sourceId: "fire-resistance",
            },
          ],
        },
        []
      )
    );
    expect(result.computed.netTotal).toBe(0);
    expect(result.computed.thresholdApplied).toBe(true);
  });

  it("rejects collided, reordered, excessive, or irrelevant allocations", () => {
    expect(
      conformDamageAllocationObservations([
        { parts: [{ amount: 1, partId: "blade" }], sourceId: "rule" },
        { parts: [{ amount: 1, partId: "flame" }], sourceId: "rule" },
      ])
    ).toBeNull();

    const profile = {
      damageThreshold: null,
      rules: [
        {
          amount: -3,
          kind: "flat-adjustment",
          selector: all,
          sourceId: "armor-reduction",
        },
        {
          kind: "resistance",
          selector: { ...all, damageTypes: ["fire"] },
          sourceId: "fire-resistance",
        },
      ],
    } as const;
    expect(
      resolveDamage(packet, profile, [
        {
          parts: [
            { amount: 1, partId: "flame" },
            { amount: 2, partId: "blade" },
          ],
          sourceId: "armor-reduction",
        },
      ])
    ).toBeNull();
    expect(
      resolveDamage(packet, profile, [
        { parts: [{ amount: 4, partId: "blade" }], sourceId: "armor-reduction" },
      ])
    ).toBeNull();
    expect(
      resolveDamage(packet, profile, [
        { parts: [{ amount: 3, partId: "blade" }], sourceId: "unknown" },
      ])
    ).toBeNull();
  });

  it("applies a packet threshold after every per-part defense", () => {
    const below = resolved(resolveDamage(packet, { damageThreshold: 11, rules: [] }, []));
    expect(below.computed).toMatchObject({
      netTotal: 0,
      resolvedTotal: 10,
      thresholdApplied: true,
    });
    expect(below.computed.parts.map((part) => part.netAmount)).toEqual([0, 0]);

    const equal = resolved(resolveDamage(packet, { damageThreshold: 10, rules: [] }, []));
    expect(equal.computed).toMatchObject({
      netTotal: 10,
      thresholdApplied: false,
    });
  });

  it("preserves computed evidence beside a reversible explicit net-total override", () => {
    const base = resolved(resolveDamage(packet, noDefenses, []));
    const observed = withDamageTableOverride(base, {
      amount: 3,
      kind: "net-total",
      reasonId: "table-ruling",
    });
    expect(observed?.computed).toEqual(base.computed);
    expect(observed?.packet).toEqual(base.packet);
    expect(observed?.effective).toEqual({
      amount: 3,
      kind: "net-total",
      reasonId: "table-ruling",
    });
    expect(withDamageTableOverride(observed, null)?.effective).toEqual({
      amount: 10,
      kind: "computed",
    });
    expect(withDamageTableOverride(observed, null)?.packet).toEqual(base.packet);
    expect(
      conformDamageTableOverride({
        amount: 3,
        kind: "net-total",
        reason: "because",
        reasonId: "table-ruling",
      })
    ).toBeNull();
    expect(
      withDamageTableOverride(base, {
        amount: 10,
        kind: "net-total",
        reasonId: "inert-ruling",
      })
    ).toBeNull();
  });

  it("rejects structurally valid but arithmetically forged persisted results", () => {
    const base = resolved(resolveDamage(packet, noDefenses, []));
    const forged = {
      ...base,
      computed: { ...base.computed, netTotal: 999 },
      effective: { amount: 999, kind: "computed" },
    };
    expect(conformDamageComputation(forged.computed)).toBeNull();
    expect(conformDamageResolution(forged)).toBeNull();
    expect(
      withDamageTableOverride(forged, {
        amount: 3,
        kind: "net-total",
        reasonId: "table-ruling",
      })
    ).toBeNull();
  });

  it("rejects any drift between the original packet and computed evidence", () => {
    const base = resolved(resolveDamage(packet, noDefenses, []));
    expect(
      conformDamageResolution({
        ...base,
        packet: { ...base.packet, packetId: "other-packet" },
      })
    ).toBeNull();
    expect(
      conformDamageResolution({
        ...base,
        packet: { ...base.packet, target: { ...target, entityId: "other" } },
      })
    ).toBeNull();
    expect(
      conformDamageResolution({
        ...base,
        packet: {
          ...base.packet,
          parts: [{ ...base.packet.parts[0], amount: 6 }, base.packet.parts[1]],
        },
      })
    ).toBeNull();
    expect(
      conformDamageResolution({
        ...base,
        packet: {
          ...base.packet,
          parts: [{ ...base.packet.parts[0], damageType: "cold" }, base.packet.parts[1]],
        },
      })
    ).toBeNull();
    expect(
      conformDamageResolution({
        ...base,
        packet: { ...base.packet, parts: [base.packet.parts[0]] },
      })
    ).toBeNull();
    expect(
      conformDamageResolution({ computed: base.computed, effective: base.effective })
    ).toBeNull();
  });

  it("is independent of random generation and wall-clock time", () => {
    const random = vi.spyOn(Math, "random");
    const now = vi.spyOn(Date, "now");
    expect(resolveDamage(packet, noDefenses, [])).not.toBeNull();
    expect(random).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    random.mockRestore();
    now.mockRestore();
  });
});

// Blind spot: this unit validates the terminal pure kernel, not the later world-operation
// wiring that applies its effective total to creature vitals.

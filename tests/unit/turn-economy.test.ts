import { describe, expect, it } from "vitest";
import { conformActionFactGuard } from "@/lib/action-journal";
import { canonicalFingerprint } from "@/lib/canonical-fingerprint";
import {
  conformTurnEconomyCommand,
  conformTurnEconomyProjection,
  conformTurnEconomyState,
  createTurnEconomyState,
  deriveTurnEconomyBudget,
  reduceTurnEconomy,
  turnEconomyProjectionFactGuard,
} from "@/lib/turn-economy";
import type { EntityRef } from "@/types/mechanics-reference";
import {
  TURN_ACTION_KINDS,
  type TurnAttackOption,
  type TurnEconomyCommand,
  type TurnEconomyProjection,
  type TurnEconomyResult,
  type TurnEconomyState,
} from "@/types/turn-economy";

const ACTION_SURGE_ACTIONS = TURN_ACTION_KINDS.filter((kind) => kind !== "magic");

const OWNER: EntityRef = {
  entityId: "self",
  material: { characterId: "character.1", kind: "character-play", uid: "user.1" },
};

function weaponAttackOption(
  optionId: string,
  instanceId: string,
  facts: Readonly<{
    classification: "melee" | "ranged";
    light: boolean;
    nickMastery: boolean;
    twoHanded: boolean;
  }>
): Extract<TurnAttackOption, { readonly kind: "weapon-attack" }> {
  return {
    kind: "weapon-attack",
    maximumPerAttackAction: null,
    maximumPerTurn: null,
    optionId,
    weapon: { instanceId, ...facts },
  };
}

function projection(): TurnEconomyProjection {
  return {
    actions: { extraSlots: [], override: null },
    attacks: {
      options: [
        {
          kind: "weapon-attack",
          maximumPerAttackAction: null,
          maximumPerTurn: null,
          optionId: "attack.longsword",
          weapon: {
            classification: "melee",
            instanceId: "item.longsword",
            light: false,
            nickMastery: false,
            twoHanded: false,
          },
        },
      ],
      perAttackAction: { base: 1, override: null },
    },
    bonusActions: {
      dualWielder: false,
      limit: { base: 1, override: null },
      requirements: [],
    },
    freeInteractions: { limit: { base: 1, override: null } },
    incapacitated: false,
    movement: {
      costPerFoot: { base: 1, override: null },
      modes: [{ mode: "walk", speedFt: { base: 30, override: null } }],
      requirements: [],
    },
    reactions: {
      limit: { base: 1, override: null },
      requirements: [],
    },
  };
}

function state(turnId = "turn.1"): Readonly<TurnEconomyState> {
  const result = createTurnEconomyState(turnId);
  if (!result) throw new Error("test state must conform");
  return result;
}

function planned(
  current: Readonly<TurnEconomyState>,
  capabilities: Readonly<TurnEconomyProjection>,
  command: Readonly<TurnEconomyCommand>
): Readonly<TurnEconomyState> {
  const result = reduceTurnEconomy(current, capabilities, command);
  expect(result.status).toBe("planned");
  if (result.status !== "planned") throw new Error(JSON.stringify(result));
  return result.after;
}

function rejection(result: TurnEconomyResult): string {
  expect(result.status).toBe("rejected");
  if (result.status !== "rejected") throw new Error(JSON.stringify(result));
  return result.reason;
}

function claimAction(
  current: Readonly<TurnEconomyState>,
  capabilities: Readonly<TurnEconomyProjection>,
  claimId: string,
  kind: Exclude<(typeof TURN_ACTION_KINDS)[number], "attack" | "ready">
): Readonly<TurnEconomyState> {
  return planned(current, capabilities, {
    action: { kind },
    claimId,
    kind: "claim-action",
  });
}

function claimAttackAction(
  current: Readonly<TurnEconomyState>,
  capabilities: Readonly<TurnEconomyProjection>,
  actionClaimId: string,
  attackClaimId: string,
  optionId = "attack.longsword"
): Readonly<TurnEconomyState> {
  return planned(current, capabilities, {
    action: {
      firstAttack: { claimId: attackClaimId, optionId },
      kind: "attack",
    },
    claimId: actionClaimId,
    kind: "claim-action",
  });
}

describe("turn-economy hostile boundaries", () => {
  it("guards the complete live projection on commit and redo", () => {
    const owner = structuredClone(OWNER);
    const capabilities = projection();
    const guard = turnEconomyProjectionFactGuard(owner, capabilities);

    expect(guard).toEqual({
      address: ["turn-economy-projection"],
      expected: { present: true, value: canonicalFingerprint(capabilities) },
      lifecycle: "commit-redo",
      owner: OWNER,
    });
    expect(conformActionFactGuard(guard)).toEqual(guard);
    expect(guard.owner).not.toBe(owner);
    Reflect.set(owner, "entityId", "changed");
    expect("entityId" in guard.owner && guard.owner.entityId).toBe("self");
    expect(
      turnEconomyProjectionFactGuard(OWNER, {
        ...capabilities,
        incapacitated: true,
      }).expected
    ).not.toEqual(guard.expected);
  });

  it("conforms exact, cloned, frozen projections, states, and commands", () => {
    const source = projection();
    const conformed = conformTurnEconomyProjection(source);
    expect(conformed).toEqual(source);
    expect(conformed).not.toBe(source);
    expect(Object.isFrozen(conformed)).toBe(true);
    expect(Object.isFrozen(conformed?.attacks.options)).toBe(true);

    const initial = state();
    expect(conformTurnEconomyState({ ...initial, unknown: true })).toBeNull();
    expect(
      conformTurnEconomyCommand({
        action: { kind: "dodge" },
        claimId: "action.1",
        distanceFt: 30,
        kind: "claim-action",
      })
    ).toBeNull();
    expect(
      conformTurnEconomyCommand({
        action: { kind: "heroic-inspiration" },
        claimId: "inspiration.1",
        kind: "claim-action",
      })
    ).toBeNull();
  });

  it("rejects duplicate and unsafe capability identities", () => {
    const value = projection();
    expect(
      conformTurnEconomyProjection({
        ...value,
        attacks: {
          ...value.attacks,
          options: [...value.attacks.options, value.attacks.options[0]],
        },
      })
    ).toBeNull();
    expect(
      conformTurnEconomyProjection({
        ...value,
        attacks: {
          ...value.attacks,
          options: [
            ...value.attacks.options,
            weaponAttackOption("attack.same-weapon-conflicting-facts", "item.longsword", {
              classification: "melee",
              light: true,
              nickMastery: false,
              twoHanded: false,
            }),
          ],
        },
      })
    ).toBeNull();
    expect(
      conformTurnEconomyProjection({
        ...value,
        attacks: {
          ...value.attacks,
          options: [
            weaponAttackOption("attack.invalid-nick", "item.invalid-nick", {
              classification: "melee",
              light: false,
              nickMastery: true,
              twoHanded: false,
            }),
          ],
        },
      })
    ).toBeNull();
    expect(
      conformTurnEconomyProjection({
        ...value,
        bonusActions: {
          ...value.bonusActions,
          requirements: [{ actionKind: "attack", requirementId: "invalid.attack" }],
        },
      })
    ).toBeNull();
    expect(createTurnEconomyState("__proto__")).toBeNull();
  });
});

describe("2024 Action economy", () => {
  it("owns exactly one normal Action and all canonical action kinds", () => {
    for (const [index, kind] of TURN_ACTION_KINDS.entries()) {
      const initial = state(`turn.${index}`);
      const after =
        kind === "attack"
          ? claimAttackAction(initial, projection(), "action.1", "attack.1")
          : kind === "ready"
            ? planned(initial, projection(), {
                action: { kind: "ready", preparationId: "preparation.1" },
                claimId: "action.1",
                kind: "claim-action",
              })
            : claimAction(initial, projection(), "action.1", kind);
      expect(after.actions[0]?.kind).toBe(kind);
      expect(
        rejection(
          reduceTurnEconomy(after, projection(), {
            action: { kind: "dodge" },
            claimId: "action.2",
            kind: "claim-action",
          })
        )
      ).toBe("action-unavailable");
    }
  });

  it("assigns Haste and Action Surge slots without claim-order coupling", () => {
    const haste: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [
          {
            allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
            attackLimit: 1,
            slotId: "slot.haste",
            sourceId: "spell.haste",
          },
        ],
        override: null,
      },
    };
    const magicThenDash = claimAction(
      claimAction(state(), haste, "action.magic", "magic"),
      haste,
      "action.dash",
      "dash"
    );
    const dashThenMagic = claimAction(
      claimAction(state(), haste, "action.dash", "dash"),
      haste,
      "action.magic",
      "magic"
    );
    expect(magicThenDash.actions).toHaveLength(2);
    expect(dashThenMagic.actions).toHaveLength(2);
    expect(
      rejection(
        reduceTurnEconomy(claimAction(state(), haste, "action.magic", "magic"), haste, {
          action: { kind: "dodge" },
          claimId: "action.dodge",
          kind: "claim-action",
        })
      )
    ).toBe("action-restricted");

    const surgeAndHaste: TurnEconomyProjection = {
      ...haste,
      actions: {
        ...haste.actions,
        extraSlots: [
          ...haste.actions.extraSlots,
          {
            allowedActions: ACTION_SURGE_ACTIONS,
            attackLimit: null,
            slotId: "slot.action-surge",
            sourceId: "feature.action-surge",
          },
        ],
      },
    };
    const three = claimAction(
      claimAction(
        claimAction(state(), surgeAndHaste, "action.magic.1", "magic"),
        surgeAndHaste,
        "action.dodge",
        "dodge"
      ),
      surgeAndHaste,
      "action.hide",
      "hide"
    );
    expect(three.actions).toHaveLength(3);
    expect(
      rejection(
        reduceTurnEconomy(
          claimAction(state(), surgeAndHaste, "action.magic.1", "magic"),
          surgeAndHaste,
          {
            action: { kind: "magic" },
            claimId: "action.magic.2",
            kind: "claim-action",
          }
        )
      )
    ).toBe("action-restricted");
  });

  it("keeps Extra Attack per Attack action, including Action Surge", () => {
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [
          {
            allowedActions: ACTION_SURGE_ACTIONS,
            attackLimit: null,
            slotId: "slot.action-surge",
            sourceId: "feature.action-surge",
          },
        ],
        override: null,
      },
      attacks: {
        ...projection().attacks,
        perAttackAction: { base: 2, override: null },
      },
    };
    let current = claimAttackAction(state(), capabilities, "attack-action.1", "swing.1");
    current = planned(current, capabilities, {
      attackActionClaimId: "attack-action.1",
      claimId: "swing.2",
      authorization: null,
      kind: "claim-attack",
      optionId: "attack.longsword",
    });
    current = claimAttackAction(current, capabilities, "attack-action.2", "swing.3");
    current = planned(current, capabilities, {
      attackActionClaimId: "attack-action.2",
      claimId: "swing.4",
      authorization: null,
      kind: "claim-attack",
      optionId: "attack.longsword",
    });
    expect(
      current.actions.map((action) =>
        action.kind === "attack" ? action.attacks.length : 0
      )
    ).toEqual([2, 2]);
    expect(
      rejection(
        reduceTurnEconomy(current, capabilities, {
          attackActionClaimId: "attack-action.1",
          claimId: "swing.5",
          authorization: null,
          kind: "claim-attack",
          optionId: "attack.longsword",
        })
      )
    ).toBe("attack-limit");
  });

  it("caps only the Attack action assigned to Haste", () => {
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [
          {
            allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
            attackLimit: 1,
            slotId: "slot.haste",
            sourceId: "spell.haste",
          },
        ],
        override: null,
      },
      attacks: {
        ...projection().attacks,
        perAttackAction: { base: 2, override: null },
      },
    };
    let current = claimAttackAction(
      state(),
      capabilities,
      "attack-action.base",
      "swing.base.1"
    );
    current = planned(current, capabilities, {
      attackActionClaimId: "attack-action.base",
      claimId: "swing.base.2",
      authorization: null,
      kind: "claim-attack",
      optionId: "attack.longsword",
    });
    current = claimAttackAction(
      current,
      capabilities,
      "attack-action.haste",
      "swing.haste.1"
    );
    expect(
      rejection(
        reduceTurnEconomy(current, capabilities, {
          attackActionClaimId: "attack-action.haste",
          claimId: "swing.haste.2",
          authorization: null,
          kind: "claim-attack",
          optionId: "attack.longsword",
        })
      )
    ).toBe("attack-limit");
  });

  it("authorizes attacks and attack-to-feature replacements explicitly", () => {
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      attacks: {
        options: [
          ...projection().attacks.options,
          {
            kind: "feature-replacement",
            maximumPerAttackAction: 1,
            maximumPerTurn: 1,
            optionId: "feature.dragonborn-breath",
          },
        ],
        perAttackAction: { base: 2, override: null },
      },
    };
    let current = claimAttackAction(
      state(),
      capabilities,
      "attack-action.1",
      "replacement.1",
      "feature.dragonborn-breath"
    );
    current = planned(current, capabilities, {
      attackActionClaimId: "attack-action.1",
      claimId: "swing.1",
      authorization: null,
      kind: "claim-attack",
      optionId: "attack.longsword",
    });
    expect(current.actions[0]).toMatchObject({ kind: "attack" });
    expect(
      rejection(
        reduceTurnEconomy(current, capabilities, {
          attackActionClaimId: "attack-action.1",
          claimId: "replacement.2",
          authorization: null,
          kind: "claim-attack",
          optionId: "feature.dragonborn-breath",
        })
      )
    ).toBe("attack-limit");
    expect(
      rejection(
        reduceTurnEconomy(state(), capabilities, {
          action: {
            firstAttack: {
              claimId: "attack.unknown",
              optionId: "attack.not-authorized",
            },
            kind: "attack",
          },
          claimId: "attack-action.unknown",
          kind: "claim-action",
        })
      )
    ).toBe("attack-option-unavailable");
  });
});

describe("extra attacks, Bonus Actions, and Reactions", () => {
  it("authorizes Nick only from a prior Light attack in the same Attack action", () => {
    const shortsword = weaponAttackOption("attack.shortsword", "item.shortsword", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const scimitar = weaponAttackOption("attack.scimitar", "item.scimitar", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      attacks: {
        ...projection().attacks,
        options: [shortsword, scimitar],
      },
    };
    let current = claimAttackAction(
      state(),
      capabilities,
      "attack-action.1",
      "swing.light.1",
      shortsword.optionId
    );
    current = planned(current, capabilities, {
      attackActionClaimId: "attack-action.1",
      authorization: {
        kind: "light-nick",
        qualifyingAttackClaimId: "swing.light.1",
      },
      claimId: "swing.nick.1",
      kind: "claim-attack",
      optionId: scimitar.optionId,
    });
    expect(current.actions[0]).toMatchObject({
      attacks: [
        { authorization: null, claimId: "swing.light.1" },
        {
          authorization: {
            kind: "light-nick",
            qualifyingAttackClaimId: "swing.light.1",
          },
          claimId: "swing.nick.1",
        },
      ],
      kind: "attack",
    });
    const attackAction = current.actions[0];
    if (attackAction?.kind !== "attack") throw new Error("expected Attack action");
    const nickAttack = attackAction.attacks[1];
    if (!nickAttack) throw new Error("expected Nick attack");
    expect(
      conformTurnEconomyState({
        ...current,
        actions: [
          {
            ...attackAction,
            attacks: [
              attackAction.attacks[0],
              {
                ...nickAttack,
                authorization: {
                  kind: "light-nick",
                  qualifyingAttackClaimId: "swing.not-present",
                },
              },
            ],
          },
        ],
      })
    ).toBeNull();
    expect(
      rejection(
        reduceTurnEconomy(current, capabilities, {
          attackActionClaimId: "attack-action.1",
          authorization: {
            kind: "light-nick",
            qualifyingAttackClaimId: "swing.light.1",
          },
          claimId: "swing.nick.2",
          kind: "claim-attack",
          optionId: scimitar.optionId,
        })
      )
    ).toBe("extra-attack-limit");

    const reversedProjection = {
      ...capabilities,
      attacks: { ...capabilities.attacks, options: [scimitar, shortsword] },
    };
    const withReversedOptions = claimAttackAction(
      state("turn.reversed"),
      reversedProjection,
      "attack-action.reversed",
      "swing.reversed.light",
      shortsword.optionId
    );
    expect(
      reduceTurnEconomy(withReversedOptions, reversedProjection, {
        attackActionClaimId: "attack-action.reversed",
        authorization: {
          kind: "light-nick",
          qualifyingAttackClaimId: "swing.reversed.light",
        },
        claimId: "swing.reversed.nick",
        kind: "claim-attack",
        optionId: scimitar.optionId,
      }).status
    ).toBe("planned");

    const nickWeaponFirst = claimAttackAction(
      state("turn.nick-first"),
      capabilities,
      "attack-action.nick-first",
      "swing.nick-weapon",
      scimitar.optionId
    );
    expect(
      reduceTurnEconomy(nickWeaponFirst, capabilities, {
        attackActionClaimId: "attack-action.nick-first",
        authorization: {
          kind: "light-nick",
          qualifyingAttackClaimId: "swing.nick-weapon",
        },
        claimId: "swing.other-light",
        kind: "claim-attack",
        optionId: shortsword.optionId,
      }).status
    ).toBe("planned");
  });

  it("rejects spoofed Nick prerequisites, including another Attack action or weapon option", () => {
    const light = weaponAttackOption("attack.light", "item.light", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const nick = weaponAttackOption("attack.nick", "item.nick", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const sameWeaponNick = weaponAttackOption("attack.light.alternate", "item.light", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const noNick = weaponAttackOption("attack.no-nick", "item.no-nick", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const plainLight = weaponAttackOption("attack.plain-light", "item.plain-light", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [
          {
            allowedActions: [],
            attackLimit: null,
            slotId: "slot.extra-action",
            sourceId: "feature.extra-action",
          },
        ],
        override: null,
      },
      attacks: {
        ...projection().attacks,
        options: [light, nick, sameWeaponNick, noNick, plainLight],
      },
    };
    const firstAction = claimAttackAction(
      state(),
      capabilities,
      "attack-action.1",
      "swing.light",
      light.optionId
    );
    const twoActions = claimAttackAction(
      firstAction,
      capabilities,
      "attack-action.2",
      "swing.second-action",
      light.optionId
    );
    const nickCommand = {
      attackActionClaimId: "attack-action.2",
      authorization: {
        kind: "light-nick",
        qualifyingAttackClaimId: "swing.light",
      },
      claimId: "swing.nick",
      kind: "claim-attack",
      optionId: nick.optionId,
    } as const;
    expect(rejection(reduceTurnEconomy(twoActions, capabilities, nickCommand))).toBe(
      "extra-attack-unavailable"
    );
    expect(
      rejection(
        reduceTurnEconomy(firstAction, capabilities, {
          ...nickCommand,
          attackActionClaimId: "attack-action.1",
          optionId: sameWeaponNick.optionId,
        })
      )
    ).toBe("extra-attack-unavailable");
    const plainAttack = claimAttackAction(
      state("turn.no-nick"),
      capabilities,
      "attack-action.plain",
      "swing.plain-light",
      plainLight.optionId
    );
    expect(
      rejection(
        reduceTurnEconomy(plainAttack, capabilities, {
          ...nickCommand,
          attackActionClaimId: "attack-action.plain",
          authorization: {
            kind: "light-nick",
            qualifyingAttackClaimId: "swing.plain-light",
          },
          optionId: noNick.optionId,
        })
      )
    ).toBe("extra-attack-unavailable");
    expect(
      rejection(
        reduceTurnEconomy(state("turn.before-trigger"), capabilities, {
          ...nickCommand,
          attackActionClaimId: "attack-action.missing",
        })
      )
    ).toBe("attack-action-unavailable");
  });

  it("assigns a Nick Attack action and Haste's one-attack action independently of claim order", () => {
    const longsword = weaponAttackOption("attack.longsword", "item.longsword", {
      classification: "melee",
      light: false,
      nickMastery: false,
      twoHanded: false,
    });
    const shortsword = weaponAttackOption("attack.shortsword", "item.shortsword", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const scimitar = weaponAttackOption("attack.scimitar", "item.scimitar", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [
          {
            allowedActions: ["attack", "dash", "disengage", "hide", "utilize"],
            attackLimit: 1,
            slotId: "slot.haste",
            sourceId: "spell.haste",
          },
        ],
        override: null,
      },
      attacks: {
        ...projection().attacks,
        options: [longsword, shortsword, scimitar],
      },
    };

    const build = (nickFirst: boolean): Readonly<TurnEconomyState> => {
      let current = state(`turn.haste.${String(nickFirst)}`);
      if (!nickFirst) {
        current = claimAttackAction(
          current,
          capabilities,
          "attack-action.haste",
          "swing.haste",
          longsword.optionId
        );
      }
      current = claimAttackAction(
        current,
        capabilities,
        "attack-action.nick",
        "swing.light",
        shortsword.optionId
      );
      current = planned(current, capabilities, {
        attackActionClaimId: "attack-action.nick",
        authorization: {
          kind: "light-nick",
          qualifyingAttackClaimId: "swing.light",
        },
        claimId: "swing.nick",
        kind: "claim-attack",
        optionId: scimitar.optionId,
      });
      return nickFirst
        ? claimAttackAction(
            current,
            capabilities,
            "attack-action.haste",
            "swing.haste",
            longsword.optionId
          )
        : current;
    };

    expect(build(false).actions).toHaveLength(2);
    expect(build(true).actions).toHaveLength(2);
  });

  it("shares the one Light extra attack between its Bonus Action and Nick forms", () => {
    const shortsword = weaponAttackOption("attack.shortsword", "item.shortsword", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const scimitar = weaponAttackOption("attack.scimitar", "item.scimitar", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const sameWeapon = weaponAttackOption("attack.shortsword.thrown", "item.shortsword", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      attacks: {
        ...projection().attacks,
        options: [shortsword, scimitar, sameWeapon],
      },
      bonusActions: {
        ...projection().bonusActions,
        limit: {
          base: 1,
          override: { reasonId: "test.extra-bonus-action", value: 2 },
        },
      },
    };
    const attacked = claimAttackAction(
      state(),
      capabilities,
      "attack-action.1",
      "swing.shortsword",
      shortsword.optionId
    );
    const lightBonusCommand = {
      bonusAction: {
        kind: "light-extra-attack",
        optionId: scimitar.optionId,
        qualifyingAttackClaimId: "swing.shortsword",
      },
      claimId: "bonus.light",
      kind: "claim-bonus-action",
    } as const;
    const afterBonus = planned(attacked, capabilities, lightBonusCommand);
    expect(afterBonus.bonusActions[0]).toMatchObject({
      claimId: "bonus.light",
      kind: "light-extra-attack",
      option: { optionId: scimitar.optionId },
      qualifyingAttackClaimId: "swing.shortsword",
    });
    expect(
      rejection(
        reduceTurnEconomy(afterBonus, capabilities, {
          ...lightBonusCommand,
          claimId: "bonus.light.second",
        })
      )
    ).toBe("bonus-action-requirement-unavailable");
    expect(
      rejection(
        reduceTurnEconomy(afterBonus, capabilities, {
          attackActionClaimId: "attack-action.1",
          authorization: {
            kind: "light-nick",
            qualifyingAttackClaimId: "swing.shortsword",
          },
          claimId: "swing.nick.after-bonus",
          kind: "claim-attack",
          optionId: scimitar.optionId,
        })
      )
    ).toBe("extra-attack-limit");

    const afterNick = planned(attacked, capabilities, {
      attackActionClaimId: "attack-action.1",
      authorization: {
        kind: "light-nick",
        qualifyingAttackClaimId: "swing.shortsword",
      },
      claimId: "swing.nick",
      kind: "claim-attack",
      optionId: scimitar.optionId,
    });
    expect(rejection(reduceTurnEconomy(afterNick, capabilities, lightBonusCommand))).toBe(
      "bonus-action-requirement-unavailable"
    );
    expect(
      rejection(
        reduceTurnEconomy(state("turn.no-trigger"), capabilities, lightBonusCommand)
      )
    ).toBe("bonus-action-requirement-unavailable");
    expect(
      rejection(
        reduceTurnEconomy(attacked, capabilities, {
          bonusAction: {
            ...lightBonusCommand.bonusAction,
            optionId: sameWeapon.optionId,
          },
          claimId: "bonus.same-weapon",
          kind: "claim-bonus-action",
        })
      )
    ).toBe("bonus-action-requirement-unavailable");
  });

  it("derives Dual Wielder targets from the prior Light attack and weapon facts", () => {
    const light = weaponAttackOption("attack.light", "item.light", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const nick = weaponAttackOption("attack.nick", "item.nick", {
      classification: "melee",
      light: true,
      nickMastery: true,
      twoHanded: false,
    });
    const longsword = weaponAttackOption("attack.longsword", "item.longsword", {
      classification: "melee",
      light: false,
      nickMastery: false,
      twoHanded: false,
    });
    const greatsword = weaponAttackOption("attack.greatsword", "item.greatsword", {
      classification: "melee",
      light: false,
      nickMastery: false,
      twoHanded: true,
    });
    const handCrossbow = weaponAttackOption(
      "attack.hand-crossbow",
      "item.hand-crossbow",
      {
        classification: "ranged",
        light: true,
        nickMastery: false,
        twoHanded: false,
      }
    );
    const sameWeapon = weaponAttackOption("attack.light.alt", "item.light", {
      classification: "melee",
      light: true,
      nickMastery: false,
      twoHanded: false,
    });
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      attacks: {
        ...projection().attacks,
        options: [light, nick, longsword, greatsword, handCrossbow, sameWeapon],
      },
      bonusActions: {
        ...projection().bonusActions,
        dualWielder: true,
        limit: {
          base: 1,
          override: { reasonId: "test.extra-bonus-action", value: 2 },
        },
      },
    };
    const attacked = claimAttackAction(
      state(),
      capabilities,
      "attack-action.1",
      "swing.light",
      light.optionId
    );
    const command = {
      bonusAction: {
        kind: "dual-wielder-extra-attack",
        optionId: longsword.optionId,
        qualifyingAttackClaimId: "swing.light",
      },
      claimId: "bonus.dual-wielder",
      kind: "claim-bonus-action",
    } as const;
    const afterDualWielder = planned(attacked, capabilities, command);
    expect(afterDualWielder.bonusActions[0]).toMatchObject({
      kind: "dual-wielder-extra-attack",
      option: { optionId: longsword.optionId },
    });
    expect(
      rejection(
        reduceTurnEconomy(afterDualWielder, capabilities, {
          bonusAction: { ...command.bonusAction, optionId: nick.optionId },
          claimId: "bonus.dual-wielder.second",
          kind: "claim-bonus-action",
        })
      )
    ).toBe("bonus-action-requirement-unavailable");
    expect(
      rejection(
        reduceTurnEconomy(
          attacked,
          {
            ...capabilities,
            bonusActions: { ...capabilities.bonusActions, dualWielder: false },
          },
          command
        )
      )
    ).toBe("bonus-action-requirement-unavailable");
    for (const [index, option] of [greatsword, handCrossbow, sameWeapon].entries()) {
      expect(
        rejection(
          reduceTurnEconomy(attacked, capabilities, {
            bonusAction: { ...command.bonusAction, optionId: option.optionId },
            claimId: `bonus.invalid.${index}`,
            kind: "claim-bonus-action",
          })
        )
      ).toBe("bonus-action-requirement-unavailable");
    }

    const nicked = planned(attacked, capabilities, {
      attackActionClaimId: "attack-action.1",
      authorization: {
        kind: "light-nick",
        qualifyingAttackClaimId: "swing.light",
      },
      claimId: "swing.nick",
      kind: "claim-attack",
      optionId: nick.optionId,
    });
    expect(reduceTurnEconomy(nicked, capabilities, command).status).toBe("planned");
  });

  it("spends an ordinary Bonus Action only through a current requirement", () => {
    const capability: TurnEconomyProjection = {
      ...projection(),
      bonusActions: {
        ...projection().bonusActions,
        requirements: [{ actionKind: null, requirementId: "feature.bonus" }],
      },
    };
    const command = {
      bonusAction: { kind: "action", requirementId: "feature.bonus" },
      claimId: "bonus.feature",
      kind: "claim-bonus-action",
    } as const;
    const after = planned(state(), capability, command);
    expect(after.bonusActions[0]).toEqual({
      actionKind: null,
      claimId: "bonus.feature",
      kind: "action",
      requirementId: "feature.bonus",
    });
    expect(
      rejection(
        reduceTurnEconomy(after, capability, { ...command, claimId: "bonus.second" })
      )
    ).toBe("bonus-action-unavailable");
    expect(rejection(reduceTurnEconomy(state(), projection(), command))).toBe(
      "bonus-action-requirement-unavailable"
    );
  });

  it("lets a required Bonus Action Dash grant movement without creating an Action", () => {
    const cunningAction: TurnEconomyProjection = {
      ...projection(),
      bonusActions: {
        ...projection().bonusActions,
        requirements: [
          { actionKind: "dash", requirementId: "feature.cunning-action.dash" },
        ],
      },
    };
    let current = planned(state(), cunningAction, {
      claimId: "move.before-dash",
      distanceFt: 30,
      kind: "move",
      mode: "walk",
    });
    current = planned(current, cunningAction, {
      bonusAction: {
        kind: "action",
        requirementId: "feature.cunning-action.dash",
      },
      claimId: "bonus.cunning-action",
      kind: "claim-bonus-action",
    });
    current = planned(current, cunningAction, {
      claimId: "move.after-dash",
      distanceFt: 30,
      kind: "move",
      mode: "walk",
    });
    expect(current.actions).toEqual([]);
    expect(current.bonusActions[0]).toMatchObject({
      actionKind: "dash",
      kind: "action",
    });
  });

  it("links a prepared spell transaction from Ready Action through its Reaction", () => {
    const readyCapabilities: TurnEconomyProjection = {
      ...projection(),
      reactions: {
        ...projection().reactions,
        limit: {
          base: 1,
          override: { reasonId: "feature.extra-reaction", value: 2 },
        },
      },
    };
    let current = planned(state(), readyCapabilities, {
      action: {
        kind: "ready",
        preparationId: "program.ready-spell.transaction-1",
      },
      claimId: "action.ready",
      kind: "claim-action",
    });
    current = planned(current, readyCapabilities, { kind: "end-turn" });
    current = planned(current, readyCapabilities, {
      claimId: "reaction.ready",
      kind: "claim-reaction",
      reaction: { kind: "ready", readyActionClaimId: "action.ready" },
    });
    expect(current.phase).toBe("between-turns");
    expect(current.reactions).toEqual([
      {
        claimId: "reaction.ready",
        kind: "ready",
        preparationId: "program.ready-spell.transaction-1",
        readyActionClaimId: "action.ready",
      },
    ]);
    expect(
      conformTurnEconomyState({
        ...current,
        reactions: [
          {
            ...current.reactions[0],
            preparationId: "program.spoofed-transaction",
          },
        ],
      })
    ).toBeNull();
    expect(
      rejection(
        reduceTurnEconomy(current, readyCapabilities, {
          claimId: "reaction.second",
          kind: "claim-reaction",
          reaction: { kind: "ready", readyActionClaimId: "action.ready" },
        })
      )
    ).toBe("ready-action-unavailable");

    const refreshed = planned(current, readyCapabilities, {
      kind: "start-turn",
      turnId: "turn.2",
    });
    expect(refreshed.actions).toEqual([]);
    expect(refreshed.reactions).toEqual([]);
    expect(refreshed.phase).toBe("own-turn");
  });

  it("does not refresh Reaction when the same turn start is replayed", () => {
    const capabilities: TurnEconomyProjection = {
      ...projection(),
      reactions: {
        ...projection().reactions,
        requirements: [{ requirementId: "spell.shield" }],
      },
    };
    const spent = planned(state(), capabilities, {
      claimId: "reaction.shield",
      kind: "claim-reaction",
      reaction: { kind: "program", requirementId: "spell.shield" },
    });
    const replay = reduceTurnEconomy(spent, capabilities, {
      kind: "start-turn",
      turnId: "turn.1",
    });
    expect(replay).toMatchObject({
      reason: "already-started",
      status: "no-change",
    });
    if (replay.status === "no-change") expect(replay.state.reactions).toHaveLength(1);
  });
});

describe("movement, gates, overrides, and manual boundaries", () => {
  it("supports split movement, mode switches, Dash, and current-speed changes", () => {
    const walkingAndFlying: TurnEconomyProjection = {
      ...projection(),
      movement: {
        ...projection().movement,
        modes: [
          { mode: "walk", speedFt: { base: 30, override: null } },
          { mode: "fly", speedFt: { base: 60, override: null } },
        ],
      },
    };
    let current = planned(state(), walkingAndFlying, {
      claimId: "move.1",
      distanceFt: 20,
      kind: "move",
      mode: "walk",
    });
    current = planned(current, walkingAndFlying, {
      claimId: "move.fly.1",
      distanceFt: 40,
      kind: "move",
      mode: "fly",
    });
    const slowed: TurnEconomyProjection = {
      ...walkingAndFlying,
      movement: {
        ...walkingAndFlying.movement,
        modes: [
          { mode: "walk", speedFt: { base: 30, override: null } },
          {
            mode: "fly",
            speedFt: {
              base: 60,
              override: { reasonId: "condition.slowed", value: 50 },
            },
          },
        ],
      },
    };
    expect(
      rejection(
        reduceTurnEconomy(current, slowed, {
          claimId: "move.slowed",
          distanceFt: 1,
          kind: "move",
          mode: "fly",
        })
      )
    ).toBe("movement-unavailable");

    const hastened: TurnEconomyProjection = {
      ...walkingAndFlying,
      movement: {
        ...walkingAndFlying.movement,
        modes: [
          { mode: "walk", speedFt: { base: 30, override: null } },
          {
            mode: "fly",
            speedFt: {
              base: 60,
              override: { reasonId: "effect.fast", value: 70 },
            },
          },
        ],
      },
    };
    current = planned(current, hastened, {
      claimId: "move.2",
      distanceFt: 10,
      kind: "move",
      mode: "fly",
    });
    current = claimAction(current, hastened, "action.dash", "dash");
    current = planned(current, hastened, {
      claimId: "move.dash",
      distanceFt: 70,
      kind: "move",
      mode: "fly",
    });
    expect(current.movement.map(({ distanceFt }) => distanceFt)).toEqual([
      20, 40, 10, 70,
    ]);
  });

  it("charges projected crawl/terrain costs and Prone standing without importing conditions", () => {
    const crawlingInDifficultTerrain: TurnEconomyProjection = {
      ...projection(),
      movement: {
        ...projection().movement,
        costPerFoot: {
          base: 1,
          override: { reasonId: "movement.crawl-and-terrain", value: 3 },
        },
        requirements: [],
      },
    };
    const crawled = planned(state(), crawlingInDifficultTerrain, {
      claimId: "move.crawl",
      distanceFt: 10,
      kind: "move",
      mode: "walk",
    });
    expect(crawled.movement[0]).toEqual({
      claimId: "move.crawl",
      costFt: 30,
      distanceFt: 10,
      mode: "walk",
    });

    const prone: TurnEconomyProjection = {
      ...projection(),
      movement: {
        ...projection().movement,
        requirements: [
          {
            kind: "stand-from-prone",
            mode: "walk",
            requirementId: "condition.prone.instance-1.stand",
          },
        ],
      },
    };
    let standing = planned(state(), prone, {
      claimId: "move.before-standing",
      distanceFt: 15,
      kind: "move",
      mode: "walk",
    });
    standing = planned(standing, prone, {
      claimId: "movement.stand",
      kind: "claim-movement-requirement",
      requirementId: "condition.prone.instance-1.stand",
    });
    expect(standing.movementRequirements).toEqual([
      {
        claimId: "movement.stand",
        costFt: 15,
        requirementId: "condition.prone.instance-1.stand",
      },
    ]);
    expect(
      rejection(
        reduceTurnEconomy(standing, prone, {
          claimId: "movement.stand-again",
          kind: "claim-movement-requirement",
          requirementId: "condition.prone.instance-1.stand",
        })
      )
    ).toBe("movement-requirement-unavailable");

    const speedZero: TurnEconomyProjection = {
      ...prone,
      movement: {
        ...prone.movement,
        modes: [{ mode: "walk", speedFt: { base: 0, override: null } }],
      },
    };
    expect(
      rejection(
        reduceTurnEconomy(state(), speedZero, {
          claimId: "movement.stand",
          kind: "claim-movement-requirement",
          requirementId: "condition.prone.instance-1.stand",
        })
      )
    ).toBe("movement-unavailable");
  });

  it("applies Incapacitated to Actions, Bonus Actions, and Reactions without inventing speed zero", () => {
    const incapacitated: TurnEconomyProjection = {
      ...projection(),
      bonusActions: {
        ...projection().bonusActions,
        requirements: [{ actionKind: null, requirementId: "feature.bonus" }],
      },
      incapacitated: true,
      reactions: {
        ...projection().reactions,
        requirements: [{ requirementId: "spell.shield" }],
      },
    };
    expect(
      rejection(
        reduceTurnEconomy(state(), incapacitated, {
          action: { kind: "dodge" },
          claimId: "action.dodge",
          kind: "claim-action",
        })
      )
    ).toBe("incapacitated");
    expect(
      rejection(
        reduceTurnEconomy(state(), incapacitated, {
          bonusAction: { kind: "action", requirementId: "feature.bonus" },
          claimId: "bonus.feature",
          kind: "claim-bonus-action",
        })
      )
    ).toBe("incapacitated");
    expect(
      rejection(
        reduceTurnEconomy(state(), incapacitated, {
          claimId: "reaction.shield",
          kind: "claim-reaction",
          reaction: { kind: "program", requirementId: "spell.shield" },
        })
      )
    ).toBe("incapacitated");
    expect(
      reduceTurnEconomy(state(), incapacitated, {
        claimId: "move.allowed",
        distanceFt: 5,
        kind: "move",
        mode: "walk",
      }).status
    ).toBe("planned");
  });

  it("derives transparent explicit overrides, including a zero-Action lock", () => {
    const overridden: TurnEconomyProjection = {
      ...projection(),
      actions: {
        extraSlots: [],
        override: { reasonId: "effect.no-actions", slots: [] },
      },
      attacks: {
        ...projection().attacks,
        perAttackAction: {
          base: 1,
          override: { reasonId: "feature.extra-attack", value: 2 },
        },
      },
      bonusActions: {
        ...projection().bonusActions,
        limit: {
          base: 1,
          override: { reasonId: "effect.no-bonus", value: 0 },
        },
      },
    };
    expect(deriveTurnEconomyBudget(overridden)).toMatchObject({
      actionSlots: [],
      actionSlotsOverrideReasonId: "effect.no-actions",
      attacksPerAttackAction: {
        base: 1,
        effective: 2,
        overrideReasonId: "feature.extra-attack",
      },
      bonusActions: {
        base: 1,
        effective: 0,
        overrideReasonId: "effect.no-bonus",
      },
    });
    expect(
      rejection(
        reduceTurnEconomy(state(), overridden, {
          action: { kind: "dodge" },
          claimId: "action.dodge",
          kind: "claim-action",
        })
      )
    ).toBe("action-unavailable");
  });

  it("keeps free interaction and table authority explicit, outside Action kinds", () => {
    let current = planned(state(), projection(), {
      claimId: "interaction.door",
      interactionId: "door.open",
      kind: "claim-free-interaction",
      timingBoundary: {
        authority: "table",
        boundaryId: "timing.during-movement-observed",
      },
    });
    expect(current.freeInteractions[0]).toMatchObject({
      timingBoundary: {
        authority: "table",
        boundaryId: "timing.during-movement-observed",
      },
    });
    expect(
      rejection(
        reduceTurnEconomy(current, projection(), {
          claimId: "interaction.second",
          interactionId: "lever.pull",
          kind: "claim-free-interaction",
          timingBoundary: {
            authority: "table",
            boundaryId: "timing.during-action-observed",
          },
        })
      )
    ).toBe("free-interaction-unavailable");
    current = planned(current, projection(), {
      authority: "table",
      boundaryId: "ruling.trigger-observed",
      claimId: "manual.1",
      kind: "record-manual-boundary",
    });
    expect(current.manualBoundaries).toEqual([
      {
        authority: "table",
        boundaryId: "ruling.trigger-observed",
        claimId: "manual.1",
      },
    ]);
  });

  it("is idempotent for exact claim replay and rejects identity collisions", () => {
    const command = {
      action: { kind: "dodge" },
      claimId: "action.1",
      kind: "claim-action",
    } as const;
    const after = planned(state(), projection(), command);
    expect(reduceTurnEconomy(after, projection(), command)).toMatchObject({
      reason: "already-claimed",
      status: "no-change",
    });
    expect(
      rejection(
        reduceTurnEconomy(after, projection(), {
          action: { kind: "dash" },
          claimId: "action.1",
          kind: "claim-action",
        })
      )
    ).toBe("claim-collision");
  });
});

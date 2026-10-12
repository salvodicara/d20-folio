/**
 * The states a universal combat action puts its user in (SRD 5.2.1 "Dodge
 * [Action]": until the start of your next turn, attack rolls against you have
 * Disadvantage and you make Dexterity saving throws with Advantage). Taking the
 * action lights the state; it ends by itself at the declared turn edge. Like
 * `BASE_ACTIONS`, an engine-authored bilingual table, not catalogue data.
 */
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";

type TurnBoundaryWhileActive = Extract<Grant, { type: "while-active" }> & {
  duration: { kind: "turn-boundary"; phase: "turn-start" | "turn-end"; turns: number };
};

export interface BaseActionState {
  /** The `BASE_ACTIONS` id whose use lights the state. */
  actionId: string;
  grant: TurnBoundaryWhileActive;
}

export const BASE_ACTION_STATES: ReadonlyArray<BaseActionState> = [
  {
    actionId: "base-dodge",
    grant: {
      type: "while-active",
      activeKey: "base-dodge",
      label: { en: "Dodge", it: "Schivata" },
      duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
      grants: [
        {
          type: "incoming-attack-disadvantage",
          description: {
            en: "Attacks against you have Disadvantage (Dodge)",
            it: "Gli attacchi contro di te hanno Svantaggio (Schivata)",
          },
        },
        {
          type: "advantage-on",
          rollType: "save",
          vs: "dex",
          description: {
            en: "Dexterity saving throws (Dodge)",
            it: "Tiri salvezza su Destrezza (Schivata)",
          },
        },
      ],
    },
  },
];

/** The state a base action lights, when it lights one. */
export function baseActionState(actionId: string): BaseActionState | undefined {
  return BASE_ACTION_STATES.find((state) => state.actionId === actionId);
}

/**
 * The lit base-action states as grant sources. A state that is off contributes
 * nothing, so it never shows as a rail toggle the player did not ask for.
 */
export function resolveBaseActionStateSources(
  activeKeys: ReadonlySet<string>
): GrantSource[] {
  return BASE_ACTION_STATES.filter((state) => activeKeys.has(state.grant.activeKey)).map(
    (state) => ({ id: state.actionId, grants: [state.grant] })
  );
}

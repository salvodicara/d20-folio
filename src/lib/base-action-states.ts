/**
 * The states a universal combat action puts its user in (SRD 5.2.1 "Dodge
 * [Action]": until the start of your next turn, attack rolls against you have
 * Disadvantage and you make Dexterity saving throws with Advantage). Taking the
 * action lights the state; it ends by itself at the declared turn edge. Like
 * `BASE_ACTIONS`, its words live in the `rule` catalogue under the action's key:
 * the state is named as the action, and its clauses key under its grants.
 */
import type { GrantSource } from "@/lib/grants";
import type { Grant } from "@/lib/grant-schema";
import { srdText, type LocText } from "@/lib/loc-text";

/** A base action's `rule` catalogue key (`base-dash` → `action.dash`). */
export function baseActionKey(id: string): string {
  return `action.${id.replace(/^base-/, "")}`;
}

/** A base action's catalogue text: its `name`, `effect` or `trigger`. */
export function baseActionText(
  id: string,
  field: "name" | "effect" | "trigger"
): LocText {
  return srdText("rule", baseActionKey(id), field);
}

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
      duration: { kind: "turn-boundary", phase: "turn-start", turns: 1 },
      grants: [
        { type: "incoming-attack-disadvantage" },
        { type: "advantage-on", rollType: "save", vs: "dex" },
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
    (state) => ({
      id: state.actionId,
      ref: { kind: "rule", key: baseActionKey(state.actionId) },
      label: baseActionText(state.actionId, "name"),
      grants: [state.grant],
    })
  );
}

/** The name behind a base-action state key, for log lines and labels. */
export function baseActionStateName(key: string): LocText | undefined {
  const state = BASE_ACTION_STATES.find((s) => s.grant.activeKey === key);
  return state ? baseActionText(state.actionId, "name") : undefined;
}

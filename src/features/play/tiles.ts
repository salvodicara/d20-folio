/**
 * The hotbar's tile model — pure, and derived from the fold alone (UI spec rule 29).
 *
 * A tile is one INVOCABLE program of one mechanic the seated entity carries. Everything the
 * tile shows comes out of the mechanic's own data: the economy sign from the trigger, the level
 * chip from a slot cost, the uses from a resource cost, the glyph from the damage type or the
 * school, and — crucially — whether it can be used RIGHT NOW, which is `planIntent`'s answer
 * and therefore the reducer's own preflight, not a second opinion (rule 29: unusable is 40%
 * with the reason in the tooltip, never hidden).
 *
 * The three groups are the rendition's, split by the red dividers: weapons and common actions ·
 * prepared spells by level · items. There is no "kind" field on a `Mechanic` to read them off,
 * so the classification is stated here once, from the data that does exist:
 *
 *   - a `slot` cost, or an `srd:spell:` label → a spell (its level is the slot's; a cantrip 0);
 *   - an `srd:magic-item:` / `srd:equipment:` label, or a `resource` cost whose id is an item
 *     resource → an item;
 *   - everything else — weapons, class features, the `core:*` set → common.
 *
 * A better rule needs a field on the mechanic; when the authoring format grows one, this
 * function is where it lands.
 */
import { mechanicOf, programOf, type Catalogue } from "@/lib/combat/catalogue";
import { planIntent, type IntentArgs } from "./table/dispatch";
import type { MechanicId } from "@/lib/combat/ids";
import type { Cost, Mechanic, Program, TargetSpec } from "@/lib/combat/mechanic";
import type { DamageType, Entity, FoldedState, Rejection } from "@/lib/combat/types";

export type TileGroup = "common" | "spell" | "item";
export type TileEconomy = "action" | "bonus" | "reaction" | "movement" | "free";

export interface HotbarTile {
  /** Stable within one hotbar: `${mechanic}#${program}`. */
  readonly key: string;
  readonly mechanic: MechanicId;
  readonly program: string;
  /** The mechanic's label id — resolved by the surface, never a display string here. */
  readonly label: string;
  readonly group: TileGroup;
  /** Spell level (0 = cantrip); `null` for anything that spends no slot and is no spell. */
  readonly level: number | null;
  readonly economy: TileEconomy;
  /** A sprite symbol id (`i-…`), chosen from the damage type, the school or the group. */
  readonly icon: string;
  readonly damageType: DamageType | null;
  /** What it needs targeted: a count, an area, or nothing (self). */
  readonly targets: TargetSpec | undefined;
  /** `resources[id]` left, when the program spends one — the tile's bottom-right number. */
  readonly uses: { readonly current: number; readonly max: number } | null;
  /** `true` when the reducer would accept it as it stands. */
  readonly usable: boolean;
  /** Why not, when it would not — the tooltip's sentence (rule 39: the reason in the tooltip). */
  readonly rejection: Rejection | null;
}

const DAMAGE_ICON: Readonly<Record<DamageType, string>> = {
  acid: "i-acid",
  bludgeoning: "i-mace",
  cold: "i-cold",
  fire: "i-fire",
  force: "i-force",
  lightning: "i-lightning",
  necrotic: "i-necrotic",
  piercing: "i-dagger",
  poison: "i-poison",
  psychic: "i-psychic",
  radiant: "i-radiant",
  slashing: "i-broadsword",
  thunder: "i-thunder",
};

/** The `core:*` set is the one place a mechanic id genuinely names its own picture. */
const CORE_ICON: Readonly<Record<string, string>> = {
  "core:move": "i-movement",
  "core:dash": "i-movement",
  "core:dodge": "i-shield",
  "core:disengage": "i-hand",
  "core:help": "i-party",
  "core:hide": "i-eye-off",
};

const GROUP_ICON: Readonly<Record<TileGroup, string>> = {
  common: "i-swords",
  spell: "i-sparkles",
  item: "i-backpack",
};

function slotCost(costs: readonly Cost[] | undefined): number | null {
  const slot = costs?.find((cost) => cost.kind === "slot");
  return slot ? slot.level : null;
}

function resourceCost(costs: readonly Cost[] | undefined): string | null {
  const resource = costs?.find((cost) => cost.kind === "resource");
  return resource ? resource.id : null;
}

function economyOf(program: Program): TileEconomy {
  if (program.trigger.kind === "event") return "reaction";
  const claim = program.cost?.find((cost) => cost.kind === "turn");
  if (claim?.kind === "turn") {
    if (claim.claim === "action" || claim.claim === "attack") return "action";
    if (claim.claim === "bonus") return "bonus";
    if (claim.claim === "reaction") return "reaction";
  }
  if (program.steps.some((step) => step.kind === "move" || step.kind === "dash")) {
    return "movement";
  }
  const { economy } = program.trigger;
  return economy === "action" || economy === "bonus" || economy === "reaction"
    ? economy
    : "free";
}

function damageOf(program: Program): DamageType | null {
  for (const step of program.steps) {
    if (step.kind === "attack") return step.damage[0]?.type ?? null;
    if (step.kind === "damage") return step.parts[0]?.type ?? null;
  }
  return null;
}

function groupOf(mechanic: Mechanic, program: Program): TileGroup {
  const label = mechanic.label ?? "";
  if (slotCost(program.cost) !== null || label.startsWith("srd:spell:")) return "spell";
  if (label.startsWith("srd:magic-item:") || label.startsWith("srd:equipment:")) {
    return "item";
  }
  const resource = resourceCost(program.cost);
  if (resource !== null && resource.startsWith("item:")) return "item";
  return "common";
}

function iconOf(
  mechanic: Mechanic,
  program: Program,
  group: TileGroup,
  damage: DamageType | null
): string {
  const core = CORE_ICON[mechanic.id];
  if (core) return core;
  if (program.steps.some((step) => step.kind === "heal")) return "i-healing";
  if (damage) return DAMAGE_ICON[damage];
  return GROUP_ICON[group];
}

/**
 * Every tile the seated entity can see, in the mechanics' own order, with `usable` decided by
 * the reducer's preflight against the CURRENT state.
 *
 * A program with an `event` trigger and `window: true` is NOT a tile: it is offered by the
 * reaction card when its window opens (`state.windows`), and a tile that could never be tapped
 * would be a lie on the bar.
 */
export function hotbarTiles(
  state: FoldedState,
  catalogue: Catalogue,
  entity: Entity
): HotbarTile[] {
  const tiles: HotbarTile[] = [];
  for (const id of entity.mechanics) {
    const mechanic = mechanicOf(state, catalogue, id);
    if (!mechanic) continue;
    for (const program of mechanic.active ?? []) {
      if (program.trigger.kind === "event" && program.trigger.window) continue;
      // `core:move` is the map's own verb (drag a token), never a tile.
      if (program.steps.some((step) => step.kind === "move")) continue;
      if (programOf(state, catalogue, id, program.id) === null) continue;
      const group = groupOf(mechanic, program);
      const damage = damageOf(program);
      const level = slotCost(program.cost);
      const resource = resourceCost(program.cost);
      const pool = resource === null ? null : entity.resources[resource];
      const args: IntentArgs = {
        entity: entity.id,
        mechanic: id,
        program: program.id,
        // The preflight is asked about the SHAPE of the action — the economy, the cost, whose
        // turn it is — before any target is chosen, so it is probed with none. A target-level
        // rejection (`invalid-target`) belongs to the target step, not to the tile.
        targets: [],
        answersSoFar: {},
        // No `castLevel`: a tile that says nothing means "cast it at its own level", and
        // `paymentOf` derives the pool from the entity's own resources — which is what makes a
        // Warlock's tile castable without the bar knowing about Pact Magic.
      };
      const planned = planIntent(state, catalogue, args);
      const refused = "reason" in planned ? planned : null;
      // Two rejections are not reasons to grey a tile: they are what tapping it is FOR. A
      // missing answer is the roll it has not made, and an illegal target is the target it has
      // not been given — the probe deliberately carries none.
      const rejection =
        refused === null ||
        refused.reason === "missing-answer" ||
        refused.reason === "invalid-target"
          ? null
          : refused;
      tiles.push({
        key: `${id}#${program.id}`,
        mechanic: id,
        program: program.id,
        label: mechanic.label ?? id,
        group,
        level: group === "spell" ? (level ?? 0) : null,
        economy: economyOf(program),
        icon: iconOf(mechanic, program, group, damage),
        damageType: damage,
        targets: program.targets,
        uses: pool ? { current: pool.current, max: pool.max } : null,
        usable: rejection === null,
        rejection,
      });
    }
  }
  return tiles;
}

/** The three groups, in the bar's order, each already sorted the way it is read. */
export function groupTiles(tiles: readonly HotbarTile[]): {
  readonly common: readonly HotbarTile[];
  readonly spells: readonly HotbarTile[];
  readonly items: readonly HotbarTile[];
} {
  return {
    common: tiles.filter((tile) => tile.group === "common"),
    // Spells read by level, cantrips first, and alphabetically inside a level by label id —
    // stable, and the same on every client, which a locale-sorted list would not be.
    spells: tiles
      .filter((tile) => tile.group === "spell")
      .slice()
      .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.label.localeCompare(b.label)),
    items: tiles.filter((tile) => tile.group === "item"),
  };
}

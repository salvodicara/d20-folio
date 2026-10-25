/**
 * Mounted combat (SRD 5.2.1 "Mounted Combat") as pure encounter facts: a willing
 * creature at least one size larger than its rider serves as a mount; mounting or
 * dismounting costs half the rider's Speed; a controlled mount takes the rider's
 * Initiative (it acts right after the rider) with only Dash, Disengage and Dodge; an
 * independent mount keeps its place and acts as it likes; a forced move of the mount,
 * or the rider or mount knocked Prone, asks the rider a DC 10 Dexterity save or it
 * falls off, Prone.
 *
 * The link lives on the encounter (`EncounterState.mounts`), never on a monster, and
 * is always read through {@link mountLinks}, which drops a link to a removed creature
 * or a malformed one (an older client may remove a combatant without knowing it).
 */
import { CREATURE_SIZE_ORDER, type CreatureSize } from "@/data/types";
import type { EncounterState } from "@/types/campaign";

export type MountLink = NonNullable<EncounterState["mounts"]>[number];

/** The only actions a controlled mount has on its turn. */
export const MOUNT_CONTROLLED_ACTIONS = ["dash", "disengage", "dodge"] as const;

/** The Dexterity save a rider makes not to fall off. */
export const FALL_OFF_DC = 10;

type MountState = Pick<EncounterState, "combatants" | "mounts" | "order">;

/** A willing creature of `mount` size can carry a rider of `rider` size. */
export function canServeAsMount(rider: CreatureSize, mount: CreatureSize): boolean {
  return CREATURE_SIZE_ORDER.indexOf(mount) > CREATURE_SIZE_ORDER.indexOf(rider);
}

/** The movement mounting or dismounting costs: half the Speed, rounded down. */
export function mountingCost(speedFt: number): number {
  return Math.floor(Math.max(0, speedFt) / 2);
}

function isLink(value: unknown): value is MountLink {
  if (typeof value !== "object" || value === null) return false;
  const { mountId, riderId, controlled } = value as Record<string, unknown>;
  return (
    typeof mountId === "string" &&
    typeof riderId === "string" &&
    mountId !== riderId &&
    typeof controlled === "boolean"
  );
}

/** Every standing link: both creatures still in the fight, each mount carrying one
 *  rider and each rider on one mount, nobody both. The first of a clash wins. */
export function mountLinks(
  state: Pick<MountState, "combatants" | "mounts">
): MountLink[] {
  const raw: unknown = state.mounts;
  if (!Array.isArray(raw)) return [];
  const ids = new Set(state.combatants.map((c) => c.id));
  const used = new Set<string>();
  const out: MountLink[] = [];
  for (const link of raw) {
    if (!isLink(link) || !ids.has(link.mountId) || !ids.has(link.riderId)) continue;
    if (used.has(link.mountId) || used.has(link.riderId)) continue;
    used.add(link.mountId);
    used.add(link.riderId);
    out.push({
      mountId: link.mountId,
      riderId: link.riderId,
      controlled: link.controlled,
    });
  }
  return out;
}

/** The mount `riderId` rides, if any. */
export function mountOf(state: MountState, riderId: string): MountLink | undefined {
  return mountLinks(state).find((link) => link.riderId === riderId);
}

/** The link of whoever rides `mountId`, if any. */
export function riderOf(state: MountState, mountId: string): MountLink | undefined {
  return mountLinks(state).find((link) => link.mountId === mountId);
}

/** The turn order with each controlled mount moved to act right after its rider. */
export function mountedTurnOrder(
  order: ReadonlyArray<string>,
  links: ReadonlyArray<MountLink>
): string[] {
  let out = [...order];
  for (const { mountId, riderId, controlled } of links) {
    if (!controlled || !out.includes(mountId) || !out.includes(riderId)) continue;
    out = out.filter((id) => id !== mountId);
    out.splice(out.indexOf(riderId) + 1, 0, mountId);
  }
  return out;
}

function withLinks<T extends MountState>(state: T, links: MountLink[]): T {
  const next = { ...state };
  if (links.length > 0) next.mounts = links;
  else delete next.mounts;
  return next;
}

/** The rider mounts: the link is stored and, once turns run, a controlled mount's slot
 *  moves right after its rider. Null when either creature is missing, the same one,
 *  or already riding or carrying. */
export function mountCreature<T extends MountState>(state: T, link: MountLink): T | null {
  if (!isLink(link)) return null;
  const ids = new Set(state.combatants.map((c) => c.id));
  if (!ids.has(link.mountId) || !ids.has(link.riderId)) return null;
  const links = mountLinks(state);
  const busy = new Set(links.flatMap((l) => [l.mountId, l.riderId]));
  if (busy.has(link.mountId) || busy.has(link.riderId)) return null;
  const next = withLinks(state, [...links, { ...link }]);
  if (next.order && next.order.length > 0)
    next.order = mountedTurnOrder(next.order, [link]);
  return next;
}

/** The rider dismounts (or falls off): its link goes. Null when it rides nothing. */
export function dismount<T extends MountState>(state: T, riderId: string): T | null {
  const links = mountLinks(state);
  if (!links.some((link) => link.riderId === riderId)) return null;
  return withLinks(
    state,
    links.filter((link) => link.riderId !== riderId)
  );
}

/** The actions this creature may take on its turn: a controlled mount's three, or
 *  null when nothing limits them. */
export function mountActionOptions(
  state: MountState,
  id: string
): typeof MOUNT_CONTROLLED_ACTIONS | null {
  return riderOf(state, id)?.controlled ? MOUNT_CONTROLLED_ACTIONS : null;
}

/** What may unseat a rider: its mount moved against its will, or the rider or the
 *  mount knocked Prone. */
export type FallOffCause =
  | { kind: "moved-against-will"; id: string }
  | { kind: "knocked-prone"; id: string };

/** The save the rider makes not to fall off, or null when the event unseats nobody. */
export function fallOffSave(
  state: MountState,
  cause: FallOffCause
): { riderId: string; ability: "DEX"; dc: number } | null {
  const asMount = riderOf(state, cause.id);
  const asRider = cause.kind === "knocked-prone" ? mountOf(state, cause.id) : undefined;
  const link = asMount ?? asRider;
  return link ? { riderId: link.riderId, ability: "DEX", dc: FALL_OFF_DC } : null;
}

/** The rider's save result: a failure dismounts it, landing Prone within 5 feet of the
 *  mount (the caller applies Prone to the rider). Null on a success. */
export function fallOff<T extends MountState>(
  state: T,
  riderId: string,
  saved: boolean
): { state: T; prone: true } | null {
  if (saved) return null;
  const off = dismount(state, riderId);
  return off ? { state: off, prone: true } : null;
}

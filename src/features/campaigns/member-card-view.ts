/**
 * The campaign Gruppo card's view model: each member's name, portrait, species,
 * classes and level, role, HP, AC and passives.
 *
 * Identity, AC, max HP and passives come from the party card a member's own app keeps
 * in the campaign (`memberDetails[uid].character`, readable by the whole table). The
 * current and temporary HP come from the live play state when the caller has it (an
 * attached member's `combat/state`, the same `PcLive` the encounter reads); without it
 * HP is null, never guessed. A member with no character shows their account name and
 * photo.
 */
import type { RaceId } from "@/types/ids";
import type { CampaignDoc, MemberCharacterSnapshot } from "@/types/campaign";
import type { ClassEntry, PortraitCrop } from "@/types/character";
import { snapshotClasses } from "./member-snapshot";

type Member = CampaignDoc["memberDetails"][string];

export interface MemberCard {
  name: string;
  portraitUrl: string | null;
  portraitCrop: PortraitCrop | null;
  race: RaceId | null;
  classes: ClassEntry[];
  /** Total character level; null without a character. */
  level: number | null;
  role: "dm" | "player";
  hp: { current: number; max: number; temp: number } | null;
  ac: number | null;
  passives: NonNullable<MemberCharacterSnapshot["passives"]> | null;
}

export function memberCardView(
  member: Member,
  live?: { currentHp: number; tempHp: number }
): MemberCard {
  const card = member.character ?? null;
  if (!card) {
    return {
      name: member.displayName,
      portraitUrl: member.photoURL ?? null,
      portraitCrop: null,
      race: null,
      classes: [],
      level: null,
      role: member.role,
      hp: null,
      ac: null,
      passives: null,
    };
  }
  const classes = snapshotClasses(card);
  return {
    name: card.name,
    portraitUrl: card.portraitUrl ?? null,
    portraitCrop: card.portraitCrop ?? null,
    race: card.race ?? null,
    classes,
    level: classes.reduce((sum, entry) => sum + entry.level, 0),
    role: member.role,
    hp:
      live && card.hpMax !== undefined
        ? { current: live.currentHp, max: card.hpMax, temp: live.tempHp }
        : null,
    ac: card.ac ?? null,
    passives: card.passives ?? null,
  };
}

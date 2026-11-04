/**
 * The character list on the new screen (approved prototype chars): each card's name,
 * class line (class and level, its subclass), species, Hit Points, AC, speed in the
 * reader's units, the campaign it plays in and when it was last touched. The active
 * come first (most recently touched first), then the fallen, then the retired.
 */
import { primaryClassId, totalLevel } from "@/lib/classes";
import { isCharacterDead } from "@/lib/character-status";
import type { RosterCharacterDoc } from "@/lib/character-cache";
import type { Locale } from "@/lib/locale";
import { formatSpeed } from "@/lib/utils";
import {
  localizeClassName,
  localizeRaceName,
  localizeSubclassName,
} from "@/lib/views/srd-i18n";
import { formatRelativeTime } from "@/features/roster/relative-time";

export interface RosterCard {
  id: string;
  name: string;
  classLine: string;
  species: string;
  hp: { current: number; max: number };
  ac: number;
  speed: string;
  campaign: string | null;
  updated: string | null;
  portrait: string | null;
  state: "active" | "fallen" | "retired";
}

const ORDER = { active: 0, fallen: 1, retired: 2 } as const;

export function rosterCards(
  docs: ReadonlyArray<RosterCharacterDoc>,
  campaignOf: Readonly<Record<string, string>>,
  locale: Locale,
  now: number
): RosterCard[] {
  return docs
    .map((doc) => {
      const data = doc.character;
      const primary = data.classes.find((c) => c.classId === primaryClassId(data));
      const classLine = [
        primary
          ? `${localizeClassName(primary.classId, locale)} ${String(totalLevel(data))}`
          : null,
        primary?.subclassId ? localizeSubclassName(primary.subclassId, locale) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const updated =
        doc.updatedAt instanceof Date && !Number.isNaN(doc.updatedAt.getTime())
          ? formatRelativeTime(doc.updatedAt, locale, now)
          : null;
      const state: RosterCard["state"] =
        doc.status === "retired"
          ? "retired"
          : isCharacterDead(doc.status, doc.session)
            ? "fallen"
            : "active";
      return {
        id: doc.id,
        name: data.name,
        classLine,
        species: data.race ? localizeRaceName(data.race, locale) : "",
        hp: { current: doc.session.hp.current, max: data.hp.max },
        ac: data.ac,
        speed: formatSpeed(data.speed, locale),
        campaign: campaignOf[doc.id] ?? null,
        updated,
        portrait: doc.portraitUrl ?? null,
        state,
        touched: doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : 0,
      };
    })
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.touched - a.touched)
    .map(({ touched, ...card }) => {
      void touched;
      return card;
    });
}

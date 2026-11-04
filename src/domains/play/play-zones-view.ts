/**
 * The zones on the field, for Play's Iniziativa panel (M9): each area's spell, who
 * cast it, the moments it bites (`zone.triggers`) and whom it spares, named for the
 * table; and the light where they overlap (`zoneLight`). Read from the encounter's
 * live effects (`activeZones`).
 */
import { localizeSrd } from "@/i18n/resolver";
import type { SpellZone } from "@/data/types";
import type { Locale } from "@/lib/locale";
import { activeZones, zoneLight } from "@/lib/zones";
import type { ActiveCombatEffect } from "@/types/combat-effect";

export interface PlayZone {
  id: string;
  name: string;
  /** The caster's name; empty when the roster no longer shows them. */
  caster: string;
  triggers: ReadonlyArray<SpellZone["triggers"][number]>;
  spared: string[];
}

export interface PlayZonesView {
  zones: PlayZone[];
  light: SpellZone["light"] | null;
}

export function playZonesView(
  effects: ReadonlyArray<ActiveCombatEffect>,
  rows: ReadonlyArray<{ id: string; name: string }>,
  locale: Locale
): PlayZonesView {
  const zones = activeZones(effects);
  const nameOf = (id: string) => rows.find((row) => row.id === id)?.name ?? "";
  return {
    zones: zones.map((zone) => ({
      id: zone.id,
      name: localizeSrd("spell", zone.spellId, "name", locale),
      caster: nameOf(zone.casterId),
      triggers: zone.zone.triggers,
      spared: zone.spared.map(nameOf).filter(Boolean),
    })),
    light: zoneLight(zones),
  };
}
